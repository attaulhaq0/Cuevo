import { test, expect, chromium, type Browser, type BrowserContext, type Page, type Request, type Route, type TestInfo } from '@playwright/test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { build, transformSync } from 'esbuild';
import { z } from 'zod';
import { membershipSchema, idempotencyKeySchema } from '@cuevo/contracts';
import type { selectHostedCommunityActors, HostedCommunityUiResult } from '../../scripts/verification/backend-hosted-community';
import type { createHostedCommunityCommandGate } from '../../scripts/verification/hosted-community-command-gate';
import { hostedCommunityRecipeText, parseHostedCommunityCommand, requireHostedCommunityRecipeStep, reduceHostedCommunityReceipt, type HostedCommunityScope } from '../../scripts/verification/hosted-community-command';
import { selectHostedCommunityLivePrefixSelection } from '../../scripts/verification/hosted-community-native';
import { canonicalReleaseExecutionJson, canonicalReleaseReviewJson, parseReleaseExecutionJson, parseCanonicalReleaseReviewJson } from '../../scripts/verification/release-review';
import type { HostedCommunityLivePrefixSnapshot } from '../../scripts/verification/backend-hosted-community-artifact';
import type { HostedCommunityLivePrefixProofReceipt } from '../../scripts/verification/hosted-community-live-prefix';
import { emptyHostedCommunityAuxiliaryObservation, validateHostedCommunityAuxiliaryCompletion } from '../../scripts/verification/hosted-community-auxiliary';
import { validateHostedCommunityDelivery } from '../../scripts/verification/hosted-community-delivery';
import { hostedCommunityReadAllowed, hostedCommunityRequestIdentityAllowed, hostedCommunityAuxiliaryReadAllowed, hostedCommunityAuxiliaryRequestIdentityAllowed, validateHostedCommunitySocket } from '../../scripts/verification/hosted-community-transport';
import { createHostedCommunitySocketGate } from '../../scripts/verification/hosted-community-socket';
import { hostedCommandJournalContracts } from '../../scripts/verification/hosted-command-journal-contracts';
import type { HostedCommunityJournal, HostedCommunityJournalIdentity, HostedCommunityJournalCommand } from '../../scripts/verification/hosted-community-journal';
import type { HostedCommandJournalCommandState, HostedCommandJournalRecord } from '../../scripts/verification/hosted-command-journal-contracts';
import { runCustomerCommunityJourney, type CustomerCommunityJourneyPorts, type CustomerCommunityJourneyInput } from './customer-community-journey';
import { expectTrailWorkspace, openTrailWorkspace, signOutTrailWorkspace } from './trail-workspace';
import {observeCommunityView}from'./community-view-observation';
import {hostedCommunityViewStages,validateHostedCommunityViewCompletion}from'../../scripts/verification/hosted-community-view';
import { communityEn, communityAr } from '../../apps/web/features/community/messages';

// Browser plugin unavailable. The actual private wrapper is loaded by its AST,
// without changing its body. Only launch, network forwarding and cleanup ports
// are controlled. Actual Request/Response objects, Auth form, Home, Community,
// command gate and shared visible journey execute in Chrome. This fixture has
// no server/provider/database authority. The real private hook and pinned SDK
// use controlled socket responses; their protocol evidence is not hosted proof.
const root = resolve(import.meta.dirname, '../..');
const web = 'https://web-community-protocol.invalid', api = 'https://api-community-protocol.invalid', auth = 'https://auth-community-protocol.invalid';
const publishable = 'sb_publishable_community_protocol', password = 'fictional-community-protocol-password';
const seed = JSON.parse(readFileSync(resolve(root, 'supabase/seed/identities.json'), 'utf8'));
function selectActualActors(value: unknown): ReturnType<typeof selectHostedCommunityActors> {
  const filename = resolve(root, 'scripts/verification/backend-hosted-community.ts'), source = readFileSync(filename, 'utf8');
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const selected = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'selectHostedCommunityActors' || ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => ts.isIdentifier(declaration.name) && ['roles', 'actorSchema'].includes(declaration.name.text)));
  assert.equal(selected.length, 3, 'actor admission retains the actual source schema and exact selection');
  const code = transformSync(selected.map(node => node.getText(ast).replace(/^export /, '')).join('\n'), { loader: 'ts', format: 'cjs', target: 'es2023' }).code;
  return runInNewContext(code + ';selectHostedCommunityActors(value)', { value, z, fail: () => Error('Controlled actor selection refusal') });
}
const selected = selectActualActors(seed);
const actors = { ...selected, teacher: { ...selected.teacher, role: 'teacher' as const }, student: { ...selected.student, role: 'student' as const }, parent: { ...selected.parent, role: 'parent' as const }, peer: { ...selected.peer, role: 'student' as const },outsideClass:{...selected.outsideClass,role:'student' as const},foreign:{...selected.foreign,role:'student' as const} };
type FixtureActor = typeof actors.teacher | typeof actors.student | typeof actors.parent | typeof actors.peer | typeof actors.outsideClass | typeof actors.foreign;
const schoolId = seed.schoolId, classId = '30000000-0000-4000-8000-000000000001';
const classRoomId = 'ee000000-0000-4000-8000-000000000010';
const ids = (suffix: number) => 'ee000000-0000-4000-8000-' + String(suffix).padStart(12, '0');
const identity: HostedCommunityJournalIdentity = { projectRef: 'mqxdjvsyckzocokuikmx', schoolId, sourceSha: 'a'.repeat(40), treeSha: 'b'.repeat(40), ciRunId: '31', runId: '81', runAttempt: 1, backendTransferSha256: 'c'.repeat(64), webDeploymentId: 'dpl_Protocol' };
const scope: HostedCommunityScope = { synthetic: true, schoolId, classId, teacherActorId: '20000000-0000-4000-8000-000000000004', studentActorId: '20000000-0000-4000-8000-000000000012', peerActorId: '20000000-0000-4000-8000-000000000018', parentActorId: '20000000-0000-4000-8000-000000000072', group: null, postIds: [], announcement: null };
const fixtureResult = (): HostedCommunityUiResult => ({ purpose: 'CUEVO_HOSTED_COMMUNITY_UI', status: 'REQUIRES_REVIEW', sourceSha: null, runId: null, runAttempt: null, identity: null, producerSha256: null, observedAt: new Date().toISOString(), confirmedCommandCount: 0, sessionsClosed: false, unexpectedRequests: 0, consoleErrors: 0, consoleWarnings: 0, pageErrors: 0, observation: null, invalidations: [],auxiliary:emptyHostedCommunityAuxiliaryObservation(),deliveryRereads:[],failure:null,viewObservations:[], journalLastRecordSha256: null, companionManifestSha256: null, privateReconnectVerified: false, nativeChainVerified: false, referenceRestored: false, customerReady: false, hostedAcceptance: false });

function wrapperCode() {
  const filename = resolve(root, 'scripts/verification/backend-hosted-community.ts'), source = readFileSync(filename, 'utf8');
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const declarations = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'runHostedCommunityBrowser');
  assert.equal(declarations.length, 1, 'one actual private wrapper must remain the test owner');
  return { declaration:declarations[0],ast, sourceSha256: createHash('sha256').update(source).digest('hex') };
}

