import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { realpath } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { types } from 'node:util';
import { z } from 'zod';
import { canonicalReleaseExecutionJson, canonicalReleaseReviewJson, parseReleaseExecutionJson, parseCanonicalReleaseReviewJson } from './release-review';
import { hostedCommandJournalContracts } from './hosted-command-journal-contracts';
import { readHostedCommandArtifactFiles } from './backend-hosted-learning-loop-artifact';
import { parseHostedCommunityCommand, requireHostedCommunityRecipeStep, type HostedCommunityScope } from './hosted-community-command';
import { selectHostedCommunityNativeSelection, selectHostedCommunityLivePrefixSelection, type HostedCommunityLivePrefixSelection, type HostedCommunityNativeSelection, type HostedCommunityNativeOriginal } from './hosted-community-native';
import { readHostedBrowserSource } from './hosted-browser-evidence';
import { createGithubCodeqlArtifactReader } from './staging-security';
import { readBoundedRuntimeResponse } from '../database/hosted-runtime-rollout-session';
import { captureCanonicalSourceContext } from './canonical-source-jobs';
import { validateWorkflows } from './cicd-contracts';
import { stagingHostContractSchema, stagingHostContractSha256, requireStagingHostContract } from './backend-staging-host-contract';
import {emptyHostedCommunityAuxiliaryObservation,parseHostedCommunityAuxiliaryObservation,validateHostedCommunityAuxiliaryCompletion} from './hosted-community-auxiliary';
import {parseHostedCommunityDeliveryReads} from './hosted-community-delivery';
import {parseHostedCommunityViewObservations,validateHostedCommunityViewCompletion,hostedCommunityViewStages} from './hosted-community-view';

