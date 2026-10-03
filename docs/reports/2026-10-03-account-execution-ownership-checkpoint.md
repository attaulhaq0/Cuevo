# Account execution ownership checkpoint

Date: 3 October 2026. Branch: `codex/customer-readiness-hardening`, based on `4526547`. Customer-readiness remains incomplete. This checkpoint repairs an execution boundary needed for genuine onboarding; it does not establish first-school admission, email delivery or customer acceptance.

## Reproduced defect and repair

The existing general worker claimed pending/expired Auth events, exhausted their leases, completed or retried valid Auth leases, and acknowledged an Auth event through the ordinary domain processor. The strengthened rollback regression failed 24 of 45 assertions before the migration. Completion, failure and processing used separate active leases, so one mutation could not invalidate another denial check.

CLI-created append-only `20261003052325_outbox_execution_ownership.sql` adds one fixed private event-owner classifier. Exact School account provisioning/recovery types belong to the API Auth executor. Metadata cannot select ownership; nonreserved legacy events retain worker validation/review. Generic claim/exhaustion/complete/fail/process/due/health honor that boundary. The prior composed processor is ungranted behind the guard. Worker metrics explicitly describe their own scope; strict reference drains refuse unfinished other-owner work. PostHog destination due-work remains independently eligible.

Raw migration SHA256: `40df8d54b590352619e7800131127a186cde3fee93e7a42ee737d1fbe761a34b`. The new migration used LF before local application. Historical applied bytes remain unchanged. Local dry-run selected only this migration, then the verified local Cuevo database applied it without seeds, roles, Vault changes or hosted activation.

## Current prerequisites

Strict confirmed administrator invitation/list/revoke contracts and a purpose-only account claim controller/service exist but are not composed into the application. Claim rejects caller-selected school, checks a current verified account session, sends only the independent secret digest to private SQL and validates exact receipt identity. Dedicated local provisioning configuration is disabled by default, rejects hosted/production targets and supplies its secret only to the explicit API recipient. Storage credentials never supply a fallback. These files are prerequisites; their private invitation/effect/claim SQL and sender remain missing.

The [admission decision](../decisions/2026-10-03-school-account-admission-and-effects.md) fixes API-owned bounded execution on the same existing outbox, durable one-attempt steps, exact provider UUID reconciliation, separate delivery/claim receipts and operator-first-school authority. No real email, live model, public signup or hosted permission change occurred.

## Verification observed

- SQL196 passed 45/45 after the repair. Existing dispatch/budget/learner-state checks plus the new suite passed 119 assertions across 4 files.
- Full `npm run db:test` passed 1,356 assertions across 105 files in 36 seconds.
- The actual restricted-login dispatch suite passed 3/3 in 5.33 seconds. The new case proved exact Auth leases remain unchanged through generic claim/complete/fail/process, classifier/prior-processor/raw-table denial, worker health/due isolation and exact fixture cleanup. This uses a real `cuevo_worker` login rather than only SET ROLE.
- `npm test` passed 1,033 unit cases/135 files, 172 web cases/45 files and 4 local-runtime cases. The later actual-login integration addition is separately verified above.
- `npm run build` passed API, Next.js16.3.8 and worker builds. `npm run build:edge` generated the existing worker-owned artifact without runtime secrets.
- Typecheck, lint and architecture/docs/repository guards plus their fixture suites passed for the ownership/config checkpoint. Subsequent separately owned UI edits require their own fresh checks.
- Reference-drain regression passed 11 cases; worker telemetry/window regressions passed 6 cases. Initial added telemetry 2 cases and other-owner drain 1 case failed before their fixes.

After SQL and actual-login fixture cleanup, local data retained 133 people, no unfinished outbox rows and disabled worker transport. The application ports remained stopped. No new actual-user browser proof is claimed for this backend checkpoint.

## Remaining work

Implement private approved invitation/claim/effect SQL, dedicated bounded executor/local SMTP, operator initial-school admission, deliberate bilingual admission/recovery UI and real new-user learning/outcome/parent acceptance. Seeded accounts cannot substitute. Customer selector/context repairs, character progression, final unchanged-source37-row customer verification, canonical security disposition and external hosted/academic/legal/provider gates remain open.
