# Cambridge Family Pack

## Authoritative sources

Cambridge Primary:
https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-primary/

Cambridge Lower Secondary:
https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-lower-secondary/

Cambridge IGCSE:
https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-upper-secondary/cambridge-igcse/qualification/

Cambridge Lower Secondary assessment:
https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-lower-secondary/assessment/

## Cambridge Primary

Typically serves ages around 5–11.

The public programme information describes a choice of subjects and optional assessments.

Model:
```text
Cambridge Primary
 ↓
Stage 1–6 style progression
 ↓
Subject
 ↓
Curriculum framework
 ↓
Optional/ school-selected assessment
```

Do not assume every school uses every optional assessment.

## Cambridge Lower Secondary

Typically serves early adolescence.

Public assessment information describes:
- classroom assessment
- Progression Tests
- Checkpoint
- diagnostic/benchmarking options

Checkpoint is at the end of the programme and uses external marking for certain areas.

## Cambridge IGCSE

Public Cambridge information states:
- assessment occurs at the end of the course
- assessment can include written, oral, coursework and practical components depending on subject
- grading is subject-specific and uses recognized grade representations
- examination sessions are June and November for the described current model

Never hard-code one assessment component for every IGCSE subject.

## Cambridge O Level

Treat as a separate qualification context even when assessment concepts overlap with IGCSE.

## Cambridge AS/A Level

Treat as separate advanced-qualification contexts.

Assessment and staged routes can differ by subject.

## Adapter requirements

The Cambridge adapter must support:
- qualification
- syllabus/version
- subject
- component
- assessment route
- exam series
- native result
- optional/core/extended variants where applicable
- external/internal assessment
- staged assessment where applicable

## MVP

Implement one real Cambridge IGCSE subject end-to-end.

Use it to validate that:
- a native assessment model can be represented
- result can be stored
- evidence can be linked
- reporting can preserve native representation
- learner state can normalize the result without destroying native context

Then expand subject/qualification coverage.
