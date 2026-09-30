# England National Curriculum Pack — MVP Foundation

## Authoritative sources

National curriculum framework for KS1–KS4:
https://www.gov.uk/government/publications/national-curriculum-in-england-framework-for-key-stages-1-to-4

EYFS:
https://www.gov.uk/government/publications/early-years-foundation-stage-framework--2

## MVP scope

Implement as the primary curriculum foundation for the Qatar British-school MVP:

- KS1
- KS2
- KS3
- KS4

The schema must also support:
- EYFS as a distinct framework
- post-16 as a separate qualification context

## Important distinction

England National Curriculum defines programmes of study and attainment targets for KS1–KS4.

It is not identical to Cambridge IGCSE/International GCSE.

Do not make:
`British = Cambridge`.

## Structure

```text
England National Curriculum
 ↓
Key Stage
 ↓
Year group
 ↓
Subject
 ↓
Programme of Study
 ↓
Content/reference
 ↓
Attainment target where applicable
```

## MVP seed strategy

Do not manually create a fake “complete curriculum” from memory.

Create an ingestion pipeline that can:
1. identify the official source
2. fetch permitted official content
3. preserve source/version metadata
4. normalize hierarchy
5. create AcademicReference objects
6. validate parent/child relationships
7. produce golden cases

For the vertical proof, use a complete reviewed subject slice rather than pretending every subject has been ingested.

## Current source note

The English National Curriculum framework is a government statutory framework with programmes of study and attainment targets for all subjects at four key stages.

## EYFS

EYFS is a separate framework for birth to 5 in England and should not be mixed into KS1.

For Qatar product use, represent it as an available framework template pending school-specific applicability.

## Reporting

Edeviser should not invent statutory assessment claims. School reporting configuration controls local report periods and commentary; official/qualification results have their own native representations.
