# Account browser acceptance and fixture restoration

Status: implemented verification boundary; full ordinary browser result and final unchanged-source/customer acceptance remain in progress.

The first complete local run passed the three account cases and restoration, then failed ordinary acceptance with94passed/15failed/2opt-in measurement skips. That failed result is preserved under ignored `browser-2026-10-03-pre-fix`; subsequent repairs do not turn it into passing evidence.

Independent review added unique fresh report validation, exact persisted before/after request ownership, readback of capture absence and confirmed TCP refusal after owned child closure. The recovery journal persists before any reset. Cleanup failure with a saved journal attempts restoration and remains failed; missing journal refuses reset. Pure25cases pass; current live wrapper verification remains required.

Account admission and recovery are required acceptance journeys. They intentionally add a new Auth/member record and change a synthetic password, while normal browser fixtures require the original reference identities. The full production browser runner must not silently skip them or run later cases against their changed state.

Keep the existing required `browser` row. `browser-complete.ts` runs the exact three account acceptance files under explicit guarded local operator approval and the dedicated API-only overlay. It records account results separately, cleans captured messages by exact source/request identity, then executes guarded reference bootstrap restoration. Account or restoration failure prevents ordinary browser acceptance and preserves the failed phase. The ordinary phase explicitly excludes only those already-required account files and runs all other production browser journeys. Earlier unit/source results cannot supply an account-phase pass.

The overlay stays in the ignored task artifact and enters only the reviewed API child environment. It is never written into ordinary `.env.local` or sent to web/worker. Local bootstrap restores original Auth identities, passwords, source data, disabled account control and settled reference outbox. Mailpit messages live outside the database restore and require exact owned capture cleanup, including early failure. Generic mailbox deletion is forbidden.

This wrapper preserves the37-row verification identity and adds explicit subphase evidence rather than weakening a gate. Standalone filtered browser commands remain useful scoped checks; they do not replace the complete wrapper. Source manifests still have to match after the final aggregate, and hosted/privacy/academic/provider/customer acceptance remains separate.
