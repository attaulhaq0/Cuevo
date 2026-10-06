# Current school schedule projection

**Goal:** Corrected calendar, timetable and report-period records enter lists according to their current class, publication and cancellation state. School context uses the same current projection.

**Sources:** Product14 current school operation context,18 current reporting periods,39 current guardian/object scope,61 deny matrix,81 private server path. Existing maintenance keeps original rows immutable and adds revisions; named lists currently authorize and page original records before replacing them with revisions. This can omit newly approved events or events moved into a permitted class and leaves school-context previews stale.

**Design:** Extend the existing school list mechanism with a private current-record page for these three resources. Resolve school-owned source identities to their latest revision, authorize current class/role/guardian/selected child and parent publication before paging, enrich through existing named projection, and use that same named projection in school context. Preserve underlying historical RLS/grants and do not expose private revision tables. No duplicated schedule subsystem.

**Verification:** Reproduce original-private to current-parent-approved omission and stale context, class move with selected child/other teacher denials, cancellation, current cursor and small pages. Add an append-only migration after the red actual Auth/API test, run SQL/API, existing maintenance browser and current school-context regressions. Root alone applies local migrations and controls runtime windows.

- [ ] Add and run actual API regressions before implementation.
- [ ] CLI-create reviewed additive private current projection and composition change.
- [ ] Apply only reviewed migration, run source/grants and API regression checks.
- [ ] Verify browser, docs/architecture/repository and retain precise acceptance evidence.
