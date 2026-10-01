# Cuevo by E Deviser

Cuevo is the K–12 Learning Experience Platform product. E Deviser is the company. The original numbered specification pack uses an earlier product naming convention; the founder's current naming instruction takes precedence.

## Run locally

Prerequisites: Docker Desktop running, Node 24 LTS or the supported local Node toolchain, and npm 11.17.0. Synthetic development data only.

```powershell
npm ci
npm run local:bootstrap
npm run dev
```

`local:bootstrap` resets **only the local Cuevo database**, applies committed migrations, configures ignored local credentials and provisions deterministic synthetic identities. It uses a dedicated Docker network and ports 56321/56322 to preserve other local Supabase stacks. Local account access details are saved in the ignored `.local/synthetic-accounts.json`; they are never committed.

Open [Cuevo](http://localhost:3000). API health is [localhost:4000/health/ready](http://localhost:4000/health/ready). The worker health service is [localhost:4001/health/ready](http://localhost:4001/health/ready). Provider secrets and school data stay out of the browser; initial auth sessions are memory-only.

```powershell
npm run lint
npm run typecheck
npm test
npm run db:test
npm run build
npm run e2e
npm run storybook
```

Read [implementation status](docs/implementation-status.md) for verified scope and blockers. The foundation is working; the full learning-improvement MVP and official curriculum readiness are still in progress.

## Original specification pack

**Date:** 1 October 2026  
**Company:** E Deviser
**Product:** Cuevo
**Purpose:** Source-of-truth product, architecture, security, curriculum, UX and agentic-development specifications for a new standalone K–12 Learning Experience Platform.

## Start here

An implementation agent MUST read, in this order:

1. `AGENTS.md`
2. `START-HERE-CODEX-PROMPT.md`
3. `00-PRODUCT-CONSTITUTION.md`
4. `54-WHOLE-APP-IN-PLAIN-ENGLISH.md`
5. `01-MVP-SCOPE-AND-GATES.md`
6. `83-MVP-EXIT-CRITERIA.md`
7. `02-SYSTEM-ARCHITECTURE.md`
8. `68-FINAL-TECH-STACK-AND-ADR.md`
9. `03-DOMAIN-MODEL.md`
10. `04-EVIDENCE-AND-LEARNER-GRAPH.md`
11. `05-CURRICULUM-ENGINE.md`
12. `06-CURRICULUM-PACK-SPEC.md`
13. `76-CURRICULUM-PACK-BUILD-PROTOCOL.md`
14. `69-SOURCE-LOCKED-CURRICULUM-PROTOCOL.md`
15. `07-SCHOOL-CONFIGURATION-AND-MODULARITY.md`
16. `08-LEARNER-STATE-MODEL.md`
17. `09-HABIT-LEARNER-DEVELOPMENT.md`
18. `10-INTELLIGENCE-ORCHESTRATOR.md`
19. `11-SIGNAL-REALTIME-AND-AUTOMATION.md`
20. `12-PERSONALIZED-LEARNING.md`
21. `13-LMS-LXP-FUNCTIONAL-SPEC.md`
22. `14-SIS-MIS-FUNCTIONAL-SPEC.md`
23. `15-SOCIAL-COMMUNITY-AND-GAMIFICATION.md`
24. `16-PORTFOLIO-FUNCTIONAL-SPEC.md`
25. `17-ASSESSMENT-GRADEBOOK-FUNCTIONAL-SPEC.md`
26. `18-REPORTING-TRANSCRIPTS-PARENT-REPORTS.md`
27. `19-COMMUNICATION-FUNCTIONAL-SPEC.md`
28. `20-BEHAVIOR-PASTORAL-SAFEGUARDING.md`
29. `21-CQI-AND-IMPROVEMENT.md`
30. `22-QUALITY-AND-ACCREDITATION-MODEL.md`
31. `36-DESIGN-CONSTITUTION.md`
32. `62-FRONTEND-ARCHITECTURE.md`
33. `63-ACCESSIBILITY-RTL-I18N.md`
34. `39-SECURITY-PRIVACY-AND-AI-GOVERNANCE.md`
35. `40-SUPABASE-AND-DATABASE-SETUP.md`
36. `81-SUPABASE-RLS-GRANTS-DATA-API-ARCHITECTURE.md`
37. `77-REFERENCE-SCHOOL-SYNTHETIC-DATA.md`
38. `44-MVP-VERTICAL-SLICE.md`
39. `45-MVP-IMPLEMENTATION-BACKLOG.md`
40. `87-IMPLEMENTATION-ORDER-FINAL.md`

## Product definition

Edeviser is a standalone K–12 Learning Experience Platform that connects school context, learning activity, curriculum, assessment, evidence, learner development, learner progress, intervention and measured outcomes to provide timely, evidence-backed intelligence and personalized next actions while humans retain control over consequential decisions.

## Core loop

**Plan → Teach → Learn → Assess → Evidence → Understand → Act → Measure → Improve**

## Three independent configuration axes

1. **Curriculum/programme:** what is taught, how it is structured and assessed.
2. **Jurisdiction/local requirements:** country-specific requirements such as Qatar or Pakistan.
3. **Quality/accreditation:** frameworks such as QNSA, BSO and CIS.

They must not be represented as one switch.

## Whole product, eventually

Edeviser is designed to grow into:

- school SIS/MIS foundation
- LMS/LXP
- curriculum and curriculum planning
- assessment and gradebook
- evidence graph
- portfolios
- progress reports/transcripts
- attendance/timetable/calendar
- communication
- moderated community/groups
- behaviour/pastoral workflows
- learner development/habit engine
- XP/achievements/leaderboard
- real-time signals
- personalized learning
- AI tutor
- Edeviser Intelligence
- intervention and outcome measurement
- CQI
- quality/accreditation evidence workspace
- standards/interoperability integrations

These are not all MVP implementation requirements.

## MVP

The MVP is a **Qatar British-school reference implementation** proving one complete learning-improvement loop.

### Curriculum target

- England National Curriculum KS1–KS4 foundation for selected verticals
- Qatar jurisdiction/local requirement layer
- Cambridge IGCSE integration for selected verified subject(s), with Cambridge IGCSE Mathematics 0580 as the first qualification validation pack

### MVP loop

```text
Teacher
 ↓
Course / lesson
 ↓
Assessment
 ↓
Student submission
 ↓
Teacher marking
 ↓
Evidence
 ↓
Learner state
 ↓
Habit/development signal
 ↓
Edeviser Intelligence Orchestrator
 ↓
Recommendation
 ↓
Human approval
 ↓
Personalized intervention
 ↓
Reassessment
 ↓
Measured outcome
```

### MVP experience

Also include enough of:

- SIS/MIS context
- parent approved view
- portfolio/evidence view
- class community
- teacher-led groups
- controlled social interaction
- XP/achievements
- opt-in learning-behaviour leaderboard
- English/Arabic/RTL
- responsive web/mobile UX
- accessibility

to make the MVP a genuine LXP rather than an academic database.

### Not MVP

Do not attempt to complete every subject/programme/accreditation body before the vertical loop works.

Defer broad:

- full Cambridge catalogue
- full IB PYP/MYP/DP/CP
- full Pakistan catalogue
- full Qatar regulatory catalogue
- full QNSA/BSO/CIS evidence workspaces
- finance/HR/payroll/transport
- native apps
- unrestricted social networking
- autonomous high-impact AI

## Curriculum source-lock

Implementation agents MUST NOT browse the internet to decide curriculum behavior while coding.

Curriculum research is a separate workflow. Implemented packs are sourced, dated, versioned, rights-aware and tested.

Unknown is never silently converted into fact.

## Technology decision

Long-term application architecture:

```text
Next.js 16 App Router + TypeScript
        ↓
NestJS + Fastify API
        ↓
PostgreSQL / Supabase Pro
        ↓
Transactional Outbox
        ↓
Background Worker
```

Supporting:

- Tailwind CSS
- Radix/React Aria
- Motion
- Lucide
- React Hook Form + Zod
- TanStack Query
- Zustand for necessary client UI state
- Storybook
- Playwright
- Docker
- PostHog
- OpenAPI

## Security baseline

- tenant isolation
- API authorization
- role + relationship checks
- RLS defense in depth
- explicit grants
- no automatic Data API exposure
- private Storage
- private Realtime
- audit
- idempotency
- AI data minimization
- prompt-injection defenses
- human approval for consequential actions

## Source-backed standards

CASE provides a machine-readable way to exchange academic standards/competencies and their relationships. OneRoster and LTI are considered integration standards at the boundaries, not replacements for the Edeviser domain model.

## Truthfulness rule

The codebase must distinguish:

```text
ARCHITECTURE_READY
STRUCTURE_READY
CONTENT_PARTIAL
TECHNICALLY_VALIDATED
ACADEMICALLY_REVIEWED
CUSTOMER_READY
SOURCE_RESTRICTED
DEFERRED
```

Do not advertise a higher state than the evidence supports.
