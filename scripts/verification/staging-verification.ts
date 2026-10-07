import { createRequire } from 'node:module';
import { z } from 'zod';
import { validateCiRun } from './cicd-contracts';
import { canonicalReleaseReviewJson } from './release-review';

export const stagingVerificationWorkflowPath = '.github/workflows/staging-verification.yml' as const;
const sha = z.string().regex(/^[a-f0-9]{40}$/);
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const repository = z.string().regex(/^[a-zA-Z0-9_.-]{1,100}\/[a-zA-Z0-9_.-]{1,100}$/).refine(value => !value.split('/').some(part => part === '.' || part === '..'));
const baseRun = z.object({ id: positive, head_sha: sha, head_branch: z.literal('main'), status: z.literal('completed'), conclusion: z.literal('success'), repository: z.object({ full_name: repository }).strict() });
const canonicalRun = baseRun.extend({ path: z.literal('.github/workflows/ci.yml'), event: z.literal('push') }).strict();
const focusedRun = baseRun.extend({ path: z.literal(stagingVerificationWorkflowPath), event: z.enum(['push', 'workflow_dispatch']), run_attempt: positive }).strict();
export const backendVerificationRunSchema = z.union([canonicalRun, focusedRun]);
export type BackendVerificationRun = z.infer<typeof backendVerificationRunSchema>;
const unavailable = () => new Error('Backend verification source evidence is unavailable or requires review; contents withheld.');

/** Normalize official metadata to the original CI identity or the bounded focused identity. This alone proves no job results. */
export function validateBackendVerificationRun(value: unknown, expected: { sha: string; repository: string; ciRunId: string }): BackendVerificationRun {
  try {
    const raw: unknown = JSON.parse(canonicalReleaseReviewJson(value));
    const input = z.object({ sha, repository, ciRunId: z.string().regex(/^[1-9][0-9]*$/).refine(value => Number.isSafeInteger(Number(value))) }).strict().parse(JSON.parse(canonicalReleaseReviewJson(expected)));
    const metadata = baseRun.extend({ repository: z.object({ full_name: repository }), path: z.enum(['.github/workflows/ci.yml', stagingVerificationWorkflowPath]), event: z.enum(['push', 'workflow_dispatch']), run_attempt: positive.optional() }).parse(raw);
    if (metadata.head_sha !== input.sha || metadata.repository.full_name !== input.repository || String(metadata.id) !== input.ciRunId) throw unavailable();
    if (metadata.path === '.github/workflows/ci.yml') {
      validateCiRun(raw, input);
      return canonicalRun.parse({ id: metadata.id, head_sha: metadata.head_sha, head_branch: metadata.head_branch, status: metadata.status, conclusion: metadata.conclusion, repository: metadata.repository, path: metadata.path, event: metadata.event });
    }
    return focusedRun.parse(metadata);
  } catch { throw unavailable(); }
}

