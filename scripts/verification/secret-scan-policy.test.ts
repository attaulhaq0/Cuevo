import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { secretScanAsset, secretScanArgs, secretScanSummary, validateAuthoredPath, reviewedNonCredential } from './secret-scan-policy';

test('secret scan fixes tool release/checksums and full ancestor history including merge diffs', () => {
  assert.deepEqual(secretScanAsset('linux', 'x64'), {
    version: '8.30.1', filename: 'gitleaks_8.30.1_linux_x64.tar.gz', executable: 'gitleaks',
    sha256: '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb',
  });
  assert.equal(secretScanAsset('win32', 'x64').sha256, 'd29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e');
  assert.throws(() => secretScanAsset('linux', 'arm64'));
  const history = secretScanArgs('history', '/repo', '/owned/report.json', '/owned/config.toml', '/owned/empty.ignore');
  assert.deepEqual(history.slice(0, 4), ['git', '/repo', '--log-opts', '--full-history -m -a --no-ext-diff --no-textconv HEAD']);
  assert.ok(history.includes('--redact=100'));
  assert.ok(history.includes('--ignore-gitleaks-allow'));
  assert.equal(history.includes('--verbose'), false);
  assert.equal(history.some(value => /--no-merges|origin\/main\.\.|--baseline-path|--all/.test(value)), false);
  assert.equal(secretScanArgs('worktree', '/authored', '/owned/report.json', '/owned/config.toml', '/owned/empty.ignore')[0], 'dir');
});

test('reviewed noncredentials require exact rule path whole-line hash and historical source identity', () => {
  const source = { file: 'supabase/migrations/20261001100303_analytics_claim_scope_aliases.sql', rule: 'generic-api-key', line: 15, endLine: 15,
    lineSha256: '87b621c0119e89e1492ff84c7ad2a338476a8882fe05e7b3538121fe7f3a0d26', commit: '946cca0d9d31a128a950c64ddeb4507d72806ab2', ancestorVerified: true };
  assert.equal(reviewedNonCredential('history', source), true);
  assert.equal(reviewedNonCredential('worktree', { ...source, commit: '', ancestorVerified: false }), true);
  for (const changed of [{ file: 'supabase/migrations/other.sql' }, { rule: 'private-key' }, { lineSha256: 'a'.repeat(64) }, { endLine: 16 }, { line: 0 }, { commit: '' }, { commit: 'not-a-sha' }, { ancestorVerified: false }]) assert.equal(reviewedNonCredential('history', { ...source, ...changed }), false);
  assert.equal(reviewedNonCredential('worktree', { ...source, file: 'tests/new-secret.ts' }), false);
  assert.equal(reviewedNonCredential('worktree', { ...source, lineSha256: 'b'.repeat(64) }), false);
});

test('reviewed public host target IDs require their exact owner line and retained history authority', () => {
  const line = readFileSync(new URL('./backend-staging-host-contract.test.ts', import.meta.url), 'utf8').split(/\r?\n/).find(value => value.startsWith('const ref = '));
  assert.ok(line);
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  const source = { file: 'scripts/verification/backend-staging-host-contract.test.ts', rule: 'generic-api-key', line: 26, endLine: 26,
    lineSha256: hash(line), commit: '8c60031e9c803ed074bfa0200390c22cef3d53ab', ancestorVerified: true };
  assert.equal(source.lineSha256, 'cd4729f7836f41c6cf954523a729453834a81879fcd3bb0e4fb5aa8392a60e03');
  assert.equal(reviewedNonCredential('history', source), true);
  assert.equal(reviewedNonCredential('worktree', { ...source, line: 27, endLine: 27, commit: '', ancestorVerified: false }), true);
  for (const changed of [{ file: 'scripts/verification/other.test.ts' }, { rule: 'private-key' }, { lineSha256: hash(line + " const token = 'synthetic-canary';") },
    { lineSha256: hash(line.replace('const ref = ', 'const token = ')) }, { endLine: 27 }, { line: 0 }, { line: 26.5 }, { commit: '' }, { commit: 'not-a-sha' }, { ancestorVerified: false }]) {
    assert.equal(reviewedNonCredential('history', { ...source, ...changed }), false);
  }
  assert.equal(reviewedNonCredential('worktree', { ...source, file: 'scripts/verification/other.test.ts' }), false);
  assert.equal(reviewedNonCredential('worktree', { ...source, lineSha256: hash(line + '\n') }), false);
});

test('secret scan emits fixed fileless categories and refuses unknown/missing or inconsistent scanner results', () => {
  const report = [
    { RuleID: 'github-pat', Secret: 'private-canary', Match: 'private-answer', File: '.env', Commit: 'sensitive', Author: 'private-person' },
    { RuleID: 'private-key', File: 'private-pupil-file' },
    { RuleID: 'generic-api-key' },
    { RuleID: 'untrusted-secret-looking-rule' },
  ];
  const summary = secretScanSummary('history', 1, report);
  assert.deepEqual(summary, { scope: 'history', status: 'FINDINGS', findingCount: 4, categories: { 'api-token': 1, 'private-key': 1, 'generic-secret': 1, other: 1 } });
  for (const value of ['private-canary', 'private-answer', '.env', 'sensitive', 'private-person', 'untrusted-secret-looking-rule']) assert.equal(JSON.stringify(summary).includes(value), false);
  assert.deepEqual(secretScanSummary('worktree', 0, []), { scope: 'worktree', status: 'CLEAN', findingCount: 0, categories: {} });
  for (const [exit, output] of [[null, []], [2, []], [0, report], [1, []], [0, {}], [0, null], [1, [{}]]] as const) assert.throws(() => secretScanSummary('history', exit, output));
});

test('authored paths cannot select ignored recovery/output/private env or escape the repository', () => {
  for (const path of ['apps/web/app/page.tsx', 'docs/product/index.md', '.env.example', 'package-lock.json', 'tests/e2e/test.ts']) assert.equal(validateAuthoredPath(path), path);
  for (const path of ['', '../.env', '/outside/file', 'C:/private/file', 'a/../../b', '.git/config', '.local/archive/file', '.env', '.env.local', 'apps/api/.env.production', 'node_modules/package/index.js', 'apps/web/.next/static/a.js', 'dist/key', 'a\\..\\secret', 'a\0file']) assert.throws(() => validateAuthoredPath(path));
});
