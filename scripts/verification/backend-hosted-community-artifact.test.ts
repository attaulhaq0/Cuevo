import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { transformSync } from 'esbuild';
import type { Readable } from 'node:stream';
import { canonicalReleaseExecutionJson, canonicalReleaseReviewJson } from './release-review';
import { parseHostedCommunityCommand, reduceHostedCommunityReceipt, hostedCommunityRecipeText as text, type HostedCommunityScope } from './hosted-community-command';
import { stagingHostContractSha256 } from './backend-staging-host-contract';

type Subject = typeof import('./backend-hosted-community-artifact');
const subject = await import('./backend-hosted-community-artifact').catch(() => ({})) as Subject;
const rawHash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const json = (value: unknown) => Buffer.from(canonicalReleaseExecutionJson(value));
const id = (n: number) => '90000000-0000-4000-8000-' + String(n).padStart(12, '0');
const at = '2026-10-12T08:00:00Z', now = Date.parse('2026-10-12T08:01:00Z');
const tuple = { schoolId: '10000000-0000-4000-8000-000000000001', classId: '30000000-0000-4000-8000-000000000001', teacherActorId: '20000000-0000-4000-8000-000000000004', studentActorId: '20000000-0000-4000-8000-000000000012', peerActorId: '20000000-0000-4000-8000-000000000018', parentActorId: '20000000-0000-4000-8000-000000000072' } as const;
const identity = { projectRef: 'abcdefghijklmnopqrst', schoolId: tuple.schoolId, sourceSha: 'a'.repeat(40), treeSha: 'b'.repeat(40), ciRunId: '71', runId: '81', runAttempt: 2, backendTransferSha256: 'c'.repeat(64), webDeploymentId: 'dpl_community' };
const backendIdentity = { repository: 'attaulhaq0/Cuevo', sourceSha: identity.sourceSha, treeSha: identity.treeSha, baseSha: 'd'.repeat(40), ciRunId: '71', runId: '51', runAttempt: 1, artifactId: '61', artifactSha256: 'd'.repeat(64), transferSha256: identity.backendTransferSha256, manifestSha256: 'e'.repeat(64), packageSha256: 'f'.repeat(64), web: { teamId: 'team_private', projectId: 'prj_private', origin: 'https://cuevo.example', target: 'preview' }, settingsSha256: '1'.repeat(64), earliestProofAt: '2026-10-12T07:30:00Z', exportedAt: '2026-10-12T07:40:00Z', consumptionExpiresAt: '2026-10-12T08:30:00Z' };
const webAdmission = { purpose: 'PREBUILD_RELEASE_ADMISSION', sourceSha: identity.sourceSha, treeSha: identity.treeSha, ciRunId: '71', runId: '81', runAttempt: 2, webDeploymentId: identity.webDeploymentId, artifactSha256: '2'.repeat(64), packageSha256: '3'.repeat(64), backendTransferSha256: identity.backendTransferSha256, populationReceiptSha256: '4'.repeat(64), apiOrigin: 'https://api.cuevo.example', authOrigin: 'https://abcdefghijklmnopqrst.supabase.co', webOrigin: backendIdentity.web.origin, webPackageExpiresAt: '2026-10-12T08:40:00Z', observedAt: '2026-10-12T07:55:00Z' };
const selectedActorIds = { teacher: tuple.teacherActorId, student: tuple.studentActorId, peer: tuple.peerActorId, parent: tuple.parentActorId, outsideClass: '20000000-0000-4000-8000-000000000013', foreign: '20000000-0000-4000-8000-000000000133' };
const producerSha256 = rawHash('fixed Community producer source');
type File = { name: string; bytes: Buffer; options?: object };
const { yazl } = createRequire(import.meta.url)('playwright-core/lib/utilsBundle') as { yazl: { ZipFile: new () => { outputStream: Readable; addBuffer(bytes: Buffer, name: string, options?: object): void; end(): void } } };
async function zip(files: File[]) { const owner = new yazl.ZipFile(), parts: Buffer[] = []; const end = new Promise<Buffer>((done, reject) => { owner.outputStream.on('data', part => parts.push(part)); owner.outputStream.on('error', reject); owner.outputStream.on('end', () => done(Buffer.concat(parts))); }); for (const f of files) owner.addBuffer(f.bytes, f.name, f.options); owner.end(); return end; }

