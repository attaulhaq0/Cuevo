# Cuevo foundation verification

Date: 2026-10-01, Asia/Riyadh. Scope: repository/bootstrap, identity/tenant/reliability database, API health/current membership, bilingual responsive shell. The full MVP is not verified.

The initial workspace contained only specifications. The implementation uses npm workspaces, pinned Next.js 16.3.8, NestJS/Fastify, private Supabase Postgres and a separate worker health process. Local Docker ports and network preserve the unrelated existing stack. Supabase sign-in and /v1/me use real local Auth sessions and current stored memberships, not a demo role switch.

## Fresh verification evidence

- `npm run local:bootstrap`: clean migration replay and deterministic seed, constrained runtime credential setup, 133 synthetic Auth identities provisioned; exit 0.
- `npm run lint` and `npm run typecheck`: exit 0.
- `npm test`: 151 domain/config/API/worker tests and 11 web HTTP/auth categorization tests passed.
- `npm run db:test`: 4 files, 108 pgTAP assertions passed after clean replay.
- `npm run build`: API, Next and worker builds passed.
- `npm run storybook:build`: static component preview build passed; upstream bundler/Node deprecation warnings remain.
- `npm run e2e`: responsive login and five-role real authentication tests passed. Widths 1440, 1280, 1024, 768 and 390 checked; Arabic RTL, reduced motion and axe WCAG tags checked on login.
- Actual teacher desktop and Arabic/mobile screenshots inspected: no overflow. The foundation UI shows current membership and explicitly unfinished capabilities.
- Configured browser static bundle scan: zero matches for local service-role key or database connection secrets.
- `npm audit --omit=dev`: zero reported vulnerabilities.

## Review and recovery

Independent API review found idle pool-error handling, readiness and URL validation issues; targeted red/green fixes passed. Independent database review passed the foundation scope. Additional database regressions found and fixed NULL-input bypasses in command/retry helpers and implicit global function EXECUTE grants. Current tests cover session/relationship revocation, RLS/grants, immutable audit, fingerprint replay, outbox leases, bounded retries and rollback.

Browser automation used repository Playwright because the Browser plugin/skill is not available. No live academic source browsing or official curriculum content was added.

## Limits

The worker has a health service and constrained outbox interfaces; it does not yet process the learning loop. School/SIS mutations, academic release/evidence, habit/state, live AI, approval/intervention/outcome, community, Storage/Realtime and full five-role journeys remain later increments. No official curriculum or compliance claim is supported by these engineering tests. Official source packs and live AI provider/data policy remain external blockers. Docker deployment verification and remote development migrations are tracked separately.
