import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCodeqlGateContext, runCodeqlAlertGate, type CodeqlGateInput } from './codeql-alerts';

const sha = 'a'.repeat(40), headSha = 'b'.repeat(40), sarifId = '01234567-89ab-cdef-0123-456789abcdef';
const input: CodeqlGateInput = { repository: 'example/cuevo', ref: 'refs/pull/1/merge', sha, checkoutSha: sha, sarifId, token: 'synthetic-test-token' };
const key = '.github/workflows/ci.yml:codeql';

test('retained processed receipt binds original same-job analysis and excludes private alert context', async () => {
  const subject = await import('./codeql-alerts');
  assert.equal(typeof subject.prepareCodeqlReceipt, 'function');
  const result = await runCodeqlAlertGate(input, fixture().transport);
  const env = { CI:'true', GITHUB_ACTIONS:'true', GITHUB_JOB:'codeql', GITHUB_REPOSITORY:input.repository, GITHUB_SHA:sha, GITHUB_WORKFLOW_SHA:sha,
    GITHUB_REF:input.ref, GITHUB_WORKFLOW_REF:'example/cuevo/.github/workflows/ci.yml@refs/pull/1/merge', GITHUB_RUN_ID:'42', GITHUB_RUN_ATTEMPT:'2' };
  const receipt = subject.prepareCodeqlReceipt(input, result, env, Date.parse('2026-10-06T10:01:00Z'));
  assert.equal(receipt.runId,'42'); assert.equal(receipt.runAttempt,2); assert.equal(receipt.analysis.id,20); assert.equal(receipt.analysis.sarifId,sarifId);
  assert.equal(receipt.ref,input.ref); assert.equal(receipt.sourceSha,sha); assert.equal(receipt.policy,'CODEQL_MEDIUM_HIGH_CRITICAL_V1');
  assert.doesNotMatch(JSON.stringify(receipt),/synthetic-test-token|PRIVATE SOURCE|js\/test-rule/);
  for(const change of [{GITHUB_RUN_ATTEMPT:'0'},{GITHUB_WORKFLOW_SHA:headSha},{GITHUB_JOB:'other'}]) assert.throws(()=>subject.prepareCodeqlReceipt(input,result,{...env,...change},Date.parse('2026-10-06T10:01:00Z')));
  assert.throws(()=>subject.prepareCodeqlReceipt(input,{...result,status:'FINDINGS',blockingAlerts:1},env,Date.parse('2026-10-06T10:01:00Z')));
});
const analysis = () => ({ id: 20, ref: input.ref, commit_sha: sha, analysis_key: key, category: key, environment: '{}',
  tool: { name: 'CodeQL', version: '2.27.1', guid: null }, sarif_id: sarifId, results_count: 0, rules_count: 87,
  created_at: '2026-10-06T10:00:00Z', error: '', warning: '' });
function alert(number: number, severity: string | null = 'medium') {
  return { number, state: 'open', rule: { id: 'js/test-rule', severity: 'error', security_severity_level: severity },
    tool: { name: 'CodeQL', version: '2.27.1', guid: null },
    most_recent_instance: { ref: input.ref, commit_sha: sha, analysis_key: key, category: key, environment: '{}', state: 'open' },
    message: 'PRIVATE SOURCE MUST NOT BE PRINTED' };
}
type FixtureOptions = { alerts?: ReturnType<typeof alert>[]; mutate?: (url: URL, value: unknown, count: number) => unknown;
  headers?: (url: URL) => Record<string, string>; response?: (url: URL, count: number) => Response | undefined };
