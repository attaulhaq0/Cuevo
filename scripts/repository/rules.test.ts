import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { inventoryRepository } from './check';
import { checkRepository, type RepositoryFile, type RepositoryInventory } from './rules';

const file = (path: string, content?: string): RepositoryFile => ({ path, content });
const inspect = (files: RepositoryFile[] = [], directories: string[] = [], trackedPaths: string[] = []) => checkRepository({ files, directories, trackedPaths });
const code = 'export function readiness(evidence: string | undefined) {\n  return evidence === undefined ? "UNKNOWN" : "REQUIRES_REVIEW";\n}\n';

test('canonical sources allow repeated README text, configuration and historical documentation', () => {
  assert.deepEqual(inspect([
    file('apps/api/src/modules/academic/readiness.ts', code),
    file('apps/web/features/academic/styles.css', '.result { color: var(--text-primary); }'),
    file('apps/api/README.md', 'Same navigation introduction.'),
    file('apps/web/README.md', 'Same navigation introduction.'),
    file('apps/web/next.config.ts', 'export default {};'),
    file('vitest.config.ts', 'export default {};'),
    file('docs/reports/earlier-verification.md', code),
    file('docs/product/history/00-ORIGINAL-BRIEF.md', code),
  ]), []);
});

test('intentional public forwarding surfaces and Next route boilerplate are not duplicate implementations', () => {
  assert.deepEqual(inspect([
    file('apps/web/features/academic/ui.tsx', "export { Workspace } from './components/workspace';\n"),
    file('apps/web/features/progress/ui.tsx', "export { Workspace } from './components/workspace';\n"),
    file('packages/domain/src/index.ts', "export * from './model';\n"),
    file('packages/contracts/src/index.ts', "export * from './model';\n"),
    file('apps/web/app/page.tsx', "export default function Page() { return null; }\n"),
    file('apps/web/app/layout.tsx', "export default function Page() { return null; }\n"),
  ]), []);
});

test('exact duplicate handwritten runtime files are reported with both source paths', () => {
  const issues = inspect([
    file('apps/api/src/modules/academic/readiness.ts', code),
    file('packages/domain/src/readiness-copy.ts', code),
  ]);
  assert.ok(issues.some(issue => issue.rule === 'duplicate-source' && issue.message.includes('apps/api/src/modules/academic/readiness.ts') && issue.message.includes('packages/domain/src/readiness-copy.ts')));
});

test('BOM, CRLF and surrounding whitespace cannot conceal a copied runtime implementation', () => {
  assert.ok(inspect([
    file('apps/web/features/academic/model.ts', code),
    file('apps/web/features/progress/model.ts', `\uFEFF  \r\n${code.replaceAll('\n', '\r\n')} \r\n`),
  ]).some(issue => issue.rule === 'duplicate-source'));
});

test('handwritten CSS copies are checked even when no TypeScript exists in the copied tree', () => {
  assert.ok(inspect([
    file('apps/web/features/academic/styles.css', '.result { color: var(--text-primary); margin-inline: 1rem; }'),
    file('apps/web/features/progress/styles.css', '.result { color: var(--text-primary); margin-inline: 1rem; }'),
  ]).some(issue => issue.rule === 'duplicate-source'));
});

test('identical SQL migrations are reported without changing append-only history', () => {
  assert.ok(inspect([
    file('supabase/migrations/20261001000000_foundation.sql', 'create table private.evidence (id uuid primary key);\n'),
    file('supabase/migrations/20261001010000_foundation_copy.sql', 'create table private.evidence (id uuid primary key);\n'),
  ]).some(issue => issue.rule === 'duplicate-source'));
});

test('normalized numbered product source copies are detected across purpose folders', () => {
  assert.ok(inspect([
    file('docs/product/overview/00-PRODUCT-CONSTITUTION.md', '# Product constitution\n\nMissing is not zero.\n'),
    file('docs/product/domains/04-EVIDENCE-COPY.md', '\uFEFF# Product constitution\r\n\r\nMissing is not zero.\r\n '),
  ]).some(issue => issue.rule === 'duplicate-source'));
});

test('tracked generated artifacts fail even when absent from the authored file inventory', () => {
  const issues = inspect([], [], ['apps/web/.next/trace', 'apps/api/dist/main.js', '.local/reports/run.json', 'apps/web/next-env.d.ts', 'packages/ui/tsconfig.tsbuildinfo']);
  for (const path of ['apps/web/.next/trace', 'apps/api/dist/main.js', '.local/reports/run.json', 'apps/web/next-env.d.ts', 'packages/ui/tsconfig.tsbuildinfo']) {
    assert.ok(issues.some(issue => issue.file === path && issue.rule === 'tracked-generated'));
  }
});

