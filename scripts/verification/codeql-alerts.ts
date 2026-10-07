import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { canonicalReleaseReviewJson } from './release-review';

export type CodeqlGateInput = { repository: string; ref: string; sha: string; checkoutSha: string; sarifId: string; token: string };
type Transport = (url: string, init: RequestInit) => Promise<Response>;
type ObjectValue = Record<string, unknown>;
const unavailable = () => new Error('CodeQL alert evidence is unavailable or requires review; contents withheld.');
const analysisKey = '.github/workflows/ci.yml:codeql';
const maximumPages = 50, maximumBody = 2 * 1024 * 1024;
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER), nonnegative = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const digestSha = z.string().regex(/^[a-f0-9]{40}$/), identifier = z.string().regex(/^[1-9][0-9]*$/).refine(value => Number.isSafeInteger(Number(value)));
const analysisSchema = z.object({ id: positive, sarifId: z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/), key: z.literal(analysisKey), toolVersion: z.string().min(1).max(100), createdAt: z.iso.datetime({ offset: true }) }).strict();
const resultSchema = z.object({ check: z.literal('codeql-open-security-alerts'), status: z.literal('VERIFIED'), analysisResults: nonnegative, analysisRules: positive,
  openAlerts: nonnegative, blockingAlerts: z.literal(0), severities: z.object({ low: nonnegative, medium: z.literal(0), high: z.literal(0), critical: z.literal(0), nonsecurity: nonnegative }).strict(), snapshotPasses: z.literal(2), analysis: analysisSchema }).strict();
const receiptSchema = z.object({ version: z.literal(1), purpose: z.literal('ORIGINAL_PROCESSED_CODEQL_RECEIPT'), policy: z.literal('CODEQL_MEDIUM_HIGH_CRITICAL_V1'),
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/), sourceSha: digestSha, ref: z.string(), runId: identifier, runAttempt: positive,
  observedAt: z.iso.datetime({ offset: true }), analysis: analysisSchema, result: resultSchema.omit({ analysis: true }) }).strict();

/** A successful same-job processed observation; no alert rows, messages, paths or credentials enter the receipt. */
export function prepareCodeqlReceipt(input: CodeqlGateInput, result: unknown, env: Record<string,string|undefined>, now: number) {
  validInput(input);
  if(env.CI!=='true'||env.GITHUB_ACTIONS!=='true'||env.GITHUB_JOB!=='codeql'||env.GITHUB_SHA!==input.sha||env.GITHUB_WORKFLOW_SHA!==input.sha||env.GITHUB_REPOSITORY!==input.repository||env.GITHUB_REF!==input.ref
    ||env.GITHUB_WORKFLOW_REF!==`${input.repository}/.github/workflows/ci.yml@${input.ref}`||!Number.isSafeInteger(now)||now<0)throw unavailable();
  const proof=resultSchema.parse(JSON.parse(canonicalReleaseReviewJson(result)));
  if(proof.analysis.sarifId!==input.sarifId||Date.parse(proof.analysis.createdAt)>now||proof.openAlerts!==proof.severities.low+proof.severities.nonsecurity||proof.openAlerts>proof.analysisResults)throw unavailable();
  const {analysis,...summary}=proof;
  return receiptSchema.parse({version:1,purpose:'ORIGINAL_PROCESSED_CODEQL_RECEIPT',policy:'CODEQL_MEDIUM_HIGH_CRITICAL_V1',repository:input.repository,sourceSha:input.sha,ref:input.ref,
    runId:env.GITHUB_RUN_ID,runAttempt:Number(env.GITHUB_RUN_ATTEMPT),observedAt:new Date(now).toISOString(),analysis,result:summary});
}