const fail = () => Error('Official Community artifact requires review; metadata and private contents withheld.');
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const same = (a: unknown, b: unknown) => canonicalReleaseExecutionJson(a) === canonicalReleaseExecutionJson(b);
function fact(value: unknown): asserts value { if (!value) throw fail(); }
const digest = z.string().regex(/^[a-f0-9]{64}$/), sha = z.string().regex(/^[a-f0-9]{40}$/), uuid = z.uuid(), date = z.iso.datetime({ offset: true });
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER), count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const runId = z.string().regex(/^[1-9][0-9]{0,19}$/).refine(value => Number.isSafeInteger(Number(value)));
const mode = z.enum(['FULL_RECIPE', 'ORIGINAL_RECONCILIATION']);
const repository = z.string().regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/).refine(value => !value.split('/').some(part => part === '.' || part === '..'));
const origin = z.string().url().refine(value => { const u = new URL(value); return u.protocol === 'https:' && u.origin === value && !u.username && !u.password && !u.port; });
const contracts = hostedCommandJournalContracts('community');
const identitySchema = contracts.originalSchema.shape.identity;
const tuple = { schoolId: '10000000-0000-4000-8000-000000000001', classId: '30000000-0000-4000-8000-000000000001', teacherActorId: '20000000-0000-4000-8000-000000000004', studentActorId: '20000000-0000-4000-8000-000000000012', peerActorId: '20000000-0000-4000-8000-000000000018', parentActorId: '20000000-0000-4000-8000-000000000072' } as const;
const scopeSchema = z.object({ synthetic: z.literal(true), schoolId: z.literal(tuple.schoolId), classId: z.literal(tuple.classId), teacherActorId: z.literal(tuple.teacherActorId), studentActorId: z.literal(tuple.studentActorId), peerActorId: z.literal(tuple.peerActorId), parentActorId: z.literal(tuple.parentActorId), group: z.object({ id: uuid, revision: positive }).strict().nullable(), postIds: z.array(uuid).max(3), announcement: z.object({ id: uuid, revision: positive }).strict().nullable() }).strict();
const selectedSchema = z.object({ teacher: z.literal(tuple.teacherActorId), student: z.literal(tuple.studentActorId), peer: z.literal(tuple.peerActorId), parent: z.literal(tuple.parentActorId), outsideClass: z.literal('20000000-0000-4000-8000-000000000013'), foreign: z.literal('20000000-0000-4000-8000-000000000133') }).strict();
const backendSchema = z.object({ repository, sourceSha: sha, treeSha: sha, baseSha: sha, ciRunId: runId, runId, runAttempt: positive, artifactId: runId, artifactSha256: digest, transferSha256: digest, manifestSha256: digest, packageSha256: digest, web: z.object({ teamId: z.string().regex(/^team_[A-Za-z0-9]+$/), projectId: z.string().regex(/^prj_[A-Za-z0-9]+$/), origin, target: z.literal('preview') }).strict(), settingsSha256: digest, earliestProofAt: date, exportedAt: date, consumptionExpiresAt: date }).strict();
const currentBackendSchema = backendSchema.extend({ stagingHostContract: stagingHostContractSchema.optional(), stagingHostContractSha256: digest.optional() }).strict();
const webSchema = z.object({ purpose: z.literal('PREBUILD_RELEASE_ADMISSION'), sourceSha: sha, treeSha: sha, ciRunId: runId, runId, runAttempt: positive, webDeploymentId: identitySchema.shape.webDeploymentId, artifactSha256: digest, packageSha256: digest, backendTransferSha256: digest, populationReceiptSha256: digest, apiOrigin: origin, authOrigin: origin, webOrigin: origin, webPackageExpiresAt: date, observedAt: date }).strict();
const common = { identity: identitySchema, backendIdentity: currentBackendSchema, webAdmission: webSchema, populationReceiptSha256: digest, producerSha256: digest, selectedActorIds: selectedSchema };
const stateSchema = z.object({ original: contracts.originalSchema, state: contracts.recordSchema.shape.state, httpReceiptSha256: digest.nullable(), nativeReceiptSha256: digest.nullable() }).strict();
const journalSchema = z.object({ records: z.array(contracts.recordSchema).min(1).max(512), commands: z.array(stateSchema).min(1).max(18), lastRecordSha256: digest, evidence: z.literal('LOCAL_DURABLE_METADATA_ONLY'), hostedAcceptance: z.literal(false), runnerLossRecoveryVerified: z.literal(false) }).strict();
const metadataSchema = z.object({ operation: contracts.commandSchema.shape.operation, owner: z.enum(['normal', 'maintenance']), ledgerCommand: z.string().max(100), targetId: uuid.nullable(), sourceIds: contracts.commandSchema.shape.sourceIds, sourceRevision: positive.nullable(), requestBodySha256: digest, nativeFingerprint: digest, input: z.record(z.string(), z.unknown()), requestBody: z.string().min(2).max(65536), scopeGeneration: positive }).strict();
const intentSchema = metadataSchema.extend({ version: z.literal(1), purpose: z.literal('CUEVO_HOSTED_COMMUNITY_ORIGINAL_COMMAND'), original: contracts.originalSchema }).strict();
const receiptSchema = z.object({ operation: contracts.commandSchema.shape.operation, owner: z.enum(['normal', 'maintenance']), ledgerCommand: z.string().max(100), receiptId: uuid, sourceId: uuid, changeId: uuid.nullable(), revision: positive.nullable(), status: z.enum(['VISIBLE', 'READ', 'CLOSED', 'WITHDRAWN']).nullable() }).strict();
const httpSchema = metadataSchema.extend({ version: z.literal(1), purpose: z.literal('CUEVO_HOSTED_COMMUNITY_HTTP_RECEIPT'), original: contracts.originalSchema, originalCompanionSha256: digest, requestId: z.string().regex(/^[-A-Za-z0-9_.:]{1,200}$/), status: z.literal(200), receiptSha256: digest, observedReceiptSha256: digest, receiptIdentity: receiptSchema, nativeChainVerified: z.literal(false) }).strict();
const writeSchema = z.object({ action: z.string().min(1).max(200), path: contracts.commandSchema.shape.path, actorId: uuid, scopeGeneration: positive, status: z.literal(200), id: uuid, key: contracts.commandSchema.shape.key, keySha256: digest, requestSha256: digest, bodySha256: digest, receiptSha256: digest }).strict();
const retirementSchema = z.object({ status: z.enum(['NOT_REQUESTED', 'CONFIRMED_UI_ONLY']), groupClosed: z.boolean(), announcementWithdrawn: z.boolean(), mainMemberRevoked: z.boolean(), referenceRestored: z.literal(false) }).strict();
const observationSchema = z.object({ groupId: uuid, postIds: z.array(uuid).max(2), replyId: uuid, reportId: uuid, membershipChangeIds: z.array(uuid).max(3), announcementId: uuid, writes: z.array(writeSchema).max(18), sessionStartedCount: count, sessionEndedCount: count, cleanupCount: count, retirement: retirementSchema, nativeChainVerified: z.literal(false), hostedAcceptance: z.literal(false), customerReady: z.literal(false) }).strict();
const invalidationSchema = z.object({ eventId: uuid, roomId: uuid, schoolId: uuid, actorId: uuid, generation: positive, joinProof: z.object({ joinRef: z.string().regex(/^[0-9]{1,20}$/), replyRef: z.string().regex(/^[0-9]{1,20}$/) }).strict(), observedAt: date }).strict();
const status = z.enum(['UI_RECIPE_VERIFIED_NATIVE_PENDING', 'REQUIRES_REVIEW']);
const runIntentSchema = z.object({ version: z.literal(1), purpose: z.literal('CUEVO_HOSTED_COMMUNITY_UI'), ...common }).strict();
const auxiliarySchema=z.unknown().transform(value=>parseHostedCommunityAuxiliaryObservation(value));
const deliveryReadsSchema=z.unknown().transform(value=>parseHostedCommunityDeliveryReads(value));
const viewsSchema=z.unknown().transform(value=>parseHostedCommunityViewObservations(value));
const failureSchema=z.object({phase:z.enum(['APPROVAL','AUTH','MEMBERSHIP','DENIAL','DELIVERY','ROUTE','SOCKET','SESSION_CLEANUP','BROWSER_SETUP']),method:z.enum(['GET','POST']).nullable(),path:z.enum(['auth_token','auth_user','auth_logout','membership','community_posts','community_roster','community_other','web','unknown']),transport:z.enum(['ERR_ABORTED','ERR_FAILED','NONE','UNKNOWN']),observedAt:date}).strict();
const manifestSchema = z.object({ version: z.literal(1), purpose: z.literal('CUEVO_HOSTED_COMMUNITY_UI_EVIDENCE'), ...common, status, scope: scopeSchema, journal: journalSchema, commands: z.array(httpSchema.extend({ companionSha256: digest }).strict()).max(18), companions: z.array(z.object({ path: z.string().regex(/^\d{6}\.(?:intent|http)\.json$/), sha256: digest }).strict()).min(1).max(36), livePrefixProof:z.object({snapshotSha256:digest,proofSha256:digest}).strict().nullable().optional(),auxiliary:auxiliarySchema.optional(),deliveryRereads:deliveryReadsSchema.optional(),viewObservations:viewsSchema.optional(), observation: observationSchema.nullable(), invalidations: z.array(invalidationSchema).max(100), nativeChainVerified: z.literal(false), referenceRestored: z.literal(false), customerReady: z.literal(false), hostedAcceptance: z.literal(false) }).strict();
const resultSchema = z.object({ purpose: z.literal('CUEVO_HOSTED_COMMUNITY_UI'), status, identity: identitySchema, sourceSha: sha, runId, runAttempt: positive, producerSha256: digest, observedAt: date,failure:failureSchema.nullable().optional(), confirmedCommandCount: count, sessionsClosed: z.boolean(), unexpectedRequests: count, consoleErrors: count, consoleWarnings: count, pageErrors: count, observation: observationSchema.nullable(), invalidations: z.array(invalidationSchema).max(100),auxiliary:auxiliarySchema.optional(),deliveryRereads:deliveryReadsSchema.optional(),viewObservations:viewsSchema.optional(), journalLastRecordSha256: digest, companionManifestSha256: digest, privateReconnectVerified: z.boolean(), nativeChainVerified: z.literal(false), referenceRestored: z.literal(false), customerReady: z.literal(false), hostedAcceptance: z.literal(false) }).strict();
const expectedSchema = z.object({ sourceSha: sha, uiRunId: runId, uiRunAttempt: positive, commandManifestSha256: digest, journalHeadSha256: digest, producerSha256: digest, archiveSha256: digest, mode, now: z.number().int().nonnegative() }).strict();
export type HostedCommunityArtifactExpected = z.infer<typeof expectedSchema>;
export type HostedCommunityRetainedOriginal = Omit<HostedCommunityNativeOriginal, 'http'> & { http: HostedCommunityNativeOriginal['http'] | null; state: z.infer<typeof stateSchema>['state']; scopeGeneration: number };
export type HostedCommunityArtifact = {
  selection: HostedCommunityNativeSelection | null; retainedOriginals: HostedCommunityRetainedOriginal[];
  backendIdentity: z.infer<typeof currentBackendSchema>; webAdmission: z.infer<typeof webSchema>; uiResult: z.infer<typeof resultSchema>;
  sourceIds: string[]; scopeSha256: string; expiresAt: string; status: 'UI_RECIPE_VERIFIED_NATIVE_PENDING' | 'ORIGINALS_RETAINED_REQUIRES_REVIEW';
  uiArtifactSha256: string; commandManifestSha256: string; journalHeadSha256: string;
  nativeClassRoomId:string|null;
  nativeDeliveryEventIds:string[];
  nativeDeliveryObservedAt:string|null;
  officialAdmissionVerified: false; nativeExecutionVerified: false; runnerLossRecoveryVerified: false; hostedAcceptance: false; customerReady: false;
};
function parsed<T>(files: Map<string, Buffer>, path: string, schema: z.ZodType<T>, journal = false): T {
  const bytes = files.get(path); fact(bytes);
  const text = new TextDecoder('utf8', { fatal: true }).decode(bytes);
  const value = journal ? text.endsWith('\n') ? parseCanonicalReleaseReviewJson(text.slice(0, -1)) : undefined : parseReleaseExecutionJson(text);
  if (!journal) fact(canonicalReleaseExecutionJson(value) === text);
  return schema.parse(value);
}
const metadata = (value: z.infer<typeof metadataSchema>) => metadataSchema.parse(Object.fromEntries(Object.keys(metadataSchema.shape).map(key => [key, value[key as keyof typeof value]])));

