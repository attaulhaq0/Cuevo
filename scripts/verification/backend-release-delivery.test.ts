import assert from 'node:assert/strict';
import {test} from 'node:test';

test('versioned database and observation deliveries contain no deployable artifact roots or nullable placeholders',async()=>{
 let subject:Record<string,unknown>={};try{subject=await import('./backend-release-delivery');}catch(error){if((error as NodeJS.ErrnoException).code!=='ERR_MODULE_NOT_FOUND')throw error;}assert.equal(typeof subject.validateBackendReleaseDelivery,'function');const validate=subject.validateBackendReleaseDelivery as(value:unknown,scope:string)=>unknown;
 assert.deepEqual(validate({kind:'DATABASE_ONLY',apiRoot:null,edgeRoot:null},'schema-and-accounts'),{kind:'DATABASE_ONLY',apiRoot:null,edgeRoot:null});assert.throws(()=>validate({kind:'DATABASE_ONLY',apiRoot:'api',edgeRoot:null},'schema-and-accounts'));assert.throws(()=>validate({kind:'DATABASE_ONLY',apiRoot:null,edgeRoot:null},'complete-backend'));assert.throws(()=>validate({kind:'CI_RUNTIME_ARTIFACTS',apiRoot:'api',edgeRoot:'edge'},'schema-and-accounts'));
 const observation={kind:'RUNTIME_OBSERVATION',apiRoot:null,edgeRoot:null,apiArtifactSha256:'a'.repeat(64),edgeArtifactSha256:'b'.repeat(64),denoLockSha256:'c'.repeat(64)};assert.deepEqual(validate(observation,'pending-runtime-confirmation'),observation);assert.throws(()=>validate({...observation,apiRoot:'api'},'pending-runtime-confirmation'));assert.throws(()=>validate({...observation,key:'private'},'installed-runtime'));assert.throws(()=>validate(observation,'schema-and-accounts'));
});
test('workflow and handover share one strict versioned execution envelope and reject mixed payloads',async()=>{
 const {backendReleaseExecutionSchema}=await import('./backend-release-delivery'),common={purpose:'CUEVO_BACKEND_RELEASE_EXECUTION',repoRoot:'/fixture',expected:{executionScope:'schema-and-accounts'},preparedApproval:{},plan:{},migrationEndpoint:{projectRef:'abcdefghijklmnopqrst',kind:'direct',host:'db.abcdefghijklmnopqrst.supabase.co',port:5432,database:'postgres'},stages:[],toolchainManifestPath:'/fixture/toolchain',operatorStoragePolicyPath:'/fixture/policy'},current={...common,version:2,delivery:{kind:'DATABASE_ONLY',apiRoot:null,edgeRoot:null}};
 assert.equal(backendReleaseExecutionSchema.parse(current).version,2);assert(backendReleaseExecutionSchema.safeParse({...current,artifacts:{apiRoot:'/artifact',edgeRoot:'/edge'}}).success===false);
 assert.equal(backendReleaseExecutionSchema.parse({...common,version:1,artifacts:{apiRoot:'/artifact',edgeRoot:'/edge'}}).version,1);
 assert.equal(backendReleaseExecutionSchema.safeParse({...current,verified:true}).success,false);
});
