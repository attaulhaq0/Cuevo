import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import { transformSync } from 'esbuild';
import { canonicalReleaseExecutionJson } from './release-review';
import { z } from 'zod';
import ts from 'typescript';
import { runInNewContext } from 'node:vm';
import { validateVercelDeployment, vercelTarget } from './cicd-contracts';

async function api(){let value:Record<string,unknown>={};try{value=await import(pathToFileURL(resolve(import.meta.dirname,'hosted-acceptance-context.ts')).href);}catch(error){if((error as NodeJS.ErrnoException).code!=='ERR_MODULE_NOT_FOUND')throw error;}assert.equal(typeof value.prepareHostedAcceptanceContext,'function','Common current guarded hosted admission is required');return value as typeof import('./hosted-acceptance-context');}
const now=Date.now(),current={purpose:'PREBUILD_RELEASE_ADMISSION' as const,sourceSha:'a'.repeat(40),treeSha:'b'.repeat(40),ciRunId:'31',runId:'81',runAttempt:2,webDeploymentId:'dpl_Web',artifactSha256:'e'.repeat(64),packageSha256:'f'.repeat(64),webPackageExpiresAt:new Date(now+60000).toISOString(),backendTransferSha256:'d'.repeat(64),populationReceiptSha256:'c'.repeat(64),apiOrigin:'https://api.fixture.invalid',authOrigin:'https://auth.fixture.invalid',webOrigin:'https://web.fixture.invalid',observedAt:new Date(now).toISOString()};
test('common web tuple validates original expiry and rejects changes and stale freshness',async()=>{const owner=await api(),expected={...current,consumptionExpiresAt:new Date(now+60000).toISOString()};assert.deepEqual(owner.validateHostedAcceptanceWebAdmission(current,expected,now),current);for(const change of [{artifactSha256:'a'.repeat(64)},{populationReceiptSha256:'a'.repeat(64)},{webPackageExpiresAt:new Date(now+120000).toISOString()},{observedAt:new Date(now-30001).toISOString()},{observedAt:new Date(now+1).toISOString()},{apiOrigin:'https://foreign.invalid'}])assert.throws(()=>owner.validateHostedAcceptanceWebAdmission({...current,...change},expected,now),/requires review/);assert.throws(()=>owner.validateHostedAcceptanceWebAdmission(current,{...expected,consumptionExpiresAt:new Date(now).toISOString()},now));});
test('local or forged admission fails before a trusted web owner callback or hosted request',async()=>{const owner=await api();let calls=0;await assert.rejects(owner.prepareHostedAcceptanceContext({}, {readmitWeb:async()=>{calls++;return current;},backendGuard:{admission:{backendIdentity:{sourceSha:current.sourceSha}},assertOriginalValidity:()=>{},refreshOriginalMetadata:async()=>{},dispose:()=>{}} as never}));assert.equal(calls,0);});

const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
let fixtureSequence=0;
type ContextFixtureState={guard:unknown;refreshes:number;disposed:number;web:typeof current;backend:Record<string,unknown>;wait?:()=>Promise<void>;ownerExpires:number;clock:number;webCalls:number;acquisitions:number;providerReads:string[];deployment:Record<string,unknown>;alias:Record<string,unknown>;providerStatus:number};
/** Controlled owner ports exercise this consumer's checks only. The existing
 * transfer/academic tests retain the actual Git, ZIP and opaque guard owners. */
