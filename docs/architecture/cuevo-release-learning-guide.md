# Understanding Cuevo architecture testing and releases

## How to use this guide

This guide is for a junior developer learning from Cuevo's real release incident. It explains how a request moves through the product, what CI proves, why our release became slow, and how to design a safer and faster process. Read the worked examples before memorizing the interview answers. Being able to explain a tradeoff is more useful than knowing a tool name.

The central lesson is that code verification, infrastructure installation, deployment and customer acceptance answer different questions. A team needs evidence for each question and a recovery path between them. Running more tests does not compensate for a missing deployment path.

This is a dated learning document, researched on 7 October 2026. The published PR #15 source is `38c5037b6948116791e68cb59f2ce9ba8ab00502`; its CI succeeded. Additional architecture repairs are in the working tree and are still being integrated and reviewed. References to those repairs describe implementation under verification, not a merged or hosted release. This guide does not replace product specifications or authorize deployment.

At the last verified provider observation recorded by this task, Supabase had no application tables or Auth accounts and the two Vercel projects had no deployments. That observation predates this document; it is not continuous provider monitoring. No provider provisioning or deployment was performed while writing the guide.

## Vocabulary you will hear in engineering discussions

| Term | Meaning in this scenario |
|---|---|
| CI | Continuous integration checks a proposed or integrated source change automatically |
| CD | Continuous delivery keeps verified changes deployable; continuous deployment also releases them automatically when policy permits |
| PR | A pull request proposes a source change for review and integration |
| Workflow job and step | A workflow is triggered by an event; a job runs on a machine; steps are commands/actions within it |
| Runner | The machine executing a GitHub Actions job, separate from your laptop |
| Artifact | A built output or retained evidence file; its bytes and source identity matter |
| Commit and tree | A commit records history and metadata; its tree identifies repository file content |
| Migration and seed | A migration versions schema changes; a seed installs controlled initial/example data |
| Fixture | Deliberately constructed test data or dependencies, including fictional school accounts |
| Smoke and regression tests | Smoke tests check critical working paths; regression tests check that established behavior still works |
| Idempotency and NOOP | An original operation can be safely recognized on retry; NOOP means no new mutation was needed |
| Critical path | The longest required dependency chain that determines when the whole workflow can finish |
| p50 and p95 | The median duration and the duration at or below which 95 percent of measured runs finish |

Continuous delivery does not mean a school release must be automatic. Cuevo deliberately retains approval for consequential hosted effects and customer launch. A source hash is technical evidence for reviewers; it should not replace a student's name or an assessment title in the product UI.

## The application we are building

E Deviser is the company and Cuevo is its K–12 Learning Experience Platform. Its MVP connects school context, learning, assessment, evidence, learner state, support proposals, human approval, intervention, reassessment and measured outcome. Students, teachers, parents, coordinators and administrators have different authorized actions.

A score or an engagement signal is consequential in this product. The system must not turn behavior into an intelligence score or allow an AI proposal to become an authoritative grade. English, Arabic, mobile behavior, access denial and unknown states are part of the product requirements. These requirements explain some of the verification breadth; they do not justify executing every expensive test on every change.

The chosen architecture is a modular monolith with a background worker. Most domain logic belongs to one application and database authority, organized into owners. There are several deployable applications, but that does not make the platform a collection of independent business microservices. In the current API, domain controllers are composed into one Nest application. A folder name alone does not establish runtime isolation.

```text
Browser
  -> Next.js web application
  -> NestJS API using Fastify
  -> Domain commands and authorization
  -> PostgreSQL on Supabase
  -> Transactional outbox
  -> Existing worker processor
```

The hosted plan places the web and API on Vercel and the bounded worker adapter on Supabase Edge. Auth, database, private Storage and protected Realtime remain Supabase capabilities. The local worker can run as a Node process. Both worker adapters reuse the processor; they are not competing award or workflow engines.

Sources: [system architecture](../product/platform/02-SYSTEM-ARCHITECTURE.md), [repository layout](repository-layout.md), [API owner](../../apps/api/README.md), [worker owner](../../apps/worker/README.md).

## Reading the repository without getting lost

Start with README and START-HERE, then use the product context map and codebase map. Load the affected domain's specification, README and tests. The product registry resolves numbered sources to their current paths. Documentation stored in a repository is not automatically understood by a contributor or agent; it must be read.

