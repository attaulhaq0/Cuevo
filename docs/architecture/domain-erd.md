# Cuevo domain ERD

The foundation stores current school relationships in private app tables and reliability records in internal tables. Every relationship to a tenant record includes school_id. Global curriculum source/pack contexts and academic immutable revisions are planned in the source specifications; this diagram covers implemented foundation and learning records only.

```mermaid
erDiagram
  schools ||--o{ memberships : scopes
  schools ||--o{ entitlements : enables
  memberships ||--|| people : names
  schools ||--o{ academic_years : organizes
  academic_years ||--o{ terms : contains
  schools ||--o{ year_groups : defines
  year_groups ||--o{ classes : groups
  schools ||--o{ subjects : offers
  classes ||--o{ enrollments : enrolls
  memberships ||--o{ enrollments : student
  classes ||--o{ teacher_assignments : assigns
  subjects ||--o{ teacher_assignments : subject
  memberships ||--o{ teacher_assignments : teacher
  memberships ||--o{ parent_relationships : guardian_and_student
  classes ||--o{ courses : hosts
  subjects ||--o{ courses : teaches
  courses ||--o{ units : contains
  units ||--o{ lessons : contains
  lessons ||--o{ activities : contains
  activities ||--o{ activity_completions : completed
  memberships ||--o{ activity_completions : learner
  courses ||--o{ assessments : assesses
  assessments ||--o{ submissions : receives
  memberships ||--o{ submissions : learner
  schools ||--o{ audit_events : audits
  schools ||--o{ idempotency_keys : reconciles
  schools ||--o{ outbox_events : publishes
```

Membership/relationship status and effective windows authorize new access. Source Auth subject UUIDs identify actors; client-submitted role/learner/school claims do not establish identity. Immutable completions/submissions are source activity records, not grades or attainment. Audit/idempotency/outbox records remain private and only purpose-limited server functions access them. A future academic release must atomically persist result revision, evidence links, projection, audit and outbox as required in 17 and 38.
