//  
//   * This file is a part of danmaru https://...
//   * Copyright (c) 2020 Stoian Ivanov.
//   
//   This program is free software: you can redistribute it and/or modify
//   it under the terms of the GNU Lesser General Public License version 3 
//   as published by the Free Software Foundation
//   
//   This program is distributed in the hope that it will be useful,
//   but WITHOUT ANY WARRANTY; without even the implied warranty of
//   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//   GNU Lesser General Public License for more details.
//   
//   A copy of the GNU Lesser General Public License can be found at
//   https://www.gnu.org/licenses


import { IncomingMessage,ServerResponse,Server as http_Server, OutgoingHttpHeaders } from 'http';
import { Server as https_Server} from 'https';
import { URL } from 'url';


/**************************
*  CONSTANTS
***************************/

const MAX_BODY_SIZE=40000;


/**************************
*  MAIN INTERFACES
***************************/


export interface options_t {
	log?:logger_t; 
	indexer?:http_action_cb; //default handler; if not set a 404 is send back
	auto_headers?:OutgoingHttpHeaders; //this headers are preset for sending for each response 
	auto_handle_OPTIONS?:boolean; //default is false. Just do resp.simple_response(200) and return for all non 404 urls and OPTIONS method (passing the content of auto_headers to the browser)
	max_body_size?:number; //in characters if not set MAX_BODY_SIZE will be enforced
	allowed_methods?:string[]; // default is no-filtering;
	catch_to_500?:boolean; //catch exceptions in http_action_t.do, log in err, respond with error code 500 (if possible)
}



export interface http_action_t {
	prefix:string;
	do:http_action_cb;
	m?:string[]; //allowed methods
	max_body_size?:number; //if not set max_body_size from options or MAX_BODY_SIZE will be enforced
	exact_match?:boolean; //default false; if true prefix must exact-match
}


export interface http_action_cb {
	(req:CompleteIncomingMessage, resp:SimpleServerResponse) :void|Promise<any>;
}

export interface CompleteIncomingMessage extends IncomingMessage {
	//assert this from parent
	url:string;
	method:string;

	//expand a bit 
	action:http_action_t;
	full_url:URL;
	body_string:string;
	is_damaged:boolean;
}

export interface SimpleServerResponse extends ServerResponse {
	action:http_action_t;
	req_url:string;
	logger:logger_t;
	auto_headers:OutgoingHttpHeaders;
	simple_response:(code:number,data?:any, headers?:OutgoingHttpHeaders, reason?:string)=>boolean;
	json_response:(code:number,data:string|object, headers?:OutgoingHttpHeaders, reason?:string)=>boolean;
}

export interface logger_t {
	debug:logfunction_t;
	info:logfunction_t;
	warn:logfunction_t;
	error:logfunction_t;
	mark:logfunction_t;
}


/**************************
*  HELPER INTERFACES
***************************/

export interface logfunction_t {
	(message: any, ...args: any[]): void
}


/**************************
*  EXPORTED UTILS
***************************/

export function nologfunction(message: any, ...args: any[]){

}

export function log_all():logger_t {
	return {
		debug:console.log,
		info:console.log,
		warn:console.log,
		error:console.log,
		mark:console.log,
	}
}
export function log_none():logger_t {
	return {
		debug:nologfunction,
		info:nologfunction,
		warn:nologfunction,
		error:nologfunction,
		mark:nologfunction,
	}
}

export const codes={
	OK:200,
	BAD_REQ:400,
	UNAUTHORIZED: 401,
	FORBIDDEN:403,
	NOT_FOUND:404,
	METHOD_NOT_ALLOWED:405,
	GONE:410,
	INTERNAL_ERR:500,
}

export function http_action_gone (req:CompleteIncomingMessage, resp:SimpleServerResponse) {
	resp.simple_response(codes.GONE,undefined,{"Cache-Control":"max-age=99999"});
}
export const sane_options:options_t={
	auto_headers:{"Access-Control-Allow-Origin": "*"},
	auto_handle_OPTIONS:true,
	allowed_methods:["GET","POST","OPTIONS"],
}
export const sane_options_gone_index:options_t={...sane_options,indexer:http_action_gone};
export const sane_options_GET_API:options_t={...sane_options,allowed_methods:["GET","OPTIONS"]};



/**************************
*  MAIN CALL
***************************/

