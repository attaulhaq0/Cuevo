import { readdirSync, readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import ts from 'typescript';

/** Separate authored acceptance windows; none is a permitted skipped result. */
export const reviewedBrowserExclusions = [
  { file: 'admin-audit-current-source.spec.ts', reason: 'Dedicated frozen synthetic administrator audit runtime.', skipReasons: ['Requires the dedicated synthetic runtime and exact frozen build.'] },
  { file: 'admin-automation-layout.spec.ts', reason: 'Dedicated frozen synthetic administrator automation runtime.', skipReasons: ['Requires the dedicated synthetic runtime and exact frozen build.'] },
  { file: 'admin-connected-access.spec.ts', reason: 'Dedicated frozen administrator runtime and exclusive guardian relationship mutation window.', skipReasons: ['Requires the dedicated synthetic runtime, frozen build and exclusive mutation window.'] },
  { file: 'admin-native-zoom.spec.ts', reason: 'Dedicated frozen synthetic native zoom runtime.', skipReasons: ['Requires dedicated synthetic runtime and frozen build.'] },
  { file: 'admin-selected-record-layout.spec.ts', reason: 'Dedicated frozen synthetic selected-record runtime.', skipReasons: ['Requires the dedicated synthetic runtime and exact frozen build.'] },
  { file: 'coordinator-connected-curriculum.spec.ts', reason: 'Dedicated frozen synthetic coordinator curriculum runtime.', skipReasons: ['Requires the dedicated ignored runtime and an exact frozen build.'] },
  { file: 'coordinator-connected-review.spec.ts', reason: 'Dedicated frozen synthetic coordinator review runtime.', skipReasons: ['Requires exact isolated runtime and frozen production build.'] },
  { file: 'customer-native-report-style.spec.ts', reason: 'Dedicated frozen synthetic report runtime.', skipReasons: ['Requires the dedicated synthetic runtime and frozen report build.'] },
  { file: 'customer-performance.spec.ts', reason: 'Separate opted-in production performance measurement window.', skipReasons: ['Dedicated production browser performance window required.'] },
  { file: 'customer-pilot-volume.spec.ts', reason: 'Separate exclusive guarded pilot-volume fixture window.', skipReasons: ['Committed guarded pilot fixture requires its own exclusive window.'] },
  { file: 'parent-connected-conversation.spec.ts', reason: 'Dedicated frozen Parent runtime with separately scheduled exclusive guardian revocation window.', skipReasons: ['Requires the separate synthetic runtime and frozen build.', 'Root must explicitly schedule the exclusive current guardian window after other Parent journeys.'] },
  { file: 'parent-connected-portfolio.spec.ts', reason: 'Dedicated isolated synthetic Parent Portfolio acceptance runtime.', skipReasons: ['Requires the explicit isolated synthetic Parent acceptance runtime.'] },
  { file: 'parent-connected-school.spec.ts', reason: 'Dedicated frozen synthetic Parent school runtime.', skipReasons: ['Requires the separate synthetic runtime and exact frozen build.'] },
  { file: 'staff-marking-layout.spec.ts', reason: 'Dedicated frozen synthetic staff marking runtime.', skipReasons: ['Requires the dedicated synthetic runtime and exact frozen web build.'] },
  { file: 'student-learning-journey.spec.ts', reason: 'Dedicated isolated synthetic Student learning runtime.', skipReasons: ['Requires explicit separate synthetic Student journey runtime.'] },
  { file: 'student-parent-text-reflow.spec.ts', reason: 'Dedicated frozen synthetic Student/Parent text reflow runtime.', skipReasons: ['Requires the dedicated synthetic runtime and frozen build.'] },
  { file: 'thinking-focus.spec.ts', reason: 'Dedicated frozen synthetic Bloom thinking runtime.', skipReasons: ['Requires the explicitly configured separate synthetic Bloom runtime.'] },
  { file: 'workspace-narrow-header.spec.ts', reason: 'Dedicated frozen synthetic narrow-header runtime.', skipReasons: ['Requires the dedicated synthetic runtime and exact frozen build.'] },
] as const;
export const accountBrowserFiles = ['school-account-admission.spec.ts', 'school-account-recovery.spec.ts', 'account-admission-inert.spec.ts'] as const;
export const compatibilityBrowserFiles = ['customer-experience.spec.ts', 'foundation.spec.ts', 'hydration-diagnostics.spec.ts', 'learning-lifecycle.spec.ts', 'rubric-truth.spec.ts'] as const;
export const ordinaryBrowserExclusionPatterns = [...accountBrowserFiles, ...reviewedBrowserExclusions.map(item => item.file)].map(file => `**/${file}`);

function skipReasons(file: string, source: string): string[] {
  const reasons: string[] = [];
  const syntax = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ['skip', 'fixme'].includes(node.expression.name.text) && /^test(?:\.describe)?$/.test(node.expression.expression.getText(syntax))) {
      const reason = node.arguments.find(argument => ts.isStringLiteralLike(argument));
      reasons.push(reason && ts.isStringLiteralLike(reason) ? reason.text : 'UNREVIEWED');
    }
    ts.forEachChild(node, visit);
  };
  visit(syntax); return reasons;
}
/** Exact excluded filenames and existing opt-in reasons are reviewed together. New skip owners fail. */
export function assertReviewedBrowserExclusions(sources: Record<string, string>): void {
  const reviewed = new Map<string, readonly string[]>(reviewedBrowserExclusions.map(item => [item.file, item.skipReasons]));
  for (const [file, expected] of reviewed) {
    if (!Object.hasOwn(sources, file) || JSON.stringify(skipReasons(file, sources[file]).sort()) !== JSON.stringify([...expected].sort())) throw Error('Reviewed browser exclusion source changed; explicit acceptance scope review is required.');
  }
  for (const [file, source] of Object.entries(sources)) if (!reviewed.has(file) && skipReasons(file, source).length) throw Error('An unreviewed browser skip owner cannot be omitted from verification.');
}
/** Discovers every ordinary authored browser owner; exclusions are exact, never a directory wildcard. */
export function ordinaryBrowserFiles(directory = resolve(import.meta.dirname, '../../tests/e2e')): string[] {
  const files = readdirSync(directory, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile() && entry.name.endsWith('.spec.ts')).map(entry => relative(directory, resolve(entry.parentPath, entry.name)).replaceAll('\\', '/')).sort();
  const sources = Object.fromEntries(files.map(file => [file, readFileSync(resolve(directory, file), 'utf8')]));
  assertReviewedBrowserExclusions(sources);
  const excluded = new Set<string>([...accountBrowserFiles, ...reviewedBrowserExclusions.map(item => item.file)]);
  return files.filter(file => !excluded.has(file));
}

