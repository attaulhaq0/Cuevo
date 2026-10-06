# Foundry live intelligence verification

Date: 1 October 2026. Status: protected synthetic Auth/API/database live-model closed loop verified. This report records implementation evidence and external provider facts. Product source IDs 10, 39, 60 and 78 remain authoritative for the governed workflow, data minimization, provider independence, evaluation and human approval.

The intended synthetic evaluation uses the configured Microsoft Foundry deployment for `gpt-6.1-sol` through the Responses API. Deployment identity is configuration, never an education-domain rule. A synthetic-only data policy permits local non-production Cuevo Auth origins only; it does not approve sending real school or learner data. The user has authorized reuse of the existing credential for the synthetic live MVP evaluation. The report contains no credential value.

## Offline guard evidence

`apps/api/test/unit/foundry-configuration.test.ts` exercises the public `@cuevo/config` parser with invented credentials only. Cases cover documented local Auth hosts, synthetic remote/production denial, explicit production endpoint/key/model/policy/rates, missing-rate fail-closed behavior, unsafe endpoint rejection, finite positive rates and error-value redaction. Missing approved live prerequisites disable AI; they need not prevent the rest of the API from starting.

`scripts/runtime/foundry-environment.test.ts` exercises the real child environment mapper without starting any child. The API retains its reviewed Foundry credential, endpoint, model, data policy and limits. Web and worker children exclude those values, including an unreviewed `NEXT_PUBLIC_AZURE_OPENAI_API_KEY` input.

Fresh offline results recorded from the 20:58 local command run:

- `node node_modules/vitest/vitest.mjs run apps/api/test/unit/foundry-configuration.test.ts`: 35 cases passed.
- `node --import tsx --test scripts/runtime/foundry-environment.test.ts`: three cases passed, none skipped.
- Root `tsc --noEmit` and ESLint on both new test files passed.
- `check:docs` and `test:docs` passed; the latter ran six cases.
- `check:architecture` and `test:architecture` passed; the latter ran twelve cases.
- `check:repository` and `test:repository` passed; the latter ran twenty-two cases. Focused Git whitespace validation passed.

These commands used invented input values and accessed no model or database. The runtime guard is also included in aggregate local-runtime and technical verification discovery. Full integration/browser/SQL and production acceptance are not established by these results.

After service/accounting integration, 83 focused tests across eight unit/evaluation files passed, including the new five-case accounting regression that first failed against the earlier orchestrator. Root TypeScript passed. The real legacy fixture intelligence journey passed after the migration, and the customer twelve-pattern/parent/adversarial batch passed 16 cases across three files. Local security advisors returned no error-level findings. These scoped results do not imply a full repository security or browser certification.

## Official pricing and usage evidence

The following official Microsoft pages were fetched on 1 October 2026:

