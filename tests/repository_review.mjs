import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
const directory=await mkdtemp(join(tmpdir(),'ability-review-'));
const kujo=resolve(process.env.KUJO_BIN), root=resolve('.');
const git=execFileSync('which',['git'],{encoding:'utf8'}).trim();
const repository=join(directory,'repository');await mkdir(repository);await mkdir(join(directory,'home'));
const run=(args)=>execFileSync(git,['-C',repository,...args],{encoding:'utf8'});
try {
 run(['init','-q']);run(['config','user.name','Test']);run(['config','user.email','test@example.com']);
 await writeFile(join(repository,'test.txt'),'before\n');run(['add','.']);run(['commit','-qm','initial']);await writeFile(join(repository,'test.txt'),'after\n');
 const config={kujo,git,repository,home:join(directory,'home'),path:process.env.PATH,patchbrief:resolve('../patchbrief'),changebucket:resolve('../changebucket'),revisions:{'patchbrief.kujo':execFileSync(git,['-C','../patchbrief','rev-parse','HEAD'],{encoding:'utf8'}).trim(),'changebucket.kujo':execFileSync(git,['-C','../changebucket','rev-parse','HEAD'],{encoding:'utf8'}).trim()}};
 const entry=join(directory,'test.kujo');
 await writeFile(entry,`from packs.repository_review.runtime import create_repository_review_registry, repository_review_policy
from src.registry import list_ability_definitions
from src.runtime import execute_ability
func audit(phase,invocation,payload){return {"ok":true,"event_id":phase}}
created := create_repository_review_registry(${JSON.stringify(config)})
assert(created["ok"],"registry")
results := []
for item in list_ability_definitions(created["registry"],"sdk") {
 d:=item["definition"]
 invocation:={"schema":"kujo.ability.invocation/v1","invocation_id":"test-"+d["id"],"ability_id":d["id"],"ability_version":d["version"],"definition_digest":item["digest"],"input":{},"principal":{"type":"workload","id":"test","tenant_id":"local","claims":{}},"surface":"sdk","request_id":"test","trace_id":"test","idempotency_key":"","approval":{},"metadata":{}}
 results=push(results,execute_ability(created["registry"],invocation,{"policy":repository_review_policy,"audit":audit}))
}
print(to_json(results))
`);
 const invoke=()=>JSON.parse(execFileSync(kujo,['run',entry,'--interpreter'],{cwd:root,env:{PATH:process.env.PATH,KUJO_MODULE_PATH:root},encoding:'utf8',timeout:60000}));
 const results=invoke();assert.equal(results.length,2);
 for(const result of results){assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.receipt.result.summary.files_changed,1);}
 const canary=join(directory,'executed');run(['config','filter.hostile.clean',`touch ${canary}`]);
 for(const result of invoke()){assert.equal(result.ok,false);assert.equal(result.receipt.error.code,'repository_executable_configuration');}
 console.log('Canonical repository-review pack: 2 real CLI executions + 2 hostile-filter rejections passed.');
} finally {await rm(directory,{recursive:true,force:true});}
