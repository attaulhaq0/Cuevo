# Intervention help and learner approval context

Authority: source pack FINAL-2026-10-01 IDs12/19/38/39/80/83 and scoped functional completion. Implement within improvement only; no model call or automatic message delivery.

An owning learner can ask for help on an assigned current intervention. Store one immutable help request and one explicitly confirmed teacher/admin reply for the exact task, under current school/role/learner/course authority. Current staff can read the request; parents, coordinators and unrelated peers cannot. Changes to academic source block new help/replies; historical task support retains current relationship checks. The UI labels open/answered and makes no delivery or read guarantee. Messages are academic task support, without attachments, general chat or AI delivery.

Task approval context exposes approving staff identity/time and an optional explicitly learner-visible note. Existing private staff decision reasons never become learner copy automatically. The approving teacher can author the learner note in the same idempotent approval; immutable original decision and selected practice provenance remain intact.

- [x] Add failing strict help/reply/approval-note contracts.
- [x] Add private append-only task help and explicit learner-note source functions/grants.
- [x] Add scoped API/OpenAPI and bilingual task help/teacher response/approval context UI.
- [x] Author real API/SQL/browser own/foreign/stale/idempotent/immutable cases; root owns execution.
- [x] Run source checks/guards and obtain coordinator help SQL/API and full reasoning UI receipts. Exact learner question/current teacher reply and private staff reason isolation passed in the synthetic workflows; full post-content aggregate remains required.
