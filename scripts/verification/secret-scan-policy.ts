export type SecretScanScope = 'history' | 'worktree';
type Category = 'api-token' | 'private-key' | 'generic-secret' | 'other';
export type SecretScanSummary = { scope: SecretScanScope; status: 'CLEAN' | 'FINDINGS'; findingCount: number; categories: Partial<Record<Category, number>> };
// Independently reviewed 6 October: prose/evidence hashes/SQL identifiers, never credential literals.
// Exact full-line hashes retain historical evidence without changing applied migration bytes.
const reviewedLines = new Map([
  ['docs/decisions/2026-10-04-local-review-quick-login.md', '58317f939f70214e2a9d1058f832d96157460a000976be1e7e2a48c7d3792067'],
  ['docs/reports/2026-10-04-reviewed-thinking-focus-verification.md', '1975535e7403dcd58c6b2275eeb398a841960d5062cb29463b947f1c0785595d'],
  ['docs/reports/2026-10-03-initial-school-and-recovery.md', '2c15a0fff706dc611bd6c077d9511e73aaed8fbc7a65060c01ca1c0368ac60b1'],
  ['docs/mvp-developer-testing.md', '584ef26519ea50ce26170e4229633e732be29e4c0d8fc16d089d6f56c9012e39'],
  ['supabase/migrations/20261001100303_analytics_claim_scope_aliases.sql', '87b621c0119e89e1492ff84c7ad2a338476a8882fe05e7b3538121fe7f3a0d26'],
  ['supabase/migrations/20261001095613_fixture_analytics_delivery.sql', 'f56c892569fa3468abce93a73cc7999018b6de7c58ffa29fc8826114241f56f5'],
]);
export function reviewedNonCredential(scope: SecretScanScope, source: { file: string; rule: string; line: number; endLine: number; lineSha256: string; commit: string; ancestorVerified: boolean }): boolean {
  return source.rule === 'generic-api-key' && Number.isSafeInteger(source.line) && source.line > 0 && source.endLine === source.line
    && reviewedLines.get(source.file) === source.lineSha256
    && (scope === 'worktree' || /^[a-f0-9]{40}$/.test(source.commit) && source.ancestorVerified);
}

export function secretScanAsset(platform: string, architecture: string) {
  if (architecture !== 'x64' || !['linux', 'win32'].includes(platform)) throw Error('Pinned secret scanner is unavailable for this platform.');
  return platform === 'linux'
    ? { version: '8.30.1', filename: 'gitleaks_8.30.1_linux_x64.tar.gz', executable: 'gitleaks', sha256: '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb' }
    : { version: '8.30.1', filename: 'gitleaks_8.30.1_windows_x64.zip', executable: 'gitleaks.exe', sha256: 'd29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e' };
}

export function secretScanArgs(scope: SecretScanScope, source: string, report: string, config: string, ignore: string): string[] {
  return [scope === 'history' ? 'git' : 'dir', source, ...(scope === 'history' ? ['--log-opts', '--full-history -m -a --no-ext-diff --no-textconv HEAD'] : []),
    '--config', config, '--gitleaks-ignore-path', ignore, '--ignore-gitleaks-allow', '--redact=100', '--no-banner', '--no-color',
    '--log-level', 'error', '--report-format', 'json', '--report-path', report, '--timeout', '300', '--exit-code', '1'];
}

export function secretScanSummary(scope: SecretScanScope, exit: number | null, value: unknown): SecretScanSummary {
  if (![0, 1].includes(exit as number) || !Array.isArray(value)) throw Error('Secret scanner returned unavailable or invalid evidence.');
  const categories: Partial<Record<Category, number>> = {};
  for (const row of value) {
    if (!row || typeof row !== 'object' || !('RuleID' in row) || typeof row.RuleID !== 'string' || !row.RuleID.length) throw Error('Secret scanner finding evidence is incomplete.');
    const category: Category = row.RuleID === 'private-key' ? 'private-key' : row.RuleID === 'generic-api-key' ? 'generic-secret'
      : /^(github-|gitlab-|aws-|gcp-|google-|slack-|stripe-|supabase-|openai-|npm-|pypi-)/.test(row.RuleID) ? 'api-token' : 'other';
    categories[category] = (categories[category] ?? 0) + 1;
  }
  if (exit !== (value.length ? 1 : 0)) throw Error('Secret scanner exit and finding evidence disagree.');
  return { scope, status: value.length ? 'FINDINGS' : 'CLEAN', findingCount: value.length, categories };
}

export function validateAuthoredPath(path: string): string {
  const parts = path.split('/');
  if (!path || path.includes('\\') || /[\0\r\n:]/.test(path) || parts.some(part => !part || part === '.' || part === '..'
    || ['.git', '.local', 'node_modules', '.next', 'dist', 'coverage', 'playwright-report', 'test-results', 'storybook-static'].includes(part)
    || part === '.env' || part.startsWith('.env.') && part !== '.env.example')) throw Error('Secret scan refuses paths outside current authored repository files.');
  return path;
}
