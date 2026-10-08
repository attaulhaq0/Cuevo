# Preserve exact Storage limits across native PostgreSQL types

Status: bounded source repair in progress; hosted recovery remains unconfirmed.

Recovery37735330633 was approved for exactmain245 and three original missing migrations. The retained native diagnostic reports RECONCILIATION/ORIGINAL_OBJECTS, callbackentered, sessionclosed, leasecleanupunconfirmed and partialReceiptNOT_ATTEMPTED. Postfailure counts stayed120 migrations, zero Auth/schools and three original objects. Read-only provider metadata and all6INFO/body GETs match the original files and private bucket. The failing run's log window contained no Storage GET, consistent with a refusal at the first native bucket projection.

The hosted bucket column file_size_limit has PostgreSQL bigint type. Actual local PostgreSQL/node-postgres and the installed OID20 parser return canonical decimal text; management JSON returns a number. The native reconciliation and continuation schemas both required numeric49152. Existing controlled transport fixtures also returned that number, so they missed the real driver boundary.

The existing native database owner explicitly projects file_size_limit::text and requires exactly '49152'. This preserves the same private STANDARD bucket, MIMEallowlist and49,152byte maximum. Missing, changed, malformed or alternate supplied representations remain refused. Global pg parsing, broader coercion, grants, bucket configuration and migration history do not change. Management API owners retain their separately correct JSON contracts.

Tests exercise driver-shaped text through the real native owner and relevant executor paths, alongside wrong/null/number limits. A confirmed unit or controlled composition result does not clear original UNKNOWN/REQUIRES_REVIEW, retry migration effects or establish hosted completion. A new reviewed source/currentgate/package/approval and native originalobject/history/catalogue/lease checks precede any fresh recovery.

See the [repair plan](../superpowers/plans/2026-10-08-native-storage-bigint.md), [diagnostic/budget boundary](2026-10-08-safe-release-preflight-and-ci-budget.md), [recovery](2026-10-08-unknown-prefix-reconciliation.md) and [continuation](2026-10-08-reviewed-prefix-continuation.md).