function validateCommunityJournal(value: z.infer<typeof journalSchema>, identity: z.infer<typeof identitySchema>) {
  const states: z.infer<typeof stateSchema>[] = []; let previous: string | null = null;
  for (const [index, record] of value.records.entries()) {
    const { recordSha256, ...payload } = record;
    fact(record.sequence === index + 1 && record.previousRecordSha256 === previous && hash(canonicalReleaseReviewJson(payload)) === recordSha256
      && same(record.identity, identity) && record.command.schoolId === identity.schoolId && record.nativeReceiptSha256 === null && record.nativeProof === null && record.state !== 'NATIVE_CONFIRMED');
    if (record.state === 'INTENT') {
      fact(record.intentSequence === record.sequence && record.intentRecordSha256 === null && record.httpReceiptSha256 === null
        && states.every(row => row.state === 'HTTP_CONFIRMED') && !states.some(row => row.original.command.key === record.command.key));
      states.push(stateSchema.parse({ original: { identity: record.identity, command: record.command, intentSequence: record.sequence, intentRecordSha256: recordSha256 }, state: 'INTENT', httpReceiptSha256: null, nativeReceiptSha256: null }));
    } else {
      const state = states.at(-1); fact(state && state.original.intentRecordSha256 === record.intentRecordSha256 && same(state.original.command, record.command) && state.original.intentSequence === record.intentSequence);
      fact(record.state === 'UNCERTAIN' && state.state !== 'UNCERTAIN' || state.state === 'INTENT' && record.state === 'FORWARDING_AUTHORIZED' || state.state === 'FORWARDING_AUTHORIZED' && record.state === 'HTTP_CONFIRMED');
      fact(record.state === 'HTTP_CONFIRMED' ? record.httpReceiptSha256 !== null : record.httpReceiptSha256 === state.httpReceiptSha256);
      state.state = record.state; state.httpReceiptSha256 = record.httpReceiptSha256;
    }
    previous = recordSha256;
  }
  fact(same(states, value.commands) && previous === value.lastRecordSha256);
  return states;
}
function requireOriginalCompanion(original: z.infer<typeof intentSchema>, state: z.infer<typeof stateSchema>, index: number, scope: HostedCommunityScope) {
  const command=state.original.command,actor={actorId:command.actorId,schoolId:command.schoolId,role:command.role};
  fact(same(original.original,state.original));
  const parsedCommand=parseHostedCommunityCommand(command.path,original.requestBody,actor,scope);
  requireHostedCommunityRecipeStep(index,command.path,actor,original.scopeGeneration,scope,parsedCommand);
  fact(original.requestBodySha256===parsedCommand.requestBodySha256&&original.requestBodySha256===command.requestBodySha256
    &&original.nativeFingerprint===parsedCommand.nativeFingerprint&&same(original.input,parsedCommand.input)
    &&same(original.sourceIds,parsedCommand.sourceIds)&&same(command.sourceIds,parsedCommand.sourceIds)&&original.sourceRevision===parsedCommand.sourceRevision
    &&command.sourceRevision===parsedCommand.sourceRevision&&original.operation===parsedCommand.operation&&command.operation===parsedCommand.operation&&command.step===command.operation
    &&original.owner===parsedCommand.owner&&original.ledgerCommand===parsedCommand.ledgerCommand&&original.targetId===parsedCommand.targetId);
  return parsedCommand;
}
const livePrefixInputSchema=z.object({identity:identitySchema,scope:scopeSchema,journal:journalSchema,commands:z.array(httpSchema.extend({companionSha256:digest}).strict()).length(15),companions:manifestSchema.shape.companions}).strict();
export type HostedCommunityLivePrefixInput=z.infer<typeof livePrefixInputSchema>;
export type HostedCommunityLivePrefixSnapshot=HostedCommunityLivePrefixInput&{version:1;purpose:'CUEVO_HOSTED_COMMUNITY_LIVE_PREFIX';nativeExecutionVerified:false;hostedAcceptance:false;customerReady:false};
const livePrefixSnapshotSchema=livePrefixInputSchema.extend({version:z.literal(1),purpose:z.literal('CUEVO_HOSTED_COMMUNITY_LIVE_PREFIX'),nativeExecutionVerified:z.literal(false),hostedAcceptance:z.literal(false),customerReady:z.literal(false)}).strict();
const livePrefixProofSchema=z.object({version:z.literal(1),purpose:z.literal('CUEVO_HOSTED_COMMUNITY_LIVE_PREFIX_PROOF'),status:z.literal('LIVE_PREFIX_NATIVE_VERIFIED'),identity:identitySchema,
  prefixSnapshotSha256:digest,journalHeadSha256:digest,companionInventorySha256:digest,nativeEvidenceSha256:digest,classRoomId:uuid,deliveryEventIds:z.array(uuid).min(1).max(100).refine(rows=>new Set(rows).size===rows.length),observedAt:date,readOnly:z.literal(true),sessionsClosed:z.literal(true),customerReady:z.literal(false),hostedAcceptance:z.literal(false),referenceRestored:z.literal(false)}).strict();
/** This snapshot records genuine original bytes. Its hashes establish equality,
 * never approval or a database effect; the live owner must authenticate context
 * and obtain the separate read-only native proof before retirement. */
export function prepareHostedCommunityLivePrefix(value:unknown,files:ReadonlyMap<string,Buffer>):{snapshot:HostedCommunityLivePrefixSnapshot;selection:HostedCommunityLivePrefixSelection}{
  try{
    const input=livePrefixInputSchema.parse(JSON.parse(canonicalReleaseExecutionJson(value))),states=validateCommunityJournal(input.journal,input.identity);
    fact(states.length===15&&states.every(row=>row.state==='HTTP_CONFIRMED')&&input.companions.length===30&&files.size===30);
    const scope:HostedCommunityScope={...tuple,synthetic:true,group:null,postIds:[],announcement:null},originals:HostedCommunityNativeOriginal[]=[],originalFiles=new Map(files);
    const used=new Set<string>();
    for(const[index,state]of states.entries()){
      const number=String(state.original.intentSequence).padStart(6,'0'),intentName=number+'.intent.json',httpName=number+'.http.json';
      const original=parsed(originalFiles,intentName,intentSchema),receipt=parsed(originalFiles,httpName,httpSchema);
      const intentEntry=input.companions.filter(row=>row.path===intentName),httpEntry=input.companions.filter(row=>row.path===httpName);
      fact(intentEntry.length===1&&httpEntry.length===1&&intentEntry[0].sha256===hash(files.get(intentName)!)&&httpEntry[0].sha256===hash(files.get(httpName)!));
      const command=requireOriginalCompanion(original,state,index,scope),stored=input.commands[index],{companionSha256,...storedReceipt}=stored;
      fact(same(receipt.original,state.original)&&receipt.originalCompanionSha256===intentEntry[0].sha256&&same(metadata(receipt),metadata(original))
        &&companionSha256===httpEntry[0].sha256&&same(receipt,storedReceipt)&&receipt.receiptSha256===state.httpReceiptSha256);
      originals.push({original:state.original,targetId:command.targetId,nativeFingerprint:command.nativeFingerprint,requestBodySha256:command.requestBodySha256,input:command.input,
        http:{status:200,requestId:receipt.requestId,receiptSha256:receipt.receiptSha256,receiptIdentity:receipt.receiptIdentity}});
      if(command.operation==='room.create')scope.group={id:receipt.receiptIdentity.receiptId,revision:1};
      else if(command.operation==='post.create')scope.postIds.push(receipt.receiptIdentity.receiptId);
      else if(command.operation==='announcement.create')scope.announcement={id:receipt.receiptIdentity.receiptId,revision:1};
      used.add(intentName);used.add(httpName);
    }
    fact(same(scope,input.scope)&&new Set(input.companions.map(row=>row.path)).size===30&&same([...used].sort(),[...files.keys()].sort()));
    const snapshot:HostedCommunityLivePrefixSnapshot={version:1,purpose:'CUEVO_HOSTED_COMMUNITY_LIVE_PREFIX',...input,nativeExecutionVerified:false,hostedAcceptance:false,customerReady:false};
    const selection=selectHostedCommunityLivePrefixSelection({identity:{...input.identity,evidenceSource:'LIVE_PREFIX',prefixSnapshotSha256:hash(canonicalReleaseExecutionJson(snapshot)),journalHeadSha256:input.journal.lastRecordSha256,companionInventorySha256:hash(canonicalReleaseExecutionJson(input.companions))},scope:input.scope,mode:'LIVE_PREFIX',originals});
    return{snapshot,selection};
  }catch{throw fail();}
}

