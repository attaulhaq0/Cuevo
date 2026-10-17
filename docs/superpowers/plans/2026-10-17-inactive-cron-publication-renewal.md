# Inactive Cron publication renewal order

**Goal:** Allow the existing live native publication owner to refresh full evidence after an inventory read consumes its prior freshness, then enforce the unchanged30second/package/single-POST requirements.

**Scope:** Only `prepareNativeInactiveCronJournalPublication` in the existing database owner and its colocated offline regression. Sources38/39/81/82, the accepted event foundation and the [original231 append decision](../../decisions/2026-10-16-original231-transport-append.md) govern scope. Existing applied SQL, historical journals/identities and all hosted execution gates are unchanged.

**Evidence:** Original run38989953175 failed at JOURNAL with local owner733bytes/INTENT6889bytes and no CLI/SQL attempt. Fresh authenticated read-only root inventory found exact operation70e03d47... absent remotely,18 originals unchanged and231 migrations. The original first failing pre-POST substage remains UNKNOWN. The independent code defect is renewal ordering, not a cause inferred from total runtime.

- [x] Read the original result/intent, native/remote/durable publication order and separate read-only reconciliation; preserve the first failure and sealed proof candidate.
- [x] Exercise the actual publication function/private token registry and unchanged publication closure with a30,001ms-old observation. Verify RED refuses before full renewal.
- [x] Admit only the existing registered APPEND owner/live source/package/exact identity and payload before entering the full renewal. Keep its age/phase/earliest clocks, package expiry and single-use POST checks unchanged.
- [x] Verify GREEN; failed, stale, future, identity-drift, foreign-identity and expired-package renewal produce no POST.
- [x] Run focused database/remote/durable/contract checks, typecheck/lint and required architecture/docs/repository/CI guards. Obtain independent read-only source review, seal local unsigned source and hand it to root for reviewed signing.

No native PostgreSQL, server, scheduler, image, provider, approval or model call is executed by this repair. Local-only INTENT is not reconstructed authority; actual remote settlement and any separately permitted future release remain root-owned. The stopped hosted LIBPQ experiment remains held.

Verification:141 offline database/durable/remote/definition cases passed; typecheck and scoped lint passed; architecture17, docs7, repository25 and CI trust/193-source coverage passed. Independent read-only source review found no actionable issue and ran no native effects. These checks establish the bounded source repair; the original pre-POST failure cause and any actual hosted release remain unproved.
