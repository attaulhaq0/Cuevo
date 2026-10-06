# Learner State Model

## Principle

Learner state is a structured snapshot, not one score.

## Dimensions

### Academic State
- current attainment/proficiency indicators
- strengths
- unresolved areas
- evidence recency
- evidence quality
- curriculum coverage

### Development State
- practice patterns
- revision patterns
- reflection patterns
- planning
- persistence
- help-seeking

### Engagement State
- participation
- completion
- recency
- voluntary extension activity where meaningful

### Support State
- active interventions
- previous interventions
- intervention status
- response history

### Impact State
- improved
- unchanged
- declining
- inconclusive
- insufficient evidence

## Snapshot model

```text
LearnerStateSnapshot
  academic[]
  development[]
  engagement[]
  support[]
  impact[]
  generated_at
  source_event_ids[]
  version
```

## Update rule

State updates may be triggered by events.

Example:

```text
assessment.released
 → refresh academic state
 → check signal rules
 → enqueue AI only if threshold/purpose requires it
```

## Avoid

Do not create:
- “student intelligence score”
- “student effort score” from raw clicks
- personality labels
- mental-health predictions
- automatic “at-risk” labels without transparent policy and human review

## Explainability

Every displayed state signal should answer:
- what changed?
- over what time?
- based on what evidence?
- compared with what baseline?
- what remains unknown?

## Privacy

Learner state visibility depends on role and school policy.
A parent receives a school-approved projection, not the complete internal state.
