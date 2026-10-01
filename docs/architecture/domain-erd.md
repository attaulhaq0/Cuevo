# Cuevo domain ERD

This map describes the implemented Technical MVP schema. The append-only migrations in supabase/migrations are authoritative. Every tenant-owned relationship uses composite school_id keys. Diagram edges summarize relationships and do not grant access.

```mermaid
erDiagram
  schools ||--o{ memberships : scopes
  schools ||--o{ entitlements : enables
  memberships ||--|| people : identifies
  schools ||--o{ academic_years : organizes
  academic_years ||--o{ terms : contains
  schools ||--o{ year_groups : defines
  year_groups ||--o{ classes : groups
  classes ||--o{ enrollments : enrolls
  classes ||--o{ teacher_assignments : assigns
  memberships ||--o{ parent_relationships : guardian_and_student
  classes ||--o{ attendance_revisions : records
  classes ||--o{ timetable_entries : schedules
  schools ||--o{ calendar_events : publishes
  schools ||--o{ school_policy_versions : approves
  classes ||--o{ courses : hosts
  subjects ||--o{ courses : teaches
  courses ||--o{ units : contains
  units ||--o{ lessons : contains
  lessons ||--o{ activities : contains
  activities ||--o{ activity_completions : observes
  courses ||--o{ assessments : assesses
  assessments ||--o{ submissions : receives
  submissions ||--o{ submission_returns : receives_feedback
  submissions ||--o{ submissions : revises
  assessments ||--o{ quiz_versions : versions
  quiz_versions ||--o{ quiz_attempts : checks_without_grade
  courses ||--o{ rubric_versions : owns
  assessments ||--o{ assessment_rubrics : pins
  submissions ||--o{ marking_revisions : numeric_marking
  marking_revisions ||--o{ result_revisions : human_releases
  result_revisions ||--|| academic_evidence : sources
  submissions ||--o{ rubric_marking_revisions : criterion_marking
  rubric_marking_revisions ||--o{ rubric_result_revisions : human_releases
  rubric_result_revisions ||--|| rubric_evidence : sources
```

Current pointers select a submission, released numeric result or rubric result without rewriting prior evidence; marking reads resolve the latest revision. Draft, return, closure and availability versions are independent of academic authority. Quiz checking returns CHECKED_NOT_GRADED. Native rubric criterion levels are never converted into an invented scalar.

```mermaid
erDiagram
  curriculum_versions ||--o{ curriculum_references : contains
  curriculum_versions ||--o{ programme_instances : configures
  programme_instances ||--o{ programme_learners : scopes
  memberships ||--o{ programme_learners : learner
  programme_instances ||--o{ programme_course_contexts : binds
  courses ||--o{ programme_course_contexts : uses
  schools ||--o{ school_framework_contexts : separates_axes
  result_revisions ||--o{ recommendations : baseline
  intelligence_runs ||--o{ recommendations : proposes
  intelligence_runs ||--|| intelligence_context_details : authorized_context
  recommendations ||--o{ human_decisions : human_controls
  recommendations ||--o{ interventions : approved_support
  interventions ||--o{ intervention_completions : observes
  assessments ||--o{ interventions : follows_up
  interventions ||--o{ outcome_measurements : measures
  memberships ||--o{ learner_state_snapshots : projects
  memberships ||--o{ habit_observations : observed_actions
  memberships ||--o{ learner_signals : factual_patterns
  memberships ||--o{ attention_signal_revisions : source_comparison
  attention_policies ||--o{ attention_signal_revisions : governs
```

Programme versions, jurisdiction overlays and quality contexts are separate. Synthetic School Custom packs prove technical mechanics. Official curriculum contexts remain pending until source, rights and academic acceptance are satisfied. Learner state retains independent academic, development, engagement, support and impact dimensions. Intelligence runs retain source/tool/policy/provider/mode provenance; only a separate human decision can create support. Outcomes compare compatible native baseline and follow-up evidence without claiming causation.

```mermaid
erDiagram
  classes ||--o{ community_rooms : scopes
  community_rooms ||--o{ community_members : permissions
  community_rooms ||--o{ community_posts : discusses
  community_posts ||--o{ community_posts : replies
  community_posts ||--o{ community_reports : reports
  community_posts ||--o{ community_moderations : reviews
  community_rooms ||--o{ community_restrictions : protects
  classes ||--o{ community_announcements : informs
  memberships ||--o{ private_assets : owns
  memberships ||--o{ portfolio_items : selects_evidence
  portfolio_items ||--o{ portfolio_revisions : reflects
  portfolio_revisions ||--o{ portfolio_reviews : approves_exact_revision
  portfolio_items ||--|| portfolio_current : selects_current_and_parent_revision
  recognition_policies ||--o{ recognition_periods : approves
  classes ||--o{ recognition_periods : scopes
  habit_observations ||--o{ xp_ledger : awards_observed_action
  recognition_periods ||--o{ xp_ledger : bounds
  recognition_periods ||--o{ leaderboard_participation : opts_in
  recognition_periods ||--o{ learner_achievements : recognizes
  schools ||--o{ audit_events : audits
  schools ||--o{ idempotency_keys : reconciles
  schools ||--o{ outbox_events : publishes
  outbox_events ||--o{ processed_events : deduplicates
  outbox_events ||--o{ community_broadcast_receipts : invalidates_privately
  outbox_events ||--o{ analytics_delivery : minimizes
```

Private assets retain metadata, checksum and lifecycle; bytes stay in a private Storage bucket. Portfolio parent pointers retain the exact approved revision and can be revoked independently of a newer learner edit. Recognition uses approved observed practice/revision/reflection, current class scope and period deduplication. Community messages remain school-scoped with current membership, moderation and restrictions; Realtime carries minimal invalidations and content is fetched through the authorized API.

The API runtime is a non-owner, non-BYPASSRLS role. New tables have explicit grants/policies and are not exposed through the Data API. Reliability records stay private; workers execute constrained functions rather than raw authoritative table mutations. Current role, entitlement, membership, guardian and programme checks apply to new commands and retries.