/** Artifact inputs are provenance only. Even a complete UI recipe does not
 * establish native authority, private reconnect or reference restoration. */
export async function adaptHostedCommunityArtifactArchive(bytes: Uint8Array, value: unknown): Promise<HostedCommunityArtifact> {
  try {
    const expected = expectedSchema.parse(JSON.parse(canonicalReleaseExecutionJson(value))); fact(hash(bytes) === expected.archiveSha256);
    const files = await readHostedCommandArtifactFiles(bytes, 'community'), paths = [...files.keys()].filter(name => name.endsWith('/command-manifest.json')); fact(paths.length === 1);
    const manifestPath = paths[0], uiRoot = manifestPath.slice(0, -'command-manifest.json'.length), manifest = parsed(files, manifestPath, manifestSchema);
    const { identity, backendIdentity: backend, webAdmission: web } = manifest;
    const scopeName = 'scope-' + hash(JSON.stringify([identity.projectRef, identity.schoolId])), journalRoot = 'hosted-community/' + scopeName + '/';
    fact(uiRoot === 'hosted-community-ui/' + scopeName + '/run-' + identity.runId + '-' + identity.runAttempt + '/');
    const result = parsed(files, uiRoot + 'result.json', resultSchema), intent = parsed(files, uiRoot + 'run-intent.json', runIntentSchema);
    const owner = parsed(files, journalRoot + 'owner.json', z.object({ version: z.literal(1), purpose: z.literal(contracts.purpose), projectRef: identitySchema.shape.projectRef, schoolId: uuid }).strict(), true);
    fact(hash(files.get(manifestPath)!) === expected.commandManifestSha256 && result.companionManifestSha256 === expected.commandManifestSha256
      && identity.sourceSha === expected.sourceSha && identity.runId === expected.uiRunId && identity.runAttempt === expected.uiRunAttempt
      && manifest.producerSha256 === expected.producerSha256 && result.producerSha256 === expected.producerSha256
      && owner.projectRef === identity.projectRef && owner.schoolId === identity.schoolId && identity.schoolId === tuple.schoolId);
    for (const key of Object.keys(common) as (keyof typeof common)[]) fact(same(intent[key], manifest[key]));
    fact(same(result.identity, identity) && result.sourceSha === identity.sourceSha && result.runId === identity.runId && result.runAttempt === identity.runAttempt
      && result.status === manifest.status && same(result.observation, manifest.observation) && same(result.invalidations, manifest.invalidations) &&same(result.deliveryRereads??[],manifest.deliveryRereads??[])&&same(result.viewObservations??[],manifest.viewObservations??[])&& same(result.auxiliary??emptyHostedCommunityAuxiliaryObservation(),manifest.auxiliary??emptyHostedCommunityAuxiliaryObservation()) && result.confirmedCommandCount === manifest.commands.length);
    fact(backend.sourceSha === identity.sourceSha && backend.treeSha === identity.treeSha && backend.ciRunId === identity.ciRunId
      && backend.transferSha256 === identity.backendTransferSha256 && backend.runId !== identity.runId && web.sourceSha === identity.sourceSha
      && web.treeSha === identity.treeSha && web.ciRunId === identity.ciRunId && web.runId === identity.runId && web.runAttempt === identity.runAttempt
      && web.webDeploymentId === identity.webDeploymentId && web.backendTransferSha256 === identity.backendTransferSha256
      && web.webOrigin === backend.web.origin && web.authOrigin === 'https://' + identity.projectRef + '.supabase.co' && manifest.populationReceiptSha256 === web.populationReceiptSha256);
    if (backend.stagingHostContract !== undefined || backend.stagingHostContractSha256 !== undefined) {
      fact(backend.stagingHostContract !== undefined && backend.stagingHostContractSha256 === stagingHostContractSha256(backend.stagingHostContract));
      const host = requireStagingHostContract({ releaseSha: identity.sourceSha, treeSha: identity.treeSha, deploymentEnvironment: 'synthetic-staging', targets: backend.stagingHostContract.targets, stagingHostContract: backend.stagingHostContract });
      fact(same(host.targets.web, backend.web) && host.targets.supabase.projectRef === identity.projectRef && host.targets.supabase.authOrigin === web.authOrigin && host.targets.api.origin === web.apiOrigin);
    }
    const expires = Math.min(Date.parse(backend.consumptionExpiresAt), Date.parse(web.webPackageExpiresAt));
    if(result.failure)fact(Date.parse(result.failure.observedAt)>=Date.parse(web.observedAt)&&Date.parse(result.failure.observedAt)<=Date.parse(result.observedAt));
    fact(expires > expected.now && Date.parse(backend.earliestProofAt) <= Date.parse(backend.exportedAt) && Date.parse(backend.exportedAt) <= Date.parse(web.observedAt)
      && Date.parse(web.observedAt) <= Date.parse(result.observedAt) && Date.parse(result.observedAt) <= expected.now);
    const used = new Set([manifestPath, uiRoot + 'result.json', uiRoot + 'run-intent.json', journalRoot + 'owner.json']);
    const states=validateCommunityJournal(manifest.journal,identity);let previous:string|null=null;
    for (const [index, supplied] of manifest.journal.records.entries()) {
      const number = String(index + 1).padStart(6, '0'), recordPath = journalRoot + number + '.record.json', headPath = journalRoot + number + '.head.json';
      const record = parsed<z.infer<typeof contracts.recordSchema>>(files, recordPath, contracts.recordSchema, true), head = parsed<z.infer<typeof contracts.headSchema>>(files, headPath, contracts.headSchema, true); used.add(recordPath); used.add(headPath);
      const { recordSha256 } = record;
      fact(same(record, supplied) && same(head, { version: 1, purpose: record.purpose, sequence: record.sequence, recordSha256, previousRecordSha256: previous }));
      previous = recordSha256;
    }
    fact(same(states, manifest.journal.commands) && previous === manifest.journal.lastRecordSha256 && previous === result.journalLastRecordSha256 && previous === expected.journalHeadSha256);
    const scope: HostedCommunityScope = { ...tuple, synthetic: true, group: null, postIds: [], announcement: null }, retainedOriginals: HostedCommunityRetainedOriginal[] = [];
    let acknowledgedScope = structuredClone(scope);
    const companionPaths = new Set<string>(), httpByIntent = new Map<string, z.infer<typeof httpSchema>>();
    for (const [index, state] of states.entries()) {
      const number = String(state.original.intentSequence).padStart(6, '0'), intentName = number + '.intent.json', intentPath = uiRoot + intentName;
      const original = parsed(files, intentPath, intentSchema); used.add(intentPath); companionPaths.add(intentName);
      const entries = manifest.companions.filter(row => row.path === intentName); fact(entries.length === 1 && entries[0].sha256 === hash(files.get(intentPath)!) && same(original.original, state.original));
      const parsedCommand = requireOriginalCompanion(original,state,index,scope);
      // Validate the unconfirmed last original's finite next action without
      // manufacturing the HTTP identity required by the native validator.
      const httpName = number + '.http.json', httpPath = uiRoot + httpName, exists = files.has(httpPath); let http: HostedCommunityNativeOriginal['http'] | null = null;
      if (exists) {
        const receipt = parsed(files, httpPath, httpSchema), companion = manifest.companions.filter(row => row.path === httpName), stored = manifest.commands.filter(row => row.original.intentRecordSha256 === state.original.intentRecordSha256);
        used.add(httpPath); companionPaths.add(httpName);
        const observedOnly = expected.mode === 'ORIGINAL_RECONCILIATION' && stored.length === 0 && state.httpReceiptSha256 === null && ['UNCERTAIN', 'FORWARDING_AUTHORIZED'].includes(state.state);
        fact(companion.length === 1 && companion[0].sha256 === hash(files.get(httpPath)!) && same(receipt.original, state.original) && receipt.originalCompanionSha256 === entries[0].sha256 && same(metadata(receipt), metadata(original)));
        if (!observedOnly) { fact(stored.length === 1); const { companionSha256, ...storedReceipt } = stored[0]; fact(companionSha256 === companion[0].sha256 && same(storedReceipt, receipt) && receipt.receiptSha256 === state.httpReceiptSha256 && ['HTTP_CONFIRMED', 'UNCERTAIN'].includes(state.state)); }
        http = { status: 200, requestId: receipt.requestId, receiptSha256: receipt.receiptSha256, receiptIdentity: receipt.receiptIdentity }; httpByIntent.set(state.original.intentRecordSha256, receipt);
        if (parsedCommand.operation === 'room.create') scope.group = { id: receipt.receiptIdentity.receiptId, revision: 1 };
        else if (parsedCommand.operation === 'post.create') scope.postIds.push(receipt.receiptIdentity.receiptId);
        else if (parsedCommand.operation === 'announcement.create') scope.announcement = { id: receipt.receiptIdentity.receiptId, revision: 1 };
        else if (parsedCommand.operation === 'group.lifecycle') scope.group!.revision = receipt.receiptIdentity.revision!;
        else if (parsedCommand.operation === 'announcement.withdraw') scope.announcement!.revision = receipt.receiptIdentity.revision!;
        if (!observedOnly) acknowledgedScope = structuredClone(scope);
      } else fact(state.httpReceiptSha256 === null && state.state !== 'HTTP_CONFIRMED' && !manifest.commands.some(row => row.original.intentRecordSha256 === state.original.intentRecordSha256));
      retainedOriginals.push({ original: state.original, targetId: original.targetId, nativeFingerprint: original.nativeFingerprint, requestBodySha256: original.requestBodySha256, input: original.input, http, state: state.state, scopeGeneration: original.scopeGeneration });
    }
    const prefixSnapshotPath=uiRoot+'prefix-snapshot.json',prefixProofPath=uiRoot+'prefix-proof.json';let prefixClassRoomId:string|undefined,prefixDeliveryEventIds:string[]=[],nativeDeliveryObservedAt:string|null=null;
    if(expected.mode==='FULL_RECIPE')fact(manifest.livePrefixProof);
    if(manifest.livePrefixProof){
      const snapshot=parsed(files,prefixSnapshotPath,livePrefixSnapshotSchema),proof=parsed(files,prefixProofPath,livePrefixProofSchema);
      fact(hash(files.get(prefixSnapshotPath)!)===manifest.livePrefixProof.snapshotSha256&&hash(files.get(prefixProofPath)!)===manifest.livePrefixProof.proofSha256);
      const{version:_version,purpose:_purpose,nativeExecutionVerified:_native,hostedAcceptance:_hosted,customerReady:_customer,...prefixInput}=snapshot;void _version;void _purpose;void _native;void _hosted;void _customer;
      const originalFiles=new Map(snapshot.companions.map(row=>[row.path,files.get(uiRoot+row.path)!])),prepared=prepareHostedCommunityLivePrefix(prefixInput,originalFiles);
      const prefixRecords=manifest.journal.records.slice(0,snapshot.journal.records.length);
      fact(same(snapshot,prepared.snapshot)&&same(snapshot.identity,identity)&&same(snapshot.journal.records,prefixRecords)&&same(snapshot.commands,manifest.commands.slice(0,15))
        &&same(snapshot.journal.commands,states.slice(0,15))&&same(proof.identity,identity)&&proof.prefixSnapshotSha256===prepared.selection.identity.prefixSnapshotSha256
        &&proof.journalHeadSha256===snapshot.journal.lastRecordSha256&&proof.companionInventorySha256===prepared.selection.identity.companionInventorySha256
        &&Date.parse(proof.observedAt)>=Date.parse(web.observedAt)&&Date.parse(proof.observedAt)<=Date.parse(result.observedAt));
      fact(proof.classRoomId!==scope.group?.id&&proof.classRoomId!==scope.classId);prefixClassRoomId=proof.classRoomId;prefixDeliveryEventIds=proof.deliveryEventIds;nativeDeliveryObservedAt=proof.observedAt;
      for(const eventId of prefixDeliveryEventIds){
        const delivered=manifest.invalidations.filter(row=>row.eventId===eventId);fact(delivered.length===1&&delivered[0].joinProof.joinRef===delivered[0].joinProof.replyRef);
        const reads=(manifest.deliveryRereads??[]).filter(row=>row.eventId===eventId);fact(reads.length>0&&reads.some(row=>row.path==='/v1/community/rooms/'+scope.group?.id+'/posts?limit=100'&&row.sourceIds?.some(id=>scope.postIds.includes(id))));
        for(const read of reads)fact(read.actorId===delivered[0].actorId&&read.generation===delivered[0].generation&&read.roomId===scope.group?.id&&read.schoolId===identity.schoolId&&Date.parse(read.observedAt)>=Date.parse(delivered[0].observedAt)&&Date.parse(read.observedAt)<=Date.parse(proof.observedAt));
      }
      used.add(prefixSnapshotPath);used.add(prefixProofPath);
    }else fact(!files.has(prefixSnapshotPath)&&!files.has(prefixProofPath));
    fact(new Set(manifest.companions.map(row => row.path)).size === manifest.companions.length && same([...companionPaths].sort(), manifest.companions.map(row => row.path).sort()) && same([...used].sort(), [...files.keys()].sort()));
    fact(same(acknowledgedScope, manifest.scope));
    const selectedIdentity = { ...identity, uiArtifactSha256: expected.archiveSha256, journalSha256: expected.journalHeadSha256, companionManifestSha256: expected.commandManifestSha256 };
    let selection: HostedCommunityNativeSelection | null = null;
    if (retainedOriginals.every(row => row.http !== null)) selection = selectHostedCommunityNativeSelection({ identity: selectedIdentity, scope, mode: expected.mode, originals: retainedOriginals.map(({ state: _state, scopeGeneration: _generation, ...row }) => { void _state; void _generation; return row; }) });
    else if (retainedOriginals.length > 1) {
      const preceding = retainedOriginals.slice(0, -1); fact(preceding.every(row => row.http !== null));
      selectHostedCommunityNativeSelection({ identity: selectedIdentity, scope, mode: 'ORIGINAL_RECONCILIATION', originals: preceding.map(({ state: _state, scopeGeneration: _generation, ...row }) => { void _state; void _generation; return row; }) });
    }
    const observation = manifest.observation;
    if (observation) {
      fact(observation.writes.length === manifest.commands.length);
      for (const [index, write] of observation.writes.entries()) {
        const original = retainedOriginals[index], receipt = httpByIntent.get(original.original.intentRecordSha256); fact(receipt);
        fact(write.path === original.original.command.path && write.actorId === original.original.command.actorId && write.scopeGeneration === receipt.scopeGeneration
          && write.id === receipt.receiptIdentity.receiptId && write.key === original.original.command.key && write.keySha256 === hash(write.key)
          && write.requestSha256 === original.requestBodySha256 && write.bodySha256 === hash(JSON.stringify(JSON.parse(receipt.requestBody))) && write.receiptSha256 === receipt.observedReceiptSha256);
      }
      fact(observation.groupId === scope.group?.id && observation.announcementId === scope.announcement?.id
        && same(observation.postIds, scope.postIds.slice(0, 2)) && observation.replyId === scope.postIds[2]
        && observation.reportId === retainedOriginals[8]?.http?.receiptIdentity.receiptId
        && same(observation.membershipChangeIds, [1, 2, 15].filter(index => retainedOriginals[index]?.http).map(index => retainedOriginals[index].http!.receiptIdentity.receiptId)));
    }
    const invalidationIds = new Set<string>();
    const issuedSessions = new Map<number, string>([[1, tuple.teacherActorId], [3, tuple.studentActorId], [5, tuple.teacherActorId], [7, tuple.studentActorId], [9, tuple.teacherActorId], [11, tuple.parentActorId], [13, tuple.teacherActorId]]);
    for (const row of manifest.invalidations) { fact(scope.group && row.roomId === scope.group.id && row.schoolId === tuple.schoolId && issuedSessions.get(row.generation) === row.actorId && row.generation <= (retainedOriginals.at(-1)?.scopeGeneration ?? 0) && !invalidationIds.has(row.eventId) && Date.parse(row.observedAt) >= Date.parse(web.observedAt) && Date.parse(row.observedAt) <= Date.parse(result.observedAt)); invalidationIds.add(row.eventId); }
    if (expected.mode === 'FULL_RECIPE') {
      fact(result.failure===null);
      fact(scope.group&&scope.announcement);
      validateHostedCommunityViewCompletion(result.viewObservations,{identity,groupId:scope.group.id,postIds:scope.postIds.slice(0,2),announcementId:scope.announcement.id,
        journalHeads:hostedCommunityViewStages.map(row=>{const boundary=states[row.confirmedCommandCount-1];fact(boundary?.state==='HTTP_CONFIRMED');const record=manifest.journal.records.find(record=>record.state==='HTTP_CONFIRMED'&&record.intentRecordSha256===boundary.original.intentRecordSha256);fact(record);return{confirmedCommandCount:row.confirmedCommandCount,journalHeadSha256:record.recordSha256};}),observedAfter:web.observedAt,observedBefore:result.observedAt});
      fact(result.auxiliary&&manifest.auxiliary&&scope.group&&result.privateReconnectVerified);
      fact(prefixClassRoomId);
      validateHostedCommunityAuxiliaryCompletion(result.auxiliary,{groupId:scope.group.id,classRoomId:prefixClassRoomId,observedAfter:web.observedAt,observedBefore:result.observedAt});
      fact(selection && retainedOriginals.length === 18 && states.every(row => row.state === 'HTTP_CONFIRMED') && result.status === 'UI_RECIPE_VERIFIED_NATIVE_PENDING'
      && result.sessionsClosed && !result.unexpectedRequests && !result.consoleErrors && !result.consoleWarnings && !result.pageErrors && observation
      && observation.sessionStartedCount === 7 && observation.sessionEndedCount === observation.sessionStartedCount && observation.cleanupCount === 1
      && observation.retirement.status === 'CONFIRMED_UI_ONLY' && observation.retirement.groupClosed && observation.retirement.announcementWithdrawn && observation.retirement.mainMemberRevoked);
    }
    const sourceIds = [...new Set(retainedOriginals.flatMap(row => [...row.original.command.sourceIds, ...(row.http ? [row.http.receiptIdentity.receiptId, row.http.receiptIdentity.sourceId, ...(row.http.receiptIdentity.changeId ? [row.http.receiptIdentity.changeId] : [])] : [])]))].sort(); fact(sourceIds.length > 0 && sourceIds.length <= 32);
    return { selection, retainedOriginals, backendIdentity: backend, webAdmission: web, uiResult: result, sourceIds, scopeSha256: hash(canonicalReleaseExecutionJson({ projectRef: identity.projectRef, ...scope, sourceIds })), expiresAt: new Date(expires).toISOString(), status: expected.mode === 'FULL_RECIPE' ? 'UI_RECIPE_VERIFIED_NATIVE_PENDING' : 'ORIGINALS_RETAINED_REQUIRES_REVIEW', uiArtifactSha256: expected.archiveSha256, commandManifestSha256: expected.commandManifestSha256, journalHeadSha256: expected.journalHeadSha256,nativeClassRoomId:prefixClassRoomId??null,nativeDeliveryEventIds:prefixDeliveryEventIds,nativeDeliveryObservedAt, officialAdmissionVerified: false, nativeExecutionVerified: false, runnerLossRecoveryVerified: false, hostedAcceptance: false, customerReady: false };
  } catch { throw fail(); }
}

