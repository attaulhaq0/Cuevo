import {createHash} from 'node:crypto';
import {z} from 'zod';
import {canonicalReleaseExecutionJson} from '../verification/release-review';

const digest=z.string().regex(/^[a-f0-9]{64}$/),version=z.string().regex(/^[0-9]{14}$/),sha=z.string().regex(/^[a-f0-9]{40}$/),time=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),positive=z.number().int().positive().max(1000);
const identity=z.object({projectRef:z.string().regex(/^[a-z]{20}$/),sourceSha:sha,treeSha:sha,planSha256:digest,stageId:z.enum(['prefix','native','pre-observability','remaining']),stageSha256:digest,databaseUrl:z.string().max(400),approvalDigest:digest,ciRunId:z.string().regex(/^[1-9][0-9]{0,19}$/).refine(value=>Number.isSafeInteger(Number(value))),certificateSha256:digest}).strict();
const row=z.object({name:z.string().regex(/^[0-9]{14}_[a-z0-9_]+[.]sql$/),version,sha256:digest}).strict(),historyRow=z.object({version,sourceReceiptSha256:digest}).strict();
const batch=z.object({index:positive,pending:z.array(row).min(1).max(20),cumulativeIncluded:z.array(row).min(1).max(1000),expectedBeforeVersions:z.array(version).max(1000),expectedAfterVersions:z.array(version).min(1).max(1000),sha256:digest}).strict();
const observation=z.object({observedAtMs:time,history:z.array(historyRow).max(1000)}).strict();
const bodySchema=z.object({version:z.literal(1),purpose:z.literal('CUEVO_HOSTED_MIGRATION_BATCH_PREFIX'),evidence:z.literal('SUPPLIED_BATCH_PREFIX_METADATA_ONLY'),stageIdentity:identity,index:positive,batchSha256:digest,previousReceiptSha256:digest.nullable(),beforeHistorySha256:digest,afterHistorySha256:digest,observedAtMs:time,completedAtMs:time,stageCommitment:z.literal('NOT_CONFIRMED'),schemaHistoryAtomic:z.literal(false)}).strict();
const receiptSchema=bodySchema.extend({receiptSha256:digest}).strict(),expectedSchema=z.object({stageIdentity:identity,batch,before:observation,after:observation,priorReceipt:receiptSchema.nullable(),now:time}).strict();
export type HostedMigrationBatchPrefixReceipt=z.infer<typeof receiptSchema>;
export type HostedMigrationBatchReceiptExpected=z.infer<typeof expectedSchema>;
const fail=()=>Error('Intermediate migration batch prefix requires review; contents withheld.'),hash=(value:string)=>createHash('sha256').update(value).digest('hex'),same=(a:unknown,b:unknown)=>canonicalReleaseExecutionJson(a)===canonicalReleaseExecutionJson(b);
function parsed<T>(schema:z.ZodType<T>,value:unknown):T{return schema.parse(JSON.parse(canonicalReleaseExecutionJson(value)));}
function receiptHash(receipt:z.infer<typeof receiptSchema>){const{receiptSha256,...body}=receipt;return receiptSha256===hash(canonicalReleaseExecutionJson(body));}
function verify(expected:HostedMigrationBatchReceiptExpected,body:z.infer<typeof bodySchema>){
 const selected=expected.batch,current=expected.stageIdentity,url=new URL(current.databaseUrl),direct=url.hostname==='db.'+current.projectRef+'.supabase.co'&&url.username==='postgres',pooler=/^aws-[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*[.]pooler[.]supabase[.]com$/.test(url.hostname)&&url.username==='postgres.'+current.projectRef;
 if(url.protocol!=='postgresql:'||url.password||url.port!=='5432'||url.pathname!=='/postgres'||url.search!=='?sslmode=verify-full'||url.hash||url.toString()!==current.databaseUrl||!(direct||pooler))throw fail();
 const{sha256,...batchBody}=selected;if(hash(JSON.stringify({stageId:current.stageId,stageSha256:current.stageSha256,...batchBody}))!==sha256)throw fail();
 const rows=selected.cumulativeIncluded,beforeCount=selected.expectedBeforeVersions.length,ordered=rows.map(row=>row.version),sorted=[...ordered].sort();
 if(new Set(ordered).size!==rows.length||rows.some(row=>row.name.slice(0,14)!==row.version)||!same(selected.expectedAfterVersions,sorted)||!same(selected.expectedBeforeVersions,rows.slice(0,beforeCount).map(row=>row.version).sort())||!same(selected.pending,rows.slice(beforeCount))||rows.length-beforeCount!==selected.pending.length)throw fail();
 const before=rows.slice(0,beforeCount).map(row=>({version:row.version,sourceReceiptSha256:row.sha256})),after=rows.map(row=>({version:row.version,sourceReceiptSha256:row.sha256}));
 if(!same(expected.before.history,before)||!same(expected.after.history,after)||!same(body.stageIdentity,current)||body.index!==selected.index||body.batchSha256!==sha256||body.beforeHistorySha256!==hash(canonicalReleaseExecutionJson(before))||body.afterHistorySha256!==hash(canonicalReleaseExecutionJson(after))||body.observedAtMs!==expected.before.observedAtMs||body.completedAtMs!==expected.after.observedAtMs||body.observedAtMs>body.completedAtMs||body.completedAtMs>expected.now||expected.now-body.completedAtMs>30000||body.completedAtMs-body.observedAtMs>330000)throw fail();
 const prior=expected.priorReceipt;if(selected.index===1){if(prior!==null||body.previousReceiptSha256!==null)throw fail();}else if(!prior||!receiptHash(prior)||prior.index!==selected.index-1||!same(prior.stageIdentity,current)||prior.afterHistorySha256!==body.beforeHistorySha256||prior.completedAtMs>body.observedAtMs||prior.observedAtMs>prior.completedAtMs||body.previousReceiptSha256!==prior.receiptSha256)throw fail();
}
/** Caller-supplied prefix metadata only. Native source/history/CLI/lease owners must establish and persist the observations separately. */
export function prepareHostedMigrationBatchReceipt(value:unknown,expectedValue:unknown):HostedMigrationBatchPrefixReceipt{
 try{const expected=parsed(expectedSchema,expectedValue),body=parsed(bodySchema,value);verify(expected,body);return{...body,receiptSha256:hash(canonicalReleaseExecutionJson(body))};}catch{throw fail();}
}
/** Exact recorded metadata; reading it never renews native observation clocks or grants resume authority. */
export function readHostedMigrationBatchReceipt(value:unknown,expectedValue:unknown):HostedMigrationBatchPrefixReceipt{
 try{const receipt=parsed(receiptSchema,value),{receiptSha256,...body}=receipt,prepared=prepareHostedMigrationBatchReceipt(body,expectedValue);if(!receiptHash(receipt)||receiptSha256!==prepared.receiptSha256||!same(receipt,prepared))throw fail();return receipt;}catch{throw fail();}
}