async function fixture(context:TestContext,run:(owner:typeof import('./hosted-acceptance-context'),input:import('./hosted-acceptance-context').HostedAcceptanceInput,state:ContextFixtureState)=>Promise<void>,descriptors=false){
 const root=await mkdtemp(join(tmpdir(),'cuevo-hosted-context-')),clock=Date.now(),id=++fixtureSequence,key='hostedContextFixture'+id;
 const input={repoRoot:root,releaseSha:current.sourceSha,ciRunId:'31',backendRunId:'51',backendRunAttempt:1,artifactId:'71',transferSha256:current.backendTransferSha256,populationReceiptSha256:current.populationReceiptSha256,web:{teamId:'team_Cuevo',projectId:'prj_Web',target:'preview' as const},webDeployment:{id:'dpl_Web',url:'https://exact.vercel.app'},githubToken:'private-github',vercelToken:'private-vercel-token-12345'};
 const publicConfig={apiUrl:current.apiOrigin,supabaseUrl:'https://mqxdjvsyckzocokuikmx.supabase.co',supabasePublishableKey:'sb_publishable_fixture123456'};
 const backend={repository:'owner/repo',sourceSha:current.sourceSha,treeSha:current.treeSha,ciRunId:'31',runId:'51',runAttempt:1,artifactId:'71',transferSha256:current.backendTransferSha256,web:{...input.web,origin:current.webOrigin},settingsSha256:hash(canonicalReleaseExecutionJson({NEXT_PUBLIC_API_URL:publicConfig.apiUrl,NEXT_PUBLIC_SUPABASE_URL:publicConfig.supabaseUrl,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:publicConfig.supabasePublishableKey})),consumptionExpiresAt:new Date(clock+300000).toISOString()};
 const admission={purpose:'COMPLETED_BACKEND_WEB_HANDOVER_CONSUMPTION',provenance:'OFFICIAL_COMPLETED_GITHUB_ARTIFACT_AND_VERIFIED_GIT_SOURCE',backendIdentity:backend,manifest:{version:2,environment:'staging',commitSha:current.sourceSha,database:{projectRef:'mqxdjvsyckzocokuikmx'},publicConfig},publicConfig:descriptors?{...publicConfig,api:{kind:'vercel'},worker:{kind:'supabase-edge'}}:publicConfig,populationEvidence:{receiptSha256:current.populationReceiptSha256}};
 const original=canonicalReleaseExecutionJson(admission),state:ContextFixtureState={guard:{} as unknown,refreshes:0,disposed:0,web:{...current,authOrigin:publicConfig.supabaseUrl,observedAt:new Date(clock).toISOString(),webPackageExpiresAt:new Date(clock+300000).toISOString()},backend,ownerExpires:clock+180000,clock,webCalls:0,acquisitions:0,wait:undefined,providerReads:[],deployment:{id:'dpl_Web',projectId:'prj_Web',ownerId:'team_Cuevo',url:'exact.vercel.app',readyState:'READY',target:'preview',meta:{cuevoCommitSha:current.sourceSha}},alias:{alias:new URL(current.webOrigin).hostname,projectId:'prj_Web',deploymentId:'dpl_Web',redirect:null},providerStatus:200};
 const binding={...input};const assertOwner=()=>{if(state.disposed||state.clock>=state.ownerExpires||canonicalReleaseExecutionJson(admission)!==original)throw Error('Controlled owner invalid');};
 state.guard=Object.freeze({admission,assertOriginalValidity:assertOwner,refreshOriginalMetadata:async()=>{state.refreshes++;assertOwner();await state.wait?.();assertOwner();},dispose:()=>{state.disposed++;}});
 const hostedFixture={state,guard:state.guard,assertOwner,binding};Object.assign(globalThis,{[key]:hostedFixture});
 const hooks=registerHooks({load(url,loadContext,next){
  if(url.endsWith('backend-web-transfer-admission.ts?'+key))return{format:'module',shortCircuit:true,source:`const f=globalThis.${key};export function consumeCompletedBackendWebTransferMetadataGuard(v,selection){if(v!==f.guard)throw Error('Forged controlled guard');const expected={repoRoot:f.binding.repoRoot,releaseSha:f.binding.releaseSha,ciRunId:f.binding.ciRunId,backendRunId:f.binding.backendRunId,backendRunAttempt:f.binding.backendRunAttempt,artifactId:f.binding.artifactId,transferSha256:f.binding.transferSha256,web:f.binding.web};if(JSON.stringify(selection)!==JSON.stringify(expected))throw Error('Changed controlled binding');f.assertOwner();return v;}export async function readCompletedBackendWebTransferMetadataAndGuard(){f.state.acquisitions++;f.assertOwner();return f.guard;}export function requireCompletedBackendPopulationEvidence(value){return value.populationEvidence;}const markers=new WeakMap();export function captureCompletedBackendMetadataRefresh(v,selection){consumeCompletedBackendWebTransferMetadataGuard(v,selection);const marker=Object.freeze({});markers.set(marker,{v,revision:f.state.refreshes});return marker;}export async function ensureCompletedBackendMetadataRefresh(v,selection,marker){consumeCompletedBackendWebTransferMetadataGuard(v,selection);const owned=markers.get(marker);if(!owned||owned.v!==v)throw Error('Forged refresh marker');markers.delete(marker);if(f.state.refreshes===owned.revision)await v.refreshOriginalMetadata();consumeCompletedBackendWebTransferMetadataGuard(v,selection);}`};
  if(url.endsWith('backend-hosted-browser.ts?'+key))return{format:'module',shortCircuit:true,source:`export function requireHostedBrowserRunner(){return{repository:'owner/repo',runId:'81',runAttempt:2};}`};
  if(url.endsWith('hosted-acceptance-context.ts?'+key)){const source=readFileSync(new URL(url.split('?')[0]),'utf8').replace("from './backend-web-transfer-admission'",`from './backend-web-transfer-admission.ts?${key}'`).replace("from './backend-hosted-browser'",`from './backend-hosted-browser.ts?${key}'`);return{format:'module',shortCircuit:true,source:transformSync(source,{loader:'ts',format:'esm'}).code};}
  return next(url,loadContext);
 }});
 const clockMock=context.mock.method(Date,'now',()=>state.clock),fetchMock=context.mock.method(globalThis,'fetch',async(raw:unknown,options?:RequestInit)=>{
  const url=new URL(String(raw));if(url.origin==='https://api.vercel.com'){assert.equal(new Headers(options?.headers).get('authorization'),'Bearer '+input.vercelToken);assert.equal(options?.method??'GET','GET');state.providerReads.push(url.pathname+url.search);return Response.json(url.pathname.includes('/deployments/')?state.deployment:state.alias,{status:state.providerStatus});}
  assert.equal(url.href,current.webOrigin+'/api/testing/quick-login');return Response.json({available:false},{status:options?.method==='POST'?404:200});
 });
 try{await mkdir(join(root,'supabase/seed'),{recursive:true});await writeFile(join(root,'supabase/seed/identities.json'),await readFile(resolve(import.meta.dirname,'../../supabase/seed/identities.json')));const owner=await import(new URL('./hosted-acceptance-context.ts?'+key,import.meta.url).href) as typeof import('./hosted-acceptance-context');await run(owner,input,state);}
 finally{hooks.deregister();clockMock.mock.restore();fetchMock.mock.restore();delete (globalThis as Record<string,unknown>)[key];assert.equal(dirname(root),resolve(tmpdir()));await rm(root,{recursive:true,force:true});}
}
const ports=(state:{guard:unknown;web:typeof current;webCalls:number})=>({backendGuard:state.guard as never,readmitWeb:async()=>{state.webCalls++;return state.web;}});

