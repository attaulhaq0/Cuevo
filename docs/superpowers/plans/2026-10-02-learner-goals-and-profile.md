# Learner goals and profile context

**Goal:** Learners can record, review and close their own learning goals linked to a current course/objective. Authorized teachers can read those goals in the learner context without treating them as grades, effort or psychological traits.

**Sources:**13 learner-selected goals and progress;09 own development detail/goals;14 separate identity/enrollment/learning profile/support metadata;04 evidence versus inference;39 privacy;83 student experience. Campus and approved support are implemented separately in the school owner. No diagnosis, legal accommodation, composite score or inferred attainment is collected.

**Design:** Extend development ownership with immutable learner goal revisions and one current pointer per goal. Each goal has a human title, planned step, current course and optional approved objective, actor/date, status ACTIVE/REVIEWED/CLOSED and self-review text. Student-self commands require current enrollment/course/entitlement before replay, expected revision, audit/outbox and explicit source. Teacher/admin reads use current managed course/learner scope; parents do not receive private goals. Goal review does not automatically award XP or create academic evidence. Profile context reads only authorized identity/current class/course labels and goals through existing source APIs, while school support remains separately purpose-approved.

**Acceptance:** Actual student create→review→close→teacher readback, current peer/teacher/guardian/tenant denial, stale revision/replay singular receipts, no academic/XP mutation. Bounded pages and source labels, keyboard/English/Arabic/mobile/axe; no protected offline storage. Root applies reviewed additive SQL and owns runtime windows.

- [x] Strict contracts and red actual API source/ownership tests.
- [x] Private immutable goal revisions/current pointers and separate purpose-owned profile API.
- [x] Student goal editor and authorized teacher selected learner read with current profile labels.
- [x] Focused source/grant/replay/API/browser checks; final all-role aggregate remains pending.

Observed evidence: goal SQL4/API1/browser3.2s; profile SQL5/API1/browser3.1s after additive schema-identity/lock/performance corrections. Profile uses current enrolled classes before course predicates, the shared version of the school-access advisory lock and disabled JIT. Student/teacher Arabic390px/axe passed. These increments do not close Gate5; official/legal context remains separate.
