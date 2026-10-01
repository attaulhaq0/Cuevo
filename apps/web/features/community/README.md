# Controlled school community

Owns current class rooms/teacher-led groups, narrow room roster, persisted posts/replies/safe reactions, reporting/staff moderation/restrictions and approved announcements/notifications. Public interfaces: ui.tsx (CommunityWorkspace), model.ts (safe bounded projections), copy.ts (communityEn/communityAr). API owner: modules/community; sources 11/15/19/39/43/61/63/80 apply.

Parent queries are limited to explicitly approved current-child announcements/notifications. Room author names come from authorized community projections, never widened people/profile APIs. Student DMs/public profiles are absent. Staff actions require reason and explicit approval; mutations use the shared original-key journal and no offline queue. React renders message text, never imported HTML. Private realtime invalidation is composed through approved shared infrastructure; API reconciliation remains authoritative.

Parser tests live under test; browser journeys cover real class/group membership, reporting/moderation, parent visibility, Arabic/mobile/keyboard and revocation. Root registers public UI/styles and owns underlying grants/policies/realtime server configuration. No screen render substitutes for social safety acceptance.