| Location | Responsibility | Useful first file |
|---|---|---|
| apps/web/app | Next route composition | app layout and affected page |
| apps/web/features | Feature UI, models, copy and tests | Affected feature README |
| apps/web/shared | Browser session, API and form mechanisms | shared session or API owner |
| apps/api/src/modules | Domain controllers and services | Affected module README |
| apps/api/src/platform | Identity and database infrastructure | identity.service.ts |
| apps/worker/src/jobs | Background work | outbox/processor.ts |
| packages | Public contracts, pure rules, UI and configuration | Package exports and README |
| supabase/migrations | Versioned database authority | Existing relevant migration |
| supabase/tests | SQL, grants and RLS verification | Affected authorization cases |
| tests/e2e | Browser journeys across applications | Role or learning journey |
| scripts/verification | CI and release evidence owners | steps.ts and relevant runner |
| .github/workflows | Triggers, jobs and deployment gates | ci.yml and backend-release.yml |

Shared browser code cannot import server configuration or a feature's implementation. Applications cannot import another application's runtime code. Packages expose intentional public surfaces. These rules limit accidental coupling and secret exposure. Architecture checks enforce structural rules; security tests still have to verify actual authorization.

## Following one request through Cuevo

Consider a student completing a published learning activity. The exact endpoint depends on the current domain owner, but the authorization and reliability sequence is consistent.

1. The browser displays current authorized school and activity context and sends the action through the API mechanism. Hiding an action in the UI is only presentation; it does not grant or deny server authority.
2. The API verifies the bearer identity and current session. IdentityService loads current school memberships, requires school selection when necessary and checks the selected membership belongs to the verified user.
3. The domain operation checks the applicable entitlement, role, enrollment or relationship, object scope and source state. Authenticating a user does not authorize every object.
4. The authoritative mutation uses its original idempotency key and input fingerprint. A transaction records the source change, audit and durable outbox event together where required.
5. The response confirms the saved source. Derived learner state may still be pending. Immediate confirmation must not pretend the worker or an AI step has finished.
6. A post-commit wake requests bounded worker execution. The worker validates the original source and processes the event under an owned lease.
7. The UI later receives or refreshes confirmed derived state. If processing is unknown or unavailable, that state stays explicit.

The real [identity service](../../apps/api/src/platform/identity/identity.service.ts) checks current sessions and memberships; it does not trust a role supplied by the browser. [The API and event contracts](../product/platform/38-API-DATA-AND-EVENT-CONTRACTS.md) govern the further domain checks.

An academic result release has more invariants: teacher scope, assessment state, policy version, evidence references and immutable result revision must agree. A worker or AI cannot bypass those rules just because it received an event.

## Why the outbox and worker matter

Suppose a database update commits and the application crashes before it sends a message. If the only message lived in application memory, derived work can disappear. The transactional outbox solves that gap by saving the event in the same transaction as its source mutation. A worker can find it after the crash.

A wake is a delivery hint. The outbox and source records are durable authority. Cuevo's accepted foundation coalesces signed wakes and uses scheduled recovery to find due or abandoned work. The Edge request includes a small versioned wake envelope, timestamp and HMAC signature. It does not carry a reusable signing key or arbitrary tenant/event payload.

```text
Source change + audit + outbox commit together
                 |
                 v
        Signed bounded wake request
                 |
                 v
       Restricted worker claims lease
                 |
       Process source and record outcome
                 |
   Lost wake or expired lease -> recovery check
```

The [processor](../../apps/worker/src/jobs/outbox/processor.ts) distinguishes completed, waiting, review-required and unknown receipts. It stops on an unknown processing receipt because the SQL transaction may already have committed. Repeating a new command automatically could duplicate an effect. The Edge processor is bounded to at most ten events with a processing deadline and time reserved before another claim. That deadline is not a promise about the entire HTTP request, which also includes connection, admission and cleanup.

In an interview, say that this design supports durable processing and safe retries. Do not claim universal exactly-once network delivery. Idempotency and source validation make repeated delivery safe within the implemented contracts; external side effects still need their own reconciliation.

Sources: [event processing foundation](scalable-event-processing.md), [worker decision](../decisions/2026-10-02-event-triggered-worker.md).

## The security layers you should understand

Authentication asks who the caller is. Authorization asks whether that caller may perform this action on this object now. A teacher in School A must not read School B's records even if both records use the same endpoint.

