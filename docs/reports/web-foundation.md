# Cuevo web foundation evidence

Date: 1 October 2026. Company: E Deviser. Product: Cuevo.

## Implemented scope

`apps/web` contains the Next.js 16 application manifest/configuration, server root layout and public metadata, client authentication/session provider, English and Arabic dictionaries, Cuevo sign-in and session-bound foundation workspace. `packages/ui` contains shared semantic tokens, Button and Status primitives.

The root layout reads only the explicitly named publishable browser configuration: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_API_URL`. The authentication client refuses missing configuration and keys without the `sb_publishable_` prefix. It does not use the Supabase Data API for domain data.

Authentication uses real Supabase `signInWithPassword`. The current access token reaches `GET /v1/me` as a Bearer token. The initial request has no school header; after a verified membership, revalidation sends the resolved `x-school-id`. The response is runtime-validated against the five lowercase roles and the matching school object. A mismatched or malformed response never enters the workspace. Navigation and copy derive from the verified response; there is no role selector.

The foundation shows real school membership and assigned entitlements. Learning, assessment, evidence and intelligence are accurately marked as in development. It does not present fabricated results, activities, metrics or curriculum readiness claims.

The page handles not-configured sign-in, incorrect credentials, unavailable authentication, authorization denial, expired session, multiple-school memberships, malformed API responses, dependency outage, loading and offline states. Server messages are not displayed; safe localized messages and request IDs are used. Returning online or focusing the window revalidates access, with an additional 60-second membership refresh. Auth callbacks are synchronous; API fetching occurs outside them.

Browser integration exposed an authentication classification bug: Supabase returns `422 / email_provider_disabled` when the email provider is disabled, which the original HTTP-status heuristic incorrectly presented as a credential error. The shared pure classifier now recognizes only `invalid_credentials` as that branch. Provider/configuration errors, unknown codes, rate limits, HTTP 5xx and network failures use the unavailable-service message; internal provider messages are never displayed.

English and Arabic use typed dictionaries. A non-sensitive locale cookie determines server-rendered `lang`/`dir`; switching language updates both immediately. Shared tokens, logical CSS, bidi isolation, mirrored direction icons, semantic landmarks, visible focus, labeled native forms, associated credential errors, keyboard buttons, live status and reduced-motion support are implemented. Desktop sidebar becomes a three-item bottom navigation on mobile. Protected content is never cached offline.

## Verification performed

- Membership behavior was tested with a real local HTTP server. The initial five tests failed against the empty implementation, then passed after implementing validation/fetching. The expanded seven cases pass: invalid roles, malformed/mismatched school, valid empty entitlements, token forwarding/first request, sanitized denied-versus-outage errors, multiple-school requirement, later school-bound mismatch, and non-JSON success rejection.
- `node --test apps/web/test/membership.test.ts`: 7 passed, 0 failed.
- `node --test apps/web/test/auth-error.test.ts`: 4 passed, 0 failed. The three regression branches failed against the previous status heuristic before the code-based fix. Tests cover disabled provider 422, rate limits, service/network failures and precedence over inconsistent credential codes.
- `node node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json`: exit 0.
- `node node_modules/eslint/bin/eslint.js apps/web packages/ui`: exit 0.
- `npm run build -w @cuevo/web`: exit 0, Next.js 16.3.8 production build, dynamic `/` and `/_not-found` routes.
- Static browser chunks scanned for credential patterns. One prefix-only `sb_secret_` occurrence belongs to Supabase SDK key-type detection; no private key value or server environment identifier was found. Build occurred before local environment configuration, so a second configured bundle scan remains required.
- `node node_modules/storybook/dist/bin/dispatcher.js build --config-dir apps/web/.storybook --output-dir apps/web/storybook-static --disable-telemetry`: exit 0 with Storybook 10.6.1. English/Arabic Button and Status stories use the production tokens and CSS. Upstream Next `use client` directive, Storybook manager chunk-size and Node 26 deprecation warnings were reported; no build failure. Generated output remains in the web workspace after automatic approval review rejected its cleanup as blocked by policy; the parent infrastructure should ignore this generated path.

## Remaining verification and limitations

The parent agent owns the shared browser session. No browser tool was used by this worker. The parent reports responsive and Arabic/RTL sign-in checks passing with no automated accessibility violations; this worker has not independently inspected those browser artifacts. Live local Supabase login and `/v1/me` positive/denied/revoked flows, keyboard smoke, reduced motion and zoom checks remain for the parent verification record.

This initial preview uses `persistSession: false`. Supabase tokens, selected school and membership are held only in memory; reloading the page requires sign-in again. No protected data is stored in localStorage/sessionStorage. A future scoped session design should establish an approved server-cookie/SSR strategy before claiming durable login.

An account with multiple current school memberships receives an explicit selection-unavailable state. The API cannot provide an authorized school list yet, so no school is guessed. The local synthetic fixture has one membership per ordinary user.

Storybook configuration and primitive stories are implemented after root dependency installation. They are internal component previews and do not model protected academic data. School setup, learning, marking, evidence, approval, outcome and parent-child journeys are outside this foundation; none is marked complete. The foundation does not satisfy Gate 4 or Gate 5.

## Suggested parent browser checks

Sign-in: verify `School email`/`Password` labels; native validation; keyboard submit; password visibility control; wrong credentials; unavailable service; repeated submit; no entered password retained after request. Switch to Arabic before and after sign-in and check document direction.

Workspace: sign in using a synthetic account for each of admin/coordinator/teacher/student/parent; verify the server-selected role, school and display name. Use Overview, Access details and Account; refresh access; sign out. Revoke membership and refresh/focus to verify the workspace is cleared. Disconnect/reconnect network and confirm protected data is hidden until access is revalidated.

Layouts: 1440×900, 1280×800, 1024×768, 768×1024, 390×844 and 320px where feasible, English/Arabic, keyboard, 200% zoom and reduced motion. Verify bottom navigation does not cover content and no page-wide horizontal overflow occurs.
