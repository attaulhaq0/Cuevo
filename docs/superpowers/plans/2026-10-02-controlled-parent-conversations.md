# School-approved parent and teacher conversations

**Goal:** A current parent can communicate with an assigned teacher about the exact linked child through a school-approved, auditable in-app thread, with clear delivery/read states and no unrestricted minor chat.

**Architecture:** Add a purpose-specific conversation owner inside the existing community module; immutable messages/read receipts and current participant/source authorization use the existing database/API/outbox. Administrator explicitly enables parent-teacher communication with a reason/version. No parent membership in pupil rooms, public messaging, AI auto-send or external email/push dependency.

**Sources:**19 channels/delivery states;14 current guardian/teacher/class context;15/80 school community safety;37 parent/teacher messages;39/81 audit/private grants;83 safe enabled messaging.

- [ ] Strict contracts and failing API/SQL: disabled policy, unrelated child/staff/class/tenant deny; admin enables one school; current teacher↔guardian text read/reply/read-receipt.
- [ ] Versioned communication policy and exact child/class/teacher/parent thread; every send/read/replay rechecks active relationship, teacher assignment/enrollment and policy. Immutable source/message/read ledger, bounded text/rate limits and original-key audit/outbox.
- [ ] Delivery means committed in-app message availability; external delivery remains unconfigured. Recipient read is explicit. Unknown command outcome keeps original key; staff moderation hides content and retains audit.
- [ ] UI school policy control, named exact child/current teacher selection, compose/thread/reply/read/empty/denied/error/unknown states and current scope draft recovery; parent never gets raw roster.
- [ ] End-to-end parent→teacher→parent through screens, same-school current revocation/source deny, RTL/mobile/keyboard/axe, SQL/RLS/grants and idempotency.
