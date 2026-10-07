import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { verificationSteps } from './steps';
import { canonicalReleaseReviewJson } from './release-review';
import { readSingleJsonArchive } from './single-json-archive';
import { fullRegressionJobPolicy, validateFullRegressionWorkflow } from './verification-workflows';
import { technicalAcceptanceScope } from './full-verification-evidence';

export const fullRegressionWorkflowPath = '.github/workflows/full-regression.yml' as const;
const sha = z.string().regex(/^[a-f0-9]{40}$/), positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const identifier = z.string().regex(/^[1-9][0-9]*$/).refine(value => Number.isSafeInteger(Number(value)));
const repository = z.string().regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/).refine(value => !value.split('/').some(part => ['.', '..'].includes(part)));
const fail = () => Error('Full customer-candidate source evidence is unavailable or requires review; contents withheld.');
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const expectedSchema = z.object({ sha, repository, ciRunId: identifier }).strict();
const runSchema = z.object({ id: positive, run_attempt: positive, head_sha: sha, head_branch: z.literal('main'), event: z.literal('workflow_dispatch'), path: z.literal(fullRegressionWorkflowPath), status: z.literal('completed'), conclusion: z.literal('success'), repository: z.object({ full_name: repository }) });
export function validateProductionCiRun(value: unknown, expected: { sha: string; repository: string; ciRunId: string }) {
  try {
    const context = expectedSchema.parse(JSON.parse(canonicalReleaseReviewJson(expected))), run = runSchema.parse(JSON.parse(canonicalReleaseReviewJson(value)));
    if (run.head_sha !== context.sha || run.repository.full_name !== context.repository || String(run.id) !== context.ciRunId) throw fail();
    return { id: run.id, run_attempt: run.run_attempt, head_sha: run.head_sha, head_branch: run.head_branch, event: run.event, path: run.path, status: run.status, conclusion: run.conclusion, repository: { full_name: run.repository.full_name } };
  } catch { throw fail(); }
}
const summarySchema = z.object({ version: z.literal(1), profile: z.literal('CUSTOMER_CANDIDATE'), repository, sourceSha: sha, treeSha: sha, runId: identifier, runAttempt: positive,
  technicalAcceptanceScope:z.object({version:z.literal(1),providerMode:z.literal('FIXTURE'),hostedAcceptance:z.literal(false),customerAcceptance:z.literal(false),separateBrowserWindows:z.array(z.object({file:z.string(),reason:z.string()}).strict()).max(100),separateIntegrationWindows:z.array(z.object({file:z.string(),reason:z.string()}).strict()).max(100)}).strict(),technicalAcceptanceScopeSha256:z.string().regex(/^[a-f0-9]{64}$/),
  evidence: z.object({ commitSha: sha, runId: identifier, status: z.literal('VERIFIED'), sourceFileCount: positive,
    rows: z.array(z.object({ name: z.string(), exitCode: z.literal(0), durationMs: z.number().finite().nonnegative() }).strict()).max(1000) }).strict() }).strict();
export function validateFullReleaseSummary(value: unknown, expected: { sha: string; repository: string; ciRunId: string; treeSha: string; runAttempt: number }) {
  try {
    const context = expectedSchema.extend({ treeSha: sha, runAttempt: positive }).parse(JSON.parse(canonicalReleaseReviewJson(expected))), summary = summarySchema.parse(JSON.parse(canonicalReleaseReviewJson(value)));
    const required = [...verificationSteps.map(step => step.name), 'source-freeze'].sort(), names = summary.evidence.rows.map(row => row.name).sort();
    if (summary.sourceSha !== context.sha || summary.treeSha !== context.treeSha || summary.repository !== context.repository || summary.runId !== context.ciRunId || summary.runAttempt !== context.runAttempt
      || summary.evidence.commitSha !== summary.sourceSha || summary.evidence.runId !== summary.runId || canonicalReleaseReviewJson(required) !== canonicalReleaseReviewJson(names)
      || canonicalReleaseReviewJson({technicalAcceptanceScope:summary.technicalAcceptanceScope,technicalAcceptanceScopeSha256:summary.technicalAcceptanceScopeSha256})!==canonicalReleaseReviewJson(technicalAcceptanceScope())) throw fail();
    return summary;
  } catch { throw fail(); }
}

const jobSchema = z.object({ id: positive, name: z.string(), run_id: positive, run_attempt: positive, head_sha: sha, head_branch: z.literal('main'), status: z.literal('completed'), conclusion: z.literal('success'),
  steps: z.array(z.object({ name: z.string(), number: positive, status: z.literal('completed'), conclusion: z.enum(['success', 'skipped']) })).min(1).max(100) });
