# Fixed Native Schema Admission Cohort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Admit source-bound recovery and continuation stages within the existing30second evidence budget while preserving quiescence, immutable records and original effect authority.

**Architecture:** The held native Client collects fixed PRE/POST Storage metadata and serial catalogue/target/private facts. A separate fixed Storage-only observer overlaps HTTP comparison reads, and the existing native registry publishes one complete fact pair only after both lanes settle and agree. Executor consumes those actual facts through an opaque native getter.

**Tech Stack:** Existing TypeScript/Node24, pg, zod, native filesystem/Git, bounded fetch and node:test; no added dependency.

**Spec:** [Fixed native schema admission cohort](../specs/2026-10-08-native-schema-admission-cohort.md).

## Global constraints

Design reviewed by root; Task1 fixed observer/metadata work is authorized, later tasks retain root review and owned implementation boundaries. Use codex/native-admission-cohort at base d3fc93b9973d1b66717526820a85c1ee273dac77; preserve the release and PR11 checkouts. No hosted retry, provisioning, deployment, CI dispatch or commit follows from writing this plan.30s freshness,15s request bounds, absolute expiry, opaque registry provenance and unknown-effect no-retry rules remain. Never exempt mgmt-api from catalogue quiescence or allow generic callbacks/SQL/clock input. Existing ordinary nonrecovery Management inventory and held execution protocol remain unchanged. Product sources02/38/40/61/67/81/82 and existing owner tests must be read.

## Task1: Fixed Storage-only observation and agreement

Files: create scripts/database/hosted-migration-storage-observation.ts and hosted-operator-storage-observation.ts as the single lower owners; modify scripts/database/hosted-migration-remote-journal.ts and hosted-operator-storage-inventory.ts to consume and forward those fixed interfaces; tests hosted-migration-remote-journal.test.ts and hosted-operator-storage-inventory.test.ts. Keep changes in existing owners and update their README during Task4.

Interface: observeHostedMigrationStorageProject({projectRef,boundProjectRef,storageKey,signal}) returns actual bucket/set/owner/record/INFO/body snapshots and clocks, with no effect methods or providerToken. Pure metadata validators normalize native PRE/POST rows and compare them with this observation.

- [x] Add a failing actual transport test: every attempted Management origin request throws; valid operator bucket/list/INFO/body reads still produce complete before/after observation. Assert zero upload methods and no writeJournal/readJournal surface.
- [x] Add failures for unknown/omitted type without nativeSTANDARD agreement, mismatched objectid/version/size/MIME, extra applicationbucket/object, foreign path, gap, malformed bytes and changed second scan. Preserve all exact original chain bytes.
- [x] Implement the fixed observer by extracting existing bounded Storage read/chain decoding, retaining8slot concurrency/allSettled and15s body deadlines. Existing journal factory still performs its own Management admission and uses unchanged effect checks.
- [x] Run `node --import tsx --test scripts/database/hosted-migration-remote-journal.test.ts scripts/database/hosted-operator-storage-inventory.test.ts`. Record discovered/executed counts and exact source hashes; no skips or fake latency clocks.

## Task2: Held-Client phased native fact pair

Files: modify scripts/database/hosted-migration-database.ts; tests hosted-schema-reconciliation-native.test.ts, hosted-schema-continuation-native.test.ts and hosted-migration-database.test.ts. Reuse current private registry/template/plan closures; do not add a ledger or exported registration hook.

Interfaces: refreshSchemaStageAdmission(permit,identity,expectedVersions):Promise<void> and readNativeSchemaStageAdmission(permit,identity,expectedVersions):NativeSchemaStageAdmission. Returned clone includes only actual normalized source/stage/authority/target/post/inventory facts and their original clocks. Source-derived identity/version bounds are captured from the admitted closure.

- [x] Write RED controlled tests proving the old serial route exceeds30s under nativePG2999ms/provider477ms/catalogue10s/333msStorage/1smetadata/source5226ms and refuses initial intent. Retain old31700ms refusal evidence as the defect, not an expected success.
- [x] Write RED phase tests: active Management postgres session triggers existing quiescence; no cohort observer invokes Management; Storage lanes can be pending while heldClient catalogue runs but all native queries execute serially.
- [x] Add one fixed parameterized JSON snapshot SELECT per PRE/POST Client phase carrying every required count, bucket/object metadata and current target fact, with exact int8text and id/version/metadata/time/count semantics; admit every allowed bucket from current immutable migration stage. Gather native current target/history/private/post facts once per phase as specified.
- [x] Implement actual authority/provider endpoint admission→PRE/firstquiescence→Storage-only and serialized catalogue/native fact phase→allSettled drain→catalogueROLLBACK/finalhistory/finalquiescence→POST→agreement→registry publication. Keep ordinary readSchemaCatalogue unchanged; the fixed internal phased operation accepts no callback. Preserve original official/provider/native/Storage clocks. Clear pair before await; reject stale/failed lanes and provide no getter facts. Preserve readback/receipt clocks and original unknown chain.
- [x] Test120/123, bounded continuation versions and consumption-only rejection; changed source/run/attempt/target/history/auth/school/file/grants/privatecontrols/originalchain/receipt/package/expiry refuse. Proxy/clone/getter/forged inputs never register. All failed lanes settle before lease cleanup.
- [x] Run focused native correction scopes with `node --import tsx --test scripts/database/hosted-schema-reconciliation-native.test.ts scripts/database/hosted-schema-continuation-native.test.ts scripts/database/hosted-migration-database.test.ts`. Record exact targeted getter/barrier/snapshot/publication/append scope outcomes rather than claim a new all45-native invocation; current CI will execute the required full inventory. Do not repeatedly execute the full product/browser acceptance suite.

