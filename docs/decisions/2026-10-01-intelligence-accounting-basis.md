# Explicit intelligence usage and synthetic data policy

Date: 1 October 2026. Status: accepted for implementation under the authorized synthetic MVP evaluation.

Cuevo's replaceable `AIProvider` contract must retain measured token usage separately from monetary assumptions. A Responses usage object does not establish provider invoice cost. The general run ledger now stores input tokens, one explicit cost basis and a reserved budget. Existing rows remain `LEGACY_UNSPECIFIED`; historical costs are not relabeled. Deterministic fixtures, configured conservative token estimates and unknown-cost reservations are distinct.

The additive accounting migration applies to every provider and preserves current source/lease checks, private grants and terminal immutability. Switching a deployed provider continues to use runtime configuration and the provider abstraction; it requires no provider-specific database schema or academic rewrite. Provider endpoints, credentials and transport remain server-owned adapters.

The API role can reserve only through `begin_teacher_insight_run`; both its renamed internal implementation and original numeric reservation function are inaccessible directly to API/Data API/worker roles. The owner-controlled wrapper can still invoke those implementations internally. This grant boundary is tested explicitly, alongside human-control and replay behavior.

Synthetic-only approval requires non-production local configuration plus a database check that all members of the selected school, including the actor and native-result learner, have an explicitly synthetic person record. A mixed or real population is denied before a reservation can cause external model traffic. This conservative scope restriction does not approve real learner processing. School purpose/action policy remains required independently.

Reserved budget and potentially charged failed attempts are disclosed separately from completed configured estimates. `totalCost` continues to describe included configured estimates only, with explicit `costAccounting` metadata; per-approved-workflow cost remains unknown when the window contains unresolved charges. Invoice cost stays unknown until Microsoft Cost Management reconciliation. No curriculum, grade, access or intervention approval authority moves to a model.

Sources: product [39 governance](../product/platform/39-SECURITY-PRIVACY-AND-AI-GOVERNANCE.md), [60 provider abstraction](../product/platform/60-AI-MODEL-AND-PROVIDER-ABSTRACTION.md), [78 evaluation](../product/verification/78-AGENTIC-AI-EVALUATION-HARNESS.md), and the official provider citations in [Foundry verification](../reports/foundry-live-intelligence-verification.md).