test('tracked credential filenames fail without supplying or printing credential content', () => {
  const issues = inspect([], [], ['.env.local', 'apps/api/credentials.json', '.local/synthetic-accounts.json', 'docker/runtime.pem', '.npmrc', 'docker/secrets/provider.json']);
  for (const path of ['.env.local', 'apps/api/credentials.json', '.local/synthetic-accounts.json', 'docker/runtime.pem', '.npmrc', 'docker/secrets/provider.json']) {
    assert.ok(issues.some(issue => issue.file === path && issue.rule === 'tracked-secret'));
  }
  assert.deepEqual(inspect([], [], ['.env.example', 'apps/api/.env.test.example']), []);
});

test('credential-handling source, tests and documentation remain authored files', () => {
  const paths = ['apps/api/src/platform/secrets.ts', 'docs/architecture/secrets.md', 'tests/e2e/credentials.spec.ts', 'apps/api/src/platform/secrets/provider.ts'];
  assert.deepEqual(inspect(paths.map(value => file(value, `Owned credential-handling implementation ${value}.`)), [], paths), []);
});

test('empty authored leaf directories are reported without duplicating parent findings', () => {
  const issues = inspect([file('apps/api/src/modules/academic/README.md', 'Academic owner.')], ['apps', 'apps/api', 'apps/api/src', 'apps/api/src/modules', 'apps/api/src/modules/academic', 'apps/api/src/modules/academic/components']);
  assert.deepEqual(issues.filter(issue => issue.rule === 'empty-directory').map(issue => issue.file), ['apps/api/src/modules/academic/components']);
});

test('empty unowned root directories cannot evade an inventory that only sees files', () => {
  const issues = inspect([], ['future-package']);
  assert.ok(issues.some(issue => issue.file === 'future-package' && issue.rule === 'unowned-root'));
  assert.ok(issues.some(issue => issue.file === 'future-package' && issue.rule === 'empty-directory'));
});

test('nonempty unowned root folders are reported by ownership rather than extension', () => {
  assert.ok(inspect([file('backup/README.md', 'Original navigation.')], ['backup']).some(issue => issue.rule === 'unowned-root'));
});

test('source-container copies containing only Markdown and CSS cannot bypass ownership', () => {
  const issues = inspect([
    file('apps/api/src/modules-copy/academic/README.md', 'Copied owner.'),
    file('apps/web/features-copy/academic/styles.css', '.old { color: red; }'),
    file('apps/worker/src/processors-copy/README.md', 'Copied processors.'),
  ]);
  assert.ok(issues.some(issue => issue.file === 'apps/api/src/modules-copy' && issue.rule === 'source-layout'));
  assert.ok(issues.some(issue => issue.file === 'apps/web/features-copy' && issue.rule === 'source-layout'));
  assert.ok(issues.some(issue => issue.file === 'apps/worker/src/processors-copy' && issue.rule === 'source-layout'));
});

test('nested copied-container and feature-copy folders remain visible with README files alone', () => {
  const issues = inspect([
    file('apps/api/src/modules/academic/modules-copy/README.md', 'Copied domain container.'),
    file('apps/web/features/learning-copy/README.md', 'Copied learning owner.'),
  ]);
  assert.ok(issues.some(issue => issue.file === 'apps/api/src/modules/academic/modules-copy' && issue.rule === 'source-layout'));
  assert.ok(issues.some(issue => issue.file === 'apps/web/features/learning-copy' && issue.rule === 'source-layout'));
});

test('undeclared deployable applications and shared packages cannot hide behind canonical roots', () => {
  const issues = inspect([
    file('apps/web-copy/README.md', 'Parallel deployable copy.'),
    file('packages/domain-backup/README.md', 'Parallel package copy.'),
  ]);
  assert.ok(issues.some(issue => issue.file === 'apps/web-copy' && issue.rule === 'source-layout'));
  assert.ok(issues.some(issue => issue.file === 'packages/domain-backup' && issue.rule === 'source-layout'));
});

test('Next route handlers with handwritten behavior participate in source duplication checks', () => {
  assert.ok(inspect([
    file('apps/web/app/api/evidence/route.ts', code),
    file('apps/web/app/api/results/route.ts', code),
  ]).some(issue => issue.rule === 'duplicate-source'));
});

