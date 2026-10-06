# Cuevo hosting options: research, not a selected change

The founder requested a thorough comparison of hosting alternatives and Supabase advantages and disadvantages. This report is read-only research from official provider documentation accessed on 6 October 2026 and current Cuevo source. It changes no selected hosting provider, subscription, credentials, project, database, deployment, academic authority or frontend design. The active synchronized release and every-role acceptance goal remains incomplete.

## What must be hosted

Cuevo has one Next.js 16 frontend, one NestJS/Fastify API and one worker processor. The frontend has `output: 'standalone'`, so it can run on a compatible Node host; it is not presently a static export. The API has a Node entry and compiled container packaging, with a separate Vercel HTTP adapter. Supabase supplies PostgreSQL, Auth, private Storage and protected Realtime; the selected bounded Edge/Cron adapter reuses the worker processor.

Supabase Edge Functions can host complete custom REST APIs. Official routing examples include Express, Oak and Hono; official dependency guidance supports npm modules and Node built-ins. That makes an Edge API credible, not prohibited. The existing Nest/Fastify composition has not been proven to deploy unchanged to the hosted Edge runtime. Decorator compilation, dependency bundling, raw request/response behavior, verified TLS and pool lifetime, current-session/actor transactions, binary files, rate limits and every protected workflow require a compatibility proof. No conclusion about its final Edge bundle size follows from the current Node dependency directory size.

Supabase's automatic Data API is separate from custom Edge handlers. Enabling table/RPC exposure would alter the accepted disabled Data API boundary and would not automatically replace Cuevo's current command, session, tenant, relationship, audit or original-key behavior. This report does not recommend that shortcut. The provider's custom-domain documentation explicitly says it is not intended to enable frontend hosting through Edge Functions; the current Next.js application still requires a frontend host.

## Published price examples and migration implications

Prices are USD before tax unless stated otherwise, and are examples rather than capacity or final-bill promises. Totals assume one Supabase Pro project at its published $25 starting price, one developer for Vercel, two web/API services where applicable, and the current Edge worker within included usage. Extra compute, bandwidth, builds, registry, monitoring, email, AI and other add-ons can change the bill. School production capacity remains unmeasured on these alternatives.

| Option | Published starting resources and example total | Advantages for this code | Costs and limitations |
|---|---|---|---|
| Vercel Pro web/API + Supabase Pro | Vercel $20 + Supabase $25 = $45 base | Smallest change; existing web/API targets and artifact runner; managed Node and Next.js deployment | Usage and extra developer seats can add cost. Hobby is restricted to personal non-commercial use, including the frontend. |
| DigitalOcean App Platform web/API + Supabase | Two fixed 512 MiB services at $5 each + $25 = $35 entry example; two fixed 1 GiB services at $10 each + $25 = $45 | Managed Node/container services; preserves application owners; OS maintenance handled by provider | The smallest services have one instance and no autoscaling. 512 MiB capacity is not verified for Cuevo. New deployment/secret/CORS/rollback integration is needed. |
| Railway web/API + Supabase | Pro $20 minimum usage with $20 credit + $25 = $45 minimum; Hobby $5 minimum is an entry tier, not a complete two-service estimate | Straightforward Node/container monorepo services; elastic resources and team tooling | Measured RAM, CPU and egress determine actual bill. Published Pro tier targets production teams. No verified Cuevo resource estimate yet. |
| Render paid web/API + Supabase | Two 512 MiB services at $7 each + $25 = $39 before workspace upgrades; a $25 Pro workspace makes this $64 | Familiar managed services, HTTPS, health checks and container deployment | Entry RAM unverified; workspace price is separate from compute. Free web services sleep after 15 idle minutes and Render advises against their production use. |
| Fly.io web/API + Supabase | Regional per-Machine charges; current documentation example lists a Singapore 1 GiB shared CPU Machine at $8.50/month, so two plus Supabase is about $42 before other usage | Runs existing containers; regional placement and flexible machine sizes | More operational/networking choices; region, outbound traffic, IPs and additional instances affect price. New organizations do not receive historical free allowances. |
| Google Cloud Run web/API + Supabase | Usage-based; request-based tier has a monthly free allowance, with no honest fixed Cuevo total before measurement | Existing containers, managed scale-to-zero/autoscaling, strong cloud identity and rollout tooling | Billing setup, registry/build/egress charges and concurrency/pool tuning; cold starts when scaled to zero. Warm minimum instances cost money. |
| Small VPS with web/API containers + Supabase | DigitalOcean example: 2 GiB/1 vCPU $12 + $25 = $37; 4 GiB/2 vCPU $24 + $25 = $49 | Low predictable compute price; existing Node application; keeps database managed | Team owns OS patches, firewall, HTTPS/reverse proxy, deploys, monitoring and recovery. One VM is a single failure point; minimum resources are not capacity acceptance. |
| Cloudflare frontend + Supabase Edge API/worker | Workers Paid minimum $5 + Supabase $25 = $30 published floor, before extra services/usage | Potentially low runtime cost and fewer API hosting recipients; edge/CDN delivery | Both existing API and frontend require compatibility work. Cloudflare's current Next.js guide recommends beta vinext; OpenNext is separately documented. Neither exact Cuevo stack is accepted on this path. |

