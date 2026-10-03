# Boundary contracts

School account delivery requires an exact revision-one approved request and explicit confirmation. Its strict effect receipt separates provider confirmation, capture acceptance and awaiting recipient claim; unknown/review outcomes never become claimed membership. Delivery schema validation supplies no executor authority or credential.

`school-accounts.ts` defines strict confirmed administrator invitation/revoke inputs, a bounded25-row invitation page and a purpose-only recipient claim. Claims accept an exact request, a64-hex admission secret and deliberate acceptance, never desired school/role/entitlements. Minimized source receipts exclude email and credentials; the approved recipient email appears only on administrator-owned current pages. Schema validation grants no membership, recipient control or delivery authority. School API/offline contract tests consume these definitions; actual private SQL, Auth, SMTP and browser acceptance remain separate.

`outcome-display.ts` adds optional strict read-time context to numeric/rubric outcome responses. It requires exact learner identity, nullable registered names/source-task labels and dates, and explicit READY/REQUIRES_REVIEW. READY cannot claim missing or ambiguous context. Learner-state responses bind any supplied context to the selected learner. The existing native measurement schema, comparison rules, command/event values and legacy context-free snapshots stay compatible; this contract grants no source access and introduces no names into worker events.

`academicEvidenceSchema`/`academicEvidenceContextSchema` validate exact numeric/rubric evidence with purpose-limited human source context. Names/fields may be null only under review; READY requires complete non-ambiguous context. This display projection grants no additional source, school or membership authority.

Portable analytics contracts also describe strict intelligence metadata: fixed source event names, output/review/cost-basis enums, nullable source counts/usage, HMAC-ready run/context references and linked outcome comparability. The worker validates the constructed private projection; these types grant no retrieval or academic authority. No prompt/output/PII/free-text field is part of this analytics contract.

Public API: @cuevo/contracts through src/index.ts. Files group identity, school-learning, academic, learner-state and improvement schemas. These browser-safe schemas describe data boundaries; they never fetch data or grant authorization. Import the public package instead of relative src paths. API unit/contract tests and actual integration exercise consumers; new schemas should have owner tests here when useful.

`@cuevo/contracts/analytics` is a narrow portable constants/types surface used by the worker's exact Edge graph and browser observations. It contains no validators or provider runtime. Strict diagnostic observation/configuration/receipt schemas live in `diagnostics-contract.ts` through the main package export. The observation admits only six fixed enum fields and a version-four random retry identity; raw text, URLs, request data, credentials and selected-child/object identities are rejected. Parsing grants no school or analytics authority.

academicReportSchema/AcademicReport define a selected learner's current released native result page with exact provenance, feedback and source versions. Strict numeric/rubric contracts preserve zero and descriptors without normalization, reject another learner/duplicate source IDs and declare coverage NOT_ESTABLISHED. Authorization remains in the existing academic API and private scoped source read; HTML download rendering belongs to the progress feature.

Product source lookup: [task context map](../../docs/product/context-map.md); numbered IDs resolve through the product registry.

InsightContext retains bounded teacher-approved source results, observed actions, previous support/outcomes and available learning options. Intelligence metrics declare mode/window and explicit denominators; absent observations remain null. ClassLearningSummary retains separate current native/evidence, observed-action and support/outcome counts, unique bounded source citations and unknown coverage. These contracts do not establish authority or synthesize cross-model attainment.

Optional `intelligenceEvaluationSchema` separates structural output acceptance from unevaluated attempts, explicit human sample observations and actual decision overrides. Human review requires a confirmed strict structured observation with UNKNOWN in every category. Empty assessed denominators have null rates; category denominators cannot exceed recorded reviews. These observations cannot establish live quality certification or authoritative learner facts.

Intervention help contracts require confirmed bounded academic questions/replies and exact task approval metadata. Optional `learnerNote` is allowed only on approval and is distinct from private staff decision reasons. Task support authorization and immutable source checks remain server/database responsibilities.

Optional approvedActivityIds are bounded unique exact sources on a human approval. Intervention choice commands accept only activity identity and confirmation; responses retain frozen option text/current availability and the separately recorded chosen source. SQL owns approval/choice authorization and immutable completion provenance.