const artifactSchema = z.object({ id: positive, name: z.string(), size_in_bytes: positive.max(2 * 1024 * 1024), expired: z.literal(false), digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  created_at: z.iso.datetime({ offset: true }), expires_at: z.iso.datetime({ offset: true }), workflow_run: z.object({ id: positive, head_branch: z.literal('main'), head_sha: sha }) });
export type FullReleaseEvidence = { profile: 'CUSTOMER_CANDIDATE'; sourceSha: string; treeSha: string; runId: string; runAttempt: number; artifactId: number; artifactSha256: string; summarySha256: string; jobsSha256: string };

async function boundedBytes(response: Response, signal: AbortSignal, maximum: number) {
  if (!response.ok || response.redirected || !response.body) throw fail();
  const declared = response.headers.get('content-length'); if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximum)) throw fail();
  const reader = response.body.getReader(), parts: Uint8Array[] = []; let size = 0;
  try { for (;;) {
    const part = await new Promise<ReadableStreamReadResult<Uint8Array>>((done, reject) => {
      const abort = () => { signal.removeEventListener('abort', abort); reject(fail()); }; if (signal.aborted) return abort();
      signal.addEventListener('abort', abort, { once: true }); void reader.read().then(value => { signal.removeEventListener('abort', abort); done(value); }, () => { signal.removeEventListener('abort', abort); reject(fail()); });
    });
    if (signal.aborted) throw fail(); if (part.done) break; size += part.value.length; if (size > maximum) throw fail(); parts.push(part.value);
  } return Buffer.concat(parts); } finally { void reader.cancel().catch(() => undefined); try { reader.releaseLock(); } catch { /* Active cancellation retains cleanup ownership. */ } }
}

