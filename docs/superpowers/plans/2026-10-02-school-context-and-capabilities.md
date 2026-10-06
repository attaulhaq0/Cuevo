# Current school context and capability alignment plan

**Goal:** Parent/student daily records retain exact authorized human context, attendance uses the selected class roster, and navigation reflects destination prerequisites.

**Architecture:** Extend the existing school service with a private named-page wrapper around its current authorized list, without broader directory grants. Reuse the shared child selector and page hooks. Define browser-safe capability prerequisites shared by shell and role home; server checks remain authoritative.

**Sources:**14/18/37/63/81/83 and AC-S01/AC-S02/EU03/EU10/EU13 in the expanded lifecycle review.

- [ ] Add failing real Auth/API cases for parent selected-child attendance/timetable labels, wrong child/current enrollment denial, and staff selected-class roster excluding the other class.
- [ ] Add pure tests for navigation entitlement combinations and named school-row context.
- [ ] New append-only private named-school-page SQL wraps existing school_list, enriches only its already-authorized source rows with learner/class/subject/teacher/date context and narrows schedule by exact selected learner enrollment. Parent raw directory/notes remain unavailable.
- [ ] Add a staff-only attendance-roster resource requiring exact current class and current eligible enrolled learners, with bounded cursor/labels and role/tenant denial.
- [ ] School service calls the wrapper; current API read-only contracts and owner README record names/filters. Root owns applying migration and SQL/RLS/grants/API verification.
- [ ] School UI requests exact selected child, shows source names directly, full schedule meaning/effective windows and accessible current/history/class filters. Staff attendance offers only current selected roster, with source-specific pagination.
- [ ] Align shell/home prerequisites with documented destination capabilities through browser-safe shared policy; do not replace backend checks or hide denied runtime failures.
- [ ] Test through actual teacher/parent/student screens, Arabic/mobile/axe and revoked/partial/error states. Run typecheck/lint/structural/docs plus owner tests.
