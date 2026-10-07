import { existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { z } from 'zod';
import ts from 'typescript';
import { technicalResult } from './rules';
import { fullRuntimeVerificationSteps, mainStagingVerificationSteps, routineVerificationSteps, verificationSteps } from './steps';

export type VerificationProfile = 'full' | 'routine' | 'full-runtime' | 'main-staging';
export function readVerificationProfile(args: readonly string[]): VerificationProfile | 'ci' {
  if (!args.length || args.length === 1 && args[0] === '--profile=full') return 'full';
  if (args.length === 1 && args[0] === '--profile=routine') return 'routine';
  if (args.length === 1 && args[0] === '--profile=ci') return 'ci';
  throw Error('Verification requires the full default or one explicit routine profile.');
}
export function verificationProfileSteps(profile: VerificationProfile) {
  if (profile === 'full') return verificationSteps;
  if (profile === 'routine') return routineVerificationSteps;
  if (profile === 'full-runtime') return fullRuntimeVerificationSteps;
  if (profile === 'main-staging') return mainStagingVerificationSteps;
  throw Error('Verification profile is unrecognized.');
}
type EvidenceRow = { name: string; exitCode: number | null; required: boolean; durationMs?: number };
const evidenceRow = z.object({ name: z.string().min(1), exitCode: z.number().int().nullable(), required: z.literal(true), durationMs: z.number().finite().nonnegative().optional() }).strict();
export function verificationEvidence(profile: VerificationProfile, rows: EvidenceRow[]) {
  rows = z.array(evidenceRow).min(1).max(1000).parse(rows);
  const expected = [...verificationProfileSteps(profile).map(step => step.name), 'source-freeze'];
  if (JSON.stringify(rows.map(row => row.name)) !== JSON.stringify(expected) || rows.some(row => row.required !== true)) throw Error('Verification evidence must contain exactly its own required profile rows.');
  const status = technicalResult(rows).status;
  if (profile === 'full') return { status, rows };
  const prefix=profile==='routine'?'ROUTINE':profile==='main-staging'?'MAIN_STAGING':'FULL_RUNTIME';
  return { profile, status: `${prefix}_${status}`, rows };
}
/** Existing owner suites cover Auth/scope, school setup, native academic/evidence, proposal approval, measured support and private transport. */
export const criticalIntegrationFiles = [
  'apps/api/test/integration/auth-provisioning-local-api.test.ts',
  'apps/api/test/integration/school-selection-api.test.ts',
  'apps/api/test/integration/school-entitlements-read-api.test.ts',
  'apps/api/test/integration/learning-lifecycle-api.test.ts',
  'apps/api/test/integration/academic-api.test.ts',
  'apps/api/test/integration/learner-state-api.test.ts',
  'apps/api/test/integration/intelligence-api.test.ts',
  'apps/api/test/integration/improvement-api.test.ts',
  'apps/api/test/integration/result-parent-publication-api.test.ts',
  'apps/api/test/integration/assets-api.test.ts',
  'apps/api/test/integration/realtime-authorization-api.test.ts',
  'apps/api/test/integration/worker-dispatch-api.test.ts',
  'apps/api/test/integration/customer-adversarial-api.test.ts',
] as const;
/** Current all-role bilingual/mobile/axe plus full visible learning loop, immutable feedback and original actor command scope. */
export const criticalBrowserFiles = ['foundation.spec.ts', 'role-home.spec.ts', 'role-accessibility.spec.ts', 'hydration-diagnostics.spec.ts', 'learning-lifecycle.spec.ts', 'customer-browser-learning-loop.spec.ts', 'customer-command-scope.spec.ts'] as const;
const ownerBrowserFiles: Record<string, readonly string[]> = {
  academic: ['academic-truth.spec.ts','academic-report.spec.ts','result-parent-publication.spec.ts'],
  community: ['community-safety.spec.ts','community-member-source-pagination.spec.ts','customer-community-actions.spec.ts'],
  curriculum: ['curriculum-lifecycle-review.spec.ts','curriculum-runtime-behavior.spec.ts','curriculum-record-context.spec.ts'],
  development: ['development-source-state.spec.ts','development-learner-context.spec.ts','recognition-actions.spec.ts'],
  home: ['exact-home-destinations.spec.ts','customer-arabic-home.spec.ts'],
  improvement: ['improvement-loop.spec.ts','improvement-current-list-state.spec.ts'],
  learning: ['learning-content-lifecycle.spec.ts','learning-source-navigation.spec.ts','learning-completion-receipt.spec.ts'],
  portfolio: ['portfolio-sharing-recovery.spec.ts','portfolio-history-source-refusal.spec.ts','customer-private-file.spec.ts'],
  progress: ['progress-current-context.spec.ts','progress-run-source-states.spec.ts'],
  'restricted-records': ['restricted-records.spec.ts','restricted-create-recovery-state.spec.ts'],
  school: ['school-current-sources.spec.ts','school-daily-source-refusal.spec.ts','school-access-revision.spec.ts'],
};
export const routineBrowserFiles = [...new Set([...criticalBrowserFiles,...Object.values(ownerBrowserFiles).flat()])].sort();
export function criticalBrowserFilesForChanges(files:readonly string[]):string[]{return classifyRuntimeChanges(files,true).browserFiles;}
export const mappedBrowserFilesForChanges=criticalBrowserFilesForChanges;
export function criticalBrowserArguments(files:readonly string[]):string[]{
 if(new Set(files).size!==files.length||criticalBrowserFiles.some(file=>!files.includes(file))||files.some(file=>!routineBrowserFiles.includes(file)||!existsSync(resolve('tests/e2e',file))))throw Error('Critical browser arguments must retain all core tests and exact mapped owner files.');
 return files.map(file=>`tests/e2e/${file}`);
}
export function classifyRuntimeChanges(files: readonly string[], trustedPolicyAvailable: boolean): { profile: 'routine' | 'full-runtime'; browserFiles: string[] } {
  const full = { profile: 'full-runtime' as const, browserFiles: [...routineBrowserFiles] };
  if (!trustedPolicyAvailable || !files.length || files.length > 10000) return full;
  const owners = new Set<string>();
  for (const path of files) {
    if (!path || path.includes('\\') || path.split('/').some(part => !part || ['.', '..'].includes(part))) return full;
    // This is a focused browser scope, never an authorization exemption. All
    // profiles still run complete SQL and the critical Auth/domain API owners.
    // Public models/API surfaces, server/session/policy and unknown owners widen.
    const match = /^apps\/web\/features\/([^/]+)\/(.+)\.(css|md|ts|tsx)$/.exec(path);
    if (!match || !Object.hasOwn(ownerBrowserFiles, match[1])) return full;
    const local = match[2];
    if (/(?:^|\/)(?:server|session|authorization|permissions|policy|policies)(?:\/|$)/.test(local) || /(?:^|\/)(?:model|api|copy|ui|index|middleware|route)$/.test(local)) return full;
    owners.add(match[1]);
  }
  return { profile: 'routine', browserFiles: [...new Set([...criticalBrowserFiles,...[...owners].flatMap(owner=>ownerBrowserFiles[owner])])].sort() };
}
/** Changes to imports, exports, dynamic dependency targets or server execution
 * directives require broad review even when the original file is a UI owner. */
function uiBoundary(source: string, file: string) {
 const parsed=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS),boundaries:string[]=[];
 const inspect=(node:ts.Node)=>{
  if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node))boundaries.push(node.getText(parsed));
  if(ts.isExportAssignment(node))boundaries.push('export-assignment');
  if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(node.expression)&&node.expression.text==='require'))boundaries.push(node.getText(parsed));
  if(ts.isExpressionStatement(node)&&ts.isStringLiteral(node.expression)&&node.expression.text==='use server')boundaries.push('use server');
  ts.forEachChild(node,inspect);
 };
 inspect(parsed);return boundaries.sort();
}
/** Only an immutable baseline policy identical to this selector can authorize narrowing; any selector change runs full affected runtime. */
export async function readCiRuntimeSelection(env: Record<string,string|undefined> = process.env) {
  const mainPush=env.GITHUB_EVENT_NAME==='push'&&env.GITHUB_REF==='refs/heads/main';
  const full: { profile: 'main-staging' | 'full-runtime'; browserFiles: string[] } = { profile: mainPush ? 'main-staging' : 'full-runtime', browserFiles: mainPush ? [...criticalBrowserFiles] : [...routineBrowserFiles] };
  try {
    if (env.CI !== 'true' || env.GITHUB_ACTIONS !== 'true' || !env.GITHUB_EVENT_PATH || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '') || !['push','pull_request'].includes(env.GITHUB_EVENT_NAME ?? '')) return full;
    const gitEnv = { ...env, GIT_NO_REPLACE_OBJECTS:'1', GIT_CONFIG_NOSYSTEM:'1', GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null' };
    const git = (args:string[]) => execFileSync('git',args,{env:gitEnv,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:15000,maxBuffer:2*1024*1024}).toString();
    const head = git(['rev-parse','--verify','HEAD^{commit}']).trim(); if (head !== env.GITHUB_SHA) return full;
    const event:unknown = JSON.parse(await readFile(env.GITHUB_EVENT_PATH,'utf8')); let base:string;
    if (env.GITHUB_EVENT_NAME === 'pull_request') {
      const source = z.object({ pull_request:z.object({base:z.object({sha:z.string().regex(/^[a-f0-9]{40}$/),ref:z.literal('main')}),merge_commit_sha:z.literal(head)}) }).parse(event);
      if (env.GITHUB_BASE_REF !== 'main') return full; base = source.pull_request.base.sha;
    } else { const source = z.object({before:z.string().regex(/^[a-f0-9]{40}$/),after:z.literal(head),ref:z.literal('refs/heads/main')}).parse(event); base=source.before; }
    git(['merge-base','--is-ancestor',base,head]);
    const selector='scripts/verification/verification-profiles.ts',baseline=git(['show',`${base}:${selector}`]);
    if(baseline!==git(['show',`${head}:${selector}`]))return full;
    // Treat moves as deletion + addition so the original sensitive owner cannot
    // disappear behind an otherwise admissible CSS/Markdown destination.
    const changes=git(['diff','--no-ext-diff','--no-textconv','--no-renames','--name-status','-z',base,head,'--']).split('\0').filter(Boolean);
    if(changes.length%2!==0)return full;
    const files:string[]=[];
    for(let index=0;index<changes.length;index+=2){
      if(!['M','D'].includes(changes[index]))return{...full,browserFiles:[...routineBrowserFiles]}; // New files/interfaces need separately reviewed owner admission.
      files.push(changes[index+1]);
      const path=changes[index+1];
      if(changes[index]==='M'&&/\.tsx?$/.test(path)&&JSON.stringify(uiBoundary(git(['show',`${base}:${path}`]),path))!==JSON.stringify(uiBoundary(git(['show',`${head}:${path}`]),path)))return{...full,browserFiles:[...routineBrowserFiles]};
    }
    const classified=classifyRuntimeChanges(files,true);
    return mainPush?{profile:'main-staging' as const,browserFiles:classified.browserFiles}:classified;
  } catch { return full; }
}
export function integrationArguments(args: readonly string[]): string[] {
  const full = args.length === 0;
  if (!full && !(args.length === 1 && args[0] === '--profile=critical')) throw Error('Integration requires the full default or one explicit critical profile.');
  if (!full && criticalIntegrationFiles.some(file => !existsSync(resolve(file)))) throw Error('A required critical integration owner is missing.');
  return ['node_modules/vitest/vitest.mjs', 'run', '--allowOnly=false', '--fileParallelism=false', '--reporter=default', '--reporter=json', `--outputFile=.local/customer-readiness/${full ? 'integration' : 'critical-integration'}-results.json`, ...(full ? ['--exclude','apps/api/test/integration/customer-foundry-live-api.test.ts','apps/api/test/integration'] : criticalIntegrationFiles)];
}
/** Live-provider execution has its own approved spending/acceptance window. */
export const integrationExclusions = [{ file:'apps/api/test/integration/customer-foundry-live-api.test.ts', reason:'LIVE_PROVIDER_APPROVAL_AND_BUDGET_REQUIRED' }] as const;
export function fullIntegrationFiles(): string[] {
  const discover = (directory:string):string[] => readdirSync(directory,{withFileTypes:true}).flatMap(entry => entry.isDirectory()?discover(`${directory}/${entry.name}`):entry.name.endsWith('.test.ts')?[`${directory}/${entry.name}`]:[]);
  const files = discover('apps/api/test/integration').filter(file => !integrationExclusions.some(excluded=>excluded.file===file)).sort();
  if (!files.length || integrationExclusions.some(row=>!existsSync(resolve(row.file)))) throw Error('Complete fixture integration inventory is unavailable.');
  return files;
}
export function validateIntegrationRunReport(value:unknown, inventory:unknown, context:{ expectedFiles:readonly string[]; startedAt:number; finishedAt:number }) {
  const cases = z.array(z.object({file:z.string().min(1),name:z.string().min(1)})).min(1).parse(inventory);
  const assertion = z.object({ ancestorTitles:z.array(z.string()),title:z.string(),status:z.literal('passed'),failureMessages:z.array(z.unknown()).length(0) });
  const report = z.object({success:z.literal(true),startTime:z.number().finite(),numPendingTests:z.literal(0),numTodoTests:z.literal(0),numFailedTests:z.literal(0),numTotalTests:z.number().int().positive(),numPassedTests:z.number().int().positive(),testResults:z.array(z.object({name:z.string(),status:z.literal('passed'),startTime:z.number().finite(),endTime:z.number().finite(),message:z.literal(''),assertionResults:z.array(assertion).min(1)})).min(1)}).parse(value);
  const invalid=()=>Error('Complete integration execution does not match its original fresh inventory.');
  if(!Number.isFinite(context.startedAt)||!Number.isFinite(context.finishedAt)||context.finishedAt<context.startedAt||report.startTime<context.startedAt||report.startTime>context.finishedAt)throw invalid();
  const expectedFiles=context.expectedFiles.map(file=>resolve(file)).sort(), listedFiles=[...new Set(cases.map(row=>resolve(row.file)))].sort();
  if(JSON.stringify(listedFiles)!==JSON.stringify(expectedFiles)||JSON.stringify(report.testResults.map(row=>resolve(row.name)).sort())!==JSON.stringify(expectedFiles))throw invalid();
  const expected=cases.map(row=>JSON.stringify([resolve(row.file),row.name])).sort();
  const actual=report.testResults.flatMap(row=>{
    if(row.startTime<context.startedAt||row.endTime<row.startTime||row.endTime>context.finishedAt)throw invalid();
    return row.assertionResults.map(test=>JSON.stringify([resolve(row.name),[...test.ancestorTitles,test.title].join(' > ')]));
  }).sort();
  if(new Set(expected).size!==expected.length||new Set(actual).size!==actual.length||JSON.stringify(actual)!==JSON.stringify(expected)||report.numTotalTests!==actual.length||report.numPassedTests!==actual.length)throw invalid();
  return actual.length;
}
export function validateCriticalIntegrationReport(value: unknown) {
  const result = z.object({ success: z.literal(true), numPendingTests: z.literal(0), numFailedTests: z.literal(0), testResults: z.array(z.object({ name: z.string(), status: z.literal('passed'), assertionResults: z.array(z.object({ status: z.literal('passed') })).min(1) })) }).parse(value);
  const expected = criticalIntegrationFiles.map(file => resolve(file)).sort();
  if (JSON.stringify(result.testResults.map(row => resolve(row.name)).sort()) !== JSON.stringify(expected)) throw Error('Critical integration results must discover every exact owner without skipped or extra files.');
}
const browserTest = z.object({ projectName: z.literal('critical-chromium'), status: z.literal('expected'), expectedStatus: z.literal('passed'), results: z.array(z.object({ status: z.literal('passed'), retry: z.literal(0) })).length(1) });
type BrowserSuite = { file?: string; specs?: { ok: true; tests: z.infer<typeof browserTest>[] }[]; suites?: BrowserSuite[] };
const browserSuite: z.ZodType<BrowserSuite> = z.lazy(() => z.object({ file: z.string().optional(), specs: z.array(z.object({ ok: z.literal(true), tests: z.array(browserTest).length(1) })).optional(), suites: z.array(browserSuite).optional() }));
export function validateCriticalBrowserReport(value: unknown, expectedFiles:readonly string[]=criticalBrowserFiles) {
  const report = z.object({ stats: z.object({ expected: z.number().int().positive(), unexpected: z.literal(0), flaky: z.literal(0), skipped: z.literal(0) }), suites: z.array(browserSuite).min(1) }).parse(value);
  const files = new Set<string>(); let tests = 0;
  const inspect = (suite: BrowserSuite, parent?: string) => { const file = suite.file ?? parent; for (const spec of suite.specs ?? []) { if (!file || !expectedFiles.includes(basename(file))) throw Error('Critical browser report contains an unexpected source file.'); files.add(basename(file)); tests += spec.tests.length; } for (const child of suite.suites ?? []) inspect(child, file); };
  report.suites.forEach(suite => inspect(suite));
  if (tests !== report.stats.expected || JSON.stringify([...files].sort()) !== JSON.stringify([...expectedFiles].sort())) throw Error('Critical browser report must include all explicit owners without skips, missing tests or other engines.');
}
