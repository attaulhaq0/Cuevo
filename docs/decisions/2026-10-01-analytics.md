# Purpose-limited analytics

PostHog Cuevo project 393668 is verified in the Edeviser organization. The application has no configured capture key/host or school approval policy yet. Analytics remains disabled; no child content is sent.

Use explicit server event allowlists after successful domain events. Never send raw assessment responses, grades, message bodies, private notes, names, emails, prompts or direct school/student IDs. Tenant-bound HMAC pseudonyms need a server-only key and policy allowing collection. Person profiles are disabled with `$process_person_profile:false`; the browser has no analytics autocapture or session replay SDK. Pseudonymous events remain personal data subject to school/privacy requirements; this does not establish legal approval.

Current PostHog documentation confirms the Node SDK otherwise creates identified person profiles by default: https://posthog.com/docs/libraries/node#person-profiles-and-properties. Only minimal anonymous event properties are allowed here. Live ingestion/readback and delivery reliability remain unverified until configured. The pure analytics mapper tests do not imply a working remote integration.
