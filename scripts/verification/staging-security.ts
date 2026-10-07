import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { canonicalReleaseExecutionJson, canonicalReleaseReviewJson } from './release-review';

const unavailable = () => new Error('Canonical staging security evidence is unavailable or requires review; contents withheld.');
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER), sha = z.string().regex(/^[a-f0-9]{40}$/);
const repository = z.string().regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/).refine(value => !value.split('/').some(part => ['.', '..'].includes(part)));
const expectedSchema = z.object({ sha, repository }).strict();
const runSchema = z.object({ id: positive, run_attempt: positive, head_sha: sha, head_branch: z.literal('main'), event: z.literal('push'), path: z.literal('.github/workflows/ci.yml'), status: z.enum(['queued', 'in_progress', 'completed']), conclusion: z.string().nullable(), repository: z.object({ full_name: repository }) });
const stepSchema = z.object({ name: z.string().min(1).max(200), number: positive, status: z.string(), conclusion: z.string().nullable() });
const jobSchema = z.object({ id: positive, name: z.string().min(1).max(200), run_id: positive, run_attempt: positive, head_sha: sha, head_branch: z.literal('main'), status: z.string(), conclusion: z.string().nullable(), steps: z.array(stepSchema).max(100).optional() });
const requiredSteps = [
  'Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  'Run actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
  'Run npm install --global npm@11.17.0 --ignore-scripts --no-audit --no-fund',
  'Run npm ci --ignore-scripts --no-audit --no-fund',
  'Run node node_modules/esbuild/install.js',
  'Run github/codeql-action/init@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2',
  'Run github/codeql-action/analyze@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2',
  'Require current processed CodeQL security findings to be clear',
];
const listQuery = (source: string, page: number) => `actions/workflows/ci.yml/runs?branch=main&event=push&head_sha=${source}&per_page=100&page=${page}`;
export type CanonicalStagingSecurity = { status: 'VERIFIED'; runId: number; runAttempt: number; jobId: number; jobsSha256: string } | { status: 'NOT_READY'; runId?: number; runAttempt?: number };
type GithubReader = (path: string) => Promise<unknown>;

