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
type Mode = 'prepare' | 'approval' | 'build' | 'deploy' | 'verify';
type Injection = {
  at?: number; environmentId?: number; runAttempt?: number; currentSha?: string; ciConclusion?: string;
  approval?: 'missing' | 'generic' | 'rejected' | 'duplicate' | 'wrong-founder' | 'malformed';
  unavailable?: string; invalidJson?: string; treeChanged?: boolean; diffChanged?: boolean;
  dirty?: boolean; untracked?: boolean; ancestorDenied?: boolean; controlsChanged?: boolean;
  afterPull?: 'main' | 'controls' | 'expiry'; pullPublicChanged?: boolean;
  apiSameProject?:boolean;
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

async function withFixture(run: (fixture: Awaited<ReturnType<typeof createFixture>>) => Promise<void>, environment: 'staging' | 'production' = 'staging') {
  const fixture = await createFixture(environment);
  try { await run(fixture); }
  finally {
    assert.equal(dirname(fixture.directory), resolve(tmpdir()));
    assert.ok(basename(fixture.directory).startsWith('cuevo-release-process-'));
    await rm(fixture.directory, { recursive: true, force: true });
  }
}

async function createFixture(environment: 'staging' | 'production') {
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
  const review = { version: 1 as const, repository: 'owner/repo', releaseSha: sha, baseSha, ciRunId: '42', web, manifestSha256: hash(canonicalReleaseReviewJson(manifest)), sourceManifestSha256: hash(tree), diffSha256: hash(diff), reviews };
  const prepared = prepareReleaseReviewPackage(review, { repository: review.repository, releaseSha: sha, baseSha, ciRunId: '42', web, manifestSha256: review.manifestSha256, sourceManifestSha256: review.sourceManifestSha256, diffSha256: review.diffSha256, releaseRunId: '51', runAttempt: 1, environmentId: 123, environmentName: environment, now, reviews: assignments.reviews });
  const env = {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
    GITHUB_REPOSITORY: 'owner/repo', GITHUB_SHA: sha, GITHUB_REF: 'refs/heads/main', GITHUB_RUN_ID: '51', GITHUB_RUN_ATTEMPT: '1',
    GH_TOKEN: 'synthetic-github-token', CI_RUN_ID: '42', RELEASE_SHA: sha, RELEASE_ENVIRONMENT: environment,
    VERCEL_ORG_ID: 'team_cuevo', VERCEL_PROJECT_ID: 'prj_cuevo',
    GITHUB_OUTPUT: join(directory, 'output.txt'), GITHUB_STEP_SUMMARY: join(directory, 'summary.md'),
    CUEVO_RELEASE_REVIEW_INPUT_JSON: canonicalReleaseReviewJson({ manifest, review }),
    CUEVO_RELEASE_REVIEW_ASSIGNMENTS_JSON: canonicalReleaseReviewJson(assignments),
    RELEASE_MANIFEST: canonicalReleaseReviewJson(manifest), RELEASE_ENVIRONMENT_ID: '123',
    REVIEW_BASE64: prepared.base64, REVIEW_DIGEST: prepared.sha256,
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
      let pulled = false;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      Date.now = () => state.at ?? (pulled && state.afterPull === 'expiry' ? ${now + 86400000} : ${now});
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
      globalThis.fetch = async input => {
        const url = String(input); console.log('FETCH ' + url);
        if (state.unavailable && url.endsWith(state.unavailable)) return new Response('PRIVATE_RESPONSE_SENTINEL', { status: 403 });
        if (state.invalidJson && url.endsWith(state.invalidJson)) return new Response('PRIVATE_RESPONSE_SENTINEL');
        if (url.endsWith('/actions/runs/42')) return Response.json({ id: 42, head_sha: '${sha}', head_branch: 'main', event: 'push', status: 'completed', conclusion: state.ciConclusion ?? 'success', path: '.github/workflows/ci.yml', repository: { full_name: 'owner/repo' } });
        if (url.endsWith('/git/ref/heads/main')) return Response.json({ object: { type: 'commit', sha: state.currentSha ?? (pulled && state.afterPull === 'main' ? '${baseSha}' : '${sha}') } });
        if (url.endsWith('/environments/${environment}')) return Response.json({ id: state.environmentId ?? 123, name: '${environment}', can_admins_bypass: state.controlsChanged || (pulled && state.afterPull === 'controls') ? true : false, protection_rules: [{ type: 'required_reviewers', prevent_self_review: false, reviewers: [{ type: 'User', reviewer: { id: 95836629, login: 'attaulhaq0', type: 'User' } }] }, { type: 'branch_policy' }], deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } });
        if (url.endsWith('/deployment-branch-policies')) return Response.json({ total_count: 1, branch_policies: [{ name: 'main', type: 'branch' }] });
        if (url.endsWith('/branches/main/protection')) return Response.json({ enforce_admins: { enabled: true }, required_status_checks: { strict: true, contexts: ['required'] }, allow_force_pushes: { enabled: false }, allow_deletions: { enabled: false }, required_pull_request_reviews: { dismiss_stale_reviews: true, require_code_owner_reviews: false, required_approving_review_count: 0, require_last_push_approval: false, bypass_pull_request_allowances: { users: [], teams: [], apps: [] } } });
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
    const providerEnv = ['build', 'deploy', 'verify'].includes(mode) ? { VERCEL_TOKEN: 'synthetic-vercel-token', VERCEL_ORG_ID: 'team_cuevo', VERCEL_PROJECT_ID: 'prj_cuevo', DATABASE_URL: 'PRIVATE_DATABASE_SENTINEL' } : {};
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
  });
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
