// Operator-owned local HTTP fixture, not a remote gateway or second application.
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {route,operation,json,sha,id,read,once,gateway,store} from './local.mjs';
const [root,attempt,mode='controlled']=process.argv.slice(2),config=read(root,'config.json'),inv=read(root,'invocation.json');
const ticket=mode==='standalone'?null:read(root,'http-ticket-'+attempt+'.json');
const credential=process.env.ABILITY_GATEWAY_SESSION||'';
const current=()=>ticket&&Date.now()<ticket.valid_until_ms&&read(root,'http-current-ticket.json').attempt===attempt&&ticket.method==='POST'&&ticket.route_id==='publication_run'&&ticket.operation_id===operation&&ticket.invocation_sha256===sha(json(inv));
let inflight=0;
function send(res,status,data){const raw=json(data);if(Buffer.byteLength(raw)>8192){res.writeHead(500);res.end();return;}res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(raw);}
const server=http.createServer({maxHeaderSize:4096,requestTimeout:25000,headersTimeout:2000,connectionsCheckingInterval:100},async(req,res)=>{
 if(++inflight>4){inflight--;send(res,429,{outcome:'not_admitted'});req.resume();return;}
 let accepted=false;
 let done=false;const release=()=>{if(!done){done=true;inflight--;}};res.once('close',release);
 const deny=(status=403)=>{send(res,status,{outcome:'not_admitted'});req.resume();};
 try{
  if(req.method!=='POST'||req.url!==route)return deny(404);
  if(req.rawHeaders.length>32||Object.keys(req.headers).some(k=>/^(x-dispatch|x-assurance|x-trusted|x-principal|x-tenant|x-config|x-verifier)/.test(k)))return deny();
  const seen=new Set();for(let i=0;i<req.rawHeaders.length;i+=2){const key=req.rawHeaders[i].toLowerCase();if(seen.has(key))return deny();seen.add(key);}
  if(!credential||req.headers.authorization!=='Bearer '+credential)return deny(401);
  if(req.headers['content-type']!=='application/json')return deny(415);
  if(!id(req.headers['x-request-id'])||String(req.headers['idempotency-key']||'').length>255)return deny();
  if(ticket&&(!current()||req.headers['x-request-id']!==ticket.client_request_id))return deny();
  const raw=await new Promise((resolve,reject)=>{let chunks=[],bytes=0;const timer=setTimeout(()=>{reject(Error('body_timeout'));req.destroy();},2000);req.on('data',b=>{bytes+=b.length;if(bytes>4096){clearTimeout(timer);chunks=[];reject(Error('oversize'));req.destroy();}else chunks.push(b);});req.on('end',()=>{clearTimeout(timer);resolve(Buffer.concat(chunks));});req.on('error',()=>{clearTimeout(timer);reject(Error('transport'));});});
  const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  if(body===null||Array.isArray(body)||Object.keys(body).sort().join(',')!=='input,invocation_id'||body.invocation_id!==inv.invocation_id||json(body.input)!==json(inv.input)||req.headers['idempotency-key']!==inv.idempotency_key)return deny(409);
  if(ticket){if(!current())return deny();try{once(root,'http-claim-'+attempt,crypto.randomUUID());}catch{return deny(409);}}
  const context={client_request_id:req.headers['x-request-id'],http_request_id:crypto.randomUUID(),method:'POST',route_id:'publication_run',operation_id:operation};
  if(ticket){once(root,'http-context-'+attempt+'.json',json(context));accepted=true;}
  // A real client timeout closes the socket before the delayed mutation starts.
  if(ticket&&attempt==='1'&&config.http_scenario==='timeout-before'){
   await new Promise(resolve=>setTimeout(resolve,400));
   if(res.destroyed){once(root,'http-settled-'+attempt,'absent');return;}
  }
  if(ticket&&(!current()||res.destroyed))return deny();
  fs.appendFileSync(path.join(root,'http-gateway-invocations'),attempt+'\n');
  const data=await gateway(root,config,'execute',ticket&&attempt==='1'&&config.http_scenario==='application-error'?'business_failure':'portable-v1');
  const receipt=data.receipt??null;
  if(ticket){once(root,'http-private-'+attempt+'.json',json({receipt}));once(root,'http-settled-'+attempt,'finished');}
  if(ticket&&attempt==='1'&&config.http_scenario==='response-loss'){req.socket.destroy();return;}
  if(!ticket){send(res,200,data);return;}
  send(res,receipt?.status==='succeeded'?200:422,{outcome:receipt?.status==='succeeded'?'receipt_succeeded':'application_error',receipt_ref:receipt?store(root,json(receipt)):null});
 }catch{
  if(accepted){
   try{if(!fs.existsSync(path.join(root,'http-private-'+attempt+'.json')))once(root,'http-private-'+attempt+'.json',json({receipt:null}));if(!fs.existsSync(path.join(root,'http-settled-'+attempt)))once(root,'http-settled-'+attempt,'unavailable');}catch{req.socket.destroy();return;}
   if(!res.destroyed)send(res,502,{outcome:'application_unavailable',receipt_ref:null});
  }else if(!res.destroyed)send(res,400,{outcome:'request_invalid'});
 }
});
server.keepAliveTimeout=1000;
server.on('clientError',(_e,socket)=>socket.destroy());
server.listen(0,'127.0.0.1',()=>process.stdout.write(json({port:server.address().port})+'\n'));
process.on('SIGTERM',()=>{server.closeAllConnections();server.close(()=>process.exit(0));});
