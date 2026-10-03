# Runtime credential recipients

Status: accepted implementation hardening under the customer-readiness objective. Architecture remains the existing modular monolith.

Original host development, configured web builds and browser verification inherited the full root environment into web/API/worker. Docker Compose already declared recipients separately. Browser serialization explicitly selected public settings, so the review did not establish a browser secret leak; broad process recipients still conflicted with least privilege.

Operator-owned `scripts/runtime/environment.ts` selects explicit per-service environments, excluding arbitrary values and NODE_OPTIONS. `dev.ts` starts installed toolchain processes; configured build/browser verification uses the same mapper. API and worker production parsers validate only their own required credentials. Worker fixture analytics has one canonical ignored root path, independent of npm working directory.

The environment mapper protects startup recipients, not a compromised host user or database authorization. Production secret manager, gateway, log access and privacy approval remain deployment requirements. Unit regressions reproduce unwanted distribution, required-consumer startup and path ambiguity before repairs; actual build/runtime verification is separately scheduled.
