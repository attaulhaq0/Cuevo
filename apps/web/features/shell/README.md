# Application shell

Owns Application and Workspace composition, with public ui.tsx consumed by app/page.tsx. Shell may compose other features only through their ui/copy public surfaces. Common session/context, branding and locale live under shared. No other feature may import shell internals.

Product source IDs 36, 37, 62 and 63 apply. Browser journeys verify role navigation and app states. Keep route paths, CSS/token hierarchy, accessible landmarks, English/Arabic and current-role navigation stable. Navigation visibility is not backend authorization. Do not move feature policy or persistence into the shell.

tests/e2e/role-accessibility.spec.ts traverses current permitted navigation and read tabs for all five roles with real Tab/Enter input, visible focus and heading focus. It checks English/Arabic RTL at the five source37 viewport sizes, effective reduced-motion animation/transition durations, 200% zoom-equivalent reflow, AX names/landmarks/labels and axe. Offline/reconnect and injected membership failures verify protected presentation and recovery; actual API/SQL denial remains separately required. AX semantic smoke does not establish manual screen-reader listening. Ignored screenshots are stored under .local/technical-mvp-visuals/accessibility.

Responsive navigation styles belong to the global shell stylesheet. Feature styles do not override nav-item/sidebar__nav. A focused mobile navigation item scrolls instantly into the visible navigation area with logical spacing for its outline. Global document scrolling remains instant so keyboard focus does not wait for a decorative scroll animation.

Product source lookup: [task context map](../../../../docs/product/context-map.md); numbered IDs resolve through the product registry.
