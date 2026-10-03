# School Account Onboarding and Recovery Implementation Plan

> **For agentic workers:** Execute only after the root-owned current AI/performance/QA checkpoint and coherent source review permit a new unit. Use superpowers:subagent-driven-development or executing-plans task by task with independent security/contract review. This plan does not create application code, migrations or accounts.

**Goal:** Let an approved school administrator add staff, students and guardians, manage verified school-scoped admission and supported account recovery through the product, while initial tenant/admin/entitlement admission stays an authenticated operator approval.

**Architecture:** Extend existing School ownership for invitation/admission requests and current membership/relationship management; add a narrow platform Auth-provisioning adapter with its own server-only credential recipient. Private approved request/audit/outbox state coordinates provider effects and exact receipts. The worker remains least-privilege: it does not receive Auth admin or database-owner credentials. Initial operator approval binds a verified school/admin source before any ordinary school capability is granted.

**Tech Stack:** Existing NestJS/Fastify, Next.js, Supabase Auth/PostgreSQL/private SQL, Zod, transactional outbox and local SMTP test capture. No new framework/service, public signup, identity model, model call or payment integration.

**Spec:** Founder mission sections2/19/27/29/30; sources [01](../../product/overview/01-MVP-SCOPE-AND-GATES.md), [07](../../product/domains/07-SCHOOL-CONFIGURATION-AND-MODULARITY.md), [14](../../product/domains/14-SIS-MIS-FUNCTIONAL-SPEC.md), [39](../../product/platform/39-SECURITY-PRIVACY-AND-AI-GOVERNANCE.md), [64](../../product/verification/64-MVP-DEMO-SCRIPT.md), [81](../../product/platform/81-SUPABASE-RLS-GRANTS-DATA-API-ARCHITECTURE.md), [82](../../product/platform/82-DEPLOYMENT-ENVIRONMENTS-AND-SECRETS.md), [83](../../product/overview/83-MVP-EXIT-CRITERIA.md). [Independent completion audit](../../reports/2026-10-03-independent-completion-audit.md) records the reproduced/source-confirmed gap.

**Status:** `AccountIdentityService` verifies current provider-confirmed account/email/session without granting membership. The fixed-target provisioning adapter is implemented and a disposable real local Auth UUID create→reconcile→invite sequence passes with owned cleanup. Actual provider omission of confirmation time remains unknown; exact local admission/recovery redirects are now allowlisted. The adapter's receipt is not mail delivery, email control or admission. No application invitation route, durable Auth effect executor, claim, recovery, operator admission or browser journey is implemented. Existing `SchoolService` configures already-provisioned users; local synthetic bootstrap is not onboarding. [Scoped evidence](../../reports/2026-10-03-human-evidence-and-auth-provisioning.md).

**Execution checkpoint:** Strict contracts/uncomposed account controller/service and dedicated API-only local configuration are now implemented. The [execution decision](../../decisions/2026-10-03-school-account-admission-and-effects.md) selects bounded API-owned external effects on the same existing outbox. Additive20261003052325 repairs worker ownership, including generic lease mutation, processing, health and wake recovery; SQL45/full1,356 and actual restricted-login3cases pass. [Current checkpoint](../../reports/2026-10-03-account-execution-ownership-checkpoint.md). Private invitation/effect/claim SQL, sender, operator admission, composition and browser proof remain unfinished.

## Fixed safety decisions

