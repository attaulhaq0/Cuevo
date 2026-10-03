begin;
-- New tenant source statistics may estimate one row across every observation table.
-- Preserve the declared observation -> processed event -> immutable source order so
-- exact identity joins use indexes instead of multiplying whole-tenant inner scans.
-- The owning reader's scope, predicates, grants and five-second runtime budget stay unchanged.
alter function internal.authorized_observation_sources(uuid,uuid,timestamptz,timestamptz)set join_collapse_limit='1';
commit;
