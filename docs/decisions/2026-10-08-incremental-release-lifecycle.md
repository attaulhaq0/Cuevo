# Incremental synthetic staging releases

Status: implementation in progress, 8 October 2026. The founder approved simplifying first installation and subsequent release operations while retaining the existing domain API, worker and customer acceptance standards. Source changes and focused local tests do not establish protected integration or hosted acceptance.

Sources02/38/39/40/61/67/68/81/82/83 and the accepted event-processing foundation govern this change. The [implementation specification](../superpowers/specs/2026-10-08-release-lifecycle-simplification.md) and [plan](../superpowers/plans/2026-10-08-release-lifecycle-simplification.md) record the full scope and outstanding verification.

## Independent database authority

One canonical workflow owns fast source checks, source contracts, an isolated database boundary, backend runtime and browser runtime. The database job replays the exact migrations, verifies advisors and grants/RLS, restores its owned synthetic state and freezes authored source. Backend runtime retains its own isolated bootstrap and application tests but consumes no duplicate SQL/advisor suite. The aggregate consumes all three original lane receipts from one source, run and attempt.

The source/database reader requires exact successful source, database and security jobs, the original database lane archive, the original processed CodeQL archive and current main/tree. A pending or failed unrelated browser/backend job does not invalidate independently completed database authority. Database, source or security failure still blocks installation. The manual focused entrypoint observes that canonical proof through GET requests and reports NOT_READY; it performs no replacement test run or hosted write. Historical focused packages retain their original versioned reader.

## Preparation and delivery

Version two backend packages discriminate database-only, runtime observation and exact CI runtime delivery. Database-only packages carry explicit null component hashes and no deployable roots. Observation packages carry original component hashes and no fresh builders. Runtime delivery consumes the original source/run/attempt artifact archive, with fixed inventory, byte hashes, dependency lock and provider format checks. The backend producer builds once and publishes after its own verification. Production promotion remains a separate approved consumer.

Historical version one package bytes, hashes and clocks remain valid within their original scope. New source-specific preparation cannot relabel old evidence or mutate an original uncertain operation. A diagnostic failed-job rerun may carry earlier producer artifacts; release aggregation requires a fresh complete producer attempt unless a separate exact reuse contract exists.

The supported native route requires database/accounts completion before first runtime preparation. `complete-backend` delivers operating staging from a confirmed installed population and 133 Auth identities with no pending SQL. Full same-source customer acceptance uses a fresh `installed-runtime` package after generation initialization. A runtime rollout completes independently; its previous-state package cannot authorize handover for the newly published generation. The next package reads actual current state again. This ordering preserves review identity and avoids rewriting approved packages after effects.

## Running release ownership

The private database active-runtime owner retains original activation and a compact current/pending generation. The original worker key, Cron recovery and authoritative outbox remain. Generations are exact positive PostgreSQL int8 strings; conversion through JavaScript Number is prohibited. One private last-completed-wake identifier retains the actual finished invocation for duplicate denial probes; it is control metadata and never a second event ledger.

Migration231 adds private operator admission pause/resume and generation fences to current and legacy claim/begin entrypoints. Pause serializes with new claims; current event completion/failure and invocation finish retain their existing leases. Drain requires observed absence of active invocation/domain/analytics leases. Disabling dispatch is a separate operation and cannot substitute for graceful drain.

An upgrade binds previous/current source, desired immutable components, explicit compatibility, current approval and a monotonic generation. Desired API/Edge upload, private verification, exact owned API alias transition and native publication remain ordered observed effects. PostgreSQL, Vercel and Edge are separate systems; an unknown outcome requires exact readback and preserves its original intent. No database reversal, silent reseed, replacement key or blind upload retry is admitted.

Compatibility compares actual component contracts, protected authority surfaces and immutable migration prefixes. Ordinary verified binary changes with unchanged installed schema, API/event contracts and protected authority surfaces consume current required CI and retained previous artifacts; they do not repeat all earlier acceptance. Identical components may retain different full repository provenance. Changed components or pending migrations require paired old/new execution and current authorization evidence; a compatibility Boolean or SQL keyword scan is insufficient. Provider rollback retains expanded schema and restores verified old bytes as a new monotonic release; actual Edge version remains factual.

## Staging and customer claims

An operating synthetic staging handoff has its own purpose and explicitly false customer acceptance. It requires current native database/Auth/private/runtime/worker and API-origin proof with cleanup. Full hosted role/learning/mobile/Arabic, restore, curriculum rights and school/operational approval remain customer gates. Production consumers reject operating-only receipts.

Each milestone is reported independently from original receipts. A later failure does not erase installed migrations, created identities or actual provider deployments. UNKNOWN remains distinct from unattempted, failed and confirmed. No deployment duration or permanent success guarantee follows from this architecture.
