import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile,lstat,realpath } from 'node:fs/promises';
import { resolve, join,relative,isAbsolute } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parse as parseEnv } from 'dotenv';
import { z } from 'zod';
import { validateCiRun, validateReleaseManifest, vercelTarget, validateVercelDeployment, releaseContext, validateReleaseControls } from './cicd-contracts';
import {validateOperatingStagingHandoff} from './operating-staging-handoff';
import {readCanonicalMigrationSources} from '../database/hosted-migration-plan';
import { runtimeEnvironment } from '../runtime/environment';
import { canonicalReleaseReviewJson, parseCanonicalReleaseReviewJson, prepareReleaseReviewPackage, readPreparedReleaseReviewPackage, validateFounderReleaseApproval, type ReleaseReviewExpected } from './release-review';
import { backendSelectionForWebEvent, encodeWebBackendSelection, readWebBackendSelection, readWebBackendBridge, bindWebReviewToBackend, readCanonicalWebOutput } from './web-backend-bridge';
import { bindVerifiedStagingWebOrigin } from './web-staging-origin';
import { verifyHostedBrowserAccess } from './backend-hosted-browser';
import { readGitBinaryDiffDigest } from './git-source-digest';
import { verifyHostedLearningLoop, type HostedLearningLoopWebAdmission } from './backend-hosted-learning-loop';
import { createProtectedPreview, protectedPreviewHeaders, type ProtectedPreviewBinding } from './protected-preview';
import { readFullReleaseEvidence } from './full-release-evidence';
import {readCanonicalRuntimeJobs} from './canonical-runtime-jobs';
import {createGithubCodeqlArtifactReader} from './staging-security';

const directory = resolve('.local/cicd-release');
const required = (key: string) => { const value = process.env[key]; if (!value) throw Error(`Required release setting missing: ${key}`); return value; };
const sourceEnvironment = () => ({ ...runtimeEnvironment('web', process.env), GIT_NO_REPLACE_OBJECTS: '1' });
const assertCheckout = () => {
  let actual: string;
  try { actual = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: false, env: sourceEnvironment(), timeout: 15000, maxBuffer: 32 * 1024 * 1024 }).trim(); }
  catch { throw Error('Release checkout evidence is unavailable; contents withheld.'); }
  if (actual !== required('RELEASE_SHA')) throw Error('Release checkout does not match the admitted commit.');
};
const parseJson = <T,>(text: string): T => { try { return JSON.parse(text) as T; } catch { throw Error('Release JSON is invalid; contents withheld.'); } };
const json = async <T,>(path: string): Promise<T> => parseJson<T>(await readFile(path, 'utf8'));
const publicPath = join(directory, 'public.json');
const reviewPath = join(directory, 'review.json');
const webIdentity = () => z.object({ teamId: z.string().regex(/^team_[a-zA-Z0-9]+$/), projectId: z.string().regex(/^prj_[a-zA-Z0-9]+$/), target: z.enum(['preview', 'production']) }).strict().parse({ teamId: required('VERCEL_ORG_ID'), projectId: required('VERCEL_PROJECT_ID'), target: vercelTarget(required('RELEASE_ENVIRONMENT')) });
async function webCliFile(root:string,path:string,maximum:number){
  const part=relative(root,path);if(!isAbsolute(root)||resolve(root)!==root||!isAbsolute(path)||resolve(path)!==path||isAbsolute(part)||part.split(/[\\/]/).some(piece=>piece==='..'))throw Error('Vercel executable identity requires review.');
  let current=root;const pieces=part.split(/[\\/]/).filter(Boolean);for(const[index,piece]of[...pieces,''].entries()){const stat=await lstat(current);if(stat.isSymbolicLink()||await realpath(current)!==current||(index<pieces.length?!stat.isDirectory():!stat.isFile()||stat.nlink!==1))throw Error('Vercel executable identity requires review.');if(piece)current=join(current,piece);}
  const before=await lstat(path);if(before.size>maximum)throw Error('Vercel executable identity requires review.');const bytes=await readFile(path),after=await lstat(path);if(before.ino!==after.ino||before.dev!==after.dev||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs||bytes.length>maximum)throw Error('Vercel executable identity requires review.');return bytes;
}
/** Keep discovery outside renewed approval. These final byte checks are retained
 * for the mutable host CLI; they do not attest its complete import graph. */
