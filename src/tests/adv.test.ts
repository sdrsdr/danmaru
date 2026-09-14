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
import {compose,log_none,codes} from '../index';
import {start,stop} from './_server';

const test_port=Math.floor(43000+999*Math.random());
const test_fetch_prefix="http://127.0.0.1:"+test_port+'/';

//const log=log_all();
const log=log_none();

const server= new http.Server ();

compose(
	server,[
		{prefix:"/do?", m:["GET","POST"], do: (req,resp)=>{
			let a=req.full_url.searchParams.get('a');
			if (a==undefined) {
				resp.simple_response(codes.BAD_REQ,"no a= in url",undefined,"MISSING PARAM");
				return;
			}
			if (a=='addhj') {
				resp.json_response(codes.OK,{say:'do: a='+a,method:req.method},{'X-AddH':"json",'Content-Type': 'application/json; charset=UTF-8; custom=data'});
				return;
			}
			if (a=='addhs') {
				resp.simple_response(codes.OK,'do: a='+a+' method='+req.method,{'X-AddH':"simple"});
				return;
			}
			if (req.method=='POST') {
				resp.json_response(codes.OK,{say:'do: a='+a,method:req.method,postbody:req.body_string});
			} else {
				resp.json_response(codes.OK,{say:'do: a='+a,method:req.method});
			}
		}},
		{prefix:"/limpost", m:["POST"], max_body_size:9, do: (req,resp)=>{
		}}
		],{log, auto_handle_OPTIONS:true, auto_headers:{"Access-Control-Allow-Origin":"*"}, max_body_size:10}
);

before(()=>start(server,test_port));
after(()=>stop(server));

test('do?a=nothing via GET', async () => {
	let res=await fetch(test_fetch_prefix+'do?a=nothing');
	assert.equal(res.status,200);
	assert.equal(res.headers.get('Access-Control-Allow-Origin'),"*");
	assert.equal(await res.text(),'{"say":"do: a=nothing","method":"GET"}');
});

test('do?a=nothing via POST+LARGE DATA', async () => {
	let res=await fetch(test_fetch_prefix+'do?a=nothing',{method:"POST",body:"1234567890A"});
	assert.equal(res.status,400);
	await res.text();
});

test('do?a=nothing via POST+SMALL DATA', async () => {
	let res=await fetch(test_fetch_prefix+'do?a=nothing',{method:"POST",body:"123456789"});
	assert.equal(res.status,200);
	assert.equal(res.headers.get('Access-Control-Allow-Origin'),"*");
	assert.equal(await res.text(),'{"say":"do: a=nothing","method":"POST","postbody":"123456789"}');
});

test('do?a=nothing via POST+EDGEDATA', async () => {
	let res=await fetch(test_fetch_prefix+'do?a=nothing',{method:"POST",body:"1234567890"});
	assert.equal(res.status,200);
	assert.equal(res.headers.get('Access-Control-Allow-Origin'),"*");
	assert.equal(await res.text(),'{"say":"do: a=nothing","method":"POST","postbody":"1234567890"}');
});

test('do via GET', async () => {
	let res=await fetch(test_fetch_prefix+'do?garbage');
	assert.equal(res.status,codes.BAD_REQ);
	assert.equal(res.headers.get('Access-Control-Allow-Origin'),"*");
	assert.equal(res.statusText,'MISSING PARAM');
	await res.text();
});

test('do?a=addhs via GET', async () => {
	let res=await fetch(test_fetch_prefix+'do?a=addhs');
	assert.equal(res.status,200);
	assert.equal(res.headers.get('Access-Control-Allow-Origin'),"*");
	assert.equal(res.headers.get('X-AddH'),'simple');
	assert.equal(await res.text(),'do: a=addhs method=GET');
});

test('do?a=addhj via GET', async () => {
	let res=await fetch(test_fetch_prefix+'do?a=addhj');
	assert.equal(res.status,200);
	assert.equal(res.headers.get('Access-Control-Allow-Origin'),"*");
	assert.equal(res.headers.get('X-AddH'),'json');
	assert.equal(res.headers.get('Content-Type'),'application/json; charset=UTF-8; custom=data');
	assert.equal(await res.text(),'{"say":"do: a=addhj","method":"GET"}');
});
