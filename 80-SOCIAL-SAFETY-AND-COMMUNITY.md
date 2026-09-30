# Social, Community and Gamification Safety Specification

## Product goal

Make Edeviser socially engaging without turning it into an unrestricted social network for minors.

## MVP capabilities

- class discussion rooms
- teacher-led groups
- controlled student peer discussion inside school scope
- safe reactions
- teacher announcements
- school-scoped direct messaging only where enabled
- XP for approved learning actions
- achievements/badges
- opt-in learning-behavior leaderboard
- notifications

## Not MVP

- public profiles
- external friend requests
- cross-school messaging
- unrestricted student private chat
- public follower counts

## Role rules

Students can interact only within school-approved communities and current memberships.

Teacher access is scoped to their assigned school/class/group and current role.

Parents see approved child-related communication only.

Administrators manage policy/moderation settings but do not automatically gain unrestricted pastoral access without an explicit role/policy.

## Moderation

Every social object should support:

- report
- mute/restrict
- block where appropriate
- staff escalation
- attachment controls
- rate limits
- abuse monitoring
- audit

## Privacy

Use private Realtime channels for protected collaboration.

Supabase supports RLS policies on `realtime.messages` to control broadcast/presence permissions and private channels require public access to be disabled.

Source:
https://supabase.com/docs/guides/realtime/authorization

## Leaderboard principle

The leaderboard should rank optional learning-behavior achievements, not intelligence, grades, discipline or overall student worth.

Examples:

- practice streak
- completed revision sessions
- reflection milestones
- approved learning challenges

Allow school policy to disable leaderboards completely.

## Gamification integrity

XP does not become academic attainment.

Badges do not become qualifications.

Leaderboard position does not appear in official reports unless a school deliberately includes a non-academic engagement metric.
