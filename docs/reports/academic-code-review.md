# Numeric academic backend independent review

Status: REVIEW COMPLETE — specification and quality pass for the numeric academic increment after the workflow correction. This is an independent manual review of frozen artifacts, not a test rerun or a CodeRabbit result. No backend source or database was changed by the reviewer.

Artifact: `.local/review-academic.patch`, SHA-256 `05F0BB91DAA7E3E095DA4ED5A6463672AAA9E5B6C202887C96FA92E4CB5E8173`. Reviewed the saved academic-truth plan, academic service/controller, strict contracts, migrations `20261001001036_academic_truth.sql` and `20261001001421_academic_context_immutability.sql`, SQL golden cases, real API test and backend report. Source requirements include 03/04/05/17/38/39/43/61/81.

Correction artifact: `.local/review-academic-fix.patch`, initially reviewed at SHA-256 `72ECF485D14D6766D03D9C7DAF80A23CDDB8B367DA81D64221CE73BFB2D4790E`, then refreshed to include the API regression at SHA-256 `693A69B0C1F4533641A03E4C53FC9BC526C16FBD80D3742265408B266DB3CE09`. The reviewer reread the refreshed artifact and confirmed the same corrected command path and SQL prerequisite, plus the additional missing-reference API assertion. The artifact includes additive CLI migration `20261001002127_academic_mark_reference_required.sql` and recovery cases.

## Final verdict and correction

**Pass for the assigned numeric scope; no unresolved important defect found.** The API now rejects missing/unapproved context with `ACADEMIC_REFERENCE_REQUIRED` 409 before reserving or writing a mark. The restricted SQL helper repeats that check after locking the actual submission and assessment, before creating an immutable revision. A rejected unmapped mark therefore leaves reference linking available. The new SQL cases inspect absent history after rejection, link an approved reference, and verify subsequent marking succeeds. The author reports 30 academic SQL checks passed after this correction; this reviewer inspected those cases without executing them.

The original finding below is retained as review history and is addressed by these changes. Current result/native score fields continue to derive from the immutable released revision; the correction changes only the marking prerequisite and preserves release/evidence/history semantics.

## Historical finding — addressed

### [P2] Reject unmapped marking before it freezes the only release path

`supabase/migrations/20261001001036_academic_truth.sql:53–57` permits `mark_submission` to persist an immutable REVIEW revision when the assessment's `academic_reference_id` is NULL. `link_assessment_reference` at lines 49–52 rejects a later reference link as soon as any marking revision exists, and the context trigger in `20261001001421_academic_context_immutability.sql` freezes the same context. `release_marking` requires an approved reference and exact match to the saved marking context. A normal successful mark request on an unmapped assessment can therefore make that learner's submission permanently unreleasable through the available commands; a correction still snapshots NULL because the assessment cannot be linked.

Require an approved compatible same-school reference before creating the first marking revision, returning a reviewable conflict without writing a mark. Alternatively implement an explicit recoverable pre-release context transition that preserves history, which is broader than the current increment. Add a regression that successfully creates an unmapped assessment/submission, attempts marking, then links an approved reference and marks/releases it. The existing SQL missing-reference test nests marking inside a failed release and rolls back both, so it does not expose this persistent workflow trap.

## Specification and architecture observations

The remainder follows the assigned numeric scope. It preserves School Custom source/version identity without publisher codes or official curriculum claims, requires a separate coordinator/admin reference approval, snapshots teacher-defined native numeric values and policy/reference context, and stores draft marking separately from authoritative released history. Zero is accepted explicitly; missing score, missing source confirmation, stale revision and invalid numeric bounds are rejected. Rubrics and official curriculum acceptance remain documented later mandatory work and are not defects attributed to this numeric-only increment.

API commands reuse the current Supabase identity/session/membership boundary and private transaction helper. `authorize` runs current academic entitlement and object checks before reading a completed idempotency response. Teacher/admin marking and release require current course ownership, class/subject assignment and learner enrollment; direct scoped predicates fail outside current tenant context. Students and parents cannot read draft marks. Released/evidence queries use current learner/parent relationships, and parent projection defaults false until explicitly approved by the releasing human. Evidence responses expose provenance rather than raw answers.

Released revisions, marking revisions, evidence, source versions and approved references are immutable. Compound school/learner foreign keys protect the current result pointer and source ownership. Release inserts result and evidence with deferred mutual links, advances the current pointer, and the API writes audit/outbox/stored response inside the same transaction. Source IDs are derived from the actual immutable submission, not caller input. Corrections preserve previous results/evidence and create a new released revision.

New-key duplicate release serializes on a transaction advisory lock scoped by school/marking ID, finds the existing released revision and returns it without another canonical event. The SQL release path additionally locks the underlying submission and validates latest marking, policy/reference context and visibility. Same-key replay rechecks current assignment before delivery of stored content. Fixed search paths, explicit execution grants and private schemas preserve the Data API/worker deny boundary.

## Quality and verification limits

Strict schemas and parameterized SQL values protect command inputs. List reads use bounded UUID pagination; latest marking is selected with LIMIT 1. Errors are normalized and responses are no-store. Some controller response documentation remains sparse for reference approval, assessment-reference linking and single evidence detail; this is a documentation follow-up and does not weaken current runtime validation or authorization.

The author reports five targeted API tests and 27 academic SQL checks passing. The parent reports the combined suite now passes 161 SQL checks and six integration tests, plus a real English/Arabic mobile numeric-zero release/provenance browser journey. This reviewer inspected the test bodies and evidence but did not independently rerun them. Actual integration tests cover current teacher assignment replay denial and parent relationship evidence revocation; SQL cases cover immutable history, stale source/revision, private grants and transaction rollback.

The parent still owns final clean migration replay and whole-repository verification. No production, official curriculum, rubric, learner-state/intelligence or Gate 2/5 completion follows from this review. The reviewed correction closes the unmapped-marking trap without permitting a context overwrite or weakening immutable-history protections.
