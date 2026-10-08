import { createRequire } from 'node:module';
import { canonicalReleaseReviewJson } from './release-review';

const yaml = createRequire(import.meta.url)('js-yaml') as { load(text: string): unknown };
const checkout = { name: 'Check out frozen source', uses: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', with: { 'persist-credentials': false, 'fetch-depth': 0 } };
const node = { name: 'Set up Node', uses: 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020', with: { 'node-version': '24.16.0', cache: 'npm' } };
const setup = [checkout, node,
  { name: 'Install pinned npm', run: 'npm install --global npm@11.17.0 --ignore-scripts --no-audit --no-fund' },
  { name: 'Install locked dependencies', run: 'npm ci --ignore-scripts --no-audit --no-fund' },
  { name: 'Install local esbuild binary', run: 'node node_modules/esbuild/install.js' }];
const frozenSourceStep={name:'Confirm frozen authored source',run:'git diff --exit-code HEAD -- && test "$(git rev-parse HEAD)" = "$GITHUB_SHA" && test -z "$(git ls-files --others --exclude-standard)"'};
const ciSetup=[
 {uses:'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',with:{'persist-credentials':false,'fetch-depth':0}},
 {uses:'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',with:{'node-version':'24.16.0',cache:'npm'}},
 {run:'npm install --global npm@11.17.0 --ignore-scripts --no-audit --no-fund'},
 {run:'npm ci --ignore-scripts --no-audit --no-fund'},
 {run:'node node_modules/esbuild/install.js'},
];
/** Independent source runners share no mutable fixture directory or generated types. */
export const ciSourceJobs={
 'fast-checks':{'runs-on':'ubuntu-latest','timeout-minutes':20,steps:[
  ...ciSetup.slice(0,2),
  {name:'Observe hosted database network reachability without credentials',run:'node --experimental-strip-types scripts/verification/hosted-connectivity.ts'},
  ...ciSetup.slice(2),
  {run:'npm run lint && npm run typecheck && npm test'},frozenSourceStep,
 ]},
 'source-contracts':{'runs-on':'ubuntu-latest','timeout-minutes':30,steps:[
  ...ciSetup,{run:'node --import tsx scripts/verification/stateless-checks.ts'},frozenSourceStep,
 ]},
};
export function validateCiSourceJobs(value:unknown):string[]{
 try{if(!value||typeof value!=='object'||Array.isArray(value))return['CI source jobs are unavailable.'];const source=value as Record<string,unknown>;return Object.entries(ciSourceJobs).every(([name,job])=>canonicalReleaseReviewJson(source[name])===canonicalReleaseReviewJson(job))?[]:['CI source contracts and fast checks must preserve their exact isolated complete owners.'];}catch{return['CI source job contract is malformed.'];}
}
export const runtimeLaneArtifactStep=(lane:'backend'|'browser'|'database')=>({name:`Retain exact safe ${lane} lane`,if:'always()',uses:'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',with:{name:`cuevo-runtime-${lane}-\${{ github.run_id }}-\${{ github.run_attempt }}`,path:`.local/runtime-lanes/${lane}/lane.json`,'include-hidden-files':true,'if-no-files-found':'error','retention-days':14}});
export const runtimeDeliveryReceiptStep={name:'Bind verified runtime delivery artifacts',if:"github.event_name == 'push' && github.ref == 'refs/heads/main'",run:'node --import tsx scripts/verification/runtime-artifact-receipt.ts'};
export const runtimeDeliveryArtifactStep={name:'Retain verified runtime delivery artifacts',if:"github.event_name == 'push' && github.ref == 'refs/heads/main'",uses:'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',with:{name:'cuevo-runtime-delivery-${{ github.run_id }}-${{ github.run_attempt }}',path:'.local/runtime-artifacts/api-vercel/\n.local/edge-artifacts/cuevo-worker/\n.local/runtime-artifact-receipt.json\n.local/runtime-contract-manifest.json\n','include-hidden-files':true,'if-no-files-found':'error','retention-days':90}};
/** Source/database admission can consume this completed job while unrelated
 * application smoke tests continue. It owns an isolated disposable database. */
export const ciDatabaseJob={'runs-on':'ubuntu-latest','timeout-minutes':30,steps:[...ciSetup,{name:'Verify isolated database boundary',run:'node --import tsx scripts/verification/technical-exit.ts --profile=ci --lane=database'},runtimeLaneArtifactStep('database'),{name:'Stop owned local Supabase',if:'always()',run:'npx --no-install supabase stop --project-id cuevo'}]};
export const ciRequiredJob={if:'always()',needs:['fast-checks','source-contracts','database-checks','technical-mvp','dependency-review','codeql','secret-scan'],'runs-on':'ubuntu-latest','timeout-minutes':5,steps:[{name:'Require every verification boundary',env:{FAST:'${{ needs.fast-checks.result }}',SOURCE_CONTRACTS:'${{ needs.source-contracts.result }}',DATABASE:'${{ needs.database-checks.result }}',TECHNICAL:'${{ needs.technical-mvp.result }}',DEPENDENCY:'${{ needs.dependency-review.result }}',CODEQL:'${{ needs.codeql.result }}',SECRET_SCAN:'${{ needs.secret-scan.result }}'},run:'if [ "$FAST" != success ] || [ "$SOURCE_CONTRACTS" != success ] || [ "$DATABASE" != success ] || [ "$TECHNICAL" != success ] || [ "$CODEQL" != success ] || [ "$SECRET_SCAN" != success ]; then exit 1; fi\nif [ "$GITHUB_EVENT_NAME" = pull_request ]; then test "$DEPENDENCY" = success; else test "$DEPENDENCY" = skipped; fi\n'}]};
export const ciRuntimeJobs={
 'runtime-backend':{'runs-on':'ubuntu-latest','timeout-minutes':120,steps:[...ciSetup,{name:'Verify isolated backend runtime',run:'node --import tsx scripts/verification/technical-exit.ts --profile=ci --lane=backend'},runtimeLaneArtifactStep('backend'),runtimeDeliveryReceiptStep,runtimeDeliveryArtifactStep,{name:'Stop owned local Supabase',if:'always()',run:'npx --no-install supabase stop --project-id cuevo'}]},
 'runtime-browser':{'runs-on':'ubuntu-latest','timeout-minutes':120,steps:[...ciSetup,{run:'npx --no-install playwright install --with-deps chromium'},{name:'Verify isolated focused browser runtime',run:'node --import tsx scripts/verification/technical-exit.ts --profile=ci --lane=browser'},runtimeLaneArtifactStep('browser'),{name:'Stop owned local Supabase',if:'always()',run:'npx --no-install supabase stop --project-id cuevo'}]},
 'technical-mvp':{needs:['database-checks','runtime-backend','runtime-browser'],'runs-on':'ubuntu-latest','timeout-minutes':10,steps:[...ciSetup,
 ...(['backend','browser','database'] as const).map(lane=>({name:`Read exact ${lane} lane from this run attempt`,uses:'actions/download-artifact@70fc10c6e5e1ce46ad2ea6f2b72d43f7d47b13c3',with:{name:`cuevo-runtime-${lane}-\${{ github.run_id }}-\${{ github.run_attempt }}`,path:`.local/runtime-lane-inputs/${lane}`}})),
 {name:'Combine exact source and required runtime lanes',run:'node --import tsx scripts/verification/runtime-lane-aggregate.ts'},
 {name:'Export sanitized status evidence',if:'always()',run:'node --import tsx scripts/verification/cicd-evidence.ts'},
 {name:'Retain sanitized evidence only',if:'always()',uses:'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',with:{name:'cuevo-safe-${{ github.sha }}',path:'.local/cicd-safe/','retention-days':14,'if-no-files-found':'error'}},
 ]},
};
/** CI runtime lanes share no database or private configuration. Only the fixed
 * same-run attempt metadata files cross into this aggregate. */
export function validateCiRuntimeJobs(value:unknown):string[]{
 try{if(!value||typeof value!=='object'||Array.isArray(value))return['CI runtime jobs are unavailable.'];const source=value as Record<string,unknown>;return Object.entries(ciRuntimeJobs).every(([name,job])=>canonicalReleaseReviewJson(source[name])===canonicalReleaseReviewJson(job))?[]:['CI runtime must preserve the exact three isolated lanes and same-attempt aggregate.'];}catch{return['CI runtime lane contract is malformed.'];}
}
const job = (timeout: number, steps: readonly unknown[]) => ({ if: "github.ref == 'refs/heads/main'", 'runs-on': 'ubuntu-latest', 'timeout-minutes': timeout, steps });
const jobs = {
  'technical-mvp': job(120, [...setup,
    { name: 'Install complete browser engines', run: 'npx --no-install playwright install --with-deps chromium firefox webkit' },
    { name: 'Run complete frozen acceptance', run: 'npm run verify:technical' },
    { name: 'Export exact full profile evidence', env: { CUEVO_FULL_VERIFICATION_PURPOSE: "${{ github.event_name == 'workflow_dispatch' && inputs.purpose || 'regression' }}" }, run: 'node --import tsx scripts/verification/full-verification-evidence.ts' },
    { name: 'Retain exact full profile summary', uses: 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a', with: { name: 'cuevo-full-verification-${{ github.run_id }}-${{ github.run_attempt }}', path: '.local/full-verification/summary.json', 'include-hidden-files': true, 'if-no-files-found': 'error', 'retention-days': 14 } },
    { name: 'Stop owned local Supabase', if: 'always()', run: 'npx --no-install supabase stop --project-id cuevo' }]),
  'codeql-evidence': job(15, [...setup, { name: 'Verify canonical same-source security', env: { GH_TOKEN: '${{ github.token }}' }, run: 'node --import tsx scripts/verification/staging-security.ts' }]),
  'secret-scan': job(20, [...setup,
    { name: 'Verify pinned scanner and full source policy', run: 'node --import tsx --test scripts/verification/secret-scan-policy.test.ts scripts/verification/secret-scan.test.ts' },
    { name: 'Scan full history plus authored worktree', run: 'node --import tsx scripts/verification/secret-scan.ts' }]),
  required: { if: "always() && github.ref == 'refs/heads/main'", needs: ['technical-mvp', 'codeql-evidence', 'secret-scan'], 'runs-on': 'ubuntu-latest', 'timeout-minutes': 5,
    steps: [{ name: 'Require every full regression boundary', env: { TECHNICAL: '${{ needs.technical-mvp.result }}', CODEQL: '${{ needs.codeql-evidence.result }}', SECRET_SCAN: '${{ needs.secret-scan.result }}' }, run: 'test "$TECHNICAL" = success && test "$CODEQL" = success && test "$SECRET_SCAN" = success' }] },
};
export const fullRegressionJobPolicy: Record<string, { steps: string[]; actionSteps: string[] }> = Object.fromEntries(Object.entries(jobs).map(([name, value]) => {
  const steps = value.steps as readonly { name: string; uses?: string }[];
  return [name, { steps: steps.map(step => step.name), actionSteps: steps.filter(step => step.uses !== undefined).map(step => step.name) }];
}));
const workflow = { name: 'Cuevo full regression', on: { schedule: [{ cron: '17 0 * * *' }], workflow_dispatch: { inputs: { purpose: { description: 'Diagnostic regression or frozen customer release candidate', required: true, type: 'choice', default: 'regression', options: ['regression', 'customer-candidate'] } } } },
  permissions: { contents: 'read', actions: 'read' }, concurrency: { group: 'cuevo-full-${{ github.event_name }}-${{ github.ref }}', 'cancel-in-progress': false },
  env: { CI: 'true', NEXT_TELEMETRY_DISABLED: '1', SCARF_ANALYTICS: 'false' }, jobs };

/** Admit the complete semantic execution contract, including otherwise invisible environment and job fields. */
export function validateFullRegressionWorkflow(text: string): string[] {
  try { return canonicalReleaseReviewJson(yaml.load(text)) === canonicalReleaseReviewJson(workflow) ? [] : ['Full regression must preserve its exact main-only source, security, purpose and artifact contract.']; }
  catch { return ['Full regression workflow is malformed or unavailable.']; }
}
