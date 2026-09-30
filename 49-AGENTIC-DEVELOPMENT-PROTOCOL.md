# Agentic Development Protocol

## Goal

Make Codex productive without letting it redesign Edeviser while coding.

## Every task

Agent receives:

```text
goal
scope
allowed files/domains
dependencies
acceptance criteria
tests
```

## Task loop

```text
Read spec
 ↓
Inspect code
 ↓
Plan
 ↓
Implement smallest coherent change
 ↓
Test
 ↓
Review against spec
 ↓
Run regression
 ↓
Summarize changed files and remaining risks
```

## Parallelism

Parallelize only independent tasks.

Good:
- frontend component while backend contract is frozen

Bad:
- two agents editing domain model and database schema independently

## Git

Small commits.

Commit naming:
- `feat:`
- `fix:`
- `test:`
- `refactor:`
- `docs:`
- `chore:`

Never create enormous unreviewed branches.

## Agent handoff

Every agent returns:
- what changed
- tests run
- decisions made
- assumptions
- open risks
- docs updated

## No silent decisions

When a product question appears:
- record it in `48-SOURCES-ASSUMPTIONS-AND-OPEN-DECISIONS.md`
- use the safest reversible implementation
- do not pretend the decision is final

## Definition of complete

The task is complete only when acceptance tests pass.

## AI coding quality rule

Prefer boring, obvious code over clever abstractions.

Use domain names consistently.

Keep functions small.

Avoid premature generic frameworks.