export function validateCodeqlReceipt(value: unknown, expected: { repository:string; sourceSha:string; ref:string; runId:string; runAttempt:number; startedAt:string; completedAt:string; now:number }) {
  const receipt=receiptSchema.parse(JSON.parse(canonicalReleaseReviewJson(value)));
  const started=Date.parse(expected.startedAt),completed=Date.parse(expected.completedAt),observed=Date.parse(receipt.observedAt),created=Date.parse(receipt.analysis.createdAt);
  if(receipt.repository!==expected.repository||receipt.sourceSha!==expected.sourceSha||receipt.ref!==expected.ref||receipt.runId!==expected.runId||receipt.runAttempt!==expected.runAttempt
    ||!Number.isFinite(started)||!Number.isFinite(completed)||completed<started||completed>expected.now||created<started||created>observed||observed>completed
    ||receipt.result.openAlerts!==receipt.result.severities.low+receipt.result.severities.nonsecurity||receipt.result.openAlerts>receipt.result.analysisResults)throw unavailable();
  return receipt;
}

function object(value: unknown): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw unavailable();
  return value as ObjectValue;
}
function count(value: unknown, positive = false): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (positive ? 1 : 0)) throw unavailable();
  return value;
}
function validInput(input: CodeqlGateInput) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input.repository) || input.repository.split('/').some(part => ['.', '..'].includes(part))
    || !/^refs\/heads\/[A-Za-z0-9_./-]+$|^refs\/pull\/[1-9][0-9]*\/merge$/.test(input.ref)
    || input.ref.includes('..') || input.ref.endsWith('/') || !/^[a-f0-9]{40}$/.test(input.sha) || input.checkoutSha !== input.sha
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input.sarifId)
    || typeof input.token !== 'string' || !input.token.length || input.token.length > 24576 || /[^\x21-\x7e]/.test(input.token)) throw unavailable();
}
export function readCodeqlGateContext(env: Record<string, string | undefined>, checkoutSha: string): CodeqlGateInput {
  const input = { repository: env.GITHUB_REPOSITORY ?? '', ref: env.GITHUB_REF ?? '', sha: env.GITHUB_SHA ?? '', checkoutSha,
    sarifId: env.CUEVO_CODEQL_SARIF_ID ?? '', token: env.GH_TOKEN ?? '' };
  validInput(input);
  if (env.CI !== 'true' || env.GITHUB_ACTIONS !== 'true' || env.GITHUB_JOB !== 'codeql'
    || env.GITHUB_SERVER_URL !== 'https://github.com' || env.GITHUB_API_URL !== 'https://api.github.com'
    || !['push', 'pull_request', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME ?? '')
    || (env.GITHUB_EVENT_NAME === 'pull_request') !== input.ref.startsWith('refs/pull/')
    || env.GITHUB_WORKFLOW_REF !== `${input.repository}/.github/workflows/ci.yml@${input.ref}`) throw unavailable();
  return input;
}
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((done, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(unavailable()); };
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    void promise.then(value => { signal.removeEventListener('abort', abort); if (signal.aborted) reject(unavailable()); else done(value); },
      () => { signal.removeEventListener('abort', abort); reject(unavailable()); });
  });
}
async function json(response: Response, signal: AbortSignal) {
  if (response.status !== 200 || response.redirected || !response.body
    || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) throw unavailable();
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximumBody)) throw unavailable();
  const reader = response.body.getReader(), parts: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const part = await abortable(reader.read(), signal); if (part.done) break;
      size += part.value.byteLength; if (size > maximumBody) throw unavailable(); parts.push(part.value);
    }
    return JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(Buffer.concat(parts))) as unknown;
  } finally {
    void reader.cancel().catch(() => undefined);
    try { reader.releaseLock(); } catch { /* A cancelled pending read retains its final cleanup. */ }
  }
}
function pagination(link: string | null, current: URL, numericRepositoryBase: string): boolean {
  if (link === null) return false;
  if (!link.length || link.length > 16384) throw unavailable();
  let next = false; const relations = new Set<string>();
  for (const part of link.split(',')) {
    const match = /^\s*<([^>]+)>;\s*rel="(next|prev|first|last)"\s*$/.exec(part); if (!match) throw unavailable();
    const [, raw, relation] = match; if (relations.has(relation)) throw unavailable(); relations.add(relation);
    const url = new URL(raw), page = url.searchParams.get('page'), actual = Number(current.searchParams.get('page'));
    const collection = current.pathname.endsWith('/code-scanning/analyses') ? 'analyses'
      : current.pathname.endsWith('/code-scanning/alerts') ? 'alerts' : null;
    if (!collection || url.origin !== current.origin
      || ![current.pathname, new URL(`${numericRepositoryBase}/code-scanning/${collection}`).pathname].includes(url.pathname)
      || url.username || url.password || url.hash
      || !page || !/^[1-9][0-9]*$/.test(page) || !Number.isSafeInteger(Number(page))) throw unavailable();
    const expected = new URL(current); expected.searchParams.set('page', page);
    if (JSON.stringify([...url.searchParams].sort()) !== JSON.stringify([...expected.searchParams].sort())) throw unavailable();
    if (relation === 'next') { if (Number(page) !== actual + 1) throw unavailable(); next = true; }
    if (relation === 'prev' && Number(page) !== actual - 1 || relation === 'first' && Number(page) !== 1
      || relation === 'last' && Number(page) < actual) throw unavailable();
  }
  return next;
}
function parseAnalysis(value: unknown, input: CodeqlGateInput) {
  const row = object(value), tool = object(row.tool);
  if (row.ref !== input.ref || row.commit_sha !== input.sha || row.sarif_id !== input.sarifId || row.analysis_key !== analysisKey
    || row.category !== analysisKey || row.environment !== '{}' || row.error !== '' || row.warning !== ''
    || tool.name !== 'CodeQL' || typeof tool.version !== 'string' || !tool.version.length
    || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))) throw unavailable();
  return { id: count(row.id, true), results: count(row.results_count), rules: count(row.rules_count, true), version: tool.version, createdAt: row.created_at };
}
function parseAlert(value: unknown, input: CodeqlGateInput) {
  const row = object(value), rule = object(row.rule), tool = object(row.tool), instance = object(row.most_recent_instance);
  if (row.state !== 'open' || tool.name !== 'CodeQL' || typeof tool.version !== 'string' || !tool.version.length
    || typeof rule.id !== 'string' || !rule.id.length || ![null, 'none', 'note', 'warning', 'error'].includes(rule.severity as string | null)
    || instance.ref !== input.ref || instance.commit_sha !== input.sha || instance.analysis_key !== analysisKey
    || instance.environment !== '{}' || instance.state !== 'open' || instance.category !== undefined && instance.category !== analysisKey
    || !Object.hasOwn(rule, 'security_severity_level') || ![null, 'low', 'medium', 'high', 'critical'].includes(rule.security_severity_level as string | null)) throw unavailable();
  return { number: count(row.number, true), severity: rule.security_severity_level as 'low' | 'medium' | 'high' | 'critical' | null,
    rule: rule.id, toolVersion: tool.version };
}

