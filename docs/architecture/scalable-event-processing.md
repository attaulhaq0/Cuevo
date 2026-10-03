# Scalable event processing

Status: accepted full-app foundation, implemented and verified locally; hosted activation and representative load remain unverified. Reviewed 2 October 2026. The frozen local run `2026-10-02T17-02-58-500Z` passed all 37 required verification rows, including 99 Node-backed browser cases and a separate 28-check actual Edge verifier. The earlier focused full UI Edge scenario remains separate evidence. Governing product sources 01/02/10/11/38/39/60/65/78/81/82/83 remain unchanged. The adapter belongs to Cuevo's existing modular monolith and retains the existing authoritative outbox and domain processor. This later documentation reconciliation was not part of the frozen source bytes.

## Durable source and execution boundary

```text
Authorized domain command
  → source mutation + audit + versioned outbox in one transaction
  → committed coalesced wake
  → bounded authenticated worker invocation
  → claim → domain SQL validation/processing → receipt
  → current authorized learner/role readback
```

`internal.outbox_events` remains the authoritative work ledger. Preserve event ID, school/actor, type/entity/version, source provenance and deduplication key. The worker's private SQL validates the stored source, approval, policy, current applicable scope and lease before processing. Completion is idempotent. An event or wake never independently authorizes grades, access, official curriculum claims, safeguarding outcomes or model execution.

Immediate commands return confirmed source receipts. Near-real-time state/signals/community processing remains deterministic. Model work is a separately authorized orchestrator operation with minimum context, schema/provenance, approval, evaluation and budget gates; this foundation does not call a model for every click.

## Accepted transport direction

Supabase supplies transaction-committed `pg_net` wakeups and a bounded Edge execution adapter. Retain the existing Node worker for local development and repeatable tests. Both consume the same outbox and domain processor, through a narrow query/clock/deadline boundary; do not duplicate domain processing in an Edge implementation.

An append-only migration adds a statement-level outbox insertion trigger and private coalescing control. The wake contains only schema version and an opaque invocation/generation identity, never pupil IDs, answers, event payloads or restricted metadata. The endpoint and credential are configured by an authorized operator and cannot come from browser/event data. One active generation coalesces a burst; new enqueues during processing do not create one HTTP request per row. An eligible finish requests a continuation if due work remains.

`pg_net` starts HTTP after commit, but its network queues/responses are unlogged and temporary. Treat delivery as a best-effort wake, never reliable event storage. A wake failure must not roll back an already valid academic mutation or report false processing success. Store only a sanitized operational failure/next-attempt state; the durable outbox and recovery path retain the work.

One-minute recovery scheduling checks for due `PENDING` or expired `PROCESSING` events and an expired/absent invocation lease. The database check still runs when idle; it sends no Edge invocation when no eligible work exists. Synchronous HTTP enqueue errors and admitted handler review/no-progress receipts use capped backoff. An expired `REQUESTED`/`RUNNING` generation is replaced and recorded as `WAKE_LEASE_EXPIRED`; that path does not increase the backoff counter. Asynchronous `pg_net` HTTP errors/timeouts are not currently consumed as failure receipts. Repeated lost deliveries therefore rely on lease expiry and the recovery schedule, not exponential transport backoff. It is not an every-learner scan, model scheduler or continuous 10-second poll. Future `available_at` work becomes eligible when due. Failed/max-attempt events remain explicit review cases.

## Authentication and least authority

The Edge entrypoint accepts only POST with the strict `{version:1,wakeId}` body, at most512bytes and with a3-second body-read limit. Before opening a database connection, it verifies `X-Cuevo-Wake-Signature` as a lowercase64-hex HMAC-SHA256 over `cuevo.worker.wake.v1`, the canonical epoch-seconds `X-Cuevo-Wake-Time` and the exact wake ID separated by newlines. The configured64-hex key is UTF-8 text; timestamps outside60seconds deny. Private SQL then verifies the generation/lease. If platform `verify_jwt=false` is used for machine calls, this handler authentication remains mandatory. A publishable project key alone is not authority to run the worker.

Wake credentials stay in restricted Vault/Edge secret storage, with rotation and no plaintext logs, migration bodies, browser bundles or public SQL parameters. The request queue contains only the bounded wake, issuance timestamp and one-use signature; it does not contain the reusable key. Reject caller-selected endpoints, arbitrary SQL, event payloads and extra request fields.