PostgreSQL grants decide whether a role can reach an object or execute a function. Row-level security, or RLS, decides which rows a reachable operation can access. API checks, grants, RLS, constraints and private function boundaries have different responsibilities. Automatic RLS is not enough without explicit privilege and denial tests.

Cuevo's main sensitive data path is Browser -> API -> Postgres. The selected hosted configuration requires the Data API to be disabled, automatic exposure of new tables off, private files and protected Realtime. Auth still works as its own capability. A publishable browser key is not a database password or service key, and it does not replace authorization.

The API and worker use restricted runtime database roles. The migration operator can perform installation work and must stay separate from browser and runtime credentials. A TLS connection must verify the certificate and the selected host; encryption without peer verification does not prove which server received the credentials.

There is a documented residual trust boundary: Supabase's control plane and the server-only Storage credential holder are trusted for managed Vault/net capabilities. A provider or API compromise can expose privileged material. The accepted policy records that risk and denies private Cuevo domain RPC routes to those service keys. The guide must not describe Vault as protection against a fully trusted provider compromise.

Sources: [RLS and Data API architecture](../product/platform/81-SUPABASE-RLS-GRANTS-DATA-API-ARCHITECTURE.md), [provider trust decision](../decisions/2026-10-05-supabase-edge-provider-trust.md), [environment and secret rules](../product/platform/82-DEPLOYMENT-ENVIRONMENTS-AND-SECRETS.md).

## Docker CI Supabase and Vercel have different jobs

| System | What it supplies | What it does not prove by itself |
|---|---|---|
| Docker | Isolated, repeatable processes and local services | Correct application behavior or a short test suite |
| GitHub Actions | Triggered jobs on runners, statuses and artifacts | That hosted providers have been provisioned |
| Supabase | Hosted Postgres, Auth, Storage, Realtime and Edge capabilities | That Cuevo's migrations, accounts and permissions were installed |
| Vercel | Hosted web/API builds, deployments and environment settings | That the app can authenticate and complete a learning journey |
| Tests and release receipts | Evidence for a specific source, scope and operation | Every untested environment or customer requirement |

The local configuration uses the Cuevo Supabase CLI project with PostgreSQL 17 and guarded ports, including API 56321 and database 56322. A GitHub runner creates its own temporary environment. The hosted project is a separate target with its own credentials and history. The fact that Docker is already installed on your laptop does not make GitHub's runner reuse that database.

Ordinary CI should be able to reset fictional test data safely. It must not reset hosted staging or customer data. Hosted smoke tests inspect the actual deployed system after installation; they complement disposable tests.

Vercel's provider terms Local, Preview and Production are separate from Cuevo's application data classifications such as synthetic-staging. A Vercel Preview URL is not automatically access-controlled staging or approved production. Source, environment variables, provider ownership, deployment protection and domain binding must be verified.