/** Execute the CLI's actual saved-receipt reader and shared callback. Only
 * external approval/provider metadata use the existing controlled fixture. */
async function cliDeploymentFixture(input:import('./hosted-acceptance-context').HostedAcceptanceInput,state:ContextFixtureState){
 const file=resolve(import.meta.dirname,'cicd-release.ts'),source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
 const wanted=new Set(['files','artifactDigest','inspectSelectedDeployment','readLocalWebDeploymentReceipt','currentWebDeploymentReceipt']);
 const declarations=source.statements.filter(ts.isVariableStatement).filter(statement=>statement.declarationList.declarations.some(node=>ts.isIdentifier(node.name)&&wanted.has(node.name.text)));
 const callbacks:ts.VariableStatement[]=[];const visit=(node:ts.Node)=>{if(ts.isVariableStatement(node)&&node.declarationList.declarations.some(item=>ts.isIdentifier(item.name)&&item.name.text==='readmitWeb'))callbacks.push(node);ts.forEachChild(node,visit);};visit(source);assert.equal(callbacks.length,1);
 const output=join(input.repoRoot,'.vercel/output'),directory=join(input.repoRoot,'.local/cicd-release'),bytes=Buffer.from('Original prebuilt web artifact');await mkdir(output,{recursive:true});await mkdir(directory,{recursive:true});await writeFile(join(output,'index.html'),bytes);
 const artifactSha256=createHash('sha256').update('/index.html').update(createHash('sha256').update(bytes).digest()).digest('hex');state.web.artifactSha256=artifactSha256;
 const admitted={backend:{purpose:'COMPLETED_BACKEND_WEB_HANDOVER_CONSUMPTION',backendIdentity:state.backend},manifest:{publicConfig:{apiUrl:state.web.apiOrigin,supabaseUrl:state.web.authOrigin}},prepared:{sha256:state.web.packageSha256,canonicalJson:JSON.stringify({preparedAt:new Date(state.clock+300000-86400000).toISOString()})}};
 const receipt={version:1,purpose:'CUEVO_VERIFIED_WEB_DEPLOYMENT',status:'WEB_DEPLOYMENT_VERIFIED',repository:'owner/repo',sourceSha:input.releaseSha,ciRunId:input.ciRunId,runId:'81',runAttempt:2,environment:'staging',teamId:input.web.teamId,projectId:input.web.projectId,target:'preview',deploymentId:input.webDeployment.id,url:input.webDeployment.url,artifactSha256,manifestSha256:hash(canonicalReleaseExecutionJson(admitted.manifest)),reviewSha256:admitted.prepared.sha256,backend:state.backend,observedAt:new Date(state.clock).toISOString(),coreLearningLoopVerified:false,customerReady:false,hostedAcceptance:false};
 const save=()=>writeFile(join(directory,'web-deployment-result.json'),canonicalReleaseExecutionJson(receipt));await save();await writeFile(join(directory,'deployment.json'),canonicalReleaseExecutionJson({url:receipt.url,commitSha:receipt.sourceSha}));
 const env={RELEASE_ENVIRONMENT:'staging',RELEASE_SHA:input.releaseSha,CI_RUN_ID:input.ciRunId,GITHUB_RUN_ID:'81',GITHUB_RUN_ATTEMPT:'2',GITHUB_REPOSITORY:'owner/repo',VERCEL_TOKEN:input.vercelToken};
 const body=ts.transpileModule(declarations.map(node=>node.getText(source)).join('\n')+'\nfunction makeReadmitWeb(admitted,receipt,population,retained){'+callbacks[0].getText(source)+';return readmitWeb;}\n({currentWebDeploymentReceipt,makeReadmitWeb});',{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.None}}).outputText;
 class FixtureDate extends Date{constructor(value?:string|number){super(value??state.clock);}static now(){return state.clock;}}
 const subject=runInNewContext(body,{URL,AbortSignal,Buffer,Date:FixtureDate,createHash,readFile,readdir,join,directory,resolve:(...paths:string[])=>resolve(input.repoRoot,...paths),z,canonicalReleaseReviewJson:canonicalReleaseExecutionJson,parseCanonicalReleaseReviewJson:JSON.parse,required:(key:keyof typeof env)=>env[key],webIdentity:()=>input.web,json:async(path:string)=>JSON.parse(await readFile(path,'utf8')),fetch:(...args:Parameters<typeof fetch>)=>globalThis.fetch(...args),validateVercelDeployment,vercelTarget,validateOperatingStagingHandoff:()=>{throw Error('Unexpected operating admission');},readmitApproval:async()=>{state.webCalls++;await(state.guard as {refreshOriginalMetadata:()=>Promise<void>}).refreshOriginalMetadata();return admitted;},requireCompletedBackendPopulationEvidence:()=>({receiptSha256:state.web.populationReceiptSha256})})as{currentWebDeploymentReceipt:(value:unknown)=>Promise<unknown>;makeReadmitWeb:(admission:unknown,receipt:unknown,population:unknown,retained:unknown)=>()=>Promise<import('./hosted-acceptance-context').HostedAcceptanceWebAdmission>};
 return{admitted,receipt,save,output,directory,ordinary:()=>subject.currentWebDeploymentReceipt(admitted),readmitWeb:subject.makeReadmitWeb(admitted,receipt,{receiptSha256:state.web.populationReceiptSha256},{guard:state.guard})};
}

