import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalReleaseReviewJson, prepareReleaseReviewPackage } from './release-review';

test('generated Vercel files remain outside authored source while a new source file remains reviewable',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'cuevo-release-ignore-'));
 try{await writeFile(join(folder,'.gitignore'),await readFile('.gitignore','utf8'));const init=spawnSync('git',['init','-q'],{cwd:folder,encoding:'utf8'});assert.equal(init.status,0);
 const run=(args:string[])=>spawnSync('git',args,{cwd:folder,encoding:'utf8'});
 await mkdir(join(folder,'.vercel/output/static'),{recursive:true});await writeFile(join(folder,'.vercel/project.json'),'{}');await writeFile(join(folder,'.vercel/output/static/index.html'),'<p>Build output</p>');await writeFile(join(folder,'new-source.ts'),'export const current=true;');
 assert.equal(run(['check-ignore','.vercel/project.json','.vercel/output/static/index.html']).status,0);const current=run(['ls-files','--others','--exclude-standard']);assert.equal(current.status,0);assert.doesNotMatch(current.stdout,/\.vercel/);assert.match(current.stdout,/new-source\.ts/);
 }finally{assert.equal(dirname(folder),resolve(tmpdir()));assert.ok(basename(folder).startsWith('cuevo-release-ignore-'));await rm(folder,{recursive:true,force:true});}
});

const sha = 'a'.repeat(40), baseSha = 'b'.repeat(40), digest = 'c'.repeat(64);
const now = Date.parse('2026-10-06T12:00:00Z');
const migration = '-- synthetic release process migration\n';
// Non-UTF-8 Git path bytes must retain their source identity rather than decode to replacement characters.
const tree = Buffer.concat([Buffer.from('100644 blob ' + digest.slice(0, 40) + '\t'), Buffer.from([0xff]), Buffer.from('\0')]);
const diff = Buffer.from('diff --git a/source.ts b/source.ts\n+source\n');
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
type Mode = 'prepare' | 'approval' | 'build' | 'deploy' | 'verify' | 'bind-staging-origin' | 'verify-browser' | 'verify-learning-loop';
type Injection = {
  at?: number; environmentId?: number; runAttempt?: number; currentSha?: string; ciConclusion?: string;
  approval?: 'missing' | 'generic' | 'rejected' | 'duplicate' | 'wrong-founder' | 'malformed';
  unavailable?: string; invalidJson?: string; treeChanged?: boolean; diffChanged?: boolean;
  dirty?: boolean; untracked?: boolean; ancestorDenied?: boolean; controlsChanged?: boolean;
  afterSourceStream?: 'dirty' | 'untracked';
  afterPull?: 'main' | 'controls' | 'expiry'|'owner'|'bridge'; pullPublicChanged?: boolean;
  backendBridge?: 'missing' | 'changed';
  stagingConsumerFailure?: boolean;
  apiSameProject?:boolean;
  fullProofChanged?: boolean;
  repositoryOwner?:'User'|'Organization'|'Bot';repositoryName?:string;repositoryUnavailable?:boolean;bypassMetadata?:'omitted'|'null'|'unsafe';
};

function fixtureManifest(environment: 'staging' | 'production') {
  return {
    version: 2, environment, commitSha: sha, ciRunId: '42', verifiedAt: '2026-10-06T11:00:00Z',
    api: { origin: 'https://api.stage.example.com', commitSha: sha, imageDigest: `sha256:${digest}`, healthVerified: true, evidenceUrl: 'https://github.com/owner/repo/actions/runs/41' },
    worker: { kind: 'container', origin: 'https://worker.stage.example.com', commitSha: sha, imageDigest: `sha256:${digest}`, healthVerified: true, evidenceUrl: 'https://github.com/owner/repo/actions/runs/41' },
    database: {
      projectRef: 'stageproject', migrations: [{ version: '20261006000000', sha256: hash(migration) }],
      grantsVerified: true, rlsVerified: true, privateStorageVerified: true, privateRealtimeVerified: true, recoveryVerified: true,
      evidenceUrl: 'https://github.com/owner/repo/actions/runs/41',
      dataApi: { state: 'DISABLED', projectRef: 'stageproject', commitSha: sha, verifiedAt: '2026-10-06T11:00:00Z', configurationVerified: true, anonymousRestDenied: true, authenticatedRestDenied: true, serviceRestDenied: true, graphqlDenied: true, rpcDenied: true, evidenceUrl: 'https://github.com/owner/repo/actions/runs/41' },
    },
    approval: { reviewer: 'school-owner', basis: environment === 'staging' ? 'SYNTHETIC_STAGING' : 'PRODUCTION_APPROVED', evidenceUrl: 'https://github.com/owner/repo/issues/3' },
    publicConfig: { apiUrl: 'https://api.stage.example.com', supabaseUrl: 'https://stageproject.supabase.co', supabasePublishableKey: 'sb_publishable_public-only-value' },
  };
}

async function withFixture(run: (fixture: Awaited<ReturnType<typeof createFixture>>) => Promise<void>, environment: 'staging' | 'production' = 'staging', bridge = false) {
  const fixture = await createFixture(environment, bridge);
  try { await run(fixture); }
  finally {
    assert.equal(dirname(fixture.directory), resolve(tmpdir()));
    assert.ok(basename(fixture.directory).startsWith('cuevo-release-process-'));
    await rm(fixture.directory, { recursive: true, force: true });
  }
}

