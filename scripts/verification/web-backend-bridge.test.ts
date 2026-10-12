import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { backendWebTransferFixture } from './backend-web-transfer-fixtures';
import { validateBackendWebTransfer } from './backend-web-transfer';
import { canonicalReleaseReviewJson } from './release-review';
import { backendSelectionForWebEvent, encodeWebBackendSelection, readWebBackendSelection, bindWebReviewToBackend, readCanonicalWebOutput, type WebBackendBridge } from './web-backend-bridge';
import {prepareBackendReleaseIntent}from'./backend-release-contracts';
import {validateStagingHostContract,stagingHostContractSha256}from'./backend-staging-host-contract';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { types } from 'node:util';
import { z } from 'zod';
import { canonicalReleaseExecutionJson } from './release-review';
import ts from 'typescript';

test('web bridge binds only complete manual staging selection and faithful operator review facts', async () => {
  const api = await import(pathToFileURL(resolve(import.meta.dirname, 'web-backend-bridge.ts')).href).catch(() => ({}));
  assert.equal(typeof api.backendSelectionForWebEvent, 'function');
  assert.equal(typeof api.bindWebReviewToBackend, 'function');
  assert.equal(typeof api.readWebBackendBridge, 'function');
});

test('only complete numeric manual staging selection is admitted; no partial fallback or production bridge', () => {
  const inputs = { backend_run_id: '51', backend_run_attempt: '1', backend_artifact_id: '71', backend_transfer_sha256: 'a'.repeat(64) };
  const selected = backendSelectionForWebEvent({ inputs }, 'workflow_dispatch', 'staging'); assert.equal(selected?.backendRunId, '51');
  assert.deepEqual(readWebBackendSelection(encodeWebBackendSelection(selected)), selected);
  assert.equal(backendSelectionForWebEvent({ inputs: {} }, 'workflow_dispatch', 'staging'), null);
  assert.equal(backendSelectionForWebEvent({}, 'workflow_run', 'production'), null);
  for (const mode of ['partial', 'number', 'junk', 'production', 'automatic', 'coerced']) {
    const changed: Record<string, unknown> = { ...inputs };
    if (mode === 'partial') changed.backend_artifact_id = '';
    if (mode === 'number') changed.backend_run_id = 51;
    if (mode === 'junk') changed.backend_run_attempt = '1;echo';
    if (mode === 'coerced') changed.backend_run_attempt = ' 1 ';
    assert.throws(() => backendSelectionForWebEvent({ inputs: changed }, mode === 'automatic' ? 'workflow_run' : 'workflow_dispatch', mode === 'production' ? 'production' : 'staging'));
  }
});
test('operating web bridge requires explicit manual staging purpose and refuses production selection',()=>{const inputs={backend_run_id:'51',backend_run_attempt:'1',backend_artifact_id:'71',backend_transfer_sha256:'a'.repeat(64),backend_handoff:'operating-staging'},selection=backendSelectionForWebEvent({inputs},'workflow_dispatch','staging');assert.equal(selection?.handoff,'operating-staging');assert.deepEqual(readWebBackendSelection(encodeWebBackendSelection(selection)),selection);assert.throws(()=>backendSelectionForWebEvent({inputs},'workflow_dispatch','production'));assert.throws(()=>backendSelectionForWebEvent({inputs:{...inputs,backend_handoff:'customer-ready'}},'workflow_dispatch','staging'));});

