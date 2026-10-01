# Academic feature

Owns objective approval, immutable school rubric configuration, numeric/criterion marking/review/release and evidence presentation. Public interfaces: model.ts for response validation and discriminated native results, ui.tsx for AcademicWorkspace/EvidenceDetail/NativeResultView, copy.ts for shell labels. Progress reuses native validation/display through those public surfaces. Internal components, messages and styles stay here. API owner: apps/api/src/modules/academic. Product source IDs 04, 17, 18 and 63.

Tests live in test; `npm run test -w @cuevo/web` discovers them. Browser journeys are tests/e2e/academic-truth.spec.ts and rubric-truth.spec.ts. Keep drafts private, require approved references, show native numeric scales or full criterion labels/version, preserve explicit parent visibility and original-key uncertain retries. Rubric results never acquire a placeholder numeric maximum or normalized score. Technical browser/API/worker evidence is required before a rubric gate claim; official curriculum acceptance remains separate.

Current marking rows carry source submissionRevision/submissionStatus separately from marking revision. Returned/closed sources cannot be marked; teacher return/close/history controls reuse learning/ui and preserve the source lifecycle. New resubmissions have their own immutable source and marking context.

Product source lookup: [task context map](../../../../docs/product/context-map.md); numbered IDs resolve through the product registry.
