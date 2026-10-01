# Academic truth implementation plan

**Goal:** Teacher marking and release produce a native numeric result, school-authored academic reference, traceable source evidence, immutable revision, current projection, audit and outbox atomically; student/approved parent can read only released permitted projections.

**Sources:** 03/04/05/06/07/08/17/18/38/39/43/44/61/64/69/76/81/83. Existing SchoolLearning and identity/database contracts remain in force. This increment does not invent official curriculum or normalize a result to an unapproved attainment scale.

## Native reference and assessment context

Implement tenant-owned school-custom pack/version/reference records, immutable used versions. New references are explicit school-authored objectives with nullable native code; no official issuer claim. Teacher/admin creates a draft reference, a coordinator/admin approval record activates it. Source metadata states SCHOOL_AUTHORED, author, version, rights permitted for school authored synthetic context; academic approver is a current school actor. No official content can enter the custom path disguised as Cambridge/England/Qatar readiness.

Existing assessments add nullable academic_reference_id and model numeric; publication can exist without reference for generic ungraded learning, but authoritative release requires an approved compatible version/reference. Assessments retain policyVersion and teacher-defined maxScore; version mismatch denies. Teacher can link only a school-approved reference before the first result. Freeze assessment model/max/reference when official result history exists. School Custom synthetic fixture approved objectives are clearly synthetic; academic owner test fixture is not official curriculum sign-off.

## Frozen REST contracts

Identity, current entitlement and current object checks apply before every query/mutation/replay. POST commands require Idempotency-Key and strict schema validation; current relationship checks occur in the transaction. Typed lists use items/nextCursor, max100.

- `GET /v1/academic-references` → `{items:[{id,title,code:null,version,status:'DRAFT'|'APPROVED',sourceType:'SCHOOL_AUTHORED',createdBy,approvedBy:null|string}],nextCursor}` authorized current school view.
- `POST /v1/academic-references` `{title,description,version}` teacher/admin; DRAFT, immutable source/version.
- `POST /v1/academic-references/:id/approve` `{}` current coordinator/admin; records reviewed school custom context, audit/outbox.
- `POST /v1/assessments/:id/reference` `{referenceId,expectedPolicyVersion}` current managing teacher/admin; approved same-school reference; increments policyVersion, rejects once results exist. Returns assessment with policyVersion/referenceId.
- `GET /v1/marking` → teacher/admin queue `{id,assessmentId,learnerId,content,assessmentTitle,learnerName,maxScore,policyVersion,referenceId:null|string,currentResult:null|{id,revision,score,maxScore,feedback,status}}` bounded list.
- `POST /v1/submissions/:id/results` `{score,feedback,expectedPolicyVersion,expectedRevision:0|positive,sourceEvidence:true}` current authorized teacher/admin only. Writes new DRAFT/REVIEW mark revision (no authoritative released grade yet). Numeric bounds 0..maxScore; missing invalid, zero legitimate; record native `{type:'numeric',score,maxScore,policyVersion}`; sourceEvidence must refer actual immutable submission through server. Optimistic expectedRevision rejects stale concurrent revisions. Returns `{id,submissionId,learnerId,revision,score,maxScore,feedback,status:'REVIEW',policyVersion,referenceId}`.
- `POST /v1/results/:id/release` `{expectedRevision}` current authorized teacher/admin explicit human release; approved reference and valid immutable source submission/evidence required. Atomically write immutable released revision/evidence/link/current_result projection/audit/outbox; repeat samekey response identical, new release same revision does not duplicate. Returns released result with evidenceId/createdAt/actor provenance. Correcting released result uses a new marking revision with expectedRevision; release creates historical linked correction and current projection without overwriting prior released records.
- `GET /v1/results` → student own released, teacher/admin assigned, coordinator school; parent only current child relation and school-approved released projection; internal draft feedback never parent/student. Include native result, reference version, status, evidenceId; no invented normalized proficiency.
- `GET /v1/evidence/:id` → current teacher/own learner/coordinator/admin permitted; parent only approved released child projection (no full private submission by default). Fields `{id,sourceType:'SUBMISSION',sourceObjectId,learnerId,actorId,createdAt,quality:'TEACHER_ENTERED',referenceId,referenceVersion,policyVersion,resultId,revision,visibility,reviewStatus}` plus safe parent projection; no unbounded raw all-learner data.

## Task backend

Allowed academic folder, contracts academic file, CLI migration(s), seed synthetic custom approved reference and golden database cases. Export createAcademicController(identity,database) for root registration. Reuse transaction helper and internal idempotency/audit/outbox. Explicit private grants and RLS; protect drafts separately released/projection rows. Preserve append-only marks/releases/evidence; mutable current pointer must reference same-school same-learner valid revision. Do not let application role update historical versions. Atomic approval/release must be human actor command and no model tool or worker has write privilege.

Tests first: missing reference/evidence/version, zero vs missing, score bounds, stale revisions, duplicate release, correction history, denied actor/tenant/class/student/parent, revoked assignment/enrollment/relationship replay, failure rollback of result/evidence/projection/audit/event and source integrity. Run real local Auth/API/Postgres tests and SQL golden cases sequentially. Keep fixed replay scopes, no fake authority.

## Task browser

Teacher marking queue shows submission, numeric maximum, policy/reference context, draft mark form and explicit review/release control. Keep references selection + approval UI in academic view appropriate roles. Student/parent released progress shows native scale and provenance; academic state separate habit. Evidence expands with why/source/version/revision. English/Arabic tokens, mobile/keyboard, uncertain command retry originalkey, missing/error/unknown states. Release never on navigation/render; user clicks explicitly after mark review. Correction displays new revision with reason/feedback, preserves old evidence. No fake attainment meter.

## Integration exit

Clean migrations + synthetic seed → teacher course/assessment/reference → student submits → teacher marks/reviews/releases → student sees native result/evidence → correction retains history. Browser/API/DB authorizations and replay/rollback must pass. This proves numeric academic truth only; rubric implementation and full curriculum validations remain separate mandatory MVP tasks. Never claim Gate 2 complete while needed numeric/rubric or authoritative evidence behavior is unverified.
