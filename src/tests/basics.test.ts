
import * as http  from 'http';
import {compose,log_all,log_none,sane_options_GET_API,codes, logger_t, http_action_gone} from '../index';
import fetch from 'node-fetch';

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

test('helper API checks', (done)=>{
	try {
		expect(()=>{
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
		}).not.toThrow();
		done();
	} catch (err) {
		done (err);
	}
});

test('hello world via GET', async (done) => {
	try {
		let res=await fetch(test_fetch_prefix+'hello?who=world');
		expect(res.status).toBe(200);
		const text=await res.text();
		expect(text).toBe('Hello world! method: GET');
		done();
	} catch (err) {
		done (err);
	}
});

test('unknown via GET', async (done) => {
	try {
		let res=await fetch(test_fetch_prefix+'unknown');
		expect(res.status).toBe(404);
		done();
	} catch (err) {
		done (err);
	}
});

test('rejected via GET', async (done) => {
	try {
		let res=await fetch(test_fetch_prefix+'rejected');
		expect(res.status).toBe(codes.GONE);
		done();
	} catch (err) {
		done (err);
	}
});


test('hello JSON world via GET', async (done) => {
	try {
		let res=await fetch(test_fetch_prefix+'hello_json?who=ease');
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("application/json; charset=UTF-8");
		const text=await res.text();
		expect(text).toBe('{"say":"Hello ease of JSON","method":"GET"}');

		done();
	} catch (err) {
		done (err);
	}
});

test('hello JSON world via POST', async (done) => {
	try {
		let res=await fetch(test_fetch_prefix+'hello_json?who=ease',{method:"POST"});
		expect(res.status).toBe(404);
		done();
	} catch (err) {
		done (err);
	}
});

test('hello world via OPTIONS', async (done) => {
	try {

		let res=await fetch(test_fetch_prefix+'hello?who=world',{method:"OPTIONS"});
		expect(res.status).toBe(200);
		const text=await res.text();
		expect(text).toBe('');
		done();
	} catch (err) {
		done (err);
	}
});

test('hello world via POST', async (done) => {
	try {

		let res=await fetch(test_fetch_prefix+'hello?who=world',{method:"POST"});
		expect(res.status).toBe(200);
		const text=await res.text();
		expect(text).toBe('Hello world! method: POST');
		done();
	} catch (err) {
		done (err);
	}
});