async function createFixture(environment: 'staging' | 'production', bridgeEnabled = false) {
  const directory = await mkdtemp(join(tmpdir(), 'cuevo-release-process-'));
  await mkdir(join(directory, 'supabase/migrations'), { recursive: true });
  await writeFile(join(directory, 'supabase/migrations/20261006000000_process.sql'), migration);
  const manifest = fixtureManifest(environment);
  const reviews = (['source-spec-code', 'qa-regression-operations'] as const).map((category, index) => ({
    category, taskId: `/root/independent_${index}`, releaseSha: sha, baseSha, sourceManifestSha256: hash(tree), diffSha256: hash(diff),
    reportSha256: String(index + 1).repeat(64), evidenceSha256: String(index + 3).repeat(64), reviewedAt: '2026-10-06T11:00:00Z',
    provenance: 'RETAINED_INDEPENDENT_AGENT_REPORT' as const, independenceAttested: true as const,
  }));
  const assignments = { baseSha, reviews: reviews.map(({ category, taskId, reportSha256, evidenceSha256 }) => ({ category, taskId, reportSha256, evidenceSha256 })) };
  const web = { teamId: 'team_cuevo', projectId: 'prj_cuevo', target: environment === 'staging' ? 'preview' as const : 'production' as const };
  const fullVerification=environment==='production'?{runId:'84',runAttempt:1,sourceSha:sha,summarySha256:digest,jobsSha256:digest}:undefined;
  const canonicalRuntimeVerification={runAttempt:2,jobsSha256:digest};
  const review = { version: 1 as const, repository: 'owner/repo', releaseSha: sha, baseSha, ciRunId: '42', canonicalRuntimeVerification,web,...(fullVerification?{fullVerification}:{}), manifestSha256: hash(canonicalReleaseReviewJson(manifest)), sourceManifestSha256: hash(tree), diffSha256: hash(diff), reviews };
  const prepared = prepareReleaseReviewPackage(review, { repository: review.repository, releaseSha: sha, baseSha, ciRunId: '42', canonicalRuntimeVerification,web,...(fullVerification?{fullVerification}:{}), manifestSha256: review.manifestSha256, sourceManifestSha256: review.sourceManifestSha256, diffSha256: review.diffSha256, releaseRunId: '51', runAttempt: 1, environmentId: 123, environmentName: environment, now, reviews: assignments.reviews });
  const bridge = { purpose: 'COMPLETED_BACKEND_WEB_HANDOVER_CONSUMPTION', provenance: 'OFFICIAL_COMPLETED_GITHUB_ARTIFACT_AND_VERIFIED_GIT_SOURCE', manifest, publicConfig: manifest.publicConfig,
    reviewFacts: reviews.map(row => ({ category: row.category, taskId: row.taskId, releaseSha: row.releaseSha, baseSha: row.baseSha, sourceManifestSha256: row.sourceManifestSha256, diffSha256: row.diffSha256, reportSha256: row.reportSha256, evidenceSha256: row.evidenceSha256, reviewedAt: row.reviewedAt, treeSha: 'd'.repeat(40) })), assignments: assignments.reviews,
    originalEvidence: [{name:'population-result.json',sha256:digest}],
    backendIdentity: { repository: 'owner/repo', sourceSha: sha, treeSha:'d'.repeat(40), baseSha, ciRunId: '42', manifestSha256: review.manifestSha256, transferSha256:digest, web: { ...web, origin: 'https://cuevo-beta.vercel.app' } },
    privateProofReexecuted: false, backendMutationAllowed: false, customerReady: false, hostedAcceptance: false };
  const bridgeSelection = Buffer.from(canonicalReleaseReviewJson({ backendRunId: '61', backendRunAttempt: 1, artifactId: '71', transferSha256: digest })).toString('base64');
  const env = {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
    GITHUB_REPOSITORY: 'owner/repo', GITHUB_SHA: sha, GITHUB_REF: 'refs/heads/main', GITHUB_RUN_ID: '51', GITHUB_RUN_ATTEMPT: '1',
    GH_TOKEN: 'synthetic-github-token', CI_RUN_ID: '42', RELEASE_SHA: sha, RELEASE_ENVIRONMENT: environment,...(environment==='production'?{FULL_VERIFICATION_RUN_ID:'84'}:{}),
    VERCEL_ORG_ID: 'team_cuevo', VERCEL_PROJECT_ID: 'prj_cuevo',
    GITHUB_OUTPUT: join(directory, 'output.txt'), GITHUB_STEP_SUMMARY: join(directory, 'summary.md'),
    CUEVO_RELEASE_REVIEW_INPUT_JSON: canonicalReleaseReviewJson({ manifest, review }),
    CUEVO_RELEASE_REVIEW_ASSIGNMENTS_JSON: canonicalReleaseReviewJson(assignments),
    RELEASE_MANIFEST: canonicalReleaseReviewJson(manifest), RELEASE_ENVIRONMENT_ID: '123',
    REVIEW_BASE64: prepared.base64, REVIEW_DIGEST: prepared.sha256,
    ...(bridgeEnabled ? { BACKEND_SELECTION_BASE64: bridgeSelection, BACKEND_MANIFEST_BASE64: Buffer.from(canonicalReleaseReviewJson(manifest)).toString('base64'), BACKEND_BRIDGE_BASE64: Buffer.from(canonicalReleaseReviewJson(bridge)).toString('base64'), CUEVO_CONTROLLED_BRIDGE_JSON: canonicalReleaseReviewJson(bridge) } : {}),
  };
  const execute = (mode: Mode, injection: Injection = {}, extra: Record<string, string> = {}) => {
    const script = `
      import child from 'node:child_process';
      import { syncBuiltinESMExports } from 'node:module';
      import { mkdirSync, writeFileSync } from 'node:fs';
      import { dirname, resolve } from 'node:path';
      const state = ${JSON.stringify(injection)};
      const manifest = ${JSON.stringify(manifest)};
      if(state.apiSameProject)manifest.api={kind:'vercel',origin:manifest.api.origin,commitSha:manifest.commitSha,projectId:'prj_cuevo',teamId:'team_cuevo',deploymentId:'dpl_cuevoApi',deploymentUrl:'https://cuevo-api-build.vercel.app',target:'${environment==='staging'?'preview':'production'}',artifactSha256:'${digest}',metadataVerified:true,healthVerified:true,evidenceUrl:manifest.api.evidenceUrl};
      const originalTree = Buffer.from(${JSON.stringify(tree.toString('base64'))}, 'base64');
      const originalDiff = Buffer.from(${JSON.stringify(diff.toString('base64'))}, 'base64');
      globalThis.cuevoControlledSourceDiff = async()=>{if(state.afterSourceStream==='dirty')state.dirty=true;if(state.afterSourceStream==='untracked')state.untracked=true;const bytes=state.diffChanged?Buffer.from('changed diff'):originalDiff;return{sha256:(await import('node:crypto')).createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};};
      let pulled = false;
      globalThis.cuevoControlledBridgeRead = async()=>{ console.log('BRIDGE_REIMPORT'); if(state.backendBridge==='missing')throw Error('Missing exact artifact');const result=JSON.parse(process.env.CUEVO_CONTROLLED_BRIDGE_JSON); if(state.backendBridge==='changed'||pulled&&state.afterPull==='bridge')result.backendIdentity.manifestSha256='0'.repeat(64);return{...result,observedAt:new Date(Date.now()).toISOString()}; };
      globalThis.cuevoControlledOrigin = async input=>{ console.log('STAGING_ORIGIN_CONSUMER');if(input.vercelToken!==process.env.VERCEL_TOKEN||input.webDeployment.id!=='dpl_cuevo'||input.sourceSha!==process.env.RELEASE_SHA)throw Error('Incorrect staging origin identity');await input.admit();return{status:state.stagingConsumerFailure?'REQUIRES_REVIEW':'WEB_ORIGIN_BOUND',canonicalReceipt:'{}',hostedAcceptance:false};};
      globalThis.cuevoControlledBrowser = async input=>{ console.log('STAGING_BROWSER_CONSUMER');if(input.vercelToken!==process.env.VERCEL_TOKEN||input.syntheticPassword!==process.env.CUEVO_SYNTHETIC_PILOT_PASSWORD||input.webDeployment.id!=='dpl_cuevo')throw Error('Incorrect browser identity');return{status:state.stagingConsumerFailure?'REQUIRES_REVIEW':'HOSTED_ROLE_ACCESS_VERIFIED',canonicalReceipt:'{}',sessionsClosed:true,hostedAcceptance:false};};
      globalThis.cuevoControlledLearningLoop = async(input,ports)=>{console.log('STAGING_LEARNING_LOOP_CONSUMER');if(input.vercelToken!==process.env.VERCEL_TOKEN||input.syntheticPassword!==process.env.CUEVO_SYNTHETIC_PILOT_PASSWORD||input.webDeployment.id!=='dpl_cuevo'||input.populationReceiptSha256!=='${digest}')throw Error('Incorrect learning loop identity');const tuple=await ports.readmitWeb();if(tuple.webDeploymentId!=='dpl_cuevo'||tuple.populationReceiptSha256!==input.populationReceiptSha256||tuple.sourceSha!==input.releaseSha)throw Error('Current web tuple mismatch');return{status:state.stagingConsumerFailure?'REQUIRES_REVIEW':'UI_LOOP_VERIFIED',canonicalReceipt:'{}',sessionsClosed:true,hostedAcceptance:false};};
      globalThis.cuevoControlledFullEvidence=async input=>{console.log('FULL_CANDIDATE_EVIDENCE');if(state.ciConclusion&&state.ciConclusion!=='success')throw Error('Full candidate refused');return{profile:'CUSTOMER_CANDIDATE',sourceSha:input.sha,treeSha:'d'.repeat(40),runId:input.ciRunId,runAttempt:1,artifactId:71,artifactSha256:'${digest}',summarySha256:'${digest}',jobsSha256:state.fullProofChanged?'0'.repeat(64):'${digest}'};};
      (await import('node:module')).registerHooks({load(url,context,next){if(url.endsWith('/canonical-runtime-jobs.ts'))return{format:'module',shortCircuit:true,source:'export async function readCanonicalRuntimeJobs(){return{runAttempt:2,jobsSha256:"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"};}'};if(url.endsWith('/full-release-evidence.ts'))return{format:'module',shortCircuit:true,source:'export const readFullReleaseEvidence=globalThis.cuevoControlledFullEvidence;export function validateProductionCiRun(value,expected){if(value.path!==".github/workflows/full-regression.yml"||value.event!=="workflow_dispatch"||value.head_sha!==expected.sha||value.conclusion!=="success")throw Error("Wrong full workflow");}'};if(url.endsWith('/protected-preview.ts'))return{format:'module',shortCircuit:true,source:'export async function createProtectedPreview(input,ports){if(input.binding.origin!=="https://cuevo-build.vercel.app"||input.binding.owner!=="web")throw Error("Wrong protected web binding");await ports.admit();return{status:"CONFIRMED"};}export async function protectedPreviewHeaders(input){if(input.binding.origin!==new URL(input.url).origin)throw Error("Foreign preview");return{"x-vercel-protection-bypass":"private-web-gateway-canary"};}'};if(url.endsWith('/backend-hosted-learning-loop.ts'))return{format:'module',shortCircuit:true,source:'export const verifyHostedLearningLoop=globalThis.cuevoControlledLearningLoop;'};if(url.endsWith('/git-source-digest.ts'))return{format:'module',shortCircuit:true,source:'export const readGitBinaryDiffDigest=globalThis.cuevoControlledSourceDiff;'};if(url.endsWith('/backend-web-transfer-admission.ts'))return{format:'module',shortCircuit:true,source:'export async function readCompletedBackendWebTransferAdmission(){return globalThis.cuevoControlledBridgeRead();}'};if(url.endsWith('/web-staging-origin.ts'))return{format:'module',shortCircuit:true,source:'export const bindVerifiedStagingWebOrigin=globalThis.cuevoControlledOrigin;'};if(url.endsWith('/backend-hosted-browser.ts'))return{format:'module',shortCircuit:true,source:'export const verifyHostedBrowserAccess=globalThis.cuevoControlledBrowser;'};return next(url,context);}});
      Object.defineProperty(process, 'platform', { value: 'linux' });
      Date.now = () => state.at ?? (pulled && state.afterPull === 'expiry' ? ${now + 86400000} : ${now});
      const FixedDate = Date; globalThis.Date = class extends FixedDate { constructor(value) { super(value === undefined ? Date.now() : value); } static now(){return state.at ?? (pulled && state.afterPull === 'expiry' ? ${now + 86400000} : ${now});} };
      process.argv[2] = ${JSON.stringify(mode)};
      if(state.apiSameProject){const input=JSON.parse(process.env.CUEVO_RELEASE_REVIEW_INPUT_JSON);input.manifest=manifest;process.env.CUEVO_RELEASE_REVIEW_INPUT_JSON=(await import(${JSON.stringify(pathToFileURL(resolve('scripts/verification/release-review.ts')).href)})).canonicalReleaseReviewJson(input);process.env.RELEASE_MANIFEST=(await import(${JSON.stringify(pathToFileURL(resolve('scripts/verification/release-review.ts')).href)})).canonicalReleaseReviewJson(manifest);}
      child.execFileSync = (binary, args, options) => {
        if (binary === 'git') {
          console.log('GIT ' + JSON.stringify(args));
          if (options.shell !== false) throw Error('Git shell is forbidden');
          if (options.env?.VERCEL_TOKEN || options.env?.GH_TOKEN || options.env?.DATABASE_URL) throw Error('Git credential scope crossed');
          if (options.env?.GIT_NO_REPLACE_OBJECTS !== '1' || options.timeout !== 15000 || options.maxBuffer !== 32 * 1024 * 1024) throw Error('Source command bounds missing');
          if (args[0] === 'rev-parse' && args.length === 2) return '${sha}\\n';
          if (args[0] === 'rev-parse' && args[1] === '--verify') return '${baseSha}\\n';
          if (args[0] === 'merge-base') { if (state.ancestorDenied) throw Error('Not ancestor'); return ''; }
          if (args[0] === 'diff' && args[1] === '--quiet') { if (state.dirty) throw Error('Dirty checkout'); return ''; }
          if (args[0] === 'ls-files') return state.untracked ? 'unreviewed.ts\\n' : '';
          const value = args[0] === 'ls-tree' ? (state.treeChanged ? Buffer.from('changed tree') : originalTree) : (state.diffChanged ? Buffer.from('changed diff') : originalDiff);
          return options.encoding === 'utf8' ? value.toString('utf8') : value;
        }
        if (binary !== 'vercel' || options.shell !== false) throw Error('Unexpected executable');
        if (args.includes(process.env.VERCEL_TOKEN) || options.env.DATABASE_URL || options.env.GH_TOKEN) throw Error('Credential scope crossed');
        console.log('SINK ' + JSON.stringify(args));
        if (args[0] === 'pull') {
          const target = '${environment === 'staging' ? 'preview' : 'production'}';
          const path = resolve('.vercel/.env.' + target + '.local'); mkdirSync(dirname(path), { recursive: true });
          writeFileSync(path, 'NEXT_PUBLIC_API_URL=' + (state.pullPublicChanged ? 'https://changed.example.com' : manifest.publicConfig.apiUrl) + '\\nNEXT_PUBLIC_SUPABASE_URL=' + manifest.publicConfig.supabaseUrl + '\\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=' + manifest.publicConfig.supabasePublishableKey + '\\n');
          pulled = true; return '';
        }
        if (args[0] === 'build') { mkdirSync(resolve('.vercel/output/static'), { recursive: true }); writeFileSync(resolve('.vercel/output/static/index.html'), '<p>synthetic build</p>'); return ''; }
        if (args[0] === 'deploy') return 'https://cuevo-build.vercel.app\\n';
        throw Error('Unexpected Vercel operation');
      };
      syncBuiltinESMExports();
      globalThis.fetch = async (input,options={}) => {
        const url = String(input); console.log('FETCH ' + url);
        const previewHeader=new Headers(options.headers).get('x-vercel-protection-bypass');
        if(url==='https://cuevo-build.vercel.app'&&'${environment}'==='staging'){if(previewHeader!=='private-web-gateway-canary')return new Response('Vercel authentication required',{status:401});}
        else if(previewHeader)throw Error('Preview credential leaked outside immutable web origin');
        if(url==='https://api.github.com/repos/owner/repo'){if(state.repositoryUnavailable)return new Response('PRIVATE_RESPONSE_SENTINEL',{status:403});return Response.json({full_name:state.repositoryName??'owner/repo',name:'repo',owner:{id:1,login:'owner',type:pulled&&state.afterPull==='owner'?'Organization':state.repositoryOwner??'Organization'}});}
        if (state.unavailable && url.endsWith(state.unavailable)) return new Response('PRIVATE_RESPONSE_SENTINEL', { status: 403 });
        if (state.invalidJson && url.endsWith(state.invalidJson)) return new Response('PRIVATE_RESPONSE_SENTINEL');
        if (url.endsWith('/actions/runs/42')) return Response.json({ id: 42, head_sha: '${sha}', head_branch: 'main', event: 'push', status: 'completed', conclusion: state.ciConclusion ?? 'success', path: '.github/workflows/ci.yml', repository: { full_name: 'owner/repo' } });
        if (url.endsWith('/git/ref/heads/main')) return Response.json({ object: { type: 'commit', sha: state.currentSha ?? (pulled && state.afterPull === 'main' ? '${baseSha}' : '${sha}') } });
        if (url.endsWith('/environments/${environment}')) return Response.json({ id: state.environmentId ?? 123, name: '${environment}', can_admins_bypass: state.controlsChanged || (pulled && state.afterPull === 'controls') ? true : false, protection_rules: [{ type: 'required_reviewers', prevent_self_review: false, reviewers: [{ type: 'User', reviewer: { id: 95836629, login: 'attaulhaq0', type: 'User' } }] }, { type: 'branch_policy' }], deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } });
        if (url.endsWith('/deployment-branch-policies')) return Response.json({ total_count: 1, branch_policies: [{ name: 'main', type: 'branch' }] });
        if (url.endsWith('/branches/main/protection')) return Response.json({ enforce_admins: { enabled: true }, required_status_checks: { strict: true, contexts: ['required'] }, allow_force_pushes: { enabled: false }, allow_deletions: { enabled: false }, required_pull_request_reviews: { dismiss_stale_reviews: true, require_code_owner_reviews: false, required_approving_review_count: 0, require_last_push_approval: false, ...(state.bypassMetadata==='omitted'?{}:{bypass_pull_request_allowances:state.bypassMetadata==='null'?null:{ users: state.bypassMetadata==='unsafe'?[{id:1}]:[], teams: [], apps: [] }}) } });
        if (url.endsWith('/required_signatures')) return Response.json({ enabled: true });
        if (url.endsWith('/actions/runs/51')) return Response.json({ id: 51, run_attempt: state.runAttempt ?? 1, repository: { full_name: 'owner/repo' }, head_sha: '${sha}', head_branch: 'main', path: '.github/workflows/release.yml', event: 'workflow_dispatch', status: 'in_progress', conclusion: null });
        if (url.endsWith('/actions/runs/51/approvals')) {
          const entry = { environments: [{ id: 123, name: '${environment}' }], state: state.approval === 'rejected' ? 'rejected' : 'approved', user: { id: state.approval === 'wrong-founder' ? 1 : 95836629, login: 'attaulhaq0', type: 'User' }, comment: state.approval === 'generic' ? 'Ship it' : ${JSON.stringify(prepared.comment)} };
          return Response.json(state.approval === 'missing' ? [] : state.approval === 'duplicate' ? [entry, entry] : state.approval === 'malformed' ? { private: 'PRIVATE_RESPONSE_SENTINEL' } : [entry]);
        }
        if (url.startsWith('https://api.vercel.com/')) { console.log('PROVIDER metadata'); return Response.json({ id: 'dpl_cuevo', projectId: 'prj_cuevo', ownerId: 'team_cuevo', url: 'cuevo-build.vercel.app', readyState: 'READY', target: ${environment === 'staging' ? 'null' : "'production'"}, meta: { cuevoCommitSha: '${sha}' } }); }
        if (['https://cuevo-build.vercel.app', 'https://api.stage.example.com/health/ready', 'https://worker.stage.example.com/health/ready'].includes(url)) { console.log('PROVIDER readiness'); return new Response(null, { status: 200 }); }
        throw Error('Unexpected network request');
      };
      await import(${JSON.stringify(pathToFileURL(resolve('scripts/verification/cicd-release.ts')).href)});
    `;
    const providerEnv = ['build', 'deploy', 'verify','bind-staging-origin','verify-browser','verify-learning-loop'].includes(mode) ? { VERCEL_TOKEN: 'synthetic-vercel-token', VERCEL_ORG_ID: 'team_cuevo', VERCEL_PROJECT_ID: 'prj_cuevo', DATABASE_URL: 'PRIVATE_DATABASE_SENTINEL',...['verify-browser','verify-learning-loop'].includes(mode)?{CUEVO_SYNTHETIC_PILOT_PASSWORD:'synthetic-private-pilot-password'}:{} } : {};
    const result = spawnSync(process.execPath, ['--import', pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href, '--input-type=module', '--eval', script], { cwd: directory, env: { ...env, ...providerEnv, ...extra }, encoding: 'utf8', timeout: 20000 });
    assert.equal(result.error, undefined, String(result.error));
    for (const sentinel of ['synthetic-vercel-token', 'PRIVATE_DATABASE_SENTINEL', 'PRIVATE_RESPONSE_SENTINEL']) assert.equal((result.stdout + result.stderr).includes(sentinel), false, 'private responses and credentials stay withheld');
    return result;
  };
  const changeSaved = async (name: string, edit: (value: Record<string, unknown>) => void) => {
    const path = join(directory, '.local/cicd-release', name);
    const value = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>; edit(value); await writeFile(path, JSON.stringify(value));
  };
  return { directory, manifest, review, assignments, prepared, execute, changeSaved };
}

