import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parse as parseEnv } from 'dotenv';
import { z } from 'zod';
import { validateCiRun, validateReleaseManifest, vercelTarget, validateVercelDeployment, releaseContext, validateReleaseControls } from './cicd-contracts';
import { runtimeEnvironment } from '../runtime/environment';

const directory = resolve('.local/cicd-release');
const required = (key: string) => { const value = process.env[key]; if (!value) throw Error(`Required release setting missing: ${key}`); return value; };
const assertCheckout = () => {
  const actual = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: false }).trim();
  if (actual !== required('RELEASE_SHA')) throw Error('Release checkout does not match the admitted commit.');
};
const parseJson = <T,>(text: string): T => { try { return JSON.parse(text) as T; } catch { throw Error('Release JSON is invalid; contents withheld.'); } };
const json = async <T,>(path: string): Promise<T> => parseJson<T>(await readFile(path, 'utf8'));
const publicPath = join(directory, 'public.json');
const binary = process.platform === 'win32' ? 'vercel.cmd' : 'vercel';
const cli = (args: string[]) => {
  const token = required('VERCEL_TOKEN'); const team = required('VERCEL_ORG_ID'); const project = required('VERCEL_PROJECT_ID');
  if (!/^team_[a-zA-Z0-9]+$/.test(team) || !/^prj_[a-zA-Z0-9]+$/.test(project)) throw Error('A verified Vercel team and project are required.');
  // The pinned CLI accepts VERCEL_TOKEN directly; no credential enters argv or a shell.
  if (process.platform === 'win32') throw Error('Reviewed release CLI execution requires the Linux GitHub runner.');
  try { return execFileSync(binary, [...args, '--scope', team], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...runtimeEnvironment('web', process.env), VERCEL_TOKEN: token, VERCEL_ORG_ID: team, VERCEL_PROJECT_ID: project }, shell: false }); }
  catch { throw Error('Vercel action failed; raw output and credentials withheld.'); }
};
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
  const migrations = await Promise.all((await readdir('supabase/migrations')).filter(name => /^\d{14}_.+\.sql$/.test(name)).map(async name => ({ version: name.slice(0, 14), sha256: createHash('sha256').update(await readFile(join('supabase/migrations', name))).digest('hex') })));
  return validateReleaseManifest(manifest, { sha: required('RELEASE_SHA'), environment: required('RELEASE_ENVIRONMENT'), ciRunId, now: Date.now(), migrations });
};
const inspectDeployment = async (identity: { teamId: string; projectId: string; url: string; deploymentId?: string }) => {
  const selector = identity.deploymentId ?? new URL(identity.url).hostname;
  const url = new URL(`https://api.vercel.com/v13/deployments/${encodeURIComponent(selector)}`); url.searchParams.set('teamId', identity.teamId);
  let inspected: unknown;
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${required('VERCEL_TOKEN')}` }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error('Unavailable'); inspected = await response.json();
  } catch { throw Error('Team-scoped Vercel deployment evidence is unavailable; response contents withheld.'); }
  validateVercelDeployment(inspected, { sha: required('RELEASE_SHA'), ...identity, target: vercelTarget(required('RELEASE_ENVIRONMENT')) });
};
const assertCurrentMain = async () => {
  const releaseSha = required('RELEASE_SHA'); const repository = required('GITHUB_REPOSITORY');
  const current = await fetch(`https://api.github.com/repos/${repository}/git/ref/heads/main`, { headers: { Authorization: `Bearer ${required('GH_TOKEN')}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(15000) });
  if (!current.ok || z.object({ object: z.object({ type: z.literal('commit'), sha: z.literal(releaseSha) }) }).safeParse(await current.json()).success !== true) throw Error('Main changed or current branch evidence is unavailable; release requires fresh CI.');
};
const mode = process.argv[2];
if (mode === 'context') {
  const context = releaseContext(await json<unknown>(required('GITHUB_EVENT_PATH')), { sha: required('GITHUB_SHA'), ref: required('GITHUB_REF'), repository: required('GITHUB_REPOSITORY'), eventName: required('GITHUB_EVENT_NAME') });
  await writeFile(required('GITHUB_OUTPUT'), `sha=${context.sha}\nci-run-id=${context.ciRunId}\nenvironment=${context.environment}\n`, { flag: 'a' });
  console.log('Release context bound to the current main checkout and canonical CI run.');
} else if (mode === 'controls') {
  const repository = required('GITHUB_REPOSITORY'); const environment = required('RELEASE_ENVIRONMENT');
  if (!['staging', 'production'].includes(environment)) throw Error('Unknown release environment.');
  const readControl = async (path: string) => {
    const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, { headers: { Authorization: `Bearer ${required('GH_TOKEN')}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error('Release protection metadata is unavailable; maintainer configuration or read access requires review.');
    return response.json();
  };
  const [environmentControl, branches, main, signatures] = await Promise.all([readControl(`environments/${environment}`), readControl(`environments/${environment}/deployment-branch-policies`), readControl('branches/main/protection'), readControl('branches/main/protection/required_signatures')]);
  validateReleaseControls({ environment: environmentControl, branches, main, signatures }, { environment });
  console.log('Existing release environment and main review/signature/status protections verified.');
} else if (mode === 'ci') {
  const releaseSha = required('RELEASE_SHA'); const runId = required('CI_RUN_ID'); const repository = required('GITHUB_REPOSITORY');
  if (!/^[a-f0-9]{40}$/.test(releaseSha) || !/^\d+$/.test(runId) || releaseSha !== required('GITHUB_SHA') || process.env.GITHUB_REF !== 'refs/heads/main') throw Error('Release must be dispatched from the exact verified main commit.');
  assertCheckout();
  const response = await fetch(`https://api.github.com/repos/${repository}/actions/runs/${runId}`, { headers: { Authorization: `Bearer ${required('GH_TOKEN')}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Error('Trusted CI evidence is unavailable.');
  validateCiRun(await response.json(), { sha: releaseSha, repository, ciRunId: runId });
  await assertCurrentMain();
  console.log('Exact main commit has successful canonical CI evidence.');
} else if (mode === 'manifest') {
  const manifest = parseJson<unknown>(required('RELEASE_MANIFEST')); const ciRunId = required('CI_RUN_ID');
  const publicConfig = await admitManifest(manifest, ciRunId);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'manifest.json'), JSON.stringify({ manifest, ciRunId }));
  await writeFile(publicPath, JSON.stringify(publicConfig));
  console.log('Current API/worker, exact migrations, private security and human approval evidence admitted.');
} else if (mode === 'build') {
  required('VERCEL_ORG_ID'); required('VERCEL_PROJECT_ID');
  const environment = required('RELEASE_ENVIRONMENT'); const target = vercelTarget(environment);
  const publicConfig = await json<{ apiUrl: string; supabaseUrl: string; supabasePublishableKey: string }>(publicPath);
  cli(['pull', '--yes', `--environment=${target}`]);
  const downloaded = parseEnv(await readFile(resolve(`.vercel/.env.${target}.local`), 'utf8'));
  const allowed = new Set(['NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'VERCEL_ENV', 'VERCEL_TARGET_ENV', 'VERCEL_URL']);
  if (Object.keys(downloaded).some(key => !allowed.has(key))) throw Error('Web project environment contains unreviewed settings; remove server credentials before build.');
  if (downloaded.NEXT_PUBLIC_API_URL !== publicConfig.apiUrl || downloaded.NEXT_PUBLIC_SUPABASE_URL !== publicConfig.supabaseUrl || downloaded.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY !== publicConfig.supabasePublishableKey) throw Error('Vercel public build settings do not match approved dependency endpoints.');
  cli(['build', ...(target === 'production' ? ['--prod'] : ['--target=preview'])]);
  await writeFile(join(directory, 'artifact.sha256'), await artifactDigest());
  console.log('Prebuilt web output verified against public-only environment and deployment credential exclusion.');
} else if (mode === 'deploy') {
  assertCheckout();
  await assertCurrentMain();
  if (await artifactDigest() !== await readFile(join(directory, 'artifact.sha256'), 'utf8')) throw Error('Prebuilt artifact changed after verification.');
  const target = vercelTarget(required('RELEASE_ENVIRONMENT')); const sourceSha = required('RELEASE_SHA');
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw Error('Invalid release source commit.');
  const args = ['deploy', '--prebuilt', '--yes', '--meta', `cuevoCommitSha=${sourceSha}`, ...(target === 'production' ? ['--prod', '--skip-domain'] : ['--target=preview'])];
  const result = cli(args).trim(); if (!/^https:\/\/[a-z0-9.-]+\.vercel\.app\/?$/i.test(result)) throw Error('Deployment returned no verified Vercel URL.');
  await writeFile(join(directory, 'deployment.json'), JSON.stringify({ url: result, commitSha: required('RELEASE_SHA') }));
  await writeFile(required('GITHUB_OUTPUT'), `url=${result}\n`, { flag: 'a' });
  console.log('Verified prebuilt artifact uploaded; production domains remain unpromoted.');
} else if (mode === 'verify') {
  const deployment = await json<{ url: string; commitSha: string }>(join(directory, 'deployment.json'));
  // Re-admit the original evidence at consumption time; a long build must not silently extend its 24-hour validity.
  const evidence = z.object({ manifest: z.unknown(), ciRunId: z.string().regex(/^\d+$/) }).strict().parse(await json<unknown>(join(directory, 'manifest.json')));
  const publicConfig = await admitManifest(evidence.manifest, evidence.ciRunId);
  if (!isDeepStrictEqual(await json<unknown>(publicPath), publicConfig)) throw Error('Admitted release dependencies changed before verification.');
  if (!/^https:\/\/[a-z0-9.-]+\.vercel\.app\/?$/i.test(deployment.url)) throw Error('Invalid Vercel deployment URL.');
  const teamId = required('VERCEL_ORG_ID'); const projectId = required('VERCEL_PROJECT_ID');
  await inspectDeployment({ projectId, teamId, url: deployment.url });
  if (deployment.commitSha !== required('RELEASE_SHA')) throw Error('Stored deployment receipt names another source commit.');
  if (publicConfig.api.kind === 'vercel') {
    if (publicConfig.api.projectId === projectId) throw Error('API and web must use separate Vercel projects.');
    await inspectDeployment({ projectId: publicConfig.api.projectId, teamId: publicConfig.api.teamId, deploymentId: publicConfig.api.deploymentId, url: publicConfig.api.deploymentUrl });
  }
  const page = await fetch(deployment.url, { signal: AbortSignal.timeout(15000) });
  const health = await fetch(`${publicConfig.apiUrl}/health/ready`, { signal: AbortSignal.timeout(15000) });
  if (!page.ok || !health.ok) throw Error('Deployed web/API readiness requires review.');
  if (publicConfig.api.kind === 'vercel') console.log('API Vercel team/project/deployment/target/source SHA metadata freshly verified. API artifact hash and custom-origin binding remain reviewed manifest evidence.');
  if (publicConfig.worker.kind === 'container') {
    const workerHealth = await fetch(`${publicConfig.worker.origin}/health/ready`, { signal: AbortSignal.timeout(15000) });
    if (!workerHealth.ok) throw Error('Deployed container worker readiness requires review.');
    console.log('Vercel source SHA/team/project and web/API/container worker readiness verified. Backend image identities remain reviewed manifest attestations; full staged actor/security/AI and domain promotion remain operator gates.');
  } else {
    console.log('Vercel source SHA/team/project and web/API readiness verified. Edge worker security/queue evidence remains admitted attestations within 24 hours; artifact/lock hashes are operator evidence, with no fresh Edge network or source verification. Full staged actor/security/AI and domain promotion remain operator gates.');
  }
} else throw Error('Expected context, ci, manifest, build, deploy or verify release operation.');
