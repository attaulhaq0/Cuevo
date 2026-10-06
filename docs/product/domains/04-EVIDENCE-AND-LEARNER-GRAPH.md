# Evidence and Learner Graph

## Purpose

Connect school activity into a traceable learning story.

```text
Plan
 ↓
Activity
 ↓
Assessment
 ↓
Evidence
 ↓
Result
 ↓
Learner State
 ↓
Action
 ↓
Outcome
```

## Graph

```text
Student
 ├─ enrolled_in → Course
 ├─ participates_in → Activity
 ├─ submits → Assessment
 │              └─ produces → Result
 │                              └─ supported_by → Evidence
 ├─ demonstrates → AcademicReference
 ├─ exhibits → HabitObservation
 ├─ reflects_on → Reflection
 └─ receives → Intervention
                  └─ measured_by → OutcomeMeasurement
```

## Evidence types

- academic evidence
- activity evidence
- reflection evidence
- intervention evidence
- outcome evidence
- portfolio evidence
- quality evidence

## Provenance

Record:
- evidence_id
- source_type
- source_object_id
- actor_id
- school_id
- learner_id where applicable
- created_at
- curriculum_version_id where applicable
- assessment/policy context
- visibility
- review status
- integrity metadata

## Evidence vs inference

Evidence:
“Student completed three practice attempts.”

Inference:
“Practice consistency appears to be increasing.”

The UI must distinguish them.

## Evidence quality

Values:
- VERIFIED
- TEACHER_ENTERED
- SYSTEM_GENERATED
- LEARNER_REPORTED
- IMPORTED
- AI_DERIVED

AI-derived outputs are not equivalent to source evidence.

## Query principle

A graph query is not “load everything.”

It is:

> retrieve the minimum authorized evidence required for a defined purpose.

## Example

Teacher asks:
“Why is Year 8 algebra attainment weak?”

Allowed context may include:
- current class
- curriculum references
- relevant assessment evidence
- aggregated learning activity
- prior interventions
- outcome measurements

Do not automatically retrieve unrelated pastoral records, private messages or unrelated family information.
