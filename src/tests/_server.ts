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
