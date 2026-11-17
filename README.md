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
	exact_match?:boolean; //default false; if true prefix must exact-match,
	path_match?:boolean; //default false; if true prefix must match the url path: query string ignored, one trailing slash optional. Ignored when exact_match is true
	error_catcher?:error_catcher_cb;
	bodyguard?:bodyguard_cb; //runs after options_t.bodyguard, before any body is read. Must return true to let the request through
}
```

Array of this interface goes in `compose` to describe the urls handled by the server.

* `prefix` is the start of the url to match. You can have same `prefix` in the `compose`  array multiple time with different allowed methods and different `do`. The match lookup folows array order of `compose` `http_actions` param. First match handles the request completely.
* `do` is the callback that will genrate the responce
* `m` Is optional string array that explicityl allows only mentioned HTTP methods. If this is not set the method filter from `compose`'s `optins` kick in. It is possible to have multiple `http_action` with same `prefix` but different `m` filters and different do
* `max_body_size` is optional limiter for http resuest body size once the request matches. You can set global limit in `compose`'s `options`. There is some hard coded limit if none is set explicityl.
* `exact_match` is assumed false if missing. This changes how the incoming request url is matched against `http_action`. It is possible to have multiple `http_action` with same `prefix` but different `exact_match` and different do. Note that it compares the **whole raw url**, so an `exact_match` of `/api` does not match `/api/` or `/api?x=1` -- use `path_match` if you want those.
* `path_match` is assumed false if missing, and is ignored when `exact_match` is true. It matches `prefix` against the url **path**: the query string is ignored and a single trailing slash is optional on either side. So a `prefix` of `/api` matches `/api`, `/api/`, `/api?x=1` and `/api/?x=1`, but not `/api_other` or `/api/sub`. This is the match most REST-ish endpoints want: pinned to one path, but tolerant of the trailing slash and query string a client may add.
* `error_catcher` a callback that will receive all request about to be rejected by the library.
* `bodyguard` a callback that gets to approve the request before its body is read. Runs after the `options_t` `bodyguard`, and only if that one approved. See `bodyguard_cb` below.

## options_t

```typescript
interface options_t {
	log?:logger_t; 
	indexer?:http_action_cb; //default handler; if not set a 404 is send back
	auto_headers?:OutgoingHttpHeaders; //this headers are preset for sending for each response 
	auto_handle_OPTIONS?:boolean; //default is false. Just do resp.simple_response(200) and return for all non 404 urls and OPTIONS method (passing the content of auto_headers to the browser)
	max_body_size?:number; //in characters if not set MAX_BODY_SIZE will be enforced
	allowed_methods?:string[]; // default is no-filtering;
	catch_to_500?:boolean; //catch exceptions in http_action_t.do, log in err, respond with error code 500 (if possible)
	error_catcher?:error_catcher_cb;
	bodyguard?:bodyguard_cb; //called once request headers are in and the action is picked, before any body is read. Must return true to let the request through
	safe_send?:boolean; //default false. simple_response() on an already-sent response is refused
	                    //(logged, routed to error_catcher) instead of throwing ERR_HTTP_HEADERS_SENT

	//usually send errors are loged in error level, with this option the log is lowered to debug level. Typical uisage  send_error_ignore:['ERR_STREAM_DESTROYED']
	send_error_ignore?:string[];
}
```

options for `compose`:

* `log` [log4js](https://www.npmjs.com/package/log4js) inspired interface to logging facility to be used in the server. Some helper functions are provided: `function log_all():logger_t` and  `function log_none():logger_t` to help with faster setup.
* `indexer` is a url handler for unmatched requests. It can do custom 404 pages or index direcotories somehow. It's all up to you. The helper function `http_action_gone` is provided that just returns cacheable `410 GONE` responses.
* `auto_headers` headers specified here will be automatically send with every response. Primary target is `...auto_headers:{"Access-Control-Allow-Origin":"*"}, ...`
* `auto_handle_OPTIONS` is of by default. If set to `true` it allows for unmatched requests with `OPTIONS` method to be automatically replied with `200 OK` plus the `auto_headers` to allow some browsers to check for [CORS](https://en.wikipedia.org/wiki/Cross-origin_resource_sharing) headers.
* `max_body_size` global request body size limiter.  if not set MAX_BODY_SIZE will be enforced.
* `allowed_methods` states what HTTP methods your server will handle. If you want to handle only `GET` and/or `POST` request you can state so here and keep `http_action` param of `compose` cleaner or you can intermix all HTTP method filtering to you like
* `catch_to_500` makes error handling easy in `.do` callback by puting a `try {...} catch ( ... ) { ... }` block so an exception thrown in your code will cause internal server error code 500 to be send. To proper catch async errors you need to return the (hidden) promise from from the first async function called. See the example in http_action_cb below
* `error_catcher` a callback that will receive all request about to be rejected by the library.
* `bodyguard` a callback that gets to approve every request before its body is read, for all urls including unmatched ones. See `bodyguard_cb` below.
* `safe_send` is off by default. When on, calling `simple_response` or `json_response` on a response that was already sent is refused instead of throwing `ERR_HTTP_HEADERS_SENT`. See the note under `SimpleServerResponse`.

## http_action_cb
```typescript
interface http_action_cb {
	(req:CompleteIncomingMessage, resp:SimpleServerResponse) :void|Promise<any>;
}
```

The http request handling callback in form 

```typescript
function handle_a_request(req:CompleteIncomingMessage, resp:SimpleServerResponse) {
	...
}
```
or
```typescript
async function handle_a_request(req:CompleteIncomingMessage, resp:SimpleServerResponse) {
	...
}
```


this is the `do` in `http_action_t`  and `indexer` in `options_t` 

as usual use the information in `req` to craft a `resp`

if you're using `catch_to_500` option and mixing sync and async functions make really sure you're returing the tail call functions. For example if you're using a authentication middleware you should do some strict returns:

```typescript

