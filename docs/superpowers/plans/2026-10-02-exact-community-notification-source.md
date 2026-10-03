# Exact notification source

**Goal:** Notifications carry their authorized announcement title and open that exact current announcement before users record a read receipt.

**Sources:** Product19 notification/source delivery states,15/80 current school community,39 guardian revocation,36/37 useful primary actions. Expanded EU14 confirms the current title depends on a separately paged list and read can be recorded without opening content.

**Design:** Reuse the existing announcement and current community scope predicate. Add a narrow exact announcement API read with immutable source metadata; enrich the existing private notification projection with title. A feature-owned disclosure loads the exact authorized source and exposes the existing explicit Mark read command after successful content load. No new notification subsystem or broad parent room/roster access.

- [ ] Red actual API test confirms title/source independently of announcement list paging and current revocation.
- [ ] Add private exact helper/projection migration, service/controller and safe feature contract/disclosure.
- [ ] Verify SQL/API and visible open→read chain in English/Arabic/mobile and rerun community journey.
