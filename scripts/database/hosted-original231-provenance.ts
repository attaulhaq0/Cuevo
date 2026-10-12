import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {types} from 'node:util';
import {z} from 'zod';
import {canonicalReleaseExecutionJson} from '../verification/release-review';
import {compactOriginal231RecoveryTemplateSchema,expandOriginal231RecoveryTemplate,original231RecoveryFingerprint,original231RecoverySelectionSchema,parseOriginal231RecoveryTemplate} from './hosted-original-child-recovery';
import {readHistoricalMigrationSources} from './hosted-migration-plan';
import {replayPlan} from './replay-plan';

const fail=()=>Error('Original231 signed source provenance requires review; contents withheld.'),hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const digest=z.string().regex(/^[a-f0-9]{64}$/),sha=z.string().regex(/^[a-f0-9]{40}$/),id=z.string().regex(/^[1-9][0-9]{0,19}$/),time=z.iso.datetime({offset:true}),positive=z.number().int().positive().safe();
export const ORIGINAL231_ATTESTATION_PATH='scripts/database/original231-provenance.json';
export const ORIGINAL231_ATTESTATION_SHA256='23e5ee965457597985c5df1414a2d235d2771b9f72503079f61629bb7cd1d8c4';
const templateSha256='a4f5f3b6bf1f85f9c9e2294cc548a52b5b06bebb8920d9ba21a845b797dceec6';
const schema=z.object({version:z.literal(1),purpose:z.literal('CUEVO_ORIGINAL231_SOURCE_PROVENANCE_ATTESTATION'),effectAuthority:z.literal(false),sourceSelection:original231RecoverySelectionSchema,template:compactOriginal231RecoveryTemplateSchema,capture:z.object({startedAt:time,completedAt:time,actualRequestCount:z.literal(220),metadataPathCount:z.literal(38),captureSha256:digest,independentCaptureReviewSha256:digest,independentFullValidationSha256:digest,decoderSource:z.object({sourceSha:sha,treeSha:sha,sourceFiles:z.array(z.object({path:z.string().regex(/^scripts\/[a-z0-9./-]+[.]ts$/),sha256:digest,gitBlob:sha}).strict()).length(6),clockOverridden:z.literal(false),diagnosticHooksUsed:z.literal(false)}).strict(),validation:z.object({originalRunJobsApprovalChronology:z.literal('VERIFIED'),signedHistoricalCommits:z.literal('VERIFIED'),completeHistoricalSchemaSourceDatabaseSecurityClosure:z.literal('VERIFIED'),fullTemplateReconstruction:z.literal('VERIFIED'),originalStageCommitment:z.literal('UNKNOWN'),thirdBatchReceipt:z.null()}).strict()}).strict(),archives:z.array(z.object({artifactId:id,archiveSha256:digest,bytes:positive.max(16*1024*1024),name:z.string().min(1).max(200),runId:id,sourceSha:sha,createdAt:time,retentionExpiresAt:time,transport:z.enum(['EMBEDDED','DIRECT'])}).strict()).length(18),metadata:z.array(z.object({apiPath:z.string().min(1).max(300),responseSha256:digest,bytes:positive.max(4*1024*1024),firstReadAt:time,lastReadAt:time,actualReads:positive.max(220)}).strict()).length(38)}).strict();
/** The source hash seals one independently validated historical closure. Its
 * capture clocks are historical facts, never renewed effect authority. */