- PUBLIC signup stays disabled. No caller-provided role, email, school ID, token or user metadata independently creates membership, entitlement or guardian access.
- Initial school/admin/entitlement admission is an explicit authenticated operator action with fixed purpose, reviewed school source and an approved exact initial actor. It cannot use the seed reset or attach a foreign user through ordinary administrator commands.
- Ordinary current administrators create school-owned pending invitations/admission requests for approved names/email/role and optional exact enrollment/teacher assignment/guardian tuples. Teachers/parents/students/coordinators cannot provision roles or privileges.
- Pending admission stays in private workflow records. The existing membership enum remains active/suspended/revoked; create an active membership only after current verified Auth identity control and exact approved admission. Accepting an email alone cannot create guardian access, administrator role or another school's membership.
- Use existing `app.schools`, memberships, people, enrollment, assignment and parent relationships. Private admission sources are workflow records, not a second identity system.
- School policy, entitlements and operator approvals remain separate axes. Administrator provisioning request cannot issue paid/module entitlements or bypass current access. Last-admin/self protection and expected revision/current effective windows remain authoritative.
- Introduce a dedicated `CUEVO_AUTH_PROVISIONING_KEY` server recipient, consumed only by a reviewed platform adapter in the API/operator runner. Never borrow the Storage service-key field silently, send it to web/worker, or infer school approval from possession of the key.
- Supabase admin credentials are broad provider capabilities. Bound them in the adapter by exact approved Auth target/project, allowed operations and trusted private request. Record that provider key scope is not tenant isolation; no direct browser/provider API.
- Real invitation/recovery messages require the administrator's intentional confirmed action, approved delivery policy and verified recipient. This plan permits only local synthetic SMTP capture in acceptance tests. It does not send email/messages to actual people or enable ordinary CI remote mail.
- Store only a digest of the application admission token in private state, with single use, exact purpose and bounded expiry. Supabase `generateLink().hashed_token` is itself a redemption credential; never treat that field as a safe digest or persist it in audit/log/telemetry. Auth verification uses the provider's supported current identity result, never blindly decoded claims or user-editable metadata.
- Every important mutation is current-scope idempotent/audited with durable outbox and distinct provider delivery/provisioning receipt. Uncertain external effect retains original key and requires reconciliation; never create duplicate Auth users after timeout.
- No hardcoded school/customer/role grant branch, default official programme/curriculum, real-pupil approval or fabricated guardian consent. Unknown/missing school information stays requires review.
- English/Arabic human names/current class-year context, mobile/keyboard/reduced motion, safe empty/denied/error/retry states and deliberate confirmations remain required. Same-name real context must be school-reviewed, never opaque ID suffixes.

## Owning files

| Create/modify when admitted | Responsibility |
|---|---|
| `apps/api/src/modules/school/account.controller.ts`, `account.service.ts`, owner README | Current admin invitation/admission/revoke/recovery management and verified user's own claim |
| `apps/api/src/platform/identity/provisioning.ts`, platform README | Fixed-provider Auth admin adapter with injected narrow operation port; no domain import |
| `packages/contracts/src/school-accounts.ts`, main export/README | Strict browser-safe requests/status/claim/recovery shapes |
| `packages/config/src/index.ts`, `scripts/runtime/environment.ts`, config/platform tests | Explicit API-only provisioning enabled/target/key recipient, disabled by default |
| `scripts/school-admission.ts`, owner instructions/doc | Authenticated operator target-bound initial school/admin admission; no reset/seed command |
| CLI-allocated append-only school-account admission migration | Private state/functions/approval/command/provider receipts and explicit grants/FORCE RLS |
| `apps/web/features/school/components/accounts.tsx`, model/copy/styles/test | Human administrator forms and pending/current/delivery/claim readback |
| Existing auth feature/shared verified session and claim route | Own acceptance/recovery continuation; no raw admin key or client role grant |
| API unit/integration, SQL next-free test, browser school-account-onboarding | Provider mocks for offline contracts; actual local Auth/private SQL/SMTP controlled journey |
| ADR, codebase/context/README/scoped AGENTS/status | Document new external-effect boundary and actual implementation/verification |

Do not create empty future modules or migration names in this documentation increment. Allocate actual migration/test numbers at execution.

## Proposed protected contracts/routes

All management POSTs require verified session, X-School-Id, Idempotency-Key, no-store response and explicit confirmation. Token claims use a verified own current Auth session through a purpose-only resolver that can operate before school membership; it must not call the ordinary membership resolver and then invent an actor on failure.

