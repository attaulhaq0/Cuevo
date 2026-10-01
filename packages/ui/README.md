# Shared design system

Public API: @cuevo/ui for Button/Status, @cuevo/ui/tokens.css for semantic tokens. Component stories are colocated under src and previewed using apps/web/.storybook. No school-specific rules, server credentials or application imports belong here. Feature-specific UI remains in its owning feature. Preserve keyboard, reduced motion, Arabic/RTL and shared design tokens.

`CuevoIcon` is the controlled utility icon registry, with named metaphors, shared optical size/stroke and hidden decorative semantics. New names are added here rather than arbitrary feature icon imports. The supplied logo/reference establishes shared cool-blue canvas, navy typography, contrast-safe blue/teal actions, focus and controlled elevations; raw image colors are identity accents and never assumed contrast-safe body text. Disclosure summaries share visible keyboard focus with buttons/fields. All-theme whole-app migration is still open.

The approved illustration's book, pencil, feedback, rounded bars and role glyphs use `variant="filled"` in the same registry. These scalable vectors retain the reference's optical mass and silhouette; utility/form icons retain the controlled outline treatment. Semantic illustration colors are decorative accents with adjacent text, not contrast-safe body-text colors. Extend this family centrally instead of introducing a second icon library.

Product source lookup: [task context map](../../docs/product/context-map.md); numbered IDs resolve through the product registry.
