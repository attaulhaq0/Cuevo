import {z} from 'zod';
import {canonicalReleaseExecutionJson} from './release-review';

const sha=z.string().regex(/^[a-f0-9]{40}$/),digest=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().regex(/^[1-9][0-9]{0,19}$/),positive=z.number().int().positive().max(Number.MAX_SAFE_INTEGER),generation=z.string().regex(/^[1-9][0-9]{0,18}$/).refine(value=>BigInt(value)<=9223372036854775807n);
const origin=z.string().refine(value=>{try{const url=new URL(value);return url.protocol==='https:'&&url.origin===value&&!url.username&&!url.password&&!url.port;}catch{return false;}}),ref=z.string().regex(/^[a-z]{20}$/);
const acceptance=['FULL_HOSTED_CUSTOMER_ACCEPTANCE','RESTORE_AND_OPERATIONAL_APPROVAL','CURRICULUM_RIGHTS_AND_SCHOOL_APPROVAL'] as const;
const componentSource=z.object({sourceSha:sha,treeSha:sha}).strict();
const schema=z.object({version:z.literal(1),purpose:z.literal('CUEVO_OPERATING_SYNTHETIC_STAGING_HANDOFF'),repository:z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),sourceSha:sha,treeSha:sha,componentSource:componentSource.optional(),runId:id,runAttempt:positive,packageSha256:digest,observedAt:z.iso.datetime({offset:true}),generation,
 database:z.object({projectRef:ref,migrationCount:positive,migrationManifestSha256:digest,historySha256:digest,authIdentities:z.literal(133),schools:z.literal(2),permissionsVerified:z.literal(true)}).strict(),
 api:z.object({projectId:z.string().regex(/^prj_[A-Za-z0-9]+$/),teamId:z.string().regex(/^team_[A-Za-z0-9]+$/),deploymentId:z.string().regex(/^dpl_[A-Za-z0-9]+$/),deploymentUrl:origin,origin,artifactSha256:digest,healthVerified:z.literal(true),currentActorVerified:z.literal(true),corsVerified:z.literal(true)}).strict(),
 worker:z.object({edgeId:z.string().min(1).max(200),edgeVersion:positive,artifactSha256:digest,denoLockSha256:digest,runtimeSha256:digest,generation,operatingVerified:z.literal(true),privateTransportVerified:z.literal(true),admissionPaused:z.literal(false)}).strict(),
 privateAccess:z.object({dataApiDisabled:z.literal(true),anonymousDenied:z.literal(true),authenticatedDenied:z.literal(true),serviceDenied:z.literal(true),storageVerified:z.literal(true),realtimeVerified:z.literal(true)}).strict(),
 cleanup:z.object({lockReleased:z.literal(true),sessionsClosed:z.literal(true),receiptSha256:digest}).strict(),
 publicConfig:z.object({apiUrl:origin,supabaseUrl:origin,supabasePublishableKey:z.string().startsWith('sb_publishable_').min(20).max(500)}).strict(),customerAcceptance:z.literal(false),remainingAcceptance:z.tuple([z.literal(acceptance[0]),z.literal(acceptance[1]),z.literal(acceptance[2])])}).strict();
export type OperatingStagingHandoff=z.infer<typeof schema>;
const fail=()=>Error('Operating synthetic staging handoff requires current exact evidence; private contents withheld.');
/** A strict supplied operating receipt is staging evidence only. Native producer
 * owners establish its facts; this validator grants no deployment authority. */
export function validateOperatingStagingHandoff(value:unknown,now:number):OperatingStagingHandoff{
 try{if(!Number.isSafeInteger(now)||now<0)throw fail();const result=schema.parse(JSON.parse(canonicalReleaseExecutionJson(value))),observed=Date.parse(result.observedAt);if(observed>now||now-observed>3600000||result.generation!==result.worker.generation||result.publicConfig.apiUrl!==result.api.origin||result.publicConfig.supabaseUrl!==`https://${result.database.projectRef}.supabase.co`||!new URL(result.api.deploymentUrl).hostname.endsWith('.vercel.app'))throw fail();return result;}catch{throw fail();}
}
/** Explicit staging browser bridge. Customer/production callers cannot borrow
 * this purpose or convert operating smoke into customer acceptance. */
export function operatingStagingBrowserInputs(value:unknown,expectedValue:unknown){
 try{const expected=z.object({environment:z.literal('staging'),sourceSha:sha,treeSha:sha,projectRef:ref,apiOrigin:origin,apiProjectId:z.string(),teamId:z.string(),now:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)}).strict().parse(JSON.parse(canonicalReleaseExecutionJson(expectedValue))),receipt=validateOperatingStagingHandoff(value,expected.now);if(receipt.sourceSha!==expected.sourceSha||receipt.treeSha!==expected.treeSha||receipt.database.projectRef!==expected.projectRef||receipt.api.origin!==expected.apiOrigin||receipt.api.projectId!==expected.apiProjectId||receipt.api.teamId!==expected.teamId)throw fail();return{NEXT_PUBLIC_API_URL:receipt.publicConfig.apiUrl,NEXT_PUBLIC_SUPABASE_URL:receipt.publicConfig.supabaseUrl,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:receipt.publicConfig.supabasePublishableKey};}catch{throw fail();}
}