function fixture(length = 1, unresolved = false) {
  const scope: HostedCommunityScope = { ...tuple, synthetic: true, group: null, postIds: [], announcement: null };
  const scopeName = 'scope-' + rawHash(JSON.stringify([identity.projectRef, identity.schoolId]));
  const uiRoot = 'hosted-community-ui/' + scopeName + '/run-81-2/', journalRoot = 'hosted-community/' + scopeName + '/';
  const files: File[] = [{ name: journalRoot + 'owner.json', bytes: Buffer.from(canonicalReleaseReviewJson({ version: 1, purpose: 'CUEVO_HOSTED_COMMUNITY_COMMAND_JOURNAL', projectRef: identity.projectRef, schoolId: identity.schoolId }) + '\n') }];
  const records: Record<string, unknown>[] = [], states: Record<string, unknown>[] = [], commands: Record<string, unknown>[] = [], companions: { path: string; sha256: string }[] = [], writes: Record<string, unknown>[] = [];
  let previous: string | null = null;
  for (let index = 0; index < length; index++) {
    const group = scope.group?.id, post = scope.postIds[0], announcement = scope.announcement?.id;
    const recipes: readonly (readonly [string, Record<string, unknown>])[] = [
      ['/v1/community/rooms', { classId: tuple.classId, name: text.groupName, type: 'GROUP', memberIds: [tuple.studentActorId] }],
      [`/v1/community/rooms/${group}/members`, { actorId: tuple.peerActorId, status: 'active', confirmAccessChange: true }],
      [`/v1/community/rooms/${group}/members`, { actorId: tuple.peerActorId, status: 'revoked', confirmAccessChange: true }],
      [`/v1/community/rooms/${group}/posts`, { body: text.postBody, replyToId: null, mentionActorIds: [] }],
      [`/v1/community/rooms/${group}/posts`, { body: text.secondPostBody, replyToId: null, mentionActorIds: [] }],
      [`/v1/community/posts/${post}/reactions`, { reaction: 'HELPFUL', active: true }],
      [`/v1/community/posts/${post}/reactions`, { reaction: 'HELPFUL', active: false }],
      [`/v1/community/rooms/${group}/posts`, { body: text.replyBody, replyToId: post, mentionActorIds: [] }],
      [`/v1/community/posts/${post}/report`, { reason: text.reportReason }],
      [`/v1/community/rooms/${group}/restrict`, { actorId: tuple.studentActorId, restriction: 'MUTED', reason: text.restrictionReason, confirmModeration: true }],
      [`/v1/community/rooms/${group}/restrict`, { actorId: tuple.studentActorId, restriction: 'NONE', reason: text.restrictionReason, confirmModeration: true }],
      [`/v1/community/posts/${post}/moderate`, { action: 'HIDE', reason: text.moderationReason, confirmModeration: true }],
      [`/v1/community/posts/${post}/moderate`, { action: 'RESTORE', reason: text.moderationReason, confirmModeration: true }],
      ['/v1/community/announcements', { classId: tuple.classId, title: text.announcementTitle, body: text.announcementBody, parentVisible: true }],
      [`/v1/community/notifications/${announcement}/read`, { expectedRevision: 1 }],
      [`/v1/community/rooms/${group}/members`, { actorId: tuple.studentActorId, status: 'revoked', confirmAccessChange: true }],
      [`/v1/community/groups/${group}/lifecycle`, { name: text.groupName, state: 'CLOSED', expectedRevision: 1, reason: text.groupClosureReason, confirmChange: true }],
      [`/v1/community/announcements/${announcement}/withdraw`, { expectedRevision: 1, reason: text.announcementWithdrawalReason, confirmWithdrawal: true }],
    ];
    const [path, body] = recipes[index], actorId = index === 14 ? tuple.parentActorId : [3, 4, 5, 6, 7, 8].includes(index) ? tuple.studentActorId : tuple.teacherActorId;
    const role = index === 14 ? 'parent' : actorId === tuple.studentActorId ? 'student' : 'teacher';
    const requestBody = JSON.stringify(body), parsed = parseHostedCommunityCommand(path, requestBody, { actorId, schoolId: tuple.schoolId, role }, scope), key = 'community-original-' + index;
    const command = { step: parsed.operation, actorId, role, schoolId: tuple.schoolId, path, operation: parsed.operation, sourceIds: parsed.sourceIds, sourceRevision: parsed.sourceRevision, key, requestBodySha256: parsed.requestBodySha256 };
    const sequence = records.length + 1, payload: Record<string, unknown> = { version: 1, purpose: 'CUEVO_HOSTED_COMMUNITY_COMMAND_JOURNAL', sequence, previousRecordSha256: previous, identity, command, state: 'INTENT', intentSequence: sequence, intentRecordSha256: null, httpReceiptSha256: null, nativeReceiptSha256: null, nativeProof: null, localDurabilityOnly: true };
    const first: Record<string, unknown> & { recordSha256: string } = { ...payload, recordSha256: rawHash(canonicalReleaseReviewJson(payload)) };
    const original = { identity, command, intentSequence: sequence, intentRecordSha256: first.recordSha256 };
    records.push(first); previous = first.recordSha256;
    const uncertain = unresolved && index === length - 1, receiptId = [5, 6].includes(index) ? post! : index === 14 || index === 17 ? announcement! : index === 16 ? group! : id(index + 1);
    const response: Record<string, unknown> = index === 14 ? { id: receiptId, status: 'READ', revision: 1 } : index === 16 ? { id: receiptId, status: 'CLOSED', revision: 2 } : index === 17 ? { id: receiptId, status: 'WITHDRAWN', revision: 2 } : { id: receiptId, command: parsed.owner === 'normal' ? parsed.nativeCommand : '' };
    if (index === 0) response.roomId = receiptId;
    if (parsed.operation === 'post.create') Object.assign(response, { roomId: group, body: body.body, replyToId: body.replyToId, actorId, createdAt: at, status: 'VISIBLE' });
    const receiptSha256 = rawHash(canonicalReleaseExecutionJson(response));
    for (const state of ['FORWARDING_AUTHORIZED', uncertain ? 'UNCERTAIN' : 'HTTP_CONFIRMED']) {
      const next: Record<string, unknown> = { ...payload, sequence: records.length + 1, previousRecordSha256: previous, state, intentRecordSha256: first.recordSha256, httpReceiptSha256: state === 'HTTP_CONFIRMED' ? receiptSha256 : null };
      const record: Record<string, unknown> & { recordSha256: string } = { ...next, recordSha256: rawHash(canonicalReleaseReviewJson(next)) }; records.push(record); previous = record.recordSha256;
    }
    states.push({ original, state: uncertain ? 'UNCERTAIN' : 'HTTP_CONFIRMED', httpReceiptSha256: uncertain ? null : receiptSha256, nativeReceiptSha256: null });
    const generation = index < 3 ? 1 : index < 9 ? 3 : index === 9 ? 5 : index < 14 ? 9 : index === 14 ? 11 : 13;
    const metadata = { operation: parsed.operation, owner: parsed.owner, ledgerCommand: parsed.ledgerCommand, targetId: parsed.targetId, sourceIds: parsed.sourceIds, sourceRevision: parsed.sourceRevision, requestBodySha256: parsed.requestBodySha256, nativeFingerprint: parsed.nativeFingerprint, input: parsed.input, requestBody, scopeGeneration: generation };
    const intent = { version: 1, purpose: 'CUEVO_HOSTED_COMMUNITY_ORIGINAL_COMMAND', original, ...metadata }, intentName = String(sequence).padStart(6, '0') + '.intent.json';
    files.push({ name: uiRoot + intentName, bytes: json(intent) }); companions.push({ path: intentName, sha256: rawHash(json(intent)) });
    if (!uncertain) {
      const receiptIdentity = reduceHostedCommunityReceipt(response, { path, rawBytes: requestBody, key, requestBodySha256: parsed.requestBodySha256, nativeFingerprint: parsed.nativeFingerprint }, { actorId, schoolId: tuple.schoolId, role }, scope);
      const http = { version: 1, purpose: 'CUEVO_HOSTED_COMMUNITY_HTTP_RECEIPT', original, originalCompanionSha256: rawHash(json(intent)), ...metadata, requestId: 'request-' + index, status: 200, receiptSha256, observedReceiptSha256: rawHash(JSON.stringify(response)), receiptIdentity, nativeChainVerified: false };
      const name = String(sequence).padStart(6, '0') + '.http.json'; files.push({ name: uiRoot + name, bytes: json(http) }); companions.push({ path: name, sha256: rawHash(json(http)) }); commands.push({ ...http, companionSha256: rawHash(json(http)) });
      writes.push({ action: 'Visible Community action', path, actorId, scopeGeneration: generation, status: 200, id: receiptId, key, keySha256: rawHash(key), requestSha256: rawHash(requestBody), bodySha256: rawHash(JSON.stringify(body)), receiptSha256: rawHash(JSON.stringify(response)) });
      if (index === 0) scope.group = { id: receiptId, revision: 1 }; else if (parsed.operation === 'post.create') scope.postIds.push(receiptId); else if (index === 13) scope.announcement = { id: receiptId, revision: 1 }; else if (index === 16) scope.group!.revision = 2; else if (index === 17) scope.announcement!.revision = 2;
    }
  }
  for (const r of records) { const number = String(r.sequence).padStart(6, '0'); files.push({ name: journalRoot + number + '.record.json', bytes: Buffer.from(canonicalReleaseReviewJson(r) + '\n') }, { name: journalRoot + number + '.head.json', bytes: Buffer.from(canonicalReleaseReviewJson({ version: 1, purpose: r.purpose, sequence: r.sequence, recordSha256: r.recordSha256, previousRecordSha256: r.previousRecordSha256 }) + '\n') }); }
  const full = length === 18 && !unresolved, common = { identity, backendIdentity, webAdmission, populationReceiptSha256: webAdmission.populationReceiptSha256, selectedActorIds, producerSha256 };
  const observation = full ? { groupId: scope.group!.id, postIds: scope.postIds.slice(0, 2), replyId: scope.postIds[2], reportId: id(9), membershipChangeIds: [id(2), id(3), id(16)], announcementId: scope.announcement!.id, writes, sessionStartedCount: 7, sessionEndedCount: 7, cleanupCount: 1, retirement: { status: 'CONFIRMED_UI_ONLY', groupClosed: true, announcementWithdrawn: true, mainMemberRevoked: true, referenceRestored: false }, nativeChainVerified: false, hostedAcceptance: false, customerReady: false } : null;
  const journal = { records, commands: states, lastRecordSha256: previous, evidence: 'LOCAL_DURABLE_METADATA_ONLY', hostedAcceptance: false, runnerLossRecoveryVerified: false };
  const status = full ? 'UI_RECIPE_VERIFIED_NATIVE_PENDING' : 'REQUIRES_REVIEW';
  const manifest = { version: 1, purpose: 'CUEVO_HOSTED_COMMUNITY_UI_EVIDENCE', ...common, status, scope, journal, commands, companions, observation, invalidations: [], nativeChainVerified: false, referenceRestored: false, customerReady: false, hostedAcceptance: false };
  const result = { purpose: 'CUEVO_HOSTED_COMMUNITY_UI', status, identity, sourceSha: identity.sourceSha, runId: identity.runId, runAttempt: identity.runAttempt, producerSha256, observedAt: at,failure:null, confirmedCommandCount: commands.length, sessionsClosed: full, unexpectedRequests: 0, consoleErrors: 0, consoleWarnings: 0, pageErrors: 0, observation, invalidations: [], journalLastRecordSha256: previous, companionManifestSha256: rawHash(json(manifest)), privateReconnectVerified: false, nativeChainVerified: false, referenceRestored: false, customerReady: false, hostedAcceptance: false };
  files.push({ name: uiRoot + 'run-intent.json', bytes: json({ version: 1, purpose: 'CUEVO_HOSTED_COMMUNITY_UI', ...common }) }, { name: uiRoot + 'command-manifest.json', bytes: json(manifest) }, { name: uiRoot + 'result.json', bytes: json(result) });
  const expected = { sourceSha: identity.sourceSha, uiRunId: identity.runId, uiRunAttempt: identity.runAttempt, commandManifestSha256: rawHash(json(manifest)), journalHeadSha256: previous!, producerSha256, mode: full ? 'FULL_RECIPE' as const : 'ORIGINAL_RECONCILIATION' as const, now };
  const value={ files, expected, uiRoot, journalRoot, manifest, result };if(full){attachPrefix(value);attachAuxiliary(value);attachViews(value);}return value;
}
async function adapt(f: ReturnType<typeof fixture>) { const bytes = await zip(f.files); return subject.adaptHostedCommunityArtifactArchive(bytes, { ...f.expected, archiveSha256: rawHash(bytes) }); }
function rebind(f: ReturnType<typeof fixture>) {
  const manifestFile = f.files.find(row => row.name.endsWith('/command-manifest.json'))!, resultFile = f.files.find(row => row.name.endsWith('/result.json'))!;
  const manifest = JSON.parse(manifestFile.bytes.toString()), result = JSON.parse(resultFile.bytes.toString());
  for (const companion of manifest.companions) { const file = f.files.find(row => row.name === f.uiRoot + companion.path)!; companion.sha256 = rawHash(file.bytes); if (companion.path.endsWith('.http.json')) { const stored = manifest.commands.find((row: { original: { intentSequence: number } }) => row.original.intentSequence === Number(companion.path.slice(0, 6))); if (stored) Object.assign(stored, JSON.parse(file.bytes.toString()), { companionSha256: companion.sha256 }); } }
  result.observation = manifest.observation; result.invalidations = manifest.invalidations; manifestFile.bytes = json(manifest); result.companionManifestSha256 = rawHash(manifestFile.bytes); resultFile.bytes = json(result); f.expected.commandManifestSha256 = result.companionManifestSha256;
}

