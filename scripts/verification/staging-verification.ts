import { createRequire } from 'node:module';
import {execFileSync} from 'node:child_process';
import {appendFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import { z } from 'zod';
import { validateCiRun } from './cicd-contracts';
import { canonicalReleaseReviewJson } from './release-review';

export const stagingVerificationWorkflowPath = '.github/workflows/staging-verification.yml' as const;
const sha = z.string().regex(/^[a-f0-9]{40}$/);
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const repository = z.string().regex(/^[a-zA-Z0-9_.-]{1,100}\/[a-zA-Z0-9_.-]{1,100}$/).refine(value => !value.split('/').some(part => part === '.' || part === '..'));
const baseRun = z.object({ id: positive, head_sha: sha, head_branch: z.literal('main'), status: z.literal('completed'), conclusion: z.literal('success'), repository: z.object({ full_name: repository }).strict() });
const canonicalRun = baseRun.extend({ path: z.literal('.github/workflows/ci.yml'), event: z.literal('push') }).strict();
export const canonicalSchemaRunSchema=canonicalRun.extend({run_attempt:positive,status:z.enum(['queued','in_progress','completed']),conclusion:z.enum(['success','failure']).nullable()}).strict().superRefine((run,context)=>{if(run.status==='completed'?run.conclusion===null:run.conclusion!==null)context.addIssue({code:'custom',message:'Canonical schema metadata must retain known current run state.'});});
export type CanonicalSchemaRun=z.infer<typeof canonicalSchemaRunSchema>;
const focusedRun = baseRun.extend({ path: z.literal(stagingVerificationWorkflowPath), event: z.enum(['push', 'workflow_dispatch']), run_attempt: positive }).strict();
export const backendVerificationRunSchema = z.union([canonicalRun, focusedRun]);
export type BackendVerificationRun = z.infer<typeof backendVerificationRunSchema>;
const unavailable = () => new Error('Backend verification source evidence is unavailable or requires review; contents withheld.');

/** Source/database metadata alone does not admit whole-runtime or release success. */
export function validateCanonicalSchemaRun(value:unknown,expected:{sha:string;repository:string;ciRunId:string}):CanonicalSchemaRun{
 try{const raw=JSON.parse(canonicalReleaseReviewJson(value)),input=z.object({sha,repository,ciRunId:z.string().regex(/^[1-9][0-9]*$/).refine(value=>Number.isSafeInteger(Number(value)))}).strict().parse(JSON.parse(canonicalReleaseReviewJson(expected))),parsed=canonicalSchemaRunSchema.parse({id:raw.id,head_sha:raw.head_sha,head_branch:raw.head_branch,event:raw.event,status:raw.status,conclusion:raw.conclusion,path:raw.path,run_attempt:raw.run_attempt,repository:{full_name:raw.repository?.full_name}});if(parsed.head_sha!==input.sha||parsed.repository.full_name!==input.repository||String(parsed.id)!==input.ciRunId)throw unavailable();return parsed;}catch{throw unavailable();}
}

/** Normalize official metadata to the original CI identity or the bounded focused identity. This alone proves no job results. */
export function validateBackendVerificationRun(value: unknown, expected: { sha: string; repository: string; ciRunId: string }): BackendVerificationRun {
  try {
    const raw: unknown = JSON.parse(canonicalReleaseReviewJson(value));
    const input = z.object({ sha, repository, ciRunId: z.string().regex(/^[1-9][0-9]*$/).refine(value => Number.isSafeInteger(Number(value))) }).strict().parse(JSON.parse(canonicalReleaseReviewJson(expected)));
    const metadata = baseRun.extend({ repository: z.object({ full_name: repository }), path: z.enum(['.github/workflows/ci.yml', stagingVerificationWorkflowPath]), event: z.enum(['push', 'workflow_dispatch']), run_attempt: positive.optional() }).parse(raw);
    if (metadata.head_sha !== input.sha || metadata.repository.full_name !== input.repository || String(metadata.id) !== input.ciRunId) throw unavailable();
    if (metadata.path === '.github/workflows/ci.yml') {
      validateCiRun(raw, input);
      return canonicalRun.parse({ id: metadata.id, head_sha: metadata.head_sha, head_branch: metadata.head_branch, status: metadata.status, conclusion: metadata.conclusion, repository: metadata.repository, path: metadata.path, event: metadata.event });
    }
    return focusedRun.parse(metadata);
  } catch { throw unavailable(); }
}

const checkout = { name: 'Check out frozen source', uses: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', with: { 'persist-credentials': false, 'fetch-depth': 0 } };
const node = { name: 'Set up Node', uses: 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020', with: { 'node-version': '24.16.0', cache: 'npm' } };
const setup = [checkout, node,
  { name: 'Install pinned npm', run: 'npm install --global npm@11.17.0 --ignore-scripts --no-audit --no-fund' },
  { name: 'Install locked dependencies', run: 'npm ci --ignore-scripts --no-audit --no-fund' },
  { name: 'Install local esbuild binary', run: 'node node_modules/esbuild/install.js' }];
const frozenSource = { name: 'Confirm frozen authored source', run: 'git diff --exit-code HEAD -- && test "$(git rev-parse HEAD)" = "$GITHUB_SHA" && test -z "$(git ls-files --others --exclude-standard)"' };
const job = (timeout: number, steps: readonly unknown[]) => ({ if: "github.ref == 'refs/heads/main'", 'runs-on': 'ubuntu-latest', 'timeout-minutes': timeout, steps });
// Immutable historical producer policy remains readable by original package
// consumers. Current focused execution consumes canonical proof below.
const jobs = {
  'staging-checks': job(30, [...setup,
    { name: 'Verify repository architecture and documentation', run: 'npm run check:repository && npm run test:repository && npm run check:architecture && npm run test:architecture && npm run check:docs && npm run test:docs' },
    { name: 'Verify release admission and workflow contracts', run: 'npm run test:cicd && npm run check:cicd' },
    { name: 'Verify lint types and unit contracts', run: 'npm run lint && npm run typecheck && npm test' },
    { name: 'Verify complete migration and synthetic Auth contracts', run: 'npm run test:hosted-plan' },
    { name: 'Verify build and runtime dependency security', run: 'node --import tsx scripts/verification/dependency-security.ts' }, frozenSource]),
  'staging-database': job(60, [...setup,
    { name: 'Replay guarded clean local synthetic bootstrap', run: 'npm run local:bootstrap' },
    { name: 'Verify complete SQL RLS grants and provider fixtures', run: 'npm run db:test' },
    { name: 'Verify local database security advisors', run: 'node --import tsx scripts/verification/database-advisors.ts' }, frozenSource,
    { name: 'Stop owned local Supabase', if: 'always()', run: 'npx --no-install supabase stop --project-id cuevo' }]),
  codeql: { ...job(20, [...setup,
    { name: 'Require exact canonical source CodeQL security job', env: { GH_TOKEN: '${{ github.token }}' }, run: 'node --import tsx scripts/verification/staging-security.ts' }, frozenSource]), permissions: { contents: 'read', actions: 'read' } },
  'secret-scan': job(20, [...setup,
    { name: 'Verify pinned scanner and full source policy', run: 'node --import tsx --test scripts/verification/secret-scan-policy.test.ts scripts/verification/secret-scan.test.ts' },
    { name: 'Scan full history plus authored worktree', run: 'node --import tsx scripts/verification/secret-scan.ts' }, frozenSource]),
  'staging-required': { if: "always() && github.ref == 'refs/heads/main'", needs: ['staging-checks', 'staging-database', 'codeql', 'secret-scan'], 'runs-on': 'ubuntu-latest', 'timeout-minutes': 5, steps: [
    { name: 'Require every focused staging boundary', env: { CHECKS: '${{ needs.staging-checks.result }}', DATABASE: '${{ needs.staging-database.result }}', CODEQL: '${{ needs.codeql.result }}', SECRET_SCAN: '${{ needs.secret-scan.result }}' },
      run: 'test "$CHECKS" = success && test "$DATABASE" = success && test "$CODEQL" = success && test "$SECRET_SCAN" = success\n' } ] },
};
export const stagingVerificationJobPolicy: Record<string, { steps: string[]; actionSteps: string[] }> = Object.fromEntries(Object.entries(jobs).map(([name, value]) => {
  const steps = value.steps as readonly { name: string; uses?: string }[];
  return [name, { steps: steps.map(step => step.name), actionSteps: steps.filter(step => step.uses !== undefined).map(step => step.name) }];
}));
const workflow = { name: 'Cuevo focused staging verification', on: { workflow_dispatch: {inputs:{ci_run_id:{description:'Original canonical main CI run to observe',required:true,type:'string'}}} }, permissions: { contents: 'read',actions:'read' },
  concurrency: { group: 'cuevo-staging-verification-${{ github.ref }}', 'cancel-in-progress': true }, env: { CI: 'true', NEXT_TELEMETRY_DISABLED: '1', SCARF_ANALYTICS: 'false' }, jobs:{'canonical-schema':job(10,[...setup,
   {name:'Observe original canonical source and database proof',env:{GH_TOKEN:'${{ github.token }}',CUEVO_CANONICAL_CI_RUN_ID:'${{ inputs.ci_run_id }}'},run:'node --import tsx scripts/verification/staging-verification.ts'},
   frozenSource,
   {name:'Retain canonical observation only',if:'always()',uses:'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',with:{name:'cuevo-schema-observation-${{ github.run_id }}-${{ github.run_attempt }}',path:'.local/staging-schema/observation.json','include-hidden-files':true,'if-no-files-found':'error','retention-days':14}},
  ])} };
const yaml = createRequire(import.meta.url)('js-yaml') as { load(text: string): unknown };

/** Exact semantic workflow contract: no secret-bearing or skipped alternate verification path is accepted. */
export function validateStagingVerificationWorkflow(text: string): string[] {
  try { return canonicalReleaseReviewJson(yaml.load(text)) === canonicalReleaseReviewJson(workflow) ? [] : ['Focused staging workflow must preserve the exact main-only secret-free verification boundaries.']; }
  catch { return ['Focused staging workflow is invalid or unverified.']; }
}

const observationContext=z.object({repository,sourceSha:sha,ciRunId:z.string().regex(/^[1-9][0-9]*$/).refine(value=>Number.isSafeInteger(Number(value)))}).strict();
export function readStagingVerificationContext(env:Record<string,string|undefined>,checkoutSha:string){
 const context=observationContext.parse({repository:env.GITHUB_REPOSITORY,sourceSha:env.GITHUB_SHA,ciRunId:env.CUEVO_CANONICAL_CI_RUN_ID});
 if(checkoutSha!==context.sourceSha||env.GITHUB_WORKFLOW_SHA!==context.sourceSha||env.GITHUB_WORKFLOW_REF!==`${context.repository}/.github/workflows/staging-verification.yml@refs/heads/main`||env.GITHUB_JOB!=='canonical-schema'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_ACTIONS!=='true'||env.CI!=='true'||env.GITHUB_SERVER_URL!=='https://github.com'||env.GITHUB_API_URL!=='https://api.github.com'||!env.GH_TOKEN||env.GH_TOKEN.length>24576||/[^\x21-\x7e]/.test(env.GH_TOKEN))throw unavailable();
 return context;
}
/** Observes the original canonical producer. No CI dispatch, SQL, provider or
 * runtime operation is reachable from this owner. */
export async function observeStagingVerification(value:unknown,github:(path:string)=>Promise<unknown>,artifact:(id:number)=>Promise<Uint8Array>){
 const context=observationContext.parse(JSON.parse(canonicalReleaseReviewJson(value))),run=await github('actions/runs/'+context.ciRunId);validateCanonicalSchemaRun(run,{sha:context.sourceSha,repository:context.repository,ciRunId:context.ciRunId});
 const {observeCanonicalSchemaJobs}=await import('./canonical-schema-jobs'),proof=await observeCanonicalSchemaJobs(run,github,artifact);
 return{version:1,purpose:'CUEVO_CANONICAL_SCHEMA_OBSERVATION',repository:context.repository,sourceSha:context.sourceSha,ciRunId:context.ciRunId,...proof};
}
async function boundedJson(response:Response,signal:AbortSignal){
 if(response.status!==200||response.redirected||!response.body||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''))throw unavailable();const declared=response.headers.get('content-length');if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>1024*1024))throw unavailable();const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
 try{for(;;){const chunk=await new Promise<ReadableStreamReadResult<Uint8Array>>((done,reject)=>{const abort=()=>{signal.removeEventListener('abort',abort);reject(unavailable());};if(signal.aborted)return abort();signal.addEventListener('abort',abort,{once:true});void reader.read().then(value=>{signal.removeEventListener('abort',abort);if(signal.aborted)reject(unavailable());else done(value);},()=>{signal.removeEventListener('abort',abort);reject(unavailable());});});if(chunk.done)break;size+=chunk.value.byteLength;if(size>1024*1024)throw unavailable();parts.push(chunk.value);}return JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(Buffer.concat(parts))) as unknown;}finally{void reader.cancel().catch(()=>undefined);try{reader.releaseLock();}catch{/* Pending cancellation owns cleanup. */}}
}
async function main(){
 const directory=resolve('.local/staging-schema');await mkdir(directory,{recursive:true});let observation:unknown;
 try{
  const checkoutSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim(),context=readStagingVerificationContext(process.env,checkoutSha),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),180000);
  try{const github=async(path:string)=>{const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(15000)]),url=`https://api.github.com/repos/${context.repository}/${path}`,response=await fetch(url,{method:'GET',headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},redirect:'error',credentials:'omit',cache:'no-store',signal});if(response.url&&response.url!==url)throw unavailable();return boundedJson(response,signal);};const{createGithubCodeqlArtifactReader}=await import('./staging-security');observation=await observeStagingVerification(context,github,createGithubCodeqlArtifactReader(context.repository,process.env.GH_TOKEN!,controller.signal));const result=observation as {status:string;pendingJobs?:string[]};if(result.status==='NOT_READY'){console.log('Canonical source/database evidence is not ready: '+result.pendingJobs!.join(', ')+'. Observe the same original CI run after these producers settle.');process.exitCode=1;}else console.log('Original canonical source/database evidence verified. Runtime operation and customer acceptance retain their separate gates.');}
  finally{clearTimeout(timer);controller.abort();}
 }catch{observation={version:1,purpose:'CUEVO_CANONICAL_SCHEMA_OBSERVATION',status:'REQUIRES_REVIEW'};console.error('Canonical source/database observation requires review; original CI evidence is incomplete or unavailable.');process.exitCode=1;}
 await writeFile(resolve(directory,'observation.json'),canonicalReleaseReviewJson(observation));if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,`Canonical source/database observation: ${(observation as {status:string}).status}. This observation does not establish operating runtime or customer acceptance.\n`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)void main().catch(()=>{console.error('Canonical source/database observation requires review; contents withheld.');process.exitCode=1;});
