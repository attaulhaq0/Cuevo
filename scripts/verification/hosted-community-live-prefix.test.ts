import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { canonicalReleaseExecutionJson } from './release-review';
import { createHash } from 'node:crypto';

const hash=(value:unknown)=>createHash('sha256').update(canonicalReleaseExecutionJson(value)).digest('hex');
const identity={projectRef:'abcdefghijklmnopqrst',schoolId:'10000000-0000-4000-8000-000000000001',sourceSha:'a'.repeat(40),treeSha:'b'.repeat(40),ciRunId:'71',runId:'81',runAttempt:2,backendTransferSha256:'c'.repeat(64),webDeploymentId:'dpl_Web'};
async function fixture(run:(owner:typeof import('./hosted-community-live-prefix'),state:ReturnType<typeof setup>)=>Promise<void>){
  const state=setup(),key='prefix_'+Date.now()+'_'+Math.random().toString(16).slice(2);Object.assign(globalThis,{[key]:state});
  const hooks=registerHooks({resolve(specifier,context,next){if(specifier.endsWith('hosted-community-live-prefix.ts?'+key))return{url:new URL(specifier,context.parentURL).href,shortCircuit:true};return next(specifier,context);},load(url,context,next){
    if(url.endsWith('hosted-community-live-prefix.ts?'+key)){
      let source:string;try{source=readFileSync(new URL(url.split('?')[0]),'utf8');}catch{source='export const implementationMissing=true;';}
      source=source.replace(/from '(\.\/[^']+|\.\.\/database\/[^']+)'/g,(_match,path)=>`from '${path}.ts?${key}'`);
      return{format:'module',shortCircuit:true,source:transformSync(source,{loader:'ts',format:'esm'}).code};
    }
    const f=`globalThis.${key}`;
    if(url.endsWith('hosted-acceptance-context.ts?'+key))return{format:'module',shortCircuit:true,source:`export function consumeHostedAcceptanceContext(v){const f=${f};if(v!==f.context||f.invalid)throw Error('forged context');f.events.push('consume');return v;}`};
    if(url.endsWith('backend-hosted-browser.ts?'+key))return{format:'module',shortCircuit:true,source:`export function requireHostedBrowserRunner(root,sha){const f=${f};if(root!=='/home/runner/work/repo/repo'||sha!==f.context.identity.sourceSha)throw Error('wrong root');return f.context.runner;}`};
    if(url.endsWith('hosted-browser-evidence.ts?'+key))return{format:'module',shortCircuit:true,source:`export async function readHostedBrowserCompanionSnapshot(v,e){const f=${f};f.events.push('files');if(v!==f.writer||f.fileChanged)throw Error('original files changed');return new Map();}`};
    if(url.endsWith('backend-hosted-community-artifact.ts?'+key))return{format:'module',shortCircuit:true,source:`export function prepareHostedCommunityLivePrefix(v){const f=${f};if(v.identity.runId!==f.context.identity.runId)throw Error('wrong run');const snapshot={version:1,purpose:'CUEVO_HOSTED_COMMUNITY_LIVE_PREFIX',...v,nativeExecutionVerified:false,hostedAcceptance:false,customerReady:false};return{snapshot,selection:{identity:{...v.identity,evidenceSource:'LIVE_PREFIX',prefixSnapshotSha256:f.hash(snapshot),journalHeadSha256:v.journal.lastRecordSha256,companionInventorySha256:f.hash(v.companions)},mode:'LIVE_PREFIX',scope:v.scope,originals:Array(15).fill({})}};}`};
    if(url.endsWith('hosted-community-native.ts?'+key))return{format:'module',shortCircuit:true,source:`export function validateHostedCommunityLivePrefixEvidence(){const f=${f};f.events.push('validate');return{status:f.nativeInvalid?'REQUIRES_REVIEW':'LIVE_PREFIX_VERIFIED',classRoomId:'93000000-0000-4000-8000-000000000999',commands:[]};}`};
    if(url.endsWith('hosted-community-delivery.ts?'+key))return{format:'module',shortCircuit:true,source:`export function validateHostedCommunityDelivery(){const f=${f};f.events.push('delivery');return{status:f.deliveryInvalid?'REQUIRES_REVIEW':'DELIVERY_CORRELATED',eventIds:['93000000-0000-4000-8000-000000000004'],hostedAcceptance:false,nativeExecutionVerified:false};}`};
    if(url.endsWith('hosted-migration-provider.ts?'+key))return{format:'module',shortCircuit:true,source:`export async function readHostedMigrationProvider(){const f=${f};f.events.push('provider');return{projectRef:f.endpoint.projectRef,sessionEndpoint:f.endpoint};}`};
    if(url.endsWith('hosted-migration-database.ts?'+key))return{format:'module',shortCircuit:true,source:`export async function createHostedMigrationDatabase(v){const f=${f};f.events.push('database');f.databaseInput=v;if(!v.certificate.path.replaceAll(String.fromCharCode(92),'/').startsWith(v.repoRoot+'/.local/hosted-release/'))throw Error('Unsupported native certificate path');return{readCommunityNativeEvidence:async s=>{f.events.push('native');f.nativeCalls++;await f.nativeHook?.();if(f.nativeThrows)throw Error('read failed');return{identity:s.identity,current:{},commands:[]};}};}`};
    if(url.endsWith('hosted-native-ca.ts?'+key))return{format:'module',shortCircuit:true,source:`export async function prepareHostedNativeCa(v){const f=${f};f.events.push('ca');f.caInput=v;return f.ca;}export function consumeHostedNativeCa(v){const f=${f};if(v!==f.ca||f.caChanged)throw Error('changed CA');return{path:f.caInput.directory+'/'+f.caInput.filename,sha256:'d'.repeat(64)};}export async function retireHostedNativeCa(v){const f=${f};f.events.push('retire');f.retireCalls++;await f.cleanupHook?.();if(v!==f.ca||f.cleanupFailure)throw Error('cleanup failure');}`};
    return next(url,context);
  }});
  const clock=testClock(state);
  try{const owner=await import(new URL('./hosted-community-live-prefix.ts?'+key,import.meta.url).href) as typeof import('./hosted-community-live-prefix');await run(owner,state);}
  finally{hooks.deregister();clock();delete(globalThis as Record<string,unknown>)[key];}
}
function setup(){
  const state={events:[]as string[],invalid:false,fileChanged:false,caChanged:false,nativeInvalid:false,nativeThrows:false,cleanupFailure:false,deliveryInvalid:false,clock:Date.now(),reads:0,nativeCalls:0,retireCalls:0,nativeHook:undefined as undefined|(()=>Promise<void>),cleanupHook:undefined as undefined|(()=>Promise<void>),databaseInput:undefined as unknown,caInput:undefined as unknown,hash,writer:async(_name:string,value:unknown)=>hash(value),ca:Object.freeze({}),endpoint:{projectRef:identity.projectRef,kind:'session-pooler',host:'aws-1-ap-southeast-1.pooler.supabase.com',port:5432,database:'postgres'},context:null as unknown,input:{identity,scope:{group:{id:'93000000-0000-4000-8000-000000000001'}},journal:{lastRecordSha256:'e'.repeat(64)},commands:Array(15).fill({}),companions:[]}};
  state.context=Object.freeze({identity,runner:{repository:'owner/repo',runId:'81',runAttempt:2},originalWeb:{runId:'81',runAttempt:2},backendIdentity:{sourceSha:identity.sourceSha},dispose:()=>{state.invalid=true;},assertOriginalValidity:()=>{if(state.invalid)throw Error('invalid');},readmit:async()=>{state.events.push('readmit');if(state.invalid)throw Error('invalid');}});return state;
}
function testClock(state:ReturnType<typeof setup>){const original=Date.now;Date.now=()=>state.clock;return()=>{Date.now=original;};}
function input(state:ReturnType<typeof setup>):Parameters<typeof import('./hosted-community-live-prefix').verifyHostedCommunityLivePrefix>[0]{
  // These controlled ports deliberately carry incomplete provider/native facts;
  // the actual-owner fixture above supplies them and cannot certify hosted state.
  return{context:state.context as import('./hosted-acceptance-context').HostedAcceptanceContext,writer:state.writer,repoRoot:'/home/runner/work/repo/repo',capture:async()=>{state.events.push('capture');state.reads++;return structuredClone(state.input) as unknown as import('./backend-hosted-community-artifact').HostedCommunityLivePrefixInput;},delivery:{invalidations:[],rereads:[]},providerToken:'p'.repeat(24),databasePassword:'s'.repeat(32),databaseCa:'-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----'};
}
test('live native proof needs current opaque context and genuine fixed original snapshot before retirement',async()=>{await fixture(async(owner,state)=>{
  assert.equal(typeof owner.verifyHostedCommunityLivePrefix,'function','live proof owner is required');
  const proof=await owner.verifyHostedCommunityLivePrefix(input(state));assert.equal(state.nativeCalls,1);assert.equal(state.retireCalls,1);assert.equal(state.reads,2);
  const expected={identity,prefixSnapshotSha256:hash({version:1,purpose:'CUEVO_HOSTED_COMMUNITY_LIVE_PREFIX',...state.input,nativeExecutionVerified:false,hostedAcceptance:false,customerReady:false}),journalHeadSha256:state.input.journal.lastRecordSha256};
  const receipt=owner.consumeHostedCommunityLivePrefixProof(proof,expected);assert.equal(receipt.status,'LIVE_PREFIX_NATIVE_VERIFIED');assert.equal(receipt.sessionsClosed,true);assert.equal(receipt.readOnly,true);assert.equal(receipt.hostedAcceptance,false);
  assert.doesNotMatch(JSON.stringify(receipt),/ssssssss|pppppppp|CERTIFICATE/);assert.throws(()=>owner.consumeHostedCommunityLivePrefixProof(proof,expected),'One proof has one consumer');
});});
test('forged contexts, conflicting original bytes or native state, late admission and uncertain CA cleanup create no usable proof',async()=>{
  for(const mode of ['forged','journal','files','native','expiry','ca','cleanup','read-failure'])await fixture(async(owner,state)=>{
    assert.equal(typeof owner.verifyHostedCommunityLivePrefix,'function');const value=input(state);
    if(mode==='forged')value.context={...state.context as object} as import('./hosted-acceptance-context').HostedAcceptanceContext;
    state.nativeHook=async()=>{if(mode==='journal')state.input.journal.lastRecordSha256='f'.repeat(64);if(mode==='files')state.fileChanged=true;if(mode==='native')state.nativeInvalid=true;if(mode==='expiry')state.clock+=30000;if(mode==='ca')state.caChanged=true;if(mode==='cleanup')state.cleanupFailure=true;if(mode==='read-failure')state.nativeThrows=true;};
    await assert.rejects(owner.verifyHostedCommunityLivePrefix(value),mode);
    assert.equal(state.nativeCalls,mode==='forged'?0:1);assert.equal(state.retireCalls,mode==='forged'?0:1);
  });
});
test('proof substitution, copied or proxied proof, wrong original tuple and revoked context cannot authorize retirement',async()=>{
  for(const mode of ['copy','proxy','wrong','revoked'])await fixture(async(owner,state)=>{
    assert.equal(typeof owner.verifyHostedCommunityLivePrefix,'function');const proof=await owner.verifyHostedCommunityLivePrefix(input(state)),expected={identity,prefixSnapshotSha256:hash({version:1,purpose:'CUEVO_HOSTED_COMMUNITY_LIVE_PREFIX',...state.input,nativeExecutionVerified:false,hostedAcceptance:false,customerReady:false}),journalHeadSha256:state.input.journal.lastRecordSha256};
    if(mode==='revoked')state.invalid=true;if(mode==='wrong')expected.identity={...identity,runAttempt:3};
    assert.throws(()=>owner.consumeHostedCommunityLivePrefixProof(mode==='copy'?{...proof}:mode==='proxy'?new Proxy(proof,{}):proof,expected));
  });
});
test('wrong workspace refuses before provider reads and overlapping live reads poison both instead of releasing another owner lock',async()=>{
  await fixture(async(owner,state)=>{const value=input(state);value.repoRoot='/home/runner/work/foreign/foreign';await assert.rejects(owner.verifyHostedCommunityLivePrefix(value));assert.equal(state.nativeCalls,0);});
  await fixture(async(owner,state)=>{let entered!:()=>void,release!:()=>void;const began=new Promise<void>(done=>entered=done),wait=new Promise<void>(done=>release=done);state.nativeHook=async()=>{entered();await wait;};const first=owner.verifyHostedCommunityLivePrefix(input(state));await began;await assert.rejects(owner.verifyHostedCommunityLivePrefix(input(state)));release();await assert.rejects(first);assert.equal(state.nativeCalls,1);assert.equal(state.retireCalls,1);});
});
test('backward wall-clock movement cannot extend native verification or revive an issued proof',async()=>{
  await fixture(async(owner,state)=>{const first=state.clock;state.nativeHook=async()=>{state.clock=first+29000;};state.cleanupHook=async()=>{state.clock=first+1000;};await assert.rejects(owner.verifyHostedCommunityLivePrefix(input(state)));});
  await fixture(async(owner,state)=>{const proof=await owner.verifyHostedCommunityLivePrefix(input(state)),expected={identity,prefixSnapshotSha256:hash({version:1,purpose:'CUEVO_HOSTED_COMMUNITY_LIVE_PREFIX',...state.input,nativeExecutionVerified:false,hostedAcceptance:false,customerReady:false}),journalHeadSha256:state.input.journal.lastRecordSha256};state.clock--;assert.throws(()=>owner.consumeHostedCommunityLivePrefixProof(proof,expected));});
});
test('original writer and capture callbacks remain fixed through awaited native verification and cannot be substituted',async()=>{await fixture(async(owner,state)=>{
  const value=input(state),published:string[]=[];const original=state.writer;state.writer=async(name:string,body:unknown)=>{published.push(name);return original(name,body);};value.writer=state.writer;
  state.cleanupHook=async()=>{value.writer=async()=>{throw Error('substituted writer');};value.capture=async()=>{throw Error('substituted capture');};value.repoRoot='/foreign';};
  await owner.verifyHostedCommunityLivePrefix(value);assert.deepEqual(published,['prefix-snapshot.json','prefix-proof.json']);
});});
test('an unmatched delivered update and native post source cannot release retirement proof',async()=>{await fixture(async(owner,state)=>{
  state.deliveryInvalid=true;await assert.rejects(owner.verifyHostedCommunityLivePrefix(input(state)));assert.equal(state.nativeCalls,1);assert.equal(state.retireCalls,1);
});});
test('live retirement proof retains the native fixed-class room instead of caller agreement',async()=>{await fixture(async(owner,state)=>{
 const proof=await owner.verifyHostedCommunityLivePrefix(input(state)),expected={identity,prefixSnapshotSha256:hash({version:1,purpose:'CUEVO_HOSTED_COMMUNITY_LIVE_PREFIX',...state.input,nativeExecutionVerified:false,hostedAcceptance:false,customerReady:false}),journalHeadSha256:state.input.journal.lastRecordSha256};
 const receipt=owner.consumeHostedCommunityLivePrefixProof(proof,expected);assert.equal(receipt.classRoomId,'93000000-0000-4000-8000-000000000999');
});});