/** Read only the canonical security job. Overall CI may remain running or fail unrelated acceptance checks. */
export async function readCanonicalStagingSecurity(value: unknown, github: GithubReader): Promise<CanonicalStagingSecurity> {
  try {
    const expected = expectedSchema.parse(JSON.parse(canonicalReleaseReviewJson(value)));
    const currentMain = async () => { const main = z.object({ object: z.object({ type: z.literal('commit'), sha }) }).parse(await github('git/ref/heads/main')); if (main.object.sha !== expected.sha) throw unavailable(); };
    await currentMain();
    const runs: z.infer<typeof runSchema>[] = [], runIds = new Set<number>(); let total: number | undefined;
    for (let page = 1; page <= 10; page++) {
      const response = z.object({ total_count: z.number().int().nonnegative().max(1000), workflow_runs: z.array(runSchema).max(100) }).parse(JSON.parse(canonicalReleaseExecutionJson(await github(listQuery(expected.sha, page)))));
      if (total !== undefined && total !== response.total_count) throw unavailable(); total = response.total_count;
      for (const row of response.workflow_runs) { if (runIds.has(row.id) || row.head_sha !== expected.sha || row.repository.full_name !== expected.repository) throw unavailable(); runIds.add(row.id); runs.push(row); }
      if (runs.length > total) throw unavailable(); if (runs.length === total) break;
      if (response.workflow_runs.length !== 100 || page === 10) throw unavailable();
    }
    if (runs.length !== total) throw unavailable(); if (!runs.length) return { status: 'NOT_READY' };
    const selected = [...runs].sort((a, b) => b.id - a.id)[0], runPath = `actions/runs/${selected.id}`;
    const currentRun = async () => {
      const row = runSchema.parse(JSON.parse(canonicalReleaseReviewJson(await github(runPath))));
      if (row.id !== selected.id || row.run_attempt !== selected.run_attempt || row.head_sha !== expected.sha || row.repository.full_name !== expected.repository
        || row.status === 'completed' && !['success', 'failure'].includes(row.conclusion ?? '') || row.status !== 'completed' && row.conclusion !== null) throw unavailable();
      return row;
    };
    const initial = await currentRun();
    const rows: z.infer<typeof jobSchema>[] = [], ids = new Set<number>(); let jobsTotal: number | undefined;
    for (let page = 1; page <= 10; page++) {
      const response = z.object({ total_count: z.number().int().nonnegative().max(1000), jobs: z.array(jobSchema).max(100) }).parse(JSON.parse(canonicalReleaseExecutionJson(await github(`${runPath}/attempts/${selected.run_attempt}/jobs?per_page=100&page=${page}`))));
      if (jobsTotal !== undefined && jobsTotal !== response.total_count) throw unavailable(); jobsTotal = response.total_count;
      for (const row of response.jobs) { if (ids.has(row.id) || row.run_id !== selected.id || row.run_attempt !== selected.run_attempt || row.head_sha !== expected.sha) throw unavailable(); ids.add(row.id); rows.push(row); }
      if (rows.length > jobsTotal) throw unavailable(); if (rows.length === jobsTotal) break;
      if (response.jobs.length !== 100 || page === 10) throw unavailable();
    }
    if (rows.length !== jobsTotal) throw unavailable();
    const codeql = rows.filter(row => row.name === 'codeql');
    if (codeql.length === 0 && ['queued', 'in_progress'].includes(initial.status)) return { status: 'NOT_READY', runId: selected.id, runAttempt: selected.run_attempt };
    if (codeql.length !== 1) throw unavailable(); const exact = codeql[0];
    if (['queued', 'in_progress'].includes(exact.status) && exact.conclusion === null) return { status: 'NOT_READY', runId: selected.id, runAttempt: selected.run_attempt };
    if (exact.status !== 'completed' || exact.conclusion !== 'success' || !exact.steps) throw unavailable();
    const names = new Set<string>(), numbers = new Set<number>(), authored: string[] = [];
    for (const [index, step] of exact.steps.entries()) {
      if (names.has(step.name) || numbers.has(step.number) || index > 0 && step.number <= exact.steps[index - 1].number) throw unavailable(); names.add(step.name); numbers.add(step.number);
      if (requiredSteps.includes(step.name)) { if (step.status !== 'completed' || step.conclusion !== 'success') throw unavailable(); authored.push(step.name); }
      else if (step.name === 'Set up job' || step.name === 'Complete job') { if (step.status !== 'completed' || step.conclusion !== 'success') throw unavailable(); }
      else if (!requiredSteps.filter(name => name.startsWith('Run actions/') || name.startsWith('Run github/codeql-action/')).some(name => step.name === `Post ${name}`)
        || step.status !== 'completed' || !['success', 'skipped'].includes(step.conclusion ?? '')) throw unavailable();
    }
    if (canonicalReleaseReviewJson(authored) !== canonicalReleaseReviewJson(requiredSteps)) throw unavailable();
    await currentRun(); await currentMain();
    const jobsSha256 = createHash('sha256').update(canonicalReleaseReviewJson({ repository: expected.repository, sha: expected.sha, runId: selected.id, runAttempt: selected.run_attempt, jobId: exact.id, steps: exact.steps })).digest('hex');
    return { status: 'VERIFIED', runId: selected.id, runAttempt: selected.run_attempt, jobId: exact.id, jobsSha256 };
  } catch { throw unavailable(); }
}