/** GET-only threshold evidence for this job's processed upload; no alert dismissal or provider settings mutation. */
export async function runCodeqlAlertGate(input: CodeqlGateInput, transport: Transport = fetch) {
  validInput(input);
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 60000);
  const base = `https://api.github.com/repos/${input.repository}`;
  let numericRepositoryBase = '';
  const request = async (url: URL | string) => {
    const raw = url.toString(), signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]);
    const response = await abortable(transport(raw, { method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store',
      headers: { Authorization: `Bearer ${input.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, signal }), signal);
    if (response.url && response.url !== raw) throw unavailable();
    return { value: await json(response, signal), link: response.headers.get('link') };
  };
  const list = async (path: 'analyses' | 'alerts', query: Record<string, string>) => {
    const rows: unknown[] = [], ids = new Set<number>();
    for (let page = 1; page <= maximumPages; page++) {
      const url = new URL(`${base}/code-scanning/${path}`);
      for (const [key, value] of Object.entries({ ...query, per_page: '100', page: String(page) })) url.searchParams.set(key, value);
      const response = await request(url); if (!Array.isArray(response.value) || response.value.length > 100) throw unavailable();
      for (const row of response.value) {
        const id = count(object(row)[path === 'alerts' ? 'number' : 'id'], true); if (ids.has(id)) throw unavailable(); ids.add(id); rows.push(row);
      }
      const next = pagination(response.link, url, numericRepositoryBase);
      if (response.value.length < 100 && !next) return rows;
      if (next && response.value.length === 0) throw unavailable();
    }
    throw unavailable();
  };
  const repositoryIdentity = async () => {
    const row = object((await request(base)).value);
    if (row.full_name !== input.repository) throw unavailable();
    numericRepositoryBase = `https://api.github.com/repositories/${count(row.id, true)}`;
  };
  const currentRef = async () => {
    const refPath = input.ref.slice('refs/'.length).split('/').map(encodeURIComponent).join('/');
    const row = object((await request(`${base}/git/ref/${refPath}`)).value), reference = object(row.object);
    if (row.ref !== input.ref || reference.type !== 'commit' || reference.sha !== input.sha) throw unavailable();
  };
  const processing = async () => {
    const row = object((await request(`${base}/code-scanning/sarifs/${input.sarifId}`)).value);
    if (row.processing_status !== 'complete' || !(row.errors === null || Array.isArray(row.errors) && row.errors.length === 0)
      || row.analyses_url !== `${base}/code-scanning/analyses?sarif_id=${input.sarifId}`) throw unavailable();
  };
  const currentAnalysis = async () => {
    const rows = await list('analyses', { ref: input.ref, tool_name: 'CodeQL', sarif_id: input.sarifId });
    if (rows.length !== 1) throw unavailable(); const exact = parseAnalysis(rows[0], input);
    // Ref-level alert APIs describe the latest analysis; an older same-SHA rerun cannot admit them.
    const latest = await list('analyses', { ref: input.ref, tool_name: 'CodeQL', sort: 'created', direction: 'desc' });
    if (!latest.length || parseAnalysis(latest[0], input).id !== exact.id) throw unavailable();
    return exact;
  };
  try {
    await repositoryIdentity(); await currentRef(); await processing(); const initial = await currentAnalysis();
    const snapshot = async () => (await list('alerts', { ref: input.ref, tool_name: 'CodeQL', state: 'open' }))
      .map(row => parseAlert(row, input)).sort((a, b) => a.number - b.number);
    const first = await snapshot(), second = await snapshot();
    if (JSON.stringify(first) !== JSON.stringify(second) || first.length > initial.results || first.some(row => row.toolVersion !== initial.version)) throw unavailable();
    const final = await currentAnalysis(); await processing(); await currentRef();
    if (JSON.stringify(initial) !== JSON.stringify(final)) throw unavailable();
    const severities = { low: 0, medium: 0, high: 0, critical: 0, nonsecurity: 0 };
    for (const row of first) severities[row.severity ?? 'nonsecurity']++;
    const blockingAlerts = severities.medium + severities.high + severities.critical;
    return { check: 'codeql-open-security-alerts', status: blockingAlerts ? 'FINDINGS' as const : 'VERIFIED' as const,
      analysisResults: initial.results, analysisRules: initial.rules, openAlerts: first.length, blockingAlerts, severities, snapshotPasses: 2 as const,
      analysis: { id: initial.id, sarifId: input.sarifId, key: analysisKey, toolVersion: initial.version, createdAt: initial.createdAt } };
  } catch { throw unavailable(); } finally { clearTimeout(timer); controller.abort(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const gitEnv = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'LANG', 'LC_ALL'].filter(key => process.env[key] !== undefined)
      .map(key => [key, process.env[key]]).concat([['GIT_NO_REPLACE_OBJECTS', '1'], ['GIT_CONFIG_NOSYSTEM', '1'], ['GIT_CONFIG_GLOBAL', process.platform === 'win32' ? 'NUL' : '/dev/null']]));
    const checkout = execFileSync('git', ['rev-parse', '--verify', 'HEAD^{commit}'], { env: gitEnv, shell: false, windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 }).toString().trim();
    const context=readCodeqlGateContext(process.env, checkout),result = await runCodeqlAlertGate(context);
    if(result.status==='VERIFIED'){
      const receipt=prepareCodeqlReceipt(context,result,process.env,Date.now());
      await mkdir(resolve('.local/codeql-receipt'),{recursive:true});
      await writeFile(resolve('.local/codeql-receipt/receipt.json'),canonicalReleaseReviewJson(receipt),{flag:'wx',mode:0o600});
    }
    console.log(JSON.stringify(result)); if (result.status !== 'VERIFIED') process.exitCode = 1;
  } catch {
    console.log(JSON.stringify({ check: 'codeql-open-security-alerts', status: 'UNAVAILABLE' })); process.exitCode = 1;
  }
}
