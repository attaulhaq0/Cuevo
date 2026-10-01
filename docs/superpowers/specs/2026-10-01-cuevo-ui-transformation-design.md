# Cuevo UI transformation proposal

Date: 1 October 2026 (Asia/Riyadh). Status: proposed; awaiting founder approval. This implementation design does not replace numbered product sources or establish feature/customer acceptance.

## Confirmed frontend

The repository uses Next.js 16.3.8 App Router, React 19.3.0, TypeScript 5.9.3, ordinary CSS stylesheets with semantic custom properties, Lucide React 0.577.0, and the existing `@cuevo/ui` workspace. Tailwind 4.3.3 is installed; current rendered styling is principally ordinary CSS. Storybook 10.6.1, Playwright 1.63.0 and axe are already available. Continue with this stack and the current build/toolchain.

## Goal and scope

Apply the founder's complete UI/UX brief to every existing Cuevo role and supported workspace through one shared design system. Preserve protected API contracts, current source/evidence semantics, role distinctions, native academic scales, human approval and uncertain command recovery. The initial deliverable for review is the real React/TypeScript shell, theme and representative home/workspace surfaces in the isolated checkout; continue across all existing screens after that visual checkpoint.

The recommended visual-concept method is the existing React/TypeScript application and Storybook. This avoids a separate preview framework or additional service dependency. Image generation is optional for this code-native application UI. The founder must approve this method because Image Gen was previously selected but the tested Foundry `gpt-image-2` deployment is absent.

## Visual direction

Use a cool light canvas, solid white content, deep blue-charcoal typography and quiet separators. Dark mode uses deliberately chosen deep blue-black surfaces with readable text and subdued borders. Cyan `#4FC0DB` identifies actions and selection; primary cyan buttons have a dark foreground. Accessible derived cyan colors serve text and focus on light surfaces. Preserve visible non-color state indicators.

Use a modest page heading, clear section headings and readable metadata. One shared spacing/radius/elevation/type scale governs every screen. Retain the existing font stack initially; verify Arabic typography and line length before adding a font dependency. Material effects belong to the header, command dialog, popovers and mobile dock; main content stays solid. Honor reduced motion, reduced transparency and forced-color preferences.

Create semantic light/dark token families in the existing `packages/ui/src/tokens.css`. The current semantic color names may remain compatibility aliases while consumers migrate; they must resolve to the same active system. Theme preference uses a non-sensitive cookie with Light, Dark and System choices. Server markup and a small pre-paint system-theme resolver prevent the wrong theme flashing. No authenticated record or command payload is persisted by this mechanism.

## Shared components and ownership

Expand the existing `@cuevo/ui` public API with controlled icons, buttons, field styles, contextual tabs, material surfaces, accessible dialog/command anatomy and reusable empty/error/loading/list/table treatments. Add a primitive when a supported workflow uses it; do not build empty future component families. Keep existing Button and Status imports compatible. Centralize Lucide selection and optical/stroke defaults in this package.

Feature-specific information, data hooks, forms, copy and domain review controls remain beside their owners in `apps/web/features`. Shared browser theme/session/API/form mechanisms remain in `apps/web/shared` and never import feature implementation. The shell composes documented feature public interfaces. Extract cross-feature presentation currently owned by learning CSS into the shared system and remove duplicate active rules in the same change.

## Navigation and command home

Remove the permanent sidebar. Provide one quiet global header with brand, current authorized school context, a visible command search, existing announcement access, English/Arabic, theme and profile controls. Show the current school truthfully: multiple-school selection is presently unavailable and must not become a decorative selector.

Home prioritizes current role actions, their explanation and evidence. Add an open workspace launcher with appropriate grouping and varied row/list compositions. Use actual permitted destinations and existing domain projections; do not invent dashboard totals or academic percentages. Role home continues to derive bounded action queues from its existing APIs.

Each workspace has home/context navigation, title, description, contextual tabs/filters and its real primary action. Keep client navigation within the verified session so memory-only authentication survives transitions. Preserve browser history and destination-heading focus during navigation. A mobile dock provides Home, command search, applicable actions, approved announcements and profile access without a mobile sidebar.

The command dialog searches bilingual permitted workspace/action labels, with keyboard selection, Escape, focus containment and focus return. Object lookup uses an existing bounded authorized collection only when the public contract supports it. Empty matching means no match in the available permitted context. The catalog never crawls every pupil collection to manufacture global search. Consequential commands open the current object-aware review/form rather than executing approval, grading, access changes or sharing from a menu selection.

## Truthful supported destinations

Learning, assessment, curriculum, operations, community, portfolio, development, progress, improvement and account/access already exist. Students can use the existing authorized people/class/learner context appropriate to the role. Reports use the current selected-learner native report and bounded class evidence; CQI means the existing closed support/outcome loop. Settings consists of supported account/theme/language and authorized school policy controls.

Full-text global object search, universal notification inbox, direct messaging, full report builder and school accreditation/quality workspaces are absent or beyond the MVP. Their names in the brief do not authorize invented functionality or fabricated data. The existing approved-announcement notifications must be described as such.

Derive visible destinations from actual API-required capabilities: progress requires learner-state entitlement; improvement requires improvement entitlement; academic endpoints may require both assessment and curriculum. Parent access remains approved selected-child context without habit/signal/proposal/support internals. API/database enforcement stays authoritative.

## Isolation and integration

Worktree: `C:/Users/hp/.codex/worktrees/cuevo-design-system/Cuevo`, branch `codex/cuevo-design-system`, starting commit `946cca0`. The other active customer-readiness chat owns the dirty `G:/Cuevo` checkout. Do not message/interrupt it, change its files, reset its synthetic database, rotate its credentials or occupy its runtime ports.

Begin with isolated web/Storybook component previews. Running current role flows for screenshot audit requires an independently provisioned synthetic runtime when necessary; normal bootstrap scripts target fixed root ports and must not be run blindly. Keep generated runtime configuration, credentials and screenshots ignored. Reconcile the other chat's completed changes explicitly before integrating; this branch must not overwrite newer customer-readiness behavior or primary labels.

## Verification and completion

Audit rendered current screens before each major migration. Verify all five roles in English and Arabic/RTL, both themes, at 1440x900, 1280x800, 1024x768, 768x1024 and 390x844, plus 200% reflow. Check controls, empty/loading/error/denied/offline/unknown states, duplicate/missing human labels, focus, keyboard command behavior, contrast, reduced motion, touch targets and axe.

Run existing web/domain tests, typecheck, lint, configured web and Storybook builds, critical browser journeys and the relevant deny/API checks in an independent synthetic runtime. Run mandatory architecture/docs/repository guards and their tests. Adapt navigation selectors while retaining all-role and protected-scope coverage. A rendered screen or passing unit test alone does not establish completion. Record remaining factual/source limitations without promoting fixtures to official/customer readiness.

## Governing evidence

Root README/AGENTS/START-HERE, product context map, repository layout and scoped web/owner instructions govern this work. Product source pack is `FINAL-2026-10-01`; primary UI sources are 36, 37, 62, 63 and 79. Sources 00/01/39/43/61/77/83/85 govern scope, privacy, verification and claims alongside each affected domain source. See the [discovery inventory](../../reports/2026-10-01-ui-transformation-inventory.md) for exact baseline role/capability and missing-feature evidence. Rendered audit remains pending approval and independent runtime availability.
