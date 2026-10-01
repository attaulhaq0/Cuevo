# Boundary contracts

Public API: @cuevo/contracts through src/index.ts. Files group identity, school-learning, academic, learner-state and improvement schemas. These browser-safe schemas describe data boundaries; they never fetch data or grant authorization. Import the public package instead of relative src paths. API unit/contract tests and actual integration exercise consumers; new schemas should have owner tests here when useful.

academicReportSchema/AcademicReport define a selected learner's current released native result page with exact provenance, feedback and source versions. Strict numeric/rubric contracts preserve zero and descriptors without normalization, reject another learner/duplicate source IDs and declare coverage NOT_ESTABLISHED. Authorization remains in the existing academic API and private scoped source read; HTML download rendering belongs to the progress feature.

Product source lookup: [task context map](../../docs/product/context-map.md); numbered IDs resolve through the product registry.

InsightContext retains bounded teacher-approved source results, observed actions, previous support/outcomes and available learning options. Intelligence metrics declare mode/window and explicit denominators; absent observations remain null. ClassLearningSummary retains separate current native/evidence, observed-action and support/outcome counts, unique bounded source citations and unknown coverage. These contracts do not establish authority or synthesize cross-model attainment.
