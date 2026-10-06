# Initial school admission implementation

Status: founder-authorized local synthetic implementation, following the existing account admission decision. This plan supplies no completed first-school or production acceptance claim.

Sources01/07/14/38/39/61/64/81/82/83 and the independent customer mission require a school to begin without seed-only memberships. Keep initial tenant/entitlement approval operator-only. Existing school invitation/verified claim remains the staff/student/guardian path after the first administrator exists.

## Chosen boundary

Add a narrow local operator admission command with private immutable approved school/admin source and idempotent receipt. Require the existing explicit local operator control, exact verified current operator Auth session, and an already provider-confirmed exact first-administrator UUID/email/session. The operator runner validates the current loopback Cuevo target and stopped runtimes before supplying owner SQL; no ordinary API or worker obtains this function or owner credential.

The approved source includes one exact school UUID/name/country/languages, first-admin UUID/email/registered name, approved capability codes and review reason. The command creates school, active administrator/person and explicit entitlements in one transaction after verifying recipient control. It preserves pre-school approval provenance privately, then appends canonical school audit/outbox/receipt only after the real member exists. It never invents pending membership, official curriculum, programme, guardian relationships or country rules. Existing source-owned school updates remain ordinary administrator commands afterward.

The command cannot provision an unverified Auth identity or send a link. Provider identity setup/control is verified independently by the existing approved local adapter and supported public OTP before admission. Unknown provider effects stay separate; possessing an owner credential or an email does not make an account a school administrator. Initial real-school/operator/legal/residency acceptance remains external scope.

## Work and evidence

1. Read existing school/member/entitlement/audit/outbox and operator/session guards; write strict browser-free approved source contract and fixtures.
2. Add private immutable admission source/receipt SQL with owner-only execute, default-disabled local control and exact verified actor/session/provider identity checks. Serialize initial source/key/school UUID and forbid attaching an existing tenant or conflicting first administrator.
3. Add a guarded operator CLI that verifies supported Auth identity before the SQL command, keeps tokens in memory and returns only human school/admin/capability context. Use original key after uncertain response; no repeated provisioning.
4. Verify SQL grants/RLS, forged/expired session, wrong recipient/email/school, unconfirmed/anonymous/blocked identity, disabled control, duplicate/conflicting source, rollback and replay after revoked admin/operator control.
5. Verify real provider-created/confirmed new admin→operator school admission→normal API current membership and ordinary school commands. Then add new teacher/student/guardian and learning/outcome/parent browser acceptance through existing invitation/relationship commands.
6. Run architecture/docs/repository/type/lint/build and applicable API/SQL/browser/RTL/mobile/axe checks. Restore the guarded reference environment and keep initial-school/full customer status honest.

This is a restricted onboarding operation in the modular monolith. It introduces no public signup, generic tenant API, paid entitlement automation, microservice, second identity model or external email service.