const inputSchema = z.object({ repoRoot: z.string().min(1).max(2048), githubToken: z.string().min(1).max(24576).regex(/^[\x21-\x7e]+$/), releaseSha: sha, uiRunId: runId, uiRunAttempt: positive, artifactId: runId, commandManifestSha256: digest, journalHeadSha256: digest, mode }).strict();
export type OfficialHostedCommunityUiArtifactInput = z.infer<typeof inputSchema>;
export type OfficialHostedCommunityUiArtifact = Omit<HostedCommunityArtifact, 'officialAdmissionVerified'> & { officialAdmissionVerified: true; ui: { runId: string; runAttempt: number; artifactId: string; archiveSha256: string; commandManifestSha256: string; journalHeadSha256: string }; sourceSha: string; treeSha: string; provenance: 'OFFICIAL_UI_ARTIFACT_ADMISSION' };
declare const officialCommunityGuardBrand: unique symbol;
export type OfficialHostedCommunityUiArtifactGuard = { admitted: OfficialHostedCommunityUiArtifact; assertOriginalValidity(): void; refreshOriginalMetadata(): Promise<void>; dispose(): void; readonly [officialCommunityGuardBrand]: true };
const guards = new WeakMap<object, { binding: string; assert(): void; invalidate(): void }>();
export function consumeOfficialHostedCommunityUiArtifactGuard(value: unknown, selection: unknown): OfficialHostedCommunityUiArtifactGuard {
  if (!value || typeof value !== 'object' || types.isProxy(value)) throw fail(); const registered = guards.get(value); if (!registered) throw fail();
  try { const input = inputSchema.omit({ githubToken: true }).strict().parse(JSON.parse(canonicalReleaseExecutionJson(selection))); fact(canonicalReleaseExecutionJson(input) === registered.binding); registered.assert(); return value as OfficialHostedCommunityUiArtifactGuard; } catch { registered.invalidate(); throw fail(); }
}

