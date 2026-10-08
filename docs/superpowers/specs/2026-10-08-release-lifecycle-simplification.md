# Cuevo incremental release lifecycle

Status: founder-authorized architecture simplification on8October2026; implementation and verification in progress. This document defines the intended release behavior, not hosted or customer acceptance. The current protected source is5bbca6d972513032bc555561d5cb23465d1720cc. The reviewed activation recovery source d525c468de7669ef71e2944ef60c06753aa13c4a is preserved and composed locally before this change. Applied migration history and original interrupted operation receipts remain immutable.

## Objective and scope

Make first installation, normal staging updates, interrupted execution and rollback usable through one coherent process. Keep the existing Next.js→NestJS/Fastify→Supabase→transactional outbox→worker architecture and the existing native migration/provider/active-runtime/web owners. Do not introduce another release platform, task ledger, microservice or duplicate backend.

The founder approved retaining the domain API and worker while releasing incrementally. The scope includes workflow composition, authoritative source/job/artifact admission, database-only preparation, current runtime upgrade/drain, staging web handoff and operating verification. Production promotion and complete customer acceptance remain approval-controlled, including rights, school policy, privacy, region and restore requirements. “Smooth” means bounded work and an explicit safe next action; no system promises that every release succeeds forever.

The first supported delivery uses separate database/accounts, initial operating runtime and current-runtime customer packages. Runtime preparation requires prior confirmed database/population/Auth state. Initial runtime delivery uses `operating-staging`; full acceptance uses a fresh current-generation `installed-runtime` package. Rollout and its subsequent handover also use separate packages so each approval describes actual current state. Pending schema/interface maintenance and full customer handover with retained older components after rollback remain explicitly unfinished.

Governing sources:02architecture,39governance,40database setup,61deny matrix,67Supabase bootstrap,68stack ADR,81RLS/grants,82environments and83MVP exit. The accepted event-processing architecture and2Octoberworker decision retain one worker-owned processor, original-key idempotency, private authority and durable recovery. No curriculum rules or product permissions change.

## Findings that the design must resolve

1. Canonical CI and focused staging run duplicate source, unit, migration, database and scanner checks on the same main source.
2. A database milestone waits on unrelated API/Edge/browser verification even though that work cannot install the database.
3. Preparation builds API/Edge artifacts and cumulative SQL delivery for scopes that cannot deploy or execute those files.
4. Failed-job reruns carry old producer artifacts; the current same-attempt aggregate then cannot consume them. Rerun guidance and enforcement must agree.
5. Public local Edge verification can reuse a pre-reload socket after Kong reload. Transport loss never proves authorization denial.
6. The capacity test's virtual network clock advances across zero-cost host promise continuations, producing inconsistent modeled headroom. Its unchanged30second guard and minimum6second capacity assertion remain.
7. Active-runtime continuation admits only the same full source. There is no old-source→new-source operating rollout.
8. Disabling dispatch clears its current generation/lease and does not prevent an already-admitted worker from claiming another outbox item. A safe drain needs admission pause rather than resetting current work.
9. API alias binding cannot replace an exact previously owned deployment, and Edge rollback cannot be claimed atomic with database or API changes.
10. Completed database/accounts/provider facts can survive a later workflow failure, but those facts are not a completed customer release. Summaries must distinguish them.

## Release lanes

| Lane | What it proves | What it permits |
|---|---|---|
| PR | Stateless source/security, explicit database authorization and critical affected runtime/browser journeys | Protected review and merge |
| Main source/database | Exact integrated source, migration replay/grants, source contracts, builds and processed security | Reviewable database installation/update package |
| Staging runtime | Verified component artifacts, compatible installed schema, current private authentication/access, worker operating smoke | Private synthetic staging deployment/upgrade |
| Scheduled regression | Complete runtime/browser/recovery matrix on pinned source | Regression evidence; failures remain visible and owned |
| Customer candidate | Full acceptance on frozen deployed source plus official/operational requirements | Human-approved customer release |

One canonical workflow owns each executed check. The focused staging entry becomes a bounded read-only admission of the canonical source/database producers; it does not replay their tests. It may return not-ready while those required producers are running. It cannot claim database authority from a passing browser job, a PR tree match, or an aggregate status alone. All current source/run/attempt/job identity, exact required-step discovery and original processed CodeQL artifact checks remain.

Database verification must be its own isolated canonical job, with complete local replay, SQL/RLS/grants and advisors. Runtime jobs retain their own isolated test data and cannot touch hosted data. The database job's validated result is independently consumable even if a later runtime/browser job fails. Security or database failures still block schema effects.

Normal reruns use a fresh complete producer attempt unless a component's original run/attempt/artifact provenance is explicitly admitted by a reviewed reuse contract. Never rename, copy or restamp artifacts. A safe diagnostic failed-job rerun is not a release gate. Document and expose the correct rerun action.

## Preparation by capability

The existing backend runner is retained. Its strict package has a discriminator for database-only, initial runtime, pending confirmation, current runtime verification or rollout. Database-only packages contain source-derived pending migration delivery, current target/native history and original journal/approval binding. They contain no deployable API/Edge archive or runtime credential recipient.

Runtime and web packages reference immutable verified artifacts produced once for the exact source/lock/toolchain/target configuration. Metadata readers are credential-free. Artifact transport verifies the official producer/run/attempt, byte digest, exact bounded archive inventory and embedded component manifest. Public configuration changes create a new web artifact; a source hash alone cannot establish identical bytes.

