# Private learner assets

Public interface createAssetController(identity,database,storageConfig). Sources 04/16/39/40/51/61/81 govern authenticated private byte handling.

AssetService(identity,database,storagePort?) owns command/byte integrity and reauthorization. The controller builds a server-only bounded Supabase adapter; tests inject the storage port. New uploads are capped512KiB with canonical base64 to fit the existing1MiB JSON request budget. Existing metadata history is preserved. Type/signature checks reject HTML/JS text and active PDF commands; they do not constitute malware scanning.

Private learner bucket has no browser upload/download policy. API verifies current scope, staged name/type/size/checksum, bounded bytes and basic signature/type safety. Upload/readback occurs outside a database transaction; only verified metadata can become AVAILABLE. Unknown network outcome retains original-key retry. Download revalidates current session/scope after fetching bytes and sends attachment/no-store. Retirement removes future availability; bytes are retained for controlled recovery pending retention policy. Parent assets remain denied until a separate approved portfolio projection exists. No malware-scanning or production security certification is claimed by type checks.

RETIRED sources fail before upload and before available command replay; AVAILABLE repeats skip upload and reconcile checksum/readback. Late retirement/current session denial prevents download. Finalize/retire events and audit use semantic asset identity so a new request key does not create duplicate transitions. SQL090 and actual Auth/API/Storage assets-api tests accompany nine storage/receipt regressions; root schedules real mutations and recovery.

Server storage secret is passed only to this server factory. The browser never receives it. Database metadata/grants/RLS and object bucket remain private. Exact source checksum, synthetic download/revocation/foreign access and recovery are tested as part of technical verification; official/sensitive file approval remains separate.
