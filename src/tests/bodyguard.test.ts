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
import {compose,log_none,codes,ERR_REASON,ERR_REASON_BODYGUARD_REJECT,ERR_REASON_HANDLING_ERR,ERR_REASON_OVERSIZED,CompleteIncomingMessage,SimpleServerResponse} from '../index';
import {start,stop} from './_server';

const test_port=Math.floor(41000+999*Math.random());
const test_fetch_prefix="http://127.0.0.1:"+test_port+'/';

const log=log_none();

//what the server saw, drained by each test
let errors:ERR_REASON[]=[];
let order:string[]=[];
let did_run:string[]=[];
let seen_body='';
let seen_full_url='';

beforeEach(()=>{
	errors=[];
	order=[];
	did_run=[];
	seen_body='';
	seen_full_url='';
});

const tick=(ms:number)=>new Promise<void>((r)=>setTimeout(r,ms));

const handled=(name:string)=>(req:CompleteIncomingMessage,resp:SimpleServerResponse)=>{
	did_run.push(name);
	seen_body=req.body_string;
	resp.simple_response(codes.OK,'handled '+name);
};

const server= new http.Server ();

compose(
	server,[
		//global guard only
		{prefix:"/open", do: handled('open')},
		{prefix:"/guarded", do: handled('guarded')},
		{prefix:"/guarded_small", max_body_size:16, do: handled('guarded_small')},
		{prefix:"/slow", do: handled('slow')},
		{prefix:"/slowdeny", do: handled('slowdeny')},
		{prefix:"/selfanswer", do: handled('selfanswer')},
		{prefix:"/boom", do: handled('boom')},
		{prefix:"/boomasync", do: handled('boomasync')},
		{prefix:"/noreturn", do: handled('noreturn')},
		{prefix:"/url", do: handled('url')},
		//global guard passes, then the action guard gets a say
		{prefix:"/both_ok", do: handled('both_ok'), bodyguard:(req,resp)=>{
			order.push('action');
			return true;
		}},
		{prefix:"/both_actiondeny", do: handled('both_actiondeny'), bodyguard:(req,resp)=>{
			order.push('action');
			return false;
		}},
		//global guard rejects before this one is ever reached
		{prefix:"/guarded_action", do: handled('guarded_action'), bodyguard:(req,resp)=>{
			order.push('action');
			return true;
		}},
	],{
		log,
		auto_handle_OPTIONS:true,
		auto_headers:{"Access-Control-Allow-Origin":"*"},
		catch_to_500:false,
		indexer:handled('indexer'),
		error_catcher:(reason)=>{errors.push(reason);},
		bodyguard:(req,resp)=>{
			order.push('global');
			const u=req.url;
			if (u.startsWith('/open')) return true;
			if (u.startsWith('/url')) {
				seen_full_url=req.full_url.searchParams.get('tok')??'<none>';
				return true;
			}
			if (u.startsWith('/slowdeny')) return tick(10).then(()=>false);
			if (u.startsWith('/slow')) return tick(10).then(()=>true);
			if (u.startsWith('/selfanswer')) {
				resp.simple_response(codes.FORBIDDEN,'guard says no');
				return false;
			}
			if (u.startsWith('/boomasync')) return tick(5).then(()=>{throw new Error('async guard blew up');});
			if (u.startsWith('/boom')) throw new Error('guard blew up');
			if (u.startsWith('/noreturn')) return <any>undefined; //consumer forgot to return
			if (u.startsWith('/both')) return true;
			if (u.startsWith('/guarded_small')) return false;
			if (u.startsWith('/guarded')) return false;
			return false; //everything else, indexer included, is denied
		}
	}
);

//a second server, deliberately with NO global bodyguard, so the action-guard-only
//branch is exercised rather than always riding behind a global verdict
const solo_port=test_port+1;
const solo_fetch_prefix="http://127.0.0.1:"+solo_port+'/';
const solo_server= new http.Server ();

compose(
	solo_server,[
		{prefix:"/yes", do: handled('solo_yes'), bodyguard:(req,resp)=>{
			order.push('action');
			return true;
		}},
		{prefix:"/no", do: handled('solo_no'), bodyguard:(req,resp)=>{
			order.push('action');
			return false;
		}},
		{prefix:"/unguarded", do: handled('solo_unguarded')},
	],{log, error_catcher:(reason)=>{errors.push(reason);}}
);

before(()=>Promise.all([start(server,test_port),start(solo_server,solo_port)]).then(()=>{}));
after(()=>Promise.all([stop(server),stop(solo_server)]).then(()=>{}));

test('guard returning true lets the body through complete', async () => {
	let res=await fetch(test_fetch_prefix+'open',{method:"POST",body:"hello body"});
	assert.equal(res.status,200);
	assert.equal(await res.text(),'handled open');
	assert.deepEqual(did_run,['open']);
	assert.equal(seen_body,'hello body');
});

test('guard returning false answers 401 and do() never runs', async () => {
	let res=await fetch(test_fetch_prefix+'guarded',{method:"POST",body:"hello body"});
	assert.equal(res.status,codes.UNAUTHORIZED);
	await res.text();
	assert.deepEqual(did_run,[]);
	assert.deepEqual(errors,[ERR_REASON_BODYGUARD_REJECT]);
});

test('async guard resolving true still collects the whole body', async () => {
	const big='x'.repeat(30000);
	let res=await fetch(test_fetch_prefix+'slow',{method:"POST",body:big});
	assert.equal(res.status,200);
	await res.text();
	assert.deepEqual(did_run,['slow']);
	assert.equal(seen_body.length,30000,'body must survive the deferred data listener');
	assert.equal(seen_body,big);
});

