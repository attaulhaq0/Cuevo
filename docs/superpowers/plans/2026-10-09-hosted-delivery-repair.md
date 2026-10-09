# Cuevo hosted delivery repair implementation plan

> **For agentic workers:** Use subagent-driven development for independent owner tasks, with exact nonauthor review before integration. Preserve completed task evidence; resume the first unfinished task rather than replaying completed work.

**Goal:** Repair the audited deployment execution and recovery gaps, then deliver the verified synthetic hosted database, accounts, API, worker and frontend.

**Architecture:** Extend the existing source/artifact, native database, migration, provider, Auth and handover owners. Immutable preparation finishes before final live admission; each effect retains its original identity and a safe recovery path. Keep the modular monolith and outbox worker. Do not create a universal release framework or a competing task ledger.

**Tech stack:** Existing Node24/TypeScript, pinned Supabase and Vercel tools, GitHub Actions, PostgreSQL/Supabase, current private runtime artifacts and existing execution adapters.

**Spec:** Founder-approved deployment fix contract in `.local/20261009-release-audit/recommended-fix-contract.md`, with the three source audits alongside it. Product sources02/38/39/40/61/67/68/81/82/83 and repository layout remain binding. The approved pasted attachment is preserved as supplied evidence; no curriculum facts or permissions change.

## Current state and constraints

- Main is7277cfb1037aeb44f51808a7eb486454f2327f25; PR30 is6c6f076c228d67a5194df183f2faa5cafe477c6e with failed source-capacity and two backend CI checks.
- The capacity correction passed18/18 on Node24. The final change after that run was console wording/indentation only and has independent byte reconstruction. It is preserved in signed commit5ac17170152289d381b4eb221488cc0eea6552b8.
- Hosted state last verified is120/231 migrations,96 application tables,0/133 Auth accounts,0 schools,0 Edge/API/web deployments. Original migration journals and history stay append-only.
- Recovery37842528613 failed before SQL at FINAL_FRESHNESS. Do not rerun or borrow its expired package/approval.
- Preserve dirty primary G:/Cuevo and existing worktrees. All temporary/build/test/cache output uses saved G settings. Do not reset hosted data or restart shared Docker/WSL to compensate for an observation failure.
- Runtime policy limits and test acceptance thresholds do not increase merely to pass. Unknown effects never create an automatic retry or new original key.

## Tasks and reviewable increments

### Task1: finish the existing capacity measurement correction

- [x] Inspect old CI failure and reproduce preparatory-versus-final attribution.
- [x] Preserve six-second modeled headroom and30-second native age requirements.
- [x] Run the complete reconciliation test file:18pass,0fail/skip/cancel. Record exact tested and final output-only file hashes.
- [x] Independent review; current lint/typecheck; signed local commit5ac1717.
- [ ] Include the correction in the next coherent protected candidate; do not trigger repeated CI while its related execution work is unfinished.

### Task2: prepare a protected actual migration launch before the live cohort

Owners: `scripts/database/hosted-migration-native-process.ts`, stage/batch-file owner, migration executor and their tests; current runtime process owner if necessary.

- [ ] Select a concrete enforceable isolation mechanism, with a pinned runtime and complete CLI executable/import graph. Prefer an ephemeral read-only execution artifact/container with separate writable scratch; reject a mutable-directory hash cache or a permission bit writable by the same execution process.
- [ ] Prepare runtime/toolchain/stage/batch/CA binding before final current native admission. Capture exact artifact identity and fully validate all inputs.
- [ ] Launch only that prepared one-attempt execution after current native source/approval/TLS/lease/history/private state has passed. Keep original deadline checks immediately before actual spawn/start.
- [ ] Preserve cancellation, tree termination, unknown acknowledgement and complete stopped-child/container cleanup. No unresolved process may be reported stopped from a missing observation alone.
- [ ] Test full actual preparation-to-launch with delayed preparation, original deadline, tampered binaries/config/SQL, changed source/target, lost lease, simultaneous consumers and nonzero/unknown execution. Preserve original migration commands/history/nonlexical dependency.
- [ ] Retire superseded repeated full preparation inside the final live window only after equivalent isolation and final integrity refusal are proved.

### Task3: current native consumption for population and all fictional Auth actors

Owners: `hosted-migration-database.ts`, `hosted-synthetic-population.ts`, `hosted-synthetic-auth.ts`, their composed tests and original installed-state/journal owners.

- [ ] Separate historical completion/source/private-chain verification from current effect-specific renewal in the existing held native owner.
- [ ] Population consumes that owner's complete current target/postcondition/private facts instead of capturing old clocks before nested renewal and repeating inventory.
- [ ] Each Auth effect validates exact original ID/email/body/source and uses the same current consumption owner's actual clocks. Remove unrelated stale outer authority clocks; never restamp an earlier observation.
- [ ] Test real native composition with133 actors and delayed transports, denial/tampering/expiry, acknowledged versus uncertain receipts and exact original-key reuse.

### Task4: prepare API/worker/web provider execution and bind host contracts

Owners: existing runtime artifact builders, `backend-provider-deploy.ts`, `cicd-release.ts`, configuration/activation/provider readbacks.

