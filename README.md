# danmaru
No dependency, convenience  HTTTP/HTTPS server wrapper in TypeScript

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

For more (advanced) examples take a look at our test files :)
