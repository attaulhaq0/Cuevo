# Parent approved learning support implementation plan

> **For agentic workers:** Use the existing school feature and current source APIs; root coordinates runtime verification.

**Goal:** Make school-published support instructions usable by the current selected child's parent without widening directory or course access.

**Architecture:** School owns the parent read surface. Current `/v1/school/learners/:id/profile` supplies bounded authorized course labels; `/v1/school/learning-support` retrieves exact child/course support with current publication/window/relationship checks. Private approval reasons are rejected at the parent display contract.

**Sources:** 01/14/18/36/39/61/63/83 and root AGENTS customer labels/current authorization; existing support migration34415 and API golden cases.

**Tasks:**

- Add pure parent scope/parser regressions, including missing/duplicate courses, wrong child/course, private notes and unpublished state.
- Add the selected-child parent school tab with current named course selection, explicit date/task labels and current empty/error/retry states. Keep staff controls and server grants unchanged.
- Add a browser journey with labeled API course/task setup, current parent-selected child, visible school publication, parent source read, revocation/relationship-loss clearing and English/Arabic/mobile/axe.
- Update school README. Run allowed focused pure tests; root owns lint/typecheck/build/API/DB/browser/aggregate and documentation checks.

No official curriculum, live provider, diagnosis, legal retention or real-pupil acceptance is added. Source errors and unknown contexts must clear protected content.
