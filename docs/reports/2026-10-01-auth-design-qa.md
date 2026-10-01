# Cuevo authentication design QA

Date: 1 October 2026 (Asia/Riyadh). Branch: `codex/cuevo-design-system`. Scope: authentication presentation in the isolated design worktree. **Current result: presentation, layout, build, structural and documentation verification pass. Desktop and compact mobile were compared with their selected concepts.** The approved composition is implemented; deliberate responsive, asset and functional-copy adaptations are recorded below. This is not a pixel-identical raster reproduction or protected sign-in acceptance. The shared whole-application design remains open.

## Approved targets

| Surface | Exact selected review artifact | Dimensions / SHA-256 | Intended composition |
|---|---|---|---|
| Desktop | Ignored `.local/design-concepts/auth-refinement/auth-senior-concept.png`; byte-identical to the founder approval image `C:/Users/hp/AppData/Local/Temp/codex-clipboard-0c314a8a-56a5-46e4-843b-2aed9fef8de8.png` | 1536x1024 / `f562e3d57bbeca0db6741fc349172cdc15c8e40759da94e9d59a392317e9cdc5` | Full-bleed 62.5% illustration / 37.5% white form. Official logo inside illustrated region; language inside white region; large navy heading, four horizontal learning stages, waving fox and role context. Open white form rather than a floating card. |
| Mobile A | Ignored `.local/design-concepts/auth-mobile/compact.png`; selected by the founder on 1 October 2026 | 1024x1536 / `cd39280b557dcfc9b41ebbe2af9aca22265dc2df81835c6846f5502acc796dad` | Compact brand/language row; one Welcome h1 and school-account guidance beside a small instance of the same fox; real form immediately below. No mobile learning diagram, role tray or duplicate desktop introduction. |

The portrait concept is a raster review frame designed for a logical mobile viewport around 390px. It is not a 1024px-wide production layout or a shipped form image. Compare desktop at the selected target viewport/state, and mobile at its intended responsive width/state; document any scaling used in comparison. Both surfaces omit visible company attribution while retaining E Deviser as company and Cuevo as product. Earlier desk-fox inspiration and mobile proposal B are superseded or unselected for this implementation.

## Implementation reviewed

The feature remains owned by [auth](../../apps/web/features/auth/README.md), with styles, English/Arabic messages and illustration composition beside it. Shared branding, locale/session and `@cuevo/ui` primitives retain their owners. Product sources [36 design](../product/design/36-DESIGN-CONSTITUTION.md), [37 viewport inventory](../product/design/37-UI-SCREEN-INVENTORY.md), [39 governance](../product/platform/39-SECURITY-PRIVACY-AND-AI-GOVERNANCE.md), [62 frontend](../product/design/62-FRONTEND-ARCHITECTURE.md), [63 accessibility/RTL](../product/design/63-ACCESSIBILITY-RTL-I18N.md) and [79 interaction](../product/design/79-UI-UX-MOTION-AND-INTERACTION-SYSTEM.md) continue to govern behavior and acceptance.

The inspected source implements larger desktop brand, headline, field-label/control typography and fox composition; controlled book/pencil/feedback/column-stage icons; the approved compact mobile header and welcome; semantic Sign in/Account help tabs with keyboard selection; associated email/password labels; password visibility; sanitized credential/service errors; and expandable device/privacy information. These are implementation facts, not a visual pass. The sole authentication method remains the existing school-issued email/password path. No signup, reset delivery, magic link, persistent-session checkbox, role chooser or fake successful authentication is introduced.

| Meaningful correction | Reason / required final evidence |
|---|---|
| Full-bleed split and larger hierarchy | Match the desktop target's navy brand/headings, readable labels and control scale, colored stage icons and larger waving fox. Check proportions, art/text clearance and input/CTA alignment in the final desktop capture. |
| Compact mobile A | Share one header row for brand/language, use one visible Welcome h1 and small fox, and remove duplicate intro/stages/roles on mobile. Check 390px and 320px in English/Arabic, including primary-action reachability. |
| Top-anchored normal flow | Header, story and form stay ordered when viewport height changes or help/privacy opens. No viewport-height centering should lift preceding content or place text behind artwork. |
| Heading line metrics | The tight desktop line spacing now reserves `.18em` below the heading for glyph bounds. Text-bound checks pass under native zoom and text enlargement; heading overflow is not hidden. Mobile uses a separate readable line-height and wraps long localized words. |
| Form intrinsic sizing | Earlier Arabic CSS zoom 2 expanded the implicit auto column from the CTA's min-content width. The form now uses `minmax(0,1fr)` and the CTA text has a shrinkable/wrapping span. Verify contained fields, text and password icons across native zoom, CSS zoom and text enlargement. |
| Safe form/help behavior | Pending submission prevents duplicate requests; returned failure clears the password while retaining email for retry. Account-help content explains school-managed access; privacy text keeps memory-only sessions and synthetic limitations truthful. Verify through the mocked error and keyboard journeys. |
| Arabic email text lane | A long LTR email previously overlapped the mail icon positioned by its RTL wrapper. Reserve physical right-side icon space in Arabic without changing the LTR email value. A new text-lane/intersection assertion failed before the correction and passed afterwards across the layout suite. |

