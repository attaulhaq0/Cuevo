# MVP Exit Criteria

## MVP statement

The MVP is a working Qatar British-school reference implementation proving one complete learning-improvement loop and the architecture required to expand into a modular multi-curriculum K–12 platform.

## Required product flow

```text
School
 ↓
Teacher
 ↓
Course
 ↓
Curriculum reference
 ↓
Lesson/activity
 ↓
Assessment
 ↓
Student submission
 ↓
Teacher marking
 ↓
Evidence
 ↓
Learner State
 ↓
Habit signal
 ↓
Edeviser Intelligence
 ↓
Recommendation
 ↓
Human approval
 ↓
Personalized intervention
 ↓
Reassessment
 ↓
Measured outcome
```

## MVP product scope

### Foundation
- five roles
- multi-tenant school
- academic structure
- basic attendance/timetable/calendar
- role/relationship authorization

### Learning
- course/unit/lesson/activity
- assignment
- quiz
- submission
- feedback
- progress

### Academic
- flexible Academic Reference
- outcome mapping
- numeric and rubric marking
- native result representation
- evidence

### Learner intelligence
- learner state
- practice/revision/reflection observations
- deterministic signals
- one agentic orchestrator workflow
- recommendation
- human approval
- intervention
- personalization
- reassessment
- outcome measurement

### Experience
- basic portfolio/evidence
- class community
- teacher-led groups
- safe messaging where enabled
- XP
- achievements
- opt-in learning leaderboard
- parent approved view

### UX
- responsive web
- English
- Arabic/RTL
- keyboard
- accessibility
- reduced-motion

### Curriculum
- England National Curriculum structure for selected MVP subject vertical
- Qatar jurisdiction overlay
- Cambridge IGCSE Mathematics 0580 validation context

## Not a requirement for MVP

- every subject
- all Cambridge programmes
- complete IB
- complete Pakistan NCP
- full QNSA/BSO/CIS workspaces
- finance/HR/payroll
- native mobile apps
- autonomous consequential AI actions

## Exit tests

MVP can exit only when:

1. clean synthetic seed creates the reference school;
2. all five roles complete their critical journeys;
3. academic result release is atomic/idempotent/audited;
4. evidence provenance is traceable;
5. learner state refresh works;
6. deterministic signal works;
7. agentic proposal is grounded and authorization-safe;
8. human approval changes the state only through the domain command;
9. intervention and reassessment work;
10. outcome measurement works;
11. community permissions and moderation tests pass;
12. RLS/authorization denial tests pass;
13. Arabic/RTL and mobile tests pass;
14. failure/recovery tests pass;
15. Playwright demo script runs from clean seed data.
