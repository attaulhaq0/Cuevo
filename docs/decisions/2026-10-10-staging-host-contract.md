# Bind staging host settings to the existing release

Status: implemented locally for backend provider admission and under final integration review. Protected CI, frontend consumption and actual hosted acceptance remain pending.

The backend approval package can carry an explicit, secret-free staging host contract. Its source/tree, targets, region, runtime, protection, connection recipe and unchanged application limits are configuration chosen for that exact package. The schema does not hard-code the current project or supply effect authority. Historical packages retain field omission and their original bytes, hashes, comments and clocks.

`backend-staging-host-contract.ts` validates the contract and bounded supplied provider/native observations. Provider transports and effect authority remain in the existing deployment and native session owners. Artifact admission requires the approved host tuple; it does not require an invented load budget or a predeployment CPU result. An optional probe budget applies only when a probe is requested. Unknown applicable capacity stays unknown and cannot produce a numeric pass.

`hosted-runtime-connection-snapshot.ts` owns one fixed scalar query and its pure normalization. The migration and runtime-rollout sessions use it under their existing held client, TLS and lease. Reads preserve their original start clock and do not refresh authority or create another session. Counts cover cluster client backends; missing role limits and session-pooler client counts remain nullable. This is a snapshot, not a fleet cap or available capacity guarantee.

New provider operations bind the contract digest into their immutable original identity. An unfinished old operation cannot gain the new digest by backfill or replay. Fully confirmed historical receipts can be observed without rewriting them. API lost-response discovery, original intent, private configuration, source/artifact guards and paused rollout retain their existing owners.

Immutable source/artifact/tool preparation finishes before current admission. The provider owner then reads only the settings relevant to the next API or Edge effect, together with the existing held connection snapshot. Their original clocks join package and native deadline minima immediately before the effect. Expensive preparation does not consume the new observation window. The former separate ID-only project read is retired; the current host check validates both recipient identity and settings.

The initializer consumes the approved digest when present in the original provider identity. It refuses a substituted or missing digest instead of stripping the new field. Historical omission remains supported. Edge content stays bound to the exact prepared bundle; later renewals refresh the small metadata tuple without reacquiring the body.

The two new tests have one direct/required owner and one source partition each. The host-contract test belongs to CICD/source-contracts; the fixed scalar test belongs to hosted-plan/source-delivery. Unknown timing measurements remain null.

Frontend transfer, web environment, alias and deployment consumers must still project the original approved tuple and compare current applicable project settings before their effects. That follow-on implementation reuses the same validator; it must not add another transfer ledger or current-state cache.

Actual TLS/role and pool lifecycle, cold/warm/concurrent requests, intended-origin access, Edge CPU and complete invocation timing, lost-wake recovery and cleanup require controlled hosted verification after deployment. Local source tests and a valid snapshot cannot establish those facts. The agreed 20–25-minute deployment target remains unmeasured; PR CI and full customer acceptance have separate durations and gates.