function fixture(options: FixtureOptions = {}) {
  const calls: string[] = []; let alertPass = 0;
  const transport = async (raw: string, init: RequestInit) => {
    calls.push(raw); const url = new URL(raw);
    assert.equal(url.origin, 'https://api.github.com'); assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error');
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer synthetic-test-token');
    const response = options.response?.(url, calls.length); if (response) return response;
    let value: unknown;
    if (url.pathname === '/repos/example/cuevo') value = { id: 1398726649, full_name: input.repository };
    else if (url.pathname.endsWith('/git/ref/pull/1/merge')) value = { ref: input.ref, object: { type: 'commit', sha } };
    else if (url.pathname.endsWith('/sarifs/' + sarifId)) value = { processing_status: 'complete', errors: null,
      analyses_url: 'https://api.github.com/repos/example/cuevo/code-scanning/analyses?sarif_id=' + sarifId };
    else if (url.pathname.endsWith('/analyses')) value = [analysis()];
    else if (url.pathname.endsWith('/alerts')) {
      assert.equal(url.searchParams.get('ref'), input.ref); assert.equal(url.searchParams.get('tool_name'), 'CodeQL');
      assert.equal(url.searchParams.get('state'), 'open');
      const page = Number(url.searchParams.get('page')); if (page === 1) alertPass++;
      value = (options.alerts ?? []).slice((page - 1) * 100, page * 100);
    } else assert.fail('Unexpected fixed endpoint');
    value = options.mutate?.(url, value, alertPass) ?? value;
    return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json', ...options.headers?.(url) } });
  };
  return { calls, transport };
}

