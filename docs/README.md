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
| Manual frontend MVP testing and developer browser commands | [Testing strategy and golden cases](product/verification/43-TESTING-GOLDEN-CASES.md) and [current customer QA](product/qa/README.md); the former developer-testing guide is not present in this checkpoint |
| Closed-loop state transitions, root-cause checks and adversarial QA | [Current customer-readiness acceptance](product/qa/CUSTOMER-READINESS-ACCEPTANCE-REPORT.md) and [technical loop evidence](reports/technical-loop-verification.md); the former closed-loop QA guide is not present in this checkpoint |
| Implementation task designs/plans | [superpowers/specs/](superpowers/specs/) and [superpowers/plans/](superpowers/plans/) |
| Selected Trail MVP redesign | [Safe all-role migration proposal](superpowers/specs/2026-10-03-cuevo-trail-mvp-redesign.md) and [student companion/growth strategy](superpowers/specs/2026-10-03-student-companion-growth.md); founder approved, shared foundation and all five pure Home views prepared, connected role/section migration and acceptance remain pending |
| Selected role body compositions | [Student, Teacher and Parent references](design/2026-10-03-approved-role-compositions.md); current header/assets retained, Teacher 29 and Parent 042–048 mapped to existing owners, with current-child/publication/contract limits and mobile acceptance; reference mapping is not implementation completion |
| Supplied visual reference archive | [Role/authentication originals and comparison rules](design/references/README.md), [manifest](design/references/manifest.json) and [archive decision](decisions/2026-10-03-design-reference-archive.md); founder requested repository storage for agent comparisons, with current data/MVP authority preserved |
| Expanded reusable artwork | [Trail asset library delivery and reuse](design/2026-10-03-reusable-trail-asset-library.md); authorized 200 icons and 200 consistent-cast poses, transparent PNG/motion exports, measured acceptance and one MVP asset registry |
| Earlier Cuevo UI exploration | [Historical frontend proposal](superpowers/specs/2026-10-01-cuevo-ui-transformation-design.md) and [source inventory](reports/2026-10-01-ui-transformation-inventory.md); approved authentication remains preserved, earlier workspace-selection status is historical |
| Microsoft Foundry image design setup | [Labelled endpoint, deployment and local API key settings](design/foundry-image-setup.md); exact `gpt-image-2.5-sunburst` visual concepts followed by the existing React/TypeScript implementation |
| Image concept generation approval | [Five directions, including gamified and liquid material](design/2026-concept-generation-brief.md); ten light/dark images approved, visual selection and further sets remain separate |
| UI transformation acceptance and concurrent work | [Complete brief acceptance ledger](reports/2026-10-01-ui-transformation-acceptance-ledger.md) and [customer-readiness reconciliation](reports/2026-10-01-ui-concurrent-work-reconciliation.md); preserve the other chat's work and verify the whole brief |
| Historical ten-image exploration and role recommendation | [Generation evidence, visual issues and role composition](reports/2026-10-01-approved-ui-concepts.md); the founder rejected this set; current workspace review is listed below |
| Revised agentic product experience | [New companion and helpful-workspace direction](design/2026-agentic-experience-direction.md); prior concepts rejected, broader approaches and complete role/section exploration authorized |
| Full role/section UI review | [Full-screen atlas](design/2026-full-screen-atlas.md) and [scalable complete LXP](design/2026-scalable-lxp-experience.md) |
| Supplied authentication and character direction | [MVP character use and K–12 growth](design/2026-character-mvp-and-growth.md) and [implementation plan](superpowers/plans/2026-10-01-auth-and-character-integration.md); current authentication refinement uses founder assets |
| Authentication desktop/mobile verification | [Approved authentication QA](reports/2026-10-01-auth-design-qa.md); presentation and layout evidence remain separate from real protected sign-in |
| Current parallel-work boundary | [UI reconciliation follow-up](reports/2026-10-01-ui-reconciliation-follow-up.md); isolated auth increment and source contracts to preserve before all-role integration |
| Complete UI continuation | [Design-system continuation](design/2026-design-system-continuation.md); remaining shared foundations, full role migration and supplemental future-LXP review families |
| Coordinated workspace visuals | [Generated workspace concept set](reports/2026-10-01-coordinated-workspace-concepts.md);34 primary and three foundation concepts, review boundaries and unresolved candidate issues |
| Original source briefs and manifest | [product history](product/history/README.md); use current product entrypoints for navigation |
| Repository folder/copy hygiene evidence | [repository hygiene verification](reports/repository-hygiene-verification.md) |

Product sources are grouped under product; source identities/facts/versions remain unchanged. Historical reports and review hashes describe their original snapshots; use the codebase map and product registry to resolve former paths. A plan or report is not proof that the full MVP passed.

Current [approved Trail colors and background](design/2026-10-03-approved-trail-colors-and-background.md) govern the shared palette and media.
