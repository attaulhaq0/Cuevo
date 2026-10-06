# School audit and routine maintenance

**Goal:** Administrators can inspect sanitized audit records and correct/cancel calendar, timetable and report-period records without deleting history or hiding source changes.

**Architecture:** Extend the school owner with a private admin audit projection and append-only maintenance revisions keyed to existing records. Existing source tables remain historical; current read/overlap checks use current maintained projection. Mutation uses current version, explicit reason/confirmation, audit/outbox/idempotency and no invented promotion/rollover semantics.

**Sources:**14/18/37/39/81 and EU08/EU11/customer audit gaps in expanded review.

- [ ] Add source-backed failing API/SQL cases: teacher/parent audit denied, own-school admin sees only sanitized actor/action/object/time/outcome; foreign scope denied.
- [ ] Add private bounded audit list without raw child answers, metadata, credentials, session IDs or source payloads; human actor and known object labels with technical detail only in disclosure.
- [ ] Add calendar/timetable/report-period maintenance commands using expected revision, explicit reason and confirmation. Preserve original rows and append new versions/cancellation, validate current class/teacher/term scope/windows/overlaps.
- [ ] Read current maintained record and reject stale command/replay after current authorization loss. Parent only approved current noncancelled events; old audit/source history retained privately.
- [ ] Add owner UI edit/cancel/audit operations with current values, localized labels and source-specific pagination; browser→API→current parent readback and history verify.
- [ ] Run role/tenant/relationship/current-source deny, SQL grants/history/idempotency, API/browser, mobile/RTL/keyboard/axe and structure/docs checks. Automated year promotion remains undefined and out of this change.
