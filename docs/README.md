# Cuevo documentation

For product requirements start with [product context](product/README.md) and its [task reading guide](product/context-map.md). For implementation navigation read [codebase-map.md](codebase-map.md). Root [AGENTS.md](../AGENTS.md) governs all contributors and agents; [repository-layout.md](architecture/repository-layout.md) governs placement/dependencies.

| Need | Read |
|---|---|
| Current scope, verified gates and blockers | [implementation-status.md](implementation-status.md) and [MVP gap audit](reports/mvp-gap-audit.md) |
| Source-of-truth product/domain/security requirements | [Product index](product/index.md), [context map](product/context-map.md) and [registry](product/registry.json) |
| Architecture and trust boundaries | [Repository layout](architecture/repository-layout.md), [domain ERD](architecture/domain-erd.md), [foundation threat model](architecture/foundation-threat-model.md), [stack ADR](product/platform/68-FINAL-TECH-STACK-AND-ADR.md) |
| Scalable event execution and full-app workflow progression | [Event-processing plan](architecture/scalable-event-processing.md) and [accepted worker direction](decisions/2026-10-02-event-triggered-worker.md); local execution verified, hosted/load gates pending |
| Current design decisions | [decisions/](decisions/) |

| Character Progression System | [Authorized modular foundation](architecture/character-progression-system.md), [decision](decisions/2026-10-03-character-progression-foundation.md) and [queued backend plan](superpowers/plans/2026-10-03-character-progression-foundation.md); existing XP reuse, school-approved levels, earned cosmetics and saved presentation, with implementation pending and payment/store excluded |
| Verification evidence and review history | [reports/](reports/) |
| CI/CD controls, reviewed release evidence and deployment boundaries | [CI/CD operations](operations/ci-cd.md) and [release decision](decisions/2026-10-02-ci-cd-and-release-boundaries.md) |
| Separate Cuevo hosted synthetic preparation | [Current project/readiness evidence](reports/2026-10-03-github-link-and-deployment-readiness.md), [release plan](superpowers/plans/2026-10-03-hosted-synthetic-release.md) and [Supabase owner request](operations/supabase-worker-owner-request.md); project creation does not imply deployment |
| PostHog QA/team/investor/institution analytics | [Current PostHog setup and operations](operations/posthog.md), [chart inventory](operations/posthog-charts.md) and [delivery/privacy decision](decisions/2026-10-02-posthog-current-repository.md); synthetic ingestion and current queries verified, legacy/GitHub/full-aggregate limits explicit |
| Independent customer/pilot acceptance work | [Customer-readiness QA](product/qa/README.md) and [findings register](product/qa/CUSTOMER-READINESS-FINDINGS.md) |
| Manual frontend MVP testing and developer browser commands | [MVP developer testing](mvp-developer-testing.md) |
| Closed-loop state transitions, root-cause checks and adversarial QA | [Closed-loop QA map](mvp-closed-loop-qa.md) |
| Implementation task designs/plans | [superpowers/specs/](superpowers/specs/) and [superpowers/plans/](superpowers/plans/) |
| Original source briefs and manifest | [product history](product/history/README.md); use current product entrypoints for navigation |
| Repository folder/copy hygiene evidence | [repository hygiene verification](reports/repository-hygiene-verification.md) |

Product sources are grouped under product; source identities/facts/versions remain unchanged. Historical reports and review hashes describe their original snapshots; use the codebase map and product registry to resolve former paths. A plan or report is not proof that the full MVP passed.