| Contract | Route | Authority |
|---|---|---|
| `schoolAccountInviteSchema` | POST `/v1/school/accounts/invitations` | Current admin school.operations + confirmed exact recipient/role/name, reason; pending request only |
| `schoolAccountInvitationQuerySchema`, `schoolAccountInvitationPageSchema` | GET `/v1/school/accounts/invitations` | Admin bounded own-school human pending/accepted/revoked/delivery state |
| `schoolAccountInvitationRevokeSchema` | POST `/v1/school/accounts/invitations/:id/revoke` | Admin current request revision; no deletion of immutable Auth/source history |
| `schoolAccountClaimSchema`, `schoolAccountClaimReceiptSchema` | POST `/v1/account/school-admission/claim` | Verified user, single-use purpose token, exact provider identity and approved recipient/request |
| `schoolAccountRecoveryRequestSchema` | POST `/v1/school/accounts/:id/recovery` | Current admin exact approved same-school identity/recipient + reason/confirmation |
| `ownAccountRecoverySchema` | POST `/v1/account/recovery` | Generic non-enumerating response; verified provider-supported recipient process, purpose/rate limits; no membership grant |
| `schoolAdmissionStatusSchema` | GET `/v1/account/school-admission` | Verified user's own approved school invitations only, bounded human school labels; no searchable email/global directory |
| Existing person/enrollment/assignment/guardian configure routes | unchanged | After acceptance, existing current role/relationship/revision source authority configures records |

Invitation payload accepts bounded displayName/email/role, `expectedRevision:0`, reason, confirmation and optional exact approved `studentId`/class/subject/window relationships. No plaintext password, access token, service key, entitlement array, arbitrary Auth metadata or desired Auth UUID. Guardian invitation stores pending guardian relationship intent; activation requires explicit reviewed exact child approval and current claim, never email-domain matching. A student school account and guardian account are distinct sources.

Response exposes request ID, human recipient/name/role, revision/state, created/expires dates, delivery status ACCEPTED/RETRY_REQUIRED/OUTCOME_UNKNOWN and claim status. Do not expose invitation token, provider key, raw exception, other-school accounts, guardian private notes or synthetic password. Generic self recovery must not leak whether an email is registered.

Proposed maximum25 invitation rows per page and exact100 operation admission bound are technical safety envelopes, not per-school roster limits. Paging and source status remain explicit; no unbounded provider user search or cross-school user enumeration.

## Transaction and provider-effect design

Private records: `school_admission_approvals`, `school_account_requests`, immutable `school_account_request_revisions`, private `school_account_token_digests`, `school_account_effect_receipts`. Current request pointer may change only through its owner function. FORCE RLS, no raw table/sequence Data API/application grants, immutable history/no-truncate. Existing membership/enrollment revision triggers continue to apply.

Initial operator action requires an explicit verified operator session/approval source external to ordinary school admin; use a reviewed operator-only runner identity/target secret. It creates school+exact first admin+approved entitlement rows+audit in one target-bound transaction after provider identity provisioning is reconciled. A provider identity is not yet school authority. If any domain commit fails, preserve orphan Auth identity as private requires-review effect; do not delete an existing provider user. Ordinary API must never acquire database-owner authority or generic tenant-create RPC.

School admin command writes pending request+approved exact intent+audit+version1 outbox transaction. A bounded same-request effect runner uses the existing external-effect model: validates source/current admin approval/expiry/recipient, calls supported Auth operation, records distinct provider receipt. If worker cannot execute because the API-only adapter is unavailable, durable request remains pending/requires review. Do not grant Auth key to the current general worker or place an unbounded model/mail call in its20-second domain loop. Decide one reviewed API-owned bounded execution adapter or explicit operator drain in the ADR; preserve outbox as sole durable task ledger, with recovery and no request-per-school roster scan.

Supabase has no `getUserByEmail` or Auth mutation idempotency endpoint in the reviewed SDK. Never assume a non-enumerating exact-email lookup exists. A server-assigned UUID plus supported `createUser`/`getUserById` can reconcile a new account only through its approved private request; prove existing-email invite behavior locally before selecting that path. `generateLink(invite)` can create a user, so timeout leaves the external effect unknown and must not automatically retry. Existing identity may be linked only after it proves current control and the operator/school approved exact request. A global email match never attaches a foreign school record. Generate a provider invitation/recovery link only for the approved recipient/redirect; no raw redemption token enters logs. Send only through currently approved local or production delivery policy; provider acceptance is separate from delivered mail and admission claim.

