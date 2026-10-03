# Native current report identity and continuation

**Goal:** A selected learner's current native report has authorized human identity and can traverse all bounded pages without falsely claiming an official transcript or complete curriculum coverage.

**Architecture:** Extend the existing current selected-learner envelope with optional authorized identity, retain per-page source guards, and offer explicit page navigation/export plus a bounded combined export. Use the existing current access generation to cancel delivery after child/session/scope changes. No cross-model normalization or official period grading rule is inferred.

**Sources:**04/18/37/63/83 and EU18/EU19/period reporting gaps in the functional review.

- [ ] Add parser and HTML assertions for human learner/school identity, native zero/rubric, escaped text and explicit page continuation.
- [ ] API verifies current selected source scope before resolving authorized displayName/schoolName; envelope keeps IDs for provenance, names for primary presentation.
- [ ] Report UI reads current page, allows next/previous page and page download, and can collect a bounded1000-source report through current authorized cursor reads. Repeated cursors/duplicate/mismatched sources fail; hitting bound discloses continuation and never asserts completeness.
- [ ] Learner detail links to the same page list so capped state snapshots have a real current-source drilldown.
- [ ] Actual >25-source browser API read/export, English/Arabic/mobile/keyboard and held-delivery access loss tests; no aggregate/official transcript claims.
- [ ] Period/objective coverage still requires its separate planned-reference/period source model; this increment does not relabel it complete.