## Source and derivative provenance

The selected concepts and standalone derivatives came through the authorized `gpt-image-2.5-sunburst` visual workflow. The background was generated separately using the desktop target as reference. The waving fox underwent model-assisted extraction/recreation, green-chroma rendering/removal, cropping and WebP optimization with alpha preserved. It is not a literal screenshot pixel crop or supplied student ZIP pose. Mobile reuses those derivatives; the compact concept is not a new runtime asset.

| Shipped asset | Dimensions / alpha | Verified SHA-256 |
|---|---|---|
| `apps/web/features/auth/assets/learning-background.webp` | 1536x1024; no alpha; no UI/text/logo/character/records | `dee70d1f94a40b5b404be177b2af6dd93b017ccd81d81451c1aef9c4800667a8` |
| `apps/web/features/auth/assets/welcome-fox.webp` | 634x807; alpha preserved | `8df7b8e23c364f30a60f9d22df1c172a03ed8320818461f0c21613e94b625db6` |
| `apps/web/shared/assets/cuevo-mark.webp` | 251x267; lossless crop/conversion of separately supplied official logo; alpha preserved | `04d2e37a7a8143bc02e22bdf85a3c02815c63e0f507d84b3d23e4838974cc70a` |

The original supplied logo PNG SHA-256 is `52a21c64517ffb17da9b574b717b941040880f0a0defed5f43c1c9e6d731004d`. Exact PNG intermediates and hashes remain documented in the [auth media README](../../apps/web/features/auth/assets/README.md); ownership and source decisions are in the [asset ADR](../decisions/2026-10-01-auth-presentation-assets.md). Hash equality and alpha metadata prove identity, not edge quality, fidelity or upstream redistribution rights. The supplied student-character ZIP remains a separate reference family.

## Verification ledger and limits

The independent preview uses the existing web app with explicit presentation-only public placeholder configuration on port 53112. Its provider/API endpoints are isolated non-live loopback placeholders. The auth reference suite mocks only credential/service errors and confirms that protected requests and successful school-access claims do not occur. It does not sign a real role into Supabase or exercise protected API/database policy. No database reset, customer-content mutation or protected runtime acceptance belongs to this report.

| Evidence | Current status | What it can establish |
|---|---|---|
| Desktop/mobile concept and shipped asset hashes | Verified against local files during report preparation | Exact target/derivative identity and inspected dimensions/alpha metadata. |
| Final desktop/mobile English/Arabic screenshots and source comparison | Reviewed with `view_image`; desktop capture 1536x1024, mobile logical390x844; same-size desktop comparison saved in ignored `.local/auth-final-qa/desktop-comparison.jpg` | Split, headings, form alignment, art scale/blending, palette, icon metaphors, role/stage context and responsive reading order inspected. Intentional adaptations below remain explicit. |
| `tests/e2e/auth-reference.spec.ts` | PASS: 6/6, 19.0s; `.local/auth-reference/run-2026-10-01T19-32-31-974Z/report/index.html` | Unauthenticated presentation, keyboard/labels/tabs, EN/AR1536/1440/1280/1024/768/390/640/320, 24 axe scans, image decoding, reduced motion, mocked failure/password-clear behavior and truthful disclosures. Mobile CTA visibility and pending access-help disablement are asserted. |
| `tests/e2e/auth-layout.spec.ts` | PASS: 10/10, 19.7s; `.local/auth-layout/run-2026-10-01T19-32-42-288Z/results.json`, zero skipped/flaky/unexpected | Anchored geometry, short heights, help/privacy expansion, long input values/resize, image alpha, breakpoint boundaries, text/icon lanes, CSS zoom, 200% text-only enlargement and native Chromium tab zoom85–400%. Native page zoom is distinct from equivalent viewport reflow or CSS zoom. |
| Fresh-tab console warnings/errors | PASS: fresh IAB tab7 had no warning/error entries after EN/AR inspection | Earlier transient image-write errors were confined to old-tab history; decoded assets and current browser/build evidence pass. |
| Unit, lint/typecheck/build and structural/docs guards | PASS: aggregate `npm run check`302Vitest +84web +4local-runtime, architecture13/repository22/docs6; later affected lint/typecheck/web build and guards pass | Bounded runtime/build/structural evidence, no DB/API integration or whole-product acceptance. Storybook build also passes with upstream Node deprecation/Next client-directive bundler warnings. |
| Real Supabase role sign-in, current membership, tenant/role/relationship/object authorization and DB/RLS | Outside this presentation verification | Require the existing independent foundation/API/deny/database journeys in their appropriate configured environment. |

