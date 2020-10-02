
import * as http  from 'http';
import {compose,log_all,log_none,sane_options_GET_API,codes} from '../index';
import fetch from 'node-fetch';

const test_port=Math.floor(40000+20000*Math.random());
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
		}}
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