function passed(result: ReturnType<Awaited<ReturnType<typeof createFixture>>['execute']>) { assert.equal(result.status, 0, result.stderr); }
function noProvider(result: ReturnType<Awaited<ReturnType<typeof createFixture>>['execute']>) {
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.doesNotMatch(result.stdout, /SINK |PROVIDER |FETCH https:\/\/api\.vercel\.com/);
}

test('prepare computes exact raw Git source and diff digests and publishes a bounded same-run package before any provider credential', async () => {
  await withFixture(async fixture => {
    passed(fixture.execute('prepare'));
    const output = await readFile(join(fixture.directory, 'output.txt'), 'utf8');
    assert.equal(output, `review-base64=${fixture.prepared.base64}\nreview-digest=${fixture.prepared.sha256}\nenvironment-id=123\n`);
    assert.ok(Buffer.byteLength(output) <= 64 * 1024 + 256);
    const summary = await readFile(join(fixture.directory, 'summary.md'), 'utf8');
    assert.ok(summary.includes(fixture.prepared.comment)); assert.ok(summary.includes('operator-attested independent review digests'));
    const token = fixture.execute('prepare', {}, { VERCEL_TOKEN: 'synthetic-vercel-token' }); noProvider(token); assert.doesNotMatch(token.stdout, /FETCH |GIT /);
  });
});

