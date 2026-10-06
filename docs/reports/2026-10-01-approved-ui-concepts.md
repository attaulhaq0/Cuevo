# Approved Cuevo concept generation: results and role recommendation

Date: 1 October 2026 (Asia/Riyadh). The founder approved the proposed ten-image set with “yes generate those so i can get back to you” and clarified that Student should be gamified while all other roles should be more mature. This report records design exploration, not implementation or customer acceptance.

## Actual generation evidence

The installed Image Gen CLI called the exact Microsoft Foundry deployment `gpt-image-2.5-sunburst` at the configured Azure resource. Ten single-image requests ran with quality `high`, size `1536x1024`, concurrency two and maximum attempts one. All ten completed successfully. Each saved PNG was opened, structurally verified and confirmed at the native dimensions. No extra generation or editing request was issued for this approved set.

The ignored `.local/design-concepts/approved-five-directions/approval-manifest.json` records exact prompts, prompt/image hashes and measured generation durations without credentials. The request/response timing is tooling evidence; it does not prove visual fidelity, role acceptance or live product data. The local settings file stays ignored; no credential was put into the browser/gallery or Git.

| Direction | Light duration | Dark duration | Saved native image pair |
|---|---|---|---|
| Precision Command Canvas | 66.3 seconds | 72.1 seconds | `precision-command-canvas-light.png`, `precision-command-canvas-dark.png` |
| Open Editorial Index | 63.5 seconds | 60.4 seconds | `open-editorial-index-light.png`, `open-editorial-index-dark.png` |
| Evidence Studio | 63.2 seconds | 72.3 seconds | `evidence-studio-light.png`, `evidence-studio-dark.png` |
| Gamified Learning Journey | 70.5 seconds | 72.0 seconds | `gamified-learning-journey-light.png`, `gamified-learning-journey-dark.png` |
| Liquid Material Workspace | 67.4 seconds | 67.4 seconds | `liquid-material-workspace-light.png`, `liquid-material-workspace-dark.png` |

All assets are under the ignored folder above. Five comparison sheets reuse the generated images and do not consume model calls. The local concept viewer runs on loopback port 53111, with an allowlist serving only the viewer and those ten public synthetic concept images. It cannot serve the nearby settings file, prompts, receipts or filesystem listings. The in-app browser verified direction/theme switching and full-size image links; the viewer was left on the Student journey light/dark pair. A separate interactive conversation diagram explains role layout choices and does not pretend to be the final product UI.

## Visual review and limits

These outputs are useful exploration but are not a 10/10 implementation specification. Review found:

- Several images add decorative school/Doha imagery and slogans absent from the requested copy. They must not become authoritative product imagery/copy or imply a real campus. The source context is synthetic.
- Several directions retain card-heavy compositions and large headings despite the open-layout/controlled-type brief. The final design needs edited density, fewer wrappers and a smaller title.
- Light/dark pairs change composition and copy as well as palette. A selected direction needs a coordinated final reference pair rather than implementing the divergent images independently.
- The gamified pair offers a clear path, but generic ordered stages, group-practice wording, formula illustration and current-step markers are not proof of actual curriculum prerequisites or completion. Real UI must derive available steps and recorded recognition from source data.
- Some icon families, accent mappings and footer/announcement labels are inconsistent. A controlled registry and truthful supported-language map remain required. “Official updates” and similar generated wording must be corrected.
- Liquid concepts place material/ambient effects on larger content areas than recommended. Keep readable content solid; use optical treatment mainly in header, palette, overlays and dock with effects-disabled fallbacks.
- All five comparisons depict the same student scope. They illustrate stylistic foundations; they do not verify Teacher, Coordinator, Parent or Admin workflows. Staff directories, grading/approval controls and private intelligence must remain outside student presentation.

These issues remain open for the founder's direction selection and subsequent approved refinement set. Do not silently generate corrections or declare a visual direction accepted.

## Recommended shared system and role compositions

Use one Cuevo token/component/theme/navigation system. Make Student motivating through journey structure and verified completion feedback; make staff and Parent calm through their task-specific hierarchy. Liquid appearance is an optional shared material layer, not a separate design system.

| Role | Recommended composition | Primary work | Feedback/motion |
|---|---|---|---|
| Student | Gamified Learning Journey on shared Precision foundation | Continue available learning, read own released feedback, complete approved practice, select meaningful work | Brief feedback for recorded completion/recognition; no invented XP, grade ranking, traits or prerequisite chain |
| Teacher | Evidence Studio | Current marking/attendance/support queue beside selected work, native result, evidence and explicit next action | Selection/detail disclosure; consequential review remains explicit |
| Coordinator | Structured evidence index | Current permitted class/programme context, bounded evidence, coverage/unknowns, observed outcomes and permitted programme review | Restrained context/detail transitions; review-only actions remain read-only |
| Parent | Open Editorial | Approved selected-child feedback, upcoming permitted work, approved portfolio and school context | Gentle reading/disclosure; no XP/internal habit/support/AI analysis |
| Admin | Precision Command Canvas | Current-school setup, verified relationships, policy and permitted controls in contextual forms | Confirmed form-state feedback with scope/consequences together |

Share cyan identity, typography, spacing, radii, icons, buttons, focus treatment, bilingual patterns, theme and status vocabulary. Do not branch business logic to create role-specific copies. Role surfaces already exist and must be composed through their public interfaces. Mature roles can remain visually warm without learning-game mechanics. Arabic/RTL, mobile/reduced effects and all-role real-browser verification remain open.

## Next approval boundary

The founder should select a direction or the recommended role combination. The next generation/edit set needs its own explicit surface/count approval before any API calls; visual selection does not permit unlimited variants. No UI implementation began during this exploration. The [whole-brief acceptance ledger](2026-10-01-ui-transformation-acceptance-ledger.md), [design proposal](../superpowers/specs/2026-10-01-cuevo-ui-transformation-design.md), [generation brief](../design/2026-concept-generation-brief.md) and [concurrent-work reconciliation](2026-10-01-ui-concurrent-work-reconciliation.md) retain the full objective and constraints.
