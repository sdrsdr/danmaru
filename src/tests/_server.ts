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

import * as http from 'http';

/**
 * Start a composed test server and resolve once it is accepting connections.
 */
export function start(server:http.Server,port:number):Promise<void>{
	return new Promise((resolve,reject)=>{
		server.once('error',reject);
		server.listen(port,()=>resolve());
	});
}

/**
 * Stop a test server.
 *
 * fetch() keeps its sockets alive, so a plain close() would sit there waiting
 * for them and hang the run. Drop the idle connections first -- that is what the
 * fixed sleep in the old jest suite was working around.
 */
export function stop(server:http.Server):Promise<void>{
	return new Promise((resolve,reject)=>{
		server.closeAllConnections();
		server.close((err)=>err?reject(err):resolve());
	});
}
