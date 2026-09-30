# Curriculum Pack Build Protocol

## Goal

Turn authoritative source material into a software-ready, versioned curriculum pack without hallucinating or silently filling gaps.

## Pipeline

```text
Official sources
  ↓
Source snapshot
  ↓
Research dossier
  ↓
Normalize
  ↓
Map to Edeviser Academic Reference model
  ↓
Define native assessment behavior
  ↓
Define reporting behavior
  ↓
Rights review
  ↓
Academic review
  ↓
Machine-readable pack
  ↓
Golden tests
  ↓
Technical validation
  ↓
Customer-ready
```

## Pack artifacts

Each programme implementation should have:

- `dossier.md`
- `sources.yaml`
- `normalized.yaml`
- `assessment.yaml`
- `reporting.yaml`
- `mappings.yaml`
- `terminology.yaml`
- `rights.yaml`
- `unknowns.yaml`
- `golden-cases.yaml`

## Build rules

1. Preserve native terminology.
2. Preserve native assessment semantics.
3. Do not normalize away meaningful distinctions.
4. Version everything that can change.
5. Keep historical records immutable.
6. Never invent a required relationship.
7. Mark unknowns explicitly.
8. Store source provenance for every official claim.

## Pack acceptance

A pack becomes CUSTOMER_READY only after:

- authoritative sources identified;
- rights/access understood;
- structure reviewed;
- assessment behavior implemented;
- reporting behavior implemented;
- required terminology reviewed;
- golden academic cases pass;
- browser/API/data tests pass;
- academic owner signs off;
- customer-specific required rows are complete.
