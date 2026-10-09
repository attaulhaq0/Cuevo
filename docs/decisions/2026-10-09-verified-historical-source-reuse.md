# Reuse the synchronous verified historical source capture

Status: implementation and local verification in progress. This change removes one immediate historical acquisition per affected preparatory path. It does not establish CI timing, hosted execution or customer acceptance.

Initial executor composition verified a prior schema prefix, then immediately read every blob of that same exact source/tree again to build its original source map. Canonical prior-receipt planning read and validated the original source, then repeated the same acquisition inside prefix verification. Neither duplicate crossed an await or effect boundary.

The migration-plan owner exposes `readVerifiedPriorSchemaSources`, which returns the actual historical bytes it just verified or null when no prior schema exists. It retains current repository checks, exact original tree/count, ancestry, replay boundary/order/hash and original 120-prefix reconciliation template semantics. The existing boolean `verifyPriorSchemaPrefix` delegates to it. A private pure row validator is reused only inside this owner for canonical planning's internally acquired prior rows.

The executor consumes the returned original rows once during initial composition. It retains every later physical/source, native lease/TLS, official approval, expiry, history and complete original-journal check. No caller supplies verified rows, and returned data grants no execution authority. No capture persists across a later operation or replaces a current observation; mutations of returned rows do not affect the next actual reader.

Actual Git tests prove current/prior acquisition count changes from three to two and executor initial historical acquisitions from two to one. Valid resumed and nonlexical NOOP paths remain covered, alongside absent/null compatibility, changed original source/tree/hash/count/order, same-count foreign ancestry, missing/changed template and returned-byte mutation denials. Single-batch transport evidence is retained separately; bounded source data reuse never becomes cached admission.
