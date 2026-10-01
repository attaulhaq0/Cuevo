# Learner state browser increment

Date: 1 October 2026. Cuevo by E Deviser.

## Scope

Progress is a session-bound read surface over the existing authorized Nest APIs. A student opens their own learner UUID directly. Teacher/coordinator/admin choose a student from the permitted `/v1/people?limit=100` list; the selector explicitly states its first-100 bound. Parent selects only permitted current child people and receives the server-approved academic projection. Parent UI never queries raw observations or signals, and hides development/engagement/support/impact details.

The view separates academic native result rows, practice/revision/reflection observations, engagement completion, support and impact. It does not combine them into a score. Academic rows show score/max, policy/reference version, source timestamp and expandable evidence provenance. Normalization must remain null. Development counts show the exact supplied count and observation window/source IDs; null appears as “Not yet measured,” never zero. Revision remains unknown until real revision events exist. Completion is explicitly participation evidence, not attainment. Support and follow-up impact remain unmeasured for this increment.

Observation history and factual practice-observed signals use bounded cursor pages with the shared Load more state. Signals show exact count, window, rule version, event sources and “Observation only”; they do not infer traits, academic difficulty or intelligence. All school content stays in memory. English/Arabic copy and logical CSS use shared tokens; mobile navigation scrolls horizontally when the available actions exceed the compact bar width.

The final worker/API contract uses numeric positive signal rule versions. The browser validator now accepts that actual SQL shape rather than a string; a regression first failed, then passed. Optional freshness is limited to CURRENT, STALE and APPROVED_PROJECTION. Stale snapshots retain traceable academic evidence while recent activity counts remain null, and the UI displays the snapshot date with an awaiting-refresh notice. RECORDED_ONLY completeness explicitly states that persisted observation counts do not establish that all learning activity was recorded. Approved parent projections may carry no snapshot generation/version and remain academic-only.

## Auth client correction

Parent browser testing identified duplicate GoTrue clients from the StrictMode double invocation of the React state initializer. The auth factory now returns a single browser client for identical public configuration and returns null on the server, so it cannot share sessions across server requests. A changed public configuration stops the previous auto-refresh loop. `persistSession:false` remains in effect and no protected browser storage is introduced. Two tests failed against the old factory, then passed: identical browser configuration reuses its client, and server rendering creates none. Actual browser console verification remains parent-owned.

## Verification

Learner-state tests failed against placeholder validators and then passed. They cover unknown/missing counts, invalid native scale/evidence, unsupported trait-like observations/signals and valid source-backed zero with normalization null. Existing auth, API, academic, pagination and idempotency cases remain.

- `node --test apps/web/test/*.test.ts`: 34 passed, 0 failed.
- Web TypeScript and targeted ESLint: exit 0.
- Next.js 16.3.8 production build: exit 0.

No browser tools, live backend requests, installs, root edits or commits were performed by this worker. Worker processing, private lease functions, API role/object authorization and real outbox-to-state updates are being verified by the parent/backend worker and are not inferred from rendering this view.

The parent's real Progress Playwright run reached native academic rows, factual practice signals, Arabic RTL and mobile without overflow, then reported an Axe `definition-list` violation: source disclosure was a sibling of `dt/dd` inside a definition-list grouping. The disclosure now sits inside its associated `dd`. This worker ran TypeScript and ESLint after the focused semantic fix; the parent owns the same live Axe rerun and console-warning verification.

## Remaining acceptance

Parent should verify clean unknown learner → real completion/release → worker state refresh → own student native evidence and factual observations. Check teacher current assignment scope, coordinator/admin permitted learner selector, parent approved academic-only projection, cross-school denial and revoked relationships. Repeat Arabic/mobile/keyboard/reduced motion and confirm browser console no longer reports duplicate GoTrue instances. Source IDs remain opaque because the frozen contracts provide no source display-name projection.
