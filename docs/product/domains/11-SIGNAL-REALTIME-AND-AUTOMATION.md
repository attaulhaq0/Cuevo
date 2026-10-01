# Signals, Realtime and Automation

## Principle

Real-time does not mean “call an LLM for every click.”

Use three layers.

### Immediate
- submission confirmation
- grade save
- message send
- attendance record

### Near-real-time
- learner state refresh
- class signal
- progress update
- intervention status

### Asynchronous
- AI analysis
- large report
- large curriculum mapping
- bulk personalization

## Event flow

```text
User action
 ↓
Domain command
 ↓
Transaction
 ↓
Outbox event
 ↓
Worker
 ↓
state update / deterministic signal
 ↓
AI job only if needed
```

## Signal structure

```yaml
signal_id:
school_id:
learner_id:
scope:
type:
severity:
status:
trigger_event_ids:
evidence_ids:
rule_version:
created_at:
expires_at:
```

## Signal examples

- repeated_assessment_difficulty
- missing_recent_evidence
- intervention_unmeasured
- improvement_after_intervention
- curriculum_coverage_gap
- unusual_change

Avoid generic “risk” labels.

## Automation engine

```text
Trigger
 ↓
Conditions
 ↓
Approval requirement
 ↓
Action
 ↓
Audit
 ↓
Outcome
```

Examples:
- intervention completed → schedule reassessment
- unresolved evidence → notify coordinator
- approved recommendation → create learning task
- assessment due → reminder

## AI + automation

AI can propose:
“Create a short retrieval intervention.”

Workflow engine executes only after configured approval.

## Realtime channels

Use private school-scoped channels.

Examples:
- `school:{schoolId}:announcements`
- `class:{classId}:discussion`
- `group:{groupId}:chat`
- `user:{userId}:notifications`

Authorization must be enforced through Realtime policies.

## Failure handling

If a realtime connection fails:
- application remains usable where possible
- queue local non-sensitive UI actions only where safe
- show connection state
- reconcile from server after reconnect