test('complete same-upload PR merge analysis and two stable open-alert scans establish the threshold gate', async () => {
  const f = fixture(); const result = await runCodeqlAlertGate(input, f.transport);
  assert.equal(result.status, 'VERIFIED'); assert.equal(result.openAlerts, 0); assert.equal(result.analysisResults, 0);
  assert.equal(result.analysisRules, 87); assert.equal(result.snapshotPasses, 2); assert.equal(result.blockingAlerts, 0);
  assert.equal(f.calls.filter(url => new URL(url).pathname.endsWith('/alerts')).length, 2);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-test-token|PRIVATE SOURCE|js\/test-rule/);
});
test('the original three medium findings fail even though SARIF processing and analysis succeeded', async () => {
  const f = fixture({ alerts: [alert(8), alert(9), alert(10)], mutate: (url, value) => url.pathname.endsWith('/analyses') ? [{ ...analysis(), results_count: 3 }] : value });
  const result = await runCodeqlAlertGate(input, f.transport);
  assert.equal(result.status, 'FINDINGS'); assert.equal(result.blockingAlerts, 3); assert.equal(result.severities.medium, 3);
  assert.equal(result.analysisResults, 3); assert.doesNotMatch(JSON.stringify(result), /PRIVATE SOURCE|js\/test-rule/);
});
test('high and critical block while explicit low and nonsecurity findings remain separately reported', async () => {
  const f = fixture({ alerts: [alert(1, 'low'), alert(2, null), alert(3, 'high'), alert(4, 'critical')],
    mutate: (url, value) => url.pathname.endsWith('/analyses') ? [{ ...analysis(), results_count: 4 }] : value });
  const result = await runCodeqlAlertGate(input, f.transport);
  assert.equal(result.blockingAlerts, 2); assert.equal(result.openAlerts, 4);
  assert.deepEqual(result.severities, { low: 1, medium: 0, high: 1, critical: 1, nonsecurity: 1 });
});
test('a PR head SHA cannot stand in for the actually analyzed merge SHA', async () => {
  const f = fixture(); await assert.rejects(runCodeqlAlertGate({ ...input, sha: headSha, checkoutSha: headSha }, f.transport));
  assert.notEqual(input.sha, headSha);
});
test('invalid context and checkout/source mismatch refuse before any credential request', async () => {
  for (const change of [{ checkoutSha: headSha }, { ref: 'refs/tags/v1' }, { repository: 'other/../cuevo' }, { sarifId: '' }, { token: 'bad\nsecret' }]) {
    const f = fixture(); await assert.rejects(runCodeqlAlertGate({ ...input, ...change }, f.transport)); assert.equal(f.calls.length, 0);
  }
});
test('pending, failed, absent or partially processed SARIF cannot become zero findings', async () => {
  for (const value of [{ processing_status: 'pending', errors: null }, { processing_status: 'failed', errors: null }, {},
    { processing_status: 'complete', errors: ['PRIVATE PROCESSING ERROR'] }, { processing_status: 'complete', errors: null, analyses_url: 'https://evil.invalid/' }]) {
    const f = fixture({ mutate: (url, original) => url.pathname.includes('/sarifs/') ? value : original });
    await assert.rejects(runCodeqlAlertGate(input, f.transport), error => error instanceof Error && !error.message.includes('PRIVATE'));
  }
});
test('missing, ambiguous, stale, warning-bearing or incomplete analysis provenance is unavailable', async () => {
  for (const rows of [[], [analysis(), analysis()], [{ ...analysis(), commit_sha: headSha }], [{ ...analysis(), ref: 'refs/heads/main' }],
    [{ ...analysis(), analysis_key: 'other' }], [{ ...analysis(), category: 'other' }], [{ ...analysis(), environment: '{"language":"other"}' }],
    [{ ...analysis(), sarif_id: '11111111-1111-1111-1111-111111111111' }], [{ ...analysis(), rules_count: 0 }],
    [{ ...analysis(), error: 'PRIVATE ERROR' }], [{ ...analysis(), warning: '123 results ignored' }]]) {
    const f = fixture({ mutate: (url, original) => url.pathname.endsWith('/analyses') ? rows : original });
    await assert.rejects(runCodeqlAlertGate(input, f.transport));
  }
});
test('all alert pages are checked including a blocking alert after the first hundred', async () => {
  const rows = Array.from({ length: 101 }, (_, index) => alert(index + 1, index === 100 ? 'medium' : 'low'));
  const f = fixture({ alerts: rows, mutate: (url, value) => url.pathname.endsWith('/analyses') ? [{ ...analysis(), results_count: 101 }] : value });
  const result = await runCodeqlAlertGate(input, f.transport);
  assert.equal(result.openAlerts, 101); assert.equal(result.blockingAlerts, 1);
  assert.equal(f.calls.filter(url => new URL(url).pathname.endsWith('/alerts') && new URL(url).searchParams.get('page') === '2').length, 2);
});
test('duplicate page rows and untrusted pagination links are refused instead of dropping evidence', async () => {
  const duplicates = fixture({ alerts: [alert(1), alert(1)] }); await assert.rejects(runCodeqlAlertGate(input, duplicates.transport));
  const foreign = fixture({ headers: url => url.pathname.endsWith('/alerts') ? { link: '<https://evil.invalid/?page=2>; rel="next"' } : Object.create(null) as Record<string, string> });
  await assert.rejects(runCodeqlAlertGate(input, foreign.transport)); assert.ok(foreign.calls.every(url => !url.includes('evil.invalid')));
});
test('valid GitHub pagination is followed and a later-page access error cannot become a partial pass', async () => {
  const rows = Array.from({ length: 100 }, (_, index) => alert(index + 1, 'low'));
  const links = fixture({ alerts: rows, headers: url => {
    if (!url.pathname.endsWith('/alerts') || url.searchParams.get('page') !== '1') return Object.create(null) as Record<string, string>;
    const next = new URL(url); next.searchParams.set('page', '2'); return { link: `<${next}>; rel="next", <${next}>; rel="last"` };
  }, mutate: (url, value) => url.pathname.endsWith('/analyses') ? [{ ...analysis(), results_count: 100 }] : value });
  assert.equal((await runCodeqlAlertGate(input, links.transport)).openAlerts, 100);
  const partial = fixture({ alerts: rows, response: url => url.pathname.endsWith('/alerts') && url.searchParams.get('page') === '2'
    ? new Response('PRIVATE ACCESS ERROR', { status: 403 }) : undefined });
  await assert.rejects(runCodeqlAlertGate(input, partial.transport), error => error instanceof Error && !error.message.includes('PRIVATE'));
});
test('GitHub numeric repository pagination retains its bound repository, collection and query', async () => {
  const native = fixture({ headers: url => {
    if (!url.pathname.endsWith('/analyses') || url.searchParams.has('sarif_id') || url.searchParams.get('page') !== '1') return Object.create(null) as Record<string, string>;
    const next = new URL(url); next.pathname = '/repositories/1398726649/code-scanning/analyses'; next.searchParams.set('page', '2');
    return { link: `<${next}>; rel="next", <${next}>; rel="last"` };
  }, mutate: (url, value) => url.pathname.endsWith('/analyses') && url.searchParams.get('page') === '2'
    ? [{ ...analysis(), id: 19, sarif_id: '11111111-1111-1111-1111-111111111111', commit_sha: headSha }] : value });
  const result = await runCodeqlAlertGate(input, native.transport); assert.equal(result.status, 'VERIFIED');
  assert.equal(native.calls[0], 'https://api.github.com/repos/example/cuevo');
  assert.equal(native.calls.filter(raw => new URL(raw).pathname.endsWith('/analyses') && new URL(raw).searchParams.get('page') === '2').length, 2);
});
test('foreign numeric repository, other collection and altered ref/source queries cannot be pagination aliases', async () => {
  for (const change of ['repository', 'collection', 'ref', 'sha', 'sarif', 'tool']) {
    const f = fixture({ headers: url => {
      if (!url.pathname.endsWith('/analyses')) return Object.create(null) as Record<string, string>;
      const next = new URL(url); next.pathname = '/repositories/1398726649/code-scanning/analyses'; next.searchParams.set('page', '2');
      if (change === 'repository') next.pathname = '/repositories/1398726650/code-scanning/analyses';
      if (change === 'collection') next.pathname = '/repositories/1398726649/code-scanning/alerts';
      if (change === 'ref') next.searchParams.set('ref', 'refs/heads/main');
      if (change === 'sha') next.searchParams.set('sha', headSha);
      if (change === 'sarif') next.searchParams.set('sarif_id', '11111111-1111-1111-1111-111111111111');
      if (change === 'tool') next.searchParams.set('tool_name', 'Other');
      return { link: `<${next}>; rel="next"` };
    } });
    await assert.rejects(runCodeqlAlertGate(input, f.transport));
    assert.ok(f.calls.every(raw => !new URL(raw).pathname.startsWith('/repositories/')));
  }
});
test('repository metadata must bind the exact current name and a valid numeric identifier before evidence requests', async () => {
  for (const metadata of [{ id: 1398726649, full_name: 'foreign/cuevo' }, { full_name: input.repository }, { id: 0, full_name: input.repository },
    { id: '1398726649', full_name: input.repository }, { id: Number.MAX_SAFE_INTEGER + 1, full_name: input.repository }]) {
    const f = fixture({ mutate: (url, value) => url.pathname === '/repos/example/cuevo' ? metadata : value });
    await assert.rejects(runCodeqlAlertGate(input, f.transport)); assert.equal(f.calls.length, 1);
  }
});
test('missing severity, stale source, foreign tool or unreadable instance cannot be ignored', async () => {
  for (const row of [{ ...alert(1), rule: { id: 'js/test-rule', severity: 'error' } }, alert(1, 'unknown'),
    { ...alert(1), most_recent_instance: { ...alert(1).most_recent_instance, commit_sha: headSha } },
    { ...alert(1), most_recent_instance: { ...alert(1).most_recent_instance, ref: 'refs/heads/main' } },
    { ...alert(1), most_recent_instance: null }, { ...alert(1), tool: { name: 'Other', version: '1', guid: null } }]) {
    const f = fixture({ mutate: (url, original) => url.pathname.endsWith('/alerts') ? [row] : original });
    await assert.rejects(runCodeqlAlertGate(input, f.transport));
  }
});
test('changed ref or newer analysis during pagination makes the observations unavailable', async () => {
  for (const kind of ['ref', 'analysis']) {
    let reads = 0;
    const f = fixture({ mutate: (url, value) => {
      if (kind === 'ref' && url.pathname.includes('/git/ref/') && ++reads > 1) return { ref: input.ref, object: { type: 'commit', sha: headSha } };
      if (kind === 'analysis' && url.pathname.endsWith('/analyses') && !url.searchParams.has('sarif_id') && ++reads > 1) return [{ ...analysis(), id: 21 }];
      return value;
    } }); await assert.rejects(runCodeqlAlertGate(input, f.transport));
  }
});
test('an alert changed between the two scans cannot establish a stable threshold result', async () => {
  const f = fixture({ mutate: (url, value, pass) => url.pathname.endsWith('/alerts') && pass > 1 ? [alert(1)] : value });
  await assert.rejects(runCodeqlAlertGate(input, f.transport));
});
test('alert evidence cannot exceed the same-upload result count or report another tool version', async () => {
  const excessive = fixture({ alerts: [alert(1)] }); await assert.rejects(runCodeqlAlertGate(input, excessive.transport));
  const version = fixture({ mutate: (url, value) => url.pathname.endsWith('/alerts') ? [{ ...alert(1), tool: { name: 'CodeQL', version: 'stale', guid: null } }]
    : url.pathname.endsWith('/analyses') ? [{ ...analysis(), results_count: 1 }] : value });
  await assert.rejects(runCodeqlAlertGate(input, version.transport));
});
test('request failure and stream failure are minimized and cancelled rather than leaked', async () => {
  await assert.rejects(runCodeqlAlertGate(input, async () => { throw new Error('PRIVATE TRANSPORT ERROR'); }), error => error instanceof Error && !error.message.includes('PRIVATE'));
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(3 * 1024 * 1024)); }, cancel() { cancelled = true; } });
  const oversized = fixture({ response: () => new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }) });
  await assert.rejects(runCodeqlAlertGate(input, oversized.transport)); assert.equal(cancelled, true);
});
test('HTTP failure, malformed JSON, redirect and oversized body preserve unavailable status without body leakage', async () => {
  for (const response of [() => new Response('PRIVATE ERROR', { status: 403 }), () => new Response('PRIVATE ERROR', { status: 503 }),
    () => new Response('{PRIVATE', { status: 200 }), () => new Response('{}', { status: 302, headers: { location: 'https://evil.invalid/' } }),
    () => new Response('{}', { status: 200, headers: { 'content-length': String(5 * 1024 * 1024) } })]) {
    const f = fixture({ response }); await assert.rejects(runCodeqlAlertGate(input, f.transport), error => error instanceof Error && !error.message.includes('PRIVATE'));
  }
});
test('Actions context binds same-job SARIF output and exact workflow path, merge ref and checkout', () => {
  const env = { CI: 'true', GITHUB_ACTIONS: 'true', GITHUB_SERVER_URL: 'https://github.com', GITHUB_API_URL: 'https://api.github.com',
    GITHUB_REPOSITORY: input.repository, GITHUB_REF: input.ref, GITHUB_SHA: sha, GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_WORKFLOW_REF: 'example/cuevo/.github/workflows/ci.yml@refs/pull/1/merge', GITHUB_JOB: 'codeql',
    CUEVO_CODEQL_SARIF_ID: sarifId, GH_TOKEN: input.token };
  assert.deepEqual(readCodeqlGateContext(env, sha), input);
  for (const change of [{ GITHUB_JOB: 'other' }, { GITHUB_API_URL: 'https://evil.invalid' }, { GITHUB_SHA: headSha },
    { CUEVO_CODEQL_SARIF_ID: '' }, { GITHUB_WORKFLOW_REF: 'example/cuevo/.github/workflows/other.yml@refs/pull/1/merge' }, { GITHUB_EVENT_NAME: 'pull_request_target' }]) {
    assert.throws(() => readCodeqlGateContext({ ...env, ...change }, sha));
  }
});
