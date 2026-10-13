import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';
import { transformSync } from 'esbuild';
import ts from 'typescript';
import type { HostedAcceptancePorts } from './hosted-acceptance-context';
import { createHash } from 'node:crypto';
import { canonicalReleaseExecutionJson } from './release-review';
import { hostedCommunityRecipeText as text, parseHostedCommunityCommand, type HostedCommunityScope } from './hosted-community-command';
import { hostedCommandJournalContracts, type HostedCommandJournalRecord, type HostedCommandJournalRead } from './hosted-command-journal-contracts';
import type { HostedCommunityJournalOriginal } from './hosted-community-journal';
import { prepareHostedCommunityLivePrefix } from './backend-hosted-community-artifact';
import type { HostedCommunityLivePrefixProofReceipt } from './hosted-community-live-prefix';
import {hostedCommunityViewStages,type HostedCommunityViewReceipt} from './hosted-community-view';
import {communityEn,communityAr} from '../../apps/web/features/community/messages';
import {maintenanceEn,maintenanceAr} from '../../apps/web/features/community/maintenance-messages';
import {commonEn,commonAr} from '../../apps/web/shared/i18n/common';

const hash = (value: unknown) => createHash('sha256').update(canonicalReleaseExecutionJson(value)).digest('hex');

async function api() {
  let owner: Record<string, unknown> = {};
  try { owner = await import(pathToFileURL(resolve(import.meta.dirname, 'backend-hosted-community.ts')).href); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  assert.equal(typeof owner.selectHostedCommunityActors, 'function', 'the hosted actor selector exists');
  return owner as typeof import('./backend-hosted-community');
}
test('hosted Community selects exact named reference actors and denial actors without role-first fallback', async () => {
  const { selectHostedCommunityActors } = await api();
  const seed = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../supabase/seed/identities.json'), 'utf8'));
  const selected = selectHostedCommunityActors(seed);
  assert.equal(selected.teacher.actorId, '20000000-0000-4000-8000-000000000004');
  assert.equal(selected.student.actorId, '20000000-0000-4000-8000-000000000012');
  assert.equal(selected.peer.actorId, '20000000-0000-4000-8000-000000000018');
  assert.equal(selected.parent.actorId, '20000000-0000-4000-8000-000000000072');
  assert.equal(selected.outsideClass.actorId, '20000000-0000-4000-8000-000000000013');
  assert.equal(selected.foreign.actorId, '20000000-0000-4000-8000-000000000133');
  assert.notEqual(selected.foreign.schoolId, selected.teacher.schoolId);
  for (const index of [3, 11, 17, 71, 12, 132]) { const copy = structuredClone(seed); copy.actors[index].role = 'coordinator'; assert.throws(() => selectHostedCommunityActors(copy)); }
  const duplicate = structuredClone(seed); duplicate.actors[10] = duplicate.actors[11]; assert.throws(() => selectHostedCommunityActors(duplicate));
});
test('hosted Community entry refuses ordinary local or forged context before browser or domain writes', async () => {
  const { verifyHostedCommunity } = await api();
  const result = await verifyHostedCommunity({ repoRoot: resolve(import.meta.dirname, '../..') }, { readmitWeb: async () => { throw Error('No admitted context'); } });
  assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(result.confirmedCommandCount, 0); assert.equal(result.hostedAcceptance, false); assert.equal(result.customerReady, false);
});

test('a hosted UI result cannot pass with absent auxiliary normal-session and denial observations',async()=>{
 const {verifyHostedCommunity}=await api();const result=await verifyHostedCommunity({repoRoot:resolve(import.meta.dirname,'../..')},{readmitWeb:async()=>{throw Error('No source');}});
 assert.deepEqual(result.auxiliary,{sessionsStarted:0,sessionsClosed:0,observations:[]});
});

test('shared command and auxiliary lanes reject an auxiliary POST and retire every captured normal token',async()=>{
 const root=resolve(import.meta.dirname,'../..'),url=pathToFileURL(resolve(root,'scripts/verification/backend-hosted-community.ts')).href,seed=JSON.parse(readFileSync(resolve(root,'supabase/seed/identities.json'),'utf8')),teacher={...seed.actors[3],role:'teacher'},peer={...seed.actors[17],role:'student'};
 const contexts:{listeners:Map<string,((value:unknown)=>void)[]>;route?:(route:unknown)=>Promise<void>}[]=[],cleanup:string[]=[];let writeForwards=0,blocked=0;
 const global=globalThis as typeof globalThis&{communityLaneFixture?:unknown};global.communityLaneFixture={launch:async()=>({newContext:async()=>{const fixture={listeners:new Map<string,((value:unknown)=>void)[]>()} as typeof contexts[number];contexts.push(fixture);return{newPage:async()=>({setDefaultTimeout(){},on(name:string,fn:(value:unknown)=>void){fixture.listeners.set(name,[...(fixture.listeners.get(name)??[]),fn]);}}),routeWebSocket:async()=>{},route:async(_pattern:string,fn:(route:unknown)=>Promise<void>)=>{fixture.route=fn;},close:async()=>{}};},close:async()=>{}}),cleanup:async(_url:string,method:string,headers:Record<string,string>)=>{cleanup.push(method+':'+headers.Authorization);return{status:method==='POST'?204:401,value:null};},driver:async(_page:unknown,_input:unknown,ports:{sessionStarting:(actor:unknown)=>Promise<void>})=>{
   await ports.sessionStarting(teacher);const lane=await(globalThis as typeof globalThis&{createCommunityTestLane:(kind:string,actor:unknown)=>Promise<{start:(actor:unknown)=>Promise<void>}>}).createCommunityTestLane('peer',peer);await lane.start(peer);
   for(const[index,actor]of [teacher,peer].entries()){const emit=(event:string,value:unknown)=>{for(const callback of contexts[index].listeners.get(event)??[])callback(value);},request={url:()=> 'https://auth.fixture.invalid/auth/v1/token?grant_type=password',method:()=> 'POST',headers:()=>({})};emit('request',request);emit('response',{request:()=>request,headers:()=>({}),status:()=>200,body:async()=>Buffer.from(JSON.stringify({access_token:'captured-lane-token-'+index,user:{id:actor.actorId,email:actor.email,is_anonymous:false},refresh_token:'captured-refresh-'+index})),url:()=>request.url()});}
   await new Promise<void>(done=>setTimeout(done,0));const request={url:()=> 'https://api.fixture.invalid/v1/community/rooms',method:()=> 'POST',headers:()=>({authorization:'Bearer captured-lane-token-1'})};await contexts[1].route!({request:()=>request,continue:async()=>{writeForwards++;},abort:async()=>{blocked++;}});return null;
 }};
 const hook=registerHooks({load(value,context,next){if(value.split('?')[0]!==url)return next(value,context);const source=readFileSync(resolve(root,'scripts/verification/backend-hosted-community.ts'),'utf8').replace('chromium.launch({headless:true,env})','globalThis.communityLaneFixture.launch({headless:true,env})').replace('runCustomerCommunityJourney(page,','globalThis.communityLaneFixture.driver(page,').replace('const main=await createLane(',"globalThis.createCommunityTestLane=createLane;const main=await createLane(").replace("import { requestHostedBrowserJson, type HostedBrowserCompanionWriter } from './hosted-browser-evidence';","import type { HostedBrowserCompanionWriter } from './hosted-browser-evidence';const requestHostedBrowserJson=globalThis.communityLaneFixture.cleanup;")+'\nexport {runHostedCommunityBrowser as lanesFixture};';return{format:'module',shortCircuit:true,source:transformSync(source,{loader:'ts',format:'esm'}).code};}});
 try{const owner=await import(url+'?lanes-fixture'),result={invalidations:[],unexpectedRequests:0,consoleErrors:0,consoleWarnings:0,pageErrors:0,sessionsClosed:false};await owner.lanesFixture({context:{publicConfig:{apiUrl:'https://api.fixture.invalid',supabaseUrl:'https://auth.fixture.invalid',supabasePublishableKey:'sb_publishable_fixture'},originalWeb:{webOrigin:'https://web.fixture.invalid'},assertOriginalValidity(){},readmit:async()=>{}},gate:{fail:async()=>{},scope:()=>({schoolId:teacher.schoolId,classId:'30000000-0000-4000-8000-000000000001',postIds:[],group:null,announcement:null})},actors:{teacher,peer,student:seed.actors[11],parent:seed.actors[71]},password:'synthetic-password',result});assert.equal(contexts.length,2);assert.equal(writeForwards,0);assert.equal(blocked,1);assert.equal(cleanup.length,4);assert.equal(result.sessionsClosed,false);}
 finally{hook.deregister();delete global.communityLaneFixture;delete(globalThis as Record<string,unknown>).createCommunityTestLane;}
});

test('only the exact pending API denial console response can be classified after a verified forbidden response',async()=>{
 const root=resolve(import.meta.dirname,'../..'),source=readFileSync(resolve(root,'scripts/verification/backend-hosted-community.ts'),'utf8'),ast=ts.createSourceFile('wrapper.ts',source,ts.ScriptTarget.Latest,true);let handler='';
 const visit=(node:ts.Node)=>{if(ts.isCallExpression(node)&&node.expression.getText(ast)==="page.on"&&node.arguments[0]?.getText(ast)==="'console'")handler=node.arguments[1].getText(ast);ts.forEachChild(node,visit);};visit(ast);assert(handler);
 const compiled=transformSync('('+handler+')',{loader:'ts',format:'cjs'}).code;const evaluate=(await import('node:vm')).runInNewContext;
 const result={consoleErrors:0,consoleWarnings:0},denial={path:'/v1/community/rooms/room/posts?limit=100',consoleErrors:0},callback=evaluate(compiled,{result,denial,api:'https://api.fixture.invalid'}) as(message:{type:()=>string;location:()=>{url:string};text:()=>string})=>void;
 callback({type:()=> 'error',location:()=>({url:'https://api.fixture.invalid'+denial.path}),text:()=> 'Failed to load resource: the server responded with a status of 403 (Forbidden)'});assert.equal(denial.consoleErrors,1);assert.equal(result.consoleErrors,0);
 callback({type:()=> 'error',location:()=>({url:'https://other.fixture.invalid'+denial.path}),text:()=> 'Failed to load resource: the server responded with a status of 403 (Forbidden)'});assert.equal(result.consoleErrors,1);
});

test('actual outer Community composition binds15 confirmed originals to prefix proof and retains18 receipts without native or hosted acceptance claims', async () => {
  const root = resolve(import.meta.dirname, '../..'), ownerUrl = pathToFileURL(resolve(root, 'scripts/verification/backend-hosted-community.ts')).href;
  const gateUrl = pathToFileURL(resolve(root, 'scripts/verification/hosted-community-command-gate.ts')).href;
  const seed = JSON.parse(readFileSync(resolve(root, 'supabase/seed/identities.json'), 'utf8'));
  const identity = { projectRef: 'mqxdjvsyckzocokuikmx', schoolId: seed.schoolId, sourceSha: 'a'.repeat(40), treeSha: 'b'.repeat(40), ciRunId: '31', runId: '81', runAttempt: 1, backendTransferSha256: 'c'.repeat(64), webDeploymentId: 'dpl_Web' };
  const tuple = { schoolId: identity.schoolId, classId: '30000000-0000-4000-8000-000000000001', teacherActorId: '20000000-0000-4000-8000-000000000004', studentActorId: '20000000-0000-4000-8000-000000000012', peerActorId: '20000000-0000-4000-8000-000000000018', parentActorId: '20000000-0000-4000-8000-000000000072' };
  const contracts = hostedCommandJournalContracts('community'), id = (index: number) => '93000000-0000-4000-8000-' + String(index).padStart(12, '0');
  type Mode = 'complete' | 'prefix-refused' | 'incomplete-retirement' | 'missing-prefix' | 'missing-views' | 'changed-view-head';
  let mode: Mode = 'complete', disposed = 0, admissions = 0, failures = 0, prefixCalls = 0, retirementWrites = 0;
  let gate: ReturnType<typeof import('./hosted-community-command-gate').createHostedCommunityCommandGate>;
  let records: HostedCommandJournalRecord<'community'>[] = [], states: HostedCommandJournalRead<'community'>['commands'] = [];
  const files = new Map<string, Buffer>(), proofs = new WeakMap<object, { receipt: HostedCommunityLivePrefixProofReceipt; used: boolean }>();
  let prefixReceipt: HostedCommunityLivePrefixProofReceipt | null = null;
  const append = (command: HostedCommunityJournalOriginal['command'], state: HostedCommandJournalRecord<'community'>['state'], original?: HostedCommunityJournalOriginal, receipt?: string) => {
    const payload = { version: 1, purpose: contracts.purpose, sequence: records.length + 1, previousRecordSha256: records.at(-1)?.recordSha256 ?? null, identity, command, state,
      intentSequence: original?.intentSequence ?? records.length + 1, intentRecordSha256: original?.intentRecordSha256 ?? null, httpReceiptSha256: receipt ?? null,
      nativeReceiptSha256: null, nativeProof: null, localDurabilityOnly: true };
    const record = contracts.recordSchema.parse({ ...payload, recordSha256: hash(payload) }) as HostedCommandJournalRecord<'community'>; records.push(record); return record;
  };
  const journal = {
    async intent(command: HostedCommunityJournalOriginal['command']) { const record = append(command, 'INTENT'), original = { identity, command, intentSequence: record.sequence, intentRecordSha256: record.recordSha256 }; states.push({ original, state: 'INTENT', httpReceiptSha256: null, nativeReceiptSha256: null }); return original; },
    async startForwarding(original: HostedCommunityJournalOriginal, forward: () => Promise<void>) { append(original.command, 'FORWARDING_AUTHORIZED', original); states.at(-1)!.state = 'FORWARDING_AUTHORIZED'; await forward(); },
    async recordHttpReceipt(original: HostedCommunityJournalOriginal, receipt: { receiptSha256: string }) { append(original.command, 'HTTP_CONFIRMED', original, receipt.receiptSha256); Object.assign(states.at(-1)!, { state: 'HTTP_CONFIRMED', httpReceiptSha256: receipt.receiptSha256 }); },
    async markUncertain() { failures++; },
    async read() { return structuredClone({ records, commands: states, lastRecordSha256: records.at(-1)?.recordSha256 ?? null, evidence: 'LOCAL_DURABLE_METADATA_ONLY', hostedAcceptance: false, runnerLossRecoveryVerified: false }); },
  };
  const writer = async (name: string, value: unknown) => { assert.equal(files.has(name), false); const bytes = Buffer.from(canonicalReleaseExecutionJson(value)); files.set(name, bytes); return hash(value); };
  const context = { identity, backendIdentity: { treeSha: identity.treeSha }, publicConfig: { apiUrl: 'https://api.fixture.invalid', supabaseUrl: 'https://' + identity.projectRef + '.supabase.co', supabasePublishableKey: 'sb_publishable_fixture_123456789' }, runner: { runId: identity.runId }, originalWeb: { webOrigin: 'https://web.fixture.invalid', populationReceiptSha256: 'f'.repeat(64),observedAt:'2026-10-12T01:00:00Z' },
    readmit: async () => { admissions++; }, assertOriginalValidity() {}, dispose() { disposed++; }, readSource: async (file: string) => file.includes('identities') ? Buffer.from(JSON.stringify(seed)) : Buffer.from('source-owned-producer'), createCompanions: async () => writer };
  const selectActor = (actorId: string, role: 'teacher' | 'student' | 'parent') => ({ ...seed.actors.find((row: { actorId: string }) => row.actorId === actorId), role });
  const proofOwner = async (options: { context: unknown; writer: unknown; capture: () => ReturnType<typeof gate.captureLivePrefix>; repoRoot: string }) => {
    assert.equal(options.context, context); assert.equal(options.writer, writer); assert.equal(options.repoRoot, root); assert.equal(gate.confirmedCount(), 15);
    prefixCalls++; if (mode === 'prefix-refused') throw Error('Controlled prefix native refusal');
    const captured = await options.capture(), originalFiles = new Map(captured.companions.map(row => [row.path, files.get(row.path)!]));
    const prepared = prepareHostedCommunityLivePrefix(captured, originalFiles), after = await options.capture(); assert.deepEqual(captured, after);
    const receipt: HostedCommunityLivePrefixProofReceipt = { version: 1, purpose: 'CUEVO_HOSTED_COMMUNITY_LIVE_PREFIX_PROOF', status: 'LIVE_PREFIX_NATIVE_VERIFIED', identity,
      prefixSnapshotSha256: prepared.selection.identity.prefixSnapshotSha256, journalHeadSha256: prepared.selection.identity.journalHeadSha256, companionInventorySha256: prepared.selection.identity.companionInventorySha256,
      nativeEvidenceSha256: 'a'.repeat(64),classRoomId:id(999),deliveryEventIds:[id(800)], observedAt: '2026-10-12T01:00:00Z', readOnly: true, sessionsClosed: true, customerReady: false, hostedAcceptance: false, referenceRestored: false };
    await writer('prefix-snapshot.json', prepared.snapshot); await writer('prefix-proof.json', receipt);
    const proof = Object.freeze({}); proofs.set(proof, { receipt, used: false }); prefixReceipt = receipt; return proof;
  };
  const consumeProof = (value: unknown, expected: { identity: unknown; prefixSnapshotSha256: string; journalHeadSha256: string }) => {
    const retained = value && typeof value === 'object' ? proofs.get(value) : undefined;
    if (!retained || retained.used) throw Error('Controlled opaque proof refused'); retained.used = true;
    assert.deepEqual(expected, { identity, prefixSnapshotSha256: retained.receipt.prefixSnapshotSha256, journalHeadSha256: retained.receipt.journalHeadSha256 }); return retained.receipt;
  };
  const drive = async ({ result, confirmNativePrefix }: { result: { sessionsClosed: boolean;viewObservations:HostedCommunityViewReceipt[];auxiliary:{sessionsStarted:number;sessionsClosed:number;observations:{sessionClosed:boolean}[]} }; confirmNativePrefix: () => Promise<void> }) => {
    const writes: { path: string; id: string; key: string }[] = [], membershipChangeIds: string[] = [];
    for (let index = 0; index < 18; index++) {
      if (index === 15) { if (mode === 'missing-prefix') break; gate.endSession(); gate.session(selectActor(tuple.teacherActorId, 'teacher'), 'controlled-session-13', 13); await confirmNativePrefix(); }
      const scope: HostedCommunityScope = gate.scope(), room = scope.group?.id, post = scope.postIds[0], announcement = scope.announcement?.id;
      const recipes: readonly (readonly [string, Record<string, unknown>])[] = [
        ['/v1/community/rooms', { classId: tuple.classId, name: text.groupName, type: 'GROUP', memberIds: [tuple.studentActorId] }],
        [`/v1/community/rooms/${room}/members`, { actorId: tuple.peerActorId, status: 'active', confirmAccessChange: true }],
        [`/v1/community/rooms/${room}/members`, { actorId: tuple.peerActorId, status: 'revoked', confirmAccessChange: true }],
        [`/v1/community/rooms/${room}/posts`, { body: text.postBody, replyToId: null }],
        [`/v1/community/rooms/${room}/posts`, { body: text.secondPostBody, replyToId: null }],
        [`/v1/community/posts/${post}/reactions`, { reaction: 'HELPFUL', active: true }],
        [`/v1/community/posts/${post}/reactions`, { reaction: 'HELPFUL', active: false }],
        [`/v1/community/rooms/${room}/posts`, { body: text.replyBody, replyToId: post }],
        [`/v1/community/posts/${post}/report`, { reason: text.reportReason }],
        [`/v1/community/rooms/${room}/restrict`, { actorId: tuple.studentActorId, restriction: 'MUTED', reason: text.restrictionReason, confirmModeration: true }],
        [`/v1/community/rooms/${room}/restrict`, { actorId: tuple.studentActorId, restriction: 'NONE', reason: text.restrictionReason, confirmModeration: true }],
        [`/v1/community/posts/${post}/moderate`, { action: 'HIDE', reason: text.moderationReason, confirmModeration: true }],
        [`/v1/community/posts/${post}/moderate`, { action: 'RESTORE', reason: text.moderationReason, confirmModeration: true }],
        ['/v1/community/announcements', { classId: tuple.classId, title: text.announcementTitle, body: text.announcementBody, parentVisible: true }],
        [`/v1/community/notifications/${announcement}/read`, { expectedRevision: 1 }],
        [`/v1/community/rooms/${room}/members`, { actorId: tuple.studentActorId, status: 'revoked', confirmAccessChange: true }],
        [`/v1/community/groups/${room}/lifecycle`, { name: text.groupName, state: 'CLOSED', expectedRevision: 1, reason: text.groupClosureReason, confirmChange: true }],
        [`/v1/community/announcements/${announcement}/withdraw`, { expectedRevision: 1, reason: text.announcementWithdrawalReason, confirmWithdrawal: true }],
      ];
      const [path, body] = recipes[index], actorId = index === 14 ? tuple.parentActorId : [3, 4, 5, 6, 7, 8].includes(index) ? tuple.studentActorId : tuple.teacherActorId;
      const role: 'parent' | 'student' | 'teacher' = index === 14 ? 'parent' : actorId === tuple.studentActorId ? 'student' : 'teacher', actor = selectActor(actorId, role), generation = index < 3 ? 1 : index < 9 ? 3 : index === 9 ? 5 : index < 14 ? 9 : index === 14 ? 11 : 13;
      gate.endSession(); gate.session(actor, 'controlled-session-' + generation, generation);
      const command = parseHostedCommunityCommand(path, JSON.stringify(body), { actorId, schoolId: tuple.schoolId, role }, scope), receiptId = [5, 6].includes(index) ? post! : index === 14 || index === 17 ? announcement! : index === 16 ? room! : id(index + 1);
      const receipt: { id: string; [key: string]: unknown } = index === 14 ? { id: receiptId, status: 'READ', revision: 1 } : index === 16 ? { id: receiptId, status: 'CLOSED', revision: 2 } : index === 17 ? { id: receiptId, status: 'WITHDRAWN', revision: 2 } : { id: receiptId, command: command.owner === 'normal' ? command.nativeCommand : '' };
      if (index === 0) receipt.roomId = receiptId;
      if (command.operation === 'post.create') Object.assign(receipt, { roomId: room, body: body.body, replyToId: body.replyToId, actorId, createdAt: '2026-10-12T01:00:00Z', status: 'VISIBLE' });
      const intent = { actor, path, scopeGeneration: generation }, key = 'outer-original-' + index, request = { method: () => 'POST', url: () => context.publicConfig.apiUrl + path, headers: () => ({ authorization: 'Bearer controlled-session-' + generation, 'x-school-id': tuple.schoolId, 'idempotency-key': key, 'content-type': 'application/json' }), postDataBuffer: () => Buffer.from(JSON.stringify(body)) };
      await gate.prepare(intent); await gate.forward(request as never, async () => { if (index >= 15) retirementWrites++; }); await gate.confirm({ ...intent, request: request as never, key, body, receipt, status: 200 }, 'outer-request-' + index);
      if ([1, 2, 15].includes(index)) membershipChangeIds.push(receiptId); writes.push({ path, id: receiptId, key });
      const stage=hostedCommunityViewStages.find(row=>row.confirmedCommandCount===index+1);
      // Controlled composition rows exercise the outer receipt contract only.
      // Actual keyboard, Axe and browser evidence belongs to the protocol suite.
      if(stage&&mode!=='missing-views')for(const locale of ['en','ar'] as const){const t=locale==='en'?communityEn:communityAr,m=locale==='en'?maintenanceEn:maintenanceAr,c=locale==='en'?commonEn:commonAr,current=gate.scope(),base=[t.refresh,t.back,t.connected];
        const controls=stage.stage==='GROUP_READY'?[...base,t.members,t.actor,t.membershipStatus,t.confirmModeration]:stage.stage==='DISCUSSION_READY'?[...base,t.post,t.message,t.reply,t.report,t.reason,c.cancel]:stage.stage==='READ_ONLY_DISCUSSION'?[...base,t.readonly]:stage.stage==='MODERATION_RESTORED'?[...base,t.reports,m.reportedMessage,m.reportReview,t.reason,c.cancel]:stage.stage==='FAMILY_NOTIFICATION_READ'?[t.refresh,t.read,t.notifications,t.closeAnnouncement,t.openAnnouncement]:[t.refresh,t.empty,t.createAnnouncement,t.rooms,t.openRoom,m.closedNote,t.back,t.announcements];
        result.viewObservations.push({version:1,stage:stage.stage,role:stage.role,locale,viewport:locale==='en'?{width:1366,height:900}:{width:390,height:844},identity,scopeGeneration:stage.scopeGeneration,journalHeadSha256:mode==='changed-view-head'?'f'.repeat(64):records.at(-1)!.recordSha256,sourceSha256:hash({groupId:current.group!.id,postIds:index===0?[]:current.postIds.slice(0,2),announcementId:index<14?'':current.announcement!.id}),observedAt:'2026-10-12T01:01:00Z',heading:stage.stage==='FAMILY_NOTIFICATION_READ'?t.notifications:stage.stage==='RETIREMENT_CONFIRMED'?t.announcements:text.groupName,controls,keyboardControl:stage.stage==='DISCUSSION_READY'?t.report:stage.stage==='MODERATION_RESTORED'?m.reportReview:stage.stage==='FAMILY_NOTIFICATION_READ'?t.closeAnnouncement:t.refresh,keyboardVerified:true,axe:{completed:true,violations:0},reflow:{horizontalOverflow:false,text200Percent:stage.stage==='DISCUSSION_READY'||stage.stage==='FAMILY_NOTIFICATION_READ'},reducedMotion:true,nativeExecutionVerified:false,hostedAcceptance:false,customerReady:false});
      }
    }
    result.sessionsClosed = true; result.auxiliary={sessionsStarted:3,sessionsClosed:3,observations:Array.from({length:3},()=>({sessionClosed:true}))}; const scope = gate.scope();
    return { groupId: scope.group!.id, postIds: scope.postIds.slice(0, 2), replyId: scope.postIds[2], reportId: id(9), membershipChangeIds, announcementId: scope.announcement!.id, writes,
      sessionStartedCount: 7, sessionEndedCount: 7, cleanupCount: 1, nativeChainVerified: false, hostedAcceptance: false, customerReady: false,
      retirement: { status: ['complete','missing-views','changed-view-head'].includes(mode) ? 'CONFIRMED_UI_ONLY' : 'NOT_REQUESTED', groupClosed: ['complete','missing-views','changed-view-head'].includes(mode), announcementWithdrawn: ['complete','missing-views','changed-view-head'].includes(mode), mainMemberRevoked: ['complete','missing-views','changed-view-head'].includes(mode), referenceRestored: false } };
  };
  const globals = globalThis as typeof globalThis & { communityCompositionFixture?: unknown }; globals.communityCompositionFixture = { context, journal, drive, proofOwner, consumeProof, setGate(value: typeof gate) { gate = value; } };
  const hooks = registerHooks({ load(url, moduleContext, next) {
    if (url === gateUrl + '?outer-composition') { const source = readFileSync(resolve(root, 'scripts/verification/hosted-community-command-gate.ts'), 'utf8').replace("import { consumeHostedCommunityLivePrefixProof } from './hosted-community-live-prefix';", 'const consumeHostedCommunityLivePrefixProof=globalThis.communityCompositionFixture.consumeProof;'); return { format: 'module', shortCircuit: true, source: transformSync(source, { loader: 'ts', format: 'esm' }).code }; }
    if (url !== ownerUrl + '?outer-composition') return next(url, moduleContext);
    const source = readFileSync(resolve(root, 'scripts/verification/backend-hosted-community.ts'), 'utf8')
      .replace("import { hostedAcceptanceInputSchema, prepareHostedAcceptanceContext, type HostedAcceptanceContext, type HostedAcceptancePorts } from './hosted-acceptance-context';", "import { hostedAcceptanceInputSchema, type HostedAcceptanceContext, type HostedAcceptancePorts } from './hosted-acceptance-context'; const prepareHostedAcceptanceContext=async()=>globalThis.communityCompositionFixture.context;")
      .replace("import { createHostedCommunityJournal } from './hosted-community-journal';", 'const createHostedCommunityJournal=async()=>globalThis.communityCompositionFixture.journal;')
      .replace("import { createHostedCommunityCommandGate } from './hosted-community-command-gate';", "import { createHostedCommunityCommandGate as originalGate } from './hosted-community-command-gate.ts?outer-composition'; const createHostedCommunityCommandGate=(value)=>{const gate=originalGate(value);globalThis.communityCompositionFixture.setGate(gate);return gate;};")
      .replace("import {verifyHostedCommunityLivePrefix,type HostedCommunityLivePrefixProofReceipt} from './hosted-community-live-prefix';", "import type {HostedCommunityLivePrefixProofReceipt} from './hosted-community-live-prefix'; const verifyHostedCommunityLivePrefix=globalThis.communityCompositionFixture.proofOwner;")
      .replace('async function runHostedCommunityBrowser(', 'async function originalRunHostedCommunityBrowser(')
      + '\nconst runHostedCommunityBrowser=globalThis.communityCompositionFixture.drive;';
    return { format: 'module', shortCircuit: true, source: transformSync(source, { loader: 'ts', format: 'esm', target: 'es2023' }).code };
  } });
  try {
    const owner = await import(ownerUrl + '?outer-composition') as typeof import('./backend-hosted-community');
    const input = { repoRoot: root, releaseSha: identity.sourceSha, ciRunId: identity.ciRunId, backendRunId: '71', backendRunAttempt: 1, artifactId: '91', transferSha256: identity.backendTransferSha256, populationReceiptSha256: 'f'.repeat(64), web: { teamId: 'team_Cuevo', projectId: 'prj_Web', target: 'preview' }, webDeployment: { id: identity.webDeploymentId, url: 'https://web.fixture.invalid' }, githubToken: 'metadata-fixture', vercelToken: 'v'.repeat(24), syntheticPassword: 'fictional-test-password' };
    const ports: HostedAcceptancePorts = { readmitWeb: async () => { throw Error('Controlled preparation owns fixture only'); } };
    for (mode of ['complete', 'prefix-refused', 'incomplete-retirement', 'missing-prefix','missing-views','changed-view-head'] as const) {
      records = []; states = []; files.clear(); prefixReceipt = null; admissions = 0; prefixCalls = 0; retirementWrites = 0;
      const result = await owner.verifyHostedCommunity(input, ports), manifest = JSON.parse(files.get('command-manifest.json')!.toString()), saved = JSON.parse(files.get('result.json')!.toString());
      assert.equal(result.status, mode === 'complete' ? 'UI_RECIPE_VERIFIED_NATIVE_PENDING' : 'REQUIRES_REVIEW', mode);
      assert.equal(result.nativeChainVerified, false); assert.equal(result.privateReconnectVerified, false); assert.equal(result.referenceRestored, false); assert.equal(result.hostedAcceptance, false); assert.equal(result.customerReady, false);
      assert.deepEqual(saved, result); assert.equal(result.companionManifestSha256, hash(manifest)); assert.deepEqual(manifest.commands, gate!.receipts()); assert.deepEqual(manifest.journal.commands, states);
      assert.deepEqual(manifest.viewObservations,result.viewObservations);assert.equal(result.viewObservations.length,mode==='missing-views'?0:mode==='prefix-refused'||mode==='missing-prefix'?10:12);
      assert.equal(manifest.commands.length, mode === 'prefix-refused' || mode === 'missing-prefix' ? 15 : 18);
      assert.equal(prefixCalls, mode === 'missing-prefix' ? 0 : 1); assert.equal(retirementWrites, mode === 'prefix-refused' || mode === 'missing-prefix' ? 0 : 3);
      if (prefixReceipt) { const receipt = prefixReceipt as HostedCommunityLivePrefixProofReceipt; assert.deepEqual(manifest.livePrefixProof, { snapshotSha256: receipt.prefixSnapshotSha256, proofSha256: hash(receipt) }); const snapshot = JSON.parse(files.get('prefix-snapshot.json')!.toString()); assert.equal(snapshot.commands.length, 15); assert.deepEqual(snapshot.commands, manifest.commands.slice(0, 15)); assert.deepEqual(JSON.parse(files.get('prefix-proof.json')!.toString()), receipt); }
      else assert.equal(manifest.livePrefixProof, null);
      assert.equal(admissions, manifest.commands.length * 2 + (mode === 'prefix-refused' ? 0 : 1)); assert(!JSON.stringify(manifest).includes('controlled-session-')); assert.equal(manifest.nativeChainVerified, false); assert.equal(manifest.hostedAcceptance, false);
    }
    assert.equal(disposed, 6); assert.equal(failures, 0);
  } finally { hooks.deregister(); delete globals.communityCompositionFixture; }
});
test('browser context page and route setup failures close the originally launched browser',async()=>{
 const root=resolve(import.meta.dirname,'../..'),url=pathToFileURL(resolve(import.meta.dirname,'backend-hosted-community.ts')).href;
 const global=globalThis as typeof globalThis&{communityAcquisitionFixture?:unknown};
 for(const mode of ['context','page','websocket-route','http-route']){
  let closed=0;
  const page={setDefaultTimeout(){},on(){}};
  const context={close:async()=>{},newPage:async()=>{if(mode==='page')throw Error('Page unavailable');return page;},routeWebSocket:async()=>{if(mode==='websocket-route')throw Error('Websocket route unavailable');},route:async()=>{throw Error('HTTP route unavailable');}};
  global.communityAcquisitionFixture={launch:async()=>({newContext:async()=>{if(mode==='context')throw Error('Context unavailable');return context;},close:async()=>{closed++;}})};
  const hook=registerHooks({load(value,context,next){if(value.split('?')[0]!==url)return next(value,context);const source=readFileSync(resolve(root,'scripts/verification/backend-hosted-community.ts'),'utf8').replace('chromium.launch({headless:true,env})','globalThis.communityAcquisitionFixture.launch({ headless: true, env })')+'\nexport {runHostedCommunityBrowser as acquisitionFixture};';return{format:'module',shortCircuit:true,source:transformSync(source,{loader:'ts',format:'esm',target:'es2023'}).code};}});
  try{const owner=await import(url+'?acquisition='+mode);assert.equal(await owner.acquisitionFixture({context:{publicConfig:{apiUrl:'https://api.fixture.invalid',supabaseUrl:'https://auth.fixture.invalid',supabasePublishableKey:'sb_publishable_fixture'},originalWeb:{webOrigin:'https://web.fixture.invalid'},assertOriginalValidity(){}},gate:{fail:async()=>{}},actors:{},password:'synthetic-password',result:{}}),null);assert.equal(closed,1,mode);}
  finally{hook.deregister();delete global.communityAcquisitionFixture;}
 }
});

test('actual browser session routing rejects an old same-actor token and unresolved Auth during closure',async()=>{
 const root=resolve(import.meta.dirname,'../..'),url=pathToFileURL(resolve(import.meta.dirname,'backend-hosted-community.ts')).href;
 const seed=JSON.parse(readFileSync(resolve(root,'supabase/seed/identities.json'),'utf8'));
 const teacher=seed.actors[3],actor={...teacher,role:'teacher'},api='https://api.fixture.invalid',auth='https://mqxdjvsyckzocokuikmx.supabase.co';
 const global=globalThis as typeof globalThis&{communitySessionFixture?:unknown};
 for(const mode of ['old-token','pending-auth']){
  const listeners=new Map<string,((value:unknown)=>void)[]>();let routeOwner:((route:unknown)=>Promise<void>)|undefined,aborted=0,continued=0;
  const page={setDefaultTimeout(){},on(name:string,fn:(value:unknown)=>void){listeners.set(name,[...(listeners.get(name)??[]),fn]);}};
  const emit=(name:string,value:unknown)=>{for(const callback of listeners.get(name)??[])callback(value);};
  const context={newPage:async()=>page,routeWebSocket:async()=>{},route:async(_pattern:string,handler:(route:unknown)=>Promise<void>)=>{routeOwner=handler;},close:async()=>{}};
  const request=()=>({url:()=>auth+'/auth/v1/token?grant_type=password',method:()=> 'POST',headers:()=>({apikey:'sb_publishable_fixture'})});
  const mint=(token:string)=>{const issued=request();emit('request',issued);emit('response',{request:()=>issued,headers:()=>({}),status:()=>200,body:async()=>Buffer.from(JSON.stringify({access_token:token,user:{id:actor.actorId,email:actor.email,is_anonymous:false},refresh_token:'refresh-'+token})),url:()=>issued.url()});};
  global.communitySessionFixture={launch:async()=>({newContext:async()=>context,close:async()=>{}}),driver:async(_page:unknown,_input:unknown,ports:{sessionStarting:(actor:unknown)=>Promise<void>;sessionEnded:()=>Promise<void>})=>{
    await ports.sessionStarting(actor);mint('first-session-token-123456');
   await new Promise<void>(done=>setTimeout(done,0));
   await ports.sessionEnded();await ports.sessionStarting(actor);mint('second-session-token-123456');
   const headers={authorization:'Bearer '+(mode==='old-token'?'first-session-token-123456':'second-session-token-123456')};
   const read={url:()=>api+'/v1/me',method:()=> 'GET',headers:()=>headers};
   emit('request',read);
    await routeOwner!({request:()=>read,continue:async()=>{continued++;},abort:async()=>{aborted++;}});
   if(mode==='pending-auth')emit('request',request());
   return null;
  }};
   const hook=registerHooks({load(value,context,next){if(value.split('?')[0]!==url)return next(value,context);let source=readFileSync(resolve(root,'scripts/verification/backend-hosted-community.ts'),'utf8')
   .replace('chromium.launch({headless:true,env})','globalThis.communitySessionFixture.launch({ headless: true, env })')
   .replace('runCustomerCommunityJourney(page,','globalThis.communitySessionFixture.driver(page,')
   .replace("import { requestHostedBrowserJson, type HostedBrowserCompanionWriter } from './hosted-browser-evidence';","import type { HostedBrowserCompanionWriter } from './hosted-browser-evidence'; const requestHostedBrowserJson=async(url,method)=>({status:method==='POST'?204:401,value:null});");
   source+='\nexport {runHostedCommunityBrowser as sessionFixture};';return{format:'module',shortCircuit:true,source:transformSync(source,{loader:'ts',format:'esm',target:'es2023'}).code};}});
  try{const owner=await import(url+'?session='+mode+'-'+Date.now()),result={unexpectedRequests:0,consoleErrors:0,consoleWarnings:0,pageErrors:0,sessionsClosed:false,invalidations:[]};
   const observed=await owner.sessionFixture({context:{publicConfig:{apiUrl:api,supabaseUrl:auth,supabasePublishableKey:'sb_publishable_fixture'},originalWeb:{webOrigin:'https://web.fixture.invalid'},assertOriginalValidity(){},readmit:async()=>{}},gate:{fail:async()=>{},endSession(){},scope:()=>({schoolId:teacher.schoolId,classId:'30000000-0000-4000-8000-000000000001',postIds:[],group:null,announcement:null})},actors:{teacher,student:seed.actors[11],peer:seed.actors[17],parent:seed.actors[71]},password:'synthetic-password',result});
   assert.equal(observed,null);if(mode==='old-token'){assert.equal(aborted,1);assert.equal(continued,0);}else{assert.equal(continued,1);assert.equal(result.sessionsClosed,false,'unresolved Auth can have an unknown minted token');}
  }finally{hook.deregister();delete global.communitySessionFixture;}
 }
});

test('a sent unresolved Auth request blocks the next actor before any second login starts',async()=>{
 const root=resolve(import.meta.dirname,'../..'),url=pathToFileURL(resolve(import.meta.dirname,'backend-hosted-community.ts')).href,seed=JSON.parse(readFileSync(resolve(root,'supabase/seed/identities.json'),'utf8')),teacher={...seed.actors[3],role:'teacher'};
 const listeners=new Map<string,((value:unknown)=>void)[]>();let secondStarted=false;
 const page={setDefaultTimeout(){},on(name:string,fn:(value:unknown)=>void){listeners.set(name,[...(listeners.get(name)??[]),fn]);}},emit=(name:string,value:unknown)=>{for(const callback of listeners.get(name)??[])callback(value);};
 const global=globalThis as typeof globalThis&{communityPendingFixture?:unknown};global.communityPendingFixture={launch:async()=>({newContext:async()=>({newPage:async()=>page,routeWebSocket:async()=>{},route:async()=>{},close:async()=>{}}),close:async()=>{}}),driver:async(_page:unknown,_input:unknown,ports:{sessionStarting:(actor:unknown)=>Promise<void>;sessionEnded:()=>Promise<void>})=>{await ports.sessionStarting(teacher);emit('request',{url:()=> 'https://mqxdjvsyckzocokuikmx.supabase.co/auth/v1/token?grant_type=refresh_token',method:()=> 'POST',headers:()=>({})});await ports.sessionEnded();await ports.sessionStarting(teacher);secondStarted=true;return null;}};
 const hook=registerHooks({load(value,context,next){if(value.split('?')[0]!==url)return next(value,context);const source=readFileSync(resolve(root,'scripts/verification/backend-hosted-community.ts'),'utf8').replace('chromium.launch({headless:true,env})','globalThis.communityPendingFixture.launch({ headless: true, env })').replace('runCustomerCommunityJourney(page,','globalThis.communityPendingFixture.driver(page,')+'\nexport {runHostedCommunityBrowser as pendingFixture};';return{format:'module',shortCircuit:true,source:transformSync(source,{loader:'ts',format:'esm',target:'es2023'}).code};}});
 try{const owner=await import(url+'?pending-boundary=1');const result={unexpectedRequests:0,consoleErrors:0,consoleWarnings:0,pageErrors:0,sessionsClosed:false,invalidations:[]};await owner.pendingFixture({context:{publicConfig:{apiUrl:'https://api.fixture.invalid',supabaseUrl:'https://mqxdjvsyckzocokuikmx.supabase.co',supabasePublishableKey:'sb_publishable_fixture'},originalWeb:{webOrigin:'https://web.fixture.invalid'},assertOriginalValidity(){},readmit:async()=>{}},gate:{fail:async()=>{},endSession(){},scope:()=>({schoolId:teacher.schoolId,classId:'30000000-0000-4000-8000-000000000001',postIds:[],group:null,announcement:null})},actors:{teacher,student:seed.actors[11],peer:seed.actors[17],parent:seed.actors[71]},password:'synthetic-password',result});assert.equal(secondStarted,false);assert.equal(result.sessionsClosed,false);}
 finally{hook.deregister();delete global.communityPendingFixture;}
});

test('a latest token refresh revalidates membership while stale rotation responses cannot replace it',async()=>{
 const root=resolve(import.meta.dirname,'../..'),url=pathToFileURL(resolve(import.meta.dirname,'backend-hosted-community.ts')).href,seed=JSON.parse(readFileSync(resolve(root,'supabase/seed/identities.json'),'utf8')),teacher={...seed.actors[3],role:'teacher'},api='https://api.fixture.invalid',auth='https://mqxdjvsyckzocokuikmx.supabase.co';
 const listeners=new Map<string,((value:unknown)=>void)[]>(),emit=(name:string,value:unknown)=>{for(const fn of listeners.get(name)??[])fn(value);};let routes:((route:unknown)=>Promise<void>)|undefined,forwards=0,denials=0;const gateTokens:string[]=[];
 const page={setDefaultTimeout(){},on(name:string,fn:(value:unknown)=>void){listeners.set(name,[...(listeners.get(name)??[]),fn]);}},browserContext={newPage:async()=>page,routeWebSocket:async()=>{},route:async(_pattern:string,fn:(route:unknown)=>Promise<void>)=>{routes=fn;},close:async()=>{}};
 const membership={userId:teacher.actorId,schoolId:teacher.schoolId,membershipId:'93000000-0000-4000-8000-000000000001',role:'teacher',entitlements:['community'],displayName:teacher.displayName,school:{id:teacher.schoolId,name:'Fictional school'}};
 const request=(path:string,token:string)=>({url:()=>path,method:()=> 'GET',headers:()=>({authorization:'Bearer '+token,'x-school-id':teacher.schoolId})});
 const send=async(req:ReturnType<typeof request>)=>{emit('request',req);await routes!({request:()=>req,continue:async()=>{forwards++;},abort:async()=>{denials++;}});};
 const respond=(req:unknown,value:unknown)=>emit('response',{request:()=>req,headers:()=>({}),status:()=>200,body:async()=>Buffer.from(JSON.stringify(value)),url:()=>api+'/v1/me'});
 const mint=async(token:string)=>{const req={url:()=>auth+'/auth/v1/token?grant_type=refresh_token',method:()=> 'POST',headers:()=>({apikey:'sb_publishable_fixture'})};emit('request',req);respond(req,{access_token:token,user:{id:teacher.actorId,email:teacher.email,is_anonymous:false},refresh_token:'refresh-'+token});await new Promise<void>(done=>setTimeout(done,0));};
 const global=globalThis as typeof globalThis&{communityRefreshFixture?:unknown};global.communityRefreshFixture={launch:async()=>({newContext:async()=>browserContext,close:async()=>{}}),driver:async(_page:unknown,_input:unknown,ports:{sessionStarting:(actor:unknown)=>Promise<void>})=>{
  await ports.sessionStarting(teacher);await mint('first-valid-session-token');const first=request(api+'/v1/me','first-valid-session-token');await send(first);respond(first,membership);await new Promise<void>(done=>setTimeout(done,0));
  await mint('second-valid-session-token');const second=request(api+'/v1/me','second-valid-session-token');await send(second);respond(second,membership);await new Promise<void>(done=>setTimeout(done,0));
  respond(first,membership);await new Promise<void>(done=>setTimeout(done,0));await send(request(api+'/v1/community/rooms?limit=100','second-valid-session-token'));return null;
 }};
 const hook=registerHooks({load(value,context,next){if(value.split('?')[0]!==url)return next(value,context);const source=readFileSync(resolve(root,'scripts/verification/backend-hosted-community.ts'),'utf8').replace('chromium.launch({headless:true,env})','globalThis.communityRefreshFixture.launch({ headless: true, env })').replace('runCustomerCommunityJourney(page,','globalThis.communityRefreshFixture.driver(page,').replace("import { requestHostedBrowserJson, type HostedBrowserCompanionWriter } from './hosted-browser-evidence';","import type { HostedBrowserCompanionWriter } from './hosted-browser-evidence'; const requestHostedBrowserJson=async(url,method)=>({status:method==='POST'?204:401,value:null});")+'\nexport {runHostedCommunityBrowser as refreshFixture};';return{format:'module',shortCircuit:true,source:transformSync(source,{loader:'ts',format:'esm',target:'es2023'}).code};}});
 try{const owner=await import(url+'?refresh=1'),result={unexpectedRequests:0,consoleErrors:0,consoleWarnings:0,pageErrors:0,sessionsClosed:false,invalidations:[]};await owner.refreshFixture({context:{publicConfig:{apiUrl:api,supabaseUrl:auth,supabasePublishableKey:'sb_publishable_fixture'},originalWeb:{webOrigin:'https://web.fixture.invalid'},assertOriginalValidity(){},readmit:async()=>{}},gate:{fail:async()=>{},session(_actor:unknown,token:string){gateTokens.push(token);},endSession(){},scope:()=>({schoolId:teacher.schoolId,classId:'30000000-0000-4000-8000-000000000001',postIds:[],group:null,announcement:null})},actors:{teacher,student:seed.actors[11],peer:seed.actors[17],parent:seed.actors[71]},password:'synthetic-password',result});assert.equal(forwards,3);assert.equal(denials,0);assert.deepEqual(gateTokens,['first-valid-session-token','second-valid-session-token']);}
 finally{hook.deregister();delete global.communityRefreshFixture;}
});

async function boundaryLane(mode:'forward-gap'|'replacement'|'replacement-request-id'|'replacement-deadline'|'replacement-late-join'|'replacement-header'|'replacement-utf8'|'replacement-expired'|'replacement-join'|'replacement-auth'|'replacement-query'|'replacement-event'|'replacement-token'|'replacement-invalid-body'|'replacement-missing'|'held-session'|'held-expiry'|'body-rejection-diagnostic'|'body-rejection-unknown'|'logout-global'|'logout-duplicate'|'user-query'|'logout-local'|'user-current'|'preflight-global'){
 const root=resolve(import.meta.dirname,'../..'),url=pathToFileURL(resolve(root,'scripts/verification/backend-hosted-community.ts')).href,seed=JSON.parse(readFileSync(resolve(root,'supabase/seed/identities.json'),'utf8')),teacher={...seed.actors[3],role:'teacher'},api='https://api.fixture.invalid',auth='https://mqxdjvsyckzocokuikmx.supabase.co',token='captured-boundary-token-123';
 const groupId='93000000-0000-4000-8000-000000000001',eventId='93000000-0000-4000-8000-000000000004',classId='30000000-0000-4000-8000-000000000001';let expired=false,forwarded=0,aborted=0,release!:()=>void,entered!:()=>void;const diagnostic:{phase:string;path?:string;actorId?:string;generation?:number;clean?:boolean;failure?:string}[]=[];
 const held=new Promise<void>(done=>release=done),began=new Promise<void>(done=>entered=done),listeners=new Map<string,((value:unknown)=>void)[]>();let route!:(value:unknown)=>Promise<void>;
 const page={setDefaultTimeout(){},on(name:string,fn:(value:unknown)=>void){listeners.set(name,[...(listeners.get(name)??[]),fn]);}},emit=(name:string,value:unknown)=>{for(const callback of listeners.get(name)??[])callback(value);};
 const member={userId:teacher.actorId,schoolId:teacher.schoolId,membershipId:'93000000-0000-4000-8000-000000000900',role:'teacher',entitlements:['community'],displayName:teacher.displayName,school:{id:teacher.schoolId,name:'Fictional school'}};
 const result={invalidations:[] as {eventId:string;roomId:string;schoolId:string;actorId:string;generation:number;joinProof:{joinRef:string;replyRef:string};observedAt:string}[],deliveryRereads:[],unexpectedRequests:0,consoleErrors:0,consoleWarnings:0,pageErrors:0,sessionsClosed:false,failure:null as import('./backend-hosted-community').HostedCommunityFailure|null};
 let responseOrdinal=0;const responseIds=new WeakMap<object,string>();const response=(request:unknown,value:unknown,body=async()=>Buffer.from(JSON.stringify(value)))=>{let requestId=responseIds.get(request as object);if(!requestId){requestId='boundary-source-'+(++responseOrdinal);responseIds.set(request as object,requestId);}return{request:()=>request,headers:()=>({'x-request-id':requestId!}),status:()=>200,body,url:()=>api+'/v1/me'};};
 const global=globalThis as typeof globalThis&{communityBoundaryFixture?:unknown};global.communityBoundaryFixture={launch:async()=>({newContext:async()=>({newPage:async()=>page,routeWebSocket:async()=>{},route:async(_pattern:string,fn:(value:unknown)=>Promise<void>)=>{route=fn;},close:async()=>{}}),close:async()=>{}}),driver:async(_page:unknown,_input:unknown,ports:{sessionStarting:(actor:unknown)=>Promise<void>;sessionEnded:()=>Promise<void>;verifyQuality:()=>Promise<void>})=>{
  await ports.sessionStarting(teacher);const authRequest={url:()=>auth+'/auth/v1/token?grant_type=password',method:()=> 'POST',headers:()=>({})};emit('request',authRequest);emit('response',response(authRequest,{access_token:token,refresh_token:'captured-refresh-1',user:{id:teacher.actorId,email:teacher.email,is_anonymous:false}}));await new Promise<void>(done=>setTimeout(done,0));
  const me={url:()=>api+'/v1/me',method:()=> 'GET',headers:()=>({authorization:'Bearer '+token,'x-school-id':teacher.schoolId})};emit('request',me);await route({request:()=>me,continue:async()=>{},abort:async()=>{aborted++;}});emit('response',response(me,member));await new Promise<void>(done=>setTimeout(done,0));
  if(mode==='forward-gap'){
   result.invalidations.push({eventId,roomId:groupId,schoolId:teacher.schoolId,actorId:teacher.actorId,generation:1,joinProof:{joinRef:'1',replyRef:'1'},observedAt:new Date().toISOString()});
   const path=api+'/v1/community/rooms/'+groupId+'/posts?limit=100',heldRequest={url:()=>path,method:()=> 'GET',headers:me.headers,failure:()=>null};
   (globalThis as unknown as {forwardGap:()=>Promise<void>}).forwardGap=async()=>{emit('request',heldRequest);await route({request:()=>heldRequest,continue:async()=>{},abort:async()=>{aborted++;}});emit('response',response(heldRequest,{},async()=>{entered();await held;return Buffer.from('{"items":[]}')}));await began;};
   const post={url:()=>api+'/v1/community/rooms/'+groupId+'/posts',method:()=> 'POST',headers:me.headers};let passed=false;
   const forwarding=route({request:()=>post,continue:async()=>{passed=true;forwarded++;},abort:async()=>{aborted++;}});
   await began;await new Promise<void>(done=>setTimeout(done,0));assert.equal(passed,false,'Final forwarding waits for a body created during gate persistence');release();await forwarding;assert.equal(passed,true);return null;
  }  if(mode.startsWith('replacement')){
   result.invalidations.push({eventId,roomId:groupId,schoolId:teacher.schoolId,actorId:teacher.actorId,generation:1,joinProof:{joinRef:'1',replyRef:'1'},observedAt:new Date().toISOString()});
   const path=api+'/v1/community/rooms/'+groupId+'/posts?limit=100',cancelled={url:()=>path,method:()=> 'GET',headers:me.headers,failure:()=>({errorText:'net::ERR_ABORTED'})};
   if(mode==='replacement-request-id'){
    const original={url:()=>path,method:()=> 'GET',headers:me.headers};emit('request',original);await route({request:()=>original,continue:async()=>{},abort:async()=>{aborted++;}});emit('response',response(original,{items:[{id:'93000000-0000-4000-8000-000000000005'}]}));await ports.verifyQuality();assert.equal(result.deliveryRereads.length,1);
   }   emit('request',cancelled);await route({request:()=>cancelled,continue:async()=>{forwarded++;},abort:async()=>{aborted++;}});
   if(mode==='replacement-header'||mode==='replacement-utf8'){
    const rejected=response(cancelled,{},mode==='replacement-utf8'?async()=>Buffer.from([0xff]):async()=>{throw Error('Native cancelled body')});
    if(mode==='replacement-header')rejected.headers=()=>({'x-request-id':'boundary-source-1','content-length':'65537'});
    emit('response',rejected);await assert.rejects(ports.verifyQuality());assert.equal(result.deliveryRereads.length,0);return null;
   }
   emit('response',response(cancelled,{},async()=>{throw Error('Native cancelled body');}));await new Promise<void>(done=>setTimeout(done,0));
   assert.equal(result.deliveryRereads.length,mode==='replacement-request-id'?1:0,'Canceled body has no positive receipt');
   if(mode==='replacement-expired'){expired=true;await ports.sessionEnded();await assert.rejects(ports.verifyQuality());return null;}
   if(mode==='replacement-join'){result.invalidations[0].joinProof={joinRef:'2',replyRef:'2'};}
   if(mode==='replacement-auth'){emit('request',authRequest);await assert.rejects(ports.verifyQuality());return null;}
   if(mode==='replacement-missing'){await ports.sessionEnded();await assert.rejects(ports.verifyQuality());assert.equal(result.deliveryRereads.length,0);return null;}
   if(mode==='replacement-event')result.invalidations.push({eventId:'93000000-0000-4000-8000-000000000008',roomId:groupId,schoolId:teacher.schoolId,actorId:teacher.actorId,generation:1,joinProof:{joinRef:'1',replyRef:'1'},observedAt:new Date().toISOString()});
   const replacement={url:()=>mode==='replacement-query'?path.replace('limit=100','limit=99'):path,method:()=> 'GET',headers:()=>mode==='replacement-token'?{...me.headers(),authorization:'Bearer wrong-token'}:me.headers(),failure:()=>null};emit('request',replacement);await route({request:()=>replacement,continue:async()=>{forwarded++;},abort:async()=>{aborted++;}});
   if(mode==='replacement-query'||mode==='replacement-token'){assert.equal(aborted,1);await assert.rejects(ports.verifyQuality());return null;}
   assert.equal(aborted,0,'Current replacement must be admitted while canceled evidence is outstanding');
   if(mode==='replacement-request-id'){const conflicting=response(replacement,{items:[{id:'93000000-0000-4000-8000-000000000006'}]});conflicting.headers=()=>({'x-request-id':'boundary-source-2'});emit('response',conflicting);await assert.rejects(ports.verifyQuality());assert.equal(result.deliveryRereads.length,1,'Distinct response ID conflict cannot append or settle replacement');return null;}   if(mode==='replacement-deadline'){
    const originalNow=Date.now;try{Date.now=()=>originalNow()+11000;emit('response',response(replacement,{items:[{id:'93000000-0000-4000-8000-000000000005'}]}));await assert.rejects(ports.verifyQuality());assert.equal(result.deliveryRereads.length,0,'Original overdue cancellation deadline prevents late receipt before timer dispatch');}finally{Date.now=originalNow;}return null;
   }   if(mode==='replacement-late-join'){
    emit('response',response(replacement,{},async()=>{entered();await held;return Buffer.from('{"items":[{"id":"93000000-0000-4000-8000-000000000005"}]}')}));await began;result.invalidations[0].joinProof={joinRef:'2',replyRef:'2'};release();await assert.rejects(ports.verifyQuality());assert.equal(result.deliveryRereads.length,0,'Changed join after body await publishes no positive receipt');return null;
   }   emit('response',response(replacement,mode==='replacement-invalid-body'?{items:[{id:'invalid'}]}:{items:[{id:'93000000-0000-4000-8000-000000000005'}]}));if(mode==='replacement-event'||mode==='replacement-join'){await new Promise<void>(done=>setTimeout(done,0));await ports.sessionEnded();await assert.rejects(ports.verifyQuality());return null;}if(mode==='replacement-invalid-body'){await assert.rejects(ports.verifyQuality());assert.equal(result.deliveryRereads.length,0);return null;}await ports.verifyQuality();assert.equal(result.deliveryRereads.length,1);return null;
  }  if(mode.startsWith('body-rejection-')){result.invalidations.push({eventId,roomId:groupId,schoolId:teacher.schoolId,actorId:teacher.actorId,generation:1,joinProof:{joinRef:'1',replyRef:'1'},observedAt:new Date().toISOString()});const posts={url:()=>api+'/v1/community/rooms/'+groupId+'/posts?limit=100',method:()=> 'GET',headers:me.headers,failure:()=>({errorText:mode==='body-rejection-diagnostic'?'net::ERR_ABORTED':'private unknown transport details'})};emit('request',posts);await route({request:()=>posts,continue:async()=>{forwarded++;},abort:async()=>{aborted++;}});emit('response',response(posts,{},async()=>{throw Error('Supplied canceled readonly body');}));await assert.rejects(ports.verifyQuality());const first=result.failure;const next={url:()=>api+'/v1/community/rooms?limit=100',method:()=> 'GET',headers:me.headers};emit('request',next);await route({request:()=>next,continue:async()=>{forwarded++;},abort:async()=>{aborted++;}});assert.equal(result.failure,first,'Secondary route refuses cannot replace the first failure');return null;}
  if(mode.startsWith('held-')){result.invalidations.push({eventId,roomId:groupId,schoolId:teacher.schoolId,actorId:teacher.actorId,generation:1,joinProof:{joinRef:'1',replyRef:'1'},observedAt:new Date().toISOString()});const posts={url:()=>api+'/v1/community/rooms/'+groupId+'/posts?limit=100',method:()=> 'GET',headers:me.headers};emit('request',posts);await route({request:()=>posts,continue:async()=>{forwarded++;},abort:async()=>{aborted++;}});emit('response',response(posts,{},async()=>{entered();await held;return Buffer.from(JSON.stringify({items:[{id:'93000000-0000-4000-8000-000000000005'}]}));}));await began;if(mode==='held-session')await ports.sessionEnded();else expired=true;release();await assert.rejects(ports.verifyQuality());return null;}
  const query=mode==='logout-global'?'?scope=global':mode==='logout-duplicate'?'?scope=local&scope=local':mode==='user-query'?'?extra=private':mode==='preflight-global'?'?scope=global':mode==='logout-local'?'?scope=local':'';
  const user=mode.startsWith('user'),request={url:()=>auth+'/auth/v1/'+(user?'user':'logout')+query,method:()=>mode==='preflight-global'?'OPTIONS':user?'GET':'POST',headers:()=>({authorization:'Bearer '+token})};await route({request:()=>request,continue:async()=>{forwarded++;},abort:async()=>{aborted++;}});return null;
 }};
 (globalThis as Record<string,unknown>).communityBoundaryDiagnostics=diagnostic;
 const hook=registerHooks({load(value,context,next){if(value.split('?')[0]!==url)return next(value,context);let source=readFileSync(resolve(root,'scripts/verification/backend-hosted-community.ts'),'utf8').replace('chromium.launch({headless:true,env})','globalThis.communityBoundaryFixture.launch({headless:true,env})').replace('runCustomerCommunityJourney(page,','globalThis.communityBoundaryFixture.driver(page,').replace("import { requestHostedBrowserJson, type HostedBrowserCompanionWriter } from './hosted-browser-evidence';","import type { HostedBrowserCompanionWriter } from './hosted-browser-evidence';const requestHostedBrowserJson=async(_url,method)=>({status:method==='POST'?204:401,value:null});");if(mode==='body-rejection-diagnostic')source=source.replace("()=>{failPhase(phase,request);pending.delete(work);clean=false;}","error=>{globalThis.communityBoundaryDiagnostics.push({phase:'track-rejected',actorId:active?.actorId,generation,clean,failure:error instanceof Error?error.message:'UNKNOWN'});failPhase(phase,request);pending.delete(work);clean=false;}").replace("}catch{failPhase('ROUTE',request);clean=false;result.unexpectedRequests++;await gate.fail();await route.abort().catch(()=>{});}","}catch{globalThis.communityBoundaryDiagnostics.push({phase:'route-refused',path:url.pathname,actorId:active?.actorId,generation,clean});failPhase('ROUTE',request);clean=false;result.unexpectedRequests++;await gate.fail();await route.abort().catch(()=>{});}");source+='\nexport {runHostedCommunityBrowser as boundaryFixture};';return{format:'module',shortCircuit:true,source:transformSync(source,{loader:'ts',format:'esm'}).code};}});
 try{const owner=await import(url+'?boundary='+mode);await owner.boundaryFixture({context:{publicConfig:{apiUrl:api,supabaseUrl:auth,supabasePublishableKey:'sb_publishable_fixture'},originalWeb:{webOrigin:'https://web.fixture.invalid'},assertOriginalValidity(){if(expired)throw Error('Expired context');},readmit:async()=>{}},gate:{forward:async(_request:unknown,send:()=>Promise<void>)=>{if(mode==='forward-gap')await (globalThis as unknown as{forwardGap:()=>Promise<void>}).forwardGap();await send();},fail:async()=>{},endSession(){},session(){},scope:()=>({schoolId:teacher.schoolId,classId,postIds:[],group:{id:groupId},announcement:null})},actors:{teacher,peer:seed.actors[17],student:seed.actors[11],parent:seed.actors[71]},password:'synthetic-password',result});return{result,forwarded,aborted,diagnostic};}
 finally{release();hook.deregister();delete global.communityBoundaryFixture;}
}

test('held post reread bodies cannot publish after their original session or context expires',async()=>{
 for(const mode of ['held-session','held-expiry'] as const){const output=await boundaryLane(mode);assert.equal(output.forwarded,1);assert.equal(output.result.deliveryRereads.length,0);assert.equal(output.result.sessionsClosed,false);}
});

test('canceled readonly-body timeout retains the first latch before a secondary route refusal without credentials',async()=>{
 const output=await boundaryLane('body-rejection-diagnostic');assert.equal(output.forwarded,1);assert.equal(output.aborted,1);assert.equal(output.result.deliveryRereads.length,0);
 assert.equal(output.result.failure?.phase,'DELIVERY');assert.equal(output.result.failure?.transport,'ERR_ABORTED');assert.equal(output.diagnostic[0].phase,'route-refused');assert.equal(output.diagnostic[0].clean,false);assert.doesNotMatch(JSON.stringify(output.diagnostic),/captured-boundary-token|Bearer|authorization|PRIVATE/);
});

test('production first-failure evidence is categorical immutable and distinguishes canceled from unknown readonly transport',async()=>{
 for(const mode of ['body-rejection-diagnostic','body-rejection-unknown'] as const){const output=await boundaryLane(mode),failure=output.result.failure;assert(failure);assert.equal(failure.phase,'DELIVERY');assert.equal(failure.method,'GET');assert.equal(failure.path,'community_posts');assert.equal(failure.transport,mode==='body-rejection-diagnostic'?'ERR_ABORTED':'UNKNOWN');assert.match(failure.observedAt,/^\d{4}-\d{2}-\d{2}T/);assert.equal(Object.isFrozen(failure),true);assert.doesNotMatch(JSON.stringify(failure),/Bearer|captured-|private unknown|room|93000000/);}
});

test('normal Auth user and local logout requests never widen to global duplicate or arbitrary query effects',async()=>{
 for(const mode of ['logout-global','logout-duplicate','user-query','preflight-global'] as const){const output=await boundaryLane(mode);assert.equal(output.forwarded,0,mode);assert.equal(output.aborted,1,mode);}
 for(const mode of ['logout-local','user-current'] as const){const output=await boundaryLane(mode);assert.equal(output.forwarded,1,mode);assert.equal(output.aborted,0,mode);}
});

test('held auxiliary forbidden response cannot publish a denial after its own session ends',async()=>{
 const root=resolve(import.meta.dirname,'../..'),url=pathToFileURL(resolve(root,'scripts/verification/backend-hosted-community.ts')).href,seed=JSON.parse(readFileSync(resolve(root,'supabase/seed/identities.json'),'utf8')),teacher={...seed.actors[3],role:'teacher'},peer={...seed.actors[17],role:'student'},api='https://api.fixture.invalid',auth='https://auth.fixture.invalid',group='93000000-0000-4000-8000-000000000001';
 const lanes:{listeners:Map<string,((value:unknown)=>void)[]>;route?:(value:unknown)=>Promise<void>}[]=[],pendingBodies:Promise<void>[]=[];let release!:()=>void,entered!:()=>void,published=false;
 const held=new Promise<void>(done=>release=done),began=new Promise<void>(done=>entered=done),emit=(lane:number,event:string,value:unknown)=>{for(const callback of lanes[lane].listeners.get(event)??[])callback(value);};
 const global=globalThis as typeof globalThis&{communityHeldDenialFixture?:unknown};global.communityHeldDenialFixture={launch:async()=>({newContext:async()=>{const lane={listeners:new Map<string,((value:unknown)=>void)[]>()} as typeof lanes[number];lanes.push(lane);return{newPage:async()=>({setDefaultTimeout(){},on(name:string,fn:(value:unknown)=>void){lane.listeners.set(name,[...(lane.listeners.get(name)??[]),fn]);},evaluate:async()=>{const request={url:()=>api+'/v1/community/rooms/'+group+'/posts?limit=100',method:()=> 'GET',headers:()=>({authorization:'Bearer peer-held-token-123456','x-school-id':peer.schoolId})};emit(1,'request',request);await lane.route!({request:()=>request,continue:async()=>{},abort:async()=>{throw Error('Must reach actual response');}});const body=held.then(()=>Buffer.from(JSON.stringify({code:'FORBIDDEN',message:'Source denied',requestId:'original-held-denial'})));pendingBodies.push(body.then(()=>{}));emit(1,'response',{request:()=>request,status:()=>403,headers:()=>({}),body:async()=>{entered();return body;},url:()=>request.url()});}}),routeWebSocket:async()=>{},route:async(_pattern:string,fn:(value:unknown)=>Promise<void>)=>{lane.route=fn;},close:async()=>{}};},close:async()=>{}}),driver:async(_page:unknown,_input:unknown,ports:{sessionStarting:(actor:unknown)=>Promise<void>})=>{
  await ports.sessionStarting(teacher);const lane=await(globalThis as typeof globalThis&{createHeldDenialLane:(kind:string,actor:unknown)=>Promise<{start:(actor:unknown)=>Promise<void>;ended:()=>void;deny:(target:string)=>Promise<unknown>}>}).createHeldDenialLane('peer',peer);await lane.start(peer);
  const request={url:()=>auth+'/auth/v1/token?grant_type=password',method:()=> 'POST',headers:()=>({})};emit(1,'request',request);emit(1,'response',{request:()=>request,status:()=>200,headers:()=>({}),body:async()=>Buffer.from(JSON.stringify({access_token:'peer-held-token-123456',refresh_token:'peer-held-refresh',user:{id:peer.actorId,email:peer.email,is_anonymous:false}})),url:()=>request.url()});await new Promise<void>(done=>setTimeout(done,0));
  const me={url:()=>api+'/v1/me',method:()=> 'GET',headers:()=>({authorization:'Bearer peer-held-token-123456','x-school-id':peer.schoolId})};emit(1,'request',me);await lanes[1].route!({request:()=>me,continue:async()=>{},abort:async()=>{throw Error('Valid membership');}});emit(1,'response',{request:()=>me,status:()=>200,headers:()=>({}),body:async()=>Buffer.from(JSON.stringify({userId:peer.actorId,schoolId:peer.schoolId,membershipId:'93000000-0000-4000-8000-000000000999',role:'student',displayName:peer.displayName,entitlements:['community'],school:{id:peer.schoolId,name:'Fictional school'}})),url:()=>me.url()});await new Promise<void>(done=>setTimeout(done,0));
  const pending=lane.deny('GROUP_POSTS').then(()=>{published=true;});void pending.catch(()=>{});await began;lane.ended();release();await assert.rejects(pending);return null;
 }};
 const hook=registerHooks({load(value,context,next){if(value.split('?')[0]!==url)return next(value,context);const source=readFileSync(resolve(root,'scripts/verification/backend-hosted-community.ts'),'utf8').replace('chromium.launch({headless:true,env})','globalThis.communityHeldDenialFixture.launch({headless:true,env})').replace('runCustomerCommunityJourney(page,','globalThis.communityHeldDenialFixture.driver(page,').replace('const main=await createLane(',"globalThis.createHeldDenialLane=createLane;classRoomId='93000000-0000-4000-8000-000000000777';const main=await createLane(").replace("import { requestHostedBrowserJson, type HostedBrowserCompanionWriter } from './hosted-browser-evidence';","import type { HostedBrowserCompanionWriter } from './hosted-browser-evidence';const requestHostedBrowserJson=async(_url,method)=>({status:method==='POST'?204:401,value:null});")+'\nexport {runHostedCommunityBrowser as heldDenialFixture};';return{format:'module',shortCircuit:true,source:transformSync(source,{loader:'ts',format:'esm'}).code};}});
 try{const owner=await import(url+'?held-denial'),result={invalidations:[],unexpectedRequests:0,consoleErrors:0,consoleWarnings:0,pageErrors:0,sessionsClosed:false};await owner.heldDenialFixture({context:{publicConfig:{apiUrl:api,supabaseUrl:auth,supabasePublishableKey:'sb_publishable_fixture'},originalWeb:{webOrigin:'https://web.fixture.invalid'},assertOriginalValidity(){},readmit:async()=>{}},gate:{fail:async()=>{},scope:()=>({schoolId:teacher.schoolId,classId:'30000000-0000-4000-8000-000000000001',postIds:[],group:{id:group},announcement:null})},actors:{teacher,peer,student:seed.actors[11],parent:seed.actors[71]},password:'synthetic-password',result});assert.equal(published,false);assert.equal(result.sessionsClosed,false);}
 finally{release();await Promise.all(pendingBodies);hook.deregister();delete global.communityHeldDenialFixture;delete(globalThis as Record<string,unknown>).createHeldDenialLane;}
});

test('canceled current posts body keeps replacement route live and only replacement validates delivery',async()=>{
 const output=await boundaryLane('replacement');assert.equal(output.forwarded,2);assert.equal(output.aborted,0);assert.equal(output.result.deliveryRereads.length,1);
});
test('canceled delivery cannot be settled by foreign query token event invalid bytes or session retirement',async()=>{
 for(const mode of ['replacement-query','replacement-token','replacement-event','replacement-invalid-body','replacement-missing','replacement-header','replacement-utf8','replacement-expired','replacement-join','replacement-auth','replacement-late-join','replacement-deadline','replacement-request-id'] as const){const output=await boundaryLane(mode);assert.equal(output.result.failure?.phase==='DELIVERY'||output.result.failure?.phase==='ROUTE',true,mode);}
});

test('POST final forwarding waits for fresh delivery work created during gate persistence',async()=>{
 const output=await boundaryLane('forward-gap');assert.equal(output.forwarded,1);assert.equal(output.aborted,0);
});