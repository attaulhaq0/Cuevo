# Curriculum Engine

## Purpose

Represent materially different educational systems without forcing them into a false common assessment model.

## Universal structure

```text
Jurisdiction (optional context)
 ↓
Framework
 ↓
Programme
 ↓
Version
 ↓
Stage/Phase
 ↓
Grade/Year
 ↓
Subject/Domain
 ↓
Academic Reference
 ↓
Course/Unit/Activity
 ↓
Assessment
 ↓
Evidence
 ↓
Result
 ↓
Attainment
```

## AcademicReference

Fields:
- id
- framework_id
- programme_id
- version_id
- reference_type
- code (nullable)
- title
- description (nullable)
- parent_reference_id
- sequence
- metadata JSON
- source_id
- rights_status
- review_status
- effective_from
- effective_to

Reference types:
- standard
- objective
- outcome
- criterion
- strand
- syllabus_item
- assessment_objective
- competency
- school_objective
- requirement
- other

## Curriculum is not one model

The core must allow:
- hierarchy-based outcomes
- criterion/rubric assessment
- syllabus/qualification structures
- transdisciplinary programmes
- project/core components
- school-defined outcomes
- national/local requirements

## Adapter contract

A pack adapter exposes:

```ts
interface CurriculumAdapter {
  getProgrammeProfile(): ProgrammeProfile
  listStages(): Stage[]
  listSubjects(context): Subject[]
  resolveReferences(context): AcademicReference[]
  getAssessmentModels(context): AssessmentModel[]
  getGradeRepresentations(context): GradeRepresentation[]
  validateCourseConfiguration(input): ValidationResult
  validateAssessmentConfiguration(input): ValidationResult
  explainNativeTerminology(code): Terminology
}
```

The adapter must not perform unauthorized AI inference.

## Pack states

DRAFT
→ RESEARCH_COMPLETE
→ ACADEMIC_REVIEW
→ TECHNICAL_VALIDATION
→ APPROVED
→ ACTIVE
→ SUPERSEDED
→ RETIRED

## Version rules

Never overwrite a curriculum version once official records reference it.

## Multi-curriculum rule

A school may have multiple programme instances.

A student may belong to a programme instance according to the school's configuration.

## Interoperability

Design mapping boundaries for:
- 1EdTech CASE where useful for standards/competency structures
- OneRoster for roster/course/grade exchange
- LTI for external learning tools

Do not force external standards to become the internal domain model.

## Critical principle

Curriculum content is data.

Curriculum behavior is pack configuration/adapter logic.

School data is separate from publisher/issuer data.

The core platform must survive a curriculum pack being added, updated, superseded or removed.