test('domain implementation cannot bypass duplicate checks by using a config suffix', () => {
  assert.ok(inspect([
    file('apps/api/src/modules/academic/readiness.config.ts', code),
    file('apps/api/src/modules/learner-state/readiness.config.ts', code),
  ]).some(issue => issue.rule === 'duplicate-source'));
});

test('duplicate paths supplied by cached and other inventories are counted only once', () => {
  const input: RepositoryInventory = { files: [file('packages/domain/src/readiness.ts', code), file('packages/domain/src/readiness.ts', code)], directories: ['packages', 'packages/domain', 'packages/domain/src', 'packages/domain/src'], trackedPaths: [] };
  assert.deepEqual(checkRepository(input), []);
});

test('test fixtures, Storybook stories and empty module sentinels are outside runtime duplication checks', () => {
  assert.deepEqual(inspect([
    file('apps/api/test/unit/a.test.ts', code),
    file('apps/api/test/unit/b.test.ts', code),
    file('packages/ui/src/button.stories.tsx', code),
    file('packages/ui/src/status.stories.tsx', code),
    file('apps/web/features/academic/empty.ts', 'export {};'),
    file('apps/web/features/progress/empty.ts', 'export {};'),
  ]), []);
});

test('inventory paths cannot escape the repository root', () => {
  assert.ok(inspect([file('../external/private.ts', code)]).some(issue => issue.rule === 'inventory-path'));
});

test('real Git inventory sees authored empty directories while keeping ignored files and credential bytes out', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cuevo-repository-inventory-'));
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe', windowsHide: true });
  try {
    git('init', '--quiet');
    await writeFile(path.join(root, '.gitignore'), '.local/\nnode_modules/\n.next/\n.env*\n');
    await mkdir(path.join(root, 'packages/domain/src'), { recursive: true });
    await writeFile(path.join(root, 'packages/domain/src/current.ts'), code);
    await writeFile(path.join(root, 'packages/domain/src/deleted.ts'), 'deleted tracked fixture');
    await mkdir(path.join(root, 'apps/web/.next'), { recursive: true });
    await writeFile(path.join(root, 'apps/web/.next/trace'), 'tracked output fixture');
    git('add', '.gitignore', 'packages');
    git('add', '--force', 'apps/web/.next/trace');
    await rm(path.join(root, 'packages/domain/src/deleted.ts'));
    await writeFile(path.join(root, 'packages/domain/src/untracked.ts'), 'export const draft = "UNKNOWN";');
    await mkdir(path.join(root, '.local/empty'), { recursive: true });
    await writeFile(path.join(root, '.env.local'), 'ignored credential fixture');
    await mkdir(path.join(root, 'apps/api/src/modules/academic/components'), { recursive: true });
    await writeFile(path.join(root, 'credentials.json'), 'unignored credential fixture');
    const inventory = await inventoryRepository(root);
    assert.ok(inventory.files.some(file => file.path === 'packages/domain/src/current.ts'));
    assert.ok(inventory.files.some(file => file.path === 'packages/domain/src/untracked.ts'));
    assert.equal(inventory.files.filter(file => file.path === 'packages/domain/src/current.ts').length, 1);
    assert.ok(!inventory.files.some(file => file.path.endsWith('deleted.ts') || file.path.includes('.next/') || file.path === '.env.local'));
    assert.deepEqual(inventory.files.find(file => file.path === 'credentials.json'), { path: 'credentials.json', content: undefined });
    assert.ok(inventory.directories.includes('apps/api/src/modules/academic/components'));
    assert.ok(!inventory.directories.some(value => value.startsWith('.local') || value.includes('.next') || value === '.git'));
    assert.ok(inventory.trackedPaths.includes('apps/web/.next/trace'));
    const issues = checkRepository(inventory);
    assert.ok(issues.some(issue => issue.file === 'apps/web/.next/trace' && issue.rule === 'tracked-generated'));
    assert.ok(issues.some(issue => issue.file === 'credentials.json' && issue.rule === 'unignored-secret'));
    assert.ok(issues.some(issue => issue.file === 'apps/api/src/modules/academic/components' && issue.rule === 'empty-directory'));
  } finally {
    const resolved = path.resolve(root);
    assert.ok(resolved.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`) && path.basename(resolved).startsWith('cuevo-repository-inventory-'), 'Only the verified temporary fixture directory may be removed.');
    await rm(resolved, { recursive: true, force: true });
  }
});
