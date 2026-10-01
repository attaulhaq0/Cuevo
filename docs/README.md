# Cuevo documentation

For product requirements start with [product context](product/README.md) and its [task reading guide](product/context-map.md). For implementation navigation read [codebase-map.md](codebase-map.md). Root [AGENTS.md](../AGENTS.md) governs all contributors and agents; [repository-layout.md](architecture/repository-layout.md) governs placement/dependencies.

| Need | Read |
|---|---|
| Current scope, verified gates and blockers | [implementation-status.md](implementation-status.md) and [MVP gap audit](reports/mvp-gap-audit.md) |
| Source-of-truth product/domain/security requirements | [Product index](product/index.md), [context map](product/context-map.md) and [registry](product/registry.json) |
| Architecture and trust boundaries | [Repository layout](architecture/repository-layout.md), [domain ERD](architecture/domain-erd.md), [foundation threat model](architecture/foundation-threat-model.md), [stack ADR](product/platform/68-FINAL-TECH-STACK-AND-ADR.md) |
| Current design decisions | [decisions/](decisions/) |
| Verification evidence and review history | [reports/](reports/) |
| Implementation task designs/plans | [superpowers/specs/](superpowers/specs/) and [superpowers/plans/](superpowers/plans/) |
| Proposed Cuevo UI transformation | [Frontend and design proposal](superpowers/specs/2026-10-01-cuevo-ui-transformation-design.md) and [source inventory](reports/2026-10-01-ui-transformation-inventory.md); awaiting founder approval |
| Microsoft Foundry image design setup | [Labelled endpoint, deployment and local API key settings](design/foundry-image-setup.md); exact `gpt-image-2.5-sunburst` visual concepts followed by the existing React/TypeScript implementation |
| Image concept generation approval | [Five directions, including gamified and liquid material](design/2026-concept-generation-brief.md); ten light/dark images approved, visual selection and further sets remain separate |
| UI transformation acceptance and concurrent work | [Complete brief acceptance ledger](reports/2026-10-01-ui-transformation-acceptance-ledger.md) and [customer-readiness reconciliation](reports/2026-10-01-ui-concurrent-work-reconciliation.md); preserve the other chat's work and verify the whole brief |
| Approved ten-image exploration and role recommendation | [Generation evidence, visual issues and role composition](reports/2026-10-01-approved-ui-concepts.md); generated concepts await founder selection |
| Original source briefs and manifest | [product history](product/history/README.md); use current product entrypoints for navigation |
| Repository folder/copy hygiene evidence | [repository hygiene verification](reports/repository-hygiene-verification.md) |

Product sources are grouped under product; source identities/facts/versions remain unchanged. Historical reports and review hashes describe their original snapshots; use the codebase map and product registry to resolve former paths. A plan or report is not proof that the full MVP passed.
