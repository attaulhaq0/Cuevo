# Early 429 response headers implementation plan

> Execute inline in this authorized source unit. Root will arrange independent review; no child agents, commits or publication are authorized here.

**Goal:** Return existing sanitized budget refusals with the same Helmet, fixed-origin CORS and server correlation authority before parsing or protected work.

**Architecture:** Keep RequestBudget as the one first-onRequest count/decision owner. Store only its safe current-request refusal in a private WeakMap; existing Helmet/CORS hooks prepare headers and a final onRequest hook completes that refusal once. CORS delegation disables preflight completion only when this exact request is already refused.

**Tech stack:** Existing NestJS/Fastify, @fastify/helmet and CORS dependencies, TypeScript/Vitest; Node24.16.0/npm11.17.0 with process temp/cache on G:.

**Spec:** Founder/root-approved diagnosis at G:/Cuevo-workspaces/dependency-helmet/.local/early429-header-design/report.md, SHA256 f29e88707e43fd8a6de587d912a51f559bb7c88e98119b93916ec2d2022bb7df. Sources38/39/61 and API/platform ownership remain authoritative. This small plan carries its bounded specification below.

## Specification and limits

- Base c4e734d07b1484262bbedbc4b9fcc73baf3eeff2/tree2bfc6ccc10101d28318684829f86d6ff840e4780; preserve the separately published PR72/f63 branch and every old seal.
- Preserve first-onRequest decision, exact-request identity,600 read/120 write/3000 address/120 readiness counts,10000-key capacities, original hashes and60second windows. No shared route-config verdict or second charge/ledger.
- Preserve existing `/v1/` OPTIONS exemption, all-method readiness accounting, forwarded-IP refusal and liveness exemption. Rejected readiness OPTIONS must remain429 even when valid/malformed preflight would otherwise finish in CORS.
- Reuse the existing Helmet and CORS authorities. Preserve fixed approved origin, false credentials, exact allowed/exposed headers, server requestId, no-store, Retry-After60 and safe refusal body. CORS delegation's conservative Vary:Origin is expected and tested.
- Final refusal remains onRequest before preParsing/Auth/controllers/transactions. Ordinary401/403/409/503/400/413/404, normal204/invalid400 preflight and liveness remain covered.
- No frontend classifications, copy, journals, keys/payloads, manual retry or15second timers change. No DB/Auth/provider/native/browser/listener operation is authorized; controlled offline injection only. Actual hosted/browser cross-origin behavior remains pending.

## One coherent source task

**Files:** apps/api/src/app.ts composes the two phases and existing CORS options; apps/api/src/platform/request-limits/request-limits.ts owns counters and safe request-local refusal; apps/api/test/unit/request-limit-headers.test.ts exercises actual createApp; existing request-limits.test.ts composes the new completion surface while retaining all original assertions. API/platform READMEs and docs/codebase-map.md describe this existing boundary. Vitest's current API/unit glob discovers the new test without a new runner.

**Interface:** registerRequestLimits registers the decision hook and returns narrow exact-request `isRefused(request)` and `finish(request, reply)` operations. finish consumes the recorded refusal once without charging another budget. App's existing correlation hook invokes finish after Helmet/CORS; a fixed options-object CORS delegator returns preflight:false only for isRefused(request).

- [x] Write actual createApp regression cases before implementation. A denied read/write after the real default quota must have nosniff, fixed approved origin, no credentials, no-store, Retry-After60 and header/body correlation; counters must show no later parsing/identity/controller/database work.

```ts
const denied = await runtime.app.inject({ url: '/v1/me', headers: { origin: allowedOrigin, 'x-request-id': 'caller-controlled' } });
expect(denied.statusCode).toBe(429);
expect(denied.headers['x-content-type-options']).toBe('nosniff');
expect(denied.headers['access-control-allow-origin']).toBe(allowedOrigin);
expect(denied.headers['x-request-id']).toBe(denied.json().requestId);
```

- [x] Run the composed regressions against unchanged production source and retain expected RED assertions for absent headers. Guard actual fetch/listen/socket calls and use no configured DB/Auth credentials.
- [x] Implement one private WeakMap refusal phase in the existing budget owner. Keep RequestBudget and all decision predicates unchanged. Compose documented CORS options-object delegation and final onRequest completion without handwritten headers.
- [x] Retain original request-limit positive/negative assertions while updating their caller composition; add exact-request isolation/once-only completion and default quota/OPTIONS/source-phase cases. Run GREEN and ordinary HTTP/identity/denial suites.
- [x] Update existing owner/navigation prose; run relevant typecheck, lint, API build, architecture/docs checks and fixture tests. Freeze complete raw patch, full source manifest, commands/results and scoped author report for independent review.

No integration/hosted/browser acceptance, source publication or merge is part of this task. If main advances, retain these c4 results and inform root rather than borrowing another source's checks.
