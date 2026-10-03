# Community source context and recovery

**Goal:** A reply whose parent is outside the loaded page says that its context is not loaded, and a denied/unavailable room retains a way back and a local retry.

**Sources:** Product15/19/80 moderated school communication,36/37 usable error states,39 current scope,63 bilingual accessibility. EU15 and EU20 in the expanded review identify these existing frontend gaps.

**Design:** Distinguish known visible parent, known hidden parent and missing page context in a pure owner model helper. Render localized unknown context rather than asserting moderation. Keep room Back/Refresh actions in all read-error paths; no protected stale body or write controls. Exact server parent context can be added separately without broadening room scope.

- [ ] Red pure cases cover the three source states.
- [ ] Use helper in existing discussion and retain Back/Refresh on errors.
- [ ] Verify focused UI error/unknown source and normal discussion chain, plus feature tests and guards.