Moving only the API away from Vercel does not resolve commercial use of a frontend still on Vercel Hobby. Conversely, keeping both applications on a compatible Node/container platform avoids rewriting academic or permission rules. Domain placement and networking may change; the Cuevo UI need not change.

## Supabase as more of the backend

Advantages:

- Database, Auth, Storage, Realtime, custom functions and Cron can share one provider/project setup.
- PostgreSQL and existing SQL authority remain reusable; an Edge port need not invent a second domain engine.
- Pro includes 2 million Edge invocations; overage is currently $2 per million, separately from other usage.
- npm and Node built-ins are supported; complete custom REST API examples are documented.
- Functions can be invoked near the database for workflows with multiple database round trips.
- Pro starting price includes one Micro compute instance through a $10 monthly compute credit, with daily database backups retained for seven days.

Limitations:

- No intended host for this Next.js frontend; an additional frontend host remains necessary.
- Current Edge limits are 256 MB memory, 2 seconds actual CPU per request, 400 seconds worker lifetime on paid plans and a 150-second response idle timeout. Waiting for network/database I/O is excluded from the CPU figure. These limits do not mean every database request must finish in two seconds.
- Current live limits distinguish a 20 MB CLI bundle from a 5 MB server-side API/Dashboard bundle. Exact bundled compatibility must be measured. One MCP search returned stale counts; the report prioritizes current direct official HTML/Markdown for volatile limits.
- Cold starts, database connection budgets and region placement still need tuning. An edge endpoint does not move the primary database globally.
- Supabase does not implement Cuevo's school/role/relationship/object/session rules for us. Account and data access controls remain our responsibility.
- Database backups exclude Storage object bytes and custom-role passwords; private-file backup/recovery is an additional responsibility.
- Customer invitation, password-reset and email-link delivery need a configured production SMTP service. Supabase's default mail delivery is explicitly best-effort for non-production exploration; pre-created password accounts do not establish those email journeys.
- Point-in-time recovery, additional projects/compute, selected custom domains, usage and support/compliance features can add cost. Pro is not an all-in institutional compliance or availability certification.
- The Pro spend cap covers selected usage items; explicitly provisioned compute and certain add-ons are excluded. It is not a maximum total invoice.
- The current Cuevo database is in Singapore. A new frontend/API region would not change that data location; school residency requirements must be assessed against actual provider/data placement.

## Recommendation

For the fastest first release, retain the existing Vercel targets on an appropriate commercial plan and finish the Supabase-first workflow. For a managed alternative, compare a measured DigitalOcean App Platform or Railway deployment using the same web/API source, rather than choosing a minimum RAM price without a load test. For the lowest predictable server price, a VPS is a valid trade only when someone owns its maintenance and recovery.

Supabase Edge for the full custom API is a valid cost/consolidation candidate. Test the existing framework and critical permission/file/transaction paths first, then decide whether a small adapter suffices or a larger HTTP-layer migration is needed. Do not assume a complete rewrite is required merely because Deno differs from Node; do not assume unchanged deployment is proven merely because npm imports work. Preserve one frontend/API/domain implementation and existing database/worker authority.

No option fixes the current empty hosted schema by itself. Every option still needs original migrations, native identities/reference population, restricted runtime connections, source-matched CI and real hosted end-to-end verification. Paid AI/provider execution and customer acceptance remain separate.

## Founder follow-up: free MVP and Microsoft Foundry

The current Vercel Functions documentation confirms Hobby can technically run full Node APIs within its usage/resource limits; the commercial-use policy is a separate requirement. A private personal non-commercial prototype may use Hobby, while merely calling a business product an MVP or delaying payment does not establish an exemption. Cuevo is intended to be marketed and piloted with institutions for business use, so the recommended hosted plan remains Pro unless the provider confirms a different eligible arrangement. Local testing does not require a Vercel subscription.

Microsoft Foundry supplies models, agents and AI tooling. Its available hosted-agent capabilities are not proof that an existing Foundry resource hosts Cuevo's general Next.js/NestJS application. Azure App Service supports web applications and REST APIs including Node.js/custom containers; Azure Container Apps supports containerized HTTP/API and background workloads. Either is a credible later host for the retained application, using the same backend/database authority. Supabase can remain the database/Auth/private-file provider and Foundry the separately governed AI provider. Existing Foundry access does not prove permission, capacity, subscription credits or payment coverage for those Azure hosting resources; migration and CI/CD/source/region/secret verification remain necessary. No Azure host or paid service was created.

