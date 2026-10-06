# Improvement backend independent review

Status: REVIEW COMPLETE — specification and quality pass for the governed human improvement increment, with the explicitly unfinished AI/state scopes below. Review is read-only on implementation/database/runtime; only this report was written. No test suite was rerun. Scope: approval-intervention plan, improvement controller/orchestrator/contracts, migration `20261001004117` and additive corrections through `20261001004542`, SQL 060 and real integration cases.

No parent-created improvement diff artifact was available at finalization. The reviewer instead bound this verdict to the stable source file hash manifest below. The aggregate manifest digest is `86FB6AC3A5AB9B31DBAAD23AD7D1CECE1416F9F9737DE9F964DFF34BE0599ABE` (SHA-256 of the compact ordered path/SHA-256 JSON manifest). Later changes require rereview; this is not an exact-commit release assertion.

| Path | SHA-256 |
|---|---|
| apps/api/src/improvement/controller.ts | 5A8678846EB15E8F720EEC352DFAFEEEDC6DA37A859D69AA5B7A7644E83F0E72 |
| apps/api/src/improvement/orchestrator.ts | B797470D3AFDA22DBA78E94001CD03595F5FE8C7617F531A8D0158F3C10A7B47 |
| packages/contracts/src/improvement.ts | CF72EC26BE32E389C76D3A1DF0420B0BF56E7A1538DDDA19A0C1147131730BB6 |
| supabase/migrations/20261001004117_approval_intervention.sql | 5C5B8105648204D481C752E60CE60756E2CE72D8B17DF4E3B1B982E6F655CFFF |
| supabase/migrations/20261001004350_improvement_event_acknowledgement.sql | 862D528B0B9B0A74BBFECC7B6F7D1136A11D933E91B001F65C4ED5FB76C78A00 |
| supabase/migrations/20261001004415_improvement_canonical_events.sql | 0E73949126D7DB74097F2A6F79DC6CAE9738022CD8871560719EDAC15F36C533 |
| supabase/migrations/20261001004508_improvement_current_scope.sql | E1F79E0AD9780DD6C00B86A6E1E29223C93157DC64B8C983AE32979F39E0BB1A |
| supabase/migrations/20261001004542_improvement_semantic_integrity.sql | 7AFE0E25935165C80748E7B079B3990C008F10AC84574E4B52624854D78EFD42 |
| apps/api/test/improvement-api.test.ts | 3E6CD85F9CA2D11516D2056CEEF11E2B16F2FBD1811AA4DB6F07B0AD3C396E7D |
| apps/api/test/improvement-contract.test.ts | 79A2D65AB748148EF4F1D90EBB67E87DC33076890EFF7CCA29E3402086F0D13B |
| apps/api/test/improvement-orchestrator.test.ts | 7E1349E7030321F2D80C7A67EBA4B5A04C4C3F423B87B846C57D75A2FFE9EC6E |
| supabase/tests/060_approval_intervention.test.sql | 161A8258828DC9BB91541F63C8AE8EE732C03D306954D72F713EC5F1F94FC7CF |

## Final verdict and remediation

**Specification pass for the human-authored action loop.** The source implements current authorized released baseline → labeled teacher proposal → explicit human approval/rejection → student support completion → compatible manually released reassessment → native comparison. It does not label a human proposal as AI-generated, replace unknown values with zero or claim causal proof. The live AI workflow remains unavailable and is not certified by this verdict.

**Quality pass for integration; no unresolved important defect found in this reviewed source.** The three initial findings are addressed. Current student access resolves the baseline course and uses `can_learn_course`; current enrollment, publication and active class are required before command replay or mutation. Measurement now checks immutable follow-up submission time as well as release time and same-learner/reference/version/native scale. Canonical event/audit keys depend on event and entity identity, with transaction advisory locks serializing semantic transitions. New-key repeats retain one intervention and one canonical transition event; changed approval edits or completion reflections conflict rather than silently overwriting history.

The author reports three API test files with nine tests passing, including the actual local Auth/API/Postgres loop, and eight SQL files with 197 checks passing. This reviewer inspected the source, tests and `improvement-backend.md` evidence but did not rerun them. Real assertions cover reject-no-action, same/new-key approval, one action/event, immutable edited instructions/reflection, peer/parent denial, teacher assignment replay revocation and student enrollment revocation, positive native change and lower zero-score inconclusive outcome.

The source-time guard is present and correct, but a dedicated negative fixture for pre-intervention submission released afterward was not found in the final tests; add it to the next recovery/golden-case hardening. SQL 060 supplies eight schema/grant/source-denial checks, while full loop behavior relies on the actual API scenario. This is an evidence boundary, not a claim of independent complete SQL functional coverage.

## Historical findings — addressed in final source

### [P1] Require current enrollment on student intervention access

The initial `can_access_intervention` student branch checked learner identity plus `can_view_person` self scope, which establishes current school membership but does not establish enrollment in the baseline course. An enrollment-revoked student could still retrieve/complete their old intervention and replay its completion response. The current-scope correction `20261001004508` resolves the baseline course and calls `can_learn_course`, restoring current enrollment, publication and active class checks. Final evidence should demonstrate revoked enrollment denies read/completion/replay.

### [P2] Measure follow-up source time, not only release time

The initial `measure_intervention` checks released result `created_at > completed_at`. Work can be submitted and marked before intervention, then released after completion; that stale work incorrectly qualifies as a follow-up. Require the immutable follow-up submission's timestamp to be after completion, alongside the existing same learner, linked assessment, reference/version and native scale checks. A regression should submit pre-intervention work, release it later, and assert no measurement is persisted.

### [P2] Deduplicate canonical transition events across new command keys

The source helpers return existing decision/completion/link/measurement IDs on semantic repeats, while the initial controller appends audit/outbox using a key hash containing the fresh Idempotency-Key. New-key repeats can therefore announce one completed/approved/measured transition repeatedly. Serialize semantic transition checks and emit canonical events once per authoritative entity transition. Request attempts may be audited separately if explicitly labeled; they must not appear as new domain actions. Also reject changed approval activity edits/reflections after the authoritative decision/completion rather than silently returning success for an unchanged prior record.

## Positive observations and review limits

Current command scope precedes stored replay. Shared Supabase identity/current membership and private transactions are reused. Teacher-authored recommendation origin is server fixed; baseline learner/reference/evidence are derived from the released result, not caller authority fields. Parent access to proposals/tasks/outcomes is denied; teacher and student scope are separate. Human decisions, completions and outcomes are stored separately from academic results. Baseline/follow-up numeric values and factual difference retain explicit non-causality limitations; lower follow-up is inconclusive rather than a fabricated improvement.

AI analysis currently returns `INTELLIGENCE_UNAVAILABLE` after authorized minimum evidence retrieval; no model-generated proposal or provider quality claim follows. The injected orchestrator fixture checks output shape, allowed evidence IDs, a narrow instruction filter and timeout/budget behavior. It remains a partial provider boundary and does not prove live semantic grounding, complete prompt-injection resistance or production AI policy approval. This limitation must remain explicit in the final report.

Runtime OpenAPI responses/list metadata and complete support/impact state projection remain documented later scope. The worker acknowledges the new canonical setup/action events, preserving queue reliability, but does not yet refresh support/impact from them. Parent/root still owns clean replay, browser/Arabic/mobile/accessibility and final repository verification. No Gate 3/5 completion follows from the human action loop alone.
