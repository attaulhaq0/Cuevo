# Edeviser Intelligence as a Reusable Platform Layer

## Product principle

The domain intelligence layer should be reusable beyond education only at the **platform mechanics** level.

Keep separate:
- universal orchestration infrastructure
- education-specific tools, policies and ontology

## Universal layer

Reusable:
- agent orchestration
- model routing
- tool registry
- context retrieval
- authorization
- memory boundaries
- structured outputs
- human approval
- workflow execution
- audit
- evaluation
- prompt/version management
- cost controls

## Education layer

Education-specific:
- curriculum tools
- assessment tools
- learner state
- evidence graph
- teaching tools
- intervention
- school policies

## Future verticals

The same orchestration kernel could later support:
- healthcare operations
- workforce learning
- professional training
- enterprise quality/compliance
- customer operations

But do not generalize Edeviser domain data prematurely.

## Architecture

```text
                AGENT PLATFORM KERNEL
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
       Policy       Tools        Models
          │            │            │
          └────────────┼────────────┘
                       ▼
              DOMAIN ORCHESTRATOR
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
     Education       Future          Future
      adapter        vertical        vertical
```

## MVP

Build only the education implementation.

Do not create a multi-industry product abstraction that slows Edeviser development.