Claim transaction repeats request school/role/recipient/current approval/expiry/revocation, verifies provider user identity/email ownership, serializes request+current member, consumes token once, inserts/updates approved membership/person and exact authorized relationships with revisions/audit/outbox. Original-key claim replay verifies current identity/request before returning its receipt; a revoked request cannot resurrect access. Claim cannot select arbitrary role/school/student. Existing current teacher/enrollment/guardian functions remain authority, and duplicate tuple/current revision conflicts require review.

Pre-membership/operator workflow receipts need their own private purpose-scoped approval provenance. Existing ordinary audit/outbox/idempotency helpers require a current school member; they cannot be invoked using an invented actor before admission. After membership insertion, record canonical school audit/outbox atomically. The API-owned Auth executor must have explicit event ownership so the ordinary deterministic worker cannot acknowledge an undelivered invitation as complete. Recovery session revocation uses supported recipient-session operations, never a UUID substituted for a JWT.

Recovery does not change roles, grade, evidence, guardian relationship or enrollment. A successful password reset invalidates/reconciles sessions according to supported provider operations; existing API current-session verification must deny a revoked old session. Demonstrate expired token, reused token, changed custody/access and loss of admin authority before send/claim.

## Required acceptance tasks

1. Write strict contract and fake-provider tests first: teacher/student/parent/admin wrong school, forged role/entitlement/token, unknown/invalid/oversized email/name, duplicate request key/body, wrong target/redirect, recipient enumeration and server-key recipient denial.
2. Record ADR for operator admission and bounded external Auth/delivery executor; do not implement generic public school creation. Verify dedicated credentials stay API/operator-only and ordinary CI capture/mail disabled.
3. Add append-only private admission request/receipt functions with current admin/object/expected-revision/key checks before replay. Test FORCE RLS/grants and raw API/worker/Data API denial independently.
4. Implement provider adapter and uncertain outcome reconciliation using stable request IDs. Test timeout after created user, retry, duplicate email, existing foreign identity, actor revocation after request, wrong school and orphan receipt without deleting customer identities.
5. Implement verified claim with single-use digest/current provider session, exact approved member/relationship scope and atomic audit/outbox. Test original-key retry, concurrent claims, recipient mismatch, expired/revoked token, last admin/self protection and guardian wrong child.
6. Implement localized human admin invitation/recovery list/forms plus own claim/current school selection; memory-only sessions and access-clearing behavior remain. UI successful send, pending delivery and accepted school membership are separate confirmations.
7. Exercise clean local synthetic school through the authenticated operator admission then admin-created staff/student/guardian, local SMTP capture/verified claim, actual year/class/programme/course/task/evidence/fixture/human support/outcome and exact parent publication. No precreated school roster substitutes for this journey.
8. Exercise forgotten password/expired link/current session revocation/reinvite after cancellation and duplicate names/emails. Real external email and real pupil operation remain separately approved target gates.
9. Run no-secret browser/build tests, all relevant unit/API/SQL/RLS/deny/replay/concurrency/recovery/browser/RTL/mobile/accessibility checks; exact local SMTP delivery readback and cleanup required. Never upload actual pupil content/tokens into evidence.
10. Update audit/findings/current acceptance/matrix/blockers/owner navigation from actual source+receipts and rerun final frozen gates after feature integration. No complete first-school claim based on this plan or fake-provider units.

## Execution dependencies and limits

The current intelligence/performance fixes and QA source checkpoint take priority. This plan supplies a concrete safe next unit, not permission to interrupt an active frozen or shared runtime window. Actual provider auth-admin API capabilities, email verification, recovery/session invalidation and target delivery configuration must be retrieved from current official platform docs at execution; repository curriculum facts remain source-locked. If a provider operation cannot meet exact reconciliation/scope requirements, keep the request REQUIRES_REVIEW and implement the safe supported variant, rather than assume an API or bypass control.

No initial country/year/programme/default progression/guardian legal rule is invented. Real school admission/rights/parent verification/retention/SMTP delivery require reviewed school data and operator approval. Self-service public tenant signup, full admissions CRM, bulk import/migration, SSO/SCIM, SMS/push and multi-institution billing are outside this bounded repair.
