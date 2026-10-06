# Edeviser Reference School — Synthetic Development Environment

## Purpose

Because Edeviser has no signed partner school yet, development uses a synthetic reference school.

No real pupil/parent/staff data is allowed in development.

## School

```yaml
school_id: reference-doha-001
name: Edeviser Reference Academy – Doha
country: Qatar
languages: [en, ar]
pathways:
  - England National Curriculum
  - Cambridge IGCSE
jurisdiction:
  - Qatar
quality:
  - BSO
  - QNSA
```

## Synthetic population

- 1 admin
- 2 coordinators
- 8 teachers
- 60 students
- 60 parent accounts
- 4 year groups
- 6 classes
- 8 subjects

## Required synthetic learner archetypes

### A — High attainment / inconsistent practice

Strong assessment results but low recent practice frequency.

### B — Low attainment / high effort

Strong practice/reflection behavior with persistent academic difficulty.

### C — Sudden decline

Previously stable results with a recent change requiring a signal.

### D — Missing work pattern

Multiple late/missing assignments but no automatic psychological label.

### E — Intervention success

Intervention followed by measurable improvement.

### F — Intervention inconclusive

Intervention delivered but follow-up evidence is insufficient or unchanged.

### G — Multi-curriculum

Learner assigned to a different programme instance to prove school-level multi-programme configuration.

## Synthetic data rule

Every AI evaluation should run against deterministic synthetic fixtures before any real-world school data is allowed.
