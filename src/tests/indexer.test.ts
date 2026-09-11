import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'http';
import {compose,log_none,codes} from '../index';
import {start,stop} from './_server';

const test_port=Math.floor(42000+999*Math.random());
const test_fetch_prefix="http://127.0.0.1:"+test_port+'/';

//const log=log_all();
const log=log_none();

const server= new http.Server ();

compose(
	server,[
		{prefix:"/exact", exact_match:true, do: (req,resp)=>{
			resp.simple_response(codes.OK,'exact match at '+req.url+' method: '+req.method);
		}},
		{prefix:"/exactget", exact_match:true, m:["GET"], do: (req,resp)=>{
			resp.simple_response(codes.OK,'exact match at '+req.url+' method: '+req.method);
		}},
	],{log, allowed_methods:["GET","POST"], indexer:(req,resp)=>{
		resp.simple_response(codes.OK,'url:'+req.url+' idexed! method: '+req.method);
	}}
);

before(()=>start(server,test_port));
after(()=>stop(server));

test('exact via GET', async () => {
	let res=await fetch(test_fetch_prefix+'exact');
	assert.equal(res.status,200);
	assert.equal(await res.text(),'exact match at /exact method: GET');
});

test('exact via POST', async () => {
	let res=await fetch(test_fetch_prefix+'exact',{method:"POST"});
	assert.equal(res.status,200);
	assert.equal(await res.text(),'exact match at /exact method: POST');
});

test('exact via OPTIONS', async () => {
	let res=await fetch(test_fetch_prefix+'exact',{method:"OPTIONS"});
	assert.equal(res.status,codes.METHOD_NOT_ALLOWED);
	await res.text();
});

test('exactget via GET', async () => {
	let res=await fetch(test_fetch_prefix+'exactget');
	assert.equal(res.status,200);
	assert.equal(await res.text(),'exact match at /exactget method: GET');
});

test('exactget via POST', async () => {
	let res=await fetch(test_fetch_prefix+'exactget',{method:"POST"});
	assert.equal(res.status,200);
	assert.equal(await res.text(),'url:/exactget idexed! method: POST');
});

test('exactget via OPTIONS', async () => {
	let res=await fetch(test_fetch_prefix+'exactget',{method:"OPTIONS"});
	assert.equal(res.status,codes.METHOD_NOT_ALLOWED);
	await res.text();
});

test('unknown via GET', async () => {
	let res=await fetch(test_fetch_prefix+'unknown');
	assert.equal(res.status,200);
	assert.equal(await res.text(),'url:/unknown idexed! method: GET');
});

test('unknown via OPTIONS', async () => {
	let res=await fetch(test_fetch_prefix+'unknown',{method:"OPTIONS"});
	assert.equal(res.status,codes.METHOD_NOT_ALLOWED);
	await res.text();
});