/** Current official run, exhaustive jobs and one non-executable profile receipt; no upstream source or broad artifacts are consumed. */
export async function readFullReleaseEvidence(value: { repoRoot: string; githubToken: string; repository: string; sha: string; ciRunId: string }): Promise<FullReleaseEvidence> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 180000);
  try {
    const input = expectedSchema.extend({ repoRoot: z.string().min(1), githubToken: z.string().min(1).max(24576).regex(/^[\x21-\x7e]+$/) }).strict().parse(JSON.parse(canonicalReleaseReviewJson(value)));
    const git = (args: string[]) => execFileSync('git', ['-C', input.repoRoot, ...args], { shell: false, windowsHide: true, timeout: 15000, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], env: Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TMP','TEMP','LANG','LC_ALL'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]).concat([['GIT_NO_REPLACE_OBJECTS','1'],['GIT_CONFIG_NOSYSTEM','1'],['GIT_CONFIG_GLOBAL',process.platform === 'win32' ? 'NUL' : '/dev/null']])) });
    if (git(['rev-parse', 'HEAD']).toString().trim() !== input.sha || git(['ls-files', '--others', '--exclude-standard']).length) throw fail(); git(['diff', '--quiet', 'HEAD', '--']);
    const treeSha = sha.parse(git(['rev-parse', input.sha + '^{tree}']).toString().trim());
    const workflowBytes = git(['show', input.sha + ':' + fullRegressionWorkflowPath]);
    const normalize = (bytes: Uint8Array) => Buffer.from(bytes).toString('utf8').replaceAll('\r\n', '\n');
    if (normalize(await readFile(join(input.repoRoot, fullRegressionWorkflowPath))) !== normalize(workflowBytes)) throw fail();
    if (validateFullRegressionWorkflow(workflowBytes.toString('utf8')).length) throw fail();
    const ciContext = { sha: input.sha, repository: input.repository, ciRunId: input.ciRunId };
    const urlFor = (path: string) => `https://api.github.com/repos/${input.repository}/${path}`;
    const get = async (path: string) => { const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]), response = await fetch(urlFor(path), { method: 'GET', headers: { Authorization: 'Bearer ' + input.githubToken, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, redirect: 'error', cache: 'no-store', credentials: 'omit', signal }); return JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(await boundedBytes(response, signal, 512 * 1024))) as unknown; };
    const run = validateProductionCiRun(await get('actions/runs/' + input.ciRunId), ciContext);
    const rows: z.infer<typeof jobSchema>[] = []; let total: number | undefined;
    for (let page = 1; page <= 10; page++) {
      const response = z.object({ total_count: positive.max(1000), jobs: z.array(jobSchema).max(100) }).parse(await get(`actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100&page=${page}`));
      if (total !== undefined && response.total_count !== total || response.jobs.length === 0) throw fail(); total = response.total_count; rows.push(...response.jobs);
      if (rows.length > total) throw fail(); if (rows.length === total) break; if (response.jobs.length !== 100 || page === 10) throw fail();
    }
    if (rows.length !== total || new Set(rows.map(row => row.id)).size !== rows.length || canonicalReleaseReviewJson(rows.map(row => row.name).sort()) !== canonicalReleaseReviewJson(['codeql-evidence','required','secret-scan','technical-mvp'])) throw fail();
    for (const row of rows) {
      if (row.run_id !== run.id || row.run_attempt !== run.run_attempt || row.head_sha !== run.head_sha) throw fail();
      const policy = fullRegressionJobPolicy[row.name], names = new Set<string>(), numbers = new Set<number>(), authored: string[] = [];
      for (const [index, step] of row.steps.entries()) {
        if (names.has(step.name) || numbers.has(step.number) || index > 0 && step.number <= row.steps[index - 1].number) throw fail(); names.add(step.name); numbers.add(step.number);
        if (policy.steps.includes(step.name)) { if (step.conclusion !== 'success') throw fail(); authored.push(step.name); }
        else if (step.name === 'Set up job' || step.name === 'Complete job') { if (step.conclusion !== 'success') throw fail(); }
        else if (!policy.actionSteps.some(action => step.name === 'Post ' + action)) throw fail();
      }
      if (canonicalReleaseReviewJson(authored) !== canonicalReleaseReviewJson(policy.steps)) throw fail();
    }
    const artifactName = `cuevo-full-verification-${run.id}-${run.run_attempt}`;
    const artifacts = z.object({ total_count: z.number().int().nonnegative().max(100), artifacts: z.array(artifactSchema).max(100) }).parse(await get(`actions/runs/${run.id}/artifacts?per_page=100`));
    if (artifacts.artifacts.length !== artifacts.total_count) throw fail(); const matching = artifacts.artifacts.filter(row => row.name === artifactName); if (matching.length !== 1) throw fail(); const artifact = matching[0];
    if (artifact.workflow_run.id !== run.id || artifact.workflow_run.head_sha !== input.sha || Date.parse(artifact.expires_at) <= Date.now() || Date.parse(artifact.created_at) > Date.now()) throw fail();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]), archiveUrl = urlFor('actions/artifacts/' + artifact.id + '/zip');
    let response = await fetch(archiveUrl, { method: 'GET', headers: { Authorization: 'Bearer ' + input.githubToken, Accept: 'application/vnd.github+json' }, redirect: 'manual', cache: 'no-store', credentials: 'omit', signal });
    if (response.status === 302) { const target = new URL(response.headers.get('location') ?? ''); void response.body?.cancel().catch(() => undefined); if (target.protocol !== 'https:' || target.username || target.password || target.port || target.hash || !(/^productionresultssa[a-z0-9]+\.blob\.core\.windows\.net$/.test(target.hostname) || /^[a-z0-9-]+\.actions\.githubusercontent\.com$/.test(target.hostname))) throw fail(); response = await fetch(target, { method: 'GET', redirect: 'error', cache: 'no-store', credentials: 'omit', signal }); }
    const bytes = await boundedBytes(response, signal, 2 * 1024 * 1024); if (bytes.byteLength !== artifact.size_in_bytes) throw fail();
    const archived = await readSingleJsonArchive(bytes, { archiveSha256: artifact.digest.slice(7), fileName: 'summary.json', maximumJsonBytes: 48 * 1024 });
    validateFullReleaseSummary(archived.value, { ...ciContext, treeSha, runAttempt: run.run_attempt });
    if (canonicalReleaseReviewJson(validateProductionCiRun(await get('actions/runs/' + input.ciRunId), ciContext)) !== canonicalReleaseReviewJson(run)) throw fail();
    const current = z.object({ object: z.object({ type: z.literal('commit'), sha: z.literal(input.sha) }) }).parse(await get('git/ref/heads/main')); if (!current || controller.signal.aborted) throw fail();
    git(['diff', '--quiet', 'HEAD', '--']); if (git(['ls-files', '--others', '--exclude-standard']).length || git(['rev-parse','HEAD']).toString().trim() !== input.sha) throw fail();
    return { profile: 'CUSTOMER_CANDIDATE', sourceSha: input.sha, treeSha, runId: input.ciRunId, runAttempt: run.run_attempt, artifactId: artifact.id, artifactSha256: artifact.digest.slice(7), summarySha256: archived.jsonSha256, jobsSha256: hash(canonicalReleaseReviewJson(rows)) };
  } catch { throw fail(); } finally { clearTimeout(timer); controller.abort(); }
}
