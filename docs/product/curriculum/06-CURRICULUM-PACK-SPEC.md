# Curriculum Pack Specification

## Purpose

A curriculum pack teaches Edeviser how a specific educational programme is structured and assessed.

It has two parts:

1. **Knowledge** — what the framework contains.
2. **Behavior** — how Edeviser should operate when it is active.

## Pack metadata

```yaml
pack_id:
framework:
programme:
programme_variant:
version:
jurisdiction_context:
stage_range:
subjects:
source_status:
rights_status:
academic_review_status:
effective_from:
effective_to:
owner:
reviewer:
```

## Required areas

### Structure
- stage/phase
- grade/year
- subjects
- core/optional components
- dependencies
- progression

### Academic references
- native type
- hierarchy
- codes/identifiers
- relationships
- source/version

### Teaching/learning model
- course/unit model
- interdisciplinary/project requirements
- required programme components

### Assessment
- formative/summative
- rubric/criteria
- scoring
- weightings
- internal/external
- moderation
- exam components
- staged assessment

### Qualification
Where relevant:
- qualification
- subject/component
- series
- external assessment
- result release
- certification

### Reporting
- native terminology
- grade representation
- transcript fields
- report periods

### Rights
- source organization
- licence/permission
- content scope allowed
- restrictions
- expiry/review

## Pack status values

VERIFIED
REQUIRES_REVIEW
SOURCE_RESTRICTED
UNKNOWN
NOT_APPLICABLE

## Customer-ready requirements

A pack may be labelled CUSTOMER_READY only when:
1. authoritative sources are recorded
2. rights/access are known
3. structural model reviewed
4. assessment behavior tested
5. reporting behavior tested
6. golden cases pass
7. UI terminology reviewed
8. academic owner signs off
9. production configuration verified

## Never

Do not:
- invent syllabus codes
- invent grade thresholds
- copy restricted past papers or teacher guides
- convert AI guesses into official requirements
- overwrite historical versions
