# Curriculum Data and Content Ingestion

## Purpose

Prevent agents from hallucinating curriculum content during implementation.

## Four source categories

### A — Public official structure
May be extracted after rights/source review.

### B — Authorized school content
School supplies or licenses the content.

### C — Restricted publisher/issuer content
Use only through permitted access/integration.

### D — AI-derived suggestions
Never treated as official curriculum content.

## Ingestion pipeline

```text
Source
 ↓
Source Registry
 ↓
Document/HTML capture
 ↓
Human/source verification
 ↓
Extraction
 ↓
Normalization
 ↓
Hierarchy validation
 ↓
Pack proposal
 ↓
Academic review
 ↓
Import
 ↓
Golden cases
 ↓
Publish
```

## Source registry fields

- source_id
- publisher
- title
- URL/location
- version
- publication date
- access date
- rights
- scope
- checksum where appropriate
- extraction status
- reviewer

## Import rules

Every imported curriculum item must store:
- pack version
- source id
- source location
- source version
- import run
- rights status

## Content updates

Never overwrite previous content.

Create a new pack/version and compare:
- added
- removed
- renamed
- moved
- changed description
- changed assessment behavior

## AI mapping

AI may propose mappings between school activity and academic references.

Store them as:
`AI_PROPOSED`

A human reviewer promotes:
`APPROVED`

Never make:
`AI_PROPOSED → OFFICIAL`
automatically.

## Copyright/rights

The platform must not use the existence of a public web page as proof that all underlying material is freely reusable.

For every pack:
`rights_status` is mandatory.

## Missing source

If a required official source is unavailable:
- mark REQUIRES_REVIEW
- identify exact missing field
- continue generic engineering only

Do not invent it.
