// Copyright (c) 2020-2026 Shelly Group SE.
// Authored by Stoyan Ivanov <stoyan.ivanov@shelly.com>.
//
// This library is free software: you can redistribute it and/or modify it
// under the terms of the GNU Lesser General Public License version 3 as
// published by the Free Software Foundation.
//
// This library is distributed in the hope that it will be useful, but
// WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
// or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Lesser General Public
// License for more details.
//
// A copy of the GNU Lesser General Public License can be found in the LICENSE
// file distributed with this library, or at https://www.gnu.org/licenses/

import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'http';
import {compose,log_all,log_none,codes,http_action_gone} from '../index';
import type {logger_t} from '../index';
import {start,stop} from './_server';

const test_port=Math.floor(41000+999*Math.random());
const test_fetch_prefix="http://127.0.0.1:"+test_port+'/';

//const log=log_all();
const log=log_none();

const server= new http.Server ();

compose(
	server,[
		{prefix:"/hello?", do: (req,resp)=>{
			let who=req.full_url.searchParams.get('who')??"<who param not found in searchParams>";
			resp.simple_response(codes.OK,'Hello '+who+'! method: '+req.method);
		}},
		{prefix:"/hello_json?", m:["GET"], do: (req,resp)=>{
			let who=req.full_url.searchParams.get('who')??"<who param not found in searchParams>";
			log.mark("Hello "+who+" of JSON!");
			resp.json_response(codes.OK,{say:'Hello '+who+' of JSON',method:req.method});
		}},
		{prefix:"/rejected", do: http_action_gone, exact_match:true}
	],{log, auto_handle_OPTIONS:true}
);

before(()=>start(server,test_port));
after(()=>stop(server));

test('helper API checks', ()=>{
	assert.doesNotThrow(()=>{
		let log1:logger_t=log_all();
		log1.debug('testing log_all debug %s','output');
		log1.info('testing log_all info %s','output');
		log1.warn('testing log_all warn %s','output');
		log1.error('testing log_all error %s','output');
		log1.mark('testing log_all mark %s','output');
		let log2:logger_t=log_none();
		log2.debug('testing log_none debug %s','output');
		log2.info('testing log_none info %s','output');
		log2.warn('testing log_none warn %s','output');
		log2.error('testing log_none error %s','output');
		log2.mark('testing log_none mark %s','output');
	});
});

test('hello world via GET', async () => {
	let res=await fetch(test_fetch_prefix+'hello?who=world');
	assert.equal(res.status,200);
	assert.equal(await res.text(),'Hello world! method: GET');
});

test('unknown via GET', async () => {
	let res=await fetch(test_fetch_prefix+'unknown');
	assert.equal(res.status,404);
	await res.text();
});

test('rejected via GET', async () => {
	let res=await fetch(test_fetch_prefix+'rejected');
	assert.equal(res.status,codes.GONE);
	await res.text();
});

test('hello JSON world via GET', async () => {
	let res=await fetch(test_fetch_prefix+'hello_json?who=ease');
	assert.equal(res.status,200);
	assert.equal(res.headers.get("Content-Type"),"application/json; charset=UTF-8");
	assert.equal(await res.text(),'{"say":"Hello ease of JSON","method":"GET"}');
});

test('hello JSON world via POST', async () => {
	let res=await fetch(test_fetch_prefix+'hello_json?who=ease',{method:"POST"});
	assert.equal(res.status,404);
	await res.text();
});

test('hello world via OPTIONS', async () => {
	let res=await fetch(test_fetch_prefix+'hello?who=world',{method:"OPTIONS"});
	assert.equal(res.status,200);
	assert.equal(await res.text(),'');
});

test('hello world via POST', async () => {
	let res=await fetch(test_fetch_prefix+'hello?who=world',{method:"POST"});
	assert.equal(res.status,200);
	assert.equal(await res.text(),'Hello world! method: POST');
});