function reviewFixture() {
  const fixture = backendWebTransferFixture(), admitted = validateBackendWebTransfer(fixture.transfer, fixture.now), b = admitted.body;
  const bridge = { manifest: admitted.manifest, reviewFacts: admitted.reviewFacts, assignments: admitted.assignments, backendIdentity: { repository: b.repository, sourceSha: b.releaseSha, baseSha: b.baseSha, ciRunId: b.ciRunId, web: b.targets.web, manifestSha256: fixture.transfer.manifestSha256 } } as WebBackendBridge;
  const review = { version: 1, repository: b.repository, releaseSha: b.releaseSha, baseSha: b.baseSha, ciRunId: b.ciRunId, web: { teamId: b.targets.web.teamId, projectId: b.targets.web.projectId, target: b.targets.web.target }, sourceManifestSha256: b.fingerprints.sourceManifestSha256, diffSha256: b.fingerprints.diffSha256, manifestSha256: '0'.repeat(64),
    reviews: b.reviews.map(row => ({ category: row.category, taskId: row.taskId, releaseSha: row.releaseSha, baseSha: row.baseSha, sourceManifestSha256: row.sourceManifestSha256, diffSha256: row.diffSha256, reportSha256: row.reportSha256, evidenceSha256: row.evidenceSha256, reviewedAt: row.reviewedAt, provenance: 'RETAINED_INDEPENDENT_AGENT_REPORT', independenceAttested: true })) };
  const assignments = { baseSha: b.baseSha, reviews: admitted.assignments.map(row => ({ ...row })) };
  return { bridge, review, assignments };
}
test('actual operator review flags survive exact original backend facts; only bound manifest digest changes', () => {
  const { bridge, review, assignments } = reviewFixture();
  const bound = bindWebReviewToBackend(review, assignments, bridge);
  assert.equal(bound.manifestSha256, bridge.backendIdentity.manifestSha256);
  assert.deepEqual(bound.reviews, review.reviews); assert.equal(review.manifestSha256, '0'.repeat(64));
  assert.equal(bindWebReviewToBackend(review, { ...assignments, reviews: [...assignments.reviews].reverse() }, bridge).manifestSha256, bound.manifestSha256);
});
test('missing independent flags or altered tasks reports time assignments and source cannot create passing review', () => {
  for (const mode of ['flag', 'provenance', 'task', 'report', 'time', 'assignment', 'source']) {
    const { bridge, review, assignments } = reviewFixture();
    if (mode === 'flag') review.reviews[0].independenceAttested = false;
    if (mode === 'provenance') review.reviews[0].provenance = 'invented';
    if (mode === 'task') review.reviews[0].taskId = 'other-review';
    if (mode === 'report') review.reviews[0].reportSha256 = '0'.repeat(64);
    if (mode === 'time') review.reviews[0].reviewedAt = new Date().toISOString();
    if (mode === 'assignment') assignments.reviews[0].evidenceSha256 = '0'.repeat(64);
    if (mode === 'source') review.releaseSha = '0'.repeat(40);
    assert.throws(() => bindWebReviewToBackend(review, assignments, bridge), /contents withheld/, mode);
  }
});
test('canonical job output decode refuses malformed base64/JSON and accepts exact bounded output', () => {
  const value = { status: 'safe' }, encoded = Buffer.from(canonicalReleaseReviewJson(value)).toString('base64'); assert.deepEqual(readCanonicalWebOutput(encoded), value);
  for (const text of ['@@', Buffer.from('{ "status": "safe" }').toString('base64'), encoded + '=', '']) assert.throws(() => readCanonicalWebOutput(text));
});

