import {z} from 'zod';
import {createHash} from 'node:crypto';
import {canonicalReleaseExecutionJson} from './release-review';
import {validateOperatingStagingHandoff} from './operating-staging-handoff';

const phases=['DATABASE','ACCOUNTS','RUNTIME','FRONTEND','HOSTED_JOURNEYS','CUSTOMER_ACCEPTANCE'] as const;
const phase=z.enum(phases),status=z.enum(['CONFIRMED','REQUIRES_REVIEW','OUTCOME_UNKNOWN','NOT_ATTEMPTED']),digest=z.string().regex(/^[a-f0-9]{64}$/);
const detail=z.object({appliedMigrations:z.number().int().positive().optional(),authIdentities:z.number().int().nonnegative().optional(),schools:z.number().int().nonnegative().optional(),code:z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/).optional(),origin:z.string().url().optional()}).strict();
const inputSchema=z.object({sourceSha:z.string().regex(/^[a-f0-9]{40}$/),milestones:z.array(z.object({phase,status,observedAt:z.iso.datetime({offset:true}),evidenceSha256:digest,detail}).strict()).max(phases.length)}).strict();
/** Operator-visible summary of supplied verified receipt selections. Unknown
 * is explicit; an incomplete overall workflow never erases completed effects. */
export function summarizeHostedReleasePhases(value:unknown,now:number){
 if(!Number.isSafeInteger(now)||now<0)throw Error('Release summary requires a valid observation clock.');const input=inputSchema.parse(JSON.parse(canonicalReleaseExecutionJson(value)));if(new Set(input.milestones.map(row=>row.phase)).size!==input.milestones.length||input.milestones.some(row=>Date.parse(row.observedAt)>now))throw Error('Release summary requires unique original phase observations.');
 const rows=phases.map(name=>{const row=input.milestones.find(value=>value.phase===name);return row??{phase:name,status:'UNKNOWN' as const,observedAt:null,evidenceSha256:null,detail:null};});return{purpose:'CUEVO_HOSTED_RELEASE_PHASE_SUMMARY' as const,sourceSha:input.sourceSha,phases:rows,nextPhase:rows.find(row=>row.status!=='CONFIRMED')?.phase??null,customerReady:false as const};
}
/** Project the source-owned native operating handoff's exact public milestones.
 * Frontend, hosted journeys and customer acceptance remain unknown until their
 * separate owners produce the required evidence. */
export function summarizeOperatingStagingHandoff(value:unknown,expectedValue:unknown){
 const expected=z.object({sourceSha:z.string().regex(/^[a-f0-9]{40}$/),receiptSha256:digest,now:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)}).strict().parse(JSON.parse(canonicalReleaseExecutionJson(expectedValue))),receipt=validateOperatingStagingHandoff(value,expected.now),receiptSha256=createHash('sha256').update(canonicalReleaseExecutionJson(receipt)).digest('hex');if(receipt.sourceSha!==expected.sourceSha||receiptSha256!==expected.receiptSha256)throw Error('Release summary requires exact original operating evidence.');
 const common={status:'CONFIRMED' as const,observedAt:receipt.observedAt,evidenceSha256:receiptSha256};return summarizeHostedReleasePhases({sourceSha:receipt.sourceSha,milestones:[{...common,phase:'DATABASE',detail:{appliedMigrations:receipt.database.migrationCount}},{...common,phase:'ACCOUNTS',detail:{authIdentities:receipt.database.authIdentities,schools:receipt.database.schools}},{...common,phase:'RUNTIME',detail:{origin:receipt.api.origin}}]},expected.now);
}