function prefixInput(f: ReturnType<typeof fixture>) {
  const manifest = JSON.parse(f.files.find(row => row.name.endsWith('/command-manifest.json'))!.bytes.toString());
  return { identity: manifest.identity, scope: manifest.scope, journal: manifest.journal, commands: manifest.commands, companions: manifest.companions };
}
function prefixFiles(f: ReturnType<typeof fixture>) {
  return new Map(f.files.filter(row => /\d{6}\.(?:intent|http)\.json$/.test(row.name)).map(row => [row.name.slice(f.uiRoot.length), row.bytes]));
}
function attachPrefix(f:ReturnType<typeof fixture>){
  if(f.files.some(row=>row.name.endsWith('/prefix-snapshot.json')))return;
  const prefix=fixture(15),prepared=subject.prepareHostedCommunityLivePrefix(prefixInput(prefix),prefixFiles(prefix)),snapshot=prepared.snapshot;
  const receipt={version:1,purpose:'CUEVO_HOSTED_COMMUNITY_LIVE_PREFIX_PROOF',status:'LIVE_PREFIX_NATIVE_VERIFIED',identity,prefixSnapshotSha256:rawHash(json(snapshot)),journalHeadSha256:snapshot.journal.lastRecordSha256,
    companionInventorySha256:rawHash(json(snapshot.companions)),nativeEvidenceSha256:'9'.repeat(64),classRoomId:id(999),deliveryEventIds:[id(800)],observedAt:at,readOnly:true,sessionsClosed:true,customerReady:false,hostedAcceptance:false,referenceRestored:false};
  const manifestFile=f.files.find(row=>row.name.endsWith('/command-manifest.json'))!,manifest=JSON.parse(manifestFile.bytes.toString());
  manifest.livePrefixProof={snapshotSha256:rawHash(json(snapshot)),proofSha256:rawHash(json(receipt))};manifestFile.bytes=json(manifest);
  f.files.push({name:f.uiRoot+'prefix-snapshot.json',bytes:json(snapshot)},{name:f.uiRoot+'prefix-proof.json',bytes:json(receipt)});rebind(f);return{snapshot,receipt};
}
function auxiliaryFixture(groupId:string,classRoomId:string){
  return{sessionsStarted:3,sessionsClosed:3,observations:['peer','outside','foreign'].map((kind,index)=>({kind,actorId:index===0?tuple.peerActorId:index===1?selectedActorIds.outsideClass:selectedActorIds.foreign,schoolId:index===2?'10000000-0000-4000-8000-000000000002':tuple.schoolId,generation:1,groupId,classRoomId,uiGroupOpened:index===0,sessionClosed:true,
    api:(index===0?['GROUP_POSTS','GROUP_ROSTER']:['GROUP_POSTS','CLASS_POSTS']).map((target,read)=>({target,status:403,code:'FORBIDDEN',requestId:'denied-'+index+'-'+read,observedAt:at})),
    joins:(index===0?['JOINED','DENIED']:['DENIED','DENIED']).map((status,join)=>({actorId:index===0?tuple.peerActorId:index===1?selectedActorIds.outsideClass:selectedActorIds.foreign,schoolId:tuple.schoolId,generation:1,roomId:index===0||join===0?groupId:classRoomId,joinRef:'1',replyRef:'1',status,observedAt:at}))}))};
}
function attachAuxiliary(f:ReturnType<typeof fixture>){
 const manifestFile=f.files.find(row=>row.name.endsWith('/command-manifest.json'))!,resultFile=f.files.find(row=>row.name.endsWith('/result.json'))!;
 const manifest=JSON.parse(manifestFile.bytes.toString()),result=JSON.parse(resultFile.bytes.toString());const auxiliary=auxiliaryFixture(manifest.scope.group.id,id(999));
 manifest.auxiliary=auxiliary;result.auxiliary=auxiliary;result.privateReconnectVerified=true;
 const delivered={eventId:id(800),roomId:manifest.scope.group.id,schoolId:tuple.schoolId,actorId:tuple.studentActorId,generation:3,joinProof:{joinRef:'1',replyRef:'1'},observedAt:at};
 const read={eventId:id(800),roomId:manifest.scope.group.id,schoolId:tuple.schoolId,actorId:tuple.studentActorId,generation:3,path:'/v1/community/rooms/'+manifest.scope.group.id+'/posts?limit=100',status:200,requestId:'delivered-post-read',observedAt:at,sourceIds:[id(4)]};
 manifest.invalidations=[delivered];result.invalidations=[delivered];manifest.deliveryRereads=[read];result.deliveryRereads=[read];
 manifestFile.bytes=json(manifest);resultFile.bytes=json(result);rebind(f);
}
function receiptLabels(stage:string,locale:string){const t={"en":{"refresh":"Refresh community","back":"Back to rooms","connected":"Private updates connected","members":"Group members","actor":"Member","membershipStatus":"Membership status","confirmModeration":"I approve this moderation action","post":"Post to room","message":"Message","reply":"Reply","report":"Report post","reason":"Reason","cancel":"Cancel","readonly":"Your current access permits reading only.","reports":"Reported content","reportedMessage":"Reported message","reportReview":"Review this report","read":"Read","notifications":"Notifications","closeAnnouncement":"Close announcement","openAnnouncement":"Open announcement","empty":"No permitted community records are available.","createAnnouncement":"Publish announcement","rooms":"Class rooms and groups","openRoom":"Open discussion","closedNote":"This group is closed. Current members can read permitted history; new discussion is paused.","announcements":"Announcements"},"ar":{"refresh":"تحديث المجتمع","back":"العودة إلى الغرف","connected":"تم الاتصال بالتحديثات الخاصة","members":"أعضاء المجموعة","actor":"العضو","membershipStatus":"حالة العضوية","confirmModeration":"أوافق على إجراء الإشراف هذا","post":"النشر في الغرفة","message":"الرسالة","reply":"رد","report":"الإبلاغ عن المنشور","reason":"السبب","cancel":"إلغاء","readonly":"تسمح صلاحياتك الحالية بالقراءة فقط.","reports":"المحتوى المُبلَّغ عنه","reportedMessage":"الرسالة المبلّغ عنها","reportReview":"مراجعة هذا البلاغ","read":"مقروء","notifications":"الإشعارات","closeAnnouncement":"إغلاق الإعلان","openAnnouncement":"فتح الإعلان","empty":"لا تتاح سجلات مجتمع ضمن الصلاحيات.","createAnnouncement":"نشر إعلان","rooms":"غرف الصف والمجموعات","openRoom":"فتح النقاش","closedNote":"هذه المجموعة مغلقة. يمكن للأعضاء الحاليين قراءة السجل المسموح؛ النقاش الجديد متوقف.","announcements":"الإعلانات"}}[locale as 'en'|'ar'],common=[t.refresh,t.back,t.connected];const controls=stage==='GROUP_READY'?[...common,t.members,t.actor,t.membershipStatus,t.confirmModeration]:stage==='DISCUSSION_READY'?[...common,t.post,t.message,t.reply,t.report,t.reason,t.cancel]:stage==='READ_ONLY_DISCUSSION'?[...common,t.readonly]:stage==='MODERATION_RESTORED'?[...common,t.reports,t.reportedMessage,t.reportReview,t.reason,t.cancel]:stage==='FAMILY_NOTIFICATION_READ'?[t.refresh,t.read,t.notifications,t.closeAnnouncement,t.openAnnouncement]:[t.refresh,t.empty,t.createAnnouncement,t.rooms,t.openRoom,t.closedNote,t.back,t.announcements];return{heading:stage==='FAMILY_NOTIFICATION_READ'?t.notifications:stage==='RETIREMENT_CONFIRMED'?t.announcements:'Checking our learning together',controls,keyboardControl:stage==='DISCUSSION_READY'?t.report:stage==='MODERATION_RESTORED'?t.reportReview:stage==='FAMILY_NOTIFICATION_READ'?t.closeAnnouncement:t.refresh};}
function attachViews(f:ReturnType<typeof fixture>){
 const manifestFile=f.files.find(row=>row.name.endsWith('/command-manifest.json'))!,resultFile=f.files.find(row=>row.name.endsWith('/result.json'))!,manifest=JSON.parse(manifestFile.bytes.toString()),result=JSON.parse(resultFile.bytes.toString());
 const stages=[['GROUP_READY','teacher',1,1],['DISCUSSION_READY','student',3,5],['READ_ONLY_DISCUSSION','student',7,10],['MODERATION_RESTORED','teacher',9,13],['FAMILY_NOTIFICATION_READ','parent',11,15],['RETIREMENT_CONFIRMED','teacher',13,18]] as const;
 manifest.viewObservations=stages.flatMap(([stage,role,scopeGeneration,count])=>['en','ar'].map(locale=>{const original=manifest.journal.commands[count-1].original,record=manifest.journal.records.find((row:{state:string;intentRecordSha256:string})=>row.state==='HTTP_CONFIRMED'&&row.intentRecordSha256===original.intentRecordSha256);return{version:1,stage,role,locale,viewport:locale==='en'?{width:1366,height:900}:{width:390,height:844},identity,scopeGeneration,journalHeadSha256:record.recordSha256,sourceSha256:rawHash(json({groupId:manifest.scope.group.id,postIds:count===1?[]:manifest.scope.postIds.slice(0,2),announcementId:count<15?'':manifest.scope.announcement.id})),observedAt:at,...receiptLabels(stage,locale),keyboardVerified:true,axe:{completed:true,violations:0},reflow:{horizontalOverflow:false,text200Percent:stage==='DISCUSSION_READY'||stage==='FAMILY_NOTIFICATION_READ'},reducedMotion:true,nativeExecutionVerified:false,hostedAcceptance:false,customerReady:false};}));
 result.viewObservations=manifest.viewObservations;manifestFile.bytes=json(manifest);resultFile.bytes=json(result);rebind(f);
}
test('full Community artifact binds three exact read-only auxiliary sessions separately from the seven command sessions',async()=>{
 const f=fixture(18);attachAuxiliary(f);const parsed=await adapt(f);assert.equal(parsed.uiResult.observation?.sessionStartedCount,7);assert.equal(parsed.uiResult.auxiliary?.sessionsStarted,3);assert.equal(parsed.uiResult.privateReconnectVerified,true);assert.equal(parsed.hostedAcceptance,false);
});
test('missing stale or unclosed auxiliary proof cannot certify full Community UI acceptance',async()=>{
 for(const change of ['missing','school','joined','count','cleanup','denial','duplicate','generation']){
  const f=fixture(18);attachAuxiliary(f);const manifestFile=f.files.find(row=>row.name.endsWith('/command-manifest.json'))!,resultFile=f.files.find(row=>row.name.endsWith('/result.json'))!;
  const manifest=JSON.parse(manifestFile.bytes.toString()),result=JSON.parse(resultFile.bytes.toString());
  if(change==='missing'){delete manifest.auxiliary;delete result.auxiliary;}
  else{const rows=manifest.auxiliary.observations;if(change==='school')rows[2].schoolId=tuple.schoolId;if(change==='joined')rows[2].joins[0].status='JOINED';if(change==='count')manifest.auxiliary.sessionsStarted=2;if(change==='cleanup')rows[1].sessionClosed=false;if(change==='denial')rows[1].api[0].code='UNKNOWN';if(change==='duplicate')rows[1]=rows[0];if(change==='generation')rows[0].generation=13;result.auxiliary=manifest.auxiliary;}
  manifestFile.bytes=json(manifest);resultFile.bytes=json(result);rebind(f);await assert.rejects(adapt(f),change);
 }
});
test('consistent auxiliary class-room substitution cannot replace the actual native checkpoint target',async()=>{
 const f=fixture(18),manifestFile=f.files.find(row=>row.name.endsWith('/command-manifest.json'))!,resultFile=f.files.find(row=>row.name.endsWith('/result.json'))!;
 const manifest=JSON.parse(manifestFile.bytes.toString()),result=JSON.parse(resultFile.bytes.toString());
 for(const row of manifest.auxiliary.observations){row.classRoomId=id(998);if(row.kind!=='peer')row.joins[1].roomId=id(998);}result.auxiliary=manifest.auxiliary;
 manifestFile.bytes=json(manifest);resultFile.bytes=json(result);rebind(f);await assert.rejects(adapt(f));
});
test('failure artifacts retain only bounded categorical first-cause evidence without raw tokens or bodies',async()=>{
 const f=fixture(),resultFile=f.files.find(row=>row.name.endsWith('/result.json'))!,value=JSON.parse(resultFile.bytes.toString());
 value.failure={phase:'DELIVERY',method:'GET',path:'community_posts',transport:'ERR_ABORTED',observedAt:at};resultFile.bytes=json(value);
 const proof=await adapt(f);assert.equal(proof.uiResult.failure?.phase,'DELIVERY');assert.equal(proof.uiResult.failure?.transport,'ERR_ABORTED');
 for(const change of [{token:'private-canary'},{body:'private-pupil-content'},{path:'/v1/community/rooms/'+id(1)+'/posts'},{transport:'Unexpected internal stack'},{phase:'FAKE'},{observedAt:'2026-10-12T07:00:00Z'},{observedAt:'2026-10-12T09:00:00Z'}]){
  const changed=fixture(),file=changed.files.find(row=>row.name.endsWith('/result.json'))!,raw=JSON.parse(file.bytes.toString());raw.failure={...value.failure,...change};file.bytes=json(raw);await assert.rejects(adapt(changed));
 }
});
test('a complete Community archive requires explicit absence of first-failure evidence',async()=>{
 for(const change of ['missing','failed']){const f=fixture(18),file=f.files.find(row=>row.name.endsWith('/result.json'))!,value=JSON.parse(file.bytes.toString());if(change==='missing')delete value.failure;else value.failure={phase:'DELIVERY',method:'GET',path:'community_posts',transport:'ERR_ABORTED',observedAt:at};file.bytes=json(value);await assert.rejects(adapt(f));}
});
test('full Community acceptance refuses missing bilingual observations while retaining its original command journal',async()=>{
 const f=fixture(18),manifestFile=f.files.find(row=>row.name.endsWith('/command-manifest.json'))!,resultFile=f.files.find(row=>row.name.endsWith('/result.json'))!;const manifest=JSON.parse(manifestFile.bytes.toString()),result=JSON.parse(resultFile.bytes.toString());delete manifest.viewObservations;delete result.viewObservations;manifestFile.bytes=json(manifest);resultFile.bytes=json(result);rebind(f);await assert.rejects(adapt(f));assert.equal(f.manifest.journal.commands.length,18);
});
test('rebound bilingual artifacts still reject missing scans wrong sources and substituted original command boundaries',async()=>{
 for(const mode of ['missing','duplicate','mismatch','identity','journal','source','clock','generation','viewport','axe','keyboard','private']){
  const f=fixture(18),manifestFile=f.files.find(row=>row.name.endsWith('/command-manifest.json'))!,resultFile=f.files.find(row=>row.name.endsWith('/result.json'))!;
  const manifest=JSON.parse(manifestFile.bytes.toString()),result=JSON.parse(resultFile.bytes.toString()),rows=manifest.viewObservations;
  if(mode==='missing')rows.pop();if(mode==='duplicate')rows[1]=rows[0];if(mode==='identity')rows[0].identity.runAttempt++;if(mode==='journal')rows[0].journalHeadSha256=manifest.journal.lastRecordSha256;if(mode==='source')rows[0].sourceSha256=rows[2].sourceSha256;if(mode==='clock')rows[0].observedAt='2026-10-12T07:54:59Z';if(mode==='generation')rows[0].scopeGeneration=3;if(mode==='viewport')rows[1].viewport={width:1366,height:900};if(mode==='axe')rows[0].axe.completed=false;if(mode==='keyboard')rows[0].keyboardControl='Unobserved control';if(mode==='private')rows[0].token='private-canary';
  result.viewObservations=structuredClone(rows);if(mode==='mismatch')result.viewObservations[0].heading='Another current view';manifestFile.bytes=json(manifest);resultFile.bytes=json(result);rebind(f);await assert.rejects(adapt(f),mode);
 }
});
test('complete Community archive consumes exact prefix proof files and verifies the pre-retirement original boundary',async()=>{
  const f=fixture(18);attachPrefix(f);const result=await adapt(f);assert.equal(result.selection?.originals.length,18);assert.equal(result.hostedAcceptance,false);
});
test('prefix proof file substitution missing companion and changed original boundary refuse even when outer digests are rebound',async()=>{
  for(const change of ['snapshot','proof','missing','head','extra']){
    const f=fixture(18);attachPrefix(f);const manifestFile=f.files.find(row=>row.name.endsWith('/command-manifest.json'))!,manifest=JSON.parse(manifestFile.bytes.toString());
    const snapshotFile=f.files.find(row=>row.name.endsWith('/prefix-snapshot.json'))!,proofFile=f.files.find(row=>row.name.endsWith('/prefix-proof.json'))!;
    if(change==='snapshot'){const snapshot=JSON.parse(snapshotFile.bytes.toString());snapshot.identity.runAttempt++;snapshotFile.bytes=json(snapshot);manifest.livePrefixProof.snapshotSha256=rawHash(snapshotFile.bytes);}
    if(change==='proof'){const receipt=JSON.parse(proofFile.bytes.toString());receipt.sessionsClosed=false;proofFile.bytes=json(receipt);manifest.livePrefixProof.proofSha256=rawHash(proofFile.bytes);}
    if(change==='head'){const receipt=JSON.parse(proofFile.bytes.toString());receipt.journalHeadSha256='0'.repeat(64);proofFile.bytes=json(receipt);manifest.livePrefixProof.proofSha256=rawHash(proofFile.bytes);}
    if(change==='missing')f.files=f.files.filter(row=>row!==proofFile);
    if(change==='extra')f.files.push({name:f.uiRoot+'prefix-extra.json',bytes:json({})});
    manifestFile.bytes=json(manifest);rebind(f);await assert.rejects(adapt(f),change);
  }
});
test('live prefix preparation binds the actual fifteen original HTTP commands without manufacturing an archive identity', () => {
  assert.equal(typeof subject.prepareHostedCommunityLivePrefix, 'function', 'live prefix has a distinct factual owner');
  const f = fixture(15), input = prefixInput(f), prepared = subject.prepareHostedCommunityLivePrefix(input, prefixFiles(f));
  assert.equal(prepared.selection.mode, 'LIVE_PREFIX'); assert.equal(prepared.selection.originals.length, 15);
  assert.equal(prepared.selection.identity.evidenceSource, 'LIVE_PREFIX');
  assert.equal(prepared.selection.identity.prefixSnapshotSha256, rawHash(canonicalReleaseExecutionJson(prepared.snapshot)));
  assert.equal(prepared.selection.identity.journalHeadSha256, input.journal.lastRecordSha256);
  assert.equal(prepared.selection.identity.companionInventorySha256, rawHash(canonicalReleaseExecutionJson(input.companions)));
  assert.equal('uiArtifactSha256' in prepared.selection.identity, false);
  assert.equal(prepared.snapshot.hostedAcceptance, false);
  assert.equal(prepared.snapshot.nativeExecutionVerified, false);
  assert.deepEqual(prepared.snapshot.commands, input.commands);
});
test('live prefix refuses incomplete or later recipes, changed raw bodies, journal transitions, scope and companion inventory', () => {
  assert.equal(typeof subject.prepareHostedCommunityLivePrefix, 'function');
  for (const length of [14, 16, 18]) { const f = fixture(length); assert.throws(() => subject.prepareHostedCommunityLivePrefix(prefixInput(f), prefixFiles(f))); }
  for (const change of ['identity','scope','journal','body','receipt','generation','missing','extra','digest','duplicate']) {
    const f=fixture(15), input=prefixInput(f), files=prefixFiles(f);
    if(change==='identity')input.identity.runAttempt++;
    if(change==='scope')input.scope.group.revision++;
    if(change==='journal')input.journal.records[2].state='NATIVE_CONFIRMED';
    if(['body','receipt','generation'].includes(change)) {
      const name='000001.'+(change==='receipt'?'http':'intent')+'.json', row=JSON.parse(files.get(name)!.toString());
      if(change==='body')row.requestBody=' '+row.requestBody;
      if(change==='receipt')row.receiptIdentity.receiptId=id(999);
      if(change==='generation')row.scopeGeneration=3;
      files.set(name,json(row));input.companions.find((entry:{path:string})=>entry.path===name).sha256=rawHash(json(row));
    }
    if(change==='missing')files.delete('000001.intent.json');
    if(change==='extra')files.set('prefix-secret.json',json({credential:'must-refuse'}));
    if(change==='digest')input.companions[0].sha256='0'.repeat(64);
    if(change==='duplicate')input.companions.push(input.companions[0]);
    assert.throws(()=>subject.prepareHostedCommunityLivePrefix(input,files),change);
  }
});
test('rebinding every digest cannot invent an issued session generation or response identity', async () => {
  for (const kind of ['generation', 'receipt', 'input', 'body', 'invalidation']) {
    const f = fixture(18);
    for (const file of f.files.filter(row => /000001\.(?:intent|http)\.json$/.test(row.name))) { const value = JSON.parse(file.bytes.toString()); if (kind === 'generation') value.scopeGeneration = 999; if (kind === 'receipt' && file.name.endsWith('.http.json')) { value.receiptIdentity.receiptId = id(999); value.receiptIdentity.sourceId = id(999); } if (kind === 'input') value.input.name = 'Unowned fictional content'; if (kind === 'body') value.requestBody += ' '; file.bytes = json(value); }
    const manifestFile = f.files.find(row => row.name.endsWith('/command-manifest.json'))!, manifest = JSON.parse(manifestFile.bytes.toString());
    if (kind === 'generation') manifest.observation.writes[0].scopeGeneration = 999;
    if (kind === 'invalidation') manifest.invalidations = [{ eventId: id(500), roomId: id(1), schoolId: tuple.schoolId, actorId: tuple.studentActorId, generation: 999, joinProof: { joinRef: '1', replyRef: '1' }, observedAt: at }];
    manifestFile.bytes = json(manifest); rebind(f); await assert.rejects(adapt(f), kind);
  }
});