test('async guard resolving false answers 401', async () => {
	let res=await fetch(test_fetch_prefix+'slowdeny',{method:"POST",body:"nope"});
	assert.equal(res.status,codes.UNAUTHORIZED);
	await res.text();
	assert.deepEqual(did_run,[]);
	assert.deepEqual(errors,[ERR_REASON_BODYGUARD_REJECT]);
});

test('a guard that answers for itself keeps its own code', async () => {
	let res=await fetch(test_fetch_prefix+'selfanswer');
	assert.equal(res.status,codes.FORBIDDEN);
	assert.equal(await res.text(),'guard says no');
	assert.deepEqual(did_run,[]);
});

test('global runs before action, both must pass', async () => {
	let res=await fetch(test_fetch_prefix+'both_ok');
	assert.equal(res.status,200);
	await res.text();
	assert.deepEqual(order,['global','action']);
	assert.deepEqual(did_run,['both_ok']);
});

test('action guard can reject what the global one allowed', async () => {
	let res=await fetch(test_fetch_prefix+'both_actiondeny');
	assert.equal(res.status,codes.UNAUTHORIZED);
	await res.text();
	assert.deepEqual(order,['global','action']);
	assert.deepEqual(did_run,[]);
});

test('a global rejection never reaches the action guard', async () => {
	let res=await fetch(test_fetch_prefix+'guarded_action');
	assert.equal(res.status,codes.UNAUTHORIZED);
	await res.text();
	assert.deepEqual(order,['global'],'action guard must not run');
	assert.deepEqual(did_run,[]);
});

test('an action guard works with no global bodyguard configured', async () => {
	let res=await fetch(solo_fetch_prefix+'yes',{method:"POST",body:"solo body"});
	assert.equal(res.status,200);
	await res.text();
	assert.deepEqual(order,['action'],'no global guard to run');
	assert.deepEqual(did_run,['solo_yes']);
	assert.equal(seen_body,'solo body');
});

test('an action guard rejects with no global bodyguard configured', async () => {
	let res=await fetch(solo_fetch_prefix+'no',{method:"POST",body:"solo body"});
	assert.equal(res.status,codes.UNAUTHORIZED);
	await res.text();
	assert.deepEqual(order,['action']);
	assert.deepEqual(did_run,[]);
	assert.deepEqual(errors,[ERR_REASON_BODYGUARD_REJECT]);
});

test('a route with no guard at all is untouched', async () => {
	let res=await fetch(solo_fetch_prefix+'unguarded',{method:"POST",body:"solo body"});
	assert.equal(res.status,200);
	await res.text();
	assert.deepEqual(order,[]);
	assert.deepEqual(did_run,['solo_unguarded']);
	assert.equal(seen_body,'solo body');
});

test('the guard also covers the indexer path', async () => {
	let res=await fetch(test_fetch_prefix+'nothing/here');
	assert.equal(res.status,codes.UNAUTHORIZED);
	await res.text();
	assert.deepEqual(order,['global']);
	assert.deepEqual(did_run,[],'indexer must not run');
	assert.deepEqual(errors,[ERR_REASON_BODYGUARD_REJECT]);
});

test('full_url is already built inside the guard', async () => {
	let res=await fetch(test_fetch_prefix+'url?tok=sekrit');
	assert.equal(res.status,200);
	await res.text();
	assert.equal(seen_full_url,'sekrit');
});

test('a throwing guard is a 500, not a dead process', async () => {
	let res=await fetch(test_fetch_prefix+'boom');
	assert.equal(res.status,codes.INTERNAL_ERR);
	await res.text();
	assert.deepEqual(did_run,[]);
	assert.deepEqual(errors,[ERR_REASON_HANDLING_ERR]);
});

test('a rejecting guard promise is a 500 too', async () => {
	let res=await fetch(test_fetch_prefix+'boomasync');
	assert.equal(res.status,codes.INTERNAL_ERR);
	await res.text();
	assert.deepEqual(did_run,[]);
	assert.deepEqual(errors,[ERR_REASON_HANDLING_ERR]);
});

test('a guard that forgets to return blocks rather than lets through', async () => {
	let res=await fetch(test_fetch_prefix+'noreturn');
	assert.equal(res.status,codes.UNAUTHORIZED);
	await res.text();
	assert.deepEqual(did_run,[]);
});

test('auto handled OPTIONS skips the guard so CORS preflight survives', async () => {
	let res=await fetch(test_fetch_prefix+'guarded',{method:"OPTIONS"});
	assert.equal(res.status,200);
	assert.equal(res.headers.get('Access-Control-Allow-Origin'),"*");
	await res.text();
	assert.deepEqual(order,[],'guard must not see a preflight');
	assert.deepEqual(did_run,[]);
});

test('a rejected oversized body is never read', async () => {
	//16 byte limit on this route, 50k of body: without the bodyguard this is ERR_REASON_OVERSIZED
	let res=await fetch(test_fetch_prefix+'guarded_small',{method:"POST",body:'y'.repeat(50000)});
	assert.equal(res.status,codes.UNAUTHORIZED);
	await res.text();
	assert.deepEqual(did_run,[]);
	assert.deepEqual(errors,[ERR_REASON_BODYGUARD_REJECT],'no OVERSIZED: the body was never collected');
	assert.equal(errors.indexOf(ERR_REASON_OVERSIZED),-1);
});