let loaderSequence=0;
async function loadActualDeclarations<T>(declarations:ts.Statement[],ast:ts.SourceFile,bindings:Record<string,unknown>,name:string):Promise<T>{
  const key='communityProtocolModule'+(++loaderSequence);(globalThis as Record<string,unknown>)[key]=bindings;
  const source='const {'+Object.keys(bindings).join(',')+'}=globalThis.'+key+';\n'+declarations.map(node=>node.getText(ast).replace(/^export /,'')).join('\n')+'\nexport {'+name+'};';
  const code=transformSync(source,{loader:'ts',format:'esm',target:'es2023'}).code;
  try{return(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64')))[name] as T;}finally{delete(globalThis as Record<string,unknown>)[key];}
}
async function actualPrefixParser() {
  const filename=resolve(root,'scripts/verification/backend-hosted-community-artifact.ts'),source=readFileSync(filename,'utf8');
  const ast=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const end=ast.statements.findIndex(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='prepareHostedCommunityLivePrefix');assert(end>=0);
  // Exact pure source declarations through the prefix adapter. Imports and
  // later provider readers never load during ordinary browser discovery.
  const declarations=ast.statements.slice(0,end+1).filter(node=>ts.isVariableStatement(node)||ts.isFunctionDeclaration(node));
  return loadActualDeclarations<(input:unknown,files:ReadonlyMap<string,Buffer>)=>{snapshot:HostedCommunityLivePrefixSnapshot;selection:ReturnType<typeof selectHostedCommunityLivePrefixSelection>}>(declarations,ast,{createHash,z,canonicalReleaseExecutionJson,canonicalReleaseReviewJson,parseReleaseExecutionJson,parseCanonicalReleaseReviewJson,hostedCommandJournalContracts,parseHostedCommunityCommand,requireHostedCommunityRecipeStep,selectHostedCommunityLivePrefixSelection,Buffer,TextDecoder,URL,stagingHostContractSchema:z.unknown()},'prepareHostedCommunityLivePrefix');
}
async function actualGate(prepareHostedCommunityLivePrefix:Awaited<ReturnType<typeof actualPrefixParser>>,consumeHostedCommunityLivePrefixProof:(proof:unknown,expected:unknown)=>HostedCommunityLivePrefixProofReceipt) {
  const filename=resolve(root,'scripts/verification/hosted-community-command-gate.ts'),source=readFileSync(filename,'utf8');
  const ast=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const declarations=ast.statements.filter(node=>ts.isVariableStatement(node)||ts.isFunctionDeclaration(node));
  assert.equal(declarations.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='createHostedCommunityCommandGate').length,1);
  return { create:await loadActualDeclarations<typeof createHostedCommunityCommandGate>(declarations,ast,{createHash,idempotencyKeySchema,canonicalReleaseExecutionJson,parseHostedCommunityCommand,requireHostedCommunityRecipeStep,reduceHostedCommunityReceipt,prepareHostedCommunityLivePrefix,consumeHostedCommunityLivePrefixProof},'createHostedCommunityCommandGate'),sourceSha256:createHash('sha256').update(source).digest('hex') };
}

const bundles=new Map<string,Promise<string>>();
const styles=build({stdin:{contents:"@import './packages/ui/src/tokens.css';@import './apps/web/app/globals.css';@import './apps/web/features/auth/styles.css';@import './apps/web/features/shell/styles.css';@import './apps/web/features/learning/styles.css';@import './apps/web/features/community/styles.css';@import './apps/web/features/home/styles.css';",resolveDir:root,loader:'css'},bundle:true,write:false}).then(output=>output.outputFiles[0].text);
function bundle(apiOrigin=api) {
  const api=apiOrigin;
  const existing=bundles.get(api);if(existing)return existing;
  const work=(async () => {
    const source = `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{SignIn}from'./apps/web/features/auth/components/sign-in';import{RoleHome}from'./apps/web/features/home/components/role-home';import{CommunityWorkspace}from'./apps/web/features/community/components/community-workspace';import{CommandJournal}from'./apps/web/shared/api/client';import{FormDrafts}from'./apps/web/shared/session/form-drafts';import{en}from'./apps/web/shared/i18n/en';import{ar}from'./apps/web/shared/i18n/ar';import{LanguageSwitch}from'./apps/web/shared/components/language-switch';import{WorkspaceChrome}from'./apps/web/features/shell/components/workspace-chrome';
let rerender=()=>{},view='home';const app={locale:'en',dictionary:en,membership:null,status:'signed-out',online:true,apiUrl:${JSON.stringify(api)},publicConfig:{apiUrl:${JSON.stringify(api)},supabaseUrl:${JSON.stringify(auth)},supabasePublishableKey:${JSON.stringify(publishable)}},accessToken:null,accessGeneration:0,selectedChildId:null,commandJournal:new CommandJournal(),formDrafts:new FormDrafts(),announce(){},reportDiagnostic(){},setLocale(locale){app.locale=locale;app.dictionary=locale==='ar'?ar:en;document.documentElement.lang=locale;document.documentElement.dir=locale==='ar'?'rtl':'ltr';rerender()},selectChild(id){app.selectedChildId=id;rerender()},refreshAccess(){if(app.accessToken)void fetch(${JSON.stringify(api)}+'/v1/me',{headers:{Authorization:'Bearer '+app.accessToken,'X-School-Id':app.membership.schoolId}}).catch(()=>{})},restoreSession:async()=>false};
globalThis.communityConsumerApp=app;globalThis.communityConsumerTokens=[];
app.signIn=async(email,password)=>{try{const response=await fetch(${JSON.stringify(auth)}+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:${JSON.stringify(publishable)},'Content-Type':'application/json'},body:JSON.stringify({email,password})});const issued=await response.json();app.accessToken=issued.access_token;globalThis.communityConsumerTokens.push(issued.access_token);const current=await fetch(${JSON.stringify(api)}+'/v1/me',{headers:{Authorization:'Bearer '+issued.access_token}});if(!current.ok)return'unavailable';app.membership=await current.json();app.status='ready';app.accessGeneration++;view='home';rerender();return null}catch{return'unavailable'}};
app.signOut=async()=>{try{await fetch(${JSON.stringify(auth)}+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:${JSON.stringify(publishable)},Authorization:'Bearer '+app.accessToken,'Content-Type':'application/json'},body:'{}'})}catch{}app.membership=null;app.accessToken=null;app.status='signed-out';app.commandJournal=new CommandJournal();app.formDrafts=new FormDrafts();rerender()};
function Harness(){const[version,setVersion]=useState(0);rerender=()=>setVersion(value=>value+1);const member=app.membership;if(!member)return<SignIn/>;const navigation=[{id:'overview',label:app.locale==='ar'?'الرئيسية':'Home',icon:'home',onSelect:()=>{view='home';rerender()}},{id:'community',label:app.locale==='ar'?'المجتمع':'Community',icon:'community',onSelect:()=>{view='community';rerender()}}];const selectedId=view==='home'?'overview':'community';return<><a href='#main-content' className='skip-link'>{app.dictionary.skip}</a><WorkspaceChrome context={{navigation,selectedId,navigationLabel:app.locale==='ar'?'مساحات العمل':'Workspaces',mode:view==='home'?'home':'focused',currentWorkspace:navigation.find(item=>item.id===selectedId),schoolName:member.school.name,personName:member.displayName,roleLabel:app.dictionary.roles[member.role],locale:app.locale,theme:'light',expression:member.role==='student'?'student':member.role==='parent'?'parent':'staff',brand:<span>Cuevo</span>,languageControl:<LanguageSwitch/>,signOutAction:{label:app.dictionary.signOut,onClick:()=>{void app.signOut()}}}}><main className='workspace-main' id='main-content' data-workspace-sections data-protocol-version={version}>{view==='home'?<RoleHome onNavigate={()=>{view='community';rerender()}}/>:<CommunityWorkspace/>}</main></WorkspaceChrome></>}createRoot(document.getElementById('root')).render(<Harness/>);`;
    const output = await build({ stdin: { contents: source, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' }, plugins: [{ name: 'controlled-session-only', setup(builder) {
      builder.onLoad({ filter: /shared[\\/]session[\\/]providers\.tsx$/ }, () => ({ loader: 'js', contents: 'export function useApp(){return globalThis.communityConsumerApp}' }));
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'protocol-navigation', namespace: 'protocol-navigation' }));
      builder.onLoad({ filter: /.*/, namespace: 'protocol-navigation' }, () => ({ loader: 'js', contents: "export function useSearchParams(){return new URLSearchParams()}export function usePathname(){return '/'}" }));
      builder.onResolve({ filter: /^next\/(link|image)$/ }, args => ({ path: args.path, namespace: 'protocol-next-presentation' }));
      builder.onLoad({ filter: /.*/, namespace: 'protocol-next-presentation' }, args => ({ loader: 'js', resolveDir: root, contents: args.path === 'next/link' ? "import React from 'react';export default function Link({children,...props}){return React.createElement('a',props,children)}" : "import React from 'react';export default function Image({src,...props}){return React.createElement('img',{...props,src:typeof src==='string'?src:src.src})}" }));
      builder.onLoad({ filter: /\.(png|webp|svg)$/ }, args => ({ loader: 'js', contents: 'export default ' + JSON.stringify({ src: 'data:image/webp;base64,' + readFileSync(args.path).toString('base64'), width: 128, height: 128 }) }));
    } }] });
    return output.outputFiles[0].text;
  })();bundles.set(api,work);return work;
}

type Mode = 'normal' | 'multiple-invalidations' | 'wrong-second-post' | 'wrong-peer-mute' | 'view-record-refused' | 'view-source-changed' | 'native-prefix-refused' | 'cleanup-not-revoked' | 'malformed-user' | 'read-before-membership' | 'unexpected-post' | 'foreign-route' | 'signed-out-read' | 'old-token' | 'refresh-late-source' | 'refresh-before-membership' | 'pending-auth' | 'pending-next-session' | 'membership-during-command' | 'auth-during-dispatch' | 'held-auth-body' | 'denial-not-forbidden' | 'denial-wrong-reason' | 'denial-joined' | 'auxiliary-wrong-actor';
type Forwarded = { path: string; method: string; actorId: string | null; tokenIndex: number; school: string | undefined; key: string | undefined; request: Request };