test('bridge canonical identity retains optional original host tuple while inconsistent or private projections deny',()=>{
 const fixture=backendWebTransferFixture(),body=JSON.parse(fixture.transfer.preparedApproval.canonicalJson),settings=(rootDirectory:string|null,framework:string|null)=>({nodeVersion:'24.x',fluid:true,functionDefaultRegions:['sin1'],autoAssignCustomDomains:false,ssoDeploymentType:'all_except_custom_domains',rootDirectory,framework});
 const host=validateStagingHostContract({version:1,purpose:'CUEVO_STAGING_HOST_CONTRACT',sourceSha:body.releaseSha,treeSha:body.treeSha,deploymentEnvironment:'synthetic-staging',targets:body.targets,settings:{api:settings(null,null),web:settings('apps/web','nextjs'),supabase:{region:'ap-southeast-1',postgresEngine:'17',applicationConnection:{kind:'session-pooler',host:'aws-0-ap-southeast-1.pooler.supabase.com',port:5432,database:'postgres'}}},sourceBounds:{api:{node:'24',maxDurationSeconds:60,poolMax:10,connectionTimeoutMs:3000,idleTimeoutMs:10000,statementTimeoutMs:5000},worker:{poolMax:1,connectionTimeoutMs:3000,statementTimeoutMs:5000,processingDeadlineMs:20000,claimReserveMs:15000,eventLeaseSeconds:30,invocationLeaseSeconds:60,deliveryTimeoutMs:30000,recoveryIntervalSeconds:60}},capacity:{postgres:{maxConnections:60,superuserReservedConnections:3},sessionPoolerClientCeiling:{state:'UNKNOWN',value:null}},exposure:{audience:'PRIVATE_SYNTHETIC_OPERATORS',roleScope:'FIVE_REFERENCE_ROLES',gatewayPolicy:'EXISTING_PROTECTED_PREVIEW_AND_RESERVED_ORIGIN',clientAddressPolicy:'HOSTED_VERIFICATION_PENDING',fleetProtection:'NOT_VERIFIED'}});
 fixture.transfer.preparedApproval=prepareBackendReleaseIntent({...body,stagingHostContract:host},{...fixture.expected,stagingHostContract:host});
 const {bridge,review,assignments}=reviewFixture(),identity={...bridge.backendIdentity,treeSha:body.treeSha,stagingHostContract:host,stagingHostContractSha256:stagingHostContractSha256(host)},current={...bridge,backendIdentity:identity};
 assert.doesNotThrow(()=>bindWebReviewToBackend(review,assignments,current));const encoded=Buffer.from(canonicalReleaseReviewJson(current)).toString('base64');assert.deepEqual((readCanonicalWebOutput(encoded)as WebBackendBridge).backendIdentity.stagingHostContract,host);
 assert.notEqual(canonicalReleaseReviewJson(current),canonicalReleaseReviewJson(bridge));
 for(const patch of[{stagingHostContract:undefined},{stagingHostContractSha256:undefined},{stagingHostContract:'private-raw-canary'},{stagingHostContractSha256:'0'.repeat(64)},{stagingHostContract:{...host,sourceSha:'f'.repeat(40)}},{stagingHostContract:{...host,privateToken:'private-raw-canary'}}])assert.throws(()=>bindWebReviewToBackend(review,assignments,{...current,backendIdentity:{...identity,...patch}}as WebBackendBridge));
});

