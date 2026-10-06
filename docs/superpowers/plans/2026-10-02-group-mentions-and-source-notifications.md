# Current-member mentions and essential source notifications

Date2 October2026. Root authorized source15 group mentions and essential in-app community notifications; sources19/80/39/81/83 govern current safety/read states.

Add optional at-most-five unique explicit mentionActorIds to room post/reply contract, validated against current same-room member roster. Parents excluded, no externalfriend/publicidentity/arbitrary @text parsing. Immutable post mention links keyed school/post/recipient, created atomically with post/audit/outbox. Samekey replay rechecks current source/recipients before response and cannot insertduplicate links. Hidden/restricted/closed/revokedcurrent source no new mention delivery.

Notification source is exact permitted post+room, minimal bounded metadata title/author/date/currentsource status; unread receipt targets exact immutable mention link. Read first loads authorized exact post then explicitconfirm. Current school/member/relationship/entitlement and post visibility govern every list/source/read/replay; hiding/departure removesfuture notificationcontent/access. Parent never sees pupil mention. Delivery committedinapp only, outboxprivate invalidation has no body; configuredschool currentcommunityscope is lowrisk deterministic notification policy.

Existing announcement revision notifications keep their own identities/readledger. One community notification list projects both kinds with uniqueproperUUID link identities, truthful source type and exactsource route. UI named currentmember choices max5 beforepost, composerdraft/recovery exacttuple, recipientopenssource thenread, empty/denied/unknownEnglishArabicmobile/axe.

Tests: foreign/peer/parent/duplicate/>5/revokedrecipient deny beforeatomicpost, exactsource/noHTML, originalkey singularlinks, latehide/roomwithdraw/postreplysource/currentpolicyscope denial, recipient read and new post doesnot inherit. Root DB/runtimeonly after source review/promotion; no external sends and no consequentialAI.
