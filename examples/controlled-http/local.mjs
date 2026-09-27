// Local fault-injection transport only. Application/authentication remain Kujo.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
export const route='/v1/abilities/publication/create/run', operation='publication_create';
export const schema='http.ability-handoff/v1alpha1';
export const json=x=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?'['+x.map(json).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+json(x[k])).join(',')+'}';
export const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
export const id=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(x)&&!/[\r\n]/.test(x);
export const read=(root,name)=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
export function once(root,name,raw){const fd=fs.openSync(path.join(root,name),fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);try{fs.writeFileSync(fd,raw);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}const d=fs.openSync(path.dirname(path.join(root,name)),'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}}
export function store(root,raw){const name='artifacts/'+sha(raw)+'.json';try{once(root,name,raw);}catch(e){if(e.code!=='EEXIST')throw e;const fd=fs.openSync(path.join(root,name),fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{if(fs.readFileSync(fd,'utf8')!==raw)throw Error('integrity');}finally{fs.closeSync(fd);}}return 'sha256:'+sha(raw);}
export function gateway(root,config,mode,fault='portable-v1'){
 return new Promise((resolve,reject)=>{const child=spawn(config.runtime,['run','examples/application-assurance/gateway.kujo',root,mode,fault],{cwd:config.cwd,env:{ABILITY_GATEWAY_SESSION:process.env.ABILITY_GATEWAY_SESSION||''},stdio:['ignore','pipe','pipe']});let output='',errors='',size=0;const timer=setTimeout(()=>child.kill('SIGKILL'),20000);child.stdout.on('data',b=>{size+=b.length;if(size>8192)child.kill('SIGKILL');else output+=b;});child.stderr.on('data',b=>{size+=b.length;if(size>8192)child.kill('SIGKILL');else errors+=b;});child.on('error',reject);child.on('close',code=>{clearTimeout(timer);try{if(code!==0||errors||size>8192)throw Error('gateway_unavailable');resolve(JSON.parse(output));}catch{reject(Error('gateway_unavailable'));}});});
}
export function record(root,config,ticket,context,receipt,outcome,observed){
 const inv=read(root,'invocation.json');if(!observed.ok)throw Error('observation unavailable');
 if(receipt&&(receipt.schema!=='kujo.ability.receipt/v1'||receipt.invocation_id!==inv.invocation_id||receipt.ability_id!==inv.ability_id||receipt.ability_version!==inv.ability_version||receipt.definition_digest!==inv.definition_digest||receipt.surface!==inv.surface))throw Error('receipt mismatch');
 const correlation={...context,ability_id:inv.ability_id,ability_version:inv.ability_version,definition_digest:inv.definition_digest,ability_invocation_id:inv.invocation_id,receipt_id:receipt?.receipt_id??null,receipt_ref:receipt?store(root,json(receipt)):null,outcome,transaction_sha256:observed.profile.transaction_sha256};
 const stamp=new Date().toISOString().replace(/\.\d{3}Z$/,'Z');
 const result={schema:'kujo.execution-result/v1',result_id:ticket.dispatch_run_id+':'+ticket.dispatch_attempt_id,subject:{run_id:ticket.dispatch_run_id,step_id:ticket.dispatch_step_id,attempt_id:ticket.dispatch_attempt_id},producer:{name:'http-ability-host',version:'1'},status:outcome==='receipt_succeeded'?'success':'indeterminate',classification:'unknown',started_at:stamp,finished_at:stamp,attempt:Number(ticket.dispatch_attempt_id),effects:[{effect_id:ticket.dispatch_effect_id,class:'external_idempotent',state:'unknown',idempotency_key:observed.profile.key_digest,enforced_by:'ability-local',enforcement_evidence_ref:observed.observation.evidence_ref}],evidence:correlation.receipt_ref?[{$ref:correlation.receipt_ref}]:[],http_correlation:correlation,preservation_outcome:ticket.preservation};
 const raw=json(result),handoff={schema,...correlation,dispatch_run_id:ticket.dispatch_run_id,dispatch_step_id:ticket.dispatch_step_id,dispatch_attempt_id:ticket.dispatch_attempt_id,dispatch_effect_id:ticket.dispatch_effect_id,execution_result_ref:store(root,raw),assurance_ref:null};
 const encoded=json(handoff);if(Buffer.byteLength(encoded)>4096)throw Error('oversize');const reference=store(root,encoded);
 once(root,'result-'+ticket.dispatch_attempt_id+'.json',raw);once(root,'http-handoff-'+ticket.dispatch_attempt_id+'.ref',reference);return reference;
}
