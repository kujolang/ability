// Offline socket harness. No client retry, verifier or replay decision.
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import assert from 'node:assert/strict';
import {route,json,read,gateway,record} from './local.mjs';
const [root,attempt,mode='run']=process.argv.slice(2),config=read(root,'config.json'),inv=read(root,'invocation.json');
const child=spawn(process.execPath,[path.join(config.cwd,'examples/controlled-http/server.mjs'),root,attempt,mode==='standalone'?'standalone':'controlled'],{env:{ABILITY_GATEWAY_SESSION:process.env.ABILITY_GATEWAY_SESSION||''},stdio:['ignore','pipe','pipe']});
let errors='';child.stderr.on('data',b=>{errors+=b;if(errors.length>8192)child.kill('SIGKILL');});
try{
 const port=await new Promise((resolve,reject)=>{let raw='';const timer=setTimeout(()=>reject(Error('server startup')),5000);child.once('exit',()=>reject(Error('server exit')));child.stdout.on('data',b=>{raw+=b;if(raw.length>1024){child.kill('SIGKILL');reject(Error('oversize'));}if(raw.includes('\n')){clearTimeout(timer);resolve(JSON.parse(raw.trim()).port);}});});
 assert(Number.isInteger(port)&&port>0&&port<65536);
 const ticket=mode==='standalone'?null:read(root,'http-ticket-'+attempt+'.json');
 const headers={'content-type':'application/json',authorization:'Bearer '+process.env.ABILITY_GATEWAY_SESSION,'x-request-id':ticket?.client_request_id||'standalone-request','idempotency-key':inv.idempotency_key};
 function request(overrides={}){return new Promise(resolve=>{
  const body=overrides.raw??json(overrides.body??{input:inv.input,invocation_id:inv.invocation_id});let settled=false;
  const finish=x=>{if(!settled){settled=true;clearTimeout(timer);resolve(x);}};
  const req=http.request({host:'127.0.0.1',port,path:overrides.path??route,method:overrides.method??'POST',headers:{...headers,...overrides.headers},agent:false},res=>{let chunks=[],size=0;res.on('data',b=>{size+=b.length;if(size>8192){req.destroy();finish({transport:'response_oversize'});}else chunks.push(b);});res.on('end',()=>{try{finish({transport:'response',status:res.statusCode,headers:res.headers,data:JSON.parse(Buffer.concat(chunks).toString('utf8'))});}catch{finish({transport:'invalid_response'});}});res.on('error',()=>finish({transport:'response_lost'}));});
  const timer=setTimeout(()=>{finish({transport:'timeout'});req.destroy();},overrides.timeout??30000);
  req.on('error',()=>finish({transport:'response_lost'}));req.end(body);
 });}
 if(mode==='standalone'){
  const a=await request(),b=await request();assert.equal(a.data.receipt.status,'succeeded');assert.equal(b.data.receipt.status,'succeeded');assert.equal(a.data.receipt.receipt_id,b.data.receipt.receipt_id);console.log(json({ok:true,outcome:'standalone',replayed:true}));
 }else if(mode==='deny'){
  const denied=await request();assert.equal(denied.data?.outcome,'not_admitted');console.log(json({ok:true,outcome:'not_admitted'}));
 }else{
  let denied=0;
  for(const h of ['X-Dispatch-Run','X-Dispatch-Attempt','X-Assurance-Profile','X-Trusted-Root','X-Principal','X-Config-Revision','X-Verifier']){const r=await request({headers:{[h]:'forged'}});assert.equal(r.data?.outcome,'not_admitted');denied++;}
  for(const o of [{path:route+'?dispatch_run_id=forged'},{path:'/publications'},{method:'PUT'},{headers:{authorization:'Bearer forged'}},{headers:{'x-request-id':'wrong'}},{headers:{'idempotency-key':'wrong'}},{body:{input:{body:'changed'},invocation_id:inv.invocation_id}},{body:{input:inv.input,invocation_id:inv.invocation_id,principal:{id:'forged'}}},{raw:'{'},{raw:Buffer.from([0xff])},{headers:{'x-request-id':[headers['x-request-id'],'duplicate']}},{headers:{'x-extra':'x'.repeat(4097)}},{raw:'x'.repeat(4097)},{headers:{'content-type':'text/plain'}}]){const r=await request(o);assert(r.transport!=='response'||r.status>=400);denied++;}
  assert(!fs.existsSync(path.join(root,'http-claim-'+attempt)));
  const timeout=attempt==='1'&&config.http_scenario==='timeout-before'?100:30000;
  const pair=await Promise.all([request({timeout}),request({timeout})]);
  for(const r of pair){assert(!json(r).includes(inv.input.body));assert(!json(r).includes(process.env.ABILITY_GATEWAY_SESSION));assert(!json(r).includes('principal'));}
  const rejected=pair.filter(r=>r.data?.outcome==='not_admitted');assert.equal(rejected.length,1,json(pair));
  const response=pair.find(r=>r.data?.outcome!=='not_admitted');
  const until=Date.now()+25000;while(!fs.existsSync(path.join(root,'http-settled-'+attempt))&&Date.now()<until)await new Promise(r=>setTimeout(r,20));
  assert(fs.existsSync(path.join(root,'http-settled-'+attempt)),'server did not settle');
  const receipt=fs.existsSync(path.join(root,'http-private-'+attempt+'.json'))?read(root,'http-private-'+attempt+'.json').receipt:null;
  const outcome=response.transport==='timeout'?'timeout':response.transport!=='response'?'response_lost':response.data.outcome;
  const context=read(root,'http-context-'+attempt+'.json');
  const ref=record(root,config,ticket,context,receipt,outcome,await gateway(root,config,'observe'));
  const result={ok:true,outcome,handoff_ref:ref,concurrent_denied:1,invalid_requests_denied:denied};
  fs.writeFileSync(path.join(root,'http-public-'+attempt+'.json'),json(result));console.log(json(result));
 }
}finally{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)resolve();else{const t=setTimeout(()=>child.kill('SIGKILL'),2000);child.once('exit',()=>{clearTimeout(t);resolve();});}});assert.equal(errors,'');}