export function compose(server:http_Server|https_Server, http_actions:http_action_t[], options?:options_t):boolean {
	const log:logger_t=options?.log??nolog;

	let scheme:string;

	if (server instanceof http_Server) {
		scheme='http://';
		log.debug("composing on a HTTP server");
	} else if (server instanceof https_Server) {
		scheme='https://';
		log.debug("composing on a HTTPS server");
	} else {
		log.error("not a HTTP or HTTPS server?!");
		return false;
	}

	let indexer:http_action_t|undefined=undefined;
	const auto_headers=options?.auto_headers;
	if (options?.indexer!=undefined) {
		indexer={prefix:'<<INDEXER>>>',do:options.indexer};
	}
	const auto_handle_OPTIONS=options?.auto_handle_OPTIONS??false;
	const global_max_body_size=options?.max_body_size??MAX_BODY_SIZE;
	let do_method_filter:boolean=false;
	let method_filter:string[];
	const omf=options?.allowed_methods;
	if (Array.isArray(omf)){
		do_method_filter=true;
		method_filter=omf;
	} else {
		method_filter=[]; //better safe than sorry
	}
	const catch_to_500=options?.catch_to_500??false;

	let default_base:string=scheme+'unknown:0';
	server.on("listening",()=>{
		let addr=server.address();
		if (addr==null) {
			log.error("a null was not expected as result from server.address()! full_url will be b0rken later");
			return;
		}
		if (typeof addr=="string") {
			log.error("a string type was not expected as result from server.address()! Let's hope this works in the url later");
			default_base=scheme+addr;
			return;
		}
		if (addr.address.indexOf(':')>=0) { //IPv6 needs some love:
			default_base=scheme+'['+addr.address+']:'+addr.port;
		} else {
			default_base=scheme+addr.address+':'+addr.port;
		}
		log.debug("default_base for urls set as %s",default_base);
	})

	server.on('request',(early_req:IncomingMessage,resp_:ServerResponse)=>{
		let resp=mk_SimpleServerResponse(resp_,log,auto_headers);
		if (early_req.url==undefined || early_req.method==undefined) {
			log.error("server.on 'request' but no .url or .method ?!");
			return;
		}
		resp.req_url=early_req.url;
		if (do_method_filter && method_filter.indexOf(early_req.method)<0){
			log.info("%s to %s is not allowed buy method_filter",early_req.method,early_req.url);
			resp.simple_response(codes.METHOD_NOT_ALLOWED);
			return;
		}
	
		let selected_action_:http_action_t|undefined=undefined;
		for (let a of http_actions) {
			if (a.exact_match===true) {
				if ((early_req.url== a.prefix) && (a.m==undefined || a.m.indexOf(early_req.method)>=0 ) ) {
					selected_action_=a; break;
				}
			} else {
				if (early_req.url.startsWith(a.prefix) && (a.m==undefined || a.m.indexOf(early_req.method)>=0) ) {
					selected_action_=a; break;
				}
			}
		}

		if (selected_action_==undefined) {
			if (indexer==undefined) {	
				log.info("%s to %s not found in http_actions",early_req.method,early_req.url);
				resp.simple_response(codes.NOT_FOUND);
				return;
			} else {
				log.info("%s to %s not found in http_actions indexing..",early_req.method,early_req.url);
				selected_action_=indexer;
			}
		}
		
		const selected_action:http_action_t=selected_action_; //really sore locally for the closures
		resp.action=selected_action;
		let max_body_size:number=selected_action.max_body_size??global_max_body_size;

		log.debug("%s to %s data collection starts",early_req.method,early_req.url);
		let req=mk_CompleteIncomingMessage(early_req,selected_action);

		req.on("aborted",()=>{
			cleanup_CompleteIncomingMessage(req);
			log.debug("%s to %s request aborted!",early_req.method,early_req.url);
		});

		req.on("close",()=>{
			cleanup_CompleteIncomingMessage(req);
			log.debug("%s to %s request closed",early_req.method,early_req.url);
		});

		req.on("error",(e)=>{
			log.error("%s to %s request got err(%s) %o",early_req.method,early_req.url,e.message ,e);
			cleanup_CompleteIncomingMessage(req);
		});

		req.on("data",(chunk:any)=>{
			if (typeof chunk=='string') {
				req.body_string+=chunk;
			} else {
				req.body_string+=String(chunk);
			}
			if (req.body_string.length>max_body_size) {
				req.is_damaged=true;
				log.error("%s to %s request reached maximal allowed body size of ",early_req.method,early_req.url,max_body_size);
				resp.simple_response(codes.BAD_REQ);
				cleanup_CompleteIncomingMessage(req);
				req.destroy(new Error("request body size reached "+req.body_string+" but maximum allowed is "+max_body_size));
			}
		});
		req.on("end",()=>{
			if (req.is_damaged) {
				log.debug("%s to %s ended damaged so we just ignore it",early_req.method,early_req.url);
				return;
			}
			if (auto_handle_OPTIONS && req.method=="OPTIONS") {
				log.debug("OPTIONS to %s will be auto handled! body len:%d",early_req.url,req.body_string.length);
				resp.simple_response(codes.OK);
				cleanup_CompleteIncomingMessage(req);
				return;
			}
			try {
				let hn=req.headers.host;
				if (hn==undefined) {
					req.full_url=new URL(default_base+req.url);
				} else {
					req.full_url=new URL(scheme+hn+req.url);
				}
			} catch (e) {
				req.is_damaged=true;
				log.error("%s to %s parsing full_url got err",early_req.method,early_req.url,e);
				resp.simple_response(codes.BAD_REQ);
				cleanup_CompleteIncomingMessage(req);
				return;
			}

			log.debug("%s to %s complete request is ready for handling! body len:%d",req.method,early_req.url,req.body_string.length);
			if (catch_to_500) {
				try {
					let prom=selected_action.do(req,resp);
					if (prom) {
						prom.catch((e)=>{
							log.error("%s to %s promise from .do callback got rejected ",early_req.method,early_req.url,e);
							if (!resp.headersSent) {
								resp.simple_response(codes.INTERNAL_ERR);
							} else {
								if (!resp.finished) resp.end();
							}
						});
					}
				} catch(e){
					log.error("%s to %s calling .do callback got err",early_req.method,early_req.url,e);
					if (!resp.headersSent) {
						resp.simple_response(codes.INTERNAL_ERR);
					} else {
						if (!resp.finished) resp.end();
					}
				}
			} else {
				selected_action.do(req,resp);
			}
			cleanup_CompleteIncomingMessage(req);
		});
	});
	return true;
}