type chain_cb_t=(req: CompleteIncomingMessage, resp: SimpleServerResponse, auth_artefact:string)=>void|Promise<any>;

//chack auth call chain if auth ok
function auth (req: CompleteIncomingMessage, resp: SimpleServerResponse, chain:chain_cb_t){
	let  auth_artefact=req......
	....
	return chain(req,resp,auth_artefact)
}

async function dothis(req: CompleteIncomingMessage, resp: SimpleServerResponse, auth_artefact:string) {
	await ....
}
...
compose(
	server,
	[
	...
	{prefix:"/api/dothis?", do: (req,resp)=>{return auth(req,resp,dothis)}},
	{prefix:"/api/dothat?", do: (req,resp)=>{return auth(req,resp,dothat)}},
	....
	],
	options
);
```

## bodyguard_cb

```typescript
interface bodyguard_cb {
	(req:CompleteIncomingMessage, resp:SimpleServerResponse) :boolean|Promise<boolean>;
}
```

A `bodyguard` is called once the request headers are complete and the action has been picked,
but **before danmaru reads a single byte of the body**. That is the point of it: an auth check
is usually cheap and header-only, and there is no reason to buffer up to `max_body_size` of
body from a client that is about to be turned away.

It is **fail-closed**: the request proceeds only if the guard returns `true`, or a promise that
resolves to `true`. Anything else -- `false`, `undefined`, a forgotten `return` -- rejects the
request. A guard that forgets to return blocks, loudly and immediately, rather than quietly
letting unauthenticated requests through.

```typescript
compose(server,[
	{prefix:"/api/", do: handle_api},
	{prefix:"/api/admin/", do: handle_admin, bodyguard: async (req,resp)=>{
		//runs only if the global bodyguard below already approved
		return await is_admin(req.headers.authorization);
	}},
],{
	bodyguard: async (req,resp)=>{
		if (!req.url.startsWith('/api/')) return true;      //public, let it through
		const token=req.headers.authorization;
		if (token==undefined) {
			resp.simple_response(codes.UNAUTHORIZED,"no token");
			return false;                                   //our own 401, danmaru does not add one
		}
		return await token_is_valid(token);                 //false here gets a plain 401
	}
});
```

Both levels can be set. The `options_t` one runs first, for every request including the ones
that fall through to the `indexer`; the `http_action_t` one runs after it, and only if it
approved. Both must return `true`.

* `req.full_url` **is** available here, so query-string tokens work. `req.body_string` is
  still empty, by design.
* If the guard rejects without sending anything, danmaru answers `401 UNAUTHORIZED`. If the
  guard already answered, its own response stands untouched.
* A guard that throws, or whose promise rejects, is **always** caught and turned into a `500`
  with `ERR_REASON_HANDLING_ERR`, whether or not you set `catch_to_500`. An escaping error here
  would leave the request with nothing listening to it, which is a hung socket rather than a
  failed request.
* When `auto_handle_OPTIONS` is on, the guard is **skipped for `OPTIONS`**. A CORS preflight
  carries no credentials, so guarding it would break preflight for every browser client.
* Rejecting does not close the socket. Node discards the unread body for you, so the client
  still gets a clean response; danmaru just never buffers the body. If you want the connection
  gone, call `req.destroy()` in the guard yourself.

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
	indicate_error_if_possible:(code:number)=>void;
	req:IncomingMessage|CompleteIncomingMessage;
	send_error_ignore?:string[];
	error_catcher?:error_catcher_cb;
	safe_send?:boolean;
}
```

