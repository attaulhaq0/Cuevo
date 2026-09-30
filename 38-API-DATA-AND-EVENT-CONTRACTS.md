# API, Data and Event Contracts

## API style

- REST/JSON
- OpenAPI
- consistent error schema
- idempotency headers for important mutations
- cursor pagination
- request IDs

## Error object

```json
{
  "code": "ASSESSMENT_VERSION_MISMATCH",
  "message": "The assessment changed before this request completed.",
  "requestId": "..."
}
```

Do not leak database errors to users.

## Commands vs queries

Commands:
- create_assessment
- submit_assessment
- release_result
- approve_recommendation
- create_intervention
- complete_intervention
- schedule_reassessment

Queries:
- get_student_progress
- get_teacher_class
- get_evidence
- get_signals

## Event envelope

```json
{
  "eventId": "uuid",
  "type": "assessment.result_released",
  "occurredAt": "ISO-8601",
  "schoolId": "uuid",
  "actorId": "uuid",
  "entityType": "result",
  "entityId": "uuid",
  "version": 1,
  "metadata": {}
}
```

## Important events

- enrollment.created
- lesson.completed
- assignment.submitted
- assessment.marked
- result.released
- evidence.created
- learner_state.updated
- habit.observed
- signal.created
- recommendation.created
- recommendation.approved
- intervention.created
- intervention.completed
- reassessment.completed
- outcome.measured
- message.sent
- moderation.reported

## Outbox

Every event that must reliably trigger downstream work is written in the same transaction as the source command.

Worker marks:
PENDING → PROCESSING → COMPLETED / FAILED

Retry is bounded and idempotent.

## Public API vs internal tools

AI tools and internal worker commands are not automatically public endpoints.

## Schema validation

Use generated OpenAPI/TypeScript contracts plus Zod validation where frontend boundaries need runtime checks.
