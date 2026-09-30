# Observability and PostHog

## Product analytics

PostHog project codename:
**cuevo**

Product:
Edeviser

## Track product events, not sensitive raw content

Good:
- lesson_started
- lesson_completed
- assessment_submitted
- recommendation_reviewed
- intervention_created
- intervention_completed
- reassessment_completed
- community_post_created

Avoid:
- raw student message body
- raw assessment answers
- sensitive pastoral notes
- full AI prompts
- PII that is not needed for analytics

Use pseudonymous identifiers where possible.

## Technical observability

Track:
- API latency
- error rate
- DB query latency
- queue depth
- worker failures
- outbox lag
- realtime connection health
- AI latency/cost
- AI tool failures

## AI observability

Record:
- model/provider
- run ID
- task type
- token/cost metadata where permitted
- context references
- evaluation result
- human decision
- outcome

Do not log full sensitive prompts by default.

## Product funnels

MVP funnel:
```text
lesson_started
→ assignment_submitted
→ assessment_marked
→ signal_created
→ recommendation_reviewed
→ intervention_created
→ reassessment_completed
→ outcome_measured
```

## Privacy

Analytics configuration must honor:
- product privacy settings
- school policy
- data minimization
- applicable law/contract

## Alerting

Critical alerts:
- repeated auth failures
- cross-tenant test failure
- queue stuck
- outbox growth
- database saturation
- storage errors