export function readStagingSecurityContext(env: Record<string, string | undefined>, checkoutSha: string) {
  const expected = expectedSchema.parse({ sha: env.GITHUB_SHA, repository: env.GITHUB_REPOSITORY });
  const staging = env.GITHUB_JOB === 'codeql' && env.GITHUB_WORKFLOW_REF === `${expected.repository}/.github/workflows/staging-verification.yml@refs/heads/main` && ['push','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME ?? '');
  const full = env.GITHUB_JOB === 'codeql-evidence' && env.GITHUB_WORKFLOW_REF === `${expected.repository}/.github/workflows/full-regression.yml@refs/heads/main` && ['schedule','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME ?? '');
  if (checkoutSha !== expected.sha || env.GITHUB_WORKFLOW_SHA !== expected.sha || env.CI !== 'true' || env.GITHUB_ACTIONS !== 'true' || (!staging && !full)
    || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_SERVER_URL !== 'https://github.com' || env.GITHUB_API_URL !== 'https://api.github.com'
    || !env.GH_TOKEN || env.GH_TOKEN.length > 24576 || /[^\x21-\x7e]/.test(env.GH_TOKEN)) throw unavailable();
  return { ...expected, token: env.GH_TOKEN };
}
async function boundedJson(response: Response, signal: AbortSignal) {
  if (response.status !== 200 || response.redirected || !response.body || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) throw unavailable();
  const size = response.headers.get('content-length'); if (size !== null && (!/^\d+$/.test(size) || Number(size) > 1024 * 1024)) throw unavailable();
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
  try { for (;;) {
    const chunk = await new Promise<ReadableStreamReadResult<Uint8Array>>((done, reject) => {
      const abort = () => { signal.removeEventListener('abort', abort); reject(unavailable()); };
      if (signal.aborted) return abort(); signal.addEventListener('abort', abort, { once: true });
      void reader.read().then(value => { signal.removeEventListener('abort', abort); if (signal.aborted) reject(unavailable()); else done(value); }, () => { signal.removeEventListener('abort', abort); reject(unavailable()); });
    });
    if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > 1024 * 1024) throw unavailable(); chunks.push(chunk.value);
  } return JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(Buffer.concat(chunks))) as unknown; }
  finally { void reader.cancel().catch(() => undefined); try { reader.releaseLock(); } catch { /* Active cancellation owns cleanup. */ } }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const gitEnv = { ...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' };
    const git = (args: string[]) => execFileSync('git', args, { env: gitEnv, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 }).toString().trim();
    const checkout = git(['rev-parse', '--verify', 'HEAD^{commit}']);
    const context = readStagingSecurityContext(process.env, checkout), { token, ...expected } = context;
    git(['diff', '--quiet', '--no-ext-diff', '--no-textconv', 'HEAD', '--']);
    if (git(['ls-files', '--others', '--exclude-standard'])) throw unavailable();
    const started = Date.now(); let original: { runId: number; runAttempt: number } | undefined;
    const github: GithubReader = async path => {
      const remaining = 600000 - (Date.now() - started); if (remaining <= 0) throw unavailable();
      const signal = AbortSignal.timeout(Math.min(15000, remaining)), url = `https://api.github.com/repos/${context.repository}/${path}`;
      const response = await fetch(url, { method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, signal });
      if (response.url && response.url !== url) throw unavailable(); return boundedJson(response, signal);
    };
    for (;;) {
      const result = await readCanonicalStagingSecurity(expected, github);
      if (result.runId !== undefined && result.runAttempt !== undefined) {
        if (original && (original.runId !== result.runId || original.runAttempt !== result.runAttempt)) throw unavailable();
        original = { runId: result.runId, runAttempt: result.runAttempt };
      } else if (original) throw unavailable();
      if (result.status === 'VERIFIED') {
        console.log(JSON.stringify({ check: 'canonical-staging-codeql', ...result })); break;
      }
      if (Date.now() - started >= 600000) throw unavailable();
      console.log(JSON.stringify({ check: 'canonical-staging-codeql', status: 'NOT_READY' }));
      await new Promise<void>(done => setTimeout(done, Math.min(15000, 600000 - (Date.now() - started))));
    }
  } catch { console.log(JSON.stringify({ check: 'canonical-staging-codeql', status: 'UNAVAILABLE' })); process.exitCode = 1; }
}