export type BrowserVerificationIdentity = { runId: string; sourceSha: string; sourceDigest: string; scope: string };
export type BrowserVerificationContext = BrowserVerificationIdentity & { startedAt: number; finishedAt: number };
export type BrowserTestIdentity = { id: string; file: string; title: string; titlePath: string[]; projectId: string; projectName: string; line: number; column: number };
export type BrowserInventory = { identity: BrowserVerificationIdentity; configFile: string; rootDir: string; projects: { id: string; name: string }[]; listedAt: number; tests: BrowserTestIdentity[] };
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
const notConfirmed = () => Error('Required browser inventory or execution is not confirmed.');
function requireIdentity(value: unknown): BrowserVerificationIdentity {
  if (!object(value) || Object.keys(value).sort().join(',') !== 'runId,scope,sourceDigest,sourceSha' || typeof value.runId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value.runId) || typeof value.sourceSha !== 'string' || !/^[a-f0-9]{40}$/.test(value.sourceSha) || typeof value.sourceDigest !== 'string' || !/^[a-f0-9]{64}$/.test(value.sourceDigest) || typeof value.scope !== 'string' || !/^[a-z][a-z-]{1,50}$/.test(value.scope)) throw notConfirmed();
  return { runId: value.runId, sourceSha: value.sourceSha, sourceDigest: value.sourceDigest, scope: value.scope };
}
export function browserVerificationMetadata(env: NodeJS.ProcessEnv = process.env): { cuevoBrowserVerification?: BrowserVerificationIdentity } {
  const value = { runId: env.CUEVO_VERIFICATION_RUN_ID, sourceSha: env.CUEVO_VERIFICATION_SOURCE_SHA, sourceDigest: env.CUEVO_VERIFICATION_SOURCE_DIGEST, scope: env.CUEVO_VERIFICATION_SCOPE };
  if (Object.values(value).every(part => part === undefined)) return {};
  return { cuevoBrowserVerification: requireIdentity(value) };
}
function identityFromContext(context: BrowserVerificationContext): BrowserVerificationIdentity {
  if (!Number.isFinite(context.startedAt) || !Number.isFinite(context.finishedAt) || context.finishedAt < context.startedAt) throw notConfirmed();
  return requireIdentity({ runId: context.runId, sourceSha: context.sourceSha, sourceDigest: context.sourceDigest, scope: context.scope });
}
function equal(value: unknown, expected: unknown) { if (JSON.stringify(value) !== JSON.stringify(expected)) throw notConfirmed(); }
function parseReport(input: unknown, context: BrowserVerificationContext, listing: boolean) {
  const identity = identityFromContext(context);
  if (!object(input) || !object(input.config) || !object(input.config.metadata) || !object(input.stats) || !Array.isArray(input.errors) || input.errors.length || !Array.isArray(input.suites) || typeof input.config.configFile !== 'string' || !input.config.configFile || typeof input.config.rootDir !== 'string' || !input.config.rootDir || !Array.isArray(input.config.projects) || !input.config.projects.length) throw notConfirmed();
  equal(requireIdentity(input.config.metadata.cuevoBrowserVerification), identity);
  const projects = input.config.projects.map(project => {
    if (!object(project) || typeof project.id !== 'string' || !project.id || typeof project.name !== 'string' || !project.name || project.repeatEach !== 1 || project.retries !== 0) throw notConfirmed();
    return { id: project.id, name: project.name };
  }).sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(projects.map(project => project.id)).size !== projects.length || new Set(projects.map(project => project.name)).size !== projects.length) throw notConfirmed();
  const time = Date.parse(String(input.stats.startTime));
  if (!Number.isFinite(time) || time < context.startedAt || time > context.finishedAt || typeof input.stats.duration !== 'number' || !Number.isFinite(input.stats.duration) || input.stats.duration < 0 || time + Math.floor(input.stats.duration) > context.finishedAt + 1) throw notConfirmed();
  for (const key of ['expected', 'unexpected', 'flaky', 'skipped']) if (typeof input.stats[key] !== 'number' || !Number.isSafeInteger(input.stats[key]) || (input.stats[key] as number) < 0) throw notConfirmed();
  if (input.stats.unexpected !== 0 || input.stats.flaky !== 0 || (listing ? input.stats.expected !== 0 : input.stats.skipped !== 0)) throw notConfirmed();
  const tests: BrowserTestIdentity[] = [], seen = new Set<string>();
  const visit = (suites: unknown[], parents: string[]) => {
    for (const suite of suites) {
      if (!object(suite) || typeof suite.title !== 'string') throw notConfirmed();
      const path = [...parents, suite.title];
      if (suite.specs !== undefined) {
        if (!Array.isArray(suite.specs)) throw notConfirmed();
        for (const spec of suite.specs) {
          if (!object(spec) || typeof spec.id !== 'string' || !spec.id || seen.has(spec.id) || typeof spec.file !== 'string' || !/^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.spec\.ts$/.test(spec.file) || typeof spec.title !== 'string' || !spec.title || spec.ok !== true || !Number.isSafeInteger(spec.line) || (spec.line as number) < 1 || !Number.isSafeInteger(spec.column) || (spec.column as number) < 1 || !Array.isArray(spec.tests) || spec.tests.length !== 1) throw notConfirmed();
          const test = spec.tests[0];
          if (!object(test) || typeof test.projectId !== 'string' || typeof test.projectName !== 'string' || !projects.some(project => project.id === test.projectId && project.name === test.projectName) || test.expectedStatus !== 'passed' || test.status !== (listing ? 'skipped' : 'expected') || !Array.isArray(test.results) || test.results.length !== (listing ? 0 : 1) || (Array.isArray(test.annotations) && test.annotations.some(annotation => object(annotation) && ['skip', 'fixme', 'fail'].includes(String(annotation.type))))) throw notConfirmed();
          if (!listing) {
            const result = test.results[0];
            if (!object(result) || result.status !== 'passed' || result.retry !== 0 || result.error !== undefined || !Array.isArray(result.errors) || result.errors.length || typeof result.duration !== 'number' || !Number.isFinite(result.duration) || result.duration < 0) throw notConfirmed();
            const start = Date.parse(String(result.startTime));
            if (!Number.isFinite(start) || start < time || start < context.startedAt || start > context.finishedAt || start + Math.floor(result.duration) > context.finishedAt + 1) throw notConfirmed();
          }
          tests.push({ id: spec.id, file: spec.file, title: spec.title, titlePath: [...path, spec.title], projectId: test.projectId, projectName: test.projectName, line: spec.line as number, column: spec.column as number }); seen.add(spec.id);
        }
      }
      if (suite.suites !== undefined) { if (!Array.isArray(suite.suites)) throw notConfirmed(); visit(suite.suites, path); }
    }
  };
  visit(input.suites, []);
  if (!tests.length || tests.length !== (listing ? input.stats.skipped : input.stats.expected)) throw notConfirmed();
  const semantic = tests.map(test => JSON.stringify([test.file, test.titlePath, test.projectId]));
  if (new Set(semantic).size !== tests.length) throw notConfirmed();
  return { identity, configFile: input.config.configFile, rootDir: input.config.rootDir, projects, listedAt: time, tests: tests.sort((a, b) => a.id.localeCompare(b.id)) };
}
/** Original runtime discovery fixes exact identities before execution, rather than trusting its exit. */
export function parseBrowserInventory(input: unknown, expectedFiles: readonly string[], context: BrowserVerificationContext): BrowserInventory {
  if (!expectedFiles.length || new Set(expectedFiles).size !== expectedFiles.length) throw notConfirmed();
  const inventory = parseReport(input, context, true);
  equal([...new Set(inventory.tests.map(test => test.file))].sort(), [...expectedFiles].sort());
  for (const project of inventory.projects) equal([...new Set(inventory.tests.filter(test => test.projectId === project.id).map(test => test.file))].sort(), [...expectedFiles].sort());
  return inventory;
}
/** Every original listed test must complete exactly once; skipped/missing/flaky/retried/stale reports fail. */
export function validateBrowserRunReport(input: unknown, inventory: BrowserInventory, context: BrowserVerificationContext): number {
  const report = parseReport(input, context, false);
  equal(report.identity, inventory.identity); equal(report.configFile, inventory.configFile); equal(report.rootDir, inventory.rootDir); equal(report.projects, inventory.projects); equal(report.tests, inventory.tests);
  if (inventory.listedAt > context.startedAt) throw notConfirmed();
  return report.tests.length;
}