async function prepareWebCli(args:string[]){
  const token=required('VERCEL_TOKEN'),identity=webIdentity(),environment={...runtimeEnvironment('web',process.env)},selectedArgs=[...args];
  if (process.platform === 'win32') throw Error('Reviewed release CLI execution requires the Linux GitHub runner.');
  let global:string;try{global=execFileSync('npm',['root','--global'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],env:environment,shell:false,timeout:15000,maxBuffer:65536});}catch{throw Error('Pinned Vercel CLI discovery failed; contents withheld.');}
  const cliRoot=join(resolve(global.trim()),'vercel'),packagePath=join(cliRoot,'package.json'),packageBytes=await webCliFile(cliRoot,packagePath,1024*1024),manifest=JSON.parse(packageBytes.toString('utf8')) as {name?:string;version?:string;bin?:string|Record<string,string>};
  const bin=typeof manifest.bin==='string'?manifest.bin:manifest.bin?.vercel;if(manifest.name!=='vercel'||manifest.version!=='62.1.0'||!bin||isAbsolute(bin)||bin.split(/[\\/]/).some(piece=>!piece||piece==='.'||piece==='..'))throw Error('Pinned Vercel CLI requires review.');
  const executable=join(cliRoot,bin),digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex'),cliSha256=digest(await webCliFile(cliRoot,executable,32*1024*1024));let attempted=false;
  return async(admit:()=>Promise<()=>Promise<()=>void>>)=>{
    if(attempted)throw Error('Prepared Vercel execution has already been consumed.');attempted=true;
    if(!isDeepStrictEqual(identity,webIdentity())||required('VERCEL_TOKEN')!==token||digest(await webCliFile(cliRoot,packagePath,1024*1024))!==digest(packageBytes)||digest(await webCliFile(cliRoot,executable,32*1024*1024))!==cliSha256)throw Error('Prepared Vercel execution changed before launch.');
    const consume=await admit();
    if(digest(await webCliFile(cliRoot,packagePath,1024*1024))!==digest(packageBytes)||digest(await webCliFile(cliRoot,executable,32*1024*1024))!==cliSha256)throw Error('Prepared Vercel executable changed during approval.');
    const finalGuard=await consume();
    if(digest(await webCliFile(cliRoot,packagePath,1024*1024))!==digest(packageBytes)||digest(await webCliFile(cliRoot,executable,32*1024*1024))!==cliSha256)throw Error('Prepared Vercel executable changed during final input checks.');
    finalGuard();
    if(!isDeepStrictEqual(identity,webIdentity())||required('VERCEL_TOKEN')!==token)throw Error('Prepared Vercel recipient changed before launch.');
    try{return execFileSync(process.execPath,[executable,...selectedArgs,'--scope',identity.teamId],{encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...environment,VERCEL_TOKEN:token,VERCEL_ORG_ID:identity.teamId,VERCEL_PROJECT_ID:identity.projectId},shell:false});}catch{throw Error('Vercel action failed; raw output and credentials withheld.');}
  };
}
function requireOriginalWebPackageClock(prepared:{canonicalJson:string}){
  const timestamp=z.object({preparedAt:z.iso.datetime({offset:true})}).parse(parseCanonicalReleaseReviewJson(prepared.canonicalJson)).preparedAt,recorded=Date.parse(timestamp),now=Date.now();if(!Number.isFinite(recorded)||recorded>now||now-recorded>24*60*60*1000)throw Error('Original web approval package expired before launch.');
}
const files = async (root: string): Promise<string[]> => {
  const result: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name); if (entry.isDirectory()) result.push(...await files(path)); else if (entry.isFile()) result.push(path); else throw Error('Unexpected artifact symlink requires review.');
  }
  return result;
};
const artifactDigest = async () => {
  const output = resolve('.vercel/output'); const paths = (await files(output)).sort();
  if (!paths.length) throw Error('No prebuilt artifact was produced.');
  const hash = createHash('sha256'); const token = required('VERCEL_TOKEN');
  const forbidden = [token, encodeURIComponent(token), Buffer.from(token).toString('base64')];
  for (const path of paths) {
    const bytes = await readFile(path); if (forbidden.some(secret => bytes.includes(Buffer.from(secret)))) throw Error('Prebuilt artifact contains a deployment credential.');
    hash.update(path.slice(output.length).replaceAll('\\', '/')); hash.update(createHash('sha256').update(bytes).digest());
  }
  return hash.digest('hex');
};
const admitManifest = async (manifest: unknown, ciRunId: string) => {
  if(manifest&&typeof manifest==='object'&&'purpose'in manifest&&manifest.purpose==='CUEVO_OPERATING_SYNTHETIC_STAGING_HANDOFF'){
    if(required('RELEASE_ENVIRONMENT')!=='staging')throw Error('Operating staging cannot authorize customer production.');
    const receipt=validateOperatingStagingHandoff(manifest,Date.now()),sources=readCanonicalMigrationSources({repoRoot:process.cwd(),sourceSha:required('RELEASE_SHA'),treeSha:receipt.treeSha}).sources;
    const migrations=sources.map(row=>({version:row.name.slice(0,14),sha256:createHash('sha256').update(row.bytes).digest('hex')})).sort((a,b)=>a.version.localeCompare(b.version));
    if(receipt.sourceSha!==required('RELEASE_SHA')||receipt.repository!==required('GITHUB_REPOSITORY')||receipt.database.migrationCount!==sources.length||receipt.database.migrationManifestSha256!==createHash('sha256').update(canonicalReleaseReviewJson(migrations)).digest('hex'))throw Error('Operating staging source or migration identity changed.');
    return{...receipt.publicConfig,api:{kind:'vercel' as const,projectId:receipt.api.projectId,teamId:receipt.api.teamId,deploymentId:receipt.api.deploymentId,origin:receipt.api.origin,deploymentUrl:receipt.api.deploymentUrl,target:'preview' as const,artifactSha256:receipt.api.artifactSha256,commitSha:receipt.componentSource?.sourceSha??receipt.sourceSha},worker:{kind:'edge' as const,projectRef:receipt.database.projectRef,functionName:'cuevo-worker',edgeId:receipt.worker.edgeId,edgeVersion:receipt.worker.edgeVersion,artifactSha256:receipt.worker.artifactSha256,denoLockSha256:receipt.worker.denoLockSha256}};
  }
  const migrations = await Promise.all((await readdir('supabase/migrations')).filter(name => /^\d{14}_.+\.sql$/.test(name)).map(async name => ({ version: name.slice(0, 14), sha256: createHash('sha256').update(await readFile(join('supabase/migrations', name))).digest('hex') })));
  return validateReleaseManifest(manifest, { sha: required('RELEASE_SHA'), environment: required('RELEASE_ENVIRONMENT'), ciRunId, now: Date.now(), migrations });
};
const inspectDeployment = async (identity: { teamId: string; projectId: string; url: string; deploymentId?: string }) => {
  const admitted=await readmitApproval();
  const selector = identity.deploymentId ?? new URL(identity.url).hostname;
  const url = new URL(`https://api.vercel.com/v13/deployments/${encodeURIComponent(selector)}`); url.searchParams.set('teamId', identity.teamId);
  let inspected: unknown;
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${required('VERCEL_TOKEN')}` }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error('Unavailable'); inspected = await response.json();
  } catch { throw Error('Team-scoped Vercel deployment evidence is unavailable; response contents withheld.'); }
  const operating=admitted.backend?.purpose==='OPERATING_BACKEND_WEB_HANDOVER_CONSUMPTION'?validateOperatingStagingHandoff(admitted.manifest,Date.parse(admitted.backend.backendIdentity.exportedAt)):null;
  const sourceSha=operating&&identity.projectId===operating.api.projectId&&identity.teamId===operating.api.teamId&&identity.deploymentId===operating.api.deploymentId&&identity.url===operating.api.deploymentUrl?(operating.componentSource?.sourceSha??operating.sourceSha):required('RELEASE_SHA');
  validateVercelDeployment(inspected, { sha:sourceSha, ...identity, target: vercelTarget(required('RELEASE_ENVIRONMENT')) });
  return z.object({ id: z.string().regex(/^dpl_[A-Za-z0-9]+$/), url: z.string(), projectId: z.string(), ownerId: z.string() }).parse(inspected);
};
const assertCurrentMain = async () => {
  const current = await github('git/ref/heads/main');
  if (z.object({ object: z.object({ type: z.literal('commit'), sha: z.literal(required('RELEASE_SHA')) }) }).safeParse(current).success !== true) throw Error('Main changed or current branch evidence is unavailable; release requires fresh CI.');
};
const github = async (path: string): Promise<unknown> => {
  const repository = required('GITHUB_REPOSITORY');
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository)) throw Error('Invalid release repository.');
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}${path?'/' + path:''}`, { headers: { Authorization: `Bearer ${required('GH_TOKEN')}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error('Unavailable');
    return await response.json();
  } catch { throw Error('Current release control or approval evidence is unavailable; contents withheld.'); }
};
const controlEvidence = async () => {
  const environment = required('RELEASE_ENVIRONMENT');
  if (!['staging', 'production'].includes(environment)) throw Error('Unknown release environment.');
  const [repository,environmentControl, branches, main, signatures] = await Promise.all([github(''),github(`environments/${environment}`), github(`environments/${environment}/deployment-branch-policies`), github('branches/main/protection'), github('branches/main/protection/required_signatures')]);
  validateReleaseControls({ repository,environment: environmentControl, branches, main, signatures }, { environment,repository:required('GITHUB_REPOSITORY') });
  const identity = z.object({ id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), name: z.literal(environment) }).parse(environmentControl);
  return identity;
};
const currentCi = async () => {
  const sha = required('RELEASE_SHA'), ciRunId = required('CI_RUN_ID');
  if (!/^[a-f0-9]{40}$/.test(sha) || !/^[1-9][0-9]*$/.test(ciRunId) || sha !== required('GITHUB_SHA') || process.env.GITHUB_REF !== 'refs/heads/main') throw Error('Release must use the exact verified main commit.');
  assertCheckout();
  const rawCi=await github(`actions/runs/${ciRunId}`);
  validateCiRun(rawCi, { sha, repository: required('GITHUB_REPOSITORY'), ciRunId });
  const canonicalRuntimeVerification=await readCanonicalRuntimeJobs(rawCi,github,createGithubCodeqlArtifactReader(required('GITHUB_REPOSITORY'),required('GH_TOKEN'))),canonicalPath=join(directory,'canonical-runtime-proof.json');
  try{const saved=await json<unknown>(canonicalPath);if(canonicalReleaseReviewJson(saved)!==canonicalReleaseReviewJson(canonicalRuntimeVerification))throw Error('Canonical runtime job attempt changed before release consumption.');}
  catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;await mkdir(directory,{recursive:true});await writeFile(canonicalPath,canonicalReleaseReviewJson(canonicalRuntimeVerification),{flag:'wx',mode:0o600});}
  if (required('RELEASE_ENVIRONMENT') === 'production') {
    const fullVerificationRunId = required('FULL_VERIFICATION_RUN_ID');
    if (fullVerificationRunId === ciRunId) throw Error('Full candidate and dependency verification must have separate run identities.');
    const evidence = await readFullReleaseEvidence({ repoRoot: process.cwd(), githubToken: required('GH_TOKEN'), repository: required('GITHUB_REPOSITORY'), sha, ciRunId: fullVerificationRunId });
    const receiptPath = join(directory, 'full-release-proof.json');
    try {
      const saved = await json<unknown>(receiptPath);
      if (canonicalReleaseReviewJson(saved) !== canonicalReleaseReviewJson(evidence)) throw Error('Full customer-candidate evidence changed before consumption.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await mkdir(directory, { recursive: true }); await writeFile(receiptPath, canonicalReleaseReviewJson(evidence), { flag: 'wx', mode: 0o600 });
    }
  } else if (process.env.FULL_VERIFICATION_RUN_ID) throw Error('Staging cannot consume a production candidate identity.');
  await assertCurrentMain();
};
const assignmentSchema = z.object({ baseSha: z.string().regex(/^[a-f0-9]{40}$/), reviews: z.array(z.object({ category: z.enum(['source-spec-code', 'qa-regression-operations']), taskId: z.string().min(1).max(200).regex(/^[a-zA-Z0-9_./:-]+$/), reportSha256: z.string().regex(/^[a-f0-9]{64}$/), evidenceSha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).length(2) }).strict();
const sourceEvidence = async (baseSha: string) => {
  const sourceSha = required('RELEASE_SHA');
  const git = (args: string[]) => {
    try { return execFileSync('git', args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false, env: sourceEnvironment(), timeout: 15000, maxBuffer: 32 * 1024 * 1024 }); }
    catch { throw Error('Exact clean release source or review base evidence is unavailable; contents withheld.'); }
  };
  if (git(['rev-parse', '--verify', `${baseSha}^{commit}`]).toString('utf8').trim() !== baseSha) throw Error('Review base is not an exact immutable commit.');
  git(['merge-base', '--is-ancestor', baseSha, sourceSha]);
  git(['diff', '--quiet', 'HEAD', '--']);
  if (git(['ls-files', '--others', '--exclude-standard']).length) throw Error('Release checkout contains unreviewed authored files.');
  const tree = git(['ls-tree', '-r', '-z', sourceSha]);
  if (!tree.length) throw Error('Release source tree is empty.');
  const diff = await readGitBinaryDiffDigest({ repoRoot: process.cwd(), baseSha, sourceSha });
  if (git(['rev-parse', 'HEAD']).toString('utf8').trim() !== sourceSha) throw Error('Release source changed during source verification.');
  git(['diff', '--quiet', '--no-ext-diff', '--no-textconv', sourceSha, '--']);
  if (git(['ls-files', '--others', '--exclude-standard']).length) throw Error('Release checkout contains unreviewed authored files.');
  return { sourceManifestSha256: createHash('sha256').update(tree).digest('hex'), diffSha256: diff.sha256 };
};
const reviewExpected = async (manifest: unknown) => {
  const assignments = assignmentSchema.parse(parseCanonicalReleaseReviewJson(required('CUEVO_RELEASE_REVIEW_ASSIGNMENTS_JSON')));
  const environment = await controlEvidence();
  const run = await github(`actions/runs/${required('GITHUB_RUN_ID')}`);
  const identity = z.object({ id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), run_attempt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), repository: z.object({ full_name: z.literal(required('GITHUB_REPOSITORY')) }), head_sha: z.literal(required('RELEASE_SHA')), head_branch: z.literal('main'), path: z.literal('.github/workflows/release.yml'), event: z.enum(['workflow_dispatch', 'workflow_run']), status: z.enum(['in_progress', 'waiting']), conclusion: z.null() }).parse(run);
  if (String(identity.id) !== required('GITHUB_RUN_ID') || String(identity.run_attempt) !== required('GITHUB_RUN_ATTEMPT')) throw Error('Release run attempt does not match current execution.');
  const fingerprints = await sourceEvidence(assignments.baseSha);
  const fullProof = environment.name === 'production' ? await json<{ runId: string; runAttempt: number; sourceSha: string; summarySha256: string; jobsSha256: string }>(join(directory,'full-release-proof.json')) : undefined;
  const fullVerification = fullProof ? { runId: fullProof.runId, runAttempt: fullProof.runAttempt, sourceSha: fullProof.sourceSha, summarySha256: fullProof.summarySha256, jobsSha256: fullProof.jobsSha256 } : undefined;
  const canonicalRuntimeVerification=z.object({runAttempt:z.number().int().positive(),jobsSha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(await json<unknown>(join(directory,'canonical-runtime-proof.json')));
  const expected: ReleaseReviewExpected = { repository: required('GITHUB_REPOSITORY'), releaseSha: required('RELEASE_SHA'), baseSha: assignments.baseSha, ciRunId: required('CI_RUN_ID'), releaseRunId: String(identity.id), runAttempt: identity.run_attempt, environmentId: environment.id, environmentName: environment.name as 'staging' | 'production', web: webIdentity(),canonicalRuntimeVerification, ...(fullVerification?{fullVerification}:{}), now: Date.now(), manifestSha256: createHash('sha256').update(canonicalReleaseReviewJson(manifest), 'utf8').digest('hex'), ...fingerprints, reviews: assignments.reviews };
  return { expected, run };
};
const backendBridge = async () => {
  const encoded = process.env.BACKEND_SELECTION_BASE64 ?? '';
  const selection = readWebBackendSelection(encoded);
  if (!selection && (process.env.BACKEND_MANIFEST_BASE64 || process.env.BACKEND_BRIDGE_BASE64)) throw Error('Backend evidence outputs require their exact admitted selection.');
  // Actual dispatch input and the validated context output must agree. A caller
  // cannot omit an invalid bridge and fall back to manually supplied variables.
  if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' && process.env.GITHUB_EVENT_PATH) {
    const actual = backendSelectionForWebEvent(await json<unknown>(required('GITHUB_EVENT_PATH')), required('GITHUB_EVENT_NAME'), required('RELEASE_ENVIRONMENT'));
    if (encodeWebBackendSelection(actual) !== encoded) throw Error('Backend selection changed after release context admission.');
  }
  if (!selection) return null;
  return readWebBackendBridge({ selection, repoRoot: process.cwd(), githubToken: required('GH_TOKEN'), releaseSha: required('RELEASE_SHA'), ciRunId: required('CI_RUN_ID'), environment: required('RELEASE_ENVIRONMENT'), web: webIdentity() });
};
const approvalEvidence = async (credentialFree: boolean) => {
  if (credentialFree && process.env.VERCEL_TOKEN) throw Error('Credential-free release approval must receive no deployment token.');
  await currentCi();
  const bridge = await backendBridge();
  const protectedManifest = bridge ? readCanonicalWebOutput(required('BACKEND_MANIFEST_BASE64')) : parseCanonicalReleaseReviewJson(required('RELEASE_MANIFEST'));
  if (bridge && (canonicalReleaseReviewJson(protectedManifest) !== canonicalReleaseReviewJson(bridge.manifest)
    || canonicalReleaseReviewJson(readCanonicalWebOutput(required('BACKEND_BRIDGE_BASE64'))) !== canonicalReleaseReviewJson(bridge))) throw Error('Completed backend evidence changed after web package preparation.');
  const publicConfig = await admitManifest(protectedManifest, required('CI_RUN_ID'));
  if(publicConfig.api.kind==='vercel'&&publicConfig.api.projectId===webIdentity().projectId)throw Error('API and web must use separate Vercel projects before credential consumption.');
  const { expected, run } = await reviewExpected(protectedManifest);
  if (String(expected.environmentId) !== required('RELEASE_ENVIRONMENT_ID')) throw Error('Release environment changed after package preparation.');
  const prepared = readPreparedReleaseReviewPackage(required('REVIEW_BASE64'), expected);
  if (bridge) bindWebReviewToBackend(parseCanonicalReleaseReviewJson(prepared.canonicalJson), parseCanonicalReleaseReviewJson(required('CUEVO_RELEASE_REVIEW_ASSIGNMENTS_JSON')), bridge);
  if (prepared.sha256 !== required('REVIEW_DIGEST')) throw Error('Release review package digest changed.');
  const receipt = validateFounderReleaseApproval(prepared, run, await github(`actions/runs/${expected.releaseRunId}/approvals`), expected);
  return { manifest: protectedManifest, publicConfig, prepared, receipt, ciRunId: required('CI_RUN_ID'), ...(bridge ? { backend: bridge } : {}) };
};
const readmitApproval = async () => {
  const savedText = await readFile(reviewPath, 'utf8');
  if (Buffer.byteLength(savedText, 'utf8') > 192 * 1024) throw Error('Saved release approval exceeds its bounded receipt size.');
  const saved = z.object({ manifest: z.unknown(), publicConfig: z.unknown(), prepared: z.unknown(), receipt: z.unknown(), ciRunId: z.string(), backend: z.unknown().optional() }).strict().parse(parseJson<unknown>(savedText));
  const current = await approvalEvidence(false);
  // Review validators return JSON-only null-prototype snapshots. Saved JSON must compare its
  // validated values, not prototype identity introduced by decoding the receipt file.
  if (!isDeepStrictEqual(saved, parseJson<unknown>(JSON.stringify(current)))) throw Error('Saved approval, dependencies or package changed before consumption.');
  if (!isDeepStrictEqual(await json<unknown>(publicPath), current.publicConfig) || !isDeepStrictEqual(await json<unknown>(join(directory, 'manifest.json')), { manifest: current.manifest, ciRunId: current.ciRunId })) throw Error('Saved release manifest or public dependencies changed before consumption.');
  return current;
};
const currentWebDeploymentReceipt = async (admitted: Awaited<ReturnType<typeof readmitApproval>>) => {
  if(!admitted.backend||required('RELEASE_ENVIRONMENT')!=='staging')throw Error('Hosted staging checks require the completed backend handover.');
  const identity=webIdentity();
  const receipt=z.object({version:z.literal(1),purpose:z.literal('CUEVO_VERIFIED_WEB_DEPLOYMENT'),status:z.literal('WEB_DEPLOYMENT_VERIFIED'),repository:z.literal(required('GITHUB_REPOSITORY')),sourceSha:z.literal(required('RELEASE_SHA')),ciRunId:z.literal(required('CI_RUN_ID')),runId:z.literal(required('GITHUB_RUN_ID')),runAttempt:z.literal(Number(required('GITHUB_RUN_ATTEMPT'))),environment:z.literal('staging'),teamId:z.literal(identity.teamId),projectId:z.literal(identity.projectId),target:z.literal('preview'),deploymentId:z.string().regex(/^dpl_[A-Za-z0-9]+$/),url:z.string().url(),artifactSha256:z.string().regex(/^[a-f0-9]{64}$/),manifestSha256:z.literal(createHash('sha256').update(canonicalReleaseReviewJson(admitted.manifest)).digest('hex')),reviewSha256:z.literal(admitted.prepared.sha256),backend:z.unknown(),observedAt:z.iso.datetime({offset:true}),coreLearningLoopVerified:z.literal(false),customerReady:z.literal(false),hostedAcceptance:z.literal(false)}).strict().parse(await json<unknown>(join(directory,'web-deployment-result.json')));
  if(canonicalReleaseReviewJson(receipt.backend)!==canonicalReleaseReviewJson(admitted.backend.backendIdentity)||receipt.artifactSha256!==await artifactDigest()||Date.parse(receipt.observedAt)>Date.now()||Date.now()-Date.parse(receipt.observedAt)>3600000)throw Error('Verified web deployment receipt changed or expired.');
  const upload=z.object({url:z.literal(receipt.url),commitSha:z.literal(receipt.sourceSha)}).strict().parse(await json<unknown>(join(directory,'deployment.json')));if(!upload)throw Error('Web upload receipt is unavailable.');
  await inspectDeployment({teamId:receipt.teamId,projectId:receipt.projectId,deploymentId:receipt.deploymentId,url:receipt.url});
  return receipt;
};
const mode = process.argv[2];
if (mode === 'context') {
  const event = await json<unknown>(required('GITHUB_EVENT_PATH'));
  const context = releaseContext(event, { sha: required('GITHUB_SHA'), ref: required('GITHUB_REF'), repository: required('GITHUB_REPOSITORY'), eventName: required('GITHUB_EVENT_NAME') });
  const selection = backendSelectionForWebEvent(event, required('GITHUB_EVENT_NAME'), context.environment);
  await writeFile(required('GITHUB_OUTPUT'), `sha=${context.sha}\nci-run-id=${context.ciRunId}\nfull-run-id=${context.fullVerificationRunId??''}\nenvironment=${context.environment}\n`, { flag: 'a' });
  if (selection) await writeFile(required('GITHUB_OUTPUT'), `backend-selection-base64=${encodeWebBackendSelection(selection)}\n`, { flag: 'a' });
  console.log('Release context bound to the current main checkout and canonical CI run.');
} else if (mode === 'controls') {
  await controlEvidence();
  console.log('Existing release environment and main review/signature/status protections verified.');
} else if (mode === 'prepare') {
  if (process.env.VERCEL_TOKEN) throw Error('Release package preparation must receive no deployment token.');
  await currentCi();
  const input = z.object({ manifest: z.unknown(), review: z.unknown() }).strict().parse(parseCanonicalReleaseReviewJson(required('CUEVO_RELEASE_REVIEW_INPUT_JSON')));
  const bridge = await backendBridge();
  if (bridge) { input.review = bindWebReviewToBackend(input.review, parseCanonicalReleaseReviewJson(required('CUEVO_RELEASE_REVIEW_ASSIGNMENTS_JSON')), bridge); input.manifest = bridge.manifest; }
  const admitted = await admitManifest(input.manifest, required('CI_RUN_ID'));
  if(admitted.api.kind==='vercel'&&admitted.api.projectId===webIdentity().projectId)throw Error('API and web must use separate Vercel projects before release preparation.');
  const { expected } = await reviewExpected(input.manifest);
  const suppliedReview=z.object({canonicalRuntimeVerification:z.unknown().optional()}).passthrough().parse(input.review);
  if(suppliedReview.canonicalRuntimeVerification!==undefined&&canonicalReleaseReviewJson(suppliedReview.canonicalRuntimeVerification)!==canonicalReleaseReviewJson(expected.canonicalRuntimeVerification))throw Error('Supplied review cannot replace official canonical runtime proof.');
  const prepared = prepareReleaseReviewPackage({...suppliedReview,canonicalRuntimeVerification:expected.canonicalRuntimeVerification}, expected);
  await writeFile(required('GITHUB_OUTPUT'), `review-base64=${prepared.base64}\nreview-digest=${prepared.sha256}\nenvironment-id=${expected.environmentId}\n`, { flag: 'a' });
  if (bridge) await writeFile(required('GITHUB_OUTPUT'), `backend-manifest-base64=${Buffer.from(canonicalReleaseReviewJson(bridge.manifest)).toString('base64')}\nbackend-bridge-base64=${Buffer.from(canonicalReleaseReviewJson(bridge)).toString('base64')}\n`, { flag: 'a' });
  await writeFile(required('GITHUB_STEP_SUMMARY'), `## Cuevo pre-build release admission\n\nThis package contains operator-attested independent review digests. It does not approve a future web artifact or domain promotion.\n\n\`\`\`json\n${JSON.stringify(parseCanonicalReleaseReviewJson(prepared.canonicalJson), null, 2)}\n\`\`\`\n\nThe following dependency manifest is bound by the package's manifest SHA-256:\n\n\`\`\`json\n${JSON.stringify(input.manifest, null, 2)}\n\`\`\`\n\nCopy this exact approval comment:\n\n\`${prepared.comment}\`\n`, { flag: 'a' });
  console.log('Exact secret-free release review package prepared before founder approval.');
} else if (mode === 'approval') {
  const evidence = await approvalEvidence(true);
  await mkdir(directory, { recursive: true });
  await writeFile(reviewPath, JSON.stringify(evidence), { mode: 0o600 });
  await writeFile(join(directory, 'manifest.json'), JSON.stringify({ manifest: evidence.manifest, ciRunId: evidence.ciRunId }));
  await writeFile(publicPath, JSON.stringify(evidence.publicConfig));
  console.log('Official founder receipt and exact review package admitted before deployment credentials.');
} else if (mode === 'ci') {
  await currentCi();
  console.log('Exact main commit has successful canonical CI evidence.');
} else if (mode === 'manifest') {
  const manifest = parseJson<unknown>(required('RELEASE_MANIFEST')); const ciRunId = required('CI_RUN_ID');
  const publicConfig = await admitManifest(manifest, ciRunId);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'manifest.json'), JSON.stringify({ manifest, ciRunId }));
  await writeFile(publicPath, JSON.stringify(publicConfig));
  console.log('Current API/worker, exact migrations, private security and human approval evidence admitted.');
} else if (mode === 'build') {
  const environment = required('RELEASE_ENVIRONMENT'); const target = vercelTarget(environment);
  const pull=await prepareWebCli(['pull', '--yes', `--environment=${target}`]),{publicConfig}=await readmitApproval();
  await pull(async()=>{const admitted=await readmitApproval();return async()=>()=>{requireOriginalWebPackageClock(admitted.prepared);};});
  const downloaded = parseEnv(await readFile(resolve(`.vercel/.env.${target}.local`), 'utf8'));
  const allowed = new Set(['NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'VERCEL_ENV', 'VERCEL_TARGET_ENV', 'VERCEL_URL']);
  if (Object.keys(downloaded).some(key => !allowed.has(key))) throw Error('Web project environment contains unreviewed settings; remove server credentials before build.');
  if (downloaded.NEXT_PUBLIC_API_URL !== publicConfig.apiUrl || downloaded.NEXT_PUBLIC_SUPABASE_URL !== publicConfig.supabaseUrl || downloaded.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY !== publicConfig.supabasePublishableKey) throw Error('Vercel public build settings do not match approved dependency endpoints.');
  const build=await prepareWebCli(['build', ...(target === 'production' ? ['--prod'] : ['--target=preview'])]);await build(async()=>{const admitted=await readmitApproval();return async()=>()=>{requireOriginalWebPackageClock(admitted.prepared);};});
  await writeFile(join(directory, 'artifact.sha256'), await artifactDigest());
  console.log('Prebuilt web output verified against public-only environment and deployment credential exclusion.');
} else if (mode === 'deploy') {
  const target = vercelTarget(required('RELEASE_ENVIRONMENT')); const sourceSha = required('RELEASE_SHA');
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw Error('Invalid release source commit.');
  const args = ['deploy', '--prebuilt', '--yes', '--meta', `cuevoCommitSha=${sourceSha}`, ...(target === 'production' ? ['--prod', '--skip-domain'] : ['--target=preview'])];
  const deploy=await prepareWebCli(args);
  if (await artifactDigest() !== await readFile(join(directory, 'artifact.sha256'), 'utf8')) throw Error('Prebuilt artifact changed after verification.');
  const result = (await deploy(async()=>{if(await artifactDigest()!==await readFile(join(directory,'artifact.sha256'),'utf8'))throw Error('Prebuilt artifact changed after verification.');const admitted=await readmitApproval();return async()=>{if(await artifactDigest()!==await readFile(join(directory,'artifact.sha256'),'utf8'))throw Error('Prebuilt artifact changed during approval.');return()=>{requireOriginalWebPackageClock(admitted.prepared);if(required('RELEASE_SHA')!==sourceSha||vercelTarget(required('RELEASE_ENVIRONMENT'))!==target)throw Error('Prepared Vercel source or environment changed.');};};})).trim(); if (!/^https:\/\/[a-z0-9.-]+\.vercel\.app\/?$/i.test(result)) throw Error('Deployment returned no verified Vercel URL.');
  await writeFile(join(directory, 'deployment.json'), JSON.stringify({ url: result, commitSha: required('RELEASE_SHA') }));
  await writeFile(required('GITHUB_OUTPUT'), `url=${result}\n`, { flag: 'a' });
  console.log('Verified prebuilt artifact uploaded; production domains remain unpromoted.');
} else if (mode === 'verify') {
  await readmitApproval();
  const deployment = await json<{ url: string; commitSha: string }>(join(directory, 'deployment.json'));
  // Re-admit the original evidence at consumption time; a long build must not silently extend its 24-hour validity.
  const evidence = z.object({ manifest: z.unknown(), ciRunId: z.string().regex(/^\d+$/) }).strict().parse(await json<unknown>(join(directory, 'manifest.json')));
  const publicConfig = await admitManifest(evidence.manifest, evidence.ciRunId);
  if (!isDeepStrictEqual(await json<unknown>(publicPath), publicConfig)) throw Error('Admitted release dependencies changed before verification.');
  if (!/^https:\/\/[a-z0-9.-]+\.vercel\.app\/?$/i.test(deployment.url)) throw Error('Invalid Vercel deployment URL.');
  const teamId = required('VERCEL_ORG_ID'); const projectId = required('VERCEL_PROJECT_ID');
  const webDeployment = await inspectDeployment({ projectId, teamId, url: deployment.url });
  if (deployment.commitSha !== required('RELEASE_SHA')) throw Error('Stored deployment receipt names another source commit.');
  if (publicConfig.api.kind === 'vercel') {
    if (publicConfig.api.projectId === projectId) throw Error('API and web must use separate Vercel projects.');
    await inspectDeployment({ projectId: publicConfig.api.projectId, teamId: publicConfig.api.teamId, deploymentId: publicConfig.api.deploymentId, url: publicConfig.api.deploymentUrl });
  }
  let pageHeaders:Record<string,string>={};
  if(vercelTarget(required('RELEASE_ENVIRONMENT'))==='preview'){
    const original=await readmitApproval(),treeSha=execFileSync('git',['rev-parse',required('RELEASE_SHA')+'^{tree}'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],shell:false,env:sourceEnvironment(),timeout:15000,maxBuffer:32*1024*1024}).trim();
    const packageFacts=z.object({releaseSha:z.literal(required('RELEASE_SHA')),preparedAt:z.iso.datetime({offset:true})}).parse(parseCanonicalReleaseReviewJson((original.prepared as {canonicalJson:string}).canonicalJson));
    const binding:ProtectedPreviewBinding={owner:'web',repository:required('GITHUB_REPOSITORY'),releaseSha:required('RELEASE_SHA'),treeSha,runId:required('GITHUB_RUN_ID'),runAttempt:Number(required('GITHUB_RUN_ATTEMPT')),packageSha256:(original.prepared as {sha256:string}).sha256,artifactSha256:await readFile(join(directory,'artifact.sha256'),'utf8'),teamId,projectId,deploymentId:webDeployment.id,origin:new URL(deployment.url).origin};
    const transport=await createProtectedPreview({repoRoot:process.cwd(),binding,vercelToken:required('VERCEL_TOKEN'),approvalExpiresAt:new Date(Date.parse(packageFacts.preparedAt)+24*60*60*1000).toISOString()},{admit:async()=>{await readmitApproval();}});
    if(!['CONFIRMED','NONE'].includes(transport.status))throw Error('Protected staging web transport requires current verification.');
    pageHeaders=await protectedPreviewHeaders({repoRoot:process.cwd(),binding,url:new URL('/',deployment.url).toString(),receipt:transport});
  }
  const page = await fetch(deployment.url, { headers:pageHeaders,redirect:'error',credentials:'omit',cache:'no-store',signal: AbortSignal.timeout(15000) });
  const health = await fetch(`${publicConfig.apiUrl}/health/ready`, { redirect:'error',credentials:'omit',cache:'no-store',signal: AbortSignal.timeout(15000) });
  if (!page.ok || !health.ok) throw Error('Deployed web/API readiness requires review.');
  if (publicConfig.api.kind === 'vercel') console.log('API Vercel team/project/deployment/target/source SHA metadata freshly verified. API artifact hash and custom-origin binding remain reviewed manifest evidence.');
  if (publicConfig.worker.kind === 'container') {
    const workerHealth = await fetch(`${publicConfig.worker.origin}/health/ready`, { signal: AbortSignal.timeout(15000) });
    if (!workerHealth.ok) throw Error('Deployed container worker readiness requires review.');
    console.log('Vercel source SHA/team/project and web/API/container worker readiness verified. Backend image identities remain reviewed manifest attestations; full staged actor/security/AI and domain promotion remain operator gates.');
  } else {
    console.log('Vercel source SHA/team/project and web/API readiness verified. Edge worker security/queue evidence remains admitted attestations within 24 hours; artifact/lock hashes are operator evidence, with no fresh Edge network or source verification. Full staged actor/security/AI and domain promotion remain operator gates.');
  }
  const admitted = await readmitApproval();
  const artifactSha256 = await readFile(join(directory, 'artifact.sha256'), 'utf8');
  if (!/^[a-f0-9]{64}$/.test(artifactSha256) || artifactSha256 !== await artifactDigest()) throw Error('Web artifact changed before verification receipt.');
  const receipt = { version: 1, purpose: 'CUEVO_VERIFIED_WEB_DEPLOYMENT', status: 'WEB_DEPLOYMENT_VERIFIED', repository: required('GITHUB_REPOSITORY'), sourceSha: required('RELEASE_SHA'), ciRunId: required('CI_RUN_ID'), runId: required('GITHUB_RUN_ID'), runAttempt: Number(required('GITHUB_RUN_ATTEMPT')), environment: required('RELEASE_ENVIRONMENT'), teamId, projectId, target: vercelTarget(required('RELEASE_ENVIRONMENT')), deploymentId: webDeployment.id, url: deployment.url,
    artifactSha256, manifestSha256: createHash('sha256').update(canonicalReleaseReviewJson(admitted.manifest)).digest('hex'), reviewSha256: admitted.prepared.sha256, backend: admitted.backend?.backendIdentity ?? null, observedAt: new Date().toISOString(), coreLearningLoopVerified: false, customerReady: false, hostedAcceptance: false };
  await writeFile(join(directory, 'web-deployment-result.json'), canonicalReleaseReviewJson(receipt), { flag: 'wx', mode: 0o600 });
} else if(mode==='bind-staging-origin'){
  const admitted=await readmitApproval();if(!admitted.backend)throw Error('Staging origin requires an admitted completed backend.');
  const receipt=await currentWebDeploymentReceipt(admitted);
  const result=await bindVerifiedStagingWebOrigin({repoRoot:process.cwd(),sourceSha:receipt.sourceSha,ciRunId:receipt.ciRunId,runId:receipt.runId,runAttempt:receipt.runAttempt,web:{teamId:receipt.teamId,projectId:receipt.projectId,target:'preview'},webDeployment:{id:receipt.deploymentId,url:receipt.url,artifactSha256:receipt.artifactSha256},vercelToken:required('VERCEL_TOKEN'),admit:readmitApproval});
  if(result.status!=='WEB_ORIGIN_BOUND'||!result.canonicalReceipt)throw Error('Staging web origin requires current verification.');await readmitApproval();await currentWebDeploymentReceipt(admitted);
} else if(mode==='verify-browser'){
  const admitted=await readmitApproval(),receipt=await currentWebDeploymentReceipt(admitted),selection=readWebBackendSelection(required('BACKEND_SELECTION_BASE64'));if(!selection||!admitted.backend)throw Error('Hosted browser check requires selected completed backend.');
  const result=await verifyHostedBrowserAccess({...selection,repoRoot:process.cwd(),releaseSha:receipt.sourceSha,ciRunId:receipt.ciRunId,web:{teamId:receipt.teamId,projectId:receipt.projectId,target:'preview'},githubToken:required('GH_TOKEN'),vercelToken:required('VERCEL_TOKEN'),syntheticPassword:required('CUEVO_SYNTHETIC_PILOT_PASSWORD'),webDeployment:{id:receipt.deploymentId,url:receipt.url}});
  if(result.status!=='HOSTED_ROLE_ACCESS_VERIFIED'||!result.canonicalReceipt||!result.sessionsClosed)throw Error('Hosted role access requires review; full learning-loop/customer acceptance remains separate.');
  await readmitApproval();await currentWebDeploymentReceipt(admitted);
} else if(mode==='verify-learning-loop'){
  const admitted=await readmitApproval(),receipt=await currentWebDeploymentReceipt(admitted),selection=readWebBackendSelection(required('BACKEND_SELECTION_BASE64'));
  if(!selection||!admitted.backend)throw Error('Hosted learning-loop verification requires the original completed backend.');
  const population=admitted.backend.originalEvidence.filter(row=>row.name==='population-result.json');
  if(population.length!==1)throw Error('Original synthetic population evidence is unavailable.');
  const readmitWeb=async():Promise<HostedLearningLoopWebAdmission>=>{
    const current=await readmitApproval(),deployment=await currentWebDeploymentReceipt(current);
    if(!current.backend||deployment.deploymentId!==receipt.deploymentId||deployment.artifactSha256!==receipt.artifactSha256||current.backend.originalEvidence.filter(row=>row.name==='population-result.json'&&row.sha256===population[0].sha256).length!==1)throw Error('Hosted learning-loop source or population evidence changed.');
    const publicConfig=z.object({publicConfig:z.object({apiUrl:z.string().url(),supabaseUrl:z.string().url()})}).parse(current.manifest).publicConfig;
    return{purpose:'PREBUILD_RELEASE_ADMISSION',sourceSha:deployment.sourceSha,treeSha:current.backend.backendIdentity.treeSha,ciRunId:deployment.ciRunId,runId:deployment.runId,runAttempt:deployment.runAttempt,webDeploymentId:deployment.deploymentId,artifactSha256:deployment.artifactSha256,packageSha256:current.prepared.sha256,webPackageExpiresAt:new Date(Date.parse(z.object({preparedAt:z.iso.datetime({offset:true})}).parse(parseCanonicalReleaseReviewJson(current.prepared.canonicalJson)).preparedAt)+86400000).toISOString(),backendTransferSha256:current.backend.backendIdentity.transferSha256,populationReceiptSha256:population[0].sha256,apiOrigin:publicConfig.apiUrl,authOrigin:publicConfig.supabaseUrl,webOrigin:current.backend.backendIdentity.web.origin,observedAt:new Date().toISOString()};
  };
  const result=await verifyHostedLearningLoop({...selection,repoRoot:process.cwd(),releaseSha:receipt.sourceSha,ciRunId:receipt.ciRunId,web:{teamId:receipt.teamId,projectId:receipt.projectId,target:'preview'},webDeployment:{id:receipt.deploymentId,url:receipt.url},populationReceiptSha256:population[0].sha256,selectedActorIds:{admin:'20000000-0000-4000-8000-000000000001',coordinator:'20000000-0000-4000-8000-000000000002',teacher:'20000000-0000-4000-8000-000000000004',student:'20000000-0000-4000-8000-000000000012',parent:'20000000-0000-4000-8000-000000000072'},githubToken:required('GH_TOKEN'),vercelToken:required('VERCEL_TOKEN'),syntheticPassword:required('CUEVO_SYNTHETIC_PILOT_PASSWORD')},{readmitWeb});
  if(result.status!=='UI_LOOP_VERIFIED'||!result.canonicalReceipt||!result.sessionsClosed)throw Error('Hosted learning-loop UI verification requires review; persisted native proof remains separate.');
  await readmitWeb();
} else throw Error('Expected context, ci, controls, prepare, approval, manifest, build, deploy, verify, bind-staging-origin, verify-browser or verify-learning-loop release operation.');
