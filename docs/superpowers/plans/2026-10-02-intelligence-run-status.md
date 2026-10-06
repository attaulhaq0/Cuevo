# Durable intelligence run status

Scope: the existing improvement owner; sources10 agent state,65 workflow execution,78 idempotency/failure behavior and83 recovery. This is authorized follow-on work after policy/context/provenance. Budget envelopes remain a separate task.

- [x] Add failing shared status-contract and service/API authorization cases.
- [x] Add private bounded self-actor list/detail readers with current baseline/policy authority, safe status/usage metadata and deterministic expired-lease reconciliation through the existing durable failure function. Never retry a model from a read or expose key/lease/context/prompt bodies.
- [x] Expose teacher/admin run status/list endpoints, with server scope/schema validation.
- [x] Add English/Arabic run-status panel in improvement; explain unknown billing and stalled requests, with an explicit human-triggered new analysis only from a current permitted baseline. Keep original proposal and human decisions unchanged.
- [x] Author real Auth/API/SQL and browser cases; root owns shared execution. Run focused pure checks and structural/docs guards, then independent review.

Coordinator evidence: additive11334/11943 applied; SQL156 ten assertions and actual Auth/API three cases passed, including two simultaneous restricted expiry reads and one failure audit. The exact run-status browser assertion is authored in the reasoning journey and awaits the final rerun with later evaluation changes. Durable status is not a full displayed orchestration-stage machine.

The read path may durably close a known expired lease once; audit and failure receipt use the established internal failure command under the same actor transaction. Unauthorized parents/students/coordinators and foreign actors receive no run. A source/policy withdrawal denies status rather than serving saved context. Existing fixture defaults and native academic invariants remain intact.
