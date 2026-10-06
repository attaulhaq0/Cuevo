# Assessment preparation and completed quiz review

**Goal:** Teachers prepare a task before learners can submit, deliberately publish a checked configuration, and learners can review recorded quiz attempts after the task closes.

**Sources:** Product13 assignment availability/submission type/status and resume;17 native numeric/rubric configuration and immutable academic context;37 assessment builder;83 learning/academic/feedback scope. Existing published fixtures remain compatible. Root coordinates migration application and runtime verification.

**Architecture:** Add an optional preparation mode to the existing school-learning owner. Customer creation uses DRAFT/CLOSED, declared task/marking modes and a preparation version. Current legacy creation without preparation retains published behavior. One draft command edits only unconsumed task metadata and approved objective/rubric configuration; publish validates current preparation/policy/availability versions, managed published course and the required approved reference/quiz/rubric. Draft learner enumeration/read/write is denied by SQL and API; no browser-only authorization. Completed quiz review resolves the learner's immutable attempt version while new attempts retain availability checks.

**Files:** Existing contracts/src/school-learning.ts and learning service/controller; learning model/messages/editor/quiz; one additive migration, owner SQL cases, focused API and browser regressions. Owner READMEs and codebase map describe the added public behavior. No portfolio/intelligence/root product source changes.

- [x] Write red contract/service/parser cases for preparation input, strict versions, draft-hidden/current guards and completed-attempt review.
- [x] Add CLI-created migration: expand assessment status, preparation/intended fields, private draft update/publish commands; explicit current access, idempotency/audit/outbox retained; draft read/submit policies tested.
- [x] Add API command routes and projection fields; preserve legacy published creation and native rubric shape.
- [x] Build customer draft creation/editor: existing authorized objective/rubric choices, edit/save, quiz setup, reviewed publish; no raw source ID entry. English/Arabic loading/empty/error/denied states and shared form recovery.
- [x] Render historical quiz attempt independently of availability; expose unavailable new-attempt state without hiding feedback.
- [x] Add bounded real Auth/API/SQL/UI journeys covering preparation→hidden draft→configuration→publish→submit, stale versions/foreign sources, consumed source denial, exact old quiz checks after close and no new attempt.
- [ ] Run focused pure cases, TypeScript/lint, architecture/docs/repository guards. Root applies migration and schedules API/SQL/browser/build windows; report pending versus executed evidence explicitly.

**Acceptance:** Teacher can choose TEXT/QUIZ and numeric/rubric without a learner race; draft metadata is editable before publication, objective/configuration required before deliberate publish; protected draft queries and submissions deny. Learner quiz history remains pinned to original questions/checks after closure; correct keys remain staff-only. Published consumed academic/source data is preserved, stale/current entitlement/enrollment/programme/session denials and original-key audit/outbox behavior remain.

**Observed verification:** Contract input had two expected red failures before implementation. The private quiz denial translation had one expected service red failure then passed. Scoped API pure12/web11, TypeScript, lint and architecture/docs/repository guards passed. Root applied preparation and metadata migrations, reported SQL12 passing and earlier API3 passing; an enhanced API draft-quiz read assertion then reproduced403→503 mapping and the service repair is staged for rerun. The new production browser preparation/closed-quiz journey and adapted common full UI loop passed in the root's mixed five-case run. Final enhanced API and source-frozen full verification remain root-owned.

**Migration history:** Applied210856 was restored to its recorded11045-byte source with all22 recorded statements matched in order. The later direct draft metadata and null-input checks live only in additive211414. No applied statements are rewritten to obtain a clean replay.
