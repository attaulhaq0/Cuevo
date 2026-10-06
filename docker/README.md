# Container ownership

`Dockerfile` and root Compose remain the local source-runtime skeleton. They are not the compiled production artifact.

`Dockerfile.runtime` builds one explicit `SERVICE=api` or `SERVICE=worker` target. The final Node24 slim stage runs `/app/main.mjs` as `node`, installs only the artifact's exact locked production dependencies and receives credentials only at runtime. No tsx/TypeScript, authored application sources, tests, docs, raw seed SQL, synthetic identities or local secrets are copied into that stage.

```sh
docker build -f docker/Dockerfile.runtime --build-arg SERVICE=api -t cuevo-api .
docker build -f docker/Dockerfile.runtime --build-arg SERVICE=worker -t cuevo-worker .
```

The API includes only the manifest-locked curriculum files required by the current loader under `/app/supabase/seed/curriculum`. Its `golden-cases.json` is a required pack acceptance artifact, not executable test code. These technical synthetic packs retain their explicit rights/unknown/production limits; copying them does not authorize official or real-pupil operation. Worker has no curriculum files.

Supply the existing service-specific environment allowlists and deployment-approved database/Auth/Storage/provider configuration. The image performs no migrations, seed/bootstrap or policy approval. Readiness probes the service's actual `/health/ready`; start/health, native routes, source authorization and whole flows still require root's compiled-runtime verification and target-specific deployment approval. See [runtime artifact decision](../docs/decisions/2026-10-02-runtime-artifacts.md).