test('Community has its own bounded official artifact adapter and native selection contract', async () => { assert.equal(typeof subject.adaptHostedCommunityArtifactArchive, 'function', 'Purpose-specific Community reader is missing'); const result = await adapt(fixture()); assert.equal(result.selection?.mode, 'ORIGINAL_RECONCILIATION'); assert.equal(result.selection?.originals.length, 1); assert.equal(result.nativeExecutionVerified, false); assert.equal(result.officialAdmissionVerified, false); });
test('complete actual ZIP binds eighteen original receipts while retirement stays UI-only', async () => { const result = await adapt(fixture(18)); assert.equal(result.status, 'UI_RECIPE_VERIFIED_NATIVE_PENDING'); assert.equal(result.selection?.originals.length, 18); assert.equal(result.uiResult.observation?.retirement.status, 'CONFIRMED_UI_ONLY'); assert.equal(result.hostedAcceptance, false); assert.equal(result.runnerLossRecoveryVerified, false); });
test('missing original HTTP retains uncertainty without inventing a native selection', async () => { const result = await adapt(fixture(1, true)); assert.equal(result.selection, null); assert.equal(result.retainedOriginals[0].http, null); assert.equal(result.status, 'ORIGINALS_RETAINED_REQUIRES_REVIEW'); assert.equal(result.runnerLossRecoveryVerified, false); });
test('replaced archive hash, expired original clocks and full selection of a failed recipe refuse', async () => { const f = fixture(), bytes = await zip(f.files); for (const changes of [{ archiveSha256: '0'.repeat(64) }, { now: Date.parse(backendIdentity.consumptionExpiresAt) }, { mode: 'FULL_RECIPE' }]) await assert.rejects(subject.adaptHostedCommunityArtifactArchive(bytes, { ...f.expected, archiveSha256: rawHash(bytes), ...changes })); });
test('missing reports, duplicate files and foreign private paths are refused from actual ZIP bytes', async () => { for (const kind of ['missing-result', 'missing-head', 'duplicate', 'foreign', 'link']) { const f = fixture(); if (kind === 'missing-result') f.files = f.files.filter(r => !r.name.endsWith('/result.json')); if (kind === 'missing-head') f.files = f.files.filter(r => !r.name.endsWith('000003.head.json')); if (kind === 'duplicate') f.files.push(f.files[0]); if (kind === 'foreign') f.files.push({ name: f.uiRoot + 'private.json', bytes: json({ private: 'withheld' }) }); if (kind === 'link') f.files.push({ name: f.uiRoot + '000999.intent.json', bytes: json({}), options: { mode: 0o120600 } }); await assert.rejects(adapt(f), kind); } });
test('source, actor, original body, normalized input, receipt, generation and inventory tampering refuse', async () => { for (const kind of ['source', 'actor', 'body', 'input', 'receipt', 'generation', 'inventory', 'native', 'unknown']) { const f = fixture(18), file = f.files.find(r => r.name.endsWith(kind === 'source' ? '/run-intent.json' : kind === 'unknown' ? '/result.json' : '/000001.http.json'))!, value = JSON.parse(file.bytes.toString()); if (kind === 'source') value.identity.treeSha = '0'.repeat(40); if (kind === 'actor') value.original.command.actorId = tuple.studentActorId; if (kind === 'body') value.requestBody = value.requestBody + ' '; if (kind === 'input') value.input.name = 'Other content'; if (kind === 'receipt') value.receiptIdentity.receiptId = id(99); if (kind === 'generation') value.scopeGeneration++; if (kind === 'inventory') f.files.push({ ...file, name: f.uiRoot + '000999.http.json' }); if (kind === 'native') value.nativeChainVerified = true; if (kind === 'unknown') value.unreviewedPrivateProof = true; file.bytes = json(value); await assert.rejects(adapt(f), kind); } });
test('ordinary local execution refuses before making any provider read', async () => { const previous = globalThis.fetch; let calls = 0; try { globalThis.fetch = async () => { calls++; throw Error('No provider request'); }; await assert.rejects(subject.readOfficialHostedCommunityUiArtifact({})); assert.equal(calls, 0); } finally { globalThis.fetch = previous; } });

