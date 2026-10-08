import {createHash} from 'node:crypto';
import {z} from 'zod';
import {canonicalReleaseExecutionJson} from '../verification/release-review';
import {parseReconciliationTemplate,reconciliationTemplateFingerprint} from './hosted-schema-reconciliation';
import {unknownPrefixCataloguePolicySha256} from './hosted-schema-reconciliation-policy';
import policy from './unknown-prefix-catalogue-policy.json';

const digest=z.string().regex(/^[a-f0-9]{64}$/),sha=z.string().regex(/^[a-f0-9]{40}$/),identifier=z.string().regex(/^[1-9][0-9]{0,19}$/).refine(value=>Number.isSafeInteger(Number(value))),positive=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const row=z.object({name:z.string().regex(/^[0-9]{14}_[a-z0-9_]+[.]sql$/),version:z.string().regex(/^[0-9]{14}$/),sha256:digest}).strict();
const identity=z.object({projectRef:z.string().regex(/^[a-z]{20}$/),sourceSha:sha,treeSha:sha,planSha256:digest,stageId:z.literal('prefix'),stageSha256:digest,databaseUrl:z.string().max(400),approvalDigest:digest,ciRunId:identifier,certificateSha256:digest}).strict();
const repository=z.literal('attaulhaq0/Cuevo');
const bodySchema=z.object({version:z.literal(1),purpose:z.literal('CUEVO_HOSTED_SCHEMA_RECOVERY_COMPLETION'),status:z.literal('PREFIX123_CONFIRMED'),repository,sourceSha:sha,treeSha:sha,projectRef:identity.shape.projectRef,ciRunId:identifier,recoveryRunId:identifier,runAttempt:positive,packageSha256:digest,originalOperationSha256:digest,originalChainSha256:digest,partialReceiptSha256:digest,recoveryIdentity:identity,migrationCount:z.literal(123),migrations:z.array(row).length(123),migrationManifestSha256:digest,historySha256:digest,cataloguePolicySha256:digest,catalogueSha256:digest,completedAt:z.iso.datetime({offset:true}),cleanup:z.object({kind:z.literal('RELEASED')}).strict()}).strict();
const receiptSchema=bodySchema.extend({receiptSha256:digest}).strict();
const expectedSchema=z.object({repository,template:z.unknown(),partialReceiptSha256:digest,recoveryIdentity:identity,packageSha256:digest,now:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)}).strict();
export type HostedSchemaRecoveryCompletion=z.infer<typeof receiptSchema>;
export type HostedSchemaRecoveryCompletionBody=z.infer<typeof bodySchema>;
export type HostedSchemaRecoveryCompletionExpected=z.infer<typeof expectedSchema>;
const fail=()=>Error('Original schema recovery completion requires review; contents withheld.'),hash=(value:string)=>createHash('sha256').update(value).digest('hex'),same=(a:unknown,b:unknown)=>canonicalReleaseExecutionJson(a)===canonicalReleaseExecutionJson(b);
function parse<T>(schema:z.ZodType<T>,value:unknown):T{return schema.parse(JSON.parse(canonicalReleaseExecutionJson(value)));}
function validate(body:HostedSchemaRecoveryCompletionBody,expected:HostedSchemaRecoveryCompletionExpected){
 const template=parseReconciliationTemplate(expected.template),fingerprint=reconciliationTemplateFingerprint(template),source=template.recoverySource,original=template.originalIdentity,current=body.recoveryIdentity;
 if(body.repository!==expected.repository||!same(current,expected.recoveryIdentity)||body.partialReceiptSha256!==expected.partialReceiptSha256||body.packageSha256!==expected.packageSha256||body.sourceSha!==source.sourceSha||body.treeSha!==source.treeSha||body.ciRunId!==source.ciRunId||body.recoveryRunId!==source.releaseRunId||body.runAttempt!==source.runAttempt||body.projectRef!==original.projectRef||body.originalOperationSha256!==fingerprint.originalOperationSha256||body.originalChainSha256!==fingerprint.originalChainSha256||!same(body.migrations,template.stageRows))throw fail();
 if(current.sourceSha!==body.sourceSha||current.treeSha!==body.treeSha||current.projectRef!==body.projectRef||current.ciRunId!==body.ciRunId||current.approvalDigest!==body.packageSha256||current.stageSha256!==original.stageSha256||current.databaseUrl!==original.databaseUrl||current.certificateSha256!==original.certificateSha256||hash(canonicalReleaseExecutionJson(body.migrations))!==body.migrationManifestSha256||hash(canonicalReleaseExecutionJson(body.migrations.map(row=>({version:row.version,sourceReceiptSha256:row.sha256}))))!==body.historySha256||body.cataloguePolicySha256!==unknownPrefixCataloguePolicySha256||body.catalogueSha256!==policy.completedPrefix.expected.catalogueSha256||Date.parse(body.completedAt)>expected.now)throw fail();
}
/** Supplied metadata only. Native cleanup/history/catalogue/journal owners must establish these facts before export. */
export function prepareHostedSchemaRecoveryCompletion(value:unknown,expectedValue:unknown):HostedSchemaRecoveryCompletion{
 try{const expected=parse(expectedSchema,expectedValue),body=parse(bodySchema,value);validate(body,expected);const receipt={...body,receiptSha256:hash(canonicalReleaseExecutionJson(body))};if(Buffer.byteLength(canonicalReleaseExecutionJson(receipt))>49152)throw fail();return receipt;}catch{throw fail();}
}
/** Historical receipt validation retains its original clock and grants no current execution permission. */
export function readHostedSchemaRecoveryCompletion(value:unknown,expectedValue:unknown):HostedSchemaRecoveryCompletion{
 try{const receipt=parse(receiptSchema,value),{receiptSha256,...body}=receipt,prepared=prepareHostedSchemaRecoveryCompletion(body,expectedValue);if(!same(prepared,receipt)||receiptSha256!==prepared.receiptSha256)throw fail();return receipt;}catch{throw fail();}
}
