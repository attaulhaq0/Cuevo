# Local runtime verification

Status: all three local Docker images built, started healthy, and passed configured database/Auth connectivity checks. Nonroot and secret exclusion checks pass. This is a synthetic local environment, not a hardened production release; worker processing was not configured in this image snapshot.

## Changes

Local host URLs and Docker URLs are generated separately. `DATABASE_URL` and `WORKER_DATABASE_URL` retain loopback for terminal development. `DOCKER_DATABASE_URL`, `DOCKER_WORKER_DATABASE_URL` and `DOCKER_SUPABASE_URL` use `host.docker.internal`, preserving the dedicated API and worker role identities. Compose adds the host-gateway mapping for Linux and uses the existing external `cuevo-local` network, avoiding allocation of an exhausted default Docker subnet pool on this host.

Compose reads variables through `--env-file .env.local`; it does not pass the complete file into every container. The API receives only its database connection, Auth URL/publishable key and browser origin. The worker receives only its worker connection. The web receives no database or service-role credential. Public browser Auth/API settings are web build arguments because Next.js public configuration is compiled at build time. They must be rebuilt when browser endpoint configuration changes. All published app ports bind host loopback. API/worker readiness healthchecks require working local dependencies.

The Dockerfile pins Node `24.16.0-bookworm-slim` and installs npm `11.17.0`. Install uses `npm ci --ignore-scripts` and explicitly executes the reviewed esbuild `0.28.2` binary installer; arbitrary dependency lifecycle scripts and Scarf analytics are skipped. Lockfile install-script dependencies inspected were esbuild, Scarf and optional macOS fsevents. All remain pinned in the repository lockfile. The final image runs as `node`, with `init`, dropped capabilities and no-new-privileges in Compose. Web runs its generated standalone server with static/public assets copied. API and worker currently execute TypeScript through tsx and carry development dependencies; image reduction and compiled deploy entrypoints are later release hardening.

The supplied Compose file intentionally declares API/worker `NODE_ENV=development` for loopback HTTP Auth in this local synthetic environment. The application production parser still requires complete configuration and HTTPS browser/Auth origins. No production rule was relaxed. This Compose file is not a production deploy specification.

`local:bootstrap` intentionally resets synthetic local data. It checks the configured project is `cuevo`, API port `56321`, database port `56322`, then verifies CLI-reported loopback URLs and the PostgreSQL admin database before reset. It does not accept a remote or linked target. This advertised reset must not be run alongside active local work that needs its data. Config module imports are side-effect-free; credential provisioning runs only from its main entrypoint. Existing malformed/unreadable credential files fail rather than causing silent rotation.

## Evidence

Before the change, a real Compose render reported API database hostname `127.0.0.1`; an assertion expecting container host access failed. After the change, runtime URL generation and rendered Compose checks passed for host/container addresses, constrained role names, minimal environment boundaries, no service-role key in any runtime service and the external network. Checks project only public metadata and never print credentials.

`node --import tsx --test scripts/local-runtime.test.ts`: four tests pass, exercising the actual repository config, rejected foreign project/ports, runtime role URL generation and remote/legacy target denial. The scripts passed targeted ESLint and root TypeScript checks. The bootstrap was not run during this task because the root agent had active database/browser verification; guard checks do not invoke service mutations.

Executed API image build:

```text
docker build --file docker/Dockerfile --build-arg SERVICE=api --tag cuevo-foundation-api:local .
  exit 0; workspace TypeScript build passed
```

A container test checked `process.getuid() !== 0`, absence of `/app/.env.local`, and absence of `/app/.local/runtime-secrets.json`: all passed. Image Config.User is `node`. The build context excludes local credentials through `.dockerignore`. BuildKit did not support `--network cuevo-local`; ordinary Docker build used the builder's network successfully without allocating a new application network.

A real Linux image API creation test executed the source runtime through tsx and the Nest/Fastify HTTP adapter. `/health/live` returned 200 and `/health/ready` returned 503 with database/Auth configuration intentionally absent. The runtime closes cleanly. This verifies the image can boot the API and fails readiness closed; configured Docker-to-Supabase connectivity remains a later check.

