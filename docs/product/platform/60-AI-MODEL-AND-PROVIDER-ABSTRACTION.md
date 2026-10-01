# AI Model and Provider Abstraction

## Goal

Make Edeviser agentic and provider-independent.

## Provider interface

```ts
interface AIProvider {
  generate(input: ModelRequest): Promise<ModelResponse>
  embed?(input: EmbeddingRequest): Promise<EmbeddingResponse>
}
```

## Model registry

```text
provider
model
capabilities
context_limit
input_cost
output_cost
supported_regions
data_policy_status
approved_tasks
```

Do not hard-code model names into domain code.

## Task classes

- classification
- extraction
- summarization
- grounded explanation
- recommendation
- generation
- conversational tutoring

## Agentic tasks

Agentic task:
- retrieve tools
- inspect context
- reason
- generate proposal
- request human approval
- execute approved command
- measure outcome

Generative task:
- direct draft or response

Use generation for low-risk drafting.

Use orchestration for multi-step tasks.

## Model routing

Example policy:

```text
simple classification
→ economical model

large synthesis
→ stronger model

complex agentic recommendation
→ approved reasoning model

embeddings
→ approved embedding model
```

Model selection is configuration.

## Evaluation

Every production AI task has:
- test set
- groundedness checks
- citation checks
- safety checks
- structured-output validation
- latency/cost limits
- human review criteria

## Prompt versioning

Prompts are versioned.

Store:
- prompt_id
- prompt_version
- task
- approved_by
- effective_at

## Tool permissions

Tools have explicit:
- name
- schema
- read/write
- scope
- role permission
- approval requirement

Never allow the model to invent tool parameters outside schema validation.

## Prompt injection

Retrieved content is untrusted.

System policy and tool authorization always override retrieved text.

## Provider migration

Switching model providers must not require:
- database migration
- curriculum rewrite
- frontend rewrite
- domain service rewrite
