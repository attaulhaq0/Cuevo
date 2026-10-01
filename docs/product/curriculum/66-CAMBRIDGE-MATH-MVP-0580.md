# Cambridge IGCSE Mathematics 0580 — MVP Validation Pack

## Why this pack

Use one concrete Cambridge subject to prove that Edeviser can represent a real qualification without hard-coding generic assumptions.

## Current source

Official Cambridge page:
https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-mathematics-0580/

Current public page lists syllabus periods including 2025–2027 and 2028–2030.

The 2025–2027 syllabus is:
https://www.cambridgeinternational.org/Images/662466-2025-2027-syllabus.pdf

## MVP rules

Before seeding official content:
- confirm the syllabus version required for the target school
- capture source metadata
- review rights/access
- import only permitted content
- preserve native terminology

## Verified structural facts for current public source

The public subject page describes:
- tiered study
- mathematical fluency and reasoning
- calculator/non-calculator assessment changes for the 2025–2027 syllabus
- native grading-scale choices
- examination sessions
- separate 2025–2027 and 2028–2030 syllabus versions

## Data model

```text
Qualification
  = Cambridge IGCSE

Subject
  = Mathematics

Syllabus
  = versioned

Tier
  = subject-defined

Assessment component
  = versioned

Exam series
  = June / November in the public qualification model

Result
  = native grade representation
```

Do not hard-code a generic grade mapping across all Cambridge subjects.

## Golden tests

1. create Cambridge IGCSE Mathematics course
2. select verified syllabus version
3. select tier/configuration allowed by version
4. create assessment component
5. record student evidence
6. teacher marks
7. store native result
8. normalize for analytics only if a valid normalization exists
9. show native result on transcript/report
10. update learner state
11. generate intelligence context
12. preserve source/version provenance

## Out of scope

- reproducing past papers
- reproducing mark schemes
- reproducing restricted teacher resources
- claiming official Cambridge integration beyond verified functionality
