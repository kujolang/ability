// Maintenance harness; all application execution/verification runs in Kujo.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
const cwd=process.cwd(), runtime=process.env.KUJO_BIN||path.resolve('../kujo/target/debug/kujo');
const entry='examples/application-assurance/gateway.kujo';
export const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const canonical=x=>x&&typeof x==='object'?Array.isArray(x)?x.map(canonical):Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const json=x=>JSON.stringify(canonical(x));
const token=crypto.randomBytes(32).toString('hex');
const canary='SECRET_CUSTOMER_BODY_sk-ability-never-export';
const root=path.resolve('tests/tmp/application-assurance-'+Date.now());fs.mkdirSync(root,{recursive:true,mode:0o700});
const logs=[],proof=[];
function processRun(cmd,args,options={}){const r=spawnSync(cmd,args,{cwd,encoding:'utf8',timeout:30000,maxBuffer:1024*1024,...options});assert.equal(r.status,0,r.stderr||r.stdout);assert.equal(r.stderr,'');return r.stdout.trim();}
const definitionLines=processRun(runtime,['run',entry,'definition']).split('\n'),definition=JSON.parse(definitionLines[0]),definitionDigest=definitionLines[1];
function sql(dir,statement){return processRun('sqlite3',[path.join(dir,'application.sqlite'),statement]);}
function setup(name,seconds=1800){const dir=path.join(root,name);fs.mkdirSync(dir,{mode:0o700});const principal={type:'user',id:'user-1',tenant_id:'tenant-1',claims:{}};
 const inv={schema:'kujo.ability.invocation/v1',invocation_id:'invocation-1',ability_id:definition.id,ability_version:definition.version,definition_digest:definitionDigest,input:{body:canary},principal,request_id:'request-1',trace_id:'trace-1',surface:'sdk',idempotency_key:'application-key',approval:{},metadata:{}};
 fs.writeFileSync(path.join(dir,'invocation.json'),json(inv));const now=Math.floor(Date.now()/1000);
 sql(dir,`PRAGMA journal_mode=WAL; CREATE TABLE sessions(token TEXT PRIMARY KEY,principal TEXT NOT NULL,valid_from INTEGER NOT NULL,valid_until INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0); CREATE TABLE requests(key TEXT PRIMARY KEY,request TEXT NOT NULL,profile TEXT NOT NULL,owner TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('active','ready','completed'))); CREATE TABLE business_effects(key TEXT PRIMARY KEY,tx TEXT UNIQUE NOT NULL,profile TEXT NOT NULL,body TEXT NOT NULL); CREATE TABLE receipts(key TEXT PRIMARY KEY,raw TEXT NOT NULL,digest TEXT NOT NULL,tx TEXT NOT NULL); CREATE TABLE audit(phase TEXT NOT NULL,invocation TEXT NOT NULL); INSERT INTO sessions VALUES('${sha(token)}','${json(principal)}',${now-2},${now+seconds},0);`);
 return dir;
}
function run(dir,mode='execute',barrier='',credential=token){const out=processRun(runtime,['run',entry,dir,mode,barrier],{env:{...process.env,ABILITY_GATEWAY_SESSION:credential}});logs.push(out);return JSON.parse(out);}
async function child(dir,barrier='',kill=false,hook=null){return await new Promise((resolve,reject)=>{const p=spawn(runtime,['run',entry,dir,'execute',barrier],{cwd,env:{...process.env,ABILITY_GATEWAY_SESSION:token}});let out='',err='';const timer=setTimeout(()=>{p.kill('SIGKILL');reject(new Error('gateway timeout'));},15000);p.stdout.on('data',b=>{out+=b;if(hook&&out.includes('ADMISSION_BOUNDARY')){hook();hook=null;}if(kill&&out.includes('CRASH_BOUNDARY'))p.kill('SIGKILL');});p.stderr.on('data',b=>err+=b);p.on('exit',(code,signal)=>{clearTimeout(timer);assert.equal(err,'');if(kill){assert.equal(signal,'SIGKILL',out);resolve({killed:true});}else{assert.equal(code,0);logs.push(out);resolve(JSON.parse(out.replace('ADMISSION_BOUNDARY\n','')));}});});}
const count=dir=>Number(sql(dir,'SELECT count(*) FROM business_effects;'));
for(const boundary of ['before_business','before_business_commit','after_business_commit','before_receipt_commit','after_receipt_commit','before_reply']){
 const dir=setup(boundary);await child(dir,boundary,true);const observed=run(dir,'observe');assert.equal(observed.ok,true,JSON.stringify(observed));const committed=!['before_business','before_business_commit'].includes(boundary);assert.equal(observed.observation.observed_state,committed?'committed':'not_started');assert.equal(count(dir),Number(committed));assert.equal(run(dir,'recover').ok,true);const resumed=run(dir);assert.equal(resumed.ok,true,JSON.stringify(resumed));assert.equal(count(dir),1);assert.equal(run(dir).replayed,true);proof.push({boundary,businessBefore:Number(committed),businessAfter:count(dir),receiptBefore:observed.evidence.receipt_sha256!==null});
}
const failed=setup('commit-failed');const failure=run(failed,'execute','receipt_failure');assert.equal(failure.code,'ability_idempotency_commit_failed');assert.equal(failure.receipt.idempotency.state,'commit_failed');assert.equal(count(failed),1);assert.equal(sql(failed,'SELECT count(*) FROM receipts;'),'0');assert.equal(run(failed,'observe').observation.observed_state,'committed');assert.equal(run(failed).code,'ability_invocation_in_progress');assert.equal(run(failed,'recover').ok,true);assert.equal(run(failed).ok,true);assert.equal(count(failed),1);
const absentFailure=setup('commit-failed-absent');assert.equal(run(absentFailure,'execute','business_failure').code,'ability_idempotency_commit_failed');assert.equal(run(absentFailure,'observe').observation.observed_state,'not_started');assert.equal(run(absentFailure,'recover').ok,true);assert.equal(run(absentFailure).ok,true);assert.equal(count(absentFailure),1);
const uncertain=setup('commit-failed-uncertain');assert.equal(run(uncertain,'execute','receipt_failure').code,'ability_idempotency_commit_failed');fs.renameSync(path.join(uncertain,'application.sqlite'),path.join(uncertain,'unavailable.sqlite'));assert.equal(run(uncertain,'observe').code,'ability_business_effect_unverified');assert.equal(fs.existsSync(path.join(uncertain,'application.sqlite')),false);
assert.equal(sql(failed,'SELECT body FROM business_effects'),canary);
const corrupt=setup('corrupt');assert.equal(run(corrupt).ok,true);sql(corrupt,'DELETE FROM business_effects;');assert.equal(run(corrupt,'observe').code,'ability_business_receipt_mismatch');
const tampered=setup('tampered');assert.equal(run(tampered).ok,true);sql(tampered,"UPDATE receipts SET raw=raw||' '; ");assert.equal(run(tampered,'observe').code,'ability_business_receipt_mismatch');
const concurrent=setup('contention');assert.equal(run(concurrent,'execute','receipt_failure').code,'ability_idempotency_commit_failed');assert.equal(run(concurrent,'recover').ok,true);const outcomes=await Promise.all(Array.from({length:6},()=>child(concurrent)));assert.equal(count(concurrent),1);assert.equal(outcomes.filter(x=>x.ok&&!x.replayed).length,1);const contention={contenders:6,admitted:outcomes.filter(x=>x.ok&&!x.replayed).length,replayed:outcomes.filter(x=>x.replayed).length,in_progress:outcomes.filter(x=>x.code==='ability_invocation_in_progress').length,business:count(concurrent)};assert.equal(contention.admitted+contention.replayed+contention.in_progress,6);proof.push(contention);
const changed=setup('changed');assert.equal(run(changed).ok,true);const original=fs.readFileSync(path.join(changed,'invocation.json'),'utf8');for(const field of ['input','tenant','principal','definition','version']){const inv=JSON.parse(original);if(field==='input')inv.input.body='other';if(field==='tenant')inv.principal.tenant_id='tenant-2';if(field==='principal')inv.principal.id='user-2';if(field==='definition')inv.definition_digest=sha('other');if(field==='version')inv.ability_version='2.0.0';fs.writeFileSync(path.join(changed,'invocation.json'),json(inv));assert.equal(run(changed).ok,false,field);assert.equal(count(changed),1);}fs.writeFileSync(path.join(changed,'invocation.json'),original);assert.equal(run(changed,'observe','','forged').ok,false);
const revoked=setup('revoked');assert.equal(run(revoked,'observe').ok,true);sql(revoked,'UPDATE sessions SET revoked=1');assert.equal(run(revoked,'recover').code,'ability_assurance_revoked');assert.equal(run(revoked).code,'ability_assurance_revoked');assert.equal(count(revoked),0);
const expired=setup('expired',2);assert.equal(run(expired,'observe').ok,true);await new Promise(r=>setTimeout(r,2100));assert.equal(run(expired).code,'ability_assurance_expired');assert.equal(count(expired),0);
// Recheck authorization after early authentication and immediately before mutation.
for(const reason of ['revoked','expired']){
 const dir=setup('delayed-'+reason,reason==='expired'?3:1800);
 const outcome=await child(dir,'delay_before_business',false,()=>{if(reason==='revoked')sql(dir,'UPDATE sessions SET revoked=1');});
 assert.equal(outcome.ok,false);assert.equal(count(dir),0);
 assert.equal(outcome.code,'ability_idempotency_commit_failed');
 assert.equal(sql(dir,'SELECT count(*) FROM receipts'),'0');
 proof.push({delayedAdmission:reason,business:0,receipt:0});
}
// Receipt replay trust seam is closed by the application before returning replay.
const wrongReceipt=setup('wrong-replay-request');assert.equal(run(wrongReceipt).ok,true);
const saved=JSON.parse(sql(wrongReceipt,'SELECT raw FROM receipts'));
saved.idempotency.request_digest=sha('different-request');const altered=JSON.stringify(saved);
sql(wrongReceipt,"UPDATE receipts SET raw='"+altered.replaceAll("'","''")+"',digest='"+sha(altered)+"'");
assert.equal(run(wrongReceipt,'observe').code,'ability_business_receipt_mismatch');
const stale=setup('stale-transaction');assert.equal(run(stale).ok,true);sql(stale,"UPDATE business_effects SET tx='"+sha('stale')+"'");assert.equal(run(stale,'observe').code,'ability_transaction_mismatch');
for(const text of logs)assert.equal(text.includes(canary),false);
fs.writeFileSync(path.join(root,'proof.json'),JSON.stringify({proof,commitFailed:failure.code,privacy:true},null,2));console.log(JSON.stringify({root,proof,commitFailed:failure.code,privacy:true}));
if(process.argv.includes('--dispatch')){
 const dispatch=path.resolve(process.env.DISPATCH_ROOT||'../dispatch');
 function controller(dir,mode){const out=processRun(runtime,['run','tests/ability_assurance_fixture.kujo',dir,mode],{cwd:dispatch,env:{...process.env,ABILITY_GATEWAY_SESSION:token,DISPATCH_OFFLINE_FIXTURE:'true',DISPATCH_ALLOW_ANY_OUTPUT_ROOT:'true'}});logs.push(out);return out;}
 const results=[];
 for(const scenario of ['absent','commit-failed','complete','revoked','expired','corrupt','controller-contention']){
  const dir=setup('dispatch-'+scenario,scenario==='expired'?8:1800);
  if(scenario==='commit-failed')assert.equal(run(dir,'execute','receipt_failure').code,'ability_idempotency_commit_failed');
  else if(scenario==='complete'||scenario==='corrupt')assert.equal(run(dir).ok,true);
  const observation=run(dir,'observe'),p=observation.profile;
  assert.equal(observation.ok,true);
  fs.writeFileSync(path.join(dir,'profile.json'),JSON.stringify(p));assert.equal(processRun(runtime,['run','tests/application_profile_schema.kujo',dir]),'application profile schema passed');
  const config={runtime,cwd,issuer:'ability-application-local',application_key_digest:p.key_digest,effect_class:'external_idempotent',profile_sha256:sha(json(p)),transaction_sha256:p.transaction_sha256,intent:{operation:'create',target_sha256:p.target_sha256,scope_sha256:p.principal_sha256,key_sha256:sha(p.key_digest),request_sha256:p.request_digest,precondition_sha256:sha(json(p))}};
  fs.writeFileSync(path.join(dir,'config.json'),json(config));
  assert.equal(controller(dir,'start'),'PAUSED_AFTER_REAL_CRASH');
  assert.equal(controller(dir,'assure'),'ASSURANCE_RECORDED');
  const assurance=fs.readFileSync(path.join(dir,'assurance.json'),'utf8'),doc=JSON.parse(assurance);
  assert.equal(doc.evidence_ref,observation.observation.evidence_ref);
  const pointer=JSON.parse(fs.readFileSync(path.join(dir,'state-pointer.json'))),statePath=path.join(pointer.run_dir,'state.json');
  const before=fs.readFileSync(statePath,'utf8');
  if(scenario==='commit-failed'){
   const cases=[{name:'valid',raw:assurance,at:Math.floor(Date.now()/1000),want:true}];
   const add=(name,change)=>{const d=structuredClone(doc);change(d);cases.push({name,raw:JSON.stringify(d),at:Math.floor(Date.now()/1000),want:false});};
   for(const f of ['run_id','step_id','attempt_id','effect_id','result_sha256','scope_sha256','key_sha256','request_sha256','target_sha256','precondition_sha256','transaction_sha256'])add(f,d=>d[f]=f.endsWith('sha256')?sha('wrong'):'wrong');
   add('issuer',d=>d.issuer='forged');add('path',d=>d.evidence_ref='../../secret');add('url',d=>d.evidence_ref='https://credential:secret@example.invalid');add('unknown-profile',d=>d.mechanism='application-safe');
   cases.push({name:'oversize',raw:' '.repeat(8193),at:Math.floor(Date.now()/1000),want:false},{name:'conflicting',raw:JSON.stringify([doc,doc]),at:Math.floor(Date.now()/1000),want:false});
   fs.writeFileSync(path.join(dir,'cases.json'),JSON.stringify(cases));const answers=JSON.parse(controller(dir,'cases'));answers.forEach((x,i)=>assert.equal(x.answer.ok,cases[i].want,cases[i].name));
   assert.equal(fs.readFileSync(statePath,'utf8'),before);
   const invPath=path.join(dir,'invocation.json'),original=fs.readFileSync(invPath,'utf8');
   for(const f of ['tenant','principal','input','definition','key','version']){const inv=JSON.parse(original);if(f==='tenant')inv.principal.tenant_id='other';if(f==='principal')inv.principal.id='other';if(f==='input')inv.input.body='other';if(f==='definition')inv.definition_digest=sha('other');if(f==='key')inv.idempotency_key='other';if(f==='version')inv.ability_version='2.0.0';fs.writeFileSync(invPath,json(inv));assert.equal(JSON.parse(controller(dir,'resume')).ok,false,f);assert.equal(fs.readFileSync(statePath,'utf8'),before);}fs.writeFileSync(invPath,original);
   const principalStored=sql(dir,'SELECT principal FROM sessions');const otherPrincipal={type:'user',id:'user-2',tenant_id:'tenant-2',claims:{}};const cross=JSON.parse(original);cross.principal=otherPrincipal;fs.writeFileSync(invPath,json(cross));sql(dir,"UPDATE sessions SET principal='"+json(otherPrincipal)+"'");assert.equal(JSON.parse(controller(dir,'resume')).code,'ability_request_mismatch');assert.equal(fs.readFileSync(statePath,'utf8'),before);sql(dir,"UPDATE sessions SET principal='"+principalStored+"'");fs.writeFileSync(invPath,original);
   fs.writeFileSync(path.join(dir,'oversize.json'),' '.repeat(8193));fs.symlinkSync(path.join(dir,'assurance.json'),path.join(dir,'linked.json'));fs.writeFileSync(path.join(dir,'file-cases.json'),JSON.stringify([{path:'../invocation.json',digest:sha('x')},{path:'linked.json',digest:sha(assurance)},{path:'oversize.json',digest:sha(' '.repeat(8193))}]));assert.ok(JSON.parse(controller(dir,'file_cases')).every(x=>!x.ok));
   const casesFile=[{name:'changed-bytes',raw:assurance,at:Math.floor(Date.now()/1000),result_raw:fs.readFileSync(path.join(dir,'result-1.json'),'utf8')+'\n'}];fs.writeFileSync(path.join(dir,'cases.json'),JSON.stringify(casesFile));assert.equal(JSON.parse(controller(dir,'cases'))[0].answer.code,'assurance_result_digest_mismatch');
  }
  if(scenario==='revoked')sql(dir,'UPDATE sessions SET revoked=1');
  if(scenario==='expired')await new Promise(r=>setTimeout(r,Math.max(0,doc.valid_until*1000-Date.now()+100)));
  if(scenario==='corrupt')sql(dir,'DELETE FROM business_effects');
  let answer;
  if(scenario==='controller-contention'){
   const contenders=await Promise.all([1,2].map(()=>new Promise((resolve,reject)=>{const c=spawn(runtime,['run','tests/ability_assurance_fixture.kujo',dir,'resume'],{cwd:dispatch,env:{...process.env,ABILITY_GATEWAY_SESSION:token,DISPATCH_OFFLINE_FIXTURE:'true',DISPATCH_ALLOW_ANY_OUTPUT_ROOT:'true'}});let out='',err='';c.stdout.on('data',b=>out+=b);c.stderr.on('data',b=>err+=b);c.on('exit',code=>{try{assert.equal(code,0,err);logs.push(out);resolve(JSON.parse(out));}catch(e){reject(e);}});})));assert.equal(contenders.filter(x=>x.ok).length,1);answer=contenders.find(x=>x.ok);results.push({controllers:2,admitted:1,rejected:1});
  }else answer=JSON.parse(controller(dir,'resume'));
  if(['revoked','expired','corrupt'].includes(scenario)){assert.equal(answer.ok,false);assert.equal(fs.readFileSync(statePath,'utf8'),before);}
  else {assert.equal(answer.code,'REPLAY_COMPLETED',JSON.stringify(answer));assert.equal(count(dir),1);}
  assert.equal(fs.readFileSync(path.join(dir,'assurance.json'),'utf8').includes(canary),false);
  for(const file of fs.readdirSync(pointer.run_dir)){if(file.endsWith('.json')||file.endsWith('.jsonl'))assert.equal(fs.readFileSync(path.join(pointer.run_dir,file),'utf8').includes(canary),false);}
  results.push({scenario,code:answer.code,business:count(dir)});
 }
 for(const text of logs)assert.equal(text.includes(canary),false);
 fs.writeFileSync(path.join(root,'dispatch-proof.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({dispatchProof:results,root}));
}