test('actual CLI shared callback leaves one fresh deployment and alias read with the context while ordinary receipt reads still verify the provider',async context=>{await fixture(context,async(owner,input,state)=>{
 const cli=await cliDeploymentFixture(input,state),held=await owner.prepareHostedAcceptanceContext(input,{backendGuard:state.guard as never,readmitWeb:cli.readmitWeb});
 assert.deepEqual(state.providerReads,['/v13/deployments/dpl_Web?teamId=team_Cuevo','/v4/aliases/web.fixture.invalid?teamId=team_Cuevo']);assert.equal(state.refreshes,1);
 state.providerReads=[];await held.readmit();assert.deepEqual(state.providerReads,['/v13/deployments/dpl_Web?teamId=team_Cuevo','/v4/aliases/web.fixture.invalid?teamId=team_Cuevo']);assert.equal(state.refreshes,2);
 state.providerReads=[];await cli.ordinary();assert.deepEqual(state.providerReads,['/v13/deployments/dpl_Web?teamId=team_Cuevo']);
 state.deployment.meta={cuevoCommitSha:'c'.repeat(40)};await assert.rejects(cli.ordinary());held.dispose();
});});

test('actual CLI shared callback refuses changed saved receipt artifact upload source or clock before provider admission',async context=>{
 for(const mode of ['source','team','artifact','stale','future','malformed','upload','review'])await fixture(context,async(owner,input,state)=>{
  const cli=await cliDeploymentFixture(input,state);
  if(mode==='source')cli.receipt.sourceSha='c'.repeat(40);if(mode==='team')cli.receipt.teamId='team_Foreign';if(mode==='stale')cli.receipt.observedAt=new Date(state.clock-3600001).toISOString();if(mode==='future')cli.receipt.observedAt=new Date(state.clock+1).toISOString();if(mode==='review')cli.receipt.reviewSha256='c'.repeat(64);
  await cli.save();if(mode==='malformed')await writeFile(join(cli.directory,'web-deployment-result.json'),'{}');if(mode==='artifact')await writeFile(join(cli.output,'index.html'),'Changed artifact');if(mode==='upload')await writeFile(join(cli.directory,'deployment.json'),canonicalReleaseExecutionJson({url:'https://foreign.vercel.app',commitSha:input.releaseSha}));
  await assert.rejects(owner.prepareHostedAcceptanceContext(input,{backendGuard:state.guard as never,readmitWeb:cli.readmitWeb}),mode);assert.deepEqual(state.providerReads,[]);
 });
});