Actual local verification found provider-owned `net`/Vault grants remained unsafe after ordinary migration revokes. Activation and dispatch now call `worker_transport_private()` and fail closed unless schema/table/column grants deny public, Data API and application roles. The guarded local provider-owner hook in `scripts/database/harden-local-worker-transport.ts` is required after bootstrap replay; it hardens only the verified Cuevo local project and never grants runtime access. Hosted activation requires Supabase Support or the authorized provider owner to harden and prove these permissions. Runtime code and ordinary migration credentials must not escalate to that owner or bypass the privacy check.

Connect over TLS as the real restricted worker login: non-owner, no superuser/BYPASSRLS and no raw application table grants. Reuse the current private claim/process/fail permissions. Do not substitute `supabaseAdmin`, service-role Data API/public RPC or `SET ROLE` from the owner; `session_user` and grants must satisfy the worker-health contract. The candidate pins pure-JavaScript pg8.23.1 and a captured Deno2.1.4 lock with14 package versions/integrities matching the root npm graph. Build parity and actual frozen Deno cache validation passed. Hosted TLS/role/secret execution and hosted bundler rejection of a changed dependency/lock still require independent evidence.

## Bounded processing and latency

Claim commits precede processing. Each event has its own processing transaction and failure receipt; an exception cannot undo another event's completed source or erase retry attempts. A crashed invocation leaves durable leases for recovery. Duplicate or concurrent wakes remain safe through invocation coalescing and existing `SKIP LOCKED`/lease ownership, not memory-only flags.

The Node processor retains its existing10-event tick defaults. The Edge candidate claims one event at a time, processes at most10 and stops new claims when fewer than15seconds remain in its20-second processing budget. That reserve covers existing5-second claim/process/failure limits; each event retains its30-second lease and separate commits. The processing timer starts after connection, restricted health and wake admission; body reading, setup, finish and cleanup are outside it. The SQL invocation lease remains60seconds from issuance and is not extended by admission. The configured30-second `pg_net` request timeout is a separate transport limit, not proof of a total handler deadline. No database timeout was relaxed.

The implementation defines bounded claims, continuation/backoff and due-work recovery. Wake generation admission/finish does not fence every event claim. Pause/reconfigure prevents new wakes/admission but does not instantly cancel an admitted invocation; a stalled invocation can overlap a replacement after its generation expires. Event leases and source idempotency remain the write-safety boundary. The singleton wake and oldest-first event claim provide coalescing, not a hard total concurrency cap or per-school fairness. Measure total invocation latency, maximum concurrency and representative volume before activation. These are operator policies, not curriculum facts. No instant response, 10-second completion guarantee, unlimited throughput or fairness guarantee is established. Measure enqueue-to-processed p50/p95, oldest due lag, backlog, retries and failure rate; bound overload and expose review/unavailable states truthfully.

## Cost, retention and operation

Coalesce bursts, avoid idle invocations, cap batches/concurrency and stop work at the deadline. Track invocation/query count, duration, due lag and successful versus failed receipts. Database and Edge resource use is real; no zero-cost or invoice ceiling is claimed. AI reservations, configured estimates and billed cost remain separate from deterministic worker cost.

Cron/HTTP invocation history needs an explicit operational retention policy because history can grow on every run. Network response expiry is not domain audit retention. Do not delete academic evidence/audit/outbox history using a generic operations cleanup job; retention/deletion remains purpose- and jurisdiction-specific. Logs contain sanitized counts/states/latency only, with no learner payloads or credentials.

Activation requires extension versions, restricted grants, fixed endpoint/secrets, source migration hashes, runner identity, alert/recovery ownership and hosted queue-health evidence. Pause the wake/recovery adapter without deleting work. During a deployment change, avoid two uncoordinated schedulers; current lease/idempotency checks remain the last safety boundary. The handler's202 `NOT_ADMITTED` response means duplicate/inactive work was not admitted for processing; HTTP delivery status alone does not establish event completion, awarded XP or learner outcome.

The implemented release manifest requires a strict container/Edge descriptor. Edge project/function/artifact/lock identity and authentication/queue-recovery/role-grant/transport-privacy evidence remain reviewed attestations. Verification re-admits the original saved evidence within24hours and probes web/API plus container readiness; it sends no GET or signed POST to Edge and establishes no fresh Edge source/network execution. Current images remain valid local delivery evidence; no hosted deployment is implied.

## Acceptance before activation

