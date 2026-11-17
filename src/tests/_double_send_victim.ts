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

// Not a test file. A deliberately doomed server, run as a child process by
// double_send.test.ts: it composes WITHOUT safe_send and answers twice, which is
// the shape of the incident that motivated the option. The second send throws
// ERR_HTTP_HEADERS_SENT straight past do() and kills this process -- which is the
// whole point, and is why it cannot live inside the test runner's own process.

import * as http from 'http';
import {compose,log_none,codes} from '../index';

const server= new http.Server ();

compose(
	server,[
		{prefix:"/twice", do: (req,resp)=>{
			resp.simple_response(codes.NOT_FOUND,'first');
			resp.simple_response(codes.GONE,'second'); //throws: nothing in the library catches it
		}},
	],{log:log_none()}
);

server.listen(0,'127.0.0.1',()=>{
	const addr=server.address();
	if (addr==null || typeof addr=='string') {
		console.log('PORT:0');
		return;
	}
	console.log('PORT:'+addr.port);
});
