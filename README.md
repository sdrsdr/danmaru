# danmaru
No dependency, convenience  HTTTP/HTTPS server wrapper in TypeScript. For complete TypeScript code see https://github.com/sdrsdr/danmaru 

## How to use


```typescript 

import * as http  from 'http';
import {compose,log_all,codes} from 'danmaru';
const log=log_all();

const server= new http.Server();

compose(
	server,[
		{prefix:"/hello_json?", do: (req,resp)=>{
			let who=req.full_url.searchParams.get('who')??"<who param not found in searchParams>";
			log.mark("Hello "+who+" of JSON!");
			resp.json_response(codes.OK,{say:'Hello '+who+' of JSON',method:req.method});
		}}
	],{log}
);

server.listen(1234,()=>{
    log.mark("danmaru HTTP server started at port 1234");
});

```

## compose

```typescript
function compose(
	server:http_Server|https_Server, 
	http_actions:http_action_t[], 
	options?:options_t
):boolean ;
```

Hookup `server` to handle requests via `http_actions` various options like log functions, global maximal body size and global method filters goes in `options`

## http_action_t

```typescript
interface http_action_t {
	prefix:string;
	do:http_action_cb;
	m?:string[]; //allowed methods
	max_body_size?:number; //if not set max_body_size from options or MAX_BODY_SIZE will be enforced
	exact_match?:boolean; //default false; if true prefix must exact-match
}
```

Array of this interface goes in `compose` to describe the urls handled by the server.

* `prefix` is the start of the url to match. You can have same `prefix` in the `compose`  array multiple time with different allowed methods and different `do`. The match lookup folows array order of `compose` `http_actions` param. First match handles the request completely.
* `do` is the callback that will genrate the responce
* `m` Is optional string array that explicityl allows only mentioned HTTP methods. If this is not set the method filter from `compose`'s `optins` kick in. It is possible to have multiple `http_action` with same `prefix` but different `m` filters and different do
* `max_body_size` is optional limiter for http resuest body size once the request matches. You can set global limit in `compose`'s `options`. There is some hard coded limit if none is set explicityl.
* `exact_match` is assumed false if missing. This changes how the incoming request url is matched against `http_action`. It is possible to have multiple `http_action` with same `prefix` but different `exact_match` and different do

## options_t

```typescript
interface options_t {
	log?:logger_t; 
	indexer?:http_action_cb; //default handler; if not set a 404 is send back
	auto_headers?:OutgoingHttpHeaders; //this headers are preset for sending for each response 
	auto_handle_OPTIONS?:boolean; //default is false. Just do resp.simple_response(200) and return for all non 404 urls and OPTIONS method (passing the content of auto_headers to the browser)
	max_body_size?:number; //in characters if not set MAX_BODY_SIZE will be enforced
	allowed_methods?:string[]; // default is no-filtering;
}
```

options for `compose`:

* `log` [log4js](https://www.npmjs.com/package/log4js) inspired interface to logging facility to be used in the server. Some helper functions are provided: `function log_all():logger_t` and  `function log_none():logger_t` to help with faster setup.
* `indexer` is a url handler for unmatched requests. It can do custom 404 pages or index direcotories somehow. It's all up to you. The helper function `http_action_gone` is provided that just returns cacheable `410 GONE` responses.
* `auto_headers` headers specified here will be automatically send with every response. Primary target is `...auto_headers:{"Access-Control-Allow-Origin":"*"}, ...`
* `auto_handle_OPTIONS` is of by default. If set to `true` it allows for unmatched requests with `OPTIONS` method to be automatically replied with `200 OK` plus the `auto_headers` to allow some browsers to check for [CORS](https://en.wikipedia.org/wiki/Cross-origin_resource_sharing) headers.
* `max_body_size` global request body size limiter.  if not set MAX_BODY_SIZE will be enforced.
* `allowed_methods` states what HTTP methods your server will handle. If you want to handle only `GET` and/or `POST` request you can state so here and keep `http_action` param of `compose` cleaner or you can intermix all HTTP method filtering to you like


## http_action_cb
```typescript
interface http_action_cb {
	(req:CompleteIncomingMessage, resp:SimpleServerResponse) :void;
}
```

The http request handling callback in form 

```typescript
function handle_a_request(req:CompleteIncomingMessage, resp:SimpleServerResponse) {
	...
}
```

this is the `do` in `http_action_t`  and `indexer` in `options_t` 

as usual us the information in `req` to craft a `resp`

## CompleteIncomingMessage

The danmaru request object extending from NodeJS [IncomingMessage](https://nodejs.org/api/http.html#http_class_http_incomingmessage)

```typescript
interface CompleteIncomingMessage extends IncomingMessage {
	//assert this from parent
	url:string;
	method:string;

	//expand a bit 
	action:http_action_t;
	full_url:URL;
	body_string:string;
	is_damaged:boolean;
}
```

* `url`, `method` these are optional in original `IncomingMessage` but as we're working with HTTP/HTTPS servers we can assert them in danmaru
* `action` this is the `http_action_t` that is assigned to handle the request. This might come handy in some `layered` design
* `full_url` as the original `IncomingMessage` have `url` that is just a string danmaru creates a full_url object from [URL](https://nodejs.org/api/url.html) class factoring in `Host` header and allowing for easy search params (GET params) access wia `req.full_url.searchParams.get('paramname')`
* `body_string` in case of request with a body the text is collected here fully before the call to `http_action_cb` is done. If the body goes above limiting `max_body_size` of `http_action_t` or `options_t` danmaru will return `400 BAD REQUEST` and `http_action_cb` will NOT be called
* `is_damaged` is flag set and used internally by danmaru to mark a `IncomingMessage` as damaged by error, cancellation or `max_body_size` violation such request should not reach `http_action_cb`


## SimpleServerResponse

The danmaru request object extending from NodeJS [ServerResponse](https://nodejs.org/api/http.html#http_class_http_serverresponse)

```typescript
export interface SimpleServerResponse extends ServerResponse {
	action:http_action_t;
	req_url:string;
	logger:logger_t;
	auto_headers:OutgoingHttpHeaders;
	simple_response:(code:number,data?:any, headers?:OutgoingHttpHeaders, reason?:string)=>boolean;
	json_response:(code:number,data:string|object, headers?:OutgoingHttpHeaders, reason?:string)=>boolean;
}
```

* `action` this is the `http_action_t` that is assigned to handle the request. This might come handy in some `layered` design
* `req_url` a copy of the associated `IncomingMessage` `.url` kept for easy logging.
* `logger` the logger from associated `compose`
* `auto_headers` from the `compose` `options`
* `simple_response` method for "one line response": `resp.simple_response(200)` is all it take to "confirm" a `http_action_cb` you can specify the response body data in `data`, set additional headers in `headers` or customise the response text via `reason` if you like.
* `json_response`  method for "one line JSON response": `resp.simple_response(200,{ok:true})` is all it take to create return some JSON to the requester. It resolves to `simple_response` with proper stringification, if needed, plus a `Content-Type: application/json; charset=UTF-8` header to make the standard committee happy.


#logger_t

the [log4js](https://www.npmjs.com/package/log4js) inspired logging facility


```typescript 
interface logger_t {
	debug:logfunction_t;
	info:logfunction_t;
	warn:logfunction_t;
	error:logfunction_t;
	mark:logfunction_t;
}
```

this provided utility function explains it all:

```typescript
function log_all():logger_t {
	return {
		debug:console.log,
		info:console.log,
		warn:console.log,
		error:console.log,
		mark:console.log,
	}
}
```