Final reproducible images are under `.local/auth-reference/run-2026-10-01T19-32-31-974Z/screens`: English desktop1536x1024, Arabic full-page1536x1081 at a1536x1024 viewport, English mobile390x844 and Arabic390x858 at a390x844 viewport. The Arabic primary CTA is visible without scrolling; full disclosure content remains reachable. The test environment uses synthetic invalid credentials only. IAB captures remain supplementary and are not immutable hash references.

The prior IAB tab retained transient partial-image-write errors from18:38–18:44. Fresh-tab console health is clean. IAB viewport overrides later applied to the selected review tab inconsistently while multiple tabs were open; fixed-size comparison therefore used the existing isolated Playwright runner after IAB validation. The native1536x1024 capture is exact; no claim is based on the mislabeled intermediate browser captures. No blanket hydration/error suppression was added.

## Visual fidelity ledger and deliberate adaptations

| Inspected point | Final comparison / adaptation |
|---|---|
| Container and layout | Desktop keeps62.5/37.5 full-bleed art/white split with an open form. Compact mobile is a separate approved composition; enlarged Arabic may grow vertically in normal flow. |
| Typography and dimensions | Desktop navy two-line display heading, bold welcome,20px field/control text,60px inputs and68px CTA preserve target hierarchy. Mobile uses32px wrapping welcome,16px inputs,54px fields and56px CTA; its larger readable text wraps where the raster concept compressed a single heading line. |
| Palette and surfaces | Pearlescent blue illustration, white reading surface, navy text and blue/cyan action remain. The gradient is contrast-adjusted; raw bright cyan is not used as low-contrast text. |
| Assets and spacing | Official mark is preserved. Auth fox is a separately recreated alpha asset with closely matched face/clothing/pose; background is a standalone generated derivative. Pixel contours, ribbon curves and exact silhouette differ from the flattened concept. A mobile crop keeps the fox compact; it does not clip functional content. |
| Icons and learning stages | The user's follow-up rejected the earlier thin outline substitution. Book, pencil, message, rounded bars and role symbols now use a faithful filled vector family through the single `CuevoIcon` registry, with48px stage glyph space inside80px circles and filled24–26px role glyphs. Utility icons retain heavier20–24px outlines. Stage centers, tighter labels and two-line role copy were restored from the original reference. |
| Copy and interactions | Core headings, school-account guidance, tabs, labels, CTA and privacy title remain. Existing `you@school.edu` and shared-device sentence are preserved. The original visible school-contact sentence now appears in the functional access-help action, opening Account help; no unsupported delivery method is implied. The generated decorative slogan is omitted. |
| Responsive and accessibility | No mobile learning diagram/role tray/duplicate hero. Brand/language share one row, small fox sits beside one welcome block, then real controls. Inputs/password/help/privacy stay keyboard-reachable; EN/AR axes, long email, enlarged text and native zoom are verified separately. |

The copy comparison found no new unsupported authentication methods or claims. The above differences are intentional adaptations needed for existing functionality, accessible readable sizing and separable production assets. These do not erase the approved composition. Upstream raster asset rights and real role-authentication acceptance remain separate.

Runtime source hashes sampled after the passing suites:

| Reviewed source | SHA-256 |
|---|---|
| `apps/web/features/auth/components/sign-in.tsx` | `b50a50dce977c0b21d0a20de21dd38696cc29b384990529336a8b38b949e995e` |
| `apps/web/features/auth/components/learning-loop.tsx` | `3eeb239bbbde90f00061a28f7cc26ea874c5d7136b9c77ac19399ee28c35df83` |
| `apps/web/features/auth/styles.css` | `0969a4e7aff4ebf2b46e67ecd435aacc383e7ae55fc97e4d19ed5f160b0a862b` |
| `apps/web/features/auth/messages.ts` | `38680ddcb9ea907b198352863539e47e6525a91de76568be8ccdc56bf848abf0` |
| `apps/web/shared/components/brand.tsx` | `fc45c2cf4066e297e05418153dd6a9bed4d42c18c96a6a1937ba10c899e9c482` |
| `packages/ui/src/icon.tsx` | `bd9c7d6847415e8a2eb9d089087fcf88ffad197421aa5c7b848c8fe246d4b7e2` |
| `packages/ui/src/tokens.css` | `ee76b44f88f9871dcd6ca291c1343d5c2a999d5b5c5a30bf18ff7a26b2af99cf` |

Earlier iterations and diagnosed failures remain historical evidence. The final comparison and current checks establish this bounded authentication presentation result. They do not mark protected authentication, Gate5, customer/official readiness or the wider application design complete. OS scaling, mobile-device pinch zoom, password-manager overlays, physical-device virtual keyboards and non-Chromium engines were not exercised.