test('actual shared context refuses lost provider reads and deployment source target identity or alias drift after a valid local CLI receipt',async context=>{
 for(const mode of ['source','team','project','id','url','target','malformed','status','alias'])await fixture(context,async(owner,input,state)=>{
  const cli=await cliDeploymentFixture(input,state),held=await owner.prepareHostedAcceptanceContext(input,{backendGuard:state.guard as never,readmitWeb:cli.readmitWeb});state.providerReads=[];
  if(mode==='source')state.deployment.meta={cuevoCommitSha:'c'.repeat(40)};if(mode==='team')state.deployment.ownerId='team_Foreign';if(mode==='project')state.deployment.projectId='prj_Foreign';if(mode==='id')state.deployment.id='dpl_Foreign';if(mode==='url')state.deployment.url='foreign.vercel.app';if(mode==='target')state.deployment.target='production';if(mode==='malformed')state.deployment={};if(mode==='status')state.providerStatus=503;if(mode==='alias')state.alias.deploymentId='dpl_Foreign';
  await assert.rejects(held.readmit(),mode);assert.equal(state.providerReads.filter(path=>path.startsWith('/v13/deployments/')).length,1);assert.throws(()=>owner.consumeHostedAcceptanceContext(held));held.dispose();
 });
});
test('shared context retains the authenticated guard, fixed school identity and original web proof, with no writes during preparation',async context=>{await fixture(context,async(owner,input,state)=>{
 const held=await owner.prepareHostedAcceptanceContext(input,ports(state));assert.equal(held.identity.schoolId,'10000000-0000-4000-8000-000000000001');assert.equal(held.backendIdentity,state.backend);assert.equal(state.refreshes,1);
 await assert.rejects(readFile(join(input.repoRoot,'.local/cicd-release/hosted-community-ui/result.json')));
 for(let step=0;step<2;step++)await held.readmit();assert.equal(state.refreshes,3);assert.equal(state.webCalls,3);assert.deepEqual(held.originalWeb,state.web);held.dispose();assert.equal(state.disposed,0,'Borrowed guard remains caller owned after success');assert.throws(()=>held.assertOriginalValidity());
});});
test('shared readmission reuses a successful same-guard refresh performed by the web callback while ordinary callbacks still refresh once',async context=>{await fixture(context,async(owner,input,state)=>{
 const held=await owner.prepareHostedAcceptanceContext(input,{backendGuard:state.guard as never,readmitWeb:async()=>{state.webCalls++;await (state.guard as {refreshOriginalMetadata:()=>Promise<void>}).refreshOriginalMetadata();return state.web;}});
 assert.equal(state.refreshes,1,'The web callback and common context must share one native metadata refresh');
 await held.readmit();assert.equal(state.refreshes,2);held.dispose();
});});
test('current admitted API and worker descriptors remain evidence while shared public config projects only its browser fields',async context=>{await fixture(context,async(owner,input,state)=>{
 const held=await owner.prepareHostedAcceptanceContext(input,ports(state));
 assert.deepEqual(Object.keys(held.publicConfig).sort(),['apiUrl','supabasePublishableKey','supabaseUrl']);held.dispose();
},true);});
test('forged, changed original web or backend bytes, and expired retained capture poison the context',async context=>{
 for(const mode of ['forged','web','backend','expiry'])await fixture(context,async(owner,input,state)=>{
  if(mode==='forged'){await assert.rejects(owner.prepareHostedAcceptanceContext(input,{...ports(state),backendGuard:structuredClone({admission:state.backend}) as never}));assert.equal(state.webCalls,0);return;}
  const held=await owner.prepareHostedAcceptanceContext(input,ports(state));if(mode==='web')state.web={...state.web,packageSha256:'a'.repeat(64)};if(mode==='backend')state.backend.sourceSha='c'.repeat(40);if(mode==='expiry')state.clock=state.ownerExpires;
  await assert.rejects(held.readmit());assert.throws(()=>held.assertOriginalValidity());assert(state.disposed>0);held.dispose();
 });
});
test('overlapping readmission refuses both calls and cannot refresh the original lifetime',async context=>{await fixture(context,async(owner,input,state)=>{
 const held=await owner.prepareHostedAcceptanceContext(input,ports(state));let entered!:()=>void,release!:()=>void;const began=new Promise<void>(done=>entered=done),wait=new Promise<void>(done=>release=done);state.wait=async()=>{entered();await wait;};
 const first=held.readmit();await began;await assert.rejects(held.readmit());release();await assert.rejects(first);assert.throws(()=>held.assertOriginalValidity());held.dispose();
});});
test('shared consumer deadline stays at its initial 180 seconds even when original proofs expire later',async context=>{await fixture(context,async(owner,input,state)=>{
 state.ownerExpires=state.clock+600000;const held=await owner.prepareHostedAcceptanceContext(input,ports(state)),start=state.clock;state.clock=start+179999;state.web={...state.web,observedAt:new Date(state.clock).toISOString()};await held.readmit();state.clock=start+180000;await assert.rejects(held.readmit());assert(state.disposed>0);held.dispose();
});});

