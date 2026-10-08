import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {readHistoricalMigrationSources} from './hosted-migration-plan';
import {replayPlan} from './replay-plan';
import {createOriginalPrefixReconciliationTemplate} from './hosted-schema-reconciliation';
import {canonicalReleaseExecutionJson} from '../verification/release-review';
import policy from './unknown-prefix-catalogue-policy.json';
import {unknownPrefixCataloguePolicySha256,unknownPrefixAbsencePolicySha256} from './hosted-schema-reconciliation-policy';

const hash=(value:Uint8Array|string)=>createHash('sha256').update(value).digest('hex'),now=Date.parse('2026-10-08T04:00:00Z');
const files=readHistoricalMigrationSources(resolve(import.meta.dirname,'../..'),'d87455114cac2d22d63d040ce5b13e6b2e74e743','1e85393d46beb4f5356e07277a13a7ef33cc67d9'),replay=replayPlan(files),rows=replay.before.map(name=>({name,version:name.slice(0,14),sha256:hash(files.find(file=>file.name===name)!.bytes)}));
export function completionFixture(){
 const template=createOriginalPrefixReconciliationTemplate({recoverySource:{sourceSha:'4'.repeat(40),treeSha:'5'.repeat(40),ciRunId:'31',releaseRunId:'51',runAttempt:1},stageRows:rows,historySha256:hash(canonicalReleaseExecutionJson(rows.slice(0,120).map(row=>({version:row.version,sourceReceiptSha256:row.sha256})))),cataloguePolicySha256:unknownPrefixCataloguePolicySha256,catalogueSha256:policy.expected.catalogueSha256,absencePolicySha256:unknownPrefixAbsencePolicySha256,endpointSha256:'3'.repeat(64)});
 const identity={...template.originalIdentity,sourceSha:template.recoverySource.sourceSha,treeSha:template.recoverySource.treeSha,ciRunId:'31',approvalDigest:'7'.repeat(64),planSha256:'6'.repeat(64)};
 const expected={repository:'attaulhaq0/Cuevo',template,partialReceiptSha256:'8'.repeat(64),recoveryIdentity:identity,packageSha256:'7'.repeat(64),now};
 const body={version:1,purpose:'CUEVO_HOSTED_SCHEMA_RECOVERY_COMPLETION',status:'PREFIX123_CONFIRMED',repository:expected.repository,sourceSha:identity.sourceSha,treeSha:identity.treeSha,projectRef:identity.projectRef,ciRunId:'31',recoveryRunId:'51',runAttempt:1,packageSha256:expected.packageSha256,originalOperationSha256:hash(JSON.stringify(template.originalIdentity)),originalChainSha256:hash(template.ownerJson+template.recordJson.join('')),partialReceiptSha256:expected.partialReceiptSha256,recoveryIdentity:identity,migrationCount:123,migrations:rows,migrationManifestSha256:hash(canonicalReleaseExecutionJson(rows)),historySha256:hash(canonicalReleaseExecutionJson(rows.map(row=>({version:row.version,sourceReceiptSha256:row.sha256})))),cataloguePolicySha256:unknownPrefixCataloguePolicySha256,catalogueSha256:policy.completedPrefix.expected.catalogueSha256,completedAt:new Date(now-1000).toISOString(),cleanup:{kind:'RELEASED'}};
 return{body,expected,now};
}
async function api(){return import('./hosted-schema-recovery-completion');}

test('completion records only exact original123 and released cleanup without changing historical unknown evidence',async()=>{
 const module=await api(),{body,expected}=completionFixture(),before=canonicalReleaseExecutionJson(expected.template),receipt=module.prepareHostedSchemaRecoveryCompletion(body,expected);
 assert.equal(receipt.status,'PREFIX123_CONFIRMED');assert.equal(receipt.migrationCount,123);assert.equal(receipt.cleanup.kind,'RELEASED');assert.deepEqual(module.readHostedSchemaRecoveryCompletion(receipt,expected),receipt);assert.equal(canonicalReleaseExecutionJson(expected.template),before);
 assert.deepEqual(module.readHostedSchemaRecoveryCompletion(receipt,{...expected,now:expected.now+864000000}),receipt);
});
test('unconfirmed cleanup changed original current context and missing source rows never become completion',async()=>{
 const module=await api(),{body,expected}=completionFixture();for(const change of[{cleanup:{kind:'RELEASE_UNCONFIRMED'}},{status:'REQUIRES_REVIEW'},{migrationCount:120},{migrations:body.migrations.slice(0,-1)},{migrations:body.migrations.map((row,index)=>index?row:{...row,sha256:'0'.repeat(64)})},{originalOperationSha256:'0'.repeat(64)},{originalChainSha256:'0'.repeat(64)},{partialReceiptSha256:'0'.repeat(64)},{sourceSha:'9'.repeat(40)},{packageSha256:'0'.repeat(64)},{runAttempt:2},{catalogueSha256:policy.expected.catalogueSha256},{completedAt:new Date(expected.now+1).toISOString()},{nativeVerified:true}])assert.throws(()=>module.prepareHostedSchemaRecoveryCompletion({...body,...change},expected));
 const receipt=module.prepareHostedSchemaRecoveryCompletion(body,expected);assert.throws(()=>module.readHostedSchemaRecoveryCompletion({...receipt,receiptSha256:'0'.repeat(64)},expected));assert.throws(()=>module.readHostedSchemaRecoveryCompletion(receipt,{...expected,packageSha256:'0'.repeat(64)}));
});
test('receipt descriptor and canonical byte guards refuse getters proxies and sparse migration arrays without traps',async()=>{
 const module=await api(),{body,expected}=completionFixture();let traps=0;assert.throws(()=>module.prepareHostedSchemaRecoveryCompletion({...body,get partialReceiptSha256(){traps++;return body.partialReceiptSha256;}},expected));assert.throws(()=>module.prepareHostedSchemaRecoveryCompletion(new Proxy(body,{get(){traps++;return undefined;}}),expected));assert.throws(()=>module.prepareHostedSchemaRecoveryCompletion({...body,migrations:new Array(123)},expected));assert.equal(traps,0);
});
