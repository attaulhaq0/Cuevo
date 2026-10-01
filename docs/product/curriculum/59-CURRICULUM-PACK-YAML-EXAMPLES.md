# Curriculum Pack YAML Examples

These examples show the structure the engine can consume. They are **configuration examples**, not official curriculum content.

## England KS3 example

```yaml
pack_id: england-nc-ks3-example
framework: England National Curriculum
programme: National Curriculum
version: SOURCE_VERSION_REQUIRED
stage: KS3
academic_reference_type: programme_of_study
assessment_models:
  - numeric
  - rubric
reporting_models:
  - school_configured
source_status: source_verified_structure
rights_status: review_required
customer_status: not_customer_ready
```

## Cambridge IGCSE example

```yaml
pack_id: cambridge-igcse-example
framework: Cambridge
programme: IGCSE
version: SYLLABUS_VERSION_REQUIRED
stage: upper_secondary
academic_reference_type:
  - syllabus_item
  - assessment_component
assessment_models:
  - component_based
  - numeric
  - grade_representation
qualification:
  type: external_qualification
  exam_series: configurable
source_status: source_verified_structure
rights_status: review_required
customer_status: not_customer_ready
```

## IB MYP example

```yaml
pack_id: ib-myp-example
framework: IB
programme: MYP
version: SOURCE_VERSION_REQUIRED
stage: middle_years
academic_reference_type:
  - objective
  - criterion
  - strand
assessment_models:
  - criterion_based
  - rubric
external_assessment:
  optional: true
source_status: source_verified_structure
rights_status: review_required
customer_status: not_customer_ready
```

## IB DP example

```yaml
pack_id: ib-dp-example
framework: IB
programme: DP
version: SOURCE_VERSION_REQUIRED
academic_reference_type:
  - course_requirement
  - assessment_component
core:
  - tok
  - extended_essay
  - cas
assessment_models:
  - internal
  - external
grade_scale:
  min: 1
  max: 7
course_levels:
  - HL
  - SL
source_status: source_verified_structure
rights_status: review_required
customer_status: not_customer_ready
```

## Pakistan example

```yaml
pack_id: pakistan-ncp-example
framework: Pakistan National Curriculum
programme: NCP
version: OFFICIAL_VERSION_REQUIRED
jurisdiction: Pakistan
stage: grade_9_to_12
academic_reference_type:
  - curriculum_reference
assessment_models:
  - authority_verified
source_status: source_verified_version
rights_status: review_required
customer_status: not_customer_ready
```

## Qatar jurisdiction overlay

```yaml
pack_id: qatar-jurisdiction-example
type: jurisdiction_overlay
jurisdiction: Qatar
applies_to:
  - selected_school
requirements:
  - source_verified
status: review_required
```

## Rule

Never populate example fields with guessed official codes or thresholds.