test('mutating the exported consumer schema cannot broaden the internal admission parser',async context=>{await fixture(context,async(owner,input,state)=>{
 Object.assign(owner.hostedAcceptanceInputSchema.shape,{releaseSha:z.string()});
 await assert.rejects(owner.prepareHostedAcceptanceContext({...input,releaseSha:'foreign-source'},{readmitWeb:ports(state).readmitWeb}));
 assert.equal(state.acquisitions,0);assert.equal(state.webCalls,0);
});});

test('web owner function is captured once and accessor or proxy ports never run',async context=>{await fixture(context,async(owner,input,state)=>{
 let traps=0;const accessor={get readmitWeb(){traps++;return ports(state).readmitWeb;}};
 await assert.rejects(owner.prepareHostedAcceptanceContext(input,accessor));assert.equal(traps,0);
 const proxy=new Proxy(ports(state),{get(){traps++;throw Error('Private port trap');},ownKeys(){traps++;throw Error('Private port trap');}});
 await assert.rejects(owner.prepareHostedAcceptanceContext(input,proxy));assert.equal(traps,0);
 const original=ports(state),held=await owner.prepareHostedAcceptanceContext(input,original);original.readmitWeb=async()=>{throw Error('Replaced owner callback');};
 await held.readmit();assert.equal(state.webCalls,2);held.dispose();
});});

