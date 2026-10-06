# England National Curriculum — Deep Implementation Dossier

Status: STRUCTURAL REFERENCE / implementation source of truth must use dated official source snapshots.

## Current official structure

The England National Curriculum framework is organized into Key Stages 1–4:

- KS1: Years 1–2, ages 5–7
- KS2: Years 3–6, ages 7–11
- KS3: Years 7–9, ages 11–14
- KS4: Years 10–11, ages 14–16

The framework contains statutory programmes of study and attainment targets for subjects at the applicable key stages.

Official source:
https://www.gov.uk/government/publications/national-curriculum-in-england-framework-for-key-stages-1-to-4

## Core national-curriculum model

Represent:

```text
England National Curriculum
  ↓
Key Stage
  ↓
Year
  ↓
Subject
  ↓
Programme of Study
  ↓
Content / skills / processes
  ↓
Attainment target where applicable
```

## Subject structure

The official framework lists core subjects including English, mathematics and science across KS1–KS4 and additional foundation subjects with key-stage-specific applicability.

Do not assume every subject is compulsory at every key stage. Store subject applicability explicitly.

## KS4 warning

The national curriculum framework is not equivalent to one GCSE exam-board implementation. Schools may use different qualification providers and subjects at KS4.

Therefore Edeviser separates:

```text
England curriculum foundation
        +
Qualification/awarding-body implementation
```

## EYFS

EYFS is a separate statutory early-years framework and applies to children from birth to age five in England; it is not simply KS0 of the national curriculum.

Current official framework source:
https://www.gov.uk/government/publications/early-years-foundation-stage-framework--2

Edeviser architecture supports EYFS, but the Qatar MVP does not advertise full England EYFS support until a current pack is separately validated.

## Implementation requirements

The pack must include, by subject/key stage when implemented:

- exact source/version
- year/key-stage applicability
- subject hierarchy
- programme-of-study items
- required/non-statutory distinction where the source provides it
- sequence metadata where appropriate
- school planning representation
- assessment/reporting relationships
- links to evidence

## Important limitation

Do not imply that the England National Curriculum alone defines all practice in a Qatar British school. A Qatar school can have a British/England curricular foundation plus an international awarding body plus Qatar requirements and school policy.
