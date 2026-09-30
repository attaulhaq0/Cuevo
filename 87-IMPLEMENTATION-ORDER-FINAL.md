# Final Implementation Order

## Stage 0 — Repository and infrastructure

1. Read `AGENTS.md` and `START-HERE-CODEX-PROMPT.md`.
2. Inspect repository.
3. Set up monorepo.
4. Set up Docker.
5. Connect development Supabase project `cuevo`.
6. Apply secure Data API/grants/RLS configuration.
7. Set up CI.
8. Set up PostHog without unnecessary pupil PII.

## Stage 1 — Identity and school context

Build:

- auth
- five roles
- school/tenant
- people
- relationships
- academic year/term
- grade/year/class/subject
- enrolment

## Stage 2 — Learning core

Build:

- course
- unit
- lesson
- activity
- assignment
- quiz
- submission
- feedback
- progress

## Stage 3 — Academic truth

Build:

- Academic Reference
- curriculum assignment
- assessment
- rubric/numeric marking
- result revision
- evidence
- atomic result release
- audit

## Stage 4 — Learner state and Habit

Build:

- activity observations
- practice/revision/reflection
- habit signals
- learner state projection

## Stage 5 — Edeviser Intelligence

Build one workflow:

```text
signal
→ retrieve authorized context
→ orchestrate
→ propose
→ human approval
→ intervention
```

No autonomous consequential write.

## Stage 6 — Personalization + measurement

Build:

- personalized support activity
- intervention record
- reassessment
- outcome measurement
- learner-state refresh
- minimal CQI

## Stage 7 — Experience

Build:

- student home
- teacher home
- coordinator view
- parent view
- admin view
- community
- safe messaging where enabled
- XP/achievements/leaderboard
- portfolio/evidence journey
- English/Arabic/RTL
- responsive mobile/web

## Stage 8 — Curriculum validation

Use:

- England selected subject vertical
- Cambridge IGCSE Mathematics 0580
- Qatar jurisdiction overlay
- one school-custom case

## Stage 9 — Gate 5 verification

Run:

- browser
- API
- DB
- RLS
- authorization denial
- social safety
- AI evaluations
- recovery
- idempotency
- accessibility
- RTL
- mobile

Only after this stage may broad post-MVP work begin.