let metadataFixtureSequence=0;
async function metadataBridgeFixture(run:(owner:typeof import('./web-backend-bridge'),metadata:typeof import('./backend-web-transfer-admission'),input:import('./web-backend-bridge').WebBackendBridgeInput,guard:unknown,state:{captures:number;refreshes:number;disposes:number;invalid:boolean;admission:Record<string,unknown>})=>Promise<void>,handoff:'customer-candidate'|'operating-staging'='customer-candidate'){
 const filename=resolve(import.meta.dirname,'backend-web-transfer-admission.ts'),source=readFileSync(filename,'utf8'),ast=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const names=['fail','sha','digest','identifier','positive','inputSchema','completedMetadataGuards','consumeCompletedBackendWebTransferMetadataGuard','readCompletedBackendWebTransferMetadataAndGuard'];
 const declarations=names.map(name=>{const matching=ast.statements.flatMap(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name?[node.getText(ast)]:ts.isVariableStatement(node)?node.declarationList.declarations.filter(declaration=>ts.isIdentifier(declaration.name)&&declaration.name.text===name).map(declaration=>'const '+declaration.getText(ast)+';'):[]);assert.equal(matching.length,1,'one actual metadata owner '+name);return matching[0];}).join('\n');
 const key='webBridgeMetadata'+(++metadataFixtureSequence),clock=Date.now(),fixture=backendWebTransferFixture(),admitted=validateBackendWebTransfer(fixture.transfer,fixture.now);
 const input={selection:{...(handoff==='operating-staging'?{handoff}:{}),backendRunId:'51',backendRunAttempt:1,artifactId:'71',transferSha256:'c'.repeat(64)},repoRoot:'G:/Cuevo-workspaces/controlled-bridge',githubToken:'private-bridge-token',releaseSha:'a'.repeat(40),ciRunId:'31',environment:'staging',web:{teamId:'team_Cuevo',projectId:'prj_Web',target:'preview' as const}};
 const admission={purpose:handoff==='operating-staging'?'OPERATING_BACKEND_WEB_HANDOVER_CONSUMPTION':'COMPLETED_BACKEND_WEB_HANDOVER_CONSUMPTION',provenance:'OFFICIAL_COMPLETED_GITHUB_ARTIFACT_AND_VERIFIED_GIT_SOURCE',manifest:admitted.manifest,publicConfig:admitted.publicConfig,reviewFacts:admitted.reviewFacts,assignments:admitted.assignments,originalEvidence:fixture.transfer.evidence,backendIdentity:{...admitted.body,repository:'owner/repo',sourceSha:input.releaseSha,treeSha:'b'.repeat(40),baseSha:'d'.repeat(40),ciRunId:input.ciRunId,runId:'51',runAttempt:1,artifactId:'71',transferSha256:input.selection.transferSha256,web:{...input.web,origin:'https://controlled.vercel.app'},consumptionExpiresAt:new Date(clock+180000).toISOString()},observedAt:new Date(clock).toISOString(),privateProofReexecuted:false,backendMutationAllowed:false,customerReady:false,hostedAcceptance:false};
 const state={captures:0,refreshes:0,disposes:0,invalid:false,admission:admission as Record<string,unknown>};
 Object.assign(globalThis,{[key]:{z,types,canonicalReleaseExecutionJson,capture:async(raw:Record<string,unknown>)=>{state.captures++;return{input:{handoff,...raw},admission,deadlineAtMs:clock+180000,capture:{dispose:()=>{state.disposes++;},assertOriginalValidity:()=>{if(state.invalid)throw Error('Controlled original invalid');},refresh:async()=>{state.refreshes++;if(state.invalid)throw Error('Controlled original invalid');}}};}}});
 const metadataUrl=new URL('./backend-web-transfer-admission.ts?'+key,import.meta.url).href,bridgeUrl=new URL('./web-backend-bridge.ts?'+key,import.meta.url).href;
 const hook=registerHooks({load(url,context,next){
  if(url===metadataUrl)return{format:'module',shortCircuit:true,source:transformSync('const {z,types,canonicalReleaseExecutionJson,capture:readCompletedBackendCapture}=globalThis.'+key+';\n'+declarations+"\nexport async function readCompletedBackendWebTransferAdmission(){throw Error('No fresh bridge capture');}export async function readCompletedBackendWebTransferAdmissionAndGuard(){throw Error('No fresh bridge token');}export function disposeCompletedBackendCanonical(){throw Error('No borrowed token disposal');}",{loader:'ts',format:'esm',target:'es2023'}).code};
  if(url===bridgeUrl)return{format:'module',shortCircuit:true,source:transformSync(readFileSync(resolve(import.meta.dirname,'web-backend-bridge.ts'),'utf8').replace("from './backend-web-transfer-admission'",`from './backend-web-transfer-admission.ts?${key}'`),{loader:'ts',format:'esm',target:'es2023'}).code};
  return next(url,context);
 }});
 try{const metadata=await import(metadataUrl) as typeof import('./backend-web-transfer-admission'),owner=await import(bridgeUrl) as typeof import('./web-backend-bridge');const guard=await metadata.readCompletedBackendWebTransferMetadataAndGuard({repoRoot:input.repoRoot,githubToken:input.githubToken,releaseSha:input.releaseSha,ciRunId:input.ciRunId,...input.selection,web:input.web});await run(owner,metadata,input,guard,state);}
 finally{hook.deregister();delete(globalThis as Record<string,unknown>)[key];}
}

