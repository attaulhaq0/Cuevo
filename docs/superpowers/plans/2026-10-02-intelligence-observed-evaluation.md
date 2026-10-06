# Observed intelligence evaluation

Authority: scoped intelligence completion; source pack FINAL-2026-10-01, IDs10/60/65/78/83. The existing improvement owner remains the implementation boundary. No live model calls are part of this work.

Record one immutable terminal structural observation for each new durable run: accepted output, rejected output, or not evaluated for transport/timeout/source failures. Measure accepted output over accepted plus rejected outputs, and expose unevaluated attempts separately. Preserve old runs as lacking an observation; never retroactively infer a quality result from a proposal-ready state.

Teachers/admins can explicitly record one source-linked human review per actor/run with usefulness, grounding, observed privacy and tool-safety values, including UNKNOWN in every category. Require confirmation, a bounded reason, current source/role/entitlement and idempotency; these judgments cannot change the proposal or academic truth. Separate immutable approval/rejection and actual edited intervention content establish an override denominator without turning acceptance into quality.

- [x] Write failing strict review and evaluation denominator cases.
- [x] Add private append-only observation/review tables, terminal/decision observations and current-authorized metrics.
- [x] Expose bounded source-scoped review read/write API and bilingual staff review/metrics UI with distinct denominators and unknowns.
- [x] Author actual API/SQL/fixture/transport denial, idempotency, valid/invalid/unevaluated and edited/rejected decision cases; root owns execution.
- [x] Run focused offline checks/guards and obtain coordinator SQL/API plus full reasoning UI review/metrics receipts. The observed sample is not live recommendation usefulness certification; full post-content aggregate remains required.