## Task3: Exact executor consumption across stage and batch effects

Files: modify scripts/database/hosted-migration-executor.ts; tests hosted-migration-executor.test.ts, hosted-schema-reconciliation-executor.test.ts and hosted-schema-continuation-executor.test.ts. Keep hosted-migration-execution.ts and native CLI/journal semantics unchanged.

Consumes: the two native methods from Task2 and actual existing paired NativeBackendReleaseAdmission. Produces: existing NativeHostedMigrationStageResult/protocol shape with meaningful fixed phase/ages, no raw provider content.

- [x] Add RED full actual-owner test including real local/durable/remote journals and physical stage files: the provider-shaped combined profile must complete the original three once after a correct phase cohort; each negative case asserts no INTENT/CLI after denial.
- [x] Replace only recovery/continuation/batch revalidate calls with native cohort plus getter. Validate same source/tree/currentmain/run/package/fingerprints/history/TLS/counts/postconditions against actual returned facts; eliminate the second standalone Management inventory and target/post reads in that branch. Ordinary nonpermit path retains its original reader.
- [x] Complete cohort refresh precedes revalidate/CLI/batch consumption; journal INTENT/COMMITTED retains the smaller existing native-only refresh plus paired actual authority check, which clears optional complete facts but never skips effect guards; retain last localsource/artifact/certificate/deadline assertions and complete before/after cumulative batch proof. SafetyREVIEW does not require a new effect admission. Reject new intent after unknown execution or lost receipt.
- [x] Test currentINTENT ownership after exactdualack, foreign/unowned INTENT denial, lost publication/CLI, original UNKNOWN never retried, committed cleanup downgrade, final history123/230 and source/clock drift immediately before child launch.
- [x] Current reconciliation executor12/12 and continuation executor4/4 scopes passed in separate recorded invocations with exact current native source hashes. Capture actualphase timings and counts; retain failed earlier source evidence separately.
- [x] Complete the ordinary hosted-migration-executor.test.ts39-case compatibility invocation after its current fixture-only hook correction; do not label the two passing scopes above as one combined command.

## Task4: Reviewable source and release handoff

Files: owner README, docs/codebase-map.md, this spec/plan and a decisionrecord for accepted boundary; repository-required discovery only if a new test owner is created. No generated evidence/secrets are committed.

- [x] Update documentation to describe actual implemented ownership, Management/quiescence fence, retained limitations and measured profiles. Do not promote controlled tests to hosted/architecture/customer approval.
- [x] Run final `npm run typecheck`, scoped lint, `npm run check:architecture`, `npm run test:architecture`, `npm run check:docs`, `npm run test:docs`, `npm run check:repository`, `npm run test:repository` and `git diff --check` once current code is settled.
- [ ] Freeze a clean signed source and obtain complementary nonauthor review of Storage observer, native cohort, executor and tests. Require exact hashes, complete discovered/executed coverage and scope labels. No frozen prior review/CI certifies changed code.
- [ ] Parent completes protected PR/currentCI/integration and prepares a fresh exact approved hosted recovery package. Read current immutable receipt/history first; original3 pending files only if stillpending and scopevalid. Report actual SQL/history/accounts/API/worker/frontend milestones separately. Stop on unavailable authoritative facts or UNKNOWN effects; no automatic replay.

## Review questions that must close before coding

Source tests must refuse forbidden postgres activity; actual hosted Storage-role/quiescence remains later evidence and never earns an exception. Unknown hosted role is not a blocker to source implementation. Confirm fixed native PRE/POST SELECT schemas reproduce every ordinary inventory metadata check, including providerint8 and version omission. Confirm catalogue/source/target/post fact reuse is valid for each before/after stage/batch and does not omit a later check formerly performed. After implementation measure the captured provider-shaped profile against the≤22s cohort target; if it cannot fit30s, preserve an evidenced execution blocker rather than erase reads or widen30s. Typed comparison-only/fullschema consumption purposes remain unchanged until separately accepted.

Current verification checkpoint: lower Storage/metadata owner cohort67/67 passed with architecture/type/lint/diff evidence. Native owner focused getter/barrier/normalized snapshot/publication/append scopes pass; the earlier45-case native invocation41pass/4fail remains explicitly failed and is not relabeled. Exact current continuation4-case and reconciliation12-case invocations passed4/4 and12/12 on current cd13native source respectively; raw failed earlier invocations remain preserved. Ordinary fixture39current verification passed39/39 after the fixture-only missing getter export correction; earlier failed evidence remains preserved. Required structural counts17/7/25 and current TypeScript/scoped lint pass. Signed freeze, independent exact-tree binding, current CI, hosted original effects and customer acceptance remain pending.