- [ ] CLI discovery, copying and execution-input preparation finish before current native/approval admission. Bind exact prepared artifact/configuration and one launch attempt.
- [ ] Verify actual region/runtime/DB connection and bounded pool/concurrency assumptions. Keep provider gateway/trusted-address limits distinct from in-process defense.
- [ ] Prove Supabase Edge deployed content/dependency enforcement before activation; use a provider-supported pinned prebundle/vendor path if the supplied frozen graph cannot be proved.
- [ ] Build for the exact Vercel environment. Preview-to-production may rebuild; staged production promotion and rollback have different byte/configuration semantics. Do not infer equivalence from source SHA alone.
- [ ] Test cold/warm authenticated requests, five-role private denial, process/connection ceilings and Edge CPU/wall-clock/lease/recovery; no provider production promotion without its acceptance.

### Task5: recover original outcomes without duplicate effects

Owners: existing migration/installed-state/completion/batch journals, Auth creator and API/Edge/web provider phase owners.

- [ ] Add bounded read-only reconciliation of original SQL history/journal/cleanup when COMMITTED effects outlive a lost installed marker or export. Publish only missing metadata under fresh scoped approval, with a distinct metadata-effect receipt.
- [ ] Reconcile an interrupted child against exact applied prefix and original bytes. Intermediate NOT_CONFIRMED receipts alone never authorize continuation.
- [ ] For lost account/upload responses, use exact original operation/source/artifact/target/user identity and positively verified unique provider/native discovery. Adoption performs zero duplicate SQL, account creates or uploads; ambiguous/unprovable absence remains UNKNOWN.
- [ ] Test provider success followed by dropped response, process crash before receipt, missing export, multiple/foreign matches, partial batches, expiry/source/target change and uncertain cleanup.

### Task6: retain safe failure evidence and align CI with stage ownership

Owners: CI/release/full-regression workflows and compiled policies, existing technical/runtime evidence owners, scope/discovery and canonical job readers.

- [ ] Emit and retain bounded sanitized failure evidence on producer/aggregate failure, cancellation and restoration refusal. Keep raw credentials, pupil content, SQL and response bodies out of public artifacts.
- [ ] Preserve original executed test/discovery identity, phase/status/clock ages and minimized API/query timings. Test canary exclusion and unknown-field refusal.
- [ ] Split independent expensive fixture families with isolated temporary state; preserve required discovery and no-skip coverage. Database jobs never share a mutable fixture.
- [ ] Adopt PR/main evidence reuse only with an exact reviewed source/toolchain/lock/workflow/configuration/scope/environment/provenance contract. Changed inputs rerun relevant suites. Same tree alone is insufficient.
- [ ] Change YAML, strict policies, admission and required statuses coherently. Full hosted learning and separate customer windows get explicit acceptance owners.
- [ ] Keep the two unclassified backend CI failures as failures. Exact local passes do not establish infrastructure noise. Profile actual nested queries on demonstrated repeat failures; no speculative SQL change or raised5s limit.

### Task7: complete and verify hosted staging

- [ ] Freeze/review the coherent source and pass protected required CI. Verify actual integrated SHA/tree/parents/signature and fresh authentic source/QA rows.
- [ ] Use actual main source/database/security producer evidence to prepare a fresh exact reconcile-schema package and validate source/run/attempt/targets/hash/expiry. Submit only authentic exact staging approval under standing human delegation.
- [ ] Reconcile original120→123, then use real completed recovery receipt/artifact for fresh231-schema/reference/133-Auth provisioning. Report each original native milestone independently.
- [ ] Deploy verified API/Edge and current runtime generation, then connect/deploy frontend through its exact public handover.
- [ ] Complete hosted all-five-role English/Arabic/mobile core learning, private denials, signed processing, recovery/restoration and actual provider readback.
- [ ] Demonstrate a failed later deployment can resume without reinstalling schema/accounts; verify an interrupted compatible update and recovery without duplicate effects.
- [ ] Record real customer gaps separately. Future additive-schema maintenance, credential rotation, long-history and retained-component customer rollback remain explicit bounded follow-up until proved; they are not an enormous prerequisite to first synthetic staging.

## Verification and reporting rules

Each task produces a small coherent patch, meaningful failure and positive tests, exact source/evidence hashes and nonauthor spec/quality review. Independent tasks may proceed in separate existing G worktrees; shared owner edits and integration stay sequential. Preserve original error and cleanup uncertainty. Once relevant checks pass, repeat them only for new changes, failures or unresolved risks.

An executed provider receipt/history proves hosted state. A plan, local fixture, model timing or CI exit code does not. Completion of this plan requires the verified hosted app and declared recovery proof, not merely merged tooling.

## Current finite candidate and remaining gates

The first candidate implements protected native preparation, actual current consumption for initial population/Auth/API phases, original Auth and API lost-acknowledgement recovery, and source-contract failure evidence with one independent concurrent fixture pair. The original capacity correction remains included. Bounded nonauthor reviews and current local checks are retained in ignored operator evidence. Actual Linux container/TLS migration verification and protected integration are still required.

This candidate is not the complete plan. Generic interrupted child reconciliation, missing committed schema/completion metadata recovery, frontend cross-run original upload intent, Edge deployed-content/unknown-upload proof and actual host capacity/region contracts remain bounded work before their acceptance. Runtime-read-only handover paths retain their existing checks and timing limitations. Future schema maintenance/rotation/retained-component customer rollback remains separately unsupported.

Verification results are tied to exact saved source hashes. A local transport model or old source review cannot approve a new integrated source. No hosted SQL/account/deployment milestone follows from staging or committing this candidate.
