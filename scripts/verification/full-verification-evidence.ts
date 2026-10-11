import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { safeEvidence } from './cicd-contracts';
import { verificationEvidence, integrationExclusions } from './verification-profiles';
import { reviewedBrowserExclusions } from './browser-runtime-scope';
import { canonicalReleaseReviewJson } from './release-review';
import { sameSourceManifest } from './rules';
import {verificationSteps} from './steps';

const sha = z.string().regex(/^[a-f0-9]{40}$/), id = z.string().regex(/^[1-9][0-9]*$/);
export function initialFullVerificationRows(){return[...verificationSteps.map(step=>({name:step.name,exitCode:null as number|null,required:true,durationMs:null as number|null})),{name:'source-freeze',exitCode:null as number|null,required:true,durationMs:null as number|null}];}
/** Exact compiled technical scope; operator flags cannot claim excluded acceptance. */
export function technicalAcceptanceScope() {
  const scope={version:1 as const,providerMode:'FIXTURE' as const,hostedAcceptance:false as const,customerAcceptance:false as const,separateBrowserWindows:reviewedBrowserExclusions.map(({file,reason})=>({file,reason})),separateIntegrationWindows:integrationExclusions.map(({file,reason})=>({file,reason}))};
  return {technicalAcceptanceScope:scope,technicalAcceptanceScopeSha256:createHash('sha256').update(canonicalReleaseReviewJson(scope)).digest('hex')};
}
export function fullVerificationSummary(input: { env: Record<string, string | undefined>; sourceSha: string; treeSha: string; evidence: unknown; before: unknown; after: unknown }) {
  input=z.object({env:z.record(z.string(),z.string().optional()),sourceSha:z.string(),treeSha:z.string(),evidence:z.unknown(),before:z.unknown(),after:z.unknown()}).strict().parse(input);
  const env = input.env, sourceSha = sha.parse(input.sourceSha), treeSha = sha.parse(input.treeSha);
  if (env.GITHUB_SHA !== sourceSha || env.GITHUB_WORKFLOW_SHA !== sourceSha || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_JOB !== 'technical-mvp' || env.GITHUB_ACTIONS !== 'true' || env.CI !== 'true'
    || env.GITHUB_WORKFLOW_REF !== `${env.GITHUB_REPOSITORY}/.github/workflows/full-regression.yml@refs/heads/main`) throw Error('Full evidence requires its exact source-owned workflow.');
  const purpose = z.enum(['regression', 'customer-candidate']).parse(env.CUEVO_FULL_VERIFICATION_PURPOSE);
  if (!['schedule', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME ?? '') || env.GITHUB_EVENT_NAME === 'schedule' && purpose !== 'regression') throw Error('Scheduled verification cannot authorize customer release.');
  const raw = z.object({ status: z.literal('VERIFIED'), rows: z.array(z.object({ name: z.string(), exitCode: z.literal(0), required: z.literal(true), durationMs: z.number().finite().nonnegative() }).strict()) }).strict().parse(input.evidence);
  verificationEvidence('full', raw.rows);
  const sources = z.array(z.object({ path: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).min(1);
  const before = sources.parse(input.before), after = sources.parse(input.after);
  if (!sameSourceManifest(before, after)) throw Error('Full evidence requires unchanged source.');
  const runId = id.parse(env.GITHUB_RUN_ID), runAttempt = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(env.GITHUB_RUN_ATTEMPT);
  const repository = z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/).parse(env.GITHUB_REPOSITORY);
  const evidence = safeEvidence(raw, before, { sha: sourceSha, runId });
  return { version: 1 as const, profile: purpose === 'customer-candidate' ? 'CUSTOMER_CANDIDATE' as const : 'FULL_REGRESSION' as const, repository, sourceSha, treeSha, runId, runAttempt, ...technicalAcceptanceScope(), evidence };
}

/** Diagnostic projection of original persisted phase rows. It cannot be
 * consumed as full acceptance and never includes source paths or raw output. */
export function fullVerificationDiagnostic(value:unknown){
  const input=z.object({env:z.record(z.string(),z.string().optional()),sourceSha:sha,treeSha:sha,evidence:z.unknown(),before:z.unknown(),after:z.unknown(),acceptanceOutcome:z.enum(['success','failure','cancelled','skipped'])}).strict().parse(value),env=input.env;
  if(env.GITHUB_SHA!==input.sourceSha||env.GITHUB_WORKFLOW_SHA!==input.sourceSha||env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_JOB!=='technical-mvp'||env.GITHUB_ACTIONS!=='true'||env.CI!=='true'||env.GITHUB_WORKFLOW_REF!==`${env.GITHUB_REPOSITORY}/.github/workflows/full-regression.yml@refs/heads/main`)throw Error('Full diagnostics require their exact source-owned workflow.');
  const purpose=z.enum(['regression','customer-candidate']).parse(env.CUEVO_FULL_VERIFICATION_PURPOSE);
  if(!['schedule','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME??'')||env.GITHUB_EVENT_NAME==='schedule'&&purpose!=='regression')throw Error('Full diagnostic purpose does not match the original workflow.');
  const rows=z.array(z.object({name:z.string(),exitCode:z.number().int().min(0).max(255).nullable(),required:z.literal(true),durationMs:z.number().finite().nonnegative().max(24*60*60*1000).nullable()}).strict()).min(1).max(1000),raw=z.object({status:z.enum(['VERIFIED','FAILED','NOT_VERIFIED']),rows}).strict().parse(input.evidence);
  const original=verificationEvidence('full',raw.rows.map(row=>({...row,durationMs:row.durationMs??undefined})));if(original.status!==raw.status)throw Error('Full diagnostic rows contradict their original status.');
  const sources=z.array(z.object({path:z.string().min(1),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).min(1).max(50000),before=sources.parse(input.before),after=input.after===null?null:sources.parse(input.after);
  for(const manifest of [before,after])if(manifest&&new Set(manifest.map(row=>row.path)).size!==manifest.length)throw Error('Full diagnostic source inventory contains duplicate paths.');
  const sourceUnchanged=after===null?null:sameSourceManifest(before,after),digest=(manifest:typeof before)=>createHash('sha256').update(canonicalReleaseReviewJson([...manifest].sort((left,right)=>left.path<right.path?-1:left.path>right.path?1:0))).digest('hex');
  if(input.acceptanceOutcome==='success'&&(raw.status!=='VERIFIED'||sourceUnchanged!==true))throw Error('A successful acceptance outcome requires complete unchanged-source evidence.');
  return{version:1 as const,purpose:'CUEVO_FULL_VERIFICATION_DIAGNOSTIC' as const,repository:z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/).parse(env.GITHUB_REPOSITORY),sourceSha:input.sourceSha,treeSha:input.treeSha,runId:id.parse(env.GITHUB_RUN_ID),runAttempt:z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(env.GITHUB_RUN_ATTEMPT),verificationPurpose:purpose,status:input.acceptanceOutcome==='cancelled'?'CANCELLED' as const:input.acceptanceOutcome==='skipped'?'NOT_ATTEMPTED' as const:input.acceptanceOutcome==='failure'?'FAILED' as const:'COMPLETED' as const,acceptanceOutcome:input.acceptanceOutcome,originalStatus:raw.status,sourceUnchanged,initialSourceSha256:digest(before),finalSourceSha256:after===null?null:digest(after),sourceFileCount:before.length,phases:raw.rows.map(row=>({name:row.name,status:row.exitCode===0?'PASSED' as const:row.exitCode===null?'UNCONFIRMED' as const:'FAILED' as const,exitCode:row.exitCode,durationMs:row.durationMs})),effectAuthority:false as const,hostedAcceptance:false as const,customerAcceptance:false as const};
}

const invocationSchema=z.object({version:z.literal(1),purpose:z.literal('CUEVO_FULL_VERIFICATION_INVOCATION'),profile:z.literal('full'),repository:z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),sourceSha:sha,treeSha:sha,workflowSha:sha,workflowRef:z.string(),ref:z.literal('refs/heads/main'),event:z.enum(['schedule','workflow_dispatch']),job:z.literal('technical-mvp'),runId:id,runAttempt:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),verificationPurpose:z.enum(['regression','customer-candidate']),verificationRunId:z.uuid(),directory:z.string().regex(/^\.local\/verification\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/),startedAtMs:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),sourceDigest:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
/** Original create-only invocation identity; data, never release authority. */
export function createFullVerificationInvocation(value:{env:Record<string,string|undefined>;sourceSha:string;treeSha:string;sourceDigest:string;verificationRunId:string;directory:string;startedAtMs:number}){
  const env=value.env,receipt=invocationSchema.parse({version:1,purpose:'CUEVO_FULL_VERIFICATION_INVOCATION',profile:'full',repository:env.GITHUB_REPOSITORY,sourceSha:value.sourceSha,treeSha:value.treeSha,workflowSha:env.GITHUB_WORKFLOW_SHA,workflowRef:env.GITHUB_WORKFLOW_REF,ref:env.GITHUB_REF,event:env.GITHUB_EVENT_NAME,job:env.GITHUB_JOB,runId:env.GITHUB_RUN_ID,runAttempt:Number(env.GITHUB_RUN_ATTEMPT),verificationPurpose:env.CUEVO_FULL_VERIFICATION_PURPOSE,verificationRunId:value.verificationRunId,directory:value.directory,startedAtMs:value.startedAtMs,sourceDigest:value.sourceDigest});
  if(env.GITHUB_ACTIONS!=='true'||env.CI!=='true'||env.GITHUB_SHA!==receipt.sourceSha||receipt.workflowSha!==receipt.sourceSha||receipt.workflowRef!==`${receipt.repository}/.github/workflows/full-regression.yml@refs/heads/main`||receipt.event==='schedule'&&receipt.verificationPurpose!=='regression'||receipt.directory!=='.local/verification/'+new Date(receipt.startedAtMs).toISOString().replace(/[:.]/g,'-'))throw Error('Full invocation requires its exact original workflow context.');return receipt;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const acceptanceOutcome=process.env.CUEVO_FULL_ACCEPTANCE_OUTCOME,root = resolve('.local/verification');
  const original=acceptanceOutcome===undefined?undefined:invocationSchema.parse(JSON.parse(await readFile(resolve('.local/full-verification-input.json'),'utf8')));
  const entries=original?[]:await readdir(root,{withFileTypes:true}),latest=original?original.directory.slice('.local/verification/'.length):entries.filter(row=>row.isDirectory()&&/^\d{4}-\d{2}-\d{2}T/.test(row.name)).map(row=>row.name).sort().at(-1);
  if(!latest)throw Error('No original full verification invocation exists.');
  const git = (args: string[]) => execFileSync('git', args, { encoding: 'utf8', shell: false, windowsHide: true, timeout: 10000 }).trim();
  const sourceSha = git(['rev-parse', 'HEAD']);
  const parse = async (name: string) => JSON.parse(await readFile(resolve(root, latest, name), 'utf8')) as unknown;
  const evidence=await parse('evidence.json'),before=await parse('source.json');let after:unknown=null;try{after=await parse('source-final.json');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  const treeSha=git(['rev-parse','HEAD^{tree}']);
  if(original){const retained=invocationSchema.parse(await parse('context.json')),matched=createFullVerificationInvocation({env:{...process.env},sourceSha,treeSha,sourceDigest:original.sourceDigest,verificationRunId:original.verificationRunId,directory:original.directory,startedAtMs:original.startedAtMs});if(canonicalReleaseReviewJson(retained)!==canonicalReleaseReviewJson(original)||canonicalReleaseReviewJson(matched)!==canonicalReleaseReviewJson(original)||createHash('sha256').update(JSON.stringify([...z.array(z.object({path:z.string(),sha256:z.string()}).strict()).parse(before)].sort((left,right)=>left.path<right.path?-1:left.path>right.path?1:0))).digest('hex')!==original.sourceDigest)throw Error('Full diagnostic receipt does not match the original invocation.');}
  await mkdir(resolve('.local/full-verification'), { recursive: true });
  if(acceptanceOutcome!==undefined){const diagnostic=fullVerificationDiagnostic({env:{...process.env},sourceSha,treeSha,evidence,before,after,acceptanceOutcome});await writeFile(resolve('.local/full-verification/diagnostic.json'),canonicalReleaseReviewJson(diagnostic),{flag:'wx',mode:0o600});if(acceptanceOutcome!=='success'){console.log(JSON.stringify({purpose:diagnostic.purpose,status:diagnostic.status,runId:diagnostic.runId}));process.exitCode=1;} }
  if(acceptanceOutcome===undefined||acceptanceOutcome==='success'){
    git(['diff','--exit-code','HEAD','--']);if(git(['ls-files','--others','--exclude-standard']))throw Error('Uncommitted authored source cannot become full evidence.');
    const summary = fullVerificationSummary({ env: {...process.env}, sourceSha, treeSha, evidence, before, after });
    await writeFile(resolve('.local/full-verification/summary.json'), canonicalReleaseReviewJson(summary), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ status: summary.evidence.status, profile: summary.profile, sourceSha, runId: summary.runId }));
  }
}