test('actual encrypted and traversal ZIP names refuse without extraction or private output', async () => { const f = fixture(), original = await zip(f.files); for (const kind of ['encryption', 'traversal']) { const bytes = Buffer.from(original); for (let offset = 0; offset < bytes.length - 46; offset++) if (bytes.readUInt32LE(offset) === 0x02014b50) { if (kind === 'encryption') bytes.writeUInt16LE(bytes.readUInt16LE(offset + 8) | 1, offset + 8); else bytes.subarray(offset + 46, offset + 46 + bytes.readUInt16LE(offset + 28)).write('../'); break; } await assert.rejects(subject.adaptHostedCommunityArtifactArchive(bytes, { ...f.expected, archiveSha256: rawHash(bytes) }), error => String(error).includes('contents withheld')); } });
test('an observed HTTP companion after failed local journal acknowledgement is reconciliation evidence only', async () => { const f = fixture(1, true), confirmed = fixture(), http = confirmed.files.find(row => row.name.endsWith('000001.http.json'))!; f.files.push(http); f.manifest.companions.push({ path: '000001.http.json', sha256: rawHash(http.bytes) }); const manifestFile = f.files.find(row => row.name.endsWith('/command-manifest.json'))!, resultFile = f.files.find(row => row.name.endsWith('/result.json'))!; manifestFile.bytes = json(f.manifest); f.result.companionManifestSha256 = rawHash(manifestFile.bytes); resultFile.bytes = json(f.result); f.expected.commandManifestSha256 = rawHash(manifestFile.bytes); const result = await adapt(f); assert.equal(result.selection?.originals[0].http.receiptSha256, confirmed.manifest.commands[0].receiptSha256); assert.equal(result.uiResult.confirmedCommandCount, 0); assert.equal(result.runnerLossRecoveryVerified, false); assert.equal(result.status, 'ORIGINALS_RETAINED_REQUIRES_REVIEW'); });

