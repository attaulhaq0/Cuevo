# Approved Trail colors and background

Founder approved on 3 October 2026: solid Royal blue primary actions, Pearl + blue edge selected controls, existing status badge treatments, and Midnight Trail for dark backgrounds. This is the current shared visual rule for all supported roles and feature sections. It supersedes preview alternatives; it changes no domain or curriculum authority.

## Interaction tokens

| Purpose | Light | Dark |
|---|---|---|
| Primary fill | #145FE3 | #145FE3 |
| Primary hover | #104DBD | #104DBD |
| Primary text | #FFFFFF | #FFFFFF |
| Primary boundary | #145FE3 | #8AB8FF |
| Selected surface | #FFFFFF | #203D64 |
| Selected text | #061957 | #EDF6FF |
| Selection edge | #1760D8 | #8AB8FF |

Use packages/ui/src/tokens.css semantic primary and selection tokens. Keep primary actions separate from generic accent/brand/status colors. Existing action-start/action-end compatibility aliases resolve to the single solid primary token, never a second gradient. Selected navigation buttons, pressed choices, tabs and selected task controls share the same Pearl material, 2px edge and persistent lower indicator. Keep explicit current/pressed/selected semantics, native labels and independent focus. Breadcrumb context remains readable text rather than a button surface. Disabled controls keep their existing neutral palette and 44px targets. Primary buttons use white labels in both schemes; the former dark on-accent text is unsuitable on Royal blue and remains a separate non-primary token.

Cuevo brand cyan #4FC0DB remains an identity/illustration accent. Do not use it as the solid selected-navigation fill or as a primary-action fill. Success, warning, unknown, denied and academic status labels/tones retain their existing owner meaning and current colors. The founder retained the existing status badge alternative; this approval does not authorize the other badge explorations or reinterpret every warning as failure.

## One background owner

Shared characters/ui exposes TrailBackground. It renders decorative material in the current workspace boundary, with CSS selecting the light or dark source before first paint. All role Homes use this same component for standalone stories; connected role Homes suppress their duplicate material so the shell owns one background. Do not reintroduce browser-theme initialization, a second canvas, arbitrary feature color filters or brightness dimming of the light image.

Light source: shared/characters/assets/trail-background.png; original SHA256 959324022fe2c03badbd1daa898acabda756e0282dbc28a8ab6a2b4ae94f40ee is preserved.

Dark source: shared/characters/assets/trail-background-midnight.webp, 1536×1024, lossless encoding of the approved Midnight review pixels. Raw image-model output and the reviewed PNG remain in external design evidence; the WebP pixels match the reviewed PNG exactly. The original high highlights were limited in linear-light luminance to protect text when cropped. Do not claim native 4K from this 1536px source. [Background provenance](../../apps/web/shared/characters/background-provenance.json) records hashes, size and processing.

Dark/System use the dark asset through the single CSS source token; Light/System-light use the unchanged light asset. No dark filter is applied. Opaque reading panels, text, control boundaries and current source limitations remain required. Authentication stays static/light; desktop/tablet retain the approved Learning Studio artwork, while mobile up to 767px restores the earlier compact one-Foxi welcome and pale-blue ribbon background as requested by the founder on 3 October 2026. Its primary action follows Royal blue; current form, icons, recovery and one-form composition remain unchanged. [Auth ownership and provenance](../../apps/web/features/auth/README.md) records this responsive rule.

## Verification and authority

Review actual dark/light/System renders, EN/AR, desktop/mobile/zoom, focus/disabled, selected states and source/error/unknown contexts. Compare the approved light background bytes and static authentication layout before/after. Use original owner actions, authorization and receipts; no database or API changes are required for this visual rule. A palette/story pass never establishes complete role/MVP/backend acceptance. The twice-daily QA automation should use this approved rule and never restore a rejected palette.

In forced-colors mode, decorative Trail backgrounds are hidden and native system Canvas/Highlight colors carry the interface. Explicitly selected buttons and their labels retain system Highlight/HighlightText without an opaque browser text backplate, including direct-text language/tabs. This narrow override preserves user high-contrast colors; it is not a blanket forced-color opt-out.
