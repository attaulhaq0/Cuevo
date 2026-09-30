# MVP Implementation Backlog

## Phase 0 — Repo and tooling

1. create repo `cuevo`
2. create monorepo
3. configure Docker
4. configure Supabase local/dev
5. configure CI
6. configure Storybook
7. configure Playwright
8. configure lint/typecheck
9. configure environment validation
10. configure PostHog skeleton

Exit:
all services boot locally.

## Phase 1 — Identity/school

1. Supabase Auth
2. user profile
3. school
4. roles
5. academic year/term
6. classes
7. subjects
8. enrollment
9. parent relationships
10. authorization guard
11. RLS tests

Exit:
five roles can log in and cross-school access is denied.

## Phase 2 — LMS

1. course
2. unit
3. lesson
4. activity
5. assignment
6. submission
7. feedback
8. progress

Exit:
teacher → lesson → student activity → submission works.

## Phase 3 — Curriculum MVP

1. curriculum engine
2. England KS1–KS4 structural model
3. Qatar jurisdiction configuration
4. Cambridge IGCSE adapter
5. one reviewed subject slice
6. curriculum UI
7. pack status system

Exit:
same learning workflow works with curriculum reference.

## Phase 4 — Assessment/Evidence/OBE

1. assessment model
2. rubric
3. result
4. immutable revision
5. evidence
6. attainment projection
7. audit
8. outbox

Exit:
result is traceable to evidence and academic context.

## Phase 5 — Learner Development

1. habit observations
2. practice/revision/reflection signals
3. learner state
4. XP
5. achievement
6. opt-in leaderboard

Exit:
habit state is separate from grade/attainment.

## Phase 6 — Intelligence

1. orchestrator
2. context retrieval
3. tool policies
4. evidence citations
5. proposal schema
6. human approval
7. AI evaluation

Exit:
teacher insight → recommendation works safely.

## Phase 7 — Intervention

1. intervention model
2. personalized task
3. completion
4. reassessment
5. outcome measurement

Exit:
complete learning-improvement loop.

## Phase 8 — Social/communication

1. class community
2. discussion
3. reactions
4. moderation
5. private Realtime
6. teacher group
7. notifications

Exit:
safe interactive community works.

## Phase 9 — Polish

1. Arabic
2. RTL
3. mobile
4. accessibility
5. motion
6. loading/empty/error/denied states
7. performance

## Phase 10 — Verification

Run full:
- security
- RLS
- browser
- curriculum
- AI
- recovery
- backup/restore
- deployment

Only then call MVP verified.