test('current source-bound host contract and minimized join observation survive strict import without granting native proof', async () => {
  const f = fixture(18), settings = (rootDirectory: string | null, framework: string | null) => ({ nodeVersion: '24.x', fluid: true, functionDefaultRegions: ['sin1'], autoAssignCustomDomains: false, ssoDeploymentType: 'all_except_custom_domains', rootDirectory, framework });
  const host = { version: 1, purpose: 'CUEVO_STAGING_HOST_CONTRACT', sourceSha: identity.sourceSha, treeSha: identity.treeSha, deploymentEnvironment: 'synthetic-staging', targets: { api: { teamId: backendIdentity.web.teamId, projectId: 'prj_api', origin: webAdmission.apiOrigin, target: 'preview' }, web: backendIdentity.web, supabase: { projectRef: identity.projectRef, authOrigin: webAdmission.authOrigin, edgeOrigin: webAdmission.authOrigin + '/functions/v1/cuevo-worker' } }, settings: { api: settings(null, null), web: settings('apps/web', 'nextjs'), supabase: { region: 'ap-southeast-1', postgresEngine: '17', applicationConnection: { kind: 'direct', host: 'db.' + identity.projectRef + '.supabase.co', port: 5432, database: 'postgres' } } }, sourceBounds: { api: { node: '24', maxDurationSeconds: 60, poolMax: 10, connectionTimeoutMs: 3000, idleTimeoutMs: 10000, statementTimeoutMs: 5000 }, worker: { poolMax: 1, connectionTimeoutMs: 3000, statementTimeoutMs: 5000, processingDeadlineMs: 20000, claimReserveMs: 15000, eventLeaseSeconds: 30, invocationLeaseSeconds: 60, deliveryTimeoutMs: 30000, recoveryIntervalSeconds: 60 } }, capacity: { postgres: { maxConnections: 60, superuserReservedConnections: 3 }, sessionPoolerClientCeiling: { state: 'UNKNOWN', value: null } }, exposure: { audience: 'PRIVATE_SYNTHETIC_OPERATORS', roleScope: 'FIVE_REFERENCE_ROLES', gatewayPolicy: 'EXISTING_PROTECTED_PREVIEW_AND_RESERVED_ORIGIN', clientAddressPolicy: 'HOSTED_VERIFICATION_PENDING', fleetProtection: 'NOT_VERIFIED' } };
  for (const file of f.files.filter(row => /\/(?:run-intent|command-manifest)\.json$/.test(row.name))) { const value = JSON.parse(file.bytes.toString()); value.backendIdentity.stagingHostContract = host; value.backendIdentity.stagingHostContractSha256 = stagingHostContractSha256(host); if (file.name.endsWith('/command-manifest.json')) value.invalidations = [{ eventId: id(800), roomId: id(1), schoolId: tuple.schoolId, actorId: tuple.studentActorId, generation: 3, joinProof: { joinRef: '1', replyRef: '1' }, observedAt: at }]; file.bytes = json(value); }
  rebind(f); const result = await adapt(f); assert.deepEqual(result.backendIdentity.stagingHostContract, host); assert.equal(result.uiResult.invalidations[0].generation, 3); assert.equal(result.nativeExecutionVerified, false); assert.equal(result.hostedAcceptance, false);
  for (const kind of ['digest', 'unknown', 'host-source', 'join-private', 'join-ref']) { const changed = fixture(18); changed.files = f.files.map(row => ({ ...row, bytes: Buffer.from(row.bytes) })); const file = changed.files.find(row => row.name.endsWith('/command-manifest.json'))!, value = JSON.parse(file.bytes.toString()); if (kind === 'digest') value.backendIdentity.stagingHostContractSha256 = '0'.repeat(64); if (kind === 'unknown') value.backendIdentity.privateHostSecret = 'private-canary'; if (kind === 'host-source') { value.backendIdentity.stagingHostContract.sourceSha = '0'.repeat(40); value.backendIdentity.stagingHostContractSha256 = stagingHostContractSha256(value.backendIdentity.stagingHostContract); } if (kind === 'join-private') value.invalidations[0].joinProof.token = 'private-token-canary'; if (kind === 'join-ref') value.invalidations[0].joinProof.joinRef = 'private-token-canary'; file.bytes = json(value); rebind(changed); await assert.rejects(adapt(changed), kind); }
});