`nativeAcademicSourceSchema` identifies one original immutable numeric/rubric result, submission/course/reference/evidence/version and exact native representation. Policy versions must agree and rubric criterion keys are unique; scalar or mismatched rubric forms are rejected. It never defines rubric level ordering, normalization or an inferred outcome.

Insight evidence accepts original numeric score/maximum or an exact native descriptor. Rubric proposal facts retain native rubric criteria and forbid inferred numeric comparison. School native-data approval is explicit and distinct from numeric-only policy. `nativeInterventionOutcomeSchema` retains compatible rubric before/after descriptors with UNKNOWN comparability, inconclusive status and no difference/threshold. Numeric measure commands continue to require a positive threshold; descriptor-only commands explicitly select their separate comparison mode.

Insight learning options optionally retain paired contentRevisionId/contentRevision from exact published immutable content. A half-supplied source pair is invalid; legacy options omit both. SQL validates current published source/ancestor/role/course authority and exact frozen meaning, independently of browser parsing.

Execution manifest/registry contracts retain configured model/task/prompt source identity, exact digest/version/effective time, known capability subset, data-policy classification and limits. Immutable school binding carries approvedBy/effectiveAt and explicitly labels school policy versus retained fixture source authority. These fields cannot manufacture provider-contract approval or live quality certification and contain no keys or prompt prose.

HOSTED_SYNTHETIC_FIXTURE identifies remotely hosted deterministic fixture mechanics separately from LOCAL_SYNTHETIC_FIXTURE. Both require the fixed fixture provider/model and FIXTURE mode; LIVE cannot borrow either fixture policy. The schema conveys provenance only: exact deployment authority, current populated synthetic school, administrator binding, authorized source retrieval and persistence remain server/private SQL checks.

`intelligenceAnalysisSchema` is a bounded Teacher Insight explanation code with unique result/observation/prior-intervention citations, labelled teacher-review interpretation and non-causal uncertainty. API and SQL validate the factual prerequisites against frozen current-authorized context; schema parsing alone does not prove them. Prompt identity includes id/version/digest. Exact selected activity and checked analysis metadata are optional for legacy proposal/intervention responses.

Optional strict intelligence `costAccounting` declares configured-estimate scope, included run count, reserved budget and unresolved billed-cost count. `billedCost` is null because token usage does not establish an invoice. Legacy responses remain compatible; new SQL metrics include this disclosure. Reserved or unresolved runs cannot imply zero actual spend.

`learnerProjectionSchema` optionally records current authorized total/returned/truncated counts for academic, observation, provenance, support and outcome pages. Runtime checks reject clipped pages presented as complete and preserve unknown observation denominators. The contract is browser safe; source authorization stays in the private API/database projection. Customer projection contract cases verify its denominator semantics.

Portfolio source work uses the bounded portfolioSourceWorkSchema for one exact TEXT submission, never a list of raw answers. confirmSourceReview is explicit on new review commands and defaults false for legacy command compatibility; server source logic determines when it is mandatory.

submission-artifact.ts distinguishes genuine TEXT and FILE source responses, at-most-five unique verified artifact identities and complete draft/source metadata without storage paths. FILE responses carry empty text and an actual artifact manifest; absent or duplicated source details cannot become valid work.

conversation.ts defines exact parent/teacher source tuple, versioned school approval, text-only in-app messages, truthful delivery/read status and explicit human moderation. Hidden messages expose null body. Boundary parsing does not itself grant relationship or messaging authority.

learning-content.ts defines bounded version-checked course/unit/lesson/activity source editing, explicit publication and retirement, and exact matching assignment/quiz assessment identity. Current source/history parsing retains revision/state context; it does not grant teacher or learner authority.

community-mentions.ts models bounded unique explicit recipient identities. Mention authority belongs to the current community room/roster/source functions; arbitrary typed @names do not create a recipient. No parent, external or public network source is admitted by the schema.

The queued [Character Progression System plan](../../docs/superpowers/plans/2026-10-03-character-progression-foundation.md) proposes strict progression policy/track/projection/source, catalog/presentation policy, cosmetic validity/availability, selection and correction groups through the existing main `@cuevo/contracts` export. No schemas are implemented by this documentation increment. Current Development requests and response behavior remain supported; proposed choices cannot authorize earning or replace private current scope.
