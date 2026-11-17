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

import test, {before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'http';
import * as path from 'path';
import {spawn} from 'child_process';
import {compose,log_none,codes,ERR_REASON,ERR_REASON_DOUBLE_SEND} from '../index';
import {start,stop} from './_server';

const test_port=Math.floor(44000+999*Math.random());
const safe_fetch_prefix="http://127.0.0.1:"+test_port+'/';

const log=log_none();

let errors:ERR_REASON[]=[];
beforeEach(()=>{errors=[];});

const tick=(ms:number)=>new Promise<void>((r)=>setTimeout(r,ms));

const safe_server= new http.Server ();
compose(
	safe_server,[
		{prefix:"/twice", do: (req,resp)=>{
			resp.simple_response(codes.NOT_FOUND,'first');
			resp.simple_response(codes.GONE,'second');
		}},
		{prefix:"/json_then_simple", do: (req,resp)=>{
			resp.json_response(codes.OK,{which:'first'});
			resp.simple_response(codes.GONE,'second');
		}},
		{prefix:"/simple_then_json", do: (req,resp)=>{
			resp.simple_response(codes.OK,'first');
			resp.json_response(codes.GONE,{which:'second'});
		}},
		{prefix:"/thrice", do: (req,resp)=>{
			resp.simple_response(codes.OK,'first');
			resp.simple_response(codes.GONE,'second');
			resp.simple_response(codes.GONE,'third');
		}},
		{prefix:"/once", do: (req,resp)=>{
			resp.simple_response(codes.OK,'only');
		}},
	],{
		log,
		safe_send:true,
		error_catcher:(reason)=>{errors.push(reason);},
		//the shape of the real incident: a branch that answers and forgets to return
		indexer:(req,resp)=>{
			if (req.url.startsWith('/api/')){
				resp.simple_response(codes.NOT_FOUND,'api');
			}
			resp.simple_response(codes.NOT_FOUND,'fallthrough');
		}
	}
);

before(()=>start(safe_server,test_port));
after(()=>stop(safe_server));

test('safe_send: the client gets the first code and nothing throws', async () => {
	let res=await fetch(safe_fetch_prefix+'twice');
	assert.equal(res.status,codes.NOT_FOUND);
	assert.equal(await res.text(),'first');
	await tick(20);
	assert.deepEqual(errors,[ERR_REASON_DOUBLE_SEND]);
});

test('safe_send: json first, simple second', async () => {
	let res=await fetch(safe_fetch_prefix+'json_then_simple');
	assert.equal(res.status,codes.OK);
	assert.equal(res.headers.get('Content-Type'),'application/json; charset=UTF-8');
	assert.equal(await res.text(),'{"which":"first"}');
	await tick(20);
	assert.deepEqual(errors,[ERR_REASON_DOUBLE_SEND]);
});

test('safe_send: simple first, json second', async () => {
	let res=await fetch(safe_fetch_prefix+'simple_then_json');
	assert.equal(res.status,codes.OK);
	assert.equal(await res.text(),'first');
	await tick(20);
	assert.deepEqual(errors,[ERR_REASON_DOUBLE_SEND]);
});

test('safe_send: every extra send is reported, not just the first', async () => {
	let res=await fetch(safe_fetch_prefix+'thrice');
	assert.equal(res.status,codes.OK);
	assert.equal(await res.text(),'first');
	await tick(20);
	assert.deepEqual(errors,[ERR_REASON_DOUBLE_SEND,ERR_REASON_DOUBLE_SEND]);
});

test('safe_send: a well behaved single send reports nothing', async () => {
	let res=await fetch(safe_fetch_prefix+'once');
	assert.equal(res.status,codes.OK);
	assert.equal(await res.text(),'only');
	await tick(20);
	assert.deepEqual(errors,[]);
});

test('safe_send: the indexer double send, which is where the real incident lived', async () => {
	let res=await fetch(safe_fetch_prefix+'api/mcp');
	assert.equal(res.status,codes.NOT_FOUND);
	assert.equal(await res.text(),'api');
	await tick(20);
	assert.deepEqual(errors,[ERR_REASON_DOUBLE_SEND]);
});

test('safe_send: a non /api/ indexer url answers once and reports nothing', async () => {
	let res=await fetch(safe_fetch_prefix+'something');
	assert.equal(res.status,codes.NOT_FOUND);
	assert.equal(await res.text(),'fallthrough');
	await tick(20);
	assert.deepEqual(errors,[]);
});

// Pins that safe_send is additive: without it the second send still throws
// ERR_HTTP_HEADERS_SENT straight out of the handler and kills the process, exactly
// as it always has. That cannot be observed from inside the test runner -- node:test
// attributes the uncaughtException to whichever hook started the server and fails the
// file even when the throw is caught -- so the doomed server runs as a child process
// and we watch it die. This is also the honest shape of the claim: the failure mode
// being fixed is process death, not a catchable error.
test('default (no safe_send): a double send still kills the process', async () => {
	const victim=path.join(__dirname,'_double_send_victim.js');
	const child=spawn(process.execPath,[victim],{stdio:['ignore','pipe','pipe']});

	let stdout='';
	let stderr='';
	child.stdout.on('data',(c)=>{stdout+=String(c);});
	child.stderr.on('data',(c)=>{stderr+=String(c);});

	const exited=new Promise<number|null>((resolve)=>{child.on('exit',(code)=>resolve(code));});

	try {
		//wait for the child to report its port
		let port=0;
		for (let i=0;i<200 && port==0;i++) {
			const m=stdout.match(/PORT:(\d+)/);
			if (m!=null) port=Number(m[1]);
			else await tick(25);
		}
		assert.notEqual(port,0,'child server never reported a port');

		//the client gets a perfectly good 404 -- the first send succeeds, only the second throws.
		//that is exactly why this bug stayed invisible for nine months
		let res=await fetch('http://127.0.0.1:'+port+'/twice');
		assert.equal(res.status,codes.NOT_FOUND);
		assert.equal(await res.text(),'first');

		const code=await exited;
		assert.notEqual(code,0,'the double send must still take the process down');
		assert.match(stderr,/ERR_HTTP_HEADERS_SENT/);
	} finally {
		if (child.exitCode==null) child.kill();
	}
});