The founder clarified that the offer is **Microsoft for Startups, $100,000 credits**, not a stated Foundry-only allowance. This is founder-reported eligibility/amount, not authenticated billing evidence. General eligible Azure sponsorship usage can cover application hosting, managed PostgreSQL, Blob Storage and supported AI services under the linked subscription; credits are not inherently limited to Foundry. The official sponsorship offer excludes support plans, third-party branded products, Marketplace purchases and separately sold items. It ends at the invitation's usage cap or end date and describes conversion to pay-as-you-go; verify the actual subscription, balance, expiry and applicable offer before provisioning. Do not assume credits pay the external Supabase or Vercel invoice.

This makes Azure-hosted frontend/API plus retained Supabase a financially credible first-MVP alternative if actual sponsorship and resource permission are confirmed. Replacing Supabase entirely is a larger migration: Azure PostgreSQL, identity, private file and Realtime/job equivalents must preserve all current application/session/SQL authority. Foundry is the AI part rather than that complete backend bundle. No migration is selected by this clarification.

Latest founder constraint: do not purchase Vercel Pro now; compare only Vercel versus Supabase API hosting for the current MVP and consider Azure later for institutional deployment. This is a request for an honest recommendation, not yet authorization to port the API or deploy contrary to provider terms. Vercel remains the lower-adaptation fit for the existing NestJS/Fastify Node application and prepared HTTP artifact, but runtime compatibility does not establish hosted acceptance or commercial Hobby eligibility. If a paid Vercel plan is excluded for a hosted business pilot, a Supabase Edge compatibility exercise is the viable candidate within the two permitted API providers. Its npm/Node support and complete REST examples are credible; exact API/transaction/file/current-session parity must be proven before selection. The current frontend's separate Vercel Hobby commercial restriction remains even if the API moves. Preserve localhost testing and the existing Azure migration option; no new subscription or automatic runtime rewrite is authorized.

Final founder selection after this research: retain the existing Vercel frontend/API hosting for **private personal/internal team testing now**, with Supabase unchanged, no Pro purchase and no API runtime migration. Later institutional/commercial hosting remains a separate decision. Continue actual protected staged provisioning and source-matched functional/visual testing under that internal purpose; this is not approval to broaden usage or a claim that the hosted MVP is ready.

## Official sources

- [Vercel pricing](https://vercel.com/pricing), [Hobby commercial-use rule](https://vercel.com/docs/limits/fair-use-guidelines)
- [Supabase pricing](https://supabase.com/pricing), [Edge pricing](https://supabase.com/docs/guides/functions/pricing), [current Edge limits](https://supabase.com/docs/guides/functions/limits), [dependencies](https://supabase.com/docs/guides/functions/dependencies), [complete REST API routing](https://supabase.com/docs/guides/functions/routing)
- [Supabase custom-domain frontend limitation](https://supabase.com/docs/guides/platform/custom-domains), [backups](https://supabase.com/docs/guides/platform/backups), [regional invocations](https://supabase.com/docs/guides/functions/regional-invocation), [regions](https://supabase.com/docs/guides/platform/regions), [shared responsibility](https://supabase.com/docs/guides/platform/shared-responsibility-model)
- [Supabase production SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [spend-cap coverage](https://supabase.com/docs/guides/platform/cost-control)
- [DigitalOcean App Platform pricing](https://www.digitalocean.com/pricing/app-platform), [Droplet prices](https://www.digitalocean.com/pricing/droplets)
- [Railway pricing/plans](https://railway.com/pricing), [measured resource rates](https://docs.railway.com/reference/pricing)
- [Render pricing](https://render.com/pricing), [free-service limitations](https://render.com/docs/free), [regions](https://render.com/docs/regions)
- [Fly.io pricing](https://fly.io/docs/about/pricing/)
- [Cloud Run pricing](https://cloud.google.com/run/pricing), [autoscaling and cold starts](https://docs.cloud.google.com/run/docs/about-instance-autoscaling)
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [current Next.js path](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/), [OpenNext alternative](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/), [Node HTTP differences](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/)
- [Vercel current function limits](https://vercel.com/docs/functions/limitations), [Microsoft Foundry overview](https://learn.microsoft.com/en-us/azure/ai-foundry/what-is-azure-ai-foundry?view=foundry), [Azure App Service](https://learn.microsoft.com/en-us/azure/app-service/overview), [Azure Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/overview)
- [Microsoft for Startups Azure credit activation](https://learn.microsoft.com/en-us/microsoft-for-startups/benefits/azure), [Azure Sponsorship offer and exclusions](https://azure.microsoft.com/en-us/pricing/offers/ms-azr-0036p/), [Azure PostgreSQL](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/overview), [Blob Storage](https://learn.microsoft.com/en-us/azure/storage/blobs/storage-blobs-introduction)

Local ignored research receipts retain requested URLs, response status, time and relevant text. Failed/404 paths were not treated as evidence; current official paths above were checked. These are documentation and source findings, not an executed hosting benchmark or legal opinion.