Sources: [local configuration](https://github.com/attaulhaq0/Cuevo/blob/38c5037b6948116791e68cb59f2ce9ba8ab00502/supabase/config.toml), [Supabase migrations documentation](https://supabase.com/docs/guides/deployment/database-migrations), [GitHub workflow documentation](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflows), [Vercel environments](https://vercel.com/docs/deployments/environments).

## What our slow run actually did

The published [PR #15 run](https://github.com/attaulhaq0/Cuevo/actions/runs/37650482743), attempt 1, ran against source `38c5037`. It completed successfully on 7 October 2026. GitHub's job timestamps show the following durations, excluding initial queue time.

| Job | Duration | Result |
|---|---|---|
| Fast checks | 7 minutes 43 seconds | Success |
| CodeQL | 2 minutes 11 seconds | Success |
| Secret scan | 39 seconds | Success |
| Dependency review | 14 seconds | Success |
| Technical MVP | 55 minutes 24 seconds | Success |
| Required status collector | 3 seconds | Success |

Technical MVP was the critical path. Its broad runtime profile performed clean disposable setup, production builds, API/worker/Edge packaging, browser-secret checks, SQL/grants/RLS tests, API integration, outage/recovery drills, signed Edge verification, ordinary browser journeys, compatibility tests and restoration. These operations were mostly sequential inside one script and one job. Lint, types and unit checks were in a separate fast job.

This PR changed the selector and release controls, so it correctly selected broad verification. However, the published selector also sent nearly every normal code change to that broad lane. Its smaller lane admitted only one mapped feature's CSS or Markdown changes. That was too narrow to provide useful everyday feedback.

The observed 55-minute duration measures the entire job. We do not have a verified breakdown assigning each minute to SQL, browser tests or Docker setup in that run. It is reasonable to suspect several contributors, but calling one the root cause without timings would be inference.

The pipeline's history also matters. Git records the foundation CI work on 1 October, integrated MVP/release work in commit `504ccf2` on 6 October, duplicate/admission repairs on 7 October, and the profile separation in `38c5037` on 7 October. Those commits record the author identity attaulhaq. Git author metadata does not establish which human or tool made every design decision. The release process evolved through repository work; it is not a rule imposed by Supabase or Vercel.

Sources: [published workflow](https://github.com/attaulhaq0/Cuevo/blob/38c5037b6948116791e68cb59f2ce9ba8ab00502/.github/workflows/ci.yml), [published check inventory](https://github.com/attaulhaq0/Cuevo/blob/38c5037b6948116791e68cb59f2ce9ba8ab00502/scripts/verification/steps.ts), [verification decision](../decisions/2026-10-07-verification-profiles.md).

## Constructive criticism of the release loop

The platform has legitimate security and product requirements. The failure was in how their evidence was coupled to delivery and how partial success was represented.

**Too much work on the critical path.** Fast-check feedback arrived concurrently after 7 minutes 43 seconds, but the broad browser, compatibility and recovery suites delayed the required aggregate. Independent work was bundled into one sequential technical runner. Increasing its timeout allowed completion but did not reduce the workload.

**Local progress was presented too close to hosted progress.** A temporary database can pass migration tests while the hosted database remains empty. Reports should state the installed table/account/deployment facts separately from test results.

**The first milestone had no continuation.** The initial schema/accounts package required an empty target. Completing it made the project nonempty, while its scope prohibited provider deployment. A fresh package could not admit the installed state. This was an operational dead end.

**Credentials had the wrong lifetime.** Runtime passwords were generated during schema/account work and existed only in that runner's private filesystem. The later deployment needed them after the runner ended. Uploading plaintext secrets as ordinary CI artifacts would have been a poor repair.

**The next migration was not a complete lifecycle.** In a controlled source/history reproduction, adding migration 231 changed the current final stage boundary. A verified completed 230-migration inventory could then be rejected despite unchanged hashes. Reusing the immutable seed source as every future migration baseline created another later-release failure.

**A successful wrapper was weaker than the claimed coverage.** Test reports needed exact discovery, required case completion and known exclusions. Otherwise missing or skipped cases could be mistaken for complete acceptance. A rename selector also needed to inspect the old sensitive path.

**Security evidence was tied to moving main.** A scheduled diagnostic must keep the source it actually scanned even after main advances. A release still needs current integrated-source authority. Those are different consumers of evidence.

**Unknown writes lacked durable recovery.** Lost acknowledgements can occur after a provider accepts a write. Starting a new operation does not resolve the original uncertainty. The process needs retained intent, observed receipts and explicit reconciliation.

None of these lessons calls for removing authorization checks or merging failing code. They call for checks with clear owners, measured scope, truthful evidence and executable recovery paths.

## The revised approach and its tradeoffs

| Boundary | Intended work | What success permits |
|---|---|---|
| Every PR | Lint/types/unit/structure/security; critical SQL/API and core browser journeys plus affected scope | Review and protected integration |
| Integrated main | Verify exact source, build selected artifacts, all fixture API/SQL and critical hosted-runtime preparation | Eligibility for approved synthetic staging work |
| Scheduled regression | Complete browser engines and broader account/outage/recovery matrix | Regression detection with explicit failure ownership |
| Customer candidate | Complete frozen local technical and browser regression with exact manual candidate purpose | Additional production source evidence B; separate hosted, rights and approval gates still apply |

The working selector now admits modifications to existing mapped feature components when their dependency boundaries remain unchanged, combines affected feature journeys, and retains core five-role English/Arabic/mobile Chromium coverage. Public interfaces, Auth, shared/server/SQL/worker/release changes, new files and unknown ownership broaden verification. This is conservative selection, not a proof that every possible transitive effect has been discovered.

Parallel runtime work is being implemented as two independent jobs. The backend lane owns its Docker database, setup, SQL/API/Edge checks and cleanup. The browser lane owns a separate environment, production build, selected browser journeys and cleanup. The technical aggregate must validate both exact-source, exact-attempt receipts before emitting its status. Neither lane can claim full acceptance alone.

```text
PR event
  +--> Fast checks ----------------------+
  +--> Security scans ------------------+|
  +--> Backend lane with its own DB ----+||
  +--> Browser lane with its own DB ----+|||
                                       vvvv
                              Required status collector
```

For serial work, approximate elapsed time is the sum of phase times. For parallel independent lanes, it becomes the longest lane plus setup/aggregation overhead. For example, hypothetical 18-minute backend and 12-minute browser lanes can overlap; they do not add to 30 minutes of elapsed time. This example is explanatory, not a measured prediction for Cuevo.

Isolation has a cost: each job may repeat some bootstrap or build work and consume more runner minutes. It avoids competing tests corrupting one mutable database. Caching can reduce dependency downloads and compatible build work; it cannot safely skip pending migrations or reuse dirty test state without an explicit contract.

The DORA continuous integration guidance recommends feedback in a few minutes and describes roughly ten minutes as an upper goal for the fast test suite. Cuevo's proposed 10–15-minute normal PR target is an optimization target. It is not a promise that all security, hosted or customer acceptance will finish in that time. The revised GitHub runtime has not yet been measured at this document snapshot.

Sources: [DORA continuous integration](https://dora.dev/capabilities/continuous-integration/), [working verification profiles](../../scripts/verification/verification-profiles.ts), [working check inventory](../../scripts/verification/steps.ts).

## How hosted installation should progress

The database comes first because the API needs schema and authorization, and the frontend needs a verified API. Each hosted milestone should survive later failure.

1. Freeze and independently review the exact source. Integrate through required protection and verify the integrated source's relevant checks.
2. Observe the actual Supabase target and its original migration/history/journal state. Prepare an exact effect package and obtain the existing founder approval for that package.
3. Apply only admitted pending migrations under verified TLS, a held operator lock and original durable intent. Verify actual history and grants. Never reset hosted staging as ordinary CI cleanup.
4. Install or reconcile the original fictional population and accounts. Verify exact identities and original receipts, not only table or user counts.
5. Deploy the Vercel API and Supabase Edge artifact with private runtime credentials. Keep worker dispatch inactive until prerequisite and private-access checks pass.
6. Verify authentication, denied access, private files/Realtime and current Data API configuration. Activate signed worker delivery through the approved owner.
7. Verify source processing, duplicate denial, recovery and the documented restore scope. Bind the admitted API origin and create the backend handover.
8. Deploy the web using that handover, then test the hosted five-role journey including Arabic/mobile. Customer acceptance and final approval remain separate.

```text
Reviewed source
  -> Installed schema
  -> Confirmed fictional accounts
  -> Inactive API and Edge deployment
  -> Private checks
  -> Activation and recovery proof
  -> Verified backend handover
  -> Frontend deployment and hosted journeys
```

The working repairs separate immutable population identity from the latest completed migration inventory. Empty pending stages emit revalidation NOOP proof, not an invented COMMITTED command. Partial schema work needs confirmed original stage coverage. Schema/account scope keeps runtime roles NOLOGIN; approved deployment creates one encrypted Vault credential record atomically with the two restricted LOGIN changes. Credential recovery checks restricted database role memberships and actual restricted TLS logins before returning saved passwords.

Provider operations keep ordered original phases: API settings, API deployment, Edge secrets and Edge deployment. Confirmed phases can be reused under fresh approval after provider observation. Lost settings acknowledgements may be reconciled using exact owned values/hashes. An unconfirmed upload cannot be repeated merely because a matching-looking deployment exists; original artifact/receipt evidence is required.

The active-runtime continuation is still unfinished. Partial-schema planning and native verification have passing controlled regressions, but their durable stage-receipt producer and preparation wiring are also still being completed. Current preparation assumes inactive dispatch/Cron; a successful activation changes that state. A later interrupted run needs durable original activation identity and a fresh approved recovery operation, without automatic key replacement or deployment. New-source active rollout also needs explicit upgrade/drain semantics. This remaining limit prevents a claim that the whole future-release architecture is complete.

Sources: [backend runner](../../scripts/verification/backend-release.ts), [migration owner](../../scripts/database/README.md), [installed receipts](../../scripts/database/hosted-installed-state.ts), [provider state](../../scripts/database/hosted-provider-state.ts).

## Recovering from a lost acknowledgement

Imagine the provider created one Auth account, but the response never reached CI. The account may exist even though the client saw a timeout. A new key and another create request are not safe recovery.

| Observed original state | Correct next step |
|---|---|
| Never attempted | Recheck current authority, retain intent, perform original operation |
| Intent with lost outcome | Read original target/receipt evidence and reconcile |
| Confirmed exact operation | Revalidate and reuse the original receipt |
| Different identity or conflicting target | Stop at review; do not overwrite or relabel |

A transactional database write can commit its source and receipt together. A Vercel upload, Supabase Auth call or Storage byte upload cannot join that same PostgreSQL transaction. External effects require a state machine and their own receipts. Even a well-designed process retains explicit unknown states.

An approval expiry limits permission for new work. It should not erase a completed historical effect. A new approval can authorize only the remaining work after current state is re-observed. It cannot restamp old receipts as newly executed or extend an old authorization silently.

## What to do with open pull requests

At this snapshot there are nine open PRs. Their existence does not mean nine independent pieces of missing application functionality. Inspect ancestry, exact diff, dependencies and unique work before deciding.

| PR group | Current disposition |
|---|---|
| 15 | Active architecture candidate; finish, review and verify here |
| 14 | Its source is included in 15; retain history and close as superseded only after corrected integration |
| 11 | Unique mobile, Arabic/focus and unknown-state UI work; preserve and integrate separately against the corrected baseline |
| 10 | Watchdog and CI protections overlap current work; verify every unique protection is preserved before closure |
| 3 to 6 | Noncritical dependency/action updates; defer during the release freeze and review individually |
| 7 | Node type major differs from pinned runtime expectations and had failed checks; do not merge blindly |

This is a reconciliation plan, not a claim that these PRs have been closed or merged. Keep commits reachable and preserve dirty working trees. Use one active release candidate to reduce conflicting source changes, but keep unrelated valid work for later integration.

Interview lesson: a large cherry count does not measure missing features. Cherry-picking is appropriate only after inspecting semantic overlap, order, conflicts and current tests. A green old PR can still be behind current main or fail after integration.

## What a good startup team would measure

Teams vary by product risk, size and available infrastructure. A common effective pattern is small PRs, fast mandatory feedback, isolated integration environments, artifact deployment, hosted smoke tests and broader regression outside every edit. Schools and minors require additional permission, privacy and product evidence.

Measure queue time separately from execution; record per-phase setup, SQL, API, build, browser and cleanup durations. Track p50 and p95 PR feedback, repeat/retry rate, flaky cases, time to recover failures, deployment frequency and recovery time. A passing retry does not diagnose the original failure. Preserve application defects, test defects and infrastructure failures as distinct categories.

Keep fixtures proportional to the question. Some Cuevo fixtures intentionally create large longitudinal or concurrency populations. Their setup cost should be measured separately from request latency. A slow data-generator setup is not proof the production endpoint is slow, and a fast unit test is not proof a real request meets its budget.

Scheduled regression also needs operating evidence. Cuevo's regression and missed-run watchdog share GitHub scheduling, so a scheduler outage can affect both. Passing source tests does not prove a scheduled run occurred or that a notification reached its intended recipient. Keep missed-run detection, failure ownership and actual notification configuration explicit.

Optimize one measured bottleneck at a time. Prefer exact affected selection, independent lanes, caching compatible inputs and meaningful smaller fixtures. Do not reduce assertion strength or increase timeouts repeatedly without understanding the work. A complete suite can remain expensive if it is run at the appropriate boundary.

## Interview answers you can adapt honestly

**Describe the architecture in ninety seconds.**

“Cuevo is a K–12 platform using a modular monolith with a worker. The web is Next.js, the API is NestJS with Fastify, and PostgreSQL on Supabase holds authoritative records. Protected operations verify current session, school membership, entitlement, role, relationship and object scope. Important source changes commit with audit and an outbox event. A signed bounded Edge adapter reuses the existing worker processor, and scheduled recovery handles lost wakes. The hosted plan uses Vercel for web/API and Supabase for data and Edge. I am learning from the implementation and release audit; I distinguish local evidence from hosted acceptance.”

**Why did CI take almost an hour.**

“The 7 October run had a 55-minute technical job and an eight-minute fast job. Broad runtime work was mostly sequential, and nearly every code change selected it. The repair separates fast checks, affected browser/API scope, independent isolated runtime lanes and full scheduled regression. I would measure the new critical path before promising a specific runtime.”

**Why not use the hosted database for all tests.**

“Tests need safe reset and deterministic fictional data. A disposable Docker database isolates failures and lets us replay migrations. Hosted tests still verify the real deployment, permissions and provider settings, but ordinary CI cannot reset hosted staging or customer records.”

**How do you avoid duplicate side effects.**

“Keep the original key, input fingerprint and receipt. If a timeout leaves the outcome unknown, reconcile that original operation against actual target state. Reuse a confirmed receipt, perform only unattempted work, and refuse conflicting or unproved effects. Database transactions and external provider calls have different atomicity boundaries.”

**Can you reuse PR tests after merge.**

“Only when the tested source and integrated source are proven equivalent for the evidence we reuse. A merge can change the tree through conflicts or a newer base. We still verify integrated source, build artifacts and run the affected checks required by policy.”

**Why choose a modular monolith.**

“A small team gets simpler local development, transactions and deployment coordination. Clear domain owners and package boundaries control coupling. Microservices should follow measured scaling, operational or team ownership needs, not a desire to appear more advanced.”

**What is still unfinished.**

“The published candidate's CI passed, but the next repairs are not yet a completed hosted release. Exact updated CI, active-runtime recovery, provider installation and hosted five-role acceptance remain separate work. I would not present passing controlled tests as evidence that a real school can use the app.”

Use first-person claims only for work you actually did. “I investigated,” “I implemented” and “I learned from the team's audit” describe different contributions. You can demonstrate strong understanding without inventing deployment or production experience.

## A practical learning plan

| Session | Exercise | What you should be able to explain |
|---|---|---|
| 1 | Read architecture and maps; draw request path | Each application and its authority boundary |
| 2 | Trace IdentityService and a protected domain command | Authentication versus current authorization |
| 3 | Read one migration and its SQL denial tests | Grants, RLS, constraints and migration history |
| 4 | Trace outbox claim/process/fail and Edge handler | Leases, idempotency and recovery |
| 5 | Read workflows and steps; calculate job durations | Workflow, job, step, runner and critical path |
| 6 | Trace original Auth/provider receipt recovery | Unknown effects and fresh approval |
| 7 | Explain a PR disposition and rehearse the interview answers | Source evidence, preserved work and honest limits |

Use read-only code inspection and controlled tests for these exercises. Do not run hosted migration, reset, Auth creation, secret or deployment commands as a tutorial. The real release owners and approved package control those effects.

## Further reading and source notes

Repository sources are the authority for Cuevo's product rules. External documentation explains the platforms and general practices; it does not override those rules. Provider documentation was checked on 7 October 2026.

- [Product context map](../product/context-map.md) and [codebase map](../codebase-map.md).
- [System architecture source 02](../product/platform/02-SYSTEM-ARCHITECTURE.md).
- [API and event contracts source 38](../product/platform/38-API-DATA-AND-EVENT-CONTRACTS.md).
- [Supabase and database source 40](../product/platform/40-SUPABASE-AND-DATABASE-SETUP.md).
- [Security test matrix source 61](../product/verification/61-SECURITY-THREAT-TEST-MATRIX.md).
- [RLS and grants source 81](../product/platform/81-SUPABASE-RLS-GRANTS-DATA-API-ARCHITECTURE.md).
- [Environments and secrets source 82](../product/platform/82-DEPLOYMENT-ENVIRONMENTS-AND-SECRETS.md).
- [Verification architecture decision](../decisions/2026-10-07-verification-profiles.md).
- [MVP exit criteria source 83](../product/overview/83-MVP-EXIT-CRITERIA.md).
- [GitHub Actions workflows](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflows).
- [Supabase local migration workflow](https://supabase.com/docs/guides/local-development/overview).
- [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations).
- [Supabase Vault](https://supabase.com/docs/guides/database/vault).
- [Vercel environments](https://vercel.com/docs/deployments/environments) and [Build Output API](https://vercel.com/docs/build-output-api).
- [DORA continuous integration guidance](https://dora.dev/capabilities/continuous-integration/).

The run durations come from official GitHub job start/end timestamps for run 37650482743 attempt 1. Release audit findings came from inspection of the published source and controlled reproductions, followed by owner tests of working fixes. Current uncommitted paths can change as remediation continues. No local check in this guide certifies hosted provider state, legal residency, official curriculum acceptance or customer launch.
