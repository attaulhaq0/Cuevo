# Source-Locked Curriculum Protocol

## Purpose

Prevent implementation agents from inventing curriculum facts while still allowing Edeviser to add multiple curricula over time.

## Rule

Implementation agents MUST NOT use live internet browsing to decide curriculum behavior during coding.

They must use the repository's approved local curriculum dossiers, versioned machine-readable pack data and test cases.

Web research is permitted only to the Curriculum Research workflow when explicitly updating or creating a curriculum pack.

## Source hierarchy

1. Official government/awarding-body/programme source.
2. Official framework/specification/assessment documentation.
3. Official implementation guidance.
4. Reputable secondary source only for orientation.

Secondary material cannot override authoritative material.

## Required local artifact per pack

```text
curriculum-research/<family>/<programme>/
  README.md
  dossier.md
  sources.yaml
  normalized.yaml
  mappings.yaml
  assessment.yaml
  reporting.yaml
  terminology.yaml
  rights.yaml
  unknowns.yaml
  golden-cases.yaml
```

## Every fact must have

- fact_id
- statement
- source_id
- source_url or local artifact path
- source date/version where available
- access date
- scope
- status

Statuses:

VERIFIED
REQUIRES_REVIEW
SOURCE_RESTRICTED
UNKNOWN
SUPERSEDED
NOT_APPLICABLE

## No inference-to-authority rule

If a source does not explicitly support a rule, do not encode it as official behavior.

Example:

```text
Unknown grading rule
      ↓
DO NOT GUESS
      ↓
mark UNKNOWN / REQUIRES_REVIEW
```

## Curriculum claims

Customer-facing support must be expressed at the smallest verified denominator.

Good:

"Cambridge IGCSE Mathematics 0580, syllabus version X is validated."

Bad:

"Edeviser supports Cambridge."

unless every required programme/subject/version needed for the customer has actually passed pack acceptance.

## Rights

Do not reproduce protected syllabus text, past papers, mark schemes, teacher guides or restricted materials merely because an agent found them online.

Store structural metadata and source references where permitted. Restricted source access must remain marked as restricted until authorized access is available.

## Update protocol

When a source changes:

1. create a new source snapshot;
2. compare against previous version;
3. create a new pack version;
4. identify affected mappings and tests;
5. review academically;
6. run technical golden cases;
7. activate new version;
8. retain historical version for records.
