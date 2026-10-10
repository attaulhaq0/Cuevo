import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {z} from 'zod';

const digest=z.string().regex(/^[a-f0-9]{64}$/),sha=z.string().regex(/^[a-f0-9]{40}$/),ref=z.string().regex(/^[a-z]{20}$/);
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const hostedExecutionIdentitySchema=z.object({projectRef:ref,sourceSha:sha,treeSha:sha,planSha256:digest,stageId:z.enum(['prefix','native','pre-observability','remaining']),stageSha256:digest,databaseUrl:z.string().max(400),approvalDigest:digest,ciRunId:z.string().regex(/^[1-9][0-9]*$/).max(30),certificateSha256:digest}).strict();
export const originalIntentExecutionSchema=z.object({version:z.literal(1),purpose:z.literal('CUEVO_ORIGINAL_NATIVE_INTENT_EXECUTION'),originalOperationSha256:digest,originalIntentSha256:digest,templateSha256:digest,selectionSha256:digest,currentExecutionIdentity:hostedExecutionIdentitySchema,runId:z.string().regex(/^[1-9][0-9]*$/).max(30),runAttempt:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),approvalObservedAtMs:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),nativeProofBeganAtMs:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),beforeHistorySha256:digest,afterHistorySha256:digest}).strict();
const journalV1Schema=z.object({version:z.literal(1),identity:hostedExecutionIdentitySchema,state:z.enum(['INTENT','COMMITTED','REQUIRES_REVIEW']),schemaHistoryAtomic:z.literal(false),evidence:z.literal('SUPPLIED_PORT_EXECUTION_ONLY')}).strict();
export const hostedExecutionJournalSchema=z.discriminatedUnion('version',[journalV1Schema,journalV1Schema.extend({version:z.literal(2),state:z.enum(['COMMITTED','REQUIRES_REVIEW']),originalIntentExecution:originalIntentExecutionSchema}).strict()]).superRefine((value,context)=>{
 if(value.version!==2)return;const original=value.identity,current=value.originalIntentExecution.currentExecutionIdentity,link=value.originalIntentExecution;
 if(original.stageId!=='native'||current.stageId!=='native'||link.originalOperationSha256!==hash(original)||link.originalIntentSha256!==hash({version:1,identity:original,state:'INTENT',schemaHistoryAtomic:false,evidence:'SUPPLIED_PORT_EXECUTION_ONLY'})||original.projectRef!==current.projectRef||original.stageSha256!==current.stageSha256||original.databaseUrl!==current.databaseUrl||original.certificateSha256!==current.certificateSha256||link.approvalObservedAtMs>link.nativeProofBeganAtMs)context.addIssue({code:'custom',message:'Original native terminal linkage requires exact identities and clocks.'});
});
/** Exact pure historical payload decoding; this does not grant native ownership or execution. */
export function parseHostedExecutionJournal(value:unknown):HostedExecutionJournal{
 const copied=snapshotHostedMigrationMetadata(value);hostedExecutionJournalSchema.parse(copied);return copied as HostedExecutionJournal;
}
type Code='INPUT_INVALID'|'LOCK_UNCONFIRMED'|'JOURNAL_UNCONFIRMED'|'PRIOR_REQUIRES_REVIEW'|'ADMISSION_CHANGED'|'CLI_UNCONFIRMED'|'POSTCONDITION_UNCONFIRMED';
export type HostedExecutionJournal=z.infer<typeof hostedExecutionJournalSchema>;
export type HostedExecutionPorts={
 now():number;
 withLock(key:string,run:(lease:{kind:'HELD';id:string;key:string})=>Promise<void>):Promise<{kind:'RELEASED'}|{kind:'RELEASE_UNCONFIRMED'}>;
 readJournal():Promise<unknown>;
 /** Production adapters must perform current file/source/provider/approval/TLS/history reads, never echo input as proof. */
 revalidate():Promise<unknown>;
 /** SYNCED is an adapter's durable exact-payload acknowledgement; it is not supplied by this protocol. */
 writeJournal(value:HostedExecutionJournal):Promise<{kind:'SYNCED';sha256:string}|{kind:'UNCONFIRMED'}>;
 runCli(args:string[],privateEnvironment:Record<string,string>):Promise<{kind:'EXITED';exitCode:number}|{kind:'TIMEOUT'}|{kind:'UNKNOWN'}>;
};
export type HostedExecutionResult={status:'COMMITTED'|'NOOP'|'REQUIRES_REVIEW';commitment:'CONFIRMED'|'UNKNOWN'|'NOT_ATTEMPTED';schemaHistoryAtomic:false;evidence:'SUPPLIED_PORT_EXECUTION_ONLY';execution:'INJECTED_PORTS';primaryCode:Code|null;journalCode:'REVIEW_JOURNAL_UNCONFIRMED'|null;cleanupCode:'LOCK_RELEASE_UNCONFIRMED'|null;identity?:z.infer<typeof hostedExecutionIdentitySchema>;originalIntentExecution?:Extract<HostedExecutionJournal,{version:2}>['originalIntentExecution'];acknowledgedCommit?:HostedExecutionJournal&{state:'COMMITTED'}};
declare const originalExecutionBrand:unique symbol;
export type NativeOriginalIntentExecution={readonly[originalExecutionBrand]:true};

export function snapshotHostedMigrationMetadata(value:unknown,depth=0):unknown{
 if(depth>12)throw Error('Invalid metadata.');
 if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
 if(!value||typeof value!=='object'||types.isProxy(value)||!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('Invalid metadata.');
 const output:Record<string,unknown>|unknown[]=Array.isArray(value)?[]:Object.create(null);
 for(const key of Reflect.ownKeys(value)){if(Array.isArray(value)&&key==='length')continue;const field=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!field||!('value'in field)||!field.enumerable)throw Error('Invalid metadata.');Object.defineProperty(output,key,{value:snapshotHostedMigrationMetadata(field.value,depth+1),enumerable:true});}
 return output;
}