const checkout = { name: 'Check out frozen source', uses: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', with: { 'persist-credentials': false, 'fetch-depth': 0 } };
const node = { name: 'Set up Node', uses: 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020', with: { 'node-version': '24.16.0', cache: 'npm' } };
const setup = [checkout, node,
  { name: 'Install pinned npm', run: 'npm install --global npm@11.17.0 --ignore-scripts --no-audit --no-fund' },
  { name: 'Install locked dependencies', run: 'npm ci --ignore-scripts --no-audit --no-fund' },
  { name: 'Install local esbuild binary', run: 'node node_modules/esbuild/install.js' }];
const frozenSource = { name: 'Confirm frozen authored source', run: 'git diff --exit-code HEAD -- && test "$(git rev-parse HEAD)" = "$GITHUB_SHA" && test -z "$(git ls-files --others --exclude-standard)"' };
const job = (timeout: number, steps: readonly unknown[]) => ({ if: "github.ref == 'refs/heads/main'", 'runs-on': 'ubuntu-latest', 'timeout-minutes': timeout, steps });
const jobs = {
  'staging-checks': job(30, [...setup,
    { name: 'Verify repository architecture and documentation', run: 'npm run check:repository && npm run test:repository && npm run check:architecture && npm run test:architecture && npm run check:docs && npm run test:docs' },
    { name: 'Verify release admission and workflow contracts', run: 'npm run test:cicd && npm run check:cicd' },
    { name: 'Verify lint types and unit contracts', run: 'npm run lint && npm run typecheck && npm test' },
    { name: 'Verify complete migration and synthetic Auth contracts', run: 'npm run test:hosted-plan' },
    { name: 'Verify build and runtime dependency security', run: 'node --import tsx scripts/verification/dependency-security.ts' }, frozenSource]),
  'staging-database': job(60, [...setup,
    { name: 'Replay guarded clean local synthetic bootstrap', run: 'npm run local:bootstrap' },
    { name: 'Verify complete SQL RLS grants and provider fixtures', run: 'npm run db:test' },
    { name: 'Verify local database security advisors', run: 'node --import tsx scripts/verification/database-advisors.ts' }, frozenSource,
    { name: 'Stop owned local Supabase', if: 'always()', run: 'npx --no-install supabase stop --project-id cuevo' }]),
  codeql: { ...job(20, [...setup,
    { name: 'Require exact canonical source CodeQL security job', env: { GH_TOKEN: '${{ github.token }}' }, run: 'node --import tsx scripts/verification/staging-security.ts' }, frozenSource]), permissions: { contents: 'read', actions: 'read' } },
  'secret-scan': job(20, [...setup,
    { name: 'Verify pinned scanner and full source policy', run: 'node --import tsx --test scripts/verification/secret-scan-policy.test.ts scripts/verification/secret-scan.test.ts' },
    { name: 'Scan full history plus authored worktree', run: 'node --import tsx scripts/verification/secret-scan.ts' }, frozenSource]),
  'staging-required': { if: "always() && github.ref == 'refs/heads/main'", needs: ['staging-checks', 'staging-database', 'codeql', 'secret-scan'], 'runs-on': 'ubuntu-latest', 'timeout-minutes': 5, steps: [
    { name: 'Require every focused staging boundary', env: { CHECKS: '${{ needs.staging-checks.result }}', DATABASE: '${{ needs.staging-database.result }}', CODEQL: '${{ needs.codeql.result }}', SECRET_SCAN: '${{ needs.secret-scan.result }}' },
      run: 'test "$CHECKS" = success && test "$DATABASE" = success && test "$CODEQL" = success && test "$SECRET_SCAN" = success\n' } ] },
};
export const stagingVerificationJobPolicy: Record<string, { steps: string[]; actionSteps: string[] }> = Object.fromEntries(Object.entries(jobs).map(([name, value]) => {
  const steps = value.steps as readonly { name: string; uses?: string }[];
  return [name, { steps: steps.map(step => step.name), actionSteps: steps.filter(step => step.uses !== undefined).map(step => step.name) }];
}));
const workflow = { name: 'Cuevo focused staging verification', on: { push: { branches: ['main'] }, workflow_dispatch: null }, permissions: { contents: 'read' },
  concurrency: { group: 'cuevo-staging-verification-${{ github.ref }}', 'cancel-in-progress': true }, env: { CI: 'true', NEXT_TELEMETRY_DISABLED: '1', SCARF_ANALYTICS: 'false' }, jobs };
const yaml = createRequire(import.meta.url)('js-yaml') as { load(text: string): unknown };

/** Exact semantic workflow contract: no secret-bearing or skipped alternate verification path is accepted. */
export function validateStagingVerificationWorkflow(text: string): string[] {
  try { return canonicalReleaseReviewJson(yaml.load(text)) === canonicalReleaseReviewJson(workflow) ? [] : ['Focused staging workflow must preserve the exact main-only secret-free verification boundaries.']; }
  catch { return ['Focused staging workflow is invalid or unverified.']; }
}
