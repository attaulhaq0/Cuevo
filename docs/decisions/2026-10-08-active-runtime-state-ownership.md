# Pure active runtime state ownership

Status: bounded ownership correction within the authorized continuation work. Source verification does not establish hosted execution or acceptance.

The native migration database imported active runtime metadata from `backend-runtime-resume.ts`. That observer imports provider deployment, which imports the database owner, creating a database → observer → provider → database cycle. Reading a strict metadata projection needs no provider execution or native connection owner.

`scripts/database/hosted-active-runtime-state.ts` now owns the existing private/public schemas, credential-free Vault query, terminal original identity and cleanup matching, metadata reader and transition validator. Their guards and query bytes are retained. Private state still keeps the original signing key and optional runtime configuration; the public projection removes both. Changed original identity/key/configuration, fabricated cleanup and invalid transitions remain refused.

Database and release preparation import this pure owner directly. `backend-runtime-resume.ts` retains native TLS/lock/provider verification and private configuration retrieval, importing the same state owner and reexporting its previous public names for compatibility. This extraction creates no second state engine or receipt store and changes no activation, deployment, grant, retry or source approval behavior.

Pure schema/transition tests live beside the database owner and join required hosted-plan/replay/stateless discovery. Resume tests keep real pure validation at the explicitly controlled VM boundary and verify backward exports. Architecture checks require the dependency graph to remain acyclic. Original receipts and review scopes remain historical evidence; they do not independently approve this later extraction. Hosted/runtime/customer acceptance stays separate.