Focused candidate evidence is45 pure worker cases,62 SQL assertions,2 actual restricted-login dispatch cases,2 Edge build/lock cases,11 verifier guard cases,17 release contract/CLI cases and passing builds. Manual local Edge probes returned200 for signed work and exercised burst/lost-signal recovery. Repeatable verifier `3ee89d28-d913-41bc-acff-e1573739356d` then passed28 checks: signed committed source processed in256ms,25 burst sources in3 coalesced waves took3172ms, and actual Edge-down/lost-wake Cron recovery took58389ms. Wrong/extra-scope signatures, duplicate/old generations and rollback remained denied; private grants and cleanup/container preservation passed. Local Kong retains stale DNS after Edge recreation, so the verifier explicitly reloads only the unchanged Cuevo gateway and proves the internal `pg_net` route reaches handler authentication through401 before source processing. Earlier failed attempts remain history; the corrected repeatable result passes with that explicit local reload. These are bounded synthetic observations, not load, latency or deployment guarantees.

Historical evidence: the 11:30 aggregate ended at 98/99 browser cases with one learner-state HTTP failure of UNKNOWN cause and no captured response body. The unchanged focused rerun and healthy probes never established its cause. Later failed aggregates and focused fixes remain dated evidence; the final passing run does not retroactively explain that uncaptured failure.

The clean-seed complete teacher/learner UI Edge loop passed 52.7 seconds (case 47.1) with 25 visible mutations through learning, native evidence, analysis, human approval, reassessment/outcome and parent/portfolio operations, plus English/Arabic mobile axe checks. The Node poller was confirmed stopped; the browser production harness external Edge mode excludes worker startup and port 4001 readiness, so signed pg_net Edge processing supplied the derived state. This is one focused Edge scenario.

The final frozen aggregate `2026-10-02T17-02-58-500Z` is VERIFIED: 568 unit cases, 148 frontend cases, 1,100 SQL assertions across 90 files, 179 ordinary integration cases plus one explicitly skipped live-provider case, outage 10, recovery 8, Edge 28, three-engine compatibility 51 and production Chromium browser 99. All five role accessibility matrices passed. Demo restoration processed 97 reference/follow-on events; initial and final 1,304-entry source manifests matched byte-for-byte. Its standard 99-case browser matrix uses Node and cannot be claimed as 99 Edge browser passes. Both adapters consume the same private domain processor. Three append-only wake migrations implement coordination, privacy and the 30-second transport timeout; core query 5-second and invocation lease 60-second limits remain intact. Local domain recovery does not certify scheduler restoration to a separately configured target, hosted execution, live models or official curriculum acceptance. See the [current acceptance report](../product/qa/CUSTOMER-READINESS-ACCEPTANCE-REPORT.md) for the evidence boundaries.

Required evidence includes:

- Committed enqueue wakes; rolled-back enqueue sends nothing; burst coalescing does not lose a later commit.
- Missing/wrong/replayed/oversized invocation authentication denies before DB work; public/service-role/raw grants stay denied.
- Claim/process/fail transaction behavior matches current Node processing; duplicate/concurrent/stale leases cannot commit.
- Lost HTTP delivery, timeout, crash, delayed retry, future due work, max-attempt/unknown events and recovery/pause/resume preserve durable outcomes.
- Original source authorization, human approvals, private Realtime/file boundaries and complete learning→state→recognition/community→outcome readback pass with the Edge adapter.
- Representative load meets declared latency/cost limits without broad scans or timeout relaxation; unknown/overload remains explicit.
- Local CLI function serving and the actual hosted TLS/role/secret/extension deployment are independently verified. Synthetic fixtures never certify real-pupil/provider/residency or official curriculum acceptance.

## Progression without domain rewrite

The initial Edge adapter is bounded execution, not a general autonomous agent platform. Scheduled due reminders, file/report preparation and other future handlers can reuse versioned events only after their domain requirements, approval, privacy, idempotency and acceptance are defined. They are not implemented by this plan.

If measured throughput, latency, team ownership or operational constraints justify a managed queue or persistent runner later, replace the wake/execution adapter while preserving event identities, domain source validation and receipts. Introduce sharding/fairness/priority only with evidence and a decision record. Do not create a parallel authoritative queue, copied domain implementation or speculative microservice tree.

## Full-app progression for future agents

This is the asynchronous foundation for the full Cuevo vision, including the phased [product roadmap, source 46](../product/overview/46-POST-MVP-ROADMAP.md). It is not permission to implement those phases during the MVP. Source 65 keeps universal orchestration mechanics separate from education tools and policies; future curriculum/jurisdiction/quality packs still require their own approved artifacts and acceptance.

