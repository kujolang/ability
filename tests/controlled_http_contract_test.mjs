import assert from 'node:assert/strict';import fs from 'node:fs';
import {schema,route,operation,sha,json,id} from '../examples/controlled-http/local.mjs';
const spec=JSON.parse(fs.readFileSync('examples/controlled-http/openapi.json'));
const handoff=JSON.parse(fs.readFileSync('schema/http-ability-handoff-v1alpha1.schema.json'));
assert.equal(spec.openapi,'3.1.0');assert.equal(Object.keys(spec.paths).length,1);assert.equal(spec.paths[route].post.operationId,operation);
assert.equal(handoff.$id,schema);assert.equal(handoff.required.length,20);assert.equal(handoff.additionalProperties,false);
assert.deepEqual(handoff.required.slice().sort(),Object.keys(handoff.properties).sort());
assert.equal(id('x\n'),false);assert.equal(id('x'.repeat(129)),false);assert.equal(id('opaque-call-1'),true);
assert.equal(sha('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');assert.equal(json({b:1,a:null}),'{"a":null,"b":1}');
console.log('controlled HTTP OpenAPI/handoff contract checks passed');
// ECMAScript $ permits a terminal newline; the published schema must forbid it too.
for(const field of ['client_request_id','http_request_id','ability_invocation_id']){
 const shape=handoff.properties[field];const accepts=x=>new RegExp(shape.pattern).test(x)&&x.length<=shape.maxLength&&!new RegExp(shape.not.pattern).test(x);
 assert.equal(accepts('opaque-1'),true);assert.equal(accepts('opaque-1\n'),false);assert.equal(accepts('opaque-1\r'),false);
}
