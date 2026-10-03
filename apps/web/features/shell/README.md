# Application shell

Owns Application and Workspace composition, with public ui.tsx consumed by app/page.tsx. Shell may compose other features only through their ui/copy public surfaces. Common session/context, branding and locale live under shared. No other feature may import shell internals.

Product source IDs 36, 37, 62 and 63 apply. Browser journeys verify role navigation and app states. Keep route paths, CSS/token hierarchy, accessible landmarks, English/Arabic and current-role navigation stable. Navigation visibility is not backend authorization. Do not move feature policy or persistence into the shell.

tests/e2e/role-accessibility.spec.ts traverses current permitted navigation and read tabs for all five roles with real Tab/Enter input, visible focus and heading focus. It checks English/Arabic RTL at the five source37 viewport sizes, effective reduced-motion animation/transition durations, 200% zoom-equivalent reflow, AX names/landmarks/labels and axe. Offline/reconnect and injected membership failures verify protected presentation and recovery; actual API/SQL denial remains separately required. AX semantic smoke does not establish manual screen-reader listening. Ignored screenshots are stored under .local/technical-mvp-visuals/accessibility.

Responsive navigation styles belong to the global shell stylesheet. Feature styles do not override nav-item/sidebar__nav. A focused mobile navigation item scrolls instantly into the visible navigation area with logical spacing for its outline. Global document scrolling remains instant so keyboard focus does not wait for a decorative scroll animation.

The approved Trail preparation adds one pure `WorkspaceChrome` through this owner's public `ui.tsx`, with `WorkspaceChromeContext`, navigation/action types and the keyboard focus helper in `model.ts`. Its scoped `styles.css` owns the new horizontal chrome/mobile dock; the older sidebar remains the sole current runtime until the integration owner replaces its markup and removes obsolete global sidebar selectors. This is the owner-specific continuation of the earlier global stylesheet convention, not permission for another feature to override shell navigation.

`WorkspaceChrome` receives already permitted human-labeled navigation, a selected handle, exact callbacks, deterministic locale/theme/density, current school/person/role context and caller-supplied Brand/LanguageSwitch/context controls. It does not rebuild capabilities, query records, mutate domain/session state, write history, grant permissions or infer an authorization role. History/navigation intents, destination revalidation, heading focus and protected clearing remain with current `Workspace`/shared owners. No authentication/global CSS is edited.

One navigation DOM becomes a horizontally scrollable desktop rail and fixed mobile dock. Native Tab/Enter activation remains; optional ArrowLeft/Right/Home/End focus skips pending/disabled choices and respects RTL. Focus scrolls instantly within the rail. Overflow controls use a post-hydration resize measurement; server/client initial markup stays equal, with native scrolling available before effects. Controls have 44px targets and reduced-motion-compatible instant scrolling. Missing names/navigation render localized unavailable labels rather than internal IDs.

`workspace-chrome.stories.tsx` uses the actual component with illustrative permitted items only. Its Student/Staff/Parent/Arabic/Dark/Unknown/Pending previews do not establish real role eligibility. Unit tests cover one navigation list, meaningful labels, pending state, unknown selection, deterministic rendering and RTL/disabled keyboard focus. Root-owned real mobile/zoom/keyboard/axe/history/source/auth checks and sole-runtime replacement remain acceptance gates; do not publish the shell redesign as connected before that integration.

Desktop navigation has its own bounded vertical scroll area so all role actions remain reachable in shorter windows. The mobile rail continues to scroll horizontally. The customer primary-label traversal reproduced offscreen desktop account/access controls before this repair; final browser verification remains required.

The view query parameter records current workspace navigation through the native history API. Only current role/entitlement navigation choices can render; invalid or forbidden view values return to the overview. Browser Back/Forward and a later sign-in can recover the permitted view. Auth remains memory-only. Persistent status messages describe confirmed commands without copying protected work or primary identifiers.

Product source lookup: [task context map](../../../../docs/product/context-map.md); numbered IDs resolve through the product registry.

Offered destinations use the shared browser-safe prerequisite policy; learning/assessment/curriculum context dependencies and parent-excluded intelligence/development are consistent with destination APIs. Current revocation still removes protected reads independently of navigation.

Account composition consumes the school-owned `LearnerProfile` public UI. It does not assemble protected pupil context from unrelated queues or import school implementation internals.