* `action` this is the `http_action_t` that is assigned to handle the request. This might come handy in some `layered` design
* `req_url` a copy of the associated `IncomingMessage` `.url` kept for easy logging.
* `logger` the logger from associated `compose`
* `auto_headers` from the `compose` `options`
* `simple_response` method for "one line response": `resp.simple_response(200)` is all it take to "confirm" a `http_action_cb` you can specify the response body data in `data`, set additional headers in `headers` or customise the response text via `reason` if you like.
* `json_response`  method for "one line JSON response": `resp.simple_response(200,{ok:true})` is all it take to create return some JSON to the requester. It resolves to `simple_response` with proper stringification, if needed, plus a `Content-Type: application/json; charset=UTF-8` header to make the standard committee happy.
* `indicate_error_if_possible` sends `code` if nothing has been sent yet, and otherwise just ends a response that is still open. Used internally for every error danmaru answers itself.
* `req` the associated `IncomingMessage`, so an `error_catcher` reached through the response can still get at the request.
* `send_error_ignore`, `error_catcher`, `safe_send` copies of the `compose` options of the same name.

### safe_send and double sends

Answering twice is easy to do by accident -- a branch that responds and forgets to `return`,
then falls through to the response below it:

```typescript
indexer(req,resp){
    if (req.url.startsWith('/api/')){
        resp.simple_response(codes.NOT_FOUND);   // answers
    }                                            // <-- no return
    resp.simple_response(codes.NOT_FOUND);       // answers again
}
```

By default the second call reaches node's `writeHead` on an already-sent response, which
throws `ERR_HTTP_HEADERS_SENT` **synchronously, out of your handler**. Without `catch_to_500`
nothing in danmaru catches it, so it lands on your `process.on('uncaughtException')` and
normally takes the service down. The client still gets a perfectly good first response, which
is what makes this one hard to spot: nothing looks wrong until the process dies.

With `safe_send:true` the second send is refused instead: it is logged at error level and
routed to your `error_catcher` as `ERR_REASON_DOUBLE_SEND`, and the first response stands.
It is strictly a no-op -- the first sender owns the response, so a refused send will not end
one that is still streaming either.

It is opt-in, and off by default, because flipping it would turn a throw into a silent no-op
for anyone relying on the current behaviour. New code should set it.

Note that `simple_response` and `json_response` return `write()`'s backpressure boolean, not a
success flag, so the `false` from a refused send is indistinguishable from ordinary
backpressure. `error_catcher` is the honest signal.

## ERR_REASON

The first argument to an `error_catcher`. Every request danmaru rejects or fails on its own
arrives here, so this is the one place to watch if you want to know what your server is
turning away.

| Constant | Value | Meaning |
|---|---|---|
| `ERR_REASON_NOURL` | 1 | the request had no `.url`/`.method`, or was HTTP/2 |
| `ERR_REASON_BADMETHOD` | 2 | blocked by `allowed_methods`, answered `405` |
| `ERR_REASON_NOTFOUND` | 3 | no action matched and there is no `indexer`, answered `404` |
| `ERR_REASON_NETERR` | 4 | the request stream errored |
| `ERR_REASON_NETABORTED` | 5 | the client aborted |
| `ERR_REASON_OVERSIZED` | 6 | body went over `max_body_size`, answered `400` |
| `ERR_REASON_BADURL` | 7 | `full_url` could not be parsed, answered `400` |
| `ERR_REASON_HANDLING_ERR` | 8 | `do()` threw under `catch_to_500`, or a `bodyguard` threw |
| `ERR_REASON_HTTP2_NOTSUPPORTED` | 9 | reserved |
| `ERR_REASON_SEND_ERROR` | 10 | the socket write failed; the network's fault, not yours |
| `ERR_REASON_DOUBLE_SEND` | 11 | a second send was refused under `safe_send`; your bug, hence its own code |
| `ERR_REASON_BODYGUARD_REJECT` | 12 | a `bodyguard` turned the request away |


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


 For static files serving we recoomend using [serve-handler](https://www.npmjs.com/package/serve-handler) and calling it in indexer function

 ```typescript 
 import {compose} from 'danmaru';
 import serveHandler from 'serve-handler'

 ....

 compose(server,[...],{
	 indexer:(req,resp)=>{
		if (req.url.startsWith('/api/')) {
			log.info("unhandled api call at "+req.url);
			resp.simple_response(codes.NOT_FOUND);
			return;
		}
		serveHandler(req,resp,{public:"./fe/dist", rewrites:[{source:'/',destination:'/index.html'}]});
	}
});
 ```

For more (advanced) examples take a look at our test files :)

## Development

```sh
npm run build   # emit index.js / index.d.ts
npm test        # compile to .test-build and run the node:test suites
```

Tests use the node built-in test runner (`node --test`) and `node:assert`, so there is no
test framework to install -- `npm test` compiles `src/` with the local TypeScript and runs
the emitted CommonJS, which is the same module format the package ships. Requires Node 18
or newer for `node --test`. The compiler is TypeScript 7; the published artifact is still
CommonJS and nothing about how you `require('danmaru')` has changed.
