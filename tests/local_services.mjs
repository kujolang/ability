import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const directory=await mkdtemp(join(tmpdir(),'ability-store-')),path=join(directory,'service.sqlite');
const command=process.env.KUJO_BIN,args=['run','tests/local_services.kujo',...(process.env.ABILITY_TEST_RUNTIME==='vm'?[]:['--interpreter'])];
const env=mode=>({...process.env,ABILITY_STORE_TEST_PATH:path,ABILITY_STORE_TEST_MODE:mode});
const run=(mode,input='')=>execFileSync(command,args,{env:env(mode),input,encoding:'utf8'}).trim();
try {
 assert.equal(run('init'),'initialized');assert.equal(run('checks'),'local service checks passed');assert.equal(run('inspect'),'restart blocked');const approval=run('grant');
 const invoke=()=>new Promise((resolve,reject)=>{const child=spawn(command,args,{env:env('invoke')});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.on('error',reject);child.on('close',code=>code===0?resolve(JSON.parse(stdout)):reject(Error(stderr)));child.stdin.end(approval);});
 const results=await Promise.all(Array.from({length:8},invoke));assert(results.some(r=>r.ok),JSON.stringify(results));
 for(const result of results)assert(result.ok||result.receipt.error.code==='ability_invocation_in_progress',JSON.stringify(result));
 const replay=JSON.parse(run('invoke',approval));assert.equal(replay.ok,true);assert.equal(replay.replayed,true);
 const original=results.find(r=>r.ok);assert.deepEqual(replay.receipt,original.receipt);
 const rows=JSON.parse(execFileSync('python3',['-c','import sqlite3,json,sys; c=sqlite3.connect(sys.argv[1]); print(json.dumps([c.execute("select count(*) from business").fetchone()[0],c.execute("select consumed from approvals where id=\'grant\'").fetchone()[0]]))',path],{encoding:'utf8'}));assert.deepEqual(rows,[1,1]);
 execFileSync('python3',['-c',`import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute("update invocations set receipt='{}' where state='completed'"); c.commit()`,path]);
 const corrupt=JSON.parse(run('invoke',approval));assert.equal(corrupt.ok,false);assert.equal(corrupt.receipt.error.code,'ability_idempotency_store_failed');
 console.log('Local durable services: approval/revoke/forgery, conflict, crash state, 8-process contention and restart replay passed.');
}finally{await rm(directory,{recursive:true,force:true});}
