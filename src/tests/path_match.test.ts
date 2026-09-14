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

const test_port=Math.floor(44000+999*Math.random());
const test_fetch_prefix="http://127.0.0.1:"+test_port;

//const log=log_all();
const log=log_none();

const server= new http.Server ();

compose(
	server,[
		{prefix:"/api", path_match:true, do: (req,resp)=>{
			const who=req.full_url.searchParams.get('who')??'<none>';
			resp.simple_response(codes.OK,'api url:'+req.url+' who:'+who+' method:'+req.method);
		}},
		{prefix:"/postonly", path_match:true, m:["POST"], do: (req,resp)=>{
			resp.simple_response(codes.OK,'postonly url:'+req.url);
		}},
		//prefix carrying its own trailing slash must behave the same way
		{prefix:"/dir/", path_match:true, do: (req,resp)=>{
			resp.simple_response(codes.OK,'dir url:'+req.url);
		}},
		//exact_match must keep its old raw-url semantics
		{prefix:"/exact", exact_match:true, do: (req,resp)=>{
			resp.simple_response(codes.OK,'exact url:'+req.url);
		}},
		//plain prefix matching must keep swallowing anything below it
		{prefix:"/pre", do: (req,resp)=>{
			resp.simple_response(codes.OK,'pre url:'+req.url);
		}},
	],{log}
);

before(()=>start(server,test_port));
after(()=>stop(server));

async function get(path:string):Promise<{status:number,text:string}>{
	const res=await fetch(test_fetch_prefix+path);
	return {status:res.status,text:await res.text()};
}

test('path_match: bare path matches', async () => {
	const r=await get('/api');
	assert.equal(r.status,200);
	assert.equal(r.text,'api url:/api who:<none> method:GET');
});

test('path_match: trailing slash matches', async () => {
	const r=await get('/api/');
	assert.equal(r.status,200);
	assert.equal(r.text,'api url:/api/ who:<none> method:GET');
});

test('path_match: query string matches and stays parseable', async () => {
	const r=await get('/api?who=world');
	assert.equal(r.status,200);
	assert.equal(r.text,'api url:/api?who=world who:world method:GET');
});

test('path_match: trailing slash plus query string matches', async () => {
	const r=await get('/api/?who=both');
	assert.equal(r.status,200);
	assert.equal(r.text,'api url:/api/?who=both who:both method:GET');
});

test('path_match: empty query string matches', async () => {
	const r=await get('/api?');
	assert.equal(r.status,200);
	assert.equal(r.text,'api url:/api? who:<none> method:GET');
});

test('path_match: a longer path does NOT match', async () => {
	const r=await get('/api_other');
	assert.equal(r.status,404);
});

test('path_match: a sub path does NOT match', async () => {
	const r=await get('/api/sub');
	assert.equal(r.status,404);
});

test('path_match: honours the method filter', async () => {
	const r=await get('/postonly');
	assert.equal(r.status,404);

	const res=await fetch(test_fetch_prefix+'/postonly/?x=1',{method:"POST"});
	assert.equal(res.status,200);
	assert.equal(await res.text(),'postonly url:/postonly/?x=1');
});

test('path_match: prefix with its own trailing slash matches both forms', async () => {
	const withslash=await get('/dir/');
	assert.equal(withslash.status,200);
	assert.equal(withslash.text,'dir url:/dir/');

	const without=await get('/dir');
	assert.equal(without.status,200);
	assert.equal(without.text,'dir url:/dir');

	const query=await get('/dir?x=1');
	assert.equal(query.status,200);

	const sub=await get('/dir/sub');
	assert.equal(sub.status,404);
});

test('exact_match keeps its raw-url semantics', async () => {
	const bare=await get('/exact');
	assert.equal(bare.status,200);
	assert.equal(bare.text,'exact url:/exact');

	//the very thing path_match exists to fix: exact_match still rejects these
	assert.equal((await get('/exact/')).status,404);
	assert.equal((await get('/exact?x=1')).status,404);
});

test('plain prefix matching is unchanged', async () => {
	const sub=await get('/pre/anything/below');
	assert.equal(sub.status,200);
	assert.equal(sub.text,'pre url:/pre/anything/below');

	const glued=await get('/present');
	assert.equal(glued.status,200);
	assert.equal(glued.text,'pre url:/present');
});
