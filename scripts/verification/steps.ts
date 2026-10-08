export const verificationSteps=[
 {name:'repository',args:['--import','tsx','scripts/repository/check.ts']},
 {name:'repository-fixtures',args:['--import','tsx','--test','scripts/repository/rules.test.ts']},
 {name:'architecture',args:['--import','tsx','scripts/architecture/check.ts']},
 {name:'architecture-fixtures',args:['--import','tsx','--test','scripts/architecture/rules.test.ts','scripts/architecture/synthetic-runtime.test.ts']},
 {name:'docs',args:['--import','tsx','scripts/docs/check.ts']},
 {name:'docs-fixtures',args:['--import','tsx','--test','scripts/docs/rules.test.ts','scripts/docs/reference-inventory.test.ts']},
 {name:'cicd',args:['--import','tsx','scripts/verification/cicd-check.ts']},
 {name:'cicd-fixtures',args:['--import','tsx','--test','scripts/verification/cicd-contracts.test.ts','scripts/verification/release-controls.test.ts','scripts/verification/release-review.test.ts','scripts/verification/release-process.test.ts','scripts/verification/staging-verification.test.ts','scripts/verification/staging-verification-jobs.test.ts','scripts/verification/staging-security.test.ts','scripts/verification/verification-profiles.test.ts','scripts/verification/playwright.critical.config.test.ts','scripts/verification/verification-workflows.test.ts','scripts/verification/full-verification-evidence.test.ts','scripts/verification/full-release-evidence.test.ts','scripts/verification/daily-watchdog.test.ts','scripts/verification/backend-release-contracts.test.ts','scripts/verification/backend-release-admission.test.ts','scripts/verification/backend-schema-completion-admission.test.ts','scripts/verification/backend-release-prepare.test.ts','scripts/verification/backend-release.test.ts','scripts/verification/backend-runtime-resume.test.ts','scripts/verification/backend-workflow.test.ts','scripts/verification/backend-provider-deploy.test.ts', 'scripts/verification/backend-provider-cli-launch.test.ts','scripts/verification/backend-hosted-verification.test.ts','scripts/verification/backend-hosted-private.test.ts','scripts/verification/backend-hosted-activation.test.ts','scripts/verification/backend-hosted-recovery.test.ts','scripts/verification/backend-hosted-recovery-faults.test.ts','scripts/verification/backend-hosted-fault-recovery-native.test.ts','scripts/verification/backend-hosted-database-restore.test.ts','scripts/verification/backend-web-handover.test.ts','scripts/verification/backend-api-origin.test.ts','scripts/verification/backend-web-settings.test.ts','scripts/verification/backend-hosted-browser.test.ts','scripts/verification/backend-web-transfer.test.ts','scripts/verification/backend-web-transfer-admission.test.ts','scripts/verification/codeql-alerts.test.ts','scripts/verification/web-backend-bridge.test.ts','scripts/verification/web-staging-origin.test.ts','scripts/verification/hosted-learning-loop-journal.test.ts','scripts/verification/git-source-digest.test.ts','scripts/verification/backend-hosted-learning-loop.test.ts','scripts/verification/backend-hosted-learning-loop-native.test.ts','scripts/verification/backend-hosted-learning-loop-admission.test.ts','scripts/verification/backend-hosted-learning-loop-artifact.test.ts','scripts/verification/hosted-learning-qa.test.ts','scripts/verification/hosted-learning-qa-workflow.test.ts','scripts/verification/protected-preview.test.ts','scripts/verification/backend-preview-transport.test.ts']},
 {name:'verification-rules',args:['--import','tsx','--test','scripts/verification/rules.test.ts','scripts/verification/posthog-evidence.test.ts','scripts/verification/browser-account-phase.test.ts','scripts/verification/account-capture-cleanup.test.ts','scripts/verification/typecheck-workspaces.test.ts','scripts/verification/dependency-security.test.ts','scripts/verification/web-test-assets.test.ts','scripts/verification/browser-runtime-scope.test.ts','scripts/verification/verification-progress.test.ts','scripts/verification/runtime-lanes.test.ts','scripts/verification/canonical-runtime-jobs.test.ts']},
 {name:'outage-rules',args:['--import','tsx','--test','scripts/verification/runtime-outage-rules.test.ts']},
 {name:'local-runtime',args:['--import','tsx','--test','scripts/local-runtime.test.ts','scripts/runtime/environment.test.ts','scripts/runtime/posthog-local.test.ts','scripts/runtime/local-school-accounts.test.ts','scripts/runtime/initial-school.test.ts','scripts/runtime/process.test.ts','scripts/runtime/foundry-environment.test.ts','scripts/runtime/reference-drain-rules.test.ts','scripts/runtime/source-paths.test.ts']},
 {name:'migration-replay-rules',args:['--import','tsx','--test','scripts/database/replay-plan.test.ts','scripts/database/hosted-synthetic-plan.test.ts','scripts/database/hosted-migration-plan.test.ts','scripts/database/hosted-schema-catalogue.test.ts','scripts/database/hosted-schema-reconciliation.test.ts','scripts/database/hosted-schema-reconciliation-policy.test.ts','scripts/database/hosted-schema-reconciliation-native.test.ts','scripts/database/hosted-schema-reconciliation-executor.test.ts','scripts/database/hosted-schema-recovery-completion.test.ts','scripts/database/hosted-schema-continuation-native.test.ts','scripts/database/hosted-schema-continuation-executor.test.ts','scripts/database/hosted-migration-batches.test.ts','scripts/database/hosted-migration-batch-receipt.test.ts','scripts/database/hosted-installed-state.test.ts','scripts/database/hosted-active-runtime-state.test.ts','scripts/database/hosted-provider-state.test.ts','scripts/database/hosted-migration-workdirs.test.ts','scripts/database/hosted-migration-connection.test.ts','scripts/database/hosted-migration-execution.test.ts','scripts/database/hosted-migration-native-process.test.ts','scripts/database/hosted-migration-journal.test.ts','scripts/database/hosted-migration-database.test.ts','scripts/database/hosted-runtime-role-membership.test.ts','scripts/database/hosted-migration-database-tls.test.ts','scripts/database/hosted-migration-history.test.ts','scripts/database/hosted-migration-stage-files.test.ts','scripts/database/hosted-migration-provider.test.ts','scripts/database/hosted-migration-stage-observation.test.ts','scripts/database/hosted-migration-executor.test.ts','scripts/database/hosted-migration-quiescence.test.ts','scripts/database/hosted-migration-remote-journal.test.ts','scripts/database/hosted-migration-durable-journal.test.ts','scripts/database/hosted-operator-storage-inventory.test.ts','scripts/database/hosted-operator-storage-policy.test.ts','scripts/database/hosted-operator-storage-bootstrap.test.ts','scripts/database/hosted-synthetic-population.test.ts','scripts/database/hosted-synthetic-auth.test.ts','scripts/seed-auth.test.ts','scripts/seed-reference-core.test.ts','scripts/database/browser-pilot-volume-rules.test.ts','scripts/database/worker-transport-trust.test.ts','scripts/database/worker-transport-fixture-policy.test.ts']},
 {name:'recovery-dump-fixtures',args:['--import','tsx','--test','scripts/verification/recovery-dump.test.ts']},
 {name:'clean-bootstrap',args:['--import','tsx','scripts/bootstrap-local.ts']},
 {name:'lint',args:['node_modules/eslint/bin/eslint.js','.'],configured:true},
 {name:'typecheck',args:['--import','tsx','scripts/verification/typecheck-workspaces.ts'],configured:true},
 {name:'build',args:['--import','tsx','scripts/verification/build-workspaces.ts'],configured:true},
 {name:'api-runtime-artifact',args:['--import','tsx','scripts/runtime/build-api-artifacts.ts']},
 {name:'worker-runtime-artifact',args:['--import','tsx','scripts/runtime/build-artifacts.ts','worker']},
 {name:'edge-runtime-artifact',args:['--import','tsx','scripts/runtime/build-edge-artifact.ts']},
 {name:'edge-artifact-fixtures',args:['--import','tsx','--test','scripts/runtime/build-edge-artifact.test.ts','scripts/runtime/build-artifacts.test.ts']},
 {name:'edge-verification-fixtures',args:['--import','tsx','--test','scripts/verification/edge-worker.test.ts']},
 {name:'browser-secrets',args:['--import','tsx','scripts/verification/browser-secrets.ts'],configured:true},
 {name:'dependency-security',args:['--import','tsx','scripts/verification/dependency-security.ts'],configured:true},
 {name:'database-advisors',args:['--import','tsx','scripts/verification/database-advisors.ts'],configured:true},
 {name:'unit',args:['node_modules/vitest/vitest.mjs','run','packages','apps/api/test/unit','apps/worker/test'],configured:true},
 {name:'web-unit',args:['--import','tsx','scripts/test-web.ts'],configured:true},
 {name:'database',args:['--import','tsx','scripts/test-database.ts'],configured:true},
 {name:'integration',args:['--import','tsx','scripts/test-integration.ts'],configured:true},
 {name:'runtime-outage',args:['--import','tsx','scripts/verification/runtime-outage.ts'],configured:true},
 {name:'recovery',args:['--import','tsx','scripts/verification/recovery-drill.ts'],configured:true},
 {name:'clean-browser-seed',args:['--import','tsx','scripts/bootstrap-local.ts']},
 {name:'edge-runtime',args:['--import','tsx','scripts/verification/edge-worker.ts'],configured:true},
 {name:'browser-compatibility',args:['node_modules/@playwright/test/cli.js','test','--config','scripts/verification/playwright.customer.config.ts'],configured:true},
 {name:'browser',args:['--import','tsx','scripts/verification/browser-complete.ts'],configured:true},
 {name:'demo-seed-restore',args:['--import','tsx','scripts/bootstrap-local.ts']},
]as const;
/** Routine runtime evidence omits stateless checks owned by fast CI and never substitutes for the full acceptance sequence. */
export const routineVerificationSteps = [
 verificationSteps.find(step=>step.name==='clean-bootstrap')!,
 verificationSteps.find(step=>step.name==='build')!,
 verificationSteps.find(step=>step.name==='api-runtime-artifact')!,
 verificationSteps.find(step=>step.name==='worker-runtime-artifact')!,
 verificationSteps.find(step=>step.name==='edge-runtime-artifact')!,
 verificationSteps.find(step=>step.name==='browser-secrets')!,
 verificationSteps.find(step=>step.name==='database')!,
 verificationSteps.find(step=>step.name==='database-advisors')!,
 {name:'critical-integration',args:['--import','tsx','scripts/test-integration.ts','--profile=critical'],configured:true},
 verificationSteps.find(step=>step.name==='clean-browser-seed')!,
 verificationSteps.find(step=>step.name==='edge-runtime')!,
 {name:'critical-browser',args:['node_modules/@playwright/test/cli.js','test','--config','scripts/verification/playwright.critical.config.ts'],configured:true},
 verificationSteps.find(step=>step.name==='demo-seed-restore')!,
] as const;
const statelessNames = new Set(['repository','repository-fixtures','architecture','architecture-fixtures','docs','docs-fixtures','cicd','cicd-fixtures','verification-rules','outage-rules','local-runtime','migration-replay-rules','recovery-dump-fixtures','lint','typecheck','edge-artifact-fixtures','edge-verification-fixtures','dependency-security','unit','web-unit']);
/** Stateless ownership is explicit. Omitting a browser step from a PR runtime
 * never moves that runtime operation into the fast-checks process. */
