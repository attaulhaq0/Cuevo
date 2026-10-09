# Synthetic staging release operations

This runbook explains the source implementation in the [incremental lifecycle decision](../decisions/2026-10-08-incremental-release-lifecycle.md). A local passing test or completed GitHub job does not establish hosted provisioning. Read the original native receipts and current provider state before reporting a milestone.

## Choose the next operation from actual state

| Current verified state | Next operation | Required result |
| --- | --- | --- |
| Interrupted migration prefix | Reconcile the original prefix, then execute only admitted pending migration stages | Exact append-only native history and released migration lock |
| Complete schema, no fictional population | Populate the reviewed reference data and provision the original fictional Auth identities | Exact reference population and 133 confirmed identities, with original receipts |
| Complete schema and fictional population | Prepare immutable runtime artifacts, deploy API and Edge, verify private access, then confirm original worker activation | Exact provider artifacts, private permissions and confirmed native execution |
| Confirmed current runtime | Revalidate current native state and prepare operating staging | Separate operating handoff and three public browser configuration fields |
| Operating staging | Deploy frontend from its reviewed source and run hosted role/journey verification | Current frontend receipt and hosted journey evidence |
| Hosted candidate | Run full customer acceptance, recovery/restore and operational review, then customer approval | Actual customer acceptance and approval |

Database completion survives a later API or frontend failure. Ordinary CI uses disposable Docker databases. It must not reset hosted staging. A completed stage is historical evidence; reuse requires current native verification of its exact installed state, source and original receipt. A changed source does not inherit an earlier source approval.

The supported first release uses separate packages. Run `schema-and-accounts` until native schema, reference population and all 133 Auth identities are confirmed. Only then prepare `complete-backend` with `operating-staging`; preparation refuses an empty target, incomplete schema, missing accounts or pending SQL before runtime artifact delivery. After the first runtime and generation are confirmed, prepare `installed-runtime` for operating checks or a same-source `customer-candidate` acceptance run. Legacy activation receipts can be observed for staging; full customer acceptance requires the current generation.

A `runtime-rollout` package finishes at its own verified native result. It binds the previous generation and cannot serve as the next generation's handover. Prepare a fresh `installed-runtime` package from the actual confirmed current state before API-origin observation, handover, public web settings or transfer. Original rollout recovery exports are retained only after a failed or cancelled initial roll-forward operation. Successful operations and later recovery/rollback do not create a replacement original export.

## Operating evidence and customer evidence

`prepareOperatingStagingHandoff` in `scripts/verification/backend-web-handover.ts` composes the existing native schema and Auth readers, current generation observer, all five role probes, direct Data API denials, private Storage/Realtime probes, and normal API-origin authentication/CORS verification. It compares current runtime state again after the probes, requires closed sessions and released locks, and preserves the earliest original evidence clock.

