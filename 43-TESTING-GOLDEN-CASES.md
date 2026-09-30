# Testing Strategy and Golden Cases

## Test pyramid

### Unit
Pure functions and domain rules.

### Integration
API + database + authorization.

### E2E
Browser role journeys.

### Security
Cross-tenant, role, file, realtime, session revocation.

### Curriculum
Golden academic cases.

### AI evaluation
Groundedness, citation, policy compliance, refusal/uncertainty.

## MVP critical test

```text
Teacher creates assessment
 ↓
Student submits
 ↓
Teacher marks
 ↓
Result + evidence + audit + outbox
 ↓
Learner state refresh
 ↓
Signal
 ↓
AI recommendation
 ↓
Teacher approves
 ↓
Intervention created
 ↓
Student completes
 ↓
Reassessment
 ↓
Outcome
```

## Recovery tests

- network failure
- duplicate submit
- double grade release
- worker retry
- AI timeout
- outbox duplicate
- revoked parent
- suspended teacher
- stale curriculum version

## AI tests

### Groundedness
Recommendation must refer to available evidence.

### Unsupported inference
Model should qualify uncertainty.

### Privacy
No unrelated student appears in output.

### Prompt injection
Untrusted content cannot change tool policy.

### Action safety
AI cannot directly release grades.

## Social tests

- student cannot join unauthorized group
- cross-school messaging denied
- muted user cannot bypass
- reported content creates moderation event
- private Realtime channels deny unauthorized join

## UX tests

- 390px layout
- 768px tablet
- 1440px desktop
- Arabic RTL
- keyboard
- reduced motion
- screen reader labels
