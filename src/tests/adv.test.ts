
import * as http  from 'http';
import {compose,log_all,log_none,sane_options_GET_API,codes} from '../index';
import fetch from 'node-fetch';

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
			}
			resp.json_response(codes.OK,{say:'do: a='+a,method:req.method});
		}}
	],{log, auto_handle_OPTIONS:true, auto_headers:{"Access-Control-Allow-Origin":"*"}}
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
	
test('do?a=nothing via GET', async (done) => {
	try {
		let res=await fetch(test_fetch_prefix+'do?a=nothing');
		expect(res.status).toBe(200);
		expect(res.headers.get('Access-Control-Allow-Origin')).toBe("*");
		const text=await res.text();
		expect(text).toBe('{"say":"do: a=nothing","method":"GET"}');
		done();
	} catch (err) {
		done (err);
	}
});

test('do via GET', async (done) => {
	try {
		let res=await fetch(test_fetch_prefix+'do?');
		expect(res.status).toBe(codes.BAD_REQ);
		expect(res.headers.get('Access-Control-Allow-Origin')).toBe("*");
		expect(res.statusText).toBe('MISSING PARAM');
		done();
	} catch (err) {
		done (err);
	}
});

/*
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
*/