export type BrowserPhaseReceipt = { version: 1; identity: BrowserVerificationIdentity; phaseRunId: string; status: 'VERIFIED'; startedAt: number; finishedAt: number; account: { completedTests: number; inventorySha256: string; reportSha256: string }; ordinary: { completedTests: number; inventorySha256: string; reportSha256: string }; excludedBrowserFiles: { file: string; reason: string }[] };
export function validateBrowserPhaseReceipt(input: unknown, identity: BrowserVerificationIdentity, startedAt: number, finishedAt: number): BrowserPhaseReceipt {
  if (!object(input) || Object.keys(input).sort().join(',') !== 'account,excludedBrowserFiles,finishedAt,identity,ordinary,phaseRunId,startedAt,status,version' || input.version !== 1 || input.status !== 'VERIFIED' || typeof input.phaseRunId !== 'string' || !/^[a-f0-9-]{36}$/.test(input.phaseRunId) || typeof input.startedAt !== 'number' || typeof input.finishedAt !== 'number' || !Number.isFinite(input.startedAt) || !Number.isFinite(input.finishedAt) || input.startedAt < startedAt || input.finishedAt > finishedAt || input.finishedAt < input.startedAt) throw notConfirmed();
  equal(requireIdentity(input.identity), requireIdentity(identity));
  for (const name of ['account', 'ordinary'] as const) {
    const phase = input[name];
    if (!object(phase) || Object.keys(phase).sort().join(',') !== 'completedTests,inventorySha256,reportSha256' || !Number.isSafeInteger(phase.completedTests) || (phase.completedTests as number) < 1 || typeof phase.inventorySha256 !== 'string' || !/^[a-f0-9]{64}$/.test(phase.inventorySha256) || typeof phase.reportSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(phase.reportSha256)) throw notConfirmed();
  }
  if ((input.account as Record<string, unknown>).completedTests !== accountBrowserFiles.length) throw notConfirmed();
  equal(input.excludedBrowserFiles, reviewedBrowserExclusions.map(({ file, reason }) => ({ file, reason })));
  return input as BrowserPhaseReceipt;
}