Its outputs are `.local/hosted-release/operating-staging-handoff.json` and `operating-staging-public.json`. The purpose is `CUEVO_OPERATING_SYNTHETIC_STAGING_HANDOFF`; `customerAcceptance` remains false. `operatingStagingBrowserInputs` admits only an explicitly selected staging environment with exact source/tree/project/team/origin. It returns only `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

The broad `prepareBackendWebHandover` path still requires full worker fault/recovery and native database backup/restore. Customer and production manifest consumers reject the operating receipt. The operating API-origin lane defers full recovery/restore until those customer gates; it retains actual native worker confirmation, private denial evidence and normal authentication/CORS checks.

The first confirmed runtime requires an actual generation-state bridge before the new current-generation operating observer can accept it. A version-one receipt by itself is insufficient to infer the pause state or version-two runtime generation. The initializer preserves the original receipt, verifies actual native history/control/key/Cron/provider state, then writes a separate active generation. Initial operating consumers also require the exact successful official initialization step.

## Update an already operating runtime

For an ordinary update with no schema or runtime-contract change, prepare the desired release from its own current protected CI and artifacts. The existing native current generation supplies the previous source, provider and artifact identities; exact historical Git contracts provide the old contract comparison. Its original source CI archives and old ZIP are not required merely to replace a healthy older runtime. Missing historical Git or changed authority still requires review. Read [the evidence lifetime decision](../decisions/2026-10-09-installed-runtime-evidence-lifetime.md) for the trust boundaries and unsupported cases.

Rollback requires available original runtime binaries and exact receipts within the configured ninety-day artifact retention window. Provider receipt selection is only a candidate; actual native encrypted generation history must confirm its source, artifact and provider IDs before effects. A two-day frontend transfer is not required for this selection. Expired rollback binaries require a new verified forward fix, not reconstruction or an approval bypass. The provider history bound of twenty operations and encrypted traversal bound of one hundred generations still need a verified long-term rotation policy; do not describe these limits as unlimited operation.

Use one reviewed previous-to-desired operation. Its approved binding records the exact previous generation/source/tree/runtime/provider/artifact/state tuple, the desired source/tree/artifact compatibility and next generation, and an operation digest. Artifact uploads and provider IDs come from verified original provider receipts.

The runtime compatibility manifest includes protected identity, tenant authorization and account lifecycle source alongside public API/worker contracts. A changed authority path requires explicit compatibility review even when endpoint shapes stay the same. The runtime artifact producer verifies actual physical source, exact lane status/digest and original commit/tree before and after durable publication. Partial receipt bytes cannot replace a successful original producer outcome.

The native session pauses admission, drains held work, retains the previous credential and wake key, verifies private provider delivery, binds the reserved API origin, enables the desired generation and verifies actual signed execution plus old-generation denial. Every phase retains an original intent and confirmation. Unknown acknowledgement remains unknown; do not replay an uncertain provider upload, alias write, history upload or migration command automatically.

Vercel does not provide an atomic alias compare-and-set. `transitionRuntimeApiOrigin` requires a live native lease and exact paused previous/desired state, checks both deployment owners and the current alias immediately before assignment, records the original intent, then verifies the response and current mapping. An external writer can race the last read. A mismatching replacement or uncertain acknowledgement requires operator review even if the alias subsequently points to a healthy endpoint.

The alias protection override belongs only to the reserved synthetic staging origin. Browser verification uses normal requests without a private deployment bypass. Production/customer domains require their own approved release.

## Report progress without erasing uncertainty

`summarizeHostedReleasePhases` preserves original phase statuses, clocks and evidence digests. Missing phases are `UNKNOWN`, not zero or failed. `summarizeOperatingStagingHandoff` binds the exact handoff digest and confirms only database, accounts and runtime; frontend, hosted journeys and customer acceptance remain unknown.

Report actual migration and account counts from the selected provider, actual deployment IDs and states, and the next unconfirmed milestone. A whole workflow's terminal failure does not undo confirmed hosted effects. Cleanup uncertainty still prevents the operation from being called complete. Keep private tokens, connection strings, pupil records and raw private evidence out of user-facing summaries.

## Verification and handoff

Run the source-owned checks for every changed scope. Record the frozen source/tree, exact CI run/attempt, immutable artifacts, independent reviews and native hosted receipt digests. Keep full regression and customer acceptance separate from focused database/runtime admission. Frontend deploy consumers must explicitly choose the operating bridge; a new receipt alone does not connect the frontend.

Before giving a customer green light, complete the required five-role learning journey, English/Arabic and mobile behavior, access-denial tests, source-backed curriculum rights/school approval, restore and operational ownership evidence, and the founder's actual launch approval. A working synthetic staging app is a useful testing milestone; it is not customer launch acceptance.

Pending schema or interface changes still require a separate reviewed maintenance path; the current normal rollout refuses them. Full customer handover with retained older components after rollback is also refused explicitly. These limitations remain implementation work and do not certify a complete future release lifecycle.

Official Data API configuration is read from the fixed Supabase Management PostgREST endpoint at the current approved consumer. An explicit empty db_schema is disabled; absent, malformed or changed values require review. Initial activation no longer depends on a copied dashboard variable and reports manual=false with exact minimized provenance. Endpoint REST/RPC/GraphQL denials, private grants/Storage/Realtime, signed worker/recovery and cleanup are still separate requirements. Current confirmation and handover re-read configuration without renewing original execution clocks. Old dashboard records stay historical. No readback alone establishes operating staging or customer acceptance.