export const statelessVerificationSteps=verificationSteps.filter(step=>statelessNames.has(step.name)&&!['unit','web-unit','lint','typecheck'].includes(step.name));
/** Full affected runtime after fast CI owns source/unit/security checks; this is distinct from complete release acceptance. */
export const fullRuntimeVerificationSteps = [
 ...verificationSteps.filter(step=>!statelessNames.has(step.name)&&!['browser-compatibility','browser','demo-seed-restore'].includes(step.name)),
 routineVerificationSteps.find(step=>step.name==='critical-browser')!,
 verificationSteps.find(step=>step.name==='demo-seed-restore')!,
] as const;
/** Exact main backend checks and critical browser staging; full customer regression has its own workflow. */
export const mainStagingVerificationSteps = [
 ...routineVerificationSteps.filter(step=>!['critical-integration','clean-browser-seed','edge-runtime','critical-browser','demo-seed-restore'].includes(step.name)),
 verificationSteps.find(step=>step.name==='integration')!,
 verificationSteps.find(step=>step.name==='clean-browser-seed')!,
 verificationSteps.find(step=>step.name==='edge-runtime')!,
 routineVerificationSteps.find(step=>step.name==='critical-browser')!,
 verificationSteps.find(step=>step.name==='demo-seed-restore')!,
] as const;
export function commandArgs(step:{args:readonly string[];configured?:boolean}){return step.configured?['--env-file=.env.local',...step.args]:[...step.args];}