## Commands and remaining validation

After existing browser work finishes, regenerate ignored environment configuration with `npm run local:configure`; this uses the existing local secrets and enables the new Docker URLs. Then use:

```text
docker compose --env-file .env.local config --quiet
docker compose --env-file .env.local up --build -d --wait
docker compose --env-file .env.local down
```

Terminal `npm run dev` and Compose use the same app ports; stop terminal app processes before bringing up Compose. Supabase is separate and should remain running. Stop/down commands must not use volume removal or unrelated stack targets.

The API image snapshot built during this task precedes ongoing school/learning implementation; rebuild the final source state before treating Docker deployment as verified. Web and worker builds/startup remain required. CI now pins Node/npm, follows the same lifecycle-script policy, invokes local guard tests, checks code/build, bootstraps and tests synthetic Supabase, runs browser tests, and builds all Docker images. That Ubuntu workflow has been written but has not run on GitHub, and therefore is not a passing CI claim.

## Subsequent three-image build

Executed `docker compose --env-file .env.local build` after the numeric academic review correction; exit 0. API/worker TypeScript builds and Next.js 16.3.8 production build all passed. Images were built from HEAD `3ea5822` plus then-current uncommitted school/academic source, including the approved-reference marking correction. Later frontend pagination changes were still in progress, so this is not an exact-commit release claim.

Image IDs:

- API: `sha256:5f29ee721f7a5df7660596ed31b73dbb8b5435cba184aded202f0b3db91b2f81`
- Worker: `sha256:b18602800a58c5efc6edfdb1275dc16bb2d96700b5b2d2ca4aec14b062868646`
- Web: `sha256:b2887eee4a940af6fa816105ae4501edfb8e8fca2827699203abdc29032d7052`

Each image was executed separately with a Node assertion verifying nonzero UID, Config.User `node`, absence of `.env.local`, local runtime secrets and synthetic account credentials, and absence of service-role/OpenAI environment values. All three passed. Actual Compose rendering confirmed API/worker role names, host.docker.internal database/Auth addresses, and no service-role key delivery to runtime services; values were not printed.

The parent reports GitHub CI run `36794876955` succeeded at commit `3ea5822`, including Docker builds. This report's independent local evidence is the three-image command and assertions above; hosted CI result is parent-provided evidence. Starting the built application services is pending because terminal development currently owns their ports. No Supabase reset, migration, stop/start or credential modification was performed during these image checks.

## Running-container connectivity

After the parent stopped terminal development, it executed Compose `up --no-build -d --wait`. Independent inspection confirmed `cuevo-web-1`, `cuevo-api-1` and `cuevo-worker-1` all healthy, using Config.User `node` on `cuevo-local`, with no service-role/OpenAI key environment entries. Published app ports remain host loopback.

Actual host HTTP checks returned web 200, API `/health/ready` 200 with `{status:ready,database:true,authentication:true}`, and worker `/health/ready` 200 with database true and `processor:not_configured`. The API's readiness runs from inside its container, proving its constrained role connection and Auth URL reach the separate local Supabase services.

Real synthetic teacher, student and parent accounts signed in through local Supabase Auth; their Bearer tokens were sent to the running Docker API `/v1/me`. All three returned 200 and the expected actor UUID, current school and role. Only role/status metadata was emitted; tokens/passwords were not printed. No academic/domain command, schema mutation, reset or Supabase service restart occurred in these checks. The sign-ins create ordinary local Auth sessions.

The parent will inspect the Docker browser flow and then return to terminal development for subsequent worker implementation. Rebuild after newer source changes; this snapshot's processor remains intentionally unconfigured and does not claim the learner-state or signal loop.

Browser/environment URLs and publishable keys are public build inputs; secret database/Auth/Admin credentials remain ignored local setup data. Production secrets, deployment region approval, backup/recovery operations and live AI integration are outside this local runtime increment.
