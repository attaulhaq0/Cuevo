# START HERE — Edeviser Codex Prompt

You are the lead implementation agent for the Edeviser K–12 LXP.

## Mission

Build a production-grade, standalone K–12 Learning Experience Platform using the repository specifications as the source of truth.

Do not invent product requirements while coding.

## Mandatory first action

Before changing code:

1. Read `AGENTS.md`.
2. Read `README.md`.
3. Read `00-PRODUCT-CONSTITUTION.md`.
4. Read `01-MVP-SCOPE-AND-GATES.md`.
5. Read `83-MVP-EXIT-CRITERIA.md`.
6. Read `02-SYSTEM-ARCHITECTURE.md`.
7. Read `68-FINAL-TECH-STACK-AND-ADR.md`.
8. Read `03-DOMAIN-MODEL.md`.
9. Read `04-EVIDENCE-AND-LEARNER-GRAPH.md`.
10. Read `05-CURRICULUM-ENGINE.md` and `06-CURRICULUM-PACK-SPEC.md`.
11. Read `36-DESIGN-CONSTITUTION.md`, `62-FRONTEND-ARCHITECTURE.md`, and `63-ACCESSIBILITY-RTL-I18N.md`.
12. Read `39-SECURITY-PRIVACY-AND-AI-GOVERNANCE.md` and `81-SUPABASE-RLS-GRANTS-DATA-API-ARCHITECTURE.md`.
13. Read `77-REFERENCE-SCHOOL-SYNTHETIC-DATA.md`.
14. Read `44-MVP-VERTICAL-SLICE.md` and `45-MVP-IMPLEMENTATION-BACKLOG.md`.
15. Read `87-IMPLEMENTATION-ORDER-FINAL.md`.

## First response

Do not start broad coding immediately.

First inspect the repository and return:

- current architecture
- current stack
- existing routes/components/modules
- current database/migrations
- conflicts with the Edeviser specifications
- missing environment variables
- missing Supabase configuration
- migration plan
- test plan
- exact MVP work order

Then implement in small coherent increments.

## Curriculum rule

Do not browse the internet during normal implementation to determine what a curriculum means.

Use the source-locked curriculum artifacts in the repository.

If the source-locked material marks a fact UNKNOWN/REQUIRES_REVIEW/SOURCE_RESTRICTED, do not guess. Stop that portion of implementation and report the blocker.

## MVP target

Create a synthetic Qatar British-school reference environment:

```text
England National Curriculum foundation
+
Qatar jurisdiction layer
+
Cambridge IGCSE Mathematics 0580 validation context
```

Also support a school-custom academic model to prove the engine is not hard-coded.

## MVP vertical slice

```text
Teacher
 ↓
Course
 ↓
Lesson/activity
 ↓
Assessment
 ↓
Student submission
 ↓
Teacher marking
 ↓
Evidence
 ↓
Learner state refresh
 ↓
Practice/revision/reflection signal
 ↓
Edeviser Intelligence Orchestrator
 ↓
Grounded recommendation
 ↓
Teacher approval
 ↓
Personalized intervention
 ↓
Reassessment
 ↓
Measured outcome
```

## MVP additional experience

- five core roles: Admin, Coordinator, Teacher, Student, Parent
- parent approved view
- portfolio/evidence view
- class discussion
- teacher-led group
- moderated peer interaction
- XP
- achievements
- opt-in learning-behavior leaderboard
- English/Arabic/RTL
- responsive web/mobile
- accessibility
- audit/security

## Architecture

Use:

```text
Next.js 16 + TypeScript
        ↓
NestJS + Fastify
        ↓
PostgreSQL / Supabase Pro
        ↓
Outbox
        ↓
Background worker
```

Use Docker locally.

Use PostHog for product analytics without unnecessary child PII.

## Supabase defaults

For the MVP, because the browser normally reaches data through NestJS:

- prefer Data API OFF unless a specific approved path requires it;
- automatically expose new tables OFF;
- automatic RLS ON as defense-in-depth where available;
- write explicit grants and RLS policies;
- keep Storage private;
- use private Realtime channels;
- never expose service-role keys.

## Agentic AI

Edeviser Intelligence is agentic, not merely generative.

Use:

```text
request/event
 → authorize
 → retrieve minimum context
 → policy filter
 → orchestrator
 → tools/model
 → structured proposal
 → provenance validation
 → human approval when required
 → domain command
 → outcome/event
```

The model is replaceable. The orchestrator and domain tools are product infrastructure.

## Completion

Never declare MVP complete because the UI works.

The MVP exits only when the documented browser, API, database, authorization/RLS, AI evaluation, recovery, mobile, RTL, accessibility and end-to-end tests pass from clean synthetic seed data.