/**************************
*  INTERNALS
***************************/

function mk_SimpleServerResponse(resp_:ServerResponse, logger:logger_t,auto_headers?:OutgoingHttpHeaders):SimpleServerResponse {
	let resp:SimpleServerResponse=<SimpleServerResponse>resp_;
	resp.logger=logger;
	resp.simple_response=simple_response;
	resp.json_response=json_response;
	resp.auto_headers=auto_headers??{};
	return resp;
}

function mk_CompleteIncomingMessage (early_req:IncomingMessage,action:http_action_t):CompleteIncomingMessage {
	let req:CompleteIncomingMessage=<CompleteIncomingMessage>early_req;
	req.body_string='';
	req.is_damaged=false;
	req.action=action;
	return req;
}

//try to minimise used memory in req as this is going in GC heap (probably)
function cleanup_CompleteIncomingMessage(req:CompleteIncomingMessage) {
	req.body_string='';
	req.is_damaged=true;
	if (req.full_url!=undefined) delete (<any>req).full_url;

}

let nolog:logger_t={
	debug:nologfunction,
	info:nologfunction,
	warn:nologfunction,
	error:nologfunction,
	mark:nologfunction,
}



function simple_response(this:SimpleServerResponse,code:number,data?:any, headers?:OutgoingHttpHeaders, reason?:string):boolean {
	for (let h in this.auto_headers) if (this.auto_headers.hasOwnProperty(h)){
		this.setHeader(h,<any>(this.auto_headers[h]));
	}
	if (headers!=undefined) {
		for (let h in headers) if (headers.hasOwnProperty(h)){
			this.setHeader(h,<any>(headers[h]));
		}
	}
	if (this.logger!=undefined) this.logger.debug("resp to %s sending response with code %d",this.req_url,code);
	this.writeHead(code,reason);
	let res=true;
	if (data!=undefined && data!=null) {
		res=this.write(data,(e)=>{
			if (e) {
				if (this.logger!=undefined) this.logger.error("resp to %s sending resp got err(%s) %o",this.req_url,e.message,e);
				return;
			}
		})
	}
	this.end();
	return res;
}

function json_response(this:SimpleServerResponse,code:number,data:string|object, headers?:OutgoingHttpHeaders, reason?:string):boolean {
	if (headers==undefined) {
		headers={'Content-Type':'application/json; charset=UTF-8'};
	} else {
		let hkeys=Object.keys(headers);
		let found=false;
		for (let h in  headers) if (headers.hasOwnProperty(h) && h.toUpperCase()=='CONTENT-TYPE'){
			found=true;
			break;
		}
		if (found==false) {
			headers['Content-Type']='application/json; charset=UTF-8';
		}
	}
	if (typeof data != 'string') data=JSON.stringify(data);
	return this.simple_response(code,data,headers,reason);
}
