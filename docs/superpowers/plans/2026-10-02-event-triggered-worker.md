# Event-triggered worker implementation plan

> **For agentic workers:** Use scoped subagent-driven implementation with root-owned database/runtime verification. Every slice requires independent review and actual source/authorization tests before activation.

**Goal:** Execute existing durable Cuevo events through authenticated coalesced Supabase wakeups and bounded worker invocations, with recovery for missed delivery.

**Architecture:** The existing outbox remains authoritative. A private operational wake record and post-commit `pg_net` request invoke the same domain SQL processor through a restricted worker connection. Local Node execution remains available; the hosted adapter does not create domain services or public RPC.

**Tech stack:** PostgreSQL17, pg_net, Vault, pg_cron, existing TypeScript worker, pinned pure-JavaScript pg8.23.1 and Supabase Edge runtime. Hosted compatibility and credentials are acceptance prerequisites.

**Design:** [Scalable event processing](../../architecture/scalable-event-processing.md) and [accepted decision](../../decisions/2026-10-02-event-triggered-worker.md). Product02/11/38/39/81/82/83 remain unchanged. Founder approval is recorded in this conversation; no further architecture questions are required.

## Constraints

- Preserve academic/source authorization, current tenant/policy scope, native results, approval, idempotency, audit and per-event atomic processing.
- API/worker statements remain limited to five seconds. Claim one event at a time for bounded execution with existing30-second event leases; stop new claims when less than15seconds remains in the20-second processing budget for claim/process/failure. This timer starts after health/admission; setup, finish and cleanup are outside it. The invocation lease remains60seconds from issuance and the30-second HTTP transport timeout is separate.
- Authenticate fixed machine POST before opening a DB connection. Body is only `{version:1,wakeId:<uuid>}` with a512-byte/3-second read limit. Verify timestamp/wake-bound HMAC-SHA256 headers within60seconds; the reusable64-hex UTF-8 key stays in Vault/Edge secrets. No arbitrary SQL, endpoint, school, learner or event payload.
- Operational configuration defaults disabled. Secrets remain in Vault/Edge secret storage; no service-role/public RPC or owner processing identity.
- Provider-owned `net`/Vault ACL privacy is an activation prerequisite. Ordinary migration revokes were insufficient locally; the guarded provider-owner hook must follow bootstrap replay. Hosted Support/owner hardening and actual private schema/table/column evidence are required; no automatic privilege escalation is permitted.
- Coalesce one active wake with bounded expiry. Failed or missing HTTP delivery leaves durable outbox work. One-minute recovery checks due pending/expired work only.
- No live model calls. Event eligibility does not authorize model execution.
- Root owns shared DB, build, browser, reset and hosted windows. Applied migrations remain immutable.

## 1. Private wake coordination

**Owner/files:** SQL owner, CLI-created `supabase/migrations/20261002122236_event_triggered_worker_wakes.sql`, `supabase/tests` regression. No changes to existing dispatch/claim/process/fail functions.

- [ ] Write SQL cases for missing/default-disabled configuration, missing/wrong runtime grants, burst coalescing, duplicate start/finish, failed transport and expired recovery. Observe red before implementation.
- [x] Implement private wake/config state, fixed endpoint/Vault reference, bounded generation lease and sanitized operational receipts. Statement trigger cannot fail an otherwise valid domain insert when network wake is unavailable.
- [x] Export only `begin_worker_wake(uuid)`, `finish_worker_wake(uuid,text,integer)` and `worker_dispatch_health()` to the restricted worker. Request/configuration remain operator/trigger-only and private.
- [x] Verify transaction rollback sends no committed network work, outbox identity remains singular and all raw/public/service/API grants deny, with lost wake/retry recovery through the actual local28-check verifier. Future-due and broader hosted fault acceptance retain their explicit test boundaries.

## 2. Bounded authenticated execution

**Owner/files:** `apps/worker/src/jobs/outbox/processor.ts`, narrow Edge handler/entrypoint under the worker owner, colocated worker tests and README.