| Stage | Reuse and extension | Evidence required before activation |
|---|---|---|
| Current local MVP | One durable outbox, signed coalesced wake, bounded deterministic worker, one-minute recovery and existing approval-controlled intelligence | Completed local aggregate and focused Edge flow; hosted target remains separate |
| First hosted synthetic environment | Same domains/processor with reviewed provider-owned grants, restricted TLS, fixed route/secrets, pinned delivery and recovery ownership | Actual hosted authorization/transport/committed-source/recovery tests, dependency-lock rejection, pause/drain/rotation and alerts; no real pupil data |
| Broader learning and school capabilities | Approved due reminders, file/report preparation and current role projections can enqueue versioned events under their domain owner | Explicit handler contract, source/relationship/privacy/revision tests, delivery/completion semantics and recovery; these jobs are proposed, not implemented by this plan |
| Longer AI/report/integration workflows | Durable workflow state and resumable bounded steps; keep orchestrator authorization, provider abstraction, cost reservation, provenance and human approval | Failure between steps, duplicate delivery, delayed approval/revocation, safe resume and measured cost/latency; do not place a long model/report call in the current 20-second processing loop |
| More schools or greater volume | Measure backlog/lag/database pressure first; add tenant fairness, priorities or independent consumer checkpoints only when needed | Multi-school burst/soak/failure tests, no starvation, declared connection/concurrency budgets and backward-compatible event replay; preserve one authoritative event source |
| Regional/enterprise expansion | Add reviewed regional isolation/integrations and operational controls through scoped ADRs, adapting transport/runners where justified | Target recovery/residency/authorization and tenant-isolation evidence; move one verified boundary at a time |

For every new event/handler, record the domain owner, event type, envelope schema version separately from entity revision, immutable source references, deduplication key and causal/correlation link. Define ordering assumptions, authorized context, retry limits, unknown-version behavior, and whether the receipt means acknowledgment, derived state updated, or an external effect delivered. Preserve old-version compatibility tests. Event acceptance alone must never imply completed learner state, sent communication or a successful AI result. External effects need their own durable receipt/reconciliation contract and destination idempotency where supported.

## Architecture assessment and improvements

These are qualitative engineering judgments about fit for Cuevo, not measured benchmarks, security certification or customer readiness scores. The previous modular monolith, transactional outbox and polling worker merits **8/10**: it already preserves reliable events, domain ownership and replaceable providers. The accepted event-triggered direction merits **9/10 as a foundation**, conditional on its hosted and load gates: it retains those strengths, coalesces user-driven bursts, reduces idle worker invocations and provides a transport/runner evolution path. Local tests establish the exercised behavior; they do not establish production throughput. A simpler polling worker can remain appropriate where operational simplicity or measured steady demand favors it.

The following work would support a stronger assessment, around **9.5/10 after evidence**, rather than a claim of perfection:

1. **Prove hosted operation and supply-chain enforcement.** Verify actual provider-owned private grants, restricted TLS, fixed signing configuration/rotation, deployment artifact identity and changed/missing lock rejection. Exercise a saved source through the deployed signed path, missed-wake recovery and pause/drain before activation.
2. **Declare and test service limits.** Choose enqueue-to-processed latency, oldest-due lag, connection/concurrency and cost budgets for the expected school workload; run multi-school burst, sustained load and outage tests. A 10-second target is a candidate to measure, not a current promise.
3. **Formalize event evolution and external effects.** Enforce the handler contract above with old-version, out-of-order, duplicate and source-revision tests; distinguish acknowledged events from completed projections or confirmed external delivery.
4. **Strengthen overload and long-job control when needed.** Add admission/drain/fencing semantics and asynchronous transport-failure backoff after fault tests; introduce tenant fairness and a durable resumable long-job path when measured lag/workflow requirements justify them. Do not start with speculative sharding or a second queue authority.
5. **Close the operator recovery loop.** Alert on oldest due work, repeated expired wakes, failed/unknown events and budget pressure. Provide separately authorized, audited review/replay from preserved source context, plus explicit operational-history retention and scheduler restore drills. Existing sanitized review screens are not proof of replay authority.

The next implementation unit is hosted synthetic delivery and acceptance, not a broader product rewrite. Future agents must read this plan, the ADR, affected domain sources/tests and current status before selecting a stage. Update evidence and the ADR when changing a runtime boundary; leave implemented versus proposed capabilities explicit.

References retrieved2 October2026: [Supabase Cron](https://supabase.com/docs/guides/cron), [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net), [Edge authentication](https://supabase.com/docs/guides/functions/auth), [Postgres connections](https://supabase.com/docs/guides/functions/connect-to-postgres), [Edge limits](https://supabase.com/docs/guides/functions/limits). These describe platform mechanics, not approved Cuevo operation.
