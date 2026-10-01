# Numeric academic truth verification

Date: 2026-10-01, Asia/Riyadh. Scope: school-authored objective approval, teacher-controlled numeric marking/release, source evidence, correction history, approved parent projection. This is one academic model; rubric and official curriculum verification remain required MVP work.

Teacher/admin creates a draft School Custom objective; coordinator/admin approves it. A current managing teacher links that approved version before marking. An explicit reviewed numeric zero remains zero, while missing/invalid input is rejected. Marking drafts remain staff-only. Human release atomically persists immutable result, submission-source evidence, current projection, audit and outbox. Corrections create a new revision; prior results/evidence remain. Parent visibility defaults false and is explicitly approved with release, then current guardian relationships enforce access.

Fresh verification:

- Local reset replayed the academic migrations and deterministic source seed; 133 synthetic Auth identities provisioned.
- Final combined database suite: 6 files, 164 assertions passed, including source/version/rights scope, immutability, stale revisions, rollback and private grants.
- Sequential real Auth/API/Postgres integration: 7 tests passed across learning and academic suites. Numeric correction, private/approved parent results, source privacy, semantic release dedup and revoked access were exercised.
- `npm test`: 176 Vitest tests, 26 web contract/pagination/auth tests and 4 local-runtime tests passed.
- Lint, typecheck, API/Next/worker builds passed.
- Four browser tests passed, including actual teacher review/release and student evidence with Arabic mobile/axe checks.
- Independent academic specification and code-quality review passed after the unmapped-marking workflow trap was fixed. See academic-code-review.md.

Pagination now offers bounded Load more controls for learning and academic lists, validates cursors, deduplicates rows, preserves loaded records on subsequent-page failure and clears stale pages on school/actor/context changes. The course detail tree still has a documented 100-node/500KB capacity limit. No protected browser content is persisted offline; current sessions remain memory-only.

Review identified that an unmapped marking draft would freeze the assessment context and block later release. The API and private source helper now require an approved objective before any mark is written. Failed marking leaves configuration recoverable; tests link and mark after the refusal. Duplicate release with a new command key returns the authorized existing result without publishing another canonical result event.

Remaining: rubric/criteria marking, submission return/revision workflow, source-locked official packs, worker projection/habit processing, signals/intelligence/approval/intervention/outcomes, SIS daily operations, private Storage/Realtime/community and full role journeys. Sparse OpenAPI response metadata for three academic reads/transitions is a documented follow-up. Production/residency and live AI remain unverified. These results do not establish Gate 2 or Gate 5 completion.
