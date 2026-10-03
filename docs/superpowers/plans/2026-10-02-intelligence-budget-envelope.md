# Shared intelligence budget envelope

Authority: founder's scoped completion instruction; sources10/60/65/78 and root AI cost limits. This follows accepted policy/context/provenance and durable status; no live calls are authorized here.

Design: school administrators explicitly approve versioned USD reservation limits per UTC day, per actor and for concurrently reasoning runs. An operator supplies an explicit global daily reservation ceiling in server configuration. Live source reservation validates both limits and acquires deterministic global/day, school/day and actor scope locks before creating a run; duplicate original keys reuse one reservation. Full per-run cap remains held after success/failure/timeout because usage does not establish an invoice. There is no automatic credit release or fabricated billed amount. Fixture mode remains zero-cost and requires no live financial policy.

- [x] Add failing budget contract/config/service cases and concurrency acceptance fixtures.
- [x] Add explicit budget policy read/approve API and English/Arabic admin form under improvement, with audit/idempotency/version guards.
- [x] Add private SQL reservation ledger and school/actor/global daily/concurrency checks before normal run reservation. Keep private grants, synthetic population/source and human-approval boundaries.
- [x] Update service LIVE settings with configured global ceiling and existing opt-in synthetic fixture setup with explicit approved budget API; never run the model.
- [x] Root verifies SQL and actual Auth/concurrent reservation cases, with original-key/unknown-charge/denial evidence; focused browser and source checks follow.

Coordinator evidence: additive12659 applied; SQL158 five assertions, committed real two-connection same-actor contention API one case and budget browser2.5seconds passed. Those receipts prove the exercised same-actor/shared-school ceiling, original-key single reservation and timeout-held cap. Cross-actor school, cross-school concurrent global and separate concurrency-limit cases are now authored in the budget API suite; coordinator execution is pending and implementation source alone is not their proof.

No monetary policy default is inferred. UTC period, USD reservation basis and unknown invoice costs are visible. Reconciliation/release requires a separate approved operator audit workflow; until it exists all reservations stay held. No grade, curriculum, permission or provider billing authority is delegated to AI.
