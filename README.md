# danmaru
No dependency, convenience  HTTTP/HTTPS server wrapper in TypeScript

## How to use

0. setup your TypeScript project (2020 is over, you should not use plain JS)
1. install danmaru `npm install --save danmaru`
2. for the example we use log4js for logging so install it also `npm install --save log4js`

```typescript 

import * as http  from 'http';
import { getLogger } from 'log4js'
const log=getLogger();
import { CompleteIncomingMessage, http_action_t, compose, SimpleServerResponse, sane_options_GET_API, codes } from 'danmaru';

const server= new http.Server();

function http_action_hello_world (req:CompleteIncomingMessage, resp:SimpleServerResponse){
    log.mark("hello_world HTTP REQ!");
    resp.json_response(codes.OK,{"hi":"there!"});
}

const http_actions:http_action_t[]=[
    {prefix:'/hi', do: http_action_hello_world},
];

compose(server,http_actions,{...sane_options_GET_API,log:log});

server.listen(1234,()=>{
    log.mark("danmaru HTTP server started at port 1234");
});

```
