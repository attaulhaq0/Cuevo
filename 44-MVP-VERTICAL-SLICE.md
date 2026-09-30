# MVP Vertical Slice

## Scenario

School:
Edeviser Academy

Class:
Year 8 Mathematics

Focus:
Algebra

Curriculum:
MVP England/Cambridge Qatar configuration

## Step 1 — Admin

Creates:
- academic year
- term
- Year 8
- class 8A
- Mathematics
- teacher
- students
- parent relationships

## Step 2 — Teacher

Creates:
- course
- unit
- lesson
- practice
- assessment

Links:
- academic reference
- assessment model

## Step 3 — Student

Student:
- opens lesson
- completes practice
- submits assessment

## Step 4 — Teacher

Teacher:
- reviews submission
- applies rubric/numeric grade
- adds feedback
- releases result

System atomically stores:
- result revision
- evidence
- attainment projection
- audit
- outbox event

## Step 5 — Learner state

Worker updates:
- academic state
- practice signal
- unresolved outcome state

## Step 6 — Signal

Example:

```text
Repeated weak evidence for the same academic reference.
No successful follow-up measurement yet.
```

## Step 7 — Intelligence

Teacher chooses:
“Analyze this pattern.”

Orchestrator retrieves minimum authorized context.

AI proposes:
- observation
- evidence
- possible explanation
- intervention

## Step 8 — Human control

Teacher:
Approve / Edit / Reject

Only Approve creates the intervention.

## Step 9 — Personalization

Student receives:
- targeted practice
- scaffold/worked example
- short reflection

## Step 10 — Habit

Practice/revision/reflection observations are stored.

XP/recognition may be awarded under school rules.

## Step 11 — Reassessment

Student completes a short follow-up.

## Step 12 — Measurement

System compares:
- baseline
- intervention
- follow-up

Status:
IMPROVED / UNCHANGED / INCONCLUSIVE / INSUFFICIENT_EVIDENCE

## Step 13 — CQI

Coordinator can see:

```text
problem
→ action
→ outcome
```

without needing the full accreditation suite.

## Success criteria

A reviewer can trace a single learner from:
- school setup
- lesson
- assessment
- evidence
- result
- state
- signal
- AI recommendation
- teacher approval
- intervention
- reassessment
- measured outcome

and every protected access is authorized/audited.
