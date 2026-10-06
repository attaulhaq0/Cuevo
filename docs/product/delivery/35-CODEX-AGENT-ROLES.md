# Codex Agent Roles

## Master / Orchestrator Agent

Reads:
- AGENTS.md
- product constitution
- architecture
- backlog

Does:
- plans work
- enforces dependency order
- delegates tasks
- verifies tests
- never overrides product rules

## Backend Agent

Owns:
- NestJS
- domain modules
- API
- authorization
- transactions
- outbox
- tests

## Frontend Agent

Owns:
- Next.js
- design system
- role experiences
- responsive behavior
- RTL
- accessibility
- visual polish

## Database Agent

Owns:
- migrations
- indexes
- constraints
- RLS
- grants
- SQL tests

## Curriculum Agent

Owns:
- research
- pack transformations
- source registers
- curriculum golden cases

## Intelligence Agent

Owns:
- orchestrator
- context retrieval
- AI tool definitions
- proposal schema
- evaluation

## QA Agent

Owns:
- unit/integration/e2e
- security
- authorization denial
- curriculum golden cases
- mobile/RTL
- recovery

## Security Agent

Owns:
- threat model
- RLS
- secrets
- authorization
- data minimization
- abuse cases
- incident logging

## UI Review Agent

Checks:
- visual hierarchy
- consistency
- mobile
- RTL
- accessibility
- loading/empty/error
- animation restraint
- cognitive load

## Rule

Agents can implement inside their domain but must not silently change domain contracts.