test('opaque context consumption requires the preparation owner registry',async()=>{
 const owner=await api();assert.equal(typeof owner.consumeHostedAcceptanceContext,'function','Only the preparation owner can authenticate a retained context reference');
 assert.throws(()=>owner.consumeHostedAcceptanceContext({}),/requires review/);
});

test('authentic same-reference context consumption survives readmission while forged copies proxies and getters never acquire authority',async context=>{await fixture(context,async(owner,input,state)=>{
 assert.equal(typeof owner.consumeHostedAcceptanceContext,'function');
 const held=await owner.prepareHostedAcceptanceContext(input,ports(state));assert(Object.isFrozen(held));
 assert.equal(owner.consumeHostedAcceptanceContext(held),held);await held.readmit();assert.equal(owner.consumeHostedAcceptanceContext(held),held);
 let traps=0;const proxy=new Proxy(held,{get(){traps++;throw Error('Private context trap');},ownKeys(){traps++;throw Error('Private context trap');},getOwnPropertyDescriptor(){traps++;throw Error('Private context trap');}});
 const accessor={get assertOriginalValidity(){traps++;return held.assertOriginalValidity;},get identity(){traps++;return held.identity;}};
 for(const forged of [null,undefined,{},Object.freeze({...held}),Object.create(held),JSON.parse(JSON.stringify(held)),proxy,accessor,{...held,assertOriginalValidity:()=>{traps++;}}])assert.throws(()=>owner.consumeHostedAcceptanceContext(forged),/requires review/);
 assert.equal(traps,0);assert.equal(state.webCalls,2);assert.equal(state.refreshes,2);assert.equal(state.disposed,0);
 assert.equal(owner.consumeHostedAcceptanceContext(held),held,'Rejecting a foreign reference cannot poison the genuine context');
 held.dispose();assert.equal(state.disposed,0,'Disposal leaves the successful borrowed guard with its caller');assert.throws(()=>owner.consumeHostedAcceptanceContext(held),/requires review/);
});});

