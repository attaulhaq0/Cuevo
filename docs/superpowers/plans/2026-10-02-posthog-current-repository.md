# Connect PostHog to the current Cuevo repository

**Goal:** Revamp existing PostHog Cuevo project393668 for privacy-controlled QA/team/investor/institution reporting and prove current-repository ingestion without fabricating adoption or outcome evidence.

**Authorization:** Founder requested disconnecting the former application and configuring this repository end-to-end. Preserve historical data; disable former collection paths and distinguish current traffic. No paid product, external messaging, public sharing, real-pupil analytics approval or new live model call is authorized by this work.

**Sources:** Product02/11/38/39/42/60/65/77/81/82/83, root/scoped AGENTS, accepted scalable-event architecture, existing analytics mapper/fixture/SQL and current PostHog connector skills/docs.

## Design and ownership

Keep source/audit/outbox domain truth unchanged. Add a private, destination-specific PostHog receipt and explicitly approved all-synthetic school activation; fixture completion cannot count as remote delivery. Capture only completed allowlisted events created after activation. Fresh activation uses database current time, environment QA/DEMO/STAGING and a persistent pseudonym-key version; no history backfill or real-pupil activation.

The worker owns a portable minimized mapper and bounded HTTP transport. Both Node and Edge share one live delivery job using WorkerQueryPort. Each iteration claims one event with a30-second lease; a3-second request timeout and bounded SQL reserve prevent sequential batch lease expiry. HTTP acceptance gets a durable receipt even if policy changes in flight; new sends require immediate current-policy/all-synthetic revalidation. Uncertain HTTP/acknowledgment retains the same insert identity for retries. Unknown/missing/failed delivery never becomes success. Raw response bodies and credentials never enter logs.

Private database due-work detection and completion triggers wake the existing Edge adapter for analytics even after domain work drains. Disabled capture adds no remote calls. The fixed origin is https://us.i.posthog.com for this inspected project; reusable capture/project and pseudonym keys stay server-only. Shared event names/types use a narrow server-free @cuevo/contracts/analytics export; Edge packaging admits only that exact new shared input and still pins runtime dependencies.

QA diagnostics use fixed category/feature/status/timing/locale/viewport enums through a current-session authorized API endpoint, not DOM/raw console or replay. API validates active all-synthetic school and current analytics policy/activation before recording a bounded diagnostic event. Browser reporting is opt-in from the returned authorized configuration, nonrecursive, bounded, and canceled across session/actor/school changes. Important telemetry mutations use stable keys and audit/outbox; no invented error/learning events.

PostHog project keeps historical9 dashboards under legacy names and creates current focused QA/team/investor/institution views. Synthetic QA/demo is excluded from investor adoption; institution overview is internal aggregated evidence, not a multi-school public portal. Existing GitHub integration lacks attaulhaq0/Cuevo access and browser sign-in is pending. Removing app_urls alone does not stop old ingestion; verify a legacy event block and current-event acceptance separately. Source markers distinguish legitimate SDK versions but are not cryptographic authentication.

## Execution

- [ ] Root: inspect live settings/integrations/events/templates/catalog, save sanitized baseline, prepare changes and verify actual ingestion/legacy block.
- [x] Inspected live settings/integrations/events/templates/empty catalog; settings and standard-product source gate tested with actual current1/legacy0 paired probe. Complete legacy SDK/error ingestion and GitHub App access remain separate.
- [ ] SQL/delivery owner: write negative tests; append-only activation/receipt/source-eligibility/claim/ack/fail/due-work SQL; portable worker transport/job with retry/current-policy tests; update worker/config/runtime recipients/Edge build narrowly.
- [ ] Diagnostics owner: write contract/API/web negative tests; fixed-field diagnostics contract and current-session endpoint, using second append-only migration after delivery owner; update app composition and shared browser diagnostics.
- [ ] Root: independently review source/privacy/lease/revocation/Node/Edge boundaries; run migration replay, SQL/auth deny/integration/build and actual-user browser flow.
- [x] Focused review/replay/SQL64/authAPI2/build/worker74/frontend156/diagnostic browser passed. Actual signed Edge user loop35s/27 mutations passed;55 accepted/55 indexed unique receipts and privacy presence checks passed. Prior live failure remains history with unknown precisephase.
- [ ] Root: connect guarded ignored settings, approve only synthetic reference school through existing admin policy plus operator activation; send real saved user journey events, inspect PostHog readback and duplicate/privacy behavior.
- [ ] Root: provision current dashboards/event definitions/proposed metrics, run actual queries and verify empty real-adoption views remain honest.
- [x] Five current dashboards, event definitions, validated charts and five unapproved metric proposals created; real-only investor charts return no qualifying activity. No public shares/messages/invites sent.
- [ ] Root: update README/maps/scoped instructions/operations/current status, run architecture/docs/repository checks and appropriate aggregate verification. Report unresolved browser GitHub/legacy controls precisely.

## Review boundaries

Initial live project has app.edeviser.com, replay/console/performance/heatmaps enabled, GeoIP transformation, GitHub and Slack integrations, no warehouse sources and an empty governed metric catalog. Repository has no live capture implementation. Preserve external credentials, historic events and existing Slack authorization; do not send messages or activate scheduled subscriptions. Metric proposals remain unapproved until separate human promotion. No audit/outcome/official curriculum claim is inferred from event totals.
