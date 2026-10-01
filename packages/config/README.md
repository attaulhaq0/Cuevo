# Server configuration

Public API: @cuevo/config through src/index.ts for environment validation. analytics.ts is a server-only minimized event mapper and is not an active PostHog delivery integration. Keep secrets, provider policy and server I/O out of browser/domain/contracts/UI imports. Tests live in test. New public package subpaths require exports plus architecture guard updates.

Intelligence configuration returns a typed DISABLED/FIXTURE/LIVE mode, provider/model, prompt/policy versions and timeout/token/cost bounds. AI_GENERATION_MODE=FIXTURE requires AI_FIXTURE_ENABLED=true, non-production and the documented loopback or Docker host gateway Auth port 56321. Production rejects fixture flags. Live configuration requires provider/model/key/data approval; the domain factory still needs an approved adapter. School purpose/action approval remains a database policy, never an environment shortcut.

Product source lookup: [task context map](../../docs/product/context-map.md); numbered IDs resolve through the product registry.
