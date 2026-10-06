# Schema runner and Student Development checkpoint

This increment continues the existing integration branch and PR #1. Its starting commit is `efdc6d1913c08b28be7e5121686ad56efba06aa1`. Main and the hosted application remain separate until exact-source CI, merge and hosted execution complete. Preserve the G checkout, original design checkout and their services/data.

## Hosted execution

The missing backend schema workflow now has native preparation, protected official admission, fixed private operator bucket bootstrap and one held database session across four cumulative stages. Stage boundaries come from the original replay plan. The current 229 migrations are retained byte-for-byte; no hosted SQL has been applied by this increment. Preparation preserves a bounded secret-free package and original journals remain retained after failure. Unknown schema/history outcomes never trigger an automatic second invocation.

Actual user configuration was checked by secret names only: repository `SUPABASE_ACCESS_TOKEN` and `CUEVO_GITHUB_RELEASE_METADATA_TOKEN`; staging `CUEVO_MIGRATION_DATABASE_PASSWORD`, `CUEVO_DATABASE_TLS_CA` and `CUEVO_RELEASE_JOURNAL_STORAGE_KEY`. GitHub does not expose secret values, so connection/key validity remains unverified until execution. The official Supabase read at 03:50 UTC showed database SSL enforcement true, successfully applied, and Cuevo healthy. MCP reads established no application tables or migrations; a healthy provider is not a provisioned application.

Modern `sb_secret_` Storage keys use only the `apikey` header. Legacy JWT credentials retain their existing bearer header, and Management credentials remain separate. This is one shared operator header owner consumed by bootstrap/inventory/remote journal; it changes no RLS or browser exposure.

Local evidence includes 95 CI-control fixtures, five native preparation cases, actual four-stage physical input admission with the original 229 sources, native held-stage and aggregate cases, 16 bootstrap cases, and 67 Storage/durable-journal cases. The independent review corrected an initial size suspicion: the 229 migration rows are 37,986 bytes and already fit the smaller limit. The full plan/bundle needs its larger execution envelope. That suspicion was not a deployed defect. Passing adapters and physical inputs do not establish hosted TLS, migration completion, cross-run reconstruction, source rights or a complete MVP.

## Student Development

The same companion instance now occupies the upper logical end of the learning-period row. It uses 64px artwork on desktop and 48px on mobile, keeps standard/quiet/no-character choices, and removes the forced 160px scene. Goals and recorded actions share a natural main column; recognition, milestones and optional class participation use the side column. This removes the long empty region below the shorter goals panel. Cards use existing tokens and readable native controls. The explanation remains available through a closed native disclosure.

Six controlled browser cases cover Chromium/Firefox/WebKit, English/Arabic, light/dark and 1366/1024/768/390/320 widths. Forty-two owner tests and three existing staff browser regressions passed. Source query/form/command/receipt properties were compared with the original owner. The production Next build `3UVENDGaNhCTP5axmRnuo` was served at localhost54131 with API54132 and the separately guarded local57421/57422 scratch environment. Four additional actual served English/Arabic desktop/mobile cases exercised display changes and had no captured relevant console errors or horizontal overflow. This runtime uses synthetic session mirroring; it is not hosted Auth acceptance. The founder reviewed the opened actual app and approved retaining that frontend direction.

The local scratch still contains accumulated test records and has no recognition period available for the selected Student. This checkpoint does not certify it as a restored customer demonstration or infer zero recognition. Populated card behavior uses controlled source fixtures, distinctly from the actual unselected served page.

## Remaining delivery

Vercel CI credentials and actual credential validity, complete exact-source PR/main CI, the real schema run, source-locked synthetic accounts/reference data, restricted runtime credentials, API and inactive Edge deployment, Auth/private Storage/Realtime/Data API denial checks, signed wake/Cron recovery, web deployment and five-role hosted MVP acceptance remain required. No schema-only result may satisfy the complete release manifest. Pending seed extraction bytes are preserved in ignored recovery evidence and excluded until their original reset/uncertainty compatibility is resolved.
