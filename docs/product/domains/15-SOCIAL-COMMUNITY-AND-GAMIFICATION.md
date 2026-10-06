# Social, Community and Gamification

## Purpose

Make Edeviser interactive and human without becoming an unsafe social network.

## Student community

### MVP
- class discussion
- teacher-led groups
- school announcements
- safe reactions
- replies
- mentions within group
- reporting
- moderation
- notifications

### Post-MVP
- student-created study groups
- clubs
- project spaces
- peer tutoring
- richer media

## Chat model

Potential scopes:
- teacher ↔ student
- teacher ↔ group
- students within an approved class/group
- parent ↔ school staff

Do not allow cross-school messaging.

Student-to-student direct messaging should be disabled by default in MVP; use moderated group discussion.

When enabled later:
- school policy
- age/group rules
- report/block
- audit
- rate limits
- attachment restrictions
- moderation pipeline
- guardian/school controls where legally/policy appropriate

## Moderation

Automated moderation can flag content for review.

Do not automatically determine serious safeguarding conclusions from a model.

Human staff remain responsible for escalation decisions.

## Groups

Group fields:
- school_id
- type
- name
- owner
- join_policy
- member_policy
- visibility
- start/end
- moderation_policy

## Gamification

### MVP
- XP
- streak
- achievements
- class challenge board
- optional leaderboard

Points can be tied to:
- practice
- revision
- reflection
- constructive community contribution

Never tie XP directly to grades.

## Leaderboard principles

- opt-in
- class scoped
- learning-behaviour points only
- student can hide their position
- no “worst performer”
- no academic grade ranking
- reset by period
- accessible alternative: personal progress view

## Social UX

Use familiar social affordances:
- avatar
- reply
- reaction
- thread
- group
- notification

But maintain a school-first visual language rather than copying consumer social networks.

## Character Progression System — authorized foundation, 3 October 2026

The founder authorized a bounded modular foundation extending current XP/streak/milestone recognition with numbered levels and next-level progress, character evolution, earned cosmetic grants and saved permitted presentation choices. This is requested implementation, not a claim that those new capabilities already work. The [foundation contract](../../architecture/character-progression-system.md) and [decision](../../decisions/2026-10-03-character-progression-foundation.md) specify ownership, versioning, private authority and acceptance tests.

Reuse the existing Development domain and immutable verified practice/revision/reflection XP ledger. School-approved policy versions configure point values and level/milestone rules without school-specific code or historical award repricing. Progression thresholds have one versioned rule owner. The optional class-period leaderboard remains separate from school-scoped cumulative progression and durable cosmetic ownership; do not create a global child score or cross-school history grant.

Only deterministic authorized source processing may create earned level/evolution/cosmetic receipts. Character/equip selection changes presentation only and never awards XP, changes grades, grants learning/help access or diagnoses maturity/emotion. School stage mapping uses explicitly approved actual year-group context, not inferred age or personality. Unknown/disabled/unconfigured/partial values remain explicit and nullable. Period reset cannot silently erase valid prior cosmetic grants; source correction preserves append-only provenance.

Base character, compact/quiet and no-character choices retain equivalent learning and recognition. Additional approved characters/costumes use versioned asset catalogs and grant/presentation rules. Private learner progression, staff scope, parent exclusion, current revocation, idempotency, audit/outbox, English/Arabic RTL and reduced-motion verification remain required.

This foundation does not include paid shop, wallet/currency conversion, checkout, advertising, randomized purchases, reward boosts, unrestricted social features or general live student tutoring. Later adult/institution cosmetic commerce needs separate approved contracts and cannot affect points, native attainment, permitted work or ordinary encouragement.