export function parseOriginal231SourceAttestationBytes(value:unknown){
 try{if(!value||typeof value!=='object'||types.isProxy(value)||!(value instanceof Uint8Array)||value.byteLength>65536||hash(value)!==ORIGINAL231_ATTESTATION_SHA256)throw fail();const data=schema.parse(JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(value))),begin=Date.parse(data.capture.startedAt),end=Date.parse(data.capture.completedAt);
  if(begin>Date.parse(data.capture.completedAt)||begin<Date.parse('2026-10-11T15:49:47Z')||data.template.templateSha256!==templateSha256||canonicalReleaseExecutionJson(data.sourceSelection)!==canonicalReleaseExecutionJson(data.template.template.selection)||new Set(data.archives.map(row=>row.artifactId)).size!==18||new Set(data.metadata.map(row=>row.apiPath)).size!==38||data.metadata.reduce((total,row)=>total+row.actualReads,0)!==220||data.archives.filter(row=>row.transport==='EMBEDDED').length!==4||data.archives.some(row=>Date.parse(row.createdAt)>begin||Date.parse(row.retentionExpiresAt)<=end)||data.metadata.some(row=>Date.parse(row.firstReadAt)<begin||Date.parse(row.lastReadAt)>end||Date.parse(row.firstReadAt)>Date.parse(row.lastReadAt)))throw fail();return data;
 }catch{throw fail();}
}
function sourceBytes(){
 const root=resolve(import.meta.dirname,'../..'),path=resolve(root,ORIGINAL231_ATTESTATION_PATH),equalPath=(a:string,b:string)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;for(let parent=dirname(path);;parent=dirname(parent)){if(lstatSync(parent).isSymbolicLink())throw fail();if(dirname(parent)===parent)break;}const before=lstatSync(path);if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.size>65536||!equalPath(realpathSync(path),path))throw fail();const bytes=readFileSync(path),after=lstatSync(path);if(!after.isFile()||after.isSymbolicLink()||after.nlink!==1||before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs)throw fail();return parseOriginal231SourceAttestationBytes(bytes);
}
export const original231SourceAttestationEvidenceSchema=z.object({kind:z.literal('SOURCE_ATTESTATION'),attestationPath:z.literal(ORIGINAL231_ATTESTATION_PATH),attestationSha256:z.literal(ORIGINAL231_ATTESTATION_SHA256),selectionSha256:digest,templateSha256:z.literal(templateSha256)}).strict();
export type Original231SourceAttestationEvidence=z.infer<typeof original231SourceAttestationEvidenceSchema>;
function evidenceFor(selection:unknown){const parsed=original231RecoverySelectionSchema.parse(JSON.parse(canonicalReleaseExecutionJson(selection)));return original231SourceAttestationEvidenceSchema.parse({kind:'SOURCE_ATTESTATION',attestationPath:ORIGINAL231_ATTESTATION_PATH,attestationSha256:ORIGINAL231_ATTESTATION_SHA256,selectionSha256:hash(canonicalReleaseExecutionJson(parsed)),templateSha256});}
export function assertOriginal231SourceAttestationEvidence(value:unknown,templateValue:unknown){
 try{const evidence=original231SourceAttestationEvidenceSchema.parse(JSON.parse(canonicalReleaseExecutionJson(value))),template=parseOriginal231RecoveryTemplate(templateValue),sealed=sourceBytes();if(hash(canonicalReleaseExecutionJson(template))!==templateSha256||canonicalReleaseExecutionJson(evidence)!==canonicalReleaseExecutionJson(evidenceFor(sealed.sourceSelection))||canonicalReleaseExecutionJson(template.selection)!==canonicalReleaseExecutionJson(sealed.sourceSelection))throw fail();}catch{throw fail();}
}
/** Current source/CI/package/approval and native private checks remain outside
 * this finite historical guard. No GitHub archive lifetime is returned. */
export function readOriginal231SourceAttestationGuard(selectionValue:unknown){
 try{const selection=original231RecoverySelectionSchema.parse(JSON.parse(canonicalReleaseExecutionJson(selectionValue))),sealed=sourceBytes();if(canonicalReleaseExecutionJson(selection)!==canonicalReleaseExecutionJson(sealed.sourceSelection))throw fail();const assertOriginalValidity=()=>{sourceBytes();};return{selection,evidence:evidenceFor(selection),assertOriginalValidity,refreshOriginalMetadata:async()=>{assertOriginalValidity();},effectAuthority:false as const,provenance:'SOURCE_ATTESTATION' as const};}catch{throw fail();}
}
const retainedSchema=z.object({native180ReceiptJson:z.string().max(49152),installedMarkerJson:z.string().max(49152),batchReceiptJson:z.tuple([z.string().max(49152),z.string().max(49152)]),thirdBatchReceipt:z.null()}).strict();
export function readOriginal231SourceAttestation(selectionValue:unknown,retainedValue:unknown){
 try{const guard=readOriginal231SourceAttestationGuard(selectionValue),sealed=sourceBytes(),retained=retainedSchema.parse(JSON.parse(canonicalReleaseExecutionJson(retainedValue))),root=resolve(import.meta.dirname,'../..'),identity=sealed.template.template.originalIdentity,sources=readHistoricalMigrationSources(root,identity.sourceSha,identity.treeSha),replay=replayPlan(sources),rows=[...replay.before,replay.prerequisite,...replay.remaining].map(name=>({name,version:name.slice(0,14),sha256:hash(sources.find(row=>row.name===name)!.bytes)})),template=expandOriginal231RecoveryTemplate(sealed.template,rows,retained.native180ReceiptJson);
  if(template.installedMarkerJson!==retained.installedMarkerJson||canonicalReleaseExecutionJson(template.batchReceiptJson)!==canonicalReleaseExecutionJson(retained.batchReceiptJson)||template.thirdBatchReceipt!==null)throw fail();assertOriginal231SourceAttestationEvidence(guard.evidence,template);return{...guard,template,fingerprint:original231RecoveryFingerprint(template)};
 }catch{throw fail();}
}
