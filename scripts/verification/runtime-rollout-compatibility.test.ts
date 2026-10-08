import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runtimeContractSha256,validateRuntimeRolloutCompatibility} from './runtime-rollout-compatibility';
const source='a'.repeat(40),desired='b'.repeat(40),tree='c'.repeat(40),digest='d'.repeat(64);
const component={sourceSha:source,treeSha:tree,apiArtifactSha256:digest,edgeArtifactSha256:digest,denoLockSha256:digest,apiContractSha256:digest,workerContractSha256:digest,workerAdmissionProtocol:'GENERATION_V1',migrations:[{name:'20261008124909_worker_rollout_admission.sql',version:'20261008124909',sha256:digest}]};
const expected={previousSourceSha:source,desiredSourceSha:desired,desiredTreeSha:tree,runId:'31',runAttempt:2};
test('changed repository provenance can reuse identical actual components without pretending sources match',()=>{
 const value={version:1,purpose:'CUEVO_REVIEWED_RUNTIME_TRANSITION',previous:component,desired:{...component,sourceSha:desired},basis:'IDENTICAL_COMPONENT_CONTRACTS',pairedEvidence:null,rollback:'REQUIRES_REVIEW'};
 const proof=validateRuntimeRolloutCompatibility(value,expected);assert.equal(proof.pendingMigrations.length,0);assert.equal(proof.rollbackPermittedByContract,false);
 for(const patch of [{apiArtifactSha256:'e'.repeat(64)},{workerContractSha256:'e'.repeat(64)},{migrations:[...component.migrations,{name:'20261008124910_add.sql',version:'20261008124910',sha256:digest}]}])assert.throws(()=>validateRuntimeRolloutCompatibility({...value,desired:{...value.desired,...patch}},expected));
 assert.throws(()=>validateRuntimeRolloutCompatibility({...value,compatible:true},expected));
});
test('changed artifacts or append-only migrations require exact old and new execution contracts from admitted CI',()=>{
 const next={...component,sourceSha:desired,apiArtifactSha256:'e'.repeat(64),migrations:[...component.migrations,{name:'20261008124910_add.sql',version:'20261008124910',sha256:digest}]},pairedEvidence={repository:'owner/repo',sourceSha:desired,treeSha:tree,runId:'31',runAttempt:2,jobsSha256:digest,previousContractSha256:runtimeContractSha256(component),desiredContractSha256:runtimeContractSha256(next),oldApiOnExpandedDbSha256:digest,newApiOnExpandedDbSha256:digest,oldWorkerOnExpandedDbSha256:digest,newWorkerOnExpandedDbSha256:digest,storedSourceVersionsSha256:digest,authorizationDenialsSha256:digest,decisionPath:'docs/decisions/runtime-transition.md',decisionSha256:digest},value={version:1,purpose:'CUEVO_REVIEWED_RUNTIME_TRANSITION',previous:component,desired:next,basis:'PAIRED_RUNTIME_VERIFICATION',pairedEvidence,rollback:'RETAINED_PROVIDER_ARTIFACTS_ON_EXPANDED_SCHEMA'};
 assert.equal(validateRuntimeRolloutCompatibility(value,expected).pendingMigrations.length,1);
 for(const field of ['oldApiOnExpandedDbSha256','newApiOnExpandedDbSha256','oldWorkerOnExpandedDbSha256','newWorkerOnExpandedDbSha256','authorizationDenialsSha256']){const changed={...pairedEvidence} as Record<string,unknown>;delete changed[field];assert.throws(()=>validateRuntimeRolloutCompatibility({...value,pairedEvidence:changed},expected));}
 assert.throws(()=>validateRuntimeRolloutCompatibility({...value,pairedEvidence:{...pairedEvidence,runAttempt:1}},expected));
 assert.throws(()=>validateRuntimeRolloutCompatibility({...value,previous:{...component,migrations:[{...component.migrations[0],sha256:'f'.repeat(64)}]}},expected));
});
test('ordinary verified binary changes can release against unchanged actual database and public event/API contracts',()=>{
 const next={...component,sourceSha:desired,apiArtifactSha256:'e'.repeat(64),edgeArtifactSha256:'f'.repeat(64)},value={version:1,purpose:'CUEVO_REVIEWED_RUNTIME_TRANSITION',previous:component,desired:next,basis:'UNCHANGED_RUNTIME_CONTRACTS',pairedEvidence:null,rollback:'RETAINED_PROVIDER_ARTIFACTS_ON_EXPANDED_SCHEMA'};
 assert.equal(validateRuntimeRolloutCompatibility(value,expected).pendingMigrations.length,0);
 for(const change of [{apiContractSha256:'e'.repeat(64)},{workerContractSha256:'e'.repeat(64)},{denoLockSha256:'e'.repeat(64)},{migrations:[...next.migrations,{name:'20261008124910_add.sql',version:'20261008124910',sha256:digest}]}])assert.throws(()=>validateRuntimeRolloutCompatibility({...value,desired:{...next,...change}},expected));
});
