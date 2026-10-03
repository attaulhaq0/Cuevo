# Immutable migration replay dependency

A clean bootstrap reproduced a forward dependency: migration21206 defines a SQL function using the native academic registry created by21737. Incremental application had concealed the problem. Both migrations had already been applied and remain immutable, including their filenames, versions and hashes.

The guarded local reset/start workflow now uses one explicit dependency order: the original prefix through21129, original21737, then all remaining original migrations with include-all. It copies exact files only into ignored temporary workdirs, disables partial-stage seeding and records the actual order. Native21737's referenced tables/constraints/functions exist in the prefix; it has no lifecycle21206 dependency. Function body checking remains enabled and no placeholders, schema grants or runtime authorization changes are introduced.

Bootstrap and npm db:reset share this mechanism. New-project first-start uses the same prefix without seeding before the full reset. Canonical SQL files remain the source of truth; direct lexical Supabase db reset is insufficient for this historical dependency. Deployment tooling must use the reviewed plan or a separately reviewed baseline process; an incremental migration up on an already complete database does not prove clean deployability.

Each reset checks Cuevo's project/ports/loopback before mutation, checks exact dependency hashes/cutoff and proves no original migration is omitted or duplicated. The full schema and checking configuration must resolve before synthetic seed. Failed staged resets leave the application unavailable until the complete process succeeds. Other Docker stacks are not targeted. No deletion or rewrite of applied migration history is permitted.