test('controlled official GET port preserves source, producer, original clocks and one immutable ZIP through refreshes', async () => {
  const f = fixture(), root = await mkdtemp(join(tmpdir(), 'cuevo-community-artifact-')), producerSource = 'fixed Community producer source';
  await mkdir(join(root, 'scripts/verification'), { recursive: true }); await writeFile(join(root, 'scripts/verification/backend-hosted-community.ts'), producerSource);
  const learning = { name: 'Verify the hosted synthetic learning-loop UI', if: "needs.release-admission.outputs.backend-selection-base64 != '' && inputs.backend_handoff != 'operating-staging'", env: { RELEASE_ENVIRONMENT: '${{ needs.release-admission.outputs.environment }}', CUEVO_SYNTHETIC_PILOT_PASSWORD: '${{ secrets.CUEVO_SYNTHETIC_PILOT_PASSWORD }}' }, run: 'node --import tsx scripts/verification/cicd-release.ts verify-learning-loop' };
  const condition="needs.release-admission.outputs.backend-selection-base64 != '' && needs.release-admission.outputs.environment == 'staging' && inputs.backend_handoff == 'customer-candidate'";
  const verify = { ...learning, name: 'Verify the hosted synthetic Community UI',if:condition,env:{...learning.env,SUPABASE_ACCESS_TOKEN:'${{ secrets.SUPABASE_ACCESS_TOKEN }}',CUEVO_MIGRATION_DATABASE_PASSWORD:'${{ secrets.CUEVO_MIGRATION_DATABASE_PASSWORD }}',CUEVO_DATABASE_TLS_CA:'${{ secrets.CUEVO_DATABASE_TLS_CA }}'}, run: 'node --import tsx scripts/verification/cicd-release.ts verify-community' };
  const retain = { name: 'Preserve the scoped original Community evidence', if:'always() && '+condition, uses: 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a', with: { name: 'cuevo-community-ui-${{ github.run_id }}-${{ github.run_attempt }}', path: '.local/cicd-release/hosted-community/\n.local/cicd-release/hosted-community-ui/\n', 'include-hidden-files': true, 'if-no-files-found': 'error', 'retention-days': 14 } };
  const workflow = { jobs: { 'web-release': { steps: [learning, verify, retain] } } }, globals = globalThis as unknown as { communitySourceCapture: (root: string, source: string) => unknown; communityWorkflowValidate: () => string[] };
  let change = 'normal';
  globals.communitySourceCapture = () => ({ treeSha: identity.treeSha, git: () => Buffer.from(JSON.stringify(change === 'missing-producer' ? { jobs: { 'web-release': { steps: [learning] } } } : workflow)), finalMetadata() { if (change === 'source-drift') throw Error('source drift'); } });
  globals.communityWorkflowValidate = () => change === 'workflow-guard' ? ['Missing reviewed Community contract'] : [];
  const hooks = registerHooks({ load(url, context, next) {
    if (url.endsWith('/backend-hosted-community-artifact.ts?controlled')) return { format: 'module', shortCircuit: true, source: transformSync(readFileSync(new URL(url.split('?')[0]), 'utf8').replace("process.platform === 'linux'", 'true').replace("root.startsWith('/home/runner/work/')", 'true').replace("from './canonical-source-jobs'", "from './canonical-source-jobs?community-controlled'").replace("from './cicd-contracts'", "from './cicd-contracts?community-controlled'"), { loader: 'ts', format: 'esm' }).code };
    if (url.endsWith('/canonical-source-jobs.ts?community-controlled')) return { format: 'module', shortCircuit: true, source: 'export const captureCanonicalSourceContext=globalThis.communitySourceCapture;' };
    if (url.endsWith('/cicd-contracts.ts?community-controlled')) return { format: 'module', shortCircuit: true, source: 'export const validateWorkflows=globalThis.communityWorkflowValidate;' };
    return next(url, context);
  } });
  const env = { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', GITHUB_WORKSPACE: root, GITHUB_REPOSITORY: backendIdentity.repository, GITHUB_SHA: identity.sourceSha, GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_JOB: 'prepare-qa', GITHUB_WORKFLOW_REF: backendIdentity.repository + '/.github/workflows/hosted-community-qa.yml@refs/heads/main', GITHUB_SERVER_URL: 'https://github.com', GITHUB_API_URL: 'https://api.github.com', RELEASE_ENVIRONMENT: 'staging' };
  const oldEnv = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]])), oldFetch = globalThis.fetch, oldNow = Date.now;
  let blobReads = 0, metadataReads = 0;
  const bytes = await zip(f.files), run = { id: 81, run_attempt: 2, repository: { full_name: backendIdentity.repository }, head_sha: identity.sourceSha, head_branch: 'main', path: '.github/workflows/release.yml', event: 'workflow_dispatch', status: 'completed', conclusion: 'failure', created_at: '2026-10-12T07:50:00Z', updated_at: '2026-10-12T08:00:30Z' };
  const job = { id: 101, name: 'web-release', run_id: 81, run_attempt: 2, head_sha: identity.sourceSha, status: 'completed', conclusion: 'failure', started_at: '2026-10-12T07:50:05Z', completed_at: '2026-10-12T08:00:20Z', steps: [learning, verify, retain].map((row, index) => ({ name: row.name, number: index + 1, status: 'completed', conclusion: index === 1 ? 'failure' : 'success', started_at: index === 2 ? '2026-10-12T08:00:05Z' : '2026-10-12T07:55:00Z', completed_at: index === 2 ? '2026-10-12T08:00:15Z' : '2026-10-12T08:00:02Z' })) };
  const artifact = { id: 91, name: 'cuevo-community-ui-81-2', size_in_bytes: bytes.length, expired: false, digest: 'sha256:' + rawHash(bytes), created_at: '2026-10-12T08:00:10Z', expires_at: '2026-10-26T08:00:10Z', workflow_run: { id: 81, head_branch: 'main', head_sha: identity.sourceSha } };
  try {
    Object.assign(process.env, env); Date.now = () => now;
    globalThis.fetch = async (raw, options) => {
      const url = new URL(String(raw)); assert.equal(options?.method, 'GET');
      if (url.hostname === 'productionresultssafixture.blob.core.windows.net') { blobReads++; assert.equal(new Headers(options?.headers).get('authorization'), null); return new Response(new Uint8Array(bytes)); }
      metadataReads++; assert.equal(url.origin, 'https://api.github.com'); assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer private-community-canary');
      if (url.pathname.endsWith('/actions/runs/81')) return Response.json({ ...run, ...(change === 'run' ? { run_attempt: 3 } : {}), ...(change === 'source' ? { head_sha: '0'.repeat(40) } : {}) });
      if (url.pathname.endsWith('/actions/artifacts/91/zip')) return new Response(null, { status: 302, headers: { location: change === 'foreign-redirect' ? 'https://foreign.invalid/private' : 'https://productionresultssafixture.blob.core.windows.net/archive' } });
      if (url.pathname.endsWith('/actions/artifacts/91')) return Response.json({ ...artifact, ...(change === 'expired-artifact' ? { expired: true } : {}) });
      if (url.pathname.endsWith('/git/commits/' + identity.sourceSha)) return Response.json({ sha: identity.sourceSha, tree: { sha: change === 'tree' ? '0'.repeat(40) : identity.treeSha } });
      if (url.pathname.endsWith('/actions/runs/81/attempts/2/jobs')) { const current = structuredClone(job); if (change === 'producer-step') current.steps[2].conclusion = 'failure'; if (change === 'producer-attempt') current.run_attempt = 3; return Response.json({ total_count: change === 'hidden-job' ? 2 : 1, jobs: change === 'duplicate-job' ? [current, current] : [current] }); }
      throw Error('Unexpected fixed API path');
    };
    const owner = await import(new URL('./backend-hosted-community-artifact.ts?controlled', import.meta.url).href) as Subject;
    const input = { repoRoot: root, githubToken: 'private-community-canary', releaseSha: identity.sourceSha, uiRunId: '81', uiRunAttempt: 2, artifactId: '91', commandManifestSha256: f.expected.commandManifestSha256, journalHeadSha256: f.expected.journalHeadSha256, mode: 'ORIGINAL_RECONCILIATION' };
    const { githubToken: _token, ...binding } = input; void _token;
    const guard = await owner.readOfficialHostedCommunityUiArtifactAndGuard(input); assert.equal(guard.admitted.officialAdmissionVerified, true); assert.equal(guard.admitted.selection?.originals.length, 1); assert.equal(blobReads, 1); const original = canonicalReleaseExecutionJson(guard.admitted); for (let index = 0; index < 3; index++) await guard.refreshOriginalMetadata(); assert.equal(blobReads, 1); assert.equal(canonicalReleaseExecutionJson(guard.admitted), original); assert.equal(owner.consumeOfficialHostedCommunityUiArtifactGuard(guard, binding), guard); assert.doesNotMatch(original, /private-community-canary/); guard.dispose(); assert.throws(() => guard.assertOriginalValidity());
    for (const kind of ['run', 'source', 'tree', 'producer-step', 'producer-attempt', 'hidden-job', 'duplicate-job', 'expired-artifact', 'foreign-redirect', 'missing-producer', 'workflow-guard']) { change = kind; await assert.rejects(owner.readOfficialHostedCommunityUiArtifact(input), kind); }
    change = 'normal';
    for (const kind of ['metadata-drift', 'producer-drift', 'result-drift', 'expiry', 'env', 'source-drift']) { const retained = await owner.readOfficialHostedCommunityUiArtifactAndGuard(input); if (kind === 'metadata-drift') change = 'run'; if (kind === 'producer-drift') await writeFile(join(root, 'scripts/verification/backend-hosted-community.ts'), 'changed source'); if (kind === 'result-drift') retained.admitted.treeSha = '0'.repeat(40); if (kind === 'expiry') Date.now = () => Date.parse(retained.admitted.expiresAt); if (kind === 'env') process.env.GITHUB_JOB = 'web-release'; if (kind === 'source-drift') change = kind; await assert.rejects(retained.refreshOriginalMetadata(), kind); assert.throws(() => retained.assertOriginalValidity(), kind); retained.dispose(); change = 'normal'; Date.now = () => now; process.env.GITHUB_JOB = 'prepare-qa'; await writeFile(join(root, 'scripts/verification/backend-hosted-community.ts'), producerSource); }
    const exact = await owner.readOfficialHostedCommunityUiArtifactAndGuard(input); for (const forged of [{}, structuredClone(exact.admitted), new Proxy(exact, { get() { throw Error('private proxy trap'); } })]) assert.throws(() => owner.consumeOfficialHostedCommunityUiArtifactGuard(forged, binding), error => !String(error).includes('proxy trap')); assert.throws(() => owner.consumeOfficialHostedCommunityUiArtifactGuard(exact, { ...binding, mode: 'FULL_RECIPE' })); assert.throws(() => exact.assertOriginalValidity()); exact.dispose(); assert(metadataReads > 10);
  } finally { hooks.deregister(); globalThis.fetch = oldFetch; Date.now = oldNow; for (const [key, value] of Object.entries(oldEnv)) if (value === undefined) delete process.env[key]; else process.env[key] = value; delete (globalThis as unknown as Record<string, unknown>).communitySourceCapture; delete (globalThis as unknown as Record<string, unknown>).communityWorkflowValidate; assert.equal(dirname(root), resolve(tmpdir())); await rm(root, { recursive: true, force: true }); }
});