test('borrowed bridge consumes authentic current metadata without capture refresh disposal or token output',async()=>{
 for(const handoff of ['customer-candidate','operating-staging'] as const)await metadataBridgeFixture(async(owner,metadata,input,guard,state)=>{
  assert.equal(typeof owner.readWebBackendBridgeFromMetadataGuard,'function','borrowed metadata bridge API is missing');
  const bridge=owner.readWebBackendBridgeFromMetadataGuard(guard,input);assert(!(bridge instanceof Promise));assert.equal(bridge.purpose,handoff==='operating-staging'?'OPERATING_BACKEND_WEB_HANDOVER_CONSUMPTION':'COMPLETED_BACKEND_WEB_HANDOVER_CONSUMPTION');
  assert.equal(state.captures,1);assert.equal(state.refreshes,0);assert.equal(state.disposes,0);assert.equal(Object.hasOwn(bridge,'observedAt'),false);assert.equal(Object.hasOwn(bridge,'token'),false);assert.doesNotMatch(JSON.stringify(bridge),/private-bridge-token|githubToken/);
  bridge.backendIdentity.sourceSha='f'.repeat(40);(bridge.manifest as {version:number}).version=999;
  const second=owner.readWebBackendBridgeFromMetadataGuard(guard,input);assert.equal(second.backendIdentity.sourceSha,input.releaseSha);assert.equal((second.manifest as {version:number}).version,(state.admission.manifest as {version:number}).version);
  const {githubToken:unused,...binding}=input;void unused;assert.equal(metadata.consumeCompletedBackendWebTransferMetadataGuard(guard,{handoff:input.selection.handoff??'customer-candidate',repoRoot:binding.repoRoot,releaseSha:binding.releaseSha,ciRunId:binding.ciRunId,...input.selection,web:binding.web}),guard);
 },handoff);
});

test('borrowed bridge rejects forged copied proxied and accessor guards without evaluating traps or acquiring new evidence',async()=>{await metadataBridgeFixture(async(owner,_metadata,input,guard,state)=>{
 assert.equal(typeof owner.readWebBackendBridgeFromMetadataGuard,'function');let traps=0;const proxy=new Proxy(guard as object,{get(){traps++;throw Error('private trap');},ownKeys(){traps++;throw Error('private trap');}}),getter={get admission(){traps++;return state.admission;}};
 for(const falseGuard of [{},null,{...(guard as object)},Object.create(guard as object),proxy,getter])assert.throws(()=>owner.readWebBackendBridgeFromMetadataGuard(falseGuard,input),/contents withheld/);
 assert.equal(traps,0);assert.equal(state.captures,1);assert.equal(state.refreshes,0);assert.equal(state.disposes,0);assert.doesNotThrow(()=>owner.readWebBackendBridgeFromMetadataGuard(guard,input));
});});

test('borrowed bridge binds all selected source run purpose and web fields and refuses production before new evidence',async()=>{
 for(const field of ['repoRoot','releaseSha','ciRunId','backendRunId','backendRunAttempt','artifactId','transferSha256','handoff','teamId','projectId','target','environment'])await metadataBridgeFixture(async(owner,_metadata,input,guard,state)=>{
  assert.equal(typeof owner.readWebBackendBridgeFromMetadataGuard,'function');const changed=structuredClone(input);
  if(field==='repoRoot')changed.repoRoot+='-other';else if(field==='releaseSha')changed.releaseSha='b'.repeat(40);else if(field==='ciRunId')changed.ciRunId='32';else if(field==='environment')changed.environment='production';else if(field==='target')changed.web.target='production';else if(field==='teamId'||field==='projectId')changed.web[field]+='Other';else if(field==='handoff')changed.selection.handoff='operating-staging';else if(field==='backendRunAttempt')changed.selection.backendRunAttempt=2;else changed.selection[field as 'backendRunId'|'artifactId'|'transferSha256']=field==='transferSha256'?'d'.repeat(64):'52';
  assert.throws(()=>owner.readWebBackendBridgeFromMetadataGuard(guard,changed),/contents withheld/);assert.equal(state.captures,1);assert.equal(state.refreshes,0);assert.equal(state.disposes,0);
 });
});

test('borrowed bridge refuses invalidated metadata and never disposes its owner',async()=>{await metadataBridgeFixture(async(owner,_metadata,input,guard,state)=>{
 assert.equal(typeof owner.readWebBackendBridgeFromMetadataGuard,'function');state.invalid=true;assert.throws(()=>owner.readWebBackendBridgeFromMetadataGuard(guard,input),/contents withheld/);assert.equal(state.disposes,0);assert.equal(state.captures,1);assert.equal(state.refreshes,0);
});});