test('changed original admission and expired capture permanently revoke opaque context consumption',async context=>{
 for(const mode of ['backend','owner-expiry','consumer-expiry'])await fixture(context,async(owner,input,state)=>{
  assert.equal(typeof owner.consumeHostedAcceptanceContext,'function');state.ownerExpires=state.clock+600000;
  const held=await owner.prepareHostedAcceptanceContext(input,ports(state)),start=state.clock,originalSource=state.backend.sourceSha;
  if(mode==='backend')state.backend.sourceSha='c'.repeat(40);else state.clock=mode==='owner-expiry'?state.ownerExpires:start+180000;
  assert.throws(()=>owner.consumeHostedAcceptanceContext(held),/requires review/);assert(state.disposed>0);
  state.clock=start;state.backend.sourceSha=originalSource;
  assert.throws(()=>owner.consumeHostedAcceptanceContext(held),/requires review/,'Restoring bytes or a clock cannot resurrect an invalidated context');
  await assert.rejects(held.readmit());held.dispose();
 });
});

test('readmission approval changes and overlapping readmission revoke the retained registry reference',async context=>{
 for(const mode of ['web','overlap'])await fixture(context,async(owner,input,state)=>{
  assert.equal(typeof owner.consumeHostedAcceptanceContext,'function');const held=await owner.prepareHostedAcceptanceContext(input,ports(state));
  if(mode==='web'){const original=state.web;state.web={...state.web,packageSha256:'a'.repeat(64)};await assert.rejects(held.readmit());state.web=original;}
  else{let entered!:()=>void,release!:()=>void;const began=new Promise<void>(done=>entered=done),wait=new Promise<void>(done=>release=done);state.wait=async()=>{entered();await wait;};const first=held.readmit();await began;assert.equal(owner.consumeHostedAcceptanceContext(held),held,'Synchronous consumption does not add a second readmission lock');await assert.rejects(held.readmit());release();await assert.rejects(first);}
  assert.throws(()=>owner.consumeHostedAcceptanceContext(held),/requires review/);held.dispose();
 });
});

test('two authentic contexts retain separate lifetimes and disposal without a global consumption lock',async context=>{await fixture(context,async(owner,input,state)=>{
 assert.equal(typeof owner.consumeHostedAcceptanceContext,'function');const first=await owner.prepareHostedAcceptanceContext(input,ports(state)),second=await owner.prepareHostedAcceptanceContext(input,ports(state));
 assert.notEqual(first,second);assert.equal(owner.consumeHostedAcceptanceContext(first),first);assert.equal(owner.consumeHostedAcceptanceContext(second),second);
 first.dispose();assert.throws(()=>owner.consumeHostedAcceptanceContext(first),/requires review/);assert.equal(state.disposed,0);assert.equal(owner.consumeHostedAcceptanceContext(second),second);
 await second.readmit();assert.equal(owner.consumeHostedAcceptanceContext(second),second);second.dispose();assert.equal(state.disposed,0);assert.throws(()=>owner.consumeHostedAcceptanceContext(second),/requires review/);
});});

test('disposing an acquired context revokes consumption and releases its own guard',async context=>{await fixture(context,async(owner,input,state)=>{
 assert.equal(typeof owner.consumeHostedAcceptanceContext,'function');const held=await owner.prepareHostedAcceptanceContext(input,{readmitWeb:ports(state).readmitWeb});assert.equal(state.acquisitions,1);assert.equal(owner.consumeHostedAcceptanceContext(held),held);
 held.dispose();assert.equal(state.disposed,1);assert.throws(()=>owner.consumeHostedAcceptanceContext(held),/requires review/);
});});
