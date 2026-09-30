# Agent Neutrality and Reasoning Rules

## Purpose

Edeviser is designed to be implemented by Codex, Claude Code, Kiro or another capable coding agent. The product contract must not depend on a particular model's memory.

## Source of truth hierarchy

```text
1. Repository specifications
2. Approved curriculum pack artifacts
3. Tests / golden cases
4. Existing code and migration history
5. Agent reasoning
6. Internet search, only in approved research workflows
```

The agent's reasoning never overrides an explicit repository invariant.

## When sources conflict

Do not silently pick one.

Create a decision item with:

- conflicting claims
- sources
- scope/date
- proposed resolution
- owner required

## When documentation is incomplete

Prefer a smaller correct implementation with an explicit gap over a larger guessed implementation.

## Model independence

The implementation should not contain provider-specific assumptions unless they are isolated behind the AI provider abstraction.

## Agentic development

Agents may plan, inspect, code, test, refactor and verify.

Agents may not silently broaden the product scope.

Each substantial change must identify the relevant domain specification.
