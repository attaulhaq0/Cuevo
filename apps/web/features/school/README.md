# School operations feature

Owns current-school setup, verified people/access relationships, attendance, timetable/calendar and explicit school policy approval. Public interfaces: ui.tsx (SchoolWorkspace), model.ts (bounded response validation), copy.ts (schoolEn/schoolAr labels for shell composition). The API owner is modules/school and contracts are under @cuevo/contracts; source IDs 07/14/18/36/37/39/43/61/63/80 apply.

Admin commands configure only the current school and pre-provisioned verified identities; no new tenant, user credential or entitlement grant is manufactured. Teacher attendance follows current assigned class/learner scope; student/parent operations are read-only approved projections. Membership/access and policy forms require explicit unchecked confirmations. Attendance remains an operational fact and never a learner trait or academic score.

Tests are discovered under test by the web runner. Browser journeys will verify source-backed role operations with English/Arabic/mobile/keyboard/axe, and database/API revocation checks remain authoritative. Reuse shared forms, retries, pagination, tokens and current session mechanisms; no direct browser database/secret access. Root composes this public UI and imports feature CSS in the stable layout.
