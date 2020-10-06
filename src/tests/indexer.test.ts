
import * as http  from 'http';
import {compose,log_all,log_none,sane_options_GET_API,codes} from '../index';
import fetch from 'node-fetch';

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

beforeAll((done)=>{
	try {
		server.listen(test_port,()=>{
			log.mark("test server started at port %d",test_port);
			done();
		});
	} catch (err){
		done(err);
	}
});

afterAll((done)=>{
	log.mark("test server ends");
	server.close((err)=>{
		done(err);
	});
})
	
test('exact via GET', async (done) => {
	try {
		let res=await fetch(test_fetch_prefix+'exact');
		expect(res.status).toBe(200);
		const text=await res.text();
		expect(text).toBe('exact match at /exact method: GET');
		done();
	} catch (err) {
		done (err);
	}
});

test('exact via POST', async (done) => {
	try {
		let res=await fetch(test_fetch_prefix+'exact',{method:"POST"});
		expect(res.status).toBe(200);
		const text=await res.text();
		expect(text).toBe('exact match at /exact method: POST');
		done();
	} catch (err) {
		done (err);
	}
});

test('exact via OPTIONS', async (done) => {
	try {
		let res=await fetch(test_fetch_prefix+'exact',{method:"OPTIONS"});
		expect(res.status).toBe(codes.METHOD_NOT_ALLOWED);
		done();
	} catch (err) {
		done (err);
	}
});



test('exactget via GET', async (done) => {
	try {
		let res=await fetch(test_fetch_prefix+'exactget');
		expect(res.status).toBe(200);
		const text=await res.text();
		expect(text).toBe('exact match at /exactget method: GET');
		done();
	} catch (err) {
		done (err);
	}
});

test('exactget via POST', async (done) => {
	try {
		let res=await fetch(test_fetch_prefix+'exactget',{method:"POST"});
		expect(res.status).toBe(200);
		const text=await res.text();
		expect(text).toBe('url:/exactget idexed! method: POST');
		done();
	} catch (err) {
		done (err);
	}
});



test('exactget via OPTIONS', async (done) => {
	try {
		let res=await fetch(test_fetch_prefix+'exactget',{method:"OPTIONS"});
		expect(res.status).toBe(codes.METHOD_NOT_ALLOWED);
		done();
	} catch (err) {
		done (err);
	}
});

test('unknown via GET', async (done) => {
	try {
		let res=await fetch(test_fetch_prefix+'unknown');
		expect(res.status).toBe(200);
		const text=await res.text();
		expect(text).toBe('url:/unknown idexed! method: GET');
		done();
	} catch (err) {
		done (err);
	}
});

test('unknown via OPTIONS', async (done) => {
	try {
		let res=await fetch(test_fetch_prefix+'unknown',{method:"OPTIONS"});
		expect(res.status).toBe(codes.METHOD_NOT_ALLOWED);
		done();
	} catch (err) {
		done (err);
	}
});
