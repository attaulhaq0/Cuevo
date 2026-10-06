# British Qatar MVP School Archetype

## Goal

Provide a realistic, modular first customer archetype.

## School configuration

```yaml
jurisdiction: Qatar

curriculum_family:
  - British/England

curriculum_programmes:
  - England National Curriculum
  - Cambridge IGCSE

quality_frameworks:
  - BSO
  - QNSA

languages:
  - English
  - Arabic

modules:
  - SIS
  - LMS
  - Assessment
  - Gradebook
  - Evidence
  - Learner Development
  - Intelligence
  - Intervention
  - Portfolio
  - Community
  - Communication
  - Attendance
  - Timetable
  - Reporting
```

## Year structure

At architecture level support:
- EYFS
- KS1
- KS2
- KS3
- KS4
- post-16

## MVP implementation

Fully implement the end-to-end learning loop for:
- one KS/subject scenario using England National Curriculum structure
- one KS4 Cambridge IGCSE scenario

## Why this archetype

It forces the engine to handle:
- school curriculum references
- qualification/syllabus context
- native result representation
- different assessment structures
- local jurisdiction overlay
- quality framework overlay

## Customer-ready claim

Do not say “all British curriculum supported” until the entire required subject/year/qualification matrix for the customer archetype is implemented and tested.
