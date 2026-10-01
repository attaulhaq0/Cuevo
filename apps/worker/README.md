# Cuevo worker

main.ts composes scheduling and health. jobs/outbox/processor.ts processes claimed IDs/leases through private database functions; platform/database.ts supplies the worker pool. Source/projection/lease authority lives in supabase/migrations. The worker has no raw school/academic table grants and must never execute authoritative grades or model-proposed permissions.

Run root build for @cuevo/worker, test, typecheck/lint, database golden checks and relevant API integration. Test fixtures live in test. Background processing must be stopped when SQL fixture tests temporarily replace source functions or alter queue records. Unknown events remain bounded review/failure cases; explicit known acknowledgments are not proof of new state projections.

Product source lookup: [task context map](../../docs/product/context-map.md); numbered IDs resolve through the product registry.
