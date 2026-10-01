# Learner state and worker implementation plan

**Goal:** Transactional domain events drive deterministic, separate academic/development/engagement/support/impact projections and neutral practice/revision/reflection observations through the restricted worker. Never derive grades, character or intelligence from activity.

**Sources:** 04/08/09/11/38/39/42/43/44/58/61/77/78/81/83. Extend the existing outbox roles/functions and academic release context. The worker does not receive browser credentials or public mutation access.

## Event inputs and state

Consume canonical `result.released` with stored result/evidence/source integrity. The worker does not trust caller metadata: retrieve the immutable released result via a constrained private processing function keyed by claimed event and opaque lease. Process `activity.complete` by retrieving the immutable completion and approved activity kind; create observable practice/reflection/revision observations only when kind corresponds. Do not infer revision-after-feedback unless a real revision relationship exists. Current kinds include practice/reflection; add revision as explicit approved activity kind if domain and UI contract agree, not by reinterpreting a click.

Use transactionally idempotent worker processing keyed by event ID. Private processing checks lease token/state/not expired, validates event source school/object, checks school policy/entitlement before each optional action, and writes source-linked learner projection/observation and downstream learner_state.updated/habit.observed signal records atomically before completing the delivery. Duplicate lease/event cannot duplicate observations, snapshots or XP. Bounded retry/dead-letter for unknown events; known setup events can be acknowledged explicitly as no projection needed.

Store five dimensions separately. Academic current results are native numeric scores and their approved reference/evidence versions, with normalization null unless a documented valid scale mapping exists. Development contains counts and source observation IDs per kind within configured windows; engagement contains completed activity counts/recency. Support/impact remain explicitly empty/unmeasured until real intervention and follow-up records exist. Missing evidence produces UNKNOWN/INSUFFICIENT_EVIDENCE, never zero. Do not compute aggregate learner-quality score.

Deterministic signal for this increment: `missing_recent_evidence` when current course/reference has no valid result and a school policy config explicitly defines window, or `intervention_unmeasured` only once intervention exists. Avoid inventing weak-attainment thresholds. A neutral `practice_observed` signal may use exact count and time; academic difficulty signals require school-approved criterion/threshold config. Every signal includes rule version, source events/evidence, time window, uncertainty and status.

## Frozen REST outputs

- `GET /v1/learners/:id/state` → authorized teacher/own student/coordinator/admin; parent approved projection only. `{learnerId,generatedAt,version,academic:[{resultId,referenceId,referenceVersion,nativeResult,evidenceId,observedAt}],development:{practice:{count,observationIds},revision:{count,observationIds},reflection:{count,observationIds},windowStart,windowEnd},engagement:{completedActivityCount,lastCompletedAt:null|string},support:{activeInterventionIds:[]},impact:{status:'unmeasured',measurementIds:[]},sourceEventIds}`. New no snapshot returns `{status:'UNKNOWN',...empty source lists}` and honest unknown counts rather than forged zero if no data completeness guarantee.
- `GET /v1/observations` → own/assigned learner list `{id,learnerId,kind,sourceType,sourceObjectId,occurredAt,sourceEventId}` bounded pages, parent excluded unless approval policy exists.
- `GET /v1/signals` → current authorized scope list neutral factual signals with provenance. No AI inference labels or unsafe rankings.
- Worker `/health/ready` verifies constrained worker role and processing functions as well as dependency. `/health/live` process; readiness includes queue lag/failure counters only scoped internal technical metrics, no PII.

## Backend/worker task

Allowed apps/worker/** apps/api/src/learner-state/** contracts learner-state file, CLI migration(s)/SQLtests. Export createLearnerStateController(identity,database) root registration. API queries use existing session/currenttenant authorization. Worker role gets only validated private functions, no raw academic/all learner table access. Keep all processing module code in worker; don't introduce microservices or external queue.

Tests first: authorized claimed event processing, expired/stale/wrong lease, cross-school source mismatch, malformed metadata, duplicate completion/release event, same result multiple event IDs cannot award twice, atomic rollback, unknown event failure bounds, independent academic/development counts, missing records remain unknown, suspended relation/state read denial. Run sequential real local DB/API checks; stress concurrency by two workers claiming independent events and stale lease ack. Reconcile worker restart without partial state or duplicated observations. No tests claim official AI/curriculum readiness.

## UI task

Student progress/development and teacher learner evidence surfaces show native academic rows separately from practice/revision/reflection counts. Display source, window and unknown/refreshing state. Parent receives no new raw habit/academic internals automatically. Signal wording neutral, with rule/source context. English/Arabic/mobile, loading/error/offline states, shared tokens. Build only after contracts frozen and backend processing verifies.

## Exit

Clean seed → learning completion/result release → outbox → worker → source-linked state → authorized browser read, with restart/duplicate/denial proof. Any missing policy for academic threshold remains REQUIRES_REVIEW; it does not block deterministic provenance and observed-behavior processing.