/** Fixed official GET ports and closed source-owned workflow context. The
 * retained archive is acquired once; metadata/source controls refresh per use. */
export async function readOfficialHostedCommunityUiArtifactAndGuard(value: unknown): Promise<OfficialHostedCommunityUiArtifactGuard> {
  try {
    const input = inputSchema.parse(JSON.parse(canonicalReleaseExecutionJson(value))), repo = repository.parse(process.env.GITHUB_REPOSITORY), root = input.repoRoot;
    const envNames = ['GITHUB_REPOSITORY', 'GITHUB_ACTIONS', 'RUNNER_ENVIRONMENT', 'GITHUB_WORKSPACE', 'GITHUB_SHA', 'GITHUB_REF', 'GITHUB_EVENT_NAME', 'GITHUB_JOB', 'GITHUB_WORKFLOW_REF', 'GITHUB_SERVER_URL', 'GITHUB_API_URL', 'RELEASE_ENVIRONMENT', 'NODE_OPTIONS'];
    const envSnapshot = JSON.stringify(envNames.map(name => process.env[name] ?? null));
    const currentRunner = async () => { fact(process.platform === 'linux' && isAbsolute(root) && resolve(root) === root && await realpath(root) === root && root.startsWith('/home/runner/work/') && process.env.GITHUB_REPOSITORY === repo && process.env.GITHUB_ACTIONS === 'true' && process.env.RUNNER_ENVIRONMENT === 'github-hosted' && process.env.GITHUB_WORKSPACE === root && process.env.GITHUB_SHA === input.releaseSha && process.env.GITHUB_REF === 'refs/heads/main' && process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' && ['prepare-qa', 'native-qa'].includes(process.env.GITHUB_JOB ?? '') && process.env.GITHUB_WORKFLOW_REF === repo + '/.github/workflows/hosted-community-qa.yml@refs/heads/main' && process.env.GITHUB_SERVER_URL === 'https://github.com' && process.env.GITHUB_API_URL === 'https://api.github.com' && process.env.RELEASE_ENVIRONMENT === 'staging' && !process.env.NODE_OPTIONS && JSON.stringify(envNames.map(name => process.env[name] ?? null)) === envSnapshot); };
    await currentRunner();
    const source = captureCanonicalSourceContext(root, input.releaseSha, undefined, 'CURRENT_SOURCE'), yaml = createRequire(import.meta.url)('js-yaml') as { load(value: string): unknown };
    const sourceWorkflows = () => {
      const releaseText = source.git(['show', input.releaseSha + ':.github/workflows/release.yml']).toString('utf8'), ciText = source.git(['show', input.releaseSha + ':.github/workflows/ci.yml']).toString('utf8');
      fact(validateWorkflows(ciText, releaseText).length === 0);
      const parsedWorkflow = z.object({ jobs: z.object({ 'web-release': z.object({ steps: z.array(z.record(z.string(), z.unknown())) }) }) }).parse(yaml.load(releaseText));
      const steps = parsedWorkflow.jobs['web-release'].steps, selected = steps.filter(row => ['Verify the hosted synthetic Community UI', 'Preserve the scoped original Community evidence'].includes(String(row.name)));
      const learning = steps.filter(row => row.run === 'node --import tsx scripts/verification/cicd-release.ts verify-learning-loop'); fact(learning.length === 1);
      const condition="needs.release-admission.outputs.backend-selection-base64 != '' && needs.release-admission.outputs.environment == 'staging' && inputs.backend_handoff == 'customer-candidate'";
      const verify = { ...learning[0], name: 'Verify the hosted synthetic Community UI',if:condition,env:{...z.record(z.string(),z.string()).parse(learning[0].env),SUPABASE_ACCESS_TOKEN:'${{ secrets.SUPABASE_ACCESS_TOKEN }}',CUEVO_MIGRATION_DATABASE_PASSWORD:'${{ secrets.CUEVO_MIGRATION_DATABASE_PASSWORD }}',CUEVO_DATABASE_TLS_CA:'${{ secrets.CUEVO_DATABASE_TLS_CA }}'}, run: 'node --import tsx scripts/verification/cicd-release.ts verify-community' };
      const retain = { name: 'Preserve the scoped original Community evidence', if: 'always() && '+condition, uses: 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a', with: { name: 'cuevo-community-ui-${{ github.run_id }}-${{ github.run_attempt }}', path: '.local/cicd-release/hosted-community/\n.local/cicd-release/hosted-community-ui/\n', 'include-hidden-files': true, 'if-no-files-found': 'error', 'retention-days': 14 } };
      fact(selected.length === 2 && same(selected[0], verify)
        && same(selected[1], retain) && steps.indexOf(selected[1]) > steps.indexOf(selected[0]));
      return steps;
    };
    const authoredSteps = sourceWorkflows(), controller = new AbortController(), timer = setTimeout(() => controller.abort(), 60000); let acquiring = true;
    const get = async (path: string) => {
      fact(/^(?:actions\/runs\/[1-9][0-9]*(?:\/attempts\/[1-9][0-9]*\/jobs\?per_page=100&page=1)?|actions\/artifacts\/[1-9][0-9]*|git\/commits\/[a-f0-9]{40})$/.test(path));
      const signal = AbortSignal.any([...(acquiring ? [controller.signal] : []), AbortSignal.timeout(15000)]), url = 'https://api.github.com/repos/' + repo + '/' + path;
      const response = await fetch(url, { method: 'GET', headers: { Authorization: 'Bearer ' + input.githubToken, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, redirect: 'error', cache: 'no-store', credentials: 'omit', signal });
      fact(response.status === 200 && !response.redirected && (!response.url || response.url === url)); return JSON.parse(await readBoundedRuntimeResponse(response, signal, 512 * 1024)) as unknown;
    };
    try {
      const runPath = 'actions/runs/' + input.uiRunId, artifactPath = 'actions/artifacts/' + input.artifactId, jobsPath = runPath + '/attempts/' + input.uiRunAttempt + '/jobs?per_page=100&page=1', commitPath = 'git/commits/' + input.releaseSha;
      const runSchema = z.object({ id: positive, run_attempt: positive, repository: z.object({ full_name: repository }), head_sha: sha, head_branch: z.literal('main'), path: z.literal('.github/workflows/release.yml'), event: z.literal('workflow_dispatch'), status: z.literal('completed'), conclusion: z.enum(['success', 'failure', 'cancelled']), created_at: date, updated_at: date });
      const rawRun = await get(runPath), run = runSchema.parse(rawRun); fact(run.id === Number(input.uiRunId) && run.run_attempt === input.uiRunAttempt && run.repository.full_name === repo && run.head_sha === input.releaseSha && (input.mode !== 'FULL_RECIPE' || run.conclusion === 'success'));
      const rawCommit = await get(commitPath), commit = z.object({ sha, tree: z.object({ sha }) }).parse(rawCommit); fact(commit.sha === input.releaseSha && commit.tree.sha === source.treeSha);
      const jobSchema = z.object({ id: positive, name: z.string(), run_id: positive, run_attempt: positive, head_sha: sha, status: z.literal('completed'), conclusion: z.enum(['success', 'failure', 'cancelled']), started_at: date, completed_at: date, steps: z.array(z.object({ name: z.string(), number: positive, status: z.literal('completed'), conclusion: z.enum(['success', 'failure', 'skipped', 'cancelled']), started_at: date.nullable().optional(), completed_at: date.nullable().optional() })) });
      const rawJobs = await get(jobsPath), jobs = z.object({ total_count: positive.max(100), jobs: z.array(jobSchema).max(100) }).parse(rawJobs); fact(jobs.total_count === jobs.jobs.length && new Set(jobs.jobs.map(row => row.id)).size === jobs.jobs.length);
      const producerJobs = jobs.jobs.filter(row => row.name === 'web-release'); fact(producerJobs.length === 1); const producerJob = producerJobs[0];
      fact(producerJob.run_id === run.id && producerJob.run_attempt === input.uiRunAttempt && producerJob.head_sha === input.releaseSha && (input.mode !== 'FULL_RECIPE' || producerJob.conclusion === 'success'));
      const names = new Set<string>(), numbers = new Set<number>(); let lastNumber = 0;
      for (const step of producerJob.steps) { fact(!names.has(step.name) && !numbers.has(step.number) && step.number > lastNumber); names.add(step.name); numbers.add(step.number); lastNumber = step.number; }
      const authoredNames = authoredSteps.map(row => row.name ? String(row.name) : row.uses ? 'Run ' + String(row.uses) : 'Run ' + String(row.run).split('\n')[0]), observedNames = producerJob.steps.filter(row => authoredNames.includes(row.name)).map(row => row.name); fact(same(authoredNames, observedNames));
      for (const step of producerJob.steps) fact(authoredNames.includes(step.name) || ['Set up job', 'Complete job'].includes(step.name) || authoredNames.some(name => name.startsWith('Run actions/') && step.name === 'Post ' + name));
      const verifyStep = producerJob.steps.find(row => row.name === 'Verify the hosted synthetic Community UI'), retainStep = producerJob.steps.find(row => row.name === 'Preserve the scoped original Community evidence');
      fact(verifyStep && retainStep && retainStep.conclusion === 'success' && retainStep.started_at && retainStep.completed_at && verifyStep.started_at && verifyStep.completed_at
        && (input.mode !== 'FULL_RECIPE' || verifyStep.conclusion === 'success') && !['skipped', 'cancelled'].includes(verifyStep.conclusion));
      const rawArtifact = await get(artifactPath), artifact = z.object({ id: positive, name: z.literal('cuevo-community-ui-' + input.uiRunId + '-' + input.uiRunAttempt), size_in_bytes: positive.max(2 * 1024 * 1024), expired: z.literal(false), digest: z.string().regex(/^sha256:[a-f0-9]{64}$/), created_at: date, expires_at: date, workflow_run: z.object({ id: positive, head_branch: z.literal('main'), head_sha: sha }) }).parse(rawArtifact);
      fact(artifact.id === Number(input.artifactId) && artifact.workflow_run.id === run.id && artifact.workflow_run.head_sha === input.releaseSha
        && Date.parse(run.created_at) <= Date.parse(producerJob.started_at) && Date.parse(producerJob.completed_at) <= Date.parse(run.updated_at)
        && Date.parse(retainStep.started_at) <= Date.parse(artifact.created_at) && Date.parse(artifact.created_at) <= Date.parse(retainStep.completed_at)
        && Date.parse(artifact.expires_at) > Date.now() && Date.parse(run.updated_at) <= Date.now());
      const producer = await readHostedBrowserSource(root, 'scripts/verification/backend-hosted-community.ts'), archiveReader = createGithubCodeqlArtifactReader(repo, input.githubToken, controller.signal), bytes = await archiveReader(Number(input.artifactId));
      fact(bytes.byteLength === artifact.size_in_bytes && hash(bytes) === artifact.digest.slice(7));
      const adapted = await adaptHostedCommunityArtifactArchive(bytes, { sourceSha: input.releaseSha, uiRunId: input.uiRunId, uiRunAttempt: input.uiRunAttempt, archiveSha256: artifact.digest.slice(7), commandManifestSha256: input.commandManifestSha256, journalHeadSha256: input.journalHeadSha256, producerSha256: hash(producer), mode: input.mode, now: Date.now() });
      fact(adapted.backendIdentity.repository === repo && adapted.uiResult.identity.treeSha === source.treeSha && Date.parse(adapted.uiResult.observedAt) >= Date.parse(verifyStep.started_at) && Date.parse(adapted.uiResult.observedAt) <= Date.parse(verifyStep.completed_at));
      const admitted: OfficialHostedCommunityUiArtifact = JSON.parse(canonicalReleaseExecutionJson({ ...adapted, officialAdmissionVerified: true, ui: { runId: input.uiRunId, runAttempt: input.uiRunAttempt, artifactId: input.artifactId, archiveSha256: artifact.digest.slice(7), commandManifestSha256: input.commandManifestSha256, journalHeadSha256: input.journalHeadSha256 }, sourceSha: input.releaseSha, treeSha: source.treeSha, provenance: 'OFFICIAL_UI_ARTIFACT_ADMISSION' }));
      const originalEvidence = canonicalReleaseExecutionJson(admitted), snapshots = [rawRun, rawJobs, rawArtifact, rawCommit].map(canonicalReleaseExecutionJson), expires = Math.min(Date.parse(adapted.expiresAt), Date.parse(artifact.expires_at)); let invalid = false, disposed = false, refreshing = false;
      const assertOriginalValidity = () => { try { fact(!invalid && !disposed && Date.now() < expires && JSON.stringify(envNames.map(name => process.env[name] ?? null)) === envSnapshot && canonicalReleaseExecutionJson(admitted) === originalEvidence); } catch { invalid = true; throw fail(); } };
      const refreshOriginalMetadata = async () => {
        if (invalid || disposed || refreshing) { invalid = true; throw fail(); } refreshing = true;
        try { assertOriginalValidity(); await currentRunner(); source.finalMetadata(); sourceWorkflows();
          const observed = await Promise.allSettled([get(runPath), get(jobsPath), get(artifactPath), get(commitPath), readHostedBrowserSource(root, 'scripts/verification/backend-hosted-community.ts')]);
          for (let index = 0; index < 4; index++) { const row = observed[index]; fact(row.status === 'fulfilled' && canonicalReleaseExecutionJson(row.value) === snapshots[index]); }
          const readProducer = observed[4]; fact(readProducer.status === 'fulfilled' && Buffer.isBuffer(readProducer.value) && readProducer.value.equals(producer));
          fact((await readHostedBrowserSource(root, 'scripts/verification/backend-hosted-community.ts')).equals(producer)); source.finalMetadata(); await currentRunner(); assertOriginalValidity();
        } catch { invalid = true; throw fail(); } finally { refreshing = false; }
      };
      await refreshOriginalMetadata(); fact(!controller.signal.aborted); const { githubToken: _token, ...binding } = input; void _token;
      const guard = Object.freeze({ admitted, assertOriginalValidity, refreshOriginalMetadata, dispose: () => { disposed = true; invalid = true; } }) as OfficialHostedCommunityUiArtifactGuard;
      guards.set(guard, { binding: canonicalReleaseExecutionJson(binding), assert: () => { if (refreshing) { invalid = true; throw fail(); } assertOriginalValidity(); }, invalidate: () => { invalid = true; } }); return guard;
    } finally { acquiring = false; clearTimeout(timer); controller.abort(); }
  } catch { throw fail(); }
}
export async function readOfficialHostedCommunityUiArtifact(value: unknown): Promise<OfficialHostedCommunityUiArtifact> { const guard = await readOfficialHostedCommunityUiArtifactAndGuard(value); try { return guard.admitted; } finally { guard.dispose(); } }