- [x] Write pure request/authentication/deadline/duplicate/failure tests and observe red.
- [x] Add a query-port boundary so both Node and Edge use the same processor. Bounded processing claims one event, then commits its process/failure receipt before the next claim.
- [x] Authenticate fixed POST and strict body before the factory opens a restricted connection. Validate actual worker readiness and wake generation. Duplicate/stale wakes cause no processing amplification.
- [x] Finish and close the connection even after failure. Sanitize errors; never expose secrets or event bodies. Pure cases prove wrong authentication, timeout, invalid generation and processing errors preserve retry behavior; the separate28-check local verifier now proves actual restart/Cron recovery and cleanup.

## 3. Delivery and environment

**Owner/files:** root runtime artifact builder/function configuration, CI/release descriptors, owner navigation and operations docs.

- [x] Package one generated ignored Edge artifact from worker sources; use pinned pg8.23.1 with no native dependency. Authored paths retain one implementation. Deno2.1.4 frozen14-package versions/integrities match root npm; hosted bundler negative enforcement remains pending.
- [x] Serve the function locally with real restricted DB credentials and verify startup, identity and authenticated lifecycle through the28-check repeatable verifier. Guarded local plaintext does not certify hosted TLS/credentials.
- [x] Extend release evidence to a strict discriminated container/Edge descriptor;17 contract/actual CLI cases pass. Edge project/function/source/lock/security/queue fields remain reviewed attestations, re-admitted within24hours. Verify fetches only web/API/container health, and never sends a GET or signed POST to Edge. Actual hosted target acceptance remains separate.
- [ ] Configure reviewed endpoint/secrets/recovery only after actual tests pass. No real-pupil, curriculum, residency or paid-plan approval is inferred from deployment authorization.

## 4. Integrated verification and delivery

- [x] Run the clean-seed focused teacher/learner UI loop with actual Edge pg_net execution and Node polling stopped:52.7seconds/case47.1,25 visible source/approval/outcome/parent/portfolio mutations plus English/Arabic mobile axe. External Edge browser mode omits worker startup/port4001. This single scenario does not replace the wider/current frozen matrix.
- [x] Exercise committed source→wake→restricted processor→learner state/outcome/parent/portfolio readback through the focused actual Edge UI loop, plus local rollback/lost/duplicate/expired/recovery through28-check verification. The wider99-case browser matrix uses Node; all feature permutations with Edge remain outside that claim.
- [x] Retain the historical failed11:30 browser aggregate (98/99) and unsuccessful progress refresh as UNKNOWN cause without a captured response body. The unchanged focused rerun passed32.3s and fresh concurrent API probes passed; neither establishes a fix, harness error or transient cause. The later frozen aggregate passed; historical root cause remains unestablished.
- [x] Run architecture/docs/repository guards, typecheck/lint/unit/SQL/integration/build, full role/RTL/mobile/accessibility browser suites and clean frozen aggregate:2026-10-02T17-02-58-500Z VERIFIED,37 required rows,99 Node browser/separate Edge28, demo97 and1,304-entry source initial/final byte equality. Later docs reconciliation is outside those frozen bytes.
- [ ] Preserve Git bytes for12 new applied CRLF migrations with exact-path attributes and isolated-index regression; older canonical migration blobs remain unchanged.
- [ ] Commit coherent owned slices, preserve founder manual guides, push reviewed branch/PR, enforce GitHub CI protections and verify hosted runs. Deploy only from verified hosted/runtime evidence.

Status: local implementation VERIFIED in the frozen2026-10-02T17-02-58-500Z run; hosted/load acceptance remains open. All37 required rows passed, including568 unit/148frontend/1,100SQL/179ordinary integration+1live skip, outage10/recovery8, Edge28, compatibility51 and99 Node browser. Demo97 and1,304 source initial/final byte equality passed. The separate full UI Edge loop remains52.7seconds/case47.1 with25 visible source/evidence/approval/outcome/parent/portfolio mutations and English/Arabic mobile axe; it is one scenario, not99 Edge cases. Earlier failures remain history, including the original98/99 uncaptured UNKNOWN cause. Hosted TLS/role/secret/provider-owner grants, dependency-lock enforcement, scheduler-target recovery, representative load, provider/regional and commercial-plan acceptance remain open. Later documentation edits are outside the frozen source bytes. Follow the [full-app progression](../../architecture/scalable-event-processing.md#full-app-progression-for-future-agents) for future domain-owned handlers and durable long-job execution. Checkboxes are updated only from observed evidence; original red-first SQL proof and real staged migration-byte proof are not inferred from passing runtime suites.
