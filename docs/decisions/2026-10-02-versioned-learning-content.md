# Versioned learning content and exact source context

Date2 October2026. Status implementation boundary; scoped verification ongoing. Sources13/17/04/38/39/81/83.

Cuevo retains course/unit/lesson/activity rows as stable source identities and stores one owned immutable learning content revision ledger with current draft and published pointers. Private author drafts do not change learner-visible published content; explicit publication creates the next immutable revision. Completion and submission context manifests retain the exact published content or task preparation/policy used. Historic work without a manifest remains explicitly unknown.

The API/web still have one course/detail implementation. Bounded current content projections replace original text in its authorized responses; source identities and hierarchy FKs remain. Raw tables have no browser/runtime grants and are FORCE RLS. New content writes require current author/course/curriculum lifecycle authority, expected versions, auditable idempotent commands and outbox. Original content rows cannot be rewritten to bypass the revision surface.

Assignment/quiz activities link to one same-course matching assessment. They open existing native submission/quiz UI; generic activity completion is not an academic submission or grade. Activity kind stays fixed so observed/habit history does not silently change meaning; teachers create a new activity to change its kind. New assignment/quiz activities stay private until exact task publication. Existing older unlinked records retain their truthful compatibility/history limitations.

Retirement removes future offered content and new academic actions without deleting historical source context. Student resource bytes use current published target/ancestor scope. Staff previews and historical source details remain authorized by purpose. Private document and curriculum axes remain independent, and the new content ledger does not imply official curriculum or customer-ready acceptance.

No second learning source tree, copied active application or external service is introduced. Root owns complete DB/API/browser/RTL/mobile/a11y/runtime verification before readiness.