- [Responses guide](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/responses?view=foundry-classic) lists `gpt-6.1-sol`, version `2026-09-29`, as a supported Responses model.
- [Responses REST reference](https://learn.microsoft.com/en-us/rest/api/microsoft-foundry/azureopenai/responses?view=rest-microsoft-foundry-v1#openairesponseusage) describes input/output/total token counts, cached input and reasoning-token details. It does not define a billed monetary cost or currency field. Usage tokens are measurement; a monetary estimate requires a rate schedule.
- [Azure OpenAI pricing](https://azure.microsoft.com/en-us/pricing/details/azure-openai/) provides GPT-6.1 Sol input, cached-input, cache-write and output rates with separate Global/Data Zone and short/long-context rows. Its public prices are estimates, subject to Microsoft agreement and currency conditions.
- [Models guidance](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/models?view=foundry-classic) explains that short/long-context pricing categories depend on request input length. A large model context window does not by itself establish the charged category. The exact GPT-6.1 threshold and configured deployment category/region were not established in this review.
- [Reasoning guidance](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/reasoning?view=foundry-classic) states that reasoning tokens are billed as output. `max_output_tokens` caps reasoning, visible output and formatting; an incomplete response can consume billable input/reasoning without delivering an answer.
- [Prompt caching guidance](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/prompt-caching?view=foundry-classic) states that GPT-5.6 and later families can incur cache-write charges. It documents `cache_write_tokens` for Chat Completions; the fetched Responses reference does not document that field. Missing cache-write measurement must not be silently interpreted as zero writes.
- [Manage Foundry costs](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/manage-costs?view=foundry-classic) distinguishes estimates from Microsoft Cost Management meter data and invoices. Actual costs require reconciliation at a consistent resource/time scope. HTTP status alone does not prove whether billable processing occurred.

For illustration, the fetched pricing table gives the following `us-east` public rates in USD per million tokens. These are not a claim about the configured resource or a customer invoice:

| Request/deployment category | Input | Cached input | Cache writes | Output |
|---|---:|---:|---:|---:|
| Short context, Global | 2.00 | 0.10 | 2.50 | 10.00 |
| Short context, Data Zone | 2.20 | 0.11 | 2.75 | 11.00 |
| Long context, Global | 4.00 | 0.20 | 5.00 | 15.00 |
| Long context, Data Zone | 4.40 | 0.22 | 5.50 | 16.50 |

## Honest cost semantics and operational limits

The existing provider result requires `output`, `outputTokens` and numeric `cost`. A zero cost is appropriate for an explicitly identified deterministic fixture. A live provider's numeric `cost` must be identified as a configured token-rate estimate or a nonzero budget reservation; it is not a billed Azure cost. `billedCost` remains unknown unless reconciled separately. Customer-facing language must preserve this distinction.

The adapter metadata distinguishes `DETERMINISTIC_FIXTURE`, `CONFIGURED_TOKEN_RATES` and `BUDGET_RESERVATION`. General additive migration 20261001180535 records input usage, explicit basis and reserved budget; legacy rows remain `LEGACY_UNSPECIFIED`. The earlier `complete_intelligence_run` contract admitted only `outputTokens`, `cost` and `latencyMs`; both restricted numeric completion implementations now accept expanded validated usage. The migration was applied directly to the guarded local database without editing migration history. A final read-only review found the original numeric reservation implementation still callable by the API role, allowing a direct bypass of the new wrapper. Additive migration 20261001181003 revoked that entrypoint. The new privilege assertion first failed, then SQL148 passed 17 grant/source/accounting/immutability cases and legacy SQL062 passed 23 cases together after the revoke. The normal fixture Auth/API journey passed again in6.92seconds, confirming the owner-controlled wrapper can still call the private implementation. Clean full replay remains the release coordinator's final verification step.

With verified deployment pricing and complete usage details, estimate each billed token category with the corresponding rate. Reasoning tokens are already included in `output_tokens`; adding them again would double-count. Base input/output rates alone can undercount a GPT-6.1 request with chargeable cache writes.

When deployment/category/cache-write details remain unknown, a configured estimate must state the uncertainty and its assumptions. Across the fetched GPT-6.1 table, the maximum base-input, cache-write and output rates were 5.50, 6.875 and 20.625 USD per million tokens respectively. Using 12.375 for all input and 20.625 for all output is a conservative rate choice if each cache-read/write category accounts for no more than measured input tokens. This review did not establish complete Responses cache-write metering, so this formula is not a proven invoice ceiling. It excludes other Azure services, taxes, currency effects and changes to pricing. These values are test inputs and a documented estimation option, not automatic defaults for the configured resource.

A reservation of the configured per-run budget avoids fabricated free usage when exact rates are unavailable. It records a reserved amount, not observed spend and not proof that actual Azure charges are below that amount. Predictable spend also needs an input-size/token bound before transport, an explicit output-token limit and no automatic retries. Timeout/transport/incomplete/schema rejection can still incur charges; retain the reservation or unknown-usage receipt rather than declaring zero. Aggregated costs must distinguish estimated/reserved amounts from reconciled charges and must not omit potentially charged failed attempts while claiming total Azure spend.

## Verified synthetic live closed loop

The first authorized direct synthetic call used the actual configured `gpt-6.1-sol` deployment through `/openai/v1/responses` with Bearer authentication, strict `text.format`, `store:false`, no tools and no retries. It returned 366 input tokens and 162 output tokens in 3,497ms, completed successfully, passed native fact/provenance validation, and produced a proposal awaiting human approval.

The separate opt-in `customer-foundry-live-api.test.ts` passed its real Auth/API/private PostgreSQL journey in 12.92 seconds. The normal service factory constructed the real adapter, with an isolated synthetic rollback tenant and local school purpose/action policy. The second actual call returned 406 input and 198 output tokens in 4,570ms. The persisted proposal remained `AWAITING_HUMAN` with no intervention until the teacher's approved domain command. The owning learner completed support; a later teacher-released native result changed from 3/10 to 7/10. Reassessment and measurement recorded difference 4 with `OBSERVED_CHANGE_NOT_CAUSAL_PROOF`, and the real worker projected the source-linked outcome into learner state.

Parent/student generation and parent approval requests were denied. Marking the learner non-synthetic denied analysis before any durable model run; resetting only that owned fixture flag then allowed the authorized call. Original-key replay returned the same proposal with one persisted run. Wrong-learner support completion was denied. Metrics disclosed $1 reserved budget, zero included configured estimates, one unresolved billed-cost run and null cost per approved workflow. The synthetic tenant was rolled back; no reference-school live policy was enabled.

Two of the maximum three authorized live calls were used: 772 input and 360 output tokens in total. No third call or automatic retry was needed. Each used a $1 configured reservation; neither reservation establishes an Azure charge or invoice ceiling. Azure billed cost remains unknown. Sanitized local evidence is `.local/customer-readiness/foundry-smoke.json`; no raw model body or credential is recorded.

The following evidence distinguishes verified mechanics from remaining external/release prerequisites:

| Evidence | Current state |
|---|---|
| Configured deployment, region/category and active rate schedule | PENDING |
| Approved local synthetic school/purpose/action policy | VERIFIED in isolated rollback tenant only |
| One real Responses call through the server adapter | PASSED; 366 input/162 output tokens, 3,497ms, one call |
| Actual input/output usage and cost basis | VERIFIED; direct 366/162 and protected journey 406/198; BUDGET_RESERVATION |
| Strict grounding and native-fact validation from the live output | PASSED for the direct synthetic call |
| Durable run/proposal receipt, one original-key result and current-source reauthorization | VERIFIED for protected synthetic journey; SQL deny cases passed |
| Human approval and intervention creation through domain commands | VERIFIED; unauthorized parent approval denied |
| Learner support/reassessment and source-linked observed outcome | VERIFIED; 3/10 to 7/10, observed difference 4 |
| Browser role, English/Arabic, mobile, denied/error/unknown-state acceptance | PENDING |
| Cost Management/invoice reconciliation | PENDING; Responses usage does not establish billed cost |
| Isolated live test cleanup | VERIFIED by transaction rollback; reference-school live policy untouched |

The calls inherited the already authorized credential without printing or persisting it. Production remains gated by an approved real-data policy and explicit pricing; synthetic-only settings are forbidden in production. Official curriculum, provider contract approval for real learner data, legal/customer/production acceptance and broad live model quality remain separate prerequisites. Fixture mode remains the default repeatable acceptance mode and the full ordinary integration suite skips the opt-in live case.
