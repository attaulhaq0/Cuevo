# MVP Decisions

## Decision 1 — Standalone K–12

Decision:
Edeviser includes basic SIS/MIS + LMS capabilities.

Reason:
A standalone LXP needs authoritative school context and a daily learning environment.

## Decision 2 — Architecture

Decision:
Next.js + TypeScript + NestJS/Fastify + Supabase Pro + worker.

Reason:
Strong ecosystem, agent familiarity, modular monolith, manageable operations.

## Decision 3 — Curriculum

Decision:
Curriculum-neutral core + versioned packs/adapters.

Reason:
IB, Cambridge, England, Pakistan and local requirements materially differ.

## Decision 4 — MVP geography

Decision:
Qatar British-school archetype.

Reason:
It creates a concrete target while exercising England + Cambridge + Qatar layers.

## Decision 5 — OBE

Decision:
Yes, MVP.

But implement a generic outcome/evidence engine rather than forcing CLO/PLO/ILO on all curricula.

## Decision 6 — Habit

Decision:
Yes, MVP.

Small scope:
practice/revision/reflection.

## Decision 7 — CQI

Decision:
Yes, minimum MVP closed loop only:
intervention → measurement → outcome.

Full CQI workspace post-MVP.

## Decision 8 — AI

Decision:
Agentic orchestrator in MVP, one high-value workflow.

Not an uncontrolled autonomous system.

## Decision 9 — Social

Decision:
Basic class community + moderated group interaction + opt-in learning leaderboard.

No unrestricted student DM in MVP.

## Decision 10 — Mobile

Decision:
Responsive web from day one.

Native apps later if actual use cases justify them.

## Decision 11 — Data API

Decision:
Do not automatically expose newly created tables.

Explicit grants/exposure only.

## Decision 12 — RLS

Decision:
Enable RLS on protected tables and test it continuously.

Automatic RLS setting can remain enabled as defense-in-depth, but policies must still be explicitly authored/tested.
