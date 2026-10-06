# Pakistan National Curriculum — Deep Implementation Dossier

Status: VERSIONED RESEARCH FOUNDATION. Current content must be sourced from the National Curriculum Council and other authoritative sources before activation.

## Current public source state

The National Curriculum Council currently exposes curriculum areas for compulsory, religious education, elective, technical and non-credit curriculum, plus assessment, scheme of studies and supplemental material. Its site also currently lists Rationalized Curricula 2026 for Grades 9–12 and draft NNCP 2026 / National Curriculum Framework 2026 material.

Official source:
https://ncc.gov.pk/

Rationalized 2026 source:
https://ncc.gov.pk/Detail/YmFhODM2NTQtMmI1Mi00MGE5LWE3YTUtNTM4Y2U3ZGY4OGJi

## Architecture

Do not model "Pakistan Curriculum" as one immutable pack.

```text
Pakistan
├── national framework
├── curriculum version
├── grade/stage
├── subject/group
├── assessment scheme
├── scheme of studies
├── local/provincial overlay where required
└── school policy
```

## Current 2026 subjects surfaced publicly

The NCC page lists rationalized Grade 9–12 material including Biology, Chemistry, Computer Science, General Science, Physics, English, Urdu, Mathematics and Islamiat.

Do not infer that this list is the complete historical or future catalogue. Import exact current records from authoritative source snapshots.

## Pakistan + Cambridge

A Pakistani school may also use Cambridge qualifications. Therefore Edeviser must support:

```text
Pakistan jurisdiction/local requirements
+
Cambridge qualification pathway
```

as independent configuration axes.

## Version rule

When a new NCP version is issued, create a new versioned pack. Existing academic records continue pointing to the version used when they were produced.

## Customer-ready rule

No family-level "Pakistan support" claim until required current subjects/grades, assessment/reporting behavior, source rights and school validation pass.
