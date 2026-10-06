# School access concurrency and current source review

**Goal:** Editing an existing enrollment, teacher assignment or guardian relationship cannot overwrite a newer administrator decision; school-approved identity/status/windows remain explicit and auditable.

**Sources:**14 current relationship windows;39 protected access and human approval;38 idempotency/audit;61 current source/replay denial; expanded EU08. Existing relationship forms now load current values, but configure upserts have no expected version and can silently restore revoked access from a stale form.

**Design:** Keep the existing authoritative tables and configure routes. Add revision columns initialized to1 and immutable source revision triggers; a changed row advances its revision. Existing configure payload may include expectedRevision; updates require it, creation requires0. The server holds a school access mutation lock and exact current row, reauthorizes current administrator/provisioned identity before replay, and checks revision after original-key reconciliation. Never grant raw relationship writes or weaken self/last-admin checks. Lists include current revision. UI reads exact selected relation/identity and submits that basis; existing create flow uses0. A new convenience endpoint or table copy is unnecessary.

**Acceptance:** Red actual API stale revoke→stale restore must409 and leave revoked; exact current revision deliberate restore succeeds; original-key receipt reconciles singular event/history under current authorization. Test enrollment/teacher/guardian and person status/window updates, no forged foreign identity, no last-admin removal. Browser edits exact current record with names/windows, refresh conflict recovery, EN/AR/mobile/keyboard. Append-only SQL and all structural checks required.

- [ ] Reproduce stale access overwrite through actual API.
- [ ] Add strict expected revision schema/source columns/trigger/command guard and list projection.
- [ ] Connect selected current row to form basis; creation reads current tuple if already present.
- [ ] Verify SQL/API/browser and report exact limits.
