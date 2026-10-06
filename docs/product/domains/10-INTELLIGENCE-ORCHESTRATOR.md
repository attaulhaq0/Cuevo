# Edeviser Intelligence Orchestrator

## Goal

Make Edeviser genuinely agentic/orchestrated without turning AI into an uncontrolled authority.

## Important distinction

Edeviser Intelligence is **agentic orchestration**, not simply one generative chatbot.

The orchestrator:
- understands intent
- selects permitted context
- calls domain tools
- checks policy
- invokes models
- validates outputs
- produces a structured proposal
- routes for human approval
- records the decision
- triggers a deterministic domain command

## Architecture

```text
User request/event
 ↓
Intent
 ↓
Authorization
 ↓
Context planner
 ↓
Evidence retrieval
 ↓
Domain tools
 ↓
Policy checks
 ↓
Model reasoning
 ↓
Structured proposal
 ↓
Citation validation
 ↓
Human decision
 ↓
Domain command
 ↓
Outcome/event
```

## Tools

Possible domain tools:
- curriculum.search
- assessment.get_results
- evidence.search
- learner_state.get
- intervention.history
- portfolio.search
- class.aggregate
- timetable.get_context
- attendance.get_context
- communication.draft
- learning_content.search

Tool calls must apply authorization.

## Intelligence modes

### Explain
“What is happening?”

### Detect
“Is there an unusual/persistent pattern?”

### Recommend
“What could we try?”

### Personalize
“What learning experience may fit this learner?”

### Generate
“Draft a question, explanation, feedback, activity or message.”

### Act
Only after policy/human authorization and via domain commands.

## MVP agent

One production agentic workflow:

**Teacher Insight & Intervention Agent**

Input:
- selected class/learner context
- curriculum reference(s)
- recent results
- evidence
- development signals
- previous interventions
- relevant learning content

Output:
- observations
- evidence references
- possible explanation
- recommended next action
- proposed intervention
- limitations
- approval state

## Agent state

```text
PLANNING
RETRIEVING
REASONING
PROPOSAL_READY
AWAITING_HUMAN
APPROVED
REJECTED
EXECUTED
MEASURED
FAILED
```

## AI is not allowed to

- release grades
- change results
- change permissions
- publish curriculum mappings
- declare accreditation
- contact a parent automatically about a sensitive event
- create a safeguarding conclusion
- infer protected/sensitive attributes
- expose data outside authorized scope

## Model abstraction

Do not hard-code the product to one model provider.

Use:

```text
ModelProvider
  → Model
  → PromptTemplate
  → ToolPolicy
  → SafetyPolicy
  → EvaluationSuite
```

A stronger model can replace a weaker one without changing the domain layer.

## Generative vs agentic

Generative AI:
input → output.

Agentic Edeviser:
goal → plan → retrieve → reason → propose → human decision → deterministic action → measurement.

The MVP must implement the second pattern for at least one workflow.