async function protocol(mode: Mode, testInfo: TestInfo) {
  const fullJourney = mode === 'normal'||mode==='multiple-invalidations';
  const ordinalFault=mode==='wrong-second-post'||mode==='wrong-peer-mute';
  // Complete recipes include original commands, ten sessions and twelve view
  // observations. This outer fixture limit does not extend any live read,
  // command or native admission deadline. Early refusal cases retain 30s.
  test.setTimeout(fullJourney || ordinalFault || mode==='native-prefix-refused' || mode==='cleanup-not-revoked' ? 120_000 : 30_000);
  const source = wrapperCode(), script = await bundle(api), css = await styles, result = fixtureResult();
  const auxiliaryFault=['denial-not-forbidden','denial-wrong-reason','denial-joined','auxiliary-wrong-actor'].includes(mode);
  const viewFault=mode==='view-record-refused'||mode==='view-source-changed';
  const actualControls = fullJourney || viewFault || ordinalFault || mode==='cleanup-not-revoked' || mode === 'auth-during-dispatch' || mode === 'native-prefix-refused' || auxiliaryFault;
  let viewSourceChanged=false,viewRestoration:unknown=null;
  const ordinalBoundary:{value:{states:string;companions:string;head:string|null;count:number;posts:number;muted:boolean}|null}={value:null};
  const ordinalAttempts:{path:string;keySha256:string;body:unknown;requestSha256:string}[]=[];
  let dispatchStarted = false, dispatchRace = async () => {};
  const events: { kind: string; index: number; path?: string }[] = [], forwarded: Forwarded[] = [], cleanup: { tokenIndex: number; method: string; school?: string }[] = [], companions: unknown[] = [];
  const minted = new Map<string, { actor: FixtureActor; refresh: string; index: number }>();
  const states: HostedCommandJournalCommandState<'community'>[] = [], journalRecords:HostedCommandJournalRecord<'community'>[]=[]; let sequence = 0, serial = 20, login = 0, browserClosed = 0, contextClosed = 0;
  let groupId = '', muted = false, read = false, closed = false, withdrawn = false, groupRevision = 1,peerActive=false,requestSequence=0;
  let announcement: Record<string, unknown> | undefined;
  const posts: Record<string, unknown>[] = [], reports: Record<string, unknown>[] = [], browserFailures: string[] = [];
  const contract = hostedCommandJournalContracts('community');
  const socketSessions:{send:(message:string)=>void;actor:FixtureActor;token:string;topic:string;joinRef:string;joined:boolean;closed:boolean}[]=[],wire:{event:string;actorId:string;roomId:string;status?:string}[]=[];
  const commandEvents=new Map<number,string>();
  let broadcastOriginal=(_index:number)=>{};
  const responseDiagnostics:{path:string;phase:string;failure?:string}[]=[];
  const helperRequests=new WeakMap<Request,{sequence:number;key:string;actorId:string|null;tokenIndex:number|null;epoch:number}>(),requestChronology:Record<string,unknown>[]=[];let requestSequenceIndex=0;
  const canonicalHash=(value:unknown)=>createHash('sha256').update(canonicalReleaseExecutionJson(value)).digest('hex');
  const record = (kind: string, path?: string) => events.push({ kind, index: states.length, ...(path ? { path } : {}) });
  const appendJournal=(entry:HostedCommandJournalCommandState<'community'>,state:HostedCommandJournalCommandState<'community'>['state'],intent=false)=>{
    const payload={version:1,purpose:contract.purpose,sequence:++sequence,previousRecordSha256:journalRecords.at(-1)?.recordSha256??null,identity,command:entry.original.command,state,intentSequence:intent?sequence:entry.original.intentSequence,intentRecordSha256:intent?null:entry.original.intentRecordSha256,httpReceiptSha256:entry.httpReceiptSha256,nativeReceiptSha256:null,nativeProof:null,localDurabilityOnly:true};
    const recordSha256=createHash('sha256').update(canonicalReleaseReviewJson(payload)).digest('hex');
    journalRecords.push(contract.recordSchema.parse({...payload,recordSha256}) as HostedCommandJournalRecord<'community'>);return recordSha256;
  };
  // Closed controlled metadata port: the production gate retains the exact
  // original, finite schema and ordering. Durable filesystem journal proof is
  // owned by its separate native-file tests; this port asserts no durability.
  const journal: HostedCommunityJournal = {
    intent: async raw => { const command = contract.commandSchema.parse(raw) as HostedCommunityJournalCommand; const original = { identity, command, intentSequence: sequence+1, intentRecordSha256: '' }; const entry={ original, state:'INTENT' as const, httpReceiptSha256:null, nativeReceiptSha256:null };original.intentRecordSha256=appendJournal(entry,'INTENT',true);states.push(entry);record('intent', command.path); return original; },
    startForwarding: async (original, forward) => { const parsed = contract.originalSchema.parse(original); const entry = states.find(item => item.original.intentSequence === parsed.intentSequence)!; assert.equal(entry.state, 'INTENT'); entry.state = 'FORWARDING_AUTHORIZED';appendJournal(entry,entry.state); record('forwarding', entry.original.command.path); return forward(); },
    recordHttpReceipt: async (original, raw) => { const parsed = contract.originalSchema.parse(original), receipt = contract.httpSchema.parse(raw); const entry = states.find(item => item.original.intentSequence === parsed.intentSequence)!; assert.equal(entry.state, 'FORWARDING_AUTHORIZED'); entry.state = 'HTTP_CONFIRMED'; entry.httpReceiptSha256 = receipt.receiptSha256;appendJournal(entry,entry.state); record('http', entry.original.command.path);if(states.indexOf(entry)===3||mode==='multiple-invalidations'&&entry.original.command.operation==='post.create')setTimeout(()=>broadcastOriginal(states.indexOf(entry)),0); },
    recordNativeConfirmation: async () => { throw Error('Controlled browser has no native authority'); },
    markUncertain: async original => { const parsed = contract.originalSchema.parse(original); const entry = states.find(item => item.original.intentSequence === parsed.intentSequence)!; if(entry.state!=='UNCERTAIN'){entry.state='UNCERTAIN';appendJournal(entry,entry.state);}record('uncertain', entry.original.command.path); },
    read: async () => ({ records: structuredClone(journalRecords), commands: structuredClone(states), lastRecordSha256: journalRecords.at(-1)?.recordSha256??null, evidence: 'LOCAL_DURABLE_METADATA_ONLY', hostedAcceptance: false, runnerLossRecoveryVerified: false }),
  };
  const preparePrefix=await actualPrefixParser(),proofs=new WeakMap<object,{expected:unknown;receipt:HostedCommunityLivePrefixProofReceipt}>();let nativePrefixChecks=0,nativePrefixAdmitted=false;
  const ownerGate=await actualGate(preparePrefix,(proof,expected)=>{if(!proof||typeof proof!=='object')throw Error('Controlled proof refused');const retained=proofs.get(proof);if(!retained)throw Error('Controlled proof refused');proofs.delete(proof);assert.equal(canonicalReleaseExecutionJson(expected),canonicalReleaseExecutionJson(retained.expected));return retained.receipt;});
  const gate = ownerGate.create({ apiOrigin: api, identity, scope, journal, readmit: async () => {
    record('readmit');
    // The original intent/companion and forwarding admission have completed.
    // Challenge the wrapper's last callback with real outstanding Auth here,
    // while the gate's own original actor/token remain unchanged.
    if (mode === 'auth-during-dispatch' && !dispatchStarted && states[0]?.state === 'FORWARDING_AUTHORIZED') { dispatchStarted = true; await dispatchRace(); }
  }, persist: async (name, value) => { record(name.endsWith('.intent.json') ? 'companion' : 'receipt'); companions.push(value); return canonicalHash(value); } });
  const confirmNativePrefix=async()=>{
    nativePrefixChecks++;assert.equal(gate.confirmedCount(),15);assert.equal(states.length,15);assert.equal(states.every(row=>row.state==='HTTP_CONFIRMED'),true);record('native-prefix-start');
    const first=await gate.captureLivePrefix(),second=await gate.captureLivePrefix();assert.equal(canonicalReleaseExecutionJson(first),canonicalReleaseExecutionJson(second));
    const files=new Map<string,Buffer>();for(const entry of second.companions){const value=companions.find(value=>(value as {original:{intentSequence:number};purpose:string}).original.intentSequence===Number(entry.path.split('.')[0])&&((value as {purpose:string}).purpose==='CUEVO_HOSTED_COMMUNITY_ORIGINAL_COMMAND')===entry.path.endsWith('.intent.json'));assert(value);files.set(entry.path,Buffer.from(canonicalReleaseExecutionJson(value)));}
    const prepared=preparePrefix(second,files);assert.equal(prepared.selection.originals.length,15);assert.equal(files.size,30);
    if(mode==='native-prefix-refused')throw Error('Controlled native prefix refusal');
    // Only this fixture issues the capability. No provider/native execution is
    // asserted by its matching receipt or the actual gate consuming it.
    const expected={identity,prefixSnapshotSha256:prepared.selection.identity.prefixSnapshotSha256,journalHeadSha256:second.journal.lastRecordSha256};
    const summary=prepared.selection.originals.map((row,index)=>({eventId:commandEvents.get(index)!,intentRecordSha256:row.original.intentRecordSha256,operation:row.original.command.operation,id:row.http.receiptIdentity.receiptId,nativeReceiptSha256:canonicalHash({controlled:index}),httpReceiptObserved:true as const}));
    const correlated=validateHostedCommunityDelivery({commands:summary,invalidations:result.invalidations.filter(row=>[actors.teacher.actorId,actors.student.actorId].includes(row.actorId)&&result.deliveryRereads.some(read=>read.eventId===row.eventId)),rereads:result.deliveryRereads,identity:{schoolId,groupId,observedAfter:result.observedAt,observedBefore:new Date().toISOString()}});assert.equal(correlated.status,'DELIVERY_CORRELATED');
    const receipt:HostedCommunityLivePrefixProofReceipt={version:1,purpose:'CUEVO_HOSTED_COMMUNITY_LIVE_PREFIX_PROOF',status:'LIVE_PREFIX_NATIVE_VERIFIED',...expected,companionInventorySha256:prepared.selection.identity.companionInventorySha256,nativeEvidenceSha256:canonicalHash({controlled:true}),classRoomId,deliveryEventIds:correlated.eventIds,observedAt:new Date().toISOString(),readOnly:true,sessionsClosed:true,customerReady:false,hostedAcceptance:false,referenceRestored:false};
    const proof=Object.freeze({});proofs.set(proof,{expected,receipt});assert.equal(gate.admitRetirement(proof),receipt);nativePrefixAdmitted=true;record('native-prefix-admitted');
  };
  let page!: Page, heldRelease = () => {}, heldEntered = () => {};
  const allContexts:BrowserContext[]=[];
  const held = new Promise<void>(done => { heldRelease = done; }), entered = new Promise<void>(done => { heldEntered = done; });
  let heldResponseRequest: Request | undefined, holdNextMe = false, heldResponseParsed = false, faultReached = false;
  const realBrowser = await chromium.launch({ headless: true, ...(process.env.CUEVO_PROTOCOL_BROWSER_CHANNEL ? { channel: process.env.CUEVO_PROTOCOL_BROWSER_CHANNEL } : {}) });
  const currentOwner = (request: Request) => minted.get(request.headers().authorization?.replace(/^Bearer /, '') ?? '');
  const member = (actor: FixtureActor) => ({ userId: actor.actorId, schoolId: actor.schoolId, membershipId: ids(2), role: actor.role, displayName: actor.displayName, entitlements: ['community', 'learning', 'assessment', 'curriculum', 'improvement', 'portfolio', 'school.operations', 'learner.state'], school: { id: actor.schoolId, name: 'Controlled reference school' } });
  const room = (id: string, type: 'CLASS' | 'GROUP', name: string, actor: FixtureActor) => ({ id, classId, type, name, ownerId: actors.teacher.actorId, status: type === 'GROUP' && closed ? 'CLOSED' : 'ACTIVE', revision: type === 'GROUP' ? groupRevision : 1, canModerate: actor.role === 'teacher', canPost: !(type === 'GROUP' && closed) && (actor.role === 'teacher' || actor.role === 'student' && !muted), privateTopic: 'cuevo:' + schoolId + ':room:' + id });
  const headers = { 'Access-Control-Allow-Origin': web, 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'apikey,content-type,authorization,x-school-id,idempotency-key', 'Access-Control-Expose-Headers': 'X-Request-Id' };
  const lower = async (route: Route) => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, owner = currentOwner(request);
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    forwarded.push({ path, method: request.method(), actorId: owner?.actor.actorId ?? null, tokenIndex: owner?.index ?? -1, school: request.headers()['x-school-id'], key: request.headers()['idempotency-key'], request });
    if (url.origin === web&&!path.startsWith('/v1/')) {
      if (path === '/api/testing/quick-login') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"available":false}' });
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en" dir="ltr"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Controlled Community protocol</title><style>'+css+'</style></head><body><div id="root"></div><script>' + script + '</script></body></html>' });
    }
    if (url.origin === auth && path === '/auth/v1/token') {
      const body = request.postDataJSON();
      if (['pending-auth', 'pending-next-session', 'auth-during-dispatch'].includes(mode) && url.searchParams.get('grant_type') === 'refresh_token') { heldEntered(); await held; return route.abort().catch(() => {}); }
      const actor = url.searchParams.get('grant_type') === 'password' ? Object.values(actors).find(actor => actor.email === body.email)! : [...minted.values()].find(value => value.refresh === body.refresh_token)!.actor;
      assert(actor); assert.equal(request.headers().apikey, publishable);
      if (url.searchParams.get('grant_type') === 'password') { assert.equal(body.password, password); login++; }
      const index = minted.size, token = 'controlled-community-session-token-' + index, refresh = 'controlled-community-refresh-' + index;
      minted.set(token, { actor, refresh, index }); record('auth');
      return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ access_token: token, refresh_token: refresh, user: { id: mode === 'malformed-user' || mode==='auxiliary-wrong-actor'&&actor.actorId===actors.peer.actorId ? actors.student.actorId : actor.actorId, email: actor.email, is_anonymous: false } }) });
    }
    if (url.origin === auth && path === '/auth/v1/logout') { assert(owner); record('visible-logout'); return route.fulfill({ status: 204, headers }); }
    assert.equal(url.origin, api, 'the actual wrapper must refuse foreign requests before this transport'); assert(owner, 'forwarded API request has one captured minted token');
    const roomMatch=/^\/v1\/community\/rooms\/([^/]+)\/(posts|roster)$/.exec(path),auxiliary=[actors.peer.actorId,actors.outsideClass.actorId,actors.foreign.actorId].includes(owner.actor.actorId);
    const denied=auxiliary&&!!roomMatch&&(owner.actor.actorId!==actors.peer.actorId||!peerActive);
    if(denied){const requestId='controlled-denial-'+(++requestSequence);return route.fulfill({status:mode==='denial-not-forbidden'?200:403,contentType:'application/json',headers:{...headers,'X-Request-Id':requestId},body:JSON.stringify({code:'FORBIDDEN',message:'Current room access denied.',requestId})});}
    let value: unknown = { items: [], nextCursor: null };
    if (path === '/v1/me') {
      if (mode === 'refresh-late-source' && holdNextMe) { holdNextMe = false; heldResponseRequest = request; heldEntered(); await held; heldResponseParsed = true; }
      value = member(owner.actor);
    } else if (request.method() === 'POST') {
      record('server-command', path); assert.equal(request.headers()['x-school-id'], owner.actor.schoolId); assert(request.headers()['idempotency-key']);
      commandEvents.set(states.length-1,ids(900+states.length));
      const body = request.postDataJSON() as Record<string, unknown>; let id = ids(serial++);
      if (path === '/v1/community/rooms') { assert.deepEqual(body, { classId, name: hostedCommunityRecipeText.groupName, type: 'GROUP', memberIds: [actors.student.actorId] }); groupId = id; value = { id, command: 'room.create', roomId: id }; }
      else if (path.endsWith('/members')) {if(body.actorId===actors.peer.actorId)peerActive=body.status==='active';value = { id, command: 'member.configure' };}
      else if (path.endsWith('/posts')) { const post = { id, roomId: groupId, actorId: owner.actor.actorId, authorName: owner.actor.displayName, createdAt: '2026-10-12T00:00:00Z', replyToId: body.replyToId ?? null, body: body.body, status: 'VISIBLE', reactions: [] }; posts.push(post); const { authorName, reactions, ...receipt } = post; void authorName; void reactions; value = { ...receipt, command: 'post.create' }; }
      else if (path.endsWith('/reactions')) { id = path.split('/')[4]; posts.find(post => post.id === id)!.reactions = body.active ? [{ reaction: 'HELPFUL', count: 1, mine: true }] : []; value = { id, command: 'reaction.configure' }; }
      else if (path.endsWith('/report')) { reports.push({ id, postId: path.split('/')[4], reporterId: owner.actor.actorId, reason: body.reason, createdAt: '2026-10-12T00:00:00Z' }); value = { id, command: 'report.create' }; }
      else if (path.endsWith('/restrict')) { muted = body.restriction === 'MUTED'; value = { id, command: 'room.restrict' }; }
      else if (path.endsWith('/moderate')) { posts.find(post => post.id === path.split('/')[4])!.status = body.action === 'HIDE' ? 'HIDDEN' : 'VISIBLE'; value = { id, command: 'post.moderate' }; }
      else if (path === '/v1/community/announcements') { announcement = { id, classId, title: body.title, body: body.body, parentVisible: true, canManage: false, createdAt: '2026-10-12T00:00:00Z', readAt: null, revision: 1, status: 'PUBLISHED' }; value = { id, command: 'announcement.create' }; }
      else if (path.endsWith('/lifecycle')) { closed = true; groupRevision++; value = { id: groupId, status: 'CLOSED', revision: groupRevision }; }
      else if (path.endsWith('/withdraw')) { withdrawn = true; value = { id: announcement!.id, status: 'WITHDRAWN', revision: 2 }; }
      else if (path.endsWith('/read')) { read = true; value = { id: announcement!.id, status: 'READ', revision: 1 }; }
      else throw Error('Unexpected controlled command');
    } else if (path === '/v1/classes') value = { items: [{ id: classId, name: 'Year 1 · Cedar', yearGroupName: 'Year 1', academicYearName: '2026–2027' }], nextCursor: null };
    else if (path === '/v1/people') value = { items: [{ userId: actors.student.actorId, displayName: actors.student.displayName, role: 'student', classLabels: ['Year 1 · Cedar'] }], nextCursor: null };
    else if (path === '/v1/community/rooms') value = { items: auxiliary?(owner.actor.actorId===actors.peer.actorId&&peerActive?[room(classRoomId,'CLASS','Cedar class discussion',owner.actor),room(groupId,'GROUP',hostedCommunityRecipeText.groupName,owner.actor)]:[]):[room(classRoomId, 'CLASS', 'Cedar class discussion', owner.actor), ...(groupId ? [room(groupId, 'GROUP', hostedCommunityRecipeText.groupName, owner.actor)] : [])], nextCursor: null };
    else if (path.endsWith('/roster')) value = { items: [actors.teacher, actors.student, actors.peer].map(actor => ({ id: actor.actorId, displayName: actor.displayName, role: actor.role })), nextCursor: null };
    else if (path.endsWith('/posts')) value = { items: posts.map(post => ({ ...post, body: post.status === 'HIDDEN' ? null : post.body })), nextCursor: null };
    else if (path.endsWith('/reports')) value = { items: reports, nextCursor: null };
    else if (path === '/v1/community/announcements') value = { items: announcement && !withdrawn ? [{ ...announcement, canManage: owner.actor.role === 'teacher' }] : [], nextCursor: null };
    else if (path === '/v1/community/notifications') value = { items: announcement && !withdrawn ? [{ id: announcement.id, announcementId: announcement.id, title: announcement.title, kind: 'ANNOUNCEMENT', createdAt: announcement.createdAt, readAt: read ? '2026-10-12T00:00:01Z' : null, revision: 1 }] : [], nextCursor: null };
    else if (path === '/v1/community/announcements/' + announcement?.id) value = { ...announcement, readAt: read ? '2026-10-12T00:00:01Z' : null };
    else if (path === '/v1/community/conversations/policy') value = { id: ids(3), version: 0, enabled: false, approvedAt: null };
    else if (path.endsWith('/academic-report')) value = { schemaVersion: '1', schoolId, learnerId: actors.student.actorId, generatedAt: '2026-10-12T00:00:00Z', scope: 'CURRENT_RELEASED_PAGE', coverage: 'NOT_ESTABLISHED', items: [], nextCursor: null };
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { ...headers, 'X-Request-Id': 'controlled-request-' + (++requestSequence) }, body: JSON.stringify(value) });
  };
  broadcastOriginal=index=>{const eventId=commandEvents.get(index);if(!eventId)return;for(const socket of socketSessions)if(socket.joined&&!socket.closed&&socket.topic.endsWith(':room:'+groupId)&&socket.actor.actorId===actors.student.actorId){socket.send(JSON.stringify([null,null,socket.topic,'broadcast',{type:'broadcast',event:'invalidate',payload:{eventId,roomId:groupId}}]));wire.push({event:'invalidate',actorId:socket.actor.actorId,roomId:groupId});}};
  const browser = new Proxy(realBrowser, { get(target, key) {
    if (key === 'newContext') return async (options: Parameters<Browser['newContext']>[0]) => {
      assert.equal(options?.serviceWorkers, 'block'); assert.equal(options?.acceptDownloads, false); const fixtureContext = await target.newContext(options);allContexts.push(fixtureContext); await fixtureContext.route('**/*', lower);
      return new Proxy(fixtureContext, { get(context, property) {
        if (property === 'newPage') return async () => {
          const createdPage=await context.newPage();if(!page)page=createdPage; createdPage.on('pageerror', error => browserFailures.push(error.message));createdPage.on('console',message=>{if(message.type()==='error')browserFailures.push('console:'+message.text()+'@'+message.location().url);});
          createdPage.on('request',request=>{const url=new URL(request.url());if(ordinalBoundary.value&&url.origin===api&&request.method()==='POST'){ordinalAttempts.push({path:url.pathname,keySha256:canonicalHash(request.headers()['idempotency-key']),body:request.postDataJSON(),requestSha256:createHash('sha256').update(request.postDataBuffer()!).digest('hex')});}if(url.origin===api&&request.method()==='GET'){const owner=currentOwner(request),snapshot={sequence:++requestSequenceIndex,key:url.pathname+url.search,actorId:owner?.actor.actorId??null,tokenIndex:owner?.index??null,epoch:states.length};helperRequests.set(request,snapshot);requestChronology.push({phase:'issued',...snapshot,at:new Date().toISOString()});}});
          createdPage.on('requestfailed',request=>{const url=new URL(request.url());if(url.origin===api){responseDiagnostics.push({path:url.pathname,phase:'actual-requestfailed',failure:request.failure()?.errorText??'UNKNOWN'});requestChronology.push({phase:'failed',...helperRequests.get(request),failure:request.failure()?.errorText??'UNKNOWN',at:new Date().toISOString()});}});
          return new Proxy(createdPage, { get(actual, method) {
            if (method === 'on') return (name: string, listener: (...values: unknown[]) => void) => {
              if (name !== 'response') { actual.on(name as 'request', listener); return actual; }
              actual.on('response', response => listener(new Proxy(response, { get(original, property) {
                if (property === 'body') return async () => {
                  if(mode==='held-auth-body'&&response.url().startsWith(auth+'/auth/v1/token')){heldEntered();await held;}
                  try{return await original.body();}catch(error){responseDiagnostics.push({path:new URL(response.url()).pathname,phase:'body-rejected',failure:response.request().failure()?.errorText??(error instanceof Error?error.message:String(error))});throw error;}
                };
                if(property==='json')return async()=>{try{return await original.json();}catch(error){const request=response.request(),url=new URL(response.url()),owner=currentOwner(request);await writeFile(resolve(root,'.local/hosted-community-protocol/'+mode+'-first-json-failure.json'),JSON.stringify({version:1,scope:'CONTROLLED_BROWSER_HELPER_RESPONSE',responsePath:url.pathname,responseCursor:url.searchParams.get('cursor'),method:request.method(),status:response.status(),requestFailure:request.failure()?.errorText??null,actorId:owner?.actor.actorId??null,schoolId:owner?.actor.schoolId??null,mintedTokenIndex:owner?.index??null,commandCount:states.length,latestDeliveredEventId:result.invalidations.at(-1)?.eventId??null,errorClass:error instanceof Error?error.name:'unknown',errorMessage:error instanceof Error?error.message:'unknown',observedAt:new Date().toISOString()},null,2));throw error;}};
                const value = Reflect.get(original, property); return typeof value === 'function' ? value.bind(original) : value;
              } }))); return actual;
            };
            const value = Reflect.get(actual, method); return typeof value === 'function' ? value.bind(actual) : value;
          } });
        };
        if(property==='routeWebSocket')return async(pattern:string,handler:(socket:unknown)=>void)=>context.routeWebSocket(pattern,socket=>{
          let receive:((message:string)=>void)|undefined,onServerClose:(()=>void)|undefined;
          const owned:{send:(message:string)=>void;actor:FixtureActor;token:string;topic:string;joinRef:string;joined:boolean;closed:boolean}={send:message=>receive?.(message),actor:actors.teacher,token:'',topic:'',joinRef:'',joined:false,closed:false};socketSessions.push(owned);
          const server={send:(message:string)=>{const[joinRef,ref,topic,event,payload]=JSON.parse(message);if(event==='phx_join'){
            const owner=minted.get(payload.access_token);assert(owner,'actual SDK must present a captured normal token');owned.actor=owner.actor;owned.token=payload.access_token;owned.topic=topic;owned.joinRef=joinRef;
            const roomId=String(topic).split(':').at(-1)!;const denied=owner.actor.actorId===actors.foreign.actorId||owner.actor.actorId===actors.outsideClass.actorId||owner.actor.actorId===actors.peer.actorId&&!peerActive;
            const status=denied&&mode!=='denial-joined'?'error':'ok';owned.joined=status==='ok';wire.push({event:'phx_join',actorId:owner.actor.actorId,roomId,status});
            receive?.(JSON.stringify([joinRef,ref,topic,'phx_reply',{status,response:status==='ok'?{postgres_changes:[]}:{reason:mode==='denial-wrong-reason'?'Database unavailable':'You do not have permissions to read from this Channel topic: '+String(topic).slice('realtime:'.length)}}]));
          }else if(event==='phx_leave'||event==='access_token'||event==='heartbeat'){if(event==='phx_leave')owned.joined=false;if(event==='access_token')owned.token=payload.access_token;receive?.(JSON.stringify([joinRef,ref,topic,'phx_reply',{status:'ok',response:{}}]));}else throw Error('Actual SDK emitted unplanned frame');},onMessage:(fn:(message:string)=>void)=>{receive=fn;},onClose:(fn:()=>void)=>{onServerClose=fn;}};
          const wrapped=new Proxy(socket,{get(actual,property){if(property==='connectToServer')return()=>server;const value=Reflect.get(actual,property);return typeof value==='function'?value.bind(actual):value;}});
          socket.onClose(()=>{owned.closed=true;onServerClose?.();});handler(wrapped);
        });
        if (property === 'route') return async (pattern: string, handler: (route: Route) => Promise<void>) => context.route(pattern, route => handler(new Proxy(route, { get(actual, method) { if (method === 'continue') return () => actual.fallback(); const value = Reflect.get(actual, method); return typeof value === 'function' ? value.bind(actual) : value; } })));
        if (property === 'close') return async () => { contextClosed++; await context.close(); heldRelease(); };
        const value = Reflect.get(context, property); return typeof value === 'function' ? value.bind(context) : value;
      } });
    };
    if (key === 'close') return async () => { browserClosed++; await target.close(); };
    const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
  } });
  const cleanupRequest = async (url: string, method: string, headers: Record<string, string>) => {
    const owner = minted.get(headers.Authorization.replace(/^Bearer /, '')); assert(owner);
    cleanup.push({ tokenIndex: owner.index, method, school: headers['X-School-Id'] });
    if (method === 'POST') { assert.equal(url, auth + '/auth/v1/logout?scope=local'); assert.equal(headers.apikey, publishable); return { status: 204, value: null }; }
    assert.equal(url, api + '/v1/me'); assert.equal(headers['X-School-Id'], owner.actor.schoolId);const remainsCurrent=mode==='cleanup-not-revoked'&&owner.actor.actorId===actors.teacher.actorId; return { status: remainsCurrent ? 200 : 401, value: { code: remainsCurrent ? 'CONTROLLED_SESSION_STILL_CURRENT' : 'SESSION_REVOKED' } };
  };
  const actualJourney = async (page: Page, input: CustomerCommunityJourneyInput, ports: CustomerCommunityJourneyPorts) => {
    await mkdir(resolve(root, '.local/hosted-community-protocol'), { recursive: true });
    const delivered=async()=>{const postIndex=mode==='multiple-invalidations'?states.findLastIndex(row=>row.original.command.operation==='post.create'):3;await expect.poll(()=>result.invalidations.some(row=>row.eventId===commandEvents.get(postIndex))&&result.deliveryRereads.some(row=>row.eventId===commandEvents.get(postIndex)&&row.path==='/v1/community/rooms/'+groupId+'/posts?limit=100'&&row.sourceIds?.includes(String(posts[postIndex===3?0:postIndex===4?1:2]?.id)))).toBe(true);await expect(page.locator('main [role="status"]').filter({hasText:/^(Loading|جارٍ تحميل)/})).toHaveCount(0);};
    const beforeMutation:CustomerCommunityJourneyPorts['beforeMutation']=async intent=>{if(states.length>=4&&states.length<9)await delivered();
      if(ordinalFault&&!ordinalBoundary.value&&states.length===(mode==='wrong-second-post'?4:9)){
        ordinalBoundary.value={states:canonicalReleaseExecutionJson(states),companions:canonicalReleaseExecutionJson(companions),head:journalRecords.at(-1)?.recordSha256??null,count:states.length,posts:posts.length,muted};
        if(mode==='wrong-second-post')await page.getByRole('region',{name:'Post to room',exact:true}).getByLabel('Message',{exact:true}).fill(hostedCommunityRecipeText.postBody);
        else await page.getByRole('region',{name:'Manage participation',exact:true}).getByLabel('Member',{exact:true}).selectOption({label:actors.peer.displayName});
        faultReached=true;
      }
      await ports.beforeMutation?.(intent);};
    const cleanup:CustomerCommunityJourneyPorts['cleanup']=async observation=>{if(!page.isClosed())await writeFile(resolve(root,'.local/hosted-community-protocol/'+mode+'-before-cleanup.json'),JSON.stringify({commands:states.length,currentHeading:await page.getByRole('heading',{level:1}).allTextContents(),forms:await page.getByRole('region').evaluateAll(nodes=>nodes.map(node=>({label:node.getAttribute('aria-label'),disabledButtons:[...node.querySelectorAll('button')].map(button=>({text:button.textContent,disabled:button.disabled}))}))),invalidations:result.invalidations.map(row=>({eventId:row.eventId,generation:row.generation})),rereadCount:result.deliveryRereads.length},null,2));await ports.cleanup?.(observation);};
    const observeView:CustomerCommunityJourneyPorts['observeView']=async checkpoint=>{
      if(viewFault&&checkpoint.stage==='GROUP_READY')await page.getByRole('region',{name:'Post to room',exact:true}).getByLabel('Message',{exact:true}).fill('A retained fictional observation draft.');
      try{await ports.observeView!(checkpoint);}catch(error){if(viewFault){viewRestoration={locale:await page.locator('html').getAttribute('lang'),dir:await page.locator('html').getAttribute('dir'),viewport:page.viewportSize(),heading:await page.getByRole('heading',{level:1}).innerText(),draft:await page.getByRole('region',{name:'Post to room',exact:true}).getByLabel('Message',{exact:true}).inputValue(),consent:await page.getByRole('region',{name:'Group members',exact:true}).getByLabel('I approve this moderation action').isChecked()};}throw error;}
    };
    try{return await runCustomerCommunityJourney(page, input, { ...ports,beforeMutation,cleanup,observeView, capture: async name => { await page.screenshot({ path: resolve(root, '.local/hosted-community-protocol/' + mode + '-' + name + '.png') }); } });}catch(error){const faults=error instanceof AggregateError?error.errors:[error];for(const fault of faults)browserFailures.push(fault instanceof Error?(fault.stack??fault.message).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'actual-source-module'):String(fault));throw error;}
  };
  const controlledObserve:typeof observeCommunityView=async(page,checkpoint,original,ports)=>observeCommunityView(page,checkpoint,original,{record:async receipt=>{if(mode==='view-record-refused'&&receipt.locale==='ar'){faultReached=true;throw Error('Controlled view receipt persistence refused');}await ports.record(receipt);if(mode==='view-source-changed'){viewSourceChanged=true;faultReached=true;}}});
  const run = await loadActualDeclarations<(options:unknown)=>Promise<Awaited<ReturnType<typeof runCustomerCommunityJourney>>|null>>([source.declaration],source.ast,{ chromium: { launch: async (options: { env: Record<string, string> }) => { for (const name of ['DATABASE_URL', 'VERCEL_TOKEN', 'OPENAI_API_KEY']) assert.equal(options.env[name], undefined); return browser; } }, process, build,resolve,z, expect,expectTrailWorkspace,openTrailWorkspace,signOutTrailWorkspace,validateHostedCommunityAuxiliaryCompletion, membershipSchema,observeCommunityView:controlledObserve,hostedCommunityViewStages,validateHostedCommunityViewCompletion,canonicalReleaseExecutionJson, hostedCommunityReadAllowed, hostedCommunityRequestIdentityAllowed,hostedCommunityAuxiliaryReadAllowed,hostedCommunityAuxiliaryRequestIdentityAllowed, validateHostedCommunitySocket, createHostedCommunitySocketGate, hostedCommunityRecipeText, runCustomerCommunityJourney: actualControls ? actualJourney : (page: Page, input: CustomerCommunityJourneyInput, ports: CustomerCommunityJourneyPorts) => partialJourney(page, input, ports), requestHostedBrowserJson: cleanupRequest, fail: () => Error('Controlled hosted Community refusal')},'runHostedCommunityBrowser');

  async function fetchRead(token: string, path = '/v1/me', selectedSchool = true) {
    return page.evaluate(async ({ api, token, path, selectedSchool, schoolId }) => { try { const response = await fetch(api + path, { headers: { Authorization: 'Bearer ' + token, ...(selectedSchool ? { 'X-School-Id': schoolId } : {}) } }); return response.status; } catch { return 0; } }, { api, token, path, selectedSchool, schoolId });
  }
  async function refresh(token: string) {
    const owner = minted.get(token)!;
    return page.evaluate(async ({ auth, publishable, refresh }) => { const response = await fetch(auth + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: publishable, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: refresh }) }); return (await response.json()).access_token as string; }, { auth, publishable, refresh: owner.refresh });
  }
  dispatchRace = async () => {
    const token = [...minted.keys()].at(-1)!;
    const request = page.waitForRequest(request => request.url() === auth + '/auth/v1/token?grant_type=refresh_token');
    void refresh(token).catch(() => undefined); await request; await entered;
    assert.equal(states.length, 1); assert.equal(states[0].state, 'FORWARDING_AUTHORIZED');
    assert.equal(companions.length, 1, 'one original intent companion exists before dispatch');
    assert.equal(forwarded.some(row => row.method === 'POST' && row.path.startsWith('/v1/')), false);
    record('dispatch-auth-outstanding'); faultReached = true;
  };
  async function normalForm(ports: CustomerCommunityJourneyPorts) {
    await ports.sessionStarting!(actors.teacher); await page.goto(web);
    await page.getByRole('button', { name: 'English', exact: true }).click(); await page.getByLabel('School email', { exact: true }).fill(actors.teacher.email); await page.getByLabel('Password', { exact: true }).fill(password);
    const current = page.waitForResponse(response => response.url() === api + '/v1/me'); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await current; await expectTrailWorkspace(page, 'teacher'); await ports.sessionStarted!(actors.teacher, membershipSchema.parse(member(actors.teacher)));
  }
  async function partialJourney(_page: Page, _input: CustomerCommunityJourneyInput, ports: CustomerCommunityJourneyPorts) {
    if (mode === 'read-before-membership') {
      await ports.sessionStarting!(actors.teacher); await page.goto(web);
      // The visible SignIn is retained, but a controlled issued token is used
      // to challenge the real route before any current membership response.
      const issued = await page.evaluate(async ({ auth, publishable, password, email }) => { const response = await fetch(auth + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: publishable, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }); return (await response.json()).access_token as string; }, { auth, publishable, password, email: actors.teacher.email });
      await fetchRead(issued, '/v1/community/rooms?limit=100'); faultReached = true; throw Error('Expected membership refusal');
    }
    if (mode === 'held-auth-body') {
      await ports.sessionStarting!(actors.teacher); await page.goto(web);
      const earlyMe = page.waitForRequest(request => request.url() === api + '/v1/me');
      const pending = page.evaluate(async ({ auth, api, publishable, password, email }) => { const response = await fetch(auth + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: publishable, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }); const token = (await response.json()).access_token; return fetch(api + '/v1/me', { headers: { Authorization: 'Bearer ' + token } }); }, { auth, api, publishable, password, email: actors.teacher.email }).catch(() => undefined);
      await entered; await earlyMe; assert.equal(forwarded.some(row => row.path === '/v1/me'), false, 'real early me request must await bounded Node Auth body'); heldRelease(); await pending; await ports.sessionStarted!(actors.teacher, membershipSchema.parse(member(actors.teacher))); await ports.verifyQuality!(); faultReached = true; return null;
    }
    await normalForm(ports); const token = [...minted.keys()].at(-1)!;
    if (mode === 'malformed-user') throw Error('Invalid Auth identity must prevent current session');
    if (mode === 'unexpected-post' || mode === 'foreign-route') {
      await page.evaluate(async ({ url, token, schoolId }) => { try { await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'X-School-Id': schoolId, 'Content-Type': 'application/json' }, body: '{}' }); } catch { /* The actual route must refuse this request. */ } }, { url: mode === 'foreign-route' ? 'https://foreign-community-protocol.invalid/v1/community/rooms' : api + '/v1/intelligence/provider', token, schoolId });
    } else if (mode === 'signed-out-read' || mode === 'old-token') {
      await signOutTrailWorkspace(page); await ports.sessionEnded!(actors.teacher);
      if (mode === 'old-token') await normalForm(ports);
      await fetchRead(token);
    } else if (mode === 'refresh-before-membership') {
      const rotated = await refresh(token); await fetchRead(rotated, '/v1/community/rooms?limit=100');
    } else if (mode === 'refresh-late-source') {
      holdNextMe = true; const late = fetchRead(token); await entered;
      const rotated = await refresh(token); await fetchRead(rotated); await ports.sessionStarted!(actors.teacher, membershipSchema.parse(member(actors.teacher))); heldRelease(); await late;
      await fetchRead(rotated, '/v1/community/rooms?limit=100'); await ports.verifyQuality!(); faultReached = true;
      await page.evaluate(token => { (globalThis as typeof globalThis & { communityConsumerApp: { accessToken: string } }).communityConsumerApp.accessToken = token; }, rotated);
      await signOutTrailWorkspace(page); await ports.sessionEnded!(actors.teacher); return null;
    } else if (mode === 'membership-during-command') {
      await ports.beforeMutation!({ path: '/v1/community/rooms', actor: actors.teacher, scopeGeneration: 1 });
      const rotated = await refresh(token); await fetchRead(rotated);
    } else if (mode === 'pending-auth' || mode === 'pending-next-session') {
      const requested = page.waitForRequest(request => request.url().startsWith(auth + '/auth/v1/token?grant_type=refresh_token'));
      void refresh(token).catch(() => undefined); await requested; await entered;
      if (mode === 'pending-next-session') { await ports.sessionEnded!(actors.teacher); await assert.rejects(ports.sessionStarting!(actors.student)); assert.equal(login, 1, 'no second visible login can begin under unresolved Auth'); }
      faultReached = true; return null;
    }
    faultReached = true; throw Error('Expected original source refusal');
  }
  try {
    const observation = await run({ context: { identity, publicConfig: { apiUrl: api, supabaseUrl: auth, supabasePublishableKey: publishable }, originalWeb: { webOrigin: web,observedAt:result.observedAt }, assertOriginalValidity() { record('validity');if(viewSourceChanged)throw Error('Controlled original view source changed'); }, readmit: async () => { record('source'); } }, gate, actors, password, result,confirmNativePrefix });
    assert.equal(browserClosed, 1); assert.equal(contextClosed, allContexts.length);
    for (const issued of minted.values()) { assert.equal(cleanup.filter(row => row.tokenIndex === issued.index && row.method === 'POST').length, 1); assert.equal(cleanup.filter(row => row.tokenIndex === issued.index && row.method === 'GET').length, 1); }
    assert.doesNotMatch(JSON.stringify(companions), /controlled-community-session|controlled-community-refresh|fictional-community-protocol-password|authorization/i);
    assert.equal(result.nativeChainVerified || result.referenceRestored || result.hostedAcceptance || result.customerReady, false);
    if (fullJourney) {
      assert(observation, JSON.stringify({ result, count: gate.confirmedCount(), login, browserFailures,wire, paths: forwarded.map(row => row.path) })); assert.equal(result.sessionsClosed,true); assert.equal(gate.confirmedCount(), 18); assert.equal(observation.writes.length, 18); assert.equal(observation.sessionStartedCount, 7); assert.equal(observation.sessionEndedCount, 7);assert.equal(observation.cleanupCount,1); assert.equal(login, 10); assert.equal(closed && withdrawn, true); assert.equal(states.every(row => row.state === 'HTTP_CONFIRMED'), true);assert.equal(result.auxiliary.sessionsStarted,3);assert.equal(result.auxiliary.sessionsClosed,3);assert.equal(result.privateReconnectVerified,true);assert.equal(allContexts.length,4);if(mode==='multiple-invalidations')assert.equal(result.invalidations.length,3);
      assert.equal(result.consoleErrors + result.consoleWarnings + result.pageErrors + result.unexpectedRequests, 0);
      assert.equal(result.viewObservations.length,12);assert.deepEqual(result.viewObservations.map(row=>[row.stage,row.locale,row.role,row.scopeGeneration]),hostedCommunityViewStages.flatMap(stage=>['en','ar'].map(locale=>[stage.stage,locale,stage.role,stage.scopeGeneration])));
      for(const[index,row]of result.viewObservations.entries()){const boundary=states[hostedCommunityViewStages[Math.floor(index/2)].confirmedCommandCount-1];assert.equal(row.journalHeadSha256,journalRecords.find(record=>record.intentSequence===boundary.original.intentSequence&&record.state==='HTTP_CONFIRMED')!.recordSha256);assert.equal(row.sourceSha256,canonicalHash({groupId,postIds:index<2?[]:posts.slice(0,2).map(post=>post.id),announcementId:index<8?'':announcement!.id}));assert.deepEqual(row.identity,identity);}
      const commands = forwarded.filter(row => row.method === 'POST' && row.path.startsWith('/v1/')); assert.equal(commands.length, 18); assert.equal(new Set(commands.map(row => row.key)).size, 18);
      assert.equal(nativePrefixChecks,1);assert.equal(nativePrefixAdmitted,true);const prefixEvent=events.findIndex(row=>row.kind==='native-prefix-admitted');assert(prefixEvent>events.findIndex(row=>row.kind==='http'&&row.index===15));assert(prefixEvent<events.findIndex(row=>row.kind==='server-command'&&row.index===16));
      for (let index = 0; index < commands.length; index++) { const original = states[index].original, command = commands[index]; assert.equal(original.command.path, command.path); assert.equal(original.command.actorId, command.actorId); assert.equal(original.command.key, command.key); assert.equal(original.command.requestBodySha256, createHash('sha256').update(command.request.postDataBuffer()!).digest('hex')); const commandEvent = events.findIndex(row => row.kind === 'server-command' && row.index === index + 1); for (const kind of ['intent', 'companion', 'forwarding']) assert(events.findIndex(row => row.kind === kind && row.index === index + 1) < commandEvent); }
      assert.equal(forwarded.filter(row => row.path === '/v1/me' && row.school === undefined).length, 10);
      for (const [actor, paths] of [[actors.teacher, ['/v1/marking', '/v1/interventions', '/v1/portfolio/items', '/v1/recommendations', '/v1/school/calendar']], [actors.student, ['/v1/assessments', '/v1/results', '/v1/development/goals', '/v1/portfolio/items']], [actors.parent, ['/v1/people', '/v1/learners/' + actors.student.actorId + '/academic-report', '/v1/portfolio/items', '/v1/community/conversations/policy']]] as const) for (const path of paths) assert(forwarded.some(row => row.actorId === actor.actorId && row.path === path && row.school === schoolId), actor.role + ' current Home read ' + path);
    } else if(ordinalFault){
      const count=mode==='wrong-second-post'?4:9;assert.equal(observation,null);assert.equal(faultReached,true);assert(ordinalBoundary.value);assert.equal(gate.confirmedCount(),count);assert.equal(states.length,count);assert.equal(states.every(row=>row.state==='HTTP_CONFIRMED'),true);assert.equal(canonicalReleaseExecutionJson(states),ordinalBoundary.value.states,'pre-effect refusal preserves all original journal states and keys');assert.equal(canonicalReleaseExecutionJson(companions),ordinalBoundary.value.companions,'pre-effect refusal persists no new intent or HTTP companion');assert.equal(journalRecords.at(-1)?.recordSha256,ordinalBoundary.value.head);assert.equal(events.some(row=>row.kind==='intent'&&row.index>count),false);assert.equal(events.some(row=>row.kind==='server-command'&&row.index>count),false);assert.equal(forwarded.filter(row=>row.method==='POST'&&row.path.startsWith('/v1/')).length,count);assert.equal(posts.length,ordinalBoundary.value.posts);assert.equal(muted,false);assert.equal(nativePrefixChecks,0);assert.equal(closed||withdrawn,false);assert.equal(ordinalAttempts.length,1,'one actual visible request reached the rejecting gate');
      assert.deepEqual(ordinalAttempts[0].body,mode==='wrong-second-post'?{body:hostedCommunityRecipeText.postBody,replyToId:null,mentionActorIds:[]}:{actorId:actors.peer.actorId,restriction:'MUTED',reason:hostedCommunityRecipeText.restrictionReason,confirmModeration:true});
      assert(result.failure);assert.deepEqual({phase:result.failure.phase,method:result.failure.method,path:result.failure.path,transport:result.failure.transport},{phase:'ROUTE',method:'POST',path:mode==='wrong-second-post'?'community_posts':'community_other',transport:'NONE'});assert.equal(result.hostedAcceptance,false);assert.equal(result.nativeChainVerified,false);
      assert.equal(result.auxiliary.sessionsClosed,3);assert.equal(login,mode==='wrong-second-post'?5:6);assert.equal(result.viewObservations.length,mode==='wrong-second-post'?2:4);
    } else if(viewFault){
      assert.equal(observation,null);assert.equal(faultReached,true);assert.equal(gate.confirmedCount(),1);assert.equal(states.length,1);assert.equal(states[0].state,'HTTP_CONFIRMED');assert.equal(forwarded.filter(row=>row.method==='POST'&&row.path.startsWith('/v1/')).length,1);assert.equal(result.viewObservations.length,1);assert.equal(result.viewObservations[0].locale,'en');assert.equal(nativePrefixChecks,0);assert.equal(login,1);assert.equal(events.some(row=>row.kind==='intent'&&row.index>1),false);assert.equal(result.hostedAcceptance,false);assert.equal(result.referenceRestored,false);
      assert.deepEqual(viewRestoration,{locale:'en',dir:'ltr',viewport:{width:1366,height:900},heading:hostedCommunityRecipeText.groupName,draft:'A retained fictional observation draft.',consent:false});
    } else if(mode==='cleanup-not-revoked'){
      assert.equal(observation,null);assert.equal(gate.confirmedCount(),18);assert.equal(states.length,18);assert.equal(states.every(row=>row.state==='HTTP_CONFIRMED'),true);assert.equal(closed&&withdrawn,true);assert.equal(login,10);assert.equal(result.auxiliary.sessionsClosed,3);assert.equal(result.sessionsClosed,false);assert.equal(nativePrefixChecks,1);assert.equal(nativePrefixAdmitted,true);
    } else if(mode==='native-prefix-refused'){
      assert.equal(observation,null);assert.equal(gate.confirmedCount(),15,JSON.stringify({browserFailures,wire,states:states.map(row=>row.state),result}));assert.equal(states.length,15);assert.equal(states.every(row=>row.state==='HTTP_CONFIRMED'),true);
      assert.equal(forwarded.filter(row=>row.method==='POST'&&row.path.startsWith('/v1/')).length,15);assert.equal(nativePrefixChecks,1);assert.equal(nativePrefixAdmitted,false);assert.equal(closed||withdrawn,false);assert.equal(login,10);assert.equal(result.sessionsClosed,true);
      assert.equal(result.consoleErrors+result.consoleWarnings+result.pageErrors+result.unexpectedRequests,0);assert.equal(events.some(row=>row.kind==='intent'&&row.index>15),false);
    } else if(auxiliaryFault){assert.equal(observation,null);assert.equal(gate.confirmedCount(),mode==='auxiliary-wrong-actor'?2:3);assert.equal(nativePrefixChecks,0);assert.equal(closed||withdrawn,false);assert.equal(result.privateReconnectVerified,false);assert.equal(result.sessionsClosed,false);
    } else {
      assert.equal(observation, null); assert.equal(gate.confirmedCount(), 0); assert.equal(forwarded.filter(row => row.method === 'POST' && row.path.startsWith('/v1/')).length, 0);
      if (mode !== 'malformed-user') assert.equal(faultReached, true);
      if (mode === 'refresh-late-source') { assert.equal(result.sessionsClosed, true, JSON.stringify({ result, browserFailures, paths: forwarded.map(row => ({ path: row.path, method: row.method, tokenIndex: row.tokenIndex })) })); assert(heldResponseRequest); assert.equal(heldResponseParsed, true); assert.equal(result.unexpectedRequests, 0); }
      else if (mode === 'held-auth-body') { assert.equal(result.sessionsClosed, true); assert.equal(result.unexpectedRequests, 0); }
      else assert.equal(result.sessionsClosed, false);
      if (mode === 'auth-during-dispatch') {
        assert.equal(dispatchStarted, true); assert.equal(states.length, 1); assert.equal(states[0].state, 'UNCERTAIN');
        assert.equal(states[0].original.command.path, '/v1/community/rooms'); assert.equal(states[0].original.command.actorId, actors.teacher.actorId);
        assert.equal(events.filter(row => row.kind === 'intent').length, 1); assert.equal(events.filter(row => row.kind === 'forwarding').length, 1); assert.equal(events.filter(row => row.kind === 'http').length, 0);
        assert.equal(result.unexpectedRequests, 1); assert.equal(minted.size, 1); assert.equal(login, 1);
      }
    }
    const evidence = { version: 1, mode, browser: 'real Chrome/Chromium', sourceSha256: source.sourceSha256,gateSourceSha256:ownerGate.sourceSha256,commandSourceSha256:createHash('sha256').update(readFileSync(resolve(root,'scripts/verification/hosted-community-command.ts'))).digest('hex'),artifactSourceSha256:createHash('sha256').update(readFileSync(resolve(root,'scripts/verification/backend-hosted-community-artifact.ts'))).digest('hex'),observerSourceSha256:createHash('sha256').update(readFileSync(resolve(root,'tests/e2e/community-view-observation.ts'))).digest('hex'), loginCount: login, mintedTokenCount: minted.size, confirmedCommandCount: gate.confirmedCount(), cleanupCount: cleanup.length, wrapperClosed: browserClosed === 1 && contextClosed === allContexts.length,contextCount:allContexts.length, sessionsClosed: result.sessionsClosed, consoleErrors: result.consoleErrors, consoleWarnings: result.consoleWarnings, pageErrors: result.pageErrors, unexpectedRequests: result.unexpectedRequests,failure:result.failure, faultReached,ordinalAttempts,ordinalPrefix:ordinalBoundary.value?{count:ordinalBoundary.value.count,journalHeadSha256:ordinalBoundary.value.head,originalKeysSha256:canonicalHash(states.map(row=>row.original.command.key)),statesUnchanged:canonicalReleaseExecutionJson(states)===ordinalBoundary.value.states,companionsUnchanged:canonicalReleaseExecutionJson(companions)===ordinalBoundary.value.companions}:null,viewRestoration,viewObservations:result.viewObservations, heldResponseParsed, dispatchStarted,nativePrefixChecks,nativePrefixAdmitted,controlledNativeProof:true,nativePrefixExecutionVerified:false, journalStates: states.map(row => row.state), serverCommandCount: forwarded.filter(row => row.method === 'POST' && row.path.startsWith('/v1/')).length, realNormalForms: actualControls, actualRoleHome: actualControls || !['malformed-user', 'read-before-membership', 'held-auth-body'].includes(mode), actualCommunityControls: actualControls, controlledHttp: true, controlledJournalMetadata: true, privateChannelHook: 'actual controlled-provider protocol',auxiliary:result.auxiliary,deliveredEventCount:result.invalidations.length,currentRereadCount:result.deliveryRereads.length,privateReconnectObserved:result.privateReconnectVerified,responseDiagnostics, nativeChainVerified: false, hostedAcceptance: false, referenceRestored: false, customerReady: false };
    await mkdir(resolve(root, '.local/hosted-community-protocol'), { recursive: true }); await writeFile(resolve(root, '.local/hosted-community-protocol/' + mode + '.json'), JSON.stringify(evidence, null, 2)); await testInfo.attach('controlled protocol evidence', { body: JSON.stringify(evidence), contentType: 'application/json' });
  } finally { heldRelease();await writeFile(resolve(root,'.local/hosted-community-protocol/'+mode+'-response-diagnostics.json'),JSON.stringify({responseDiagnostics,failure:result.failure,requestChronology},null,2)); await realBrowser.close(); }
}

