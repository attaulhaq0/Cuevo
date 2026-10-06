# School campus and approved instruction support scope

Date: 2 October 2026. Owner: school operations; learner task consumer: school/ui public surface.

Campus records represent school operating context and versioned reviewed class placement. They are not tenants, academic programmes or access rules. Admin creates campuses and assigns classes with expected revision/confirmation; an active class must be moved before campus retirement. Immutable source histories and idempotent audit/outbox preserve the factual decisions.

Learning support/accommodation metadata is separate from identity, attainment, behavior and private pastoral records. A school approver records a plain instructional support title/text, exact learner/course/optional task, date window and explicit learner/parent publication. No clinical category, psychological inference, legal entitlement, curriculum allowance or grade threshold is generated. Current teacher authority permits required instructions; private approval reasons remain approver-only. Expired/revoked publication is hidden from learner/parent reads, while restricted staff history is retained.

Every protected support query selects a current authorized learner/course/programme/guardian and, for learner/parent use, a specific supported course/assessment with current published content. A general School panel does not enumerate pupil support. School TaskLearningSupport is a narrow public feature UI surface, reused by assessment composition without cross-feature internal imports. Source-specific events validate the approved object, actor and revision before acknowledgement. Raw support/campus histories are FORCE RLS with no runtime/Data API table grants.

Current school access mutation serialization precedes course/learner enrollment locks, keeping concurrent withdrawals separate from support approval. This establishes configuration authority only; it does not grant academic writes, model context or file access. Tests require exact source/window/role/current guardian denial, immutable source and actual UI publication/revocation.
