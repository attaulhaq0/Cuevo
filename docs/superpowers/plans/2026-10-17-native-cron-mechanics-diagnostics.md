# Native Cron mechanics refusal diagnosis

**Goal:** Correct the unsupported scheduler/statement ordering and identify the next original mechanics refusal from already-read data without changing acceptance requirements.

**Scope:** Existing isolated background-worker proof/policy/tests. Source-locked product38/39/81/82/83 and the [native proof specification](../specs/2026-10-15-worker-native-cron-first-proof.md) retain authority. Original hosted LIBPQ operation80390cdc-1e28-4107-9020-253cd7d8a588 remains held.

**Evidence:** PR95 original run38991846511/attempt1 source93e20f3465b59c199f4a7dba8281ce4438174d23/treec9a35382237fc96744c07cc7c5be88b793484ca4 failed at COMMIT_PROOF with null SQLSTATE and confirmed cleanup/absence. No run/stage/log/clock was retained; the original cause stays UNKNOWN. Reviewed immutable pg_cron1.6.4 source9490f9cc9803f75105f2f7d89839a998f011f8d8 records scheduler start after background startup and independent worker statement start. It does not attest the installed binary.

- [x] Preserve clean d4365f proof/evidence and normally merge published21b4de6 plus current mainbd5ed43/PR96. Resolve only owner README overlap with both records retained.
- [x] Add red/green regression for a fully matched worker-first statement clock. Retain both starts≤end, independent numeric/ISO agreement, exact stages/PID/transaction/source and5000ms bounds.
- [x] Add failing mechanics diagnostics regressions, then implement finite existing-read observer. Preserve original errors, no extra I/O and freeze before cleanup. Failure3 carries diagnostic1; historical failure1/2 and positive3 stay strict.
- [ ] Verify focused proof/workflow/discovery, type/lint and required architecture/docs/repository/CI checks, then independent source review and local unsigned sealing. Root owns signed publication and new genuine Linux CI.

Fixed steps are REGISTER/JOB_READ/RUN_READ/UNSCHEDULE/RUN_PARSE/STAGES_READ/LOG_READ/LOG_ADMISSION/CASE_ADMISSION. Counts are nullable0–1000, log class NONE/ONE/AMBIGUOUS/UNKNOWN and clock order BEFORE/AT/AFTER/UNKNOWN. Raw timestamps/PID/job keys/errors/SQL/environment are excluded. No native server, SQL, scheduler, provider or model call runs in this local repair. Diagnostics never supply authority or mechanics acceptance.

Verification:76 offline proof/workflow/discovery cases passed, including44 Cron cases; the four final clock/diagnostic/error-preservation checks passed after the type correction. Typecheck, scoped lint, architecture17, docs7, repository25 and CI trust/194-source coverage passed. The invalid relative clock ordering and missing mechanics diagnostic each had an offline failing regression before repair. Original run38991846511 first cause remains UNKNOWN; genuine Linux CI still must supply actual mechanics/failure evidence.

Independent review caught a diagnostic-only revoked-proxy hazard: Array.isArray was called before the proxy guard and could throw before the original log/admission path. The observer now checks types.isProxy first. A focused regression first reproduced that TypeError, then verified nullable counts, no throw and the original single log read/sanitized admission refusal. All45 proof cases and the final five diagnostic/clock/proxy cases passed afterward. This adds no native I/O or authority and does not attribute the original CI failure.
