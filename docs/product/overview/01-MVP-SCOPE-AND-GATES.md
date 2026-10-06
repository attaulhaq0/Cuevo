# MVP Scope and Gates

## MVP objective

Prove one complete, trustworthy learning-improvement loop.

## MVP must support

### Foundation
- multi-tenant school
- Supabase Auth
- five roles: Admin, Teacher, Coordinator, Student, Parent
- school/year/term/class/subject/enrollment
- basic attendance/timetable/calendar context
- role and relationship authorization
- audit

### Learning
- course
- unit
- lesson
- resource/activity
- assignment
- quiz
- submission
- teacher feedback
- basic student progress

### Academic
- flexible curriculum reference
- outcome hierarchy
- assessment model
- rubric/criteria or numeric marking
- native result representation
- evidence
- attainment projection

### Learner intelligence
- learner state
- learning activity observations
- minimum Habit Engine
- deterministic signals
- one orchestrated AI workflow
- recommendation
- teacher approval
- intervention
- personalized support activity
- reassessment
- outcome measurement

### Engagement
- student profile
- portfolio evidence view
- class discussion room
- teacher-led group
- safe direct messaging only where school policy allows
- opt-in learning-behaviour leaderboard
- XP/recognition tied to approved learning actions, not grades

### UX
- desktop and mobile responsive
- English
- Arabic
- RTL
- keyboard navigation
- screen reader landmarks
- reduced-motion support

## MVP curriculum target

### Customer-facing MVP claim

**Qatar British-school learning pathway**

- England National Curriculum KS1–KS4 foundation
- Qatar jurisdiction/local-requirement layer
- Cambridge IGCSE qualification/assessment integration for the selected MVP subjects

The platform must be structurally ready for:
- EYFS
- post-16
- Cambridge O Level
- Cambridge AS/A Level

But these are not customer-ready until verified.

## MVP curriculum content rule

Do not attempt to load every subject before proving the engine.

For the vertical proof:
- one complete primary/KS3 subject case
- one KS4 Cambridge IGCSE subject case
- one school-custom case

The pack architecture and data contract must already support all subjects.

## MVP CQI scope

CQI is included in MVP only as a **closed-loop intervention measurement capability**:

evidence → intervention → reassessment → measured change.

Full school quality management and accreditation workspaces are post-MVP.

## MVP Habit scope

Include:
- practice
- revision
- reflection

Produce evidence-based patterns only.

Do not include:
- psychological profiling
- generalized behavior scores
- punitive student rankings
- automatic pastoral labels

## MVP social scope

Include:
- class discussion room
- teacher-led groups
- controlled student peer interaction within school scope
- safe reactions
- notifications
- opt-in practice/engagement leaderboard

Exclude:
- public profiles
- external friend requests
- cross-school messaging
- unrestricted private student chat

## Gates

### Gate 0 — Architecture
Deliver domain model, ERD, threat model, design tokens and deployment skeleton.

### Gate 1 — School + Learning
Teacher can create class/course/lesson; student can learn and submit.

### Gate 2 — Academic Truth
Teacher marks; result/evidence/attainment are atomically and audibly persisted.

### Gate 3 — Intelligence Loop
Signal → AI proposal → human approval → intervention → reassessment → outcome.

### Gate 4 — Experience
Student, Teacher, Coordinator, Parent and Admin flows work responsively in English/Arabic.

### Gate 5 — Verification
Security, RLS, denied-access, recovery, idempotency, AI evaluation, browser and mobile tests pass.

Only after Gate 5 should the team start adding broad post-MVP modules.
