# School and learning browser increment

Date: 1 October 2026. Product Cuevo, company E Deviser.

## Scope

The existing session-bound workspace now has a Learning view for schools with the `learning` entitlement. It uses current in-memory Supabase access token and verified school ID for every Nest REST request. No direct browser database access, alternative backend, localStorage/sessionStorage content cache, official curriculum claim or optimistic academic result was added.

Teacher/admin can create a DRAFT course with authorized class/subject choices, add units, school-authored lessons and reading/practice/assignment/quiz/reflection activities, then explicitly publish the course. The course detail shows real units/lessons/activities from the service. Students can read published content and record their own activity completion. Assessment creation is a teacher-defined numeric School Custom action; it retains an arbitrary positive maximum and explicit synthetic-content notice. Students submit text responses. The queue presents real submitted work, without assigning grades, feedback or attainment. Marking/release/evidence belongs to the next increment.

All roles may use course/assessment reads only where the API authorizes their current relationships. Parent and coordinator do not receive a submissions queue; server authority remains decisive. Authoring controls mirror teacher/admin roles; ownership/class/subject checks occur in the API.

Components are separated into `components/learning`: course/lesson editor, assessment/submission views, command forms, feedback and request/query hooks. Typed English/Arabic learning copy is separate from foundation dictionaries. Logical CSS and semantic tokens preserve desktop/mobile/RTL behavior.

## Command safety

POST commands generate an Idempotency-Key before sending, and retain their original key/path/body in a session-level in-memory journal until a confirmed response or definitive refusal. Network/5xx/429 or malformed successful mutation response is uncertain. An uncertain form locks edits and offers a same-action retry; a different payload cannot reuse the slot. Leaving a view and returning reconstructs its outstanding request from that journal. There is no offline sending queue and no success until a JSON response with a record ID is received.

The prior foundation background membership refresh unmounted all child views every minute or focus, potentially losing an uncertain retry key. Same-user background verification now preserves the already verified workspace while checking; failure clears protected content. Sign-out/user change clears the journal. Offline clears displayed protected content but retains already attempted in-memory commands for safe reconciliation after reconnect. Each domain request independently verifies membership on the API.

## Verified behavior

- Three command boundary tests failed against the empty wrapper/journal, then passed. They use a real local HTTP server to check token/school/key/body forwarding, key reuse and payload conflict, and sanitized uncertain-outage versus definitive-denial errors.
- Learning contract regression tests cover malformed shapes, missing maximum score, incomplete lesson activities, page-limit enforcement and invalid date/numeric values. Invalid dates initially passed validation; the regression then passed after rejection was added.
- Existing membership/auth tests remain in the suite.
- The course detail API's explicit `413 / LEARNING_DETAIL_TOO_LARGE` capacity refusal now has a distinct safe error kind and English/Arabic action message asking the course teacher to divide material. A real HTTP regression failed against the old generic invalid mapping, then passed. Server internals remain hidden and the refusal is definitive.
- Pagination has five tests covering malformed/missing cursor, overlap without duplicate rows, actor/school/refresh reset and stale response rejection, cursor cycles, and a real HTTP next page with the existing limit and verified token/school. The empty pagination implementation failed the first four; the cycle guard failed before its fix.
- `node --test apps/web/test/*.test.ts`: 26 tests, 0 failures across auth, learning, academic and pagination cases.
- Web TypeScript and targeted ESLint pass.
- Next.js 16.3.8 production build passes.

No shared browser tools, installs, root files or Git commits were used by this worker. The parent reports actual teacher lesson authoring/publishing and student completion/submission passing at desktop and Arabic mobile, with automated accessibility checks passing. This worker has not independently inspected those browser artifacts. Authorization denial, duplicate-command recovery and gate claims belong to the parent's combined evidence record.

## Limits

Courses, assessments and submissions offer English/Arabic Load more controls. Each request is capped at 100 records and uses the server's validated UUID cursor. Loaded records are deduplicated by ID and retained on a later-page error; a null cursor alone marks all available records loaded. Actor/school/path/refresh resets clear the list and reject stale in-flight pages. Page append does not reset selected submissions or uncertain command journals. No protected browser cache is persisted. Classes and subjects authoring choices remain bounded to the initial 100 records. Course detail rejects a tree above the backend's 100-record / 500 KB response capacity rather than showing a partial tree. Activity confirmation is session UI state after a confirmed command; the API has no activity-completion query yet. Multiple school selection and persistent SSR login remain foundation limitations. All materials are explicit synthetic school-authored content; official source-locked curriculum readiness remains unchanged.