test('actual hosted Community wrapper: normal Auth and all18 visible original commands across seven current sessions', async ({ browserName }, testInfo) => { assert.equal(browserName, 'chromium'); await protocol('normal', testInfo); });
test('actual hosted Community multiple original post invalidations retain current controls and full recipe',async({browserName},testInfo)=>{assert.equal(browserName,'chromium');await protocol('multiple-invalidations',testInfo);});
for (const mode of ['wrong-second-post','wrong-peer-mute','view-record-refused','view-source-changed','native-prefix-refused','cleanup-not-revoked', 'malformed-user', 'read-before-membership', 'unexpected-post', 'foreign-route', 'signed-out-read', 'old-token', 'refresh-before-membership', 'refresh-late-source', 'pending-auth', 'pending-next-session', 'membership-during-command', 'auth-during-dispatch', 'held-auth-body','denial-not-forbidden','denial-wrong-reason','denial-joined','auxiliary-wrong-actor'] as const) test('actual hosted Community protocol refusal: ' + mode, async ({ browserName }, testInfo) => { assert.equal(browserName, 'chromium'); await protocol(mode, testInfo); });

for (const change of ['none', 'draft', 'consent'] as const) test('Community view baseline waits for the current roster and preserves ' + change, async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  // Only the DOM/source completion port is controlled. The real view observer,
  // keyboard traversal, bilingual checks, axe and restoration assertion run.
  await page.setContent(`<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><title>Current Community view</title><style>
    *{box-sizing:border-box}body{font:16px Arial;margin:12px}button{font:inherit;margin:3px}button:focus-visible,a:focus-visible{outline:3px solid black}main{max-width:100%;overflow-wrap:anywhere}input,textarea{max-width:100%}
    </style></head><body><div class="workspace-chrome" data-navigation-mode="home" lang="en">
    <a href="#main" data-copy="skip">Skip to main content</a><header class="workspace-chrome__header">
    <div class="workspace-chrome__school"><bdi>Fictional school</bdi></div><div class="workspace-chrome__person"><button><strong>Fictional learner</strong><small>Student</small></button></div>
    <button id="english">English</button><button id="arabic">العربية</button></header><nav class="workspace-chrome__navigation"><button data-workspace-destination="community" aria-current="page">Community</button></nav>
    <main id="main"><h1></h1><button data-copy="refresh"></button><button data-copy="back"></button><p data-copy="connected"></p><p data-copy="readonly"></p>
    <article data-post-id="${ids(1)}"><p class="community-message"></p></article><article data-post-id="${ids(2)}"><p class="community-message"></p></article>
    <fieldset id="roster" disabled><legend>Current members</legend><p role="status">Loading current member records…</p></fieldset>
    <label>Retained draft<textarea name="retained-draft">A retained fictional draft</textarea></label><label><input type="checkbox" name="retained-consent">I approve this fictional observation</label></main></div>
    <script>const messages=${JSON.stringify({ en: communityEn, ar: communityAr })},text=${JSON.stringify(hostedCommunityRecipeText)};
    function render(locale){document.documentElement.lang=locale;document.documentElement.dir=locale==='ar'?'rtl':'ltr';document.querySelector('.workspace-chrome').lang=locale;document.querySelector('.workspace-chrome__person small').textContent=locale==='ar'?'الطالب':'Student';document.querySelector('[data-copy=skip]').textContent=locale==='ar'?'انتقل إلى المحتوى الرئيسي':'Skip to main content';document.querySelector('h1').textContent=text.groupName;for(const node of document.querySelectorAll('[data-copy]'))if(node.dataset.copy!=='skip')node.textContent=messages[locale][node.dataset.copy];document.querySelectorAll('.community-message')[0].textContent=text.postBody;document.querySelectorAll('.community-message')[1].textContent=text.secondPostBody}
    document.querySelector('#english').onclick=()=>render('en');document.querySelector('#arabic').onclick=()=>render('ar');render('en');</script></body></html>`);
  const checkpoint = { stage: 'READ_ONLY_DISCUSSION' as const, role: 'student' as const, groupId: ids(100), postIds: [ids(1), ids(2)], announcementId: '', scopeGeneration: 7 };
  let currentReads = 0; const receipts: unknown[] = [];
  const observe = () => observeCommunityView(page, checkpoint, { identity, journalHeadSha256: 'd'.repeat(64), assertCurrent: async () => {
    if (++currentReads === 1) await page.locator('#roster').evaluate(node => { node.innerHTML = '<legend>Current members</legend><label><input type="checkbox">Fictional peer one</label><label><input type="checkbox">Fictional peer two</label>'; });
  } }, { record: async receipt => {
    receipts.push(receipt); if (receipts.length !== 2) return;
    if (change === 'draft') await page.locator('[name="retained-draft"]').fill('Changed fictional draft');
    if (change === 'consent') await page.locator('[name="retained-consent"]').check();
  } });
  if (change === 'none') {
    await observe(); await expect(page.locator('#roster input')).toHaveCount(2);
    await expect(page.locator('[name="retained-draft"]')).toHaveValue('A retained fictional draft'); await expect(page.locator('[name="retained-consent"]')).not.toBeChecked();
  } else await expect(observe()).rejects.toThrow(/toEqual/);
  expect(receipts).toHaveLength(2); await expect(page.locator('html')).toHaveAttribute('lang', 'en'); await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  expect(page.viewportSize()).toEqual({ width: 1366, height: 900 });
});