test('prepare refuses dirty, untracked, non-ancestor or changed source and independently assigned report evidence', async () => {
  await withFixture(async fixture => {
    for (const injection of [{ dirty: true }, { untracked: true }, { ancestorDenied: true }, { treeChanged: true }, { diffChanged: true }]) noProvider(fixture.execute('prepare', injection));
    const assignments = { ...fixture.assignments, reviews: fixture.assignments.reviews.map((item, index) => index === 0 ? { ...item, taskId: '/root/substituted' } : item) };
    noProvider(fixture.execute('prepare', {}, { CUEVO_RELEASE_REVIEW_ASSIGNMENTS_JSON: canonicalReleaseReviewJson(assignments) }));
    noProvider(fixture.execute('prepare', {}, { CUEVO_RELEASE_REVIEW_INPUT_JSON: JSON.stringify({ manifest: fixture.manifest, review: fixture.review }) }));
    noProvider(fixture.execute('prepare', {}, { VERCEL_PROJECT_ID: 'prj_changed' }));
  });
});

test('credential-free official founder approval is admitted and the complete provider sequence revalidates before consumption', async () => {
  await withFixture(async fixture => {
    const approval = fixture.execute('approval'); passed(approval); assert.doesNotMatch(approval.stdout, /SINK |PROVIDER /);
    const saved = JSON.parse(await readFile(join(fixture.directory, '.local/cicd-release/review.json'), 'utf8'));
    assert.equal(saved.receipt.packageSha256, fixture.prepared.sha256); assert.equal(saved.receipt.founderId, 95836629);
    const build = fixture.execute('build'); passed(build); assert.match(build.stdout, /SINK \["pull"/); assert.match(build.stdout, /SINK \["build"/);
    assert.ok(build.stdout.indexOf('/approvals') < build.stdout.indexOf('SINK'));
    const deploy = fixture.execute('deploy'); passed(deploy); assert.match(deploy.stdout, /"--prebuilt"/); assert.doesNotMatch(deploy.stdout, /"promote"|"alias"/);
    const verify = fixture.execute('verify'); passed(verify); assert.ok(verify.stdout.indexOf('/approvals') < verify.stdout.indexOf('PROVIDER'));
    const deployment = JSON.parse(await readFile(join(fixture.directory, '.local/cicd-release/web-deployment-result.json'), 'utf8'));
    assert.equal(deployment.status, 'WEB_DEPLOYMENT_VERIFIED'); assert.equal(deployment.deploymentId, 'dpl_cuevo'); assert.equal(deployment.sourceSha, sha); assert.equal(deployment.coreLearningLoopVerified, false);
    assert.doesNotMatch(JSON.stringify(deployment), /synthetic-vercel-token|PRIVATE_DATABASE_SENTINEL/);
  });
});

test('production re-admits one immutable full-candidate proof and refuses changed evidence before provider upload', async () => {
  await withFixture(async fixture => {
    const approved = fixture.execute('approval'); passed(approved); assert.match(approved.stdout, /FULL_CANDIDATE_EVIDENCE/);
    const saved = JSON.parse(await readFile(join(fixture.directory, '.local/cicd-release/full-release-proof.json'), 'utf8'));
    assert.equal(saved.profile, 'CUSTOMER_CANDIDATE'); assert.equal(saved.runId, '84');
    const refused = fixture.execute('build', { fullProofChanged: true }); noProvider(refused); assert.match(refused.stderr, /evidence changed/);
  }, 'production');
});

test('actual staging wrapper reimports completed bridge at every boundary while keeping its separate web approval', async () => {
  await withFixture(async fixture => {
    const preparation = fixture.execute('prepare'); passed(preparation); assert.match(preparation.stdout, /BRIDGE_REIMPORT/);
    const output = await readFile(join(fixture.directory, 'output.txt'), 'utf8'); assert.match(output, /backend-manifest-base64=/); assert.match(output, /backend-bridge-base64=/);
    const approval = fixture.execute('approval'); passed(approval); assert.match(approval.stdout, /BRIDGE_REIMPORT/); assert.doesNotMatch(approval.stdout, /SINK |PROVIDER /);
    const build = fixture.execute('build'); passed(build); assert(build.stdout.split('BRIDGE_REIMPORT').length >= 3);
    const deploy = fixture.execute('deploy'); passed(deploy); assert.match(deploy.stdout, /BRIDGE_REIMPORT/);
    const verify = fixture.execute('verify'); passed(verify); assert.match(verify.stdout, /BRIDGE_REIMPORT/);
    const receipt = JSON.parse(await readFile(join(fixture.directory, '.local/cicd-release/web-deployment-result.json'), 'utf8'));
    assert.equal(receipt.backend.sourceSha, sha); assert.equal(receipt.deploymentId, 'dpl_cuevo'); assert.equal(receipt.customerReady, false);
  }, 'staging', true);
});

test('source changes during streamed diff verification prevent provider consumption', async () => {
  await withFixture(async fixture => {
    for (const afterSourceStream of ['dirty', 'untracked'] as const) {
      const preparation = fixture.execute('prepare', { afterSourceStream });
      assert.notEqual(preparation.status, 0);
      assert.doesNotMatch(preparation.stdout, /SINK |PROVIDER /);
    }
  });
});

test('missing or changed completed bridge never falls back to supplied manifest and drift after pull prevents build', async () => {
  await withFixture(async fixture => {
    for (const backendBridge of ['missing', 'changed'] as const) { noProvider(fixture.execute('approval', { backendBridge })); noProvider(fixture.execute('prepare', { backendBridge })); }
    passed(fixture.execute('approval'));
    const failed = fixture.execute('build', { afterPull: 'bridge' }); assert.equal(failed.status, 1); assert.match(failed.stdout, /SINK \["pull"/); assert.doesNotMatch(failed.stdout, /SINK \["build"/);
    noProvider(fixture.execute('deploy', { backendBridge: 'missing' }));
  }, 'staging', true);
});

test('orphaned backend evidence outputs cannot bypass selection admission into the legacy manifest path', async () => {
  await withFixture(async fixture => { noProvider(fixture.execute('approval', {}, { BACKEND_BRIDGE_BASE64: Buffer.from('{}').toString('base64') })); });
});

test('approval refuses missing, wrong, ambiguous or unavailable official founder evidence without provider consumption', async () => {
  await withFixture(async fixture => {
    for (const approval of ['missing', 'generic', 'rejected', 'duplicate', 'wrong-founder', 'malformed'] as const) noProvider(fixture.execute('approval', { approval }));
    for (const injection of [{ environmentId: 124 }, { runAttempt: 2 }, { currentSha: baseSha }, { ciConclusion: 'failure' }, { controlsChanged: true }, { unavailable: '/approvals' }, { invalidJson: '/approvals' }, { unavailable: '/actions/runs/51' }, { unavailable: '/git/ref/heads/main' }, { invalidJson: '/git/ref/heads/main' }]) noProvider(fixture.execute('approval', injection));
    const substitutions: Record<string, string>[] = [{ REVIEW_DIGEST: '0'.repeat(64) }, { REVIEW_BASE64: Buffer.from('{}').toString('base64') }, { RELEASE_ENVIRONMENT_ID: '124' }, { VERCEL_TOKEN: 'synthetic-vercel-token' }];
    for (const extra of substitutions) noProvider(fixture.execute('approval', {}, extra));
  });
});

test('build refuses saved config tampering and rechecks evidence between Vercel pull and build', async () => {
  await withFixture(async fixture => {
    passed(fixture.execute('approval'));
    await fixture.changeSaved('public.json', value => { value.apiUrl = 'https://changed.example.com'; });
    noProvider(fixture.execute('build'));
  });
  for (const afterPull of ['main', 'controls', 'expiry'] as const) await withFixture(async fixture => {
    passed(fixture.execute('approval')); const result = fixture.execute('build', { afterPull });
    assert.equal(result.status, 1, result.stderr); assert.match(result.stdout, /SINK \["pull"/); assert.doesNotMatch(result.stdout, /SINK \["build"/);
  });
});

test('post-build manifest package source CI main control and receipt drift refuse upload and verification', async () => {
  await withFixture(async fixture => {
    passed(fixture.execute('approval')); passed(fixture.execute('build'));
    for (const injection of [{ at: now + 86400000 }, { treeChanged: true }, { diffChanged: true }, { currentSha: baseSha }, { ciConclusion: 'failure' }, { controlsChanged: true }, { approval: 'rejected' as const }, { unavailable: '/approvals' }]) {
      noProvider(fixture.execute('deploy', injection)); noProvider(fixture.execute('verify', injection));
    }
    const changedManifest = { ...fixture.manifest, approval: { ...fixture.manifest.approval, reviewer: 'changed-owner' } };
    noProvider(fixture.execute('deploy', {}, { RELEASE_MANIFEST: canonicalReleaseReviewJson(changedManifest) }));
    noProvider(fixture.execute('deploy', {}, { REVIEW_DIGEST: '0'.repeat(64) }));
    const targets: Record<string, string>[] = [{ VERCEL_ORG_ID: 'team_changed' }, { VERCEL_PROJECT_ID: 'prj_changed' }];
    for (const target of targets) {
      noProvider(fixture.execute('deploy', {}, target)); noProvider(fixture.execute('build', {}, target));
    }
    await fixture.changeSaved('review.json', value => { value.ciRunId = '43'; }); noProvider(fixture.execute('deploy'));
  });
});

test('artifact changes refuse upload and production staging always preserves skip-domain', async () => {
  await withFixture(async fixture => {
    passed(fixture.execute('approval')); passed(fixture.execute('build'));
    await writeFile(join(fixture.directory, '.vercel/output/static/index.html'), '<p>changed</p>'); noProvider(fixture.execute('deploy'));
  });
  await withFixture(async fixture => {
    passed(fixture.execute('approval')); passed(fixture.execute('build')); const deploy = fixture.execute('deploy'); passed(deploy);
    assert.match(deploy.stdout, /"--prod","--skip-domain"/); assert.doesNotMatch(deploy.stdout, /"promote"|"alias"/);
  }, 'production');
});

test('a shared API and web project is rejected before preparation or credential consumption',async()=>{
 await withFixture(async fixture=>{for(const mode of ['prepare','approval'] as const){const result=fixture.execute(mode,{apiSameProject:true});noProvider(result);assert.match(result.stderr,/separate Vercel projects/);}});
});

test('live personal repository metadata admits unsupported omission and is read again before every provider boundary',async()=>{
 await withFixture(async fixture=>{const personal={repositoryOwner:'User' as const,bypassMetadata:'omitted' as const};passed(fixture.execute('prepare',personal));passed(fixture.execute('approval',personal));const build=fixture.execute('build',personal);passed(build);assert.ok(build.stdout.indexOf('FETCH https://api.github.com/repos/owner/repo\n')<build.stdout.indexOf('SINK ["pull"'));passed(fixture.execute('deploy',personal));passed(fixture.execute('verify',personal));
 for(const mode of['prepare','approval','build','deploy','verify']as const)for(const changed of[{repositoryOwner:'Organization' as const,bypassMetadata:'omitted' as const},{repositoryOwner:'Bot' as const,bypassMetadata:'omitted' as const},{repositoryName:'fork/repo'},{repositoryUnavailable:true},{repositoryOwner:'User' as const,bypassMetadata:'null' as const},{repositoryOwner:'User' as const,bypassMetadata:'unsafe' as const}])noProvider(fixture.execute(mode,changed));
 const changed=fixture.execute('build',{...personal,afterPull:'owner'});noProviderAfterPull(changed);
 });
});
function noProviderAfterPull(result:ReturnType<Awaited<ReturnType<typeof createFixture>>['execute']>){assert.equal(result.status,1);assert.match(result.stdout,/SINK \["pull"/);assert.doesNotMatch(result.stdout,/SINK \["build"|SINK \["deploy"|PROVIDER /);}

test('staging origin and browser consumers require original verified web artifact and completed handover under current approval',async()=>{
 await withFixture(async fixture=>{
  passed(fixture.execute('approval'));passed(fixture.execute('build'));passed(fixture.execute('deploy'));passed(fixture.execute('verify'));
  const bound=fixture.execute('bind-staging-origin');passed(bound);assert.match(bound.stdout,/STAGING_ORIGIN_CONSUMER/);
  const browser=fixture.execute('verify-browser');passed(browser);assert.match(browser.stdout,/STAGING_BROWSER_CONSUMER/);
  const learningLoop=fixture.execute('verify-learning-loop');passed(learningLoop);assert.match(learningLoop.stdout,/STAGING_LEARNING_LOOP_CONSUMER/);
  for(const mode of['bind-staging-origin','verify-browser','verify-learning-loop'] as const){
   const unavailable=fixture.execute(mode,{backendBridge:'missing'});assert.equal(unavailable.status,1);assert.doesNotMatch(unavailable.stdout,/STAGING_ORIGIN_CONSUMER|STAGING_BROWSER_CONSUMER/);
   const failure=fixture.execute(mode,{stagingConsumerFailure:true});assert.equal(failure.status,1);
  }
  await fixture.changeSaved('web-deployment-result.json',value=>{value.runAttempt=2;});for(const mode of['bind-staging-origin','verify-browser','verify-learning-loop'] as const){const changed=fixture.execute(mode);assert.equal(changed.status,1);assert.doesNotMatch(changed.stdout,/STAGING_ORIGIN_CONSUMER|STAGING_BROWSER_CONSUMER/);}
 },'staging',true);
});