Read-only pending confirmation keeps its existing strict original export/current approval binding and no-op plan. It requires no new API/Edge build and cannot use its package to provision, deploy, change keys or run customer acceptance. Confirmed source/cleanup facts remain original evidence, never restamped.

Immutable source, tests and artifact hashes are verified once per phase. Fresh current source selection, approval validity/revocation, provider endpoint, native TLS/lease/history/private posture checks occur last at the actual effect boundary. Preserve actual clocks and30second native freshness; do not turn an old observation into a new one or replace a current check with a supplied Boolean.

## Database lifecycle

First installation applies reviewed migrations and fictional population/accounts once. Later updates use completed installed migration inventory as the baseline and apply only pending append-only files. Initial population identity is separate and never repriced/reseeded during upgrades. Ordinary CI uses disposable Docker databases and never resets hosted staging.

Interrupted operations reconcile the original journal, native history/catalogue and actual target before executing pending effects. Unknown outcomes do not authorize a new key or blind retry. Each completed milestone is recorded by its existing owner independently of overall workflow success.

## Active staging rollout

One private active-runtime state retains immutable original activation history and a bounded current generation. A reviewed desired release binds previous active generation/source/artifacts/schema/event contract, desired component artifacts and current approval. Whole Git source remains provenance; explicit source-derived component compatibility decides whether old and new code can coexist. Ordinary changes to verified API/Edge bytes can use unchanged installed schema and public API/event contracts, with both original previous artifacts and required current CI admitted. They do not require a second complete old/new binary test run. Pending SQL or changed public contracts require paired execution evidence or an explicitly reviewed maintenance release. No caller-supplied compatibility flag grants authority.

The existing dispatch-control owner gains a private admission-pause mechanism through an append-only migration. Request/begin/claim refuse new work while paused; current lease holders can complete/fail/finish. The original generation, wake key, Cron job, unfinished events and source history remain. Drain requires actual absence of active invocation and event leases, not elapsed time alone.

After exact owned pause/drain, apply admitted compatible pending migrations, deploy desired verified API/Edge artifacts, verify restricted credentials/private access and signed operating behavior, bind the API alias by exact previous→desired ownership comparison, and publish the current generation only after all native/provider postconditions. Resume the retained dispatch key and recovery job. No initial activation replay or replacement key is implicit.

Rollback changes only known owned provider mappings/artifacts under current approval and a verified backward-compatible database/event contract. Database migration history is never reversed or reset. Edge rollback may deploy retained old bytes as a new provider version, whose actual identity is recorded. Any uncertain upload, changed alias, abandoned lease, incompatible migration or failed ownership proof stays review. Database/API/Edge are not one atomic transaction.

## Staging and customer truth

Use explicit observed states: schema installed, fictional accounts confirmed, runtime deployed, runtime operating-verified, frontend deployed, hosted journey verified, customer acceptance complete. A later failure cannot relabel earlier effects unattempted. A deployed app cannot be called customer-ready from local/unit/fixture results.

Operating staging handoff requires current actual source/artifact/DB/authz/worker readiness and private cleanup. Complete broad regression, restore drills, role/mobile/Arabic accessibility, curriculum rights and customer gates remain before customer approval. If an operating handoff is distinct from full acceptance, its strict purpose must prevent the customer promotion consumers from accepting it.

## Verification requirements

- Preserve grants/RLS deny tests, tenant/role/relationship/object checks, private Storage/Realtime, source/audit/outbox atomicity, current approval, original idempotency and native TLS/lease ownership.
- Prove canonical check ownership and complete discovery once; skipped/failed/changed/old-attempt producers cannot create phase authority.
- Prove a backend/browser failure does not block independent passing database admission, while source/security/database failures do.
- Prove database-only preparation invokes zero API/Edge builders and has no deployment/archive/key capability.
- Prove exact artifact reuse, unsafe archive refusal and target/configuration mismatch denial.
- Prove natural virtual-clock capacity under delayed host continuations retains actual source/FS validation,6second headroom and excess-latency refusal.
- Prove fresh one-shot Edge probes after reload return real401/400 receipts and socket failure remains failure with no retry.
- Prove owned pause/drain allows current completion but prevents new claims; unknown leases stay unknown.
- Prove compatible old→new rollout, current approval refusal, lost upload/commit reconciliation, exact alias CAS/readback, failed verification and rollback with original history intact.
- Prove staging operating receipts cannot satisfy customer acceptance or production promotion.
- Run architecture/docs/repository checks and their tests, relevant source/native/release/SQL/deny suites, independent complete nonauthor review, protected CI and actual hosted milestones. Record exact scope and remaining limits.

## References reviewed

- GitHub Actions reruns retain originalGITHUB_SHA/GITHUB_REF and can rerun a subset of jobs: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs
- DORA recommends fast CI feedback and separating longer tests: https://dora.dev/capabilities/continuous-integration/
- Vercel deployment promotion behavior depends on target/environment and domain assignment; preview-to-production may rebuild. Do not assume promotion always preserves bytes: https://vercel.com/docs/deployments/promoting-a-deployment
- Supabase version/changelog and database/security setup: https://supabase.com/changelog.md and repository source40/67/81/82.

These references describe platform mechanics; repository product/security requirements remain authoritative.
