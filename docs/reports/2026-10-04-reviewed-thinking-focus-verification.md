# Reviewed Bloom task focus — implementation evidence

Date: 4 October 2026. Scope: the founder-authorized [specification](../superpowers/specs/2026-10-04-reviewed-thinking-focus-bloom.md) and [plan](../superpowers/plans/2026-10-04-reviewed-thinking-focus-bloom.md). This is local synthetic acceptance of this increment, not whole-product Gate 5, official curriculum approval or hosted acceptance.

## Implemented behavior

Curriculum ships one immutable, hash-verified revised cognitive-process vocabulary with original Cuevo English/Arabic descriptions. School Learning owns activity, assessment and exact rubric-criterion drafts, independent review, withdrawal, immutable history and recorded completion/submission context. Teachers/Admins prepare focus under existing managed-course scope; a different Coordinator/Admin reviews the actual source. Students receive task-demand explanations. Parents receive recorded context through the existing authorized published native-result source.

The implementation uses existing API/session/CommandForm, Learning/Curriculum/Academic owners, private database authority, source snapshots and outbox processor. No second application, learner-level score, mastery percentage, category XP, grade mapping, automatic classifier, prerequisite lock or new model call was added. Existing unclassified tasks remain usable. Native numeric zero and rubric descriptors retain their meaning.

Source edits and material changes require new review. Unchanged publication retains original review provenance through an immutable lineage. Page metadata follows the content actually displayed; a Coordinator's draft-review source does not replace the published course-page source. Exact target/course/revision validation and explicit authorized absence receipts distinguish missing mappings from malformed or incomplete successful responses.

Material inspection is limited to the exact source manifest, target and resource revision. Current identity/source authority is rechecked after private storage retrieval; size/type/hash are checked before delivery. General Coordinator resource access and Student/Parent review-material routes remain denied. New approvals require a complete available material basis in private SQL; rejection, withdrawal and original-command reconciliation retain their supported paths.

## Isolation and frozen sources

Authored work: `C:/Users/hp/.codex/worktrees/cuevo-design-system/Cuevo`, branch `codex/cuevo-design-system`, baseline `7053046`. The separate backend checkout `G:/Cuevo` remained at `8ede801` with 42 dirty status entries; this task did not author changes, reset data, rotate credentials or stop services there.

The separate `cuevo-bloom` Supabase runtime uses Auth/API 57421 and database 57422, with 133 synthetic Auth identities. Secrets/account files remain ignored in `.local/bloom-runtime`. Connected preview: `http://127.0.0.1:54121/`, API 54122, production web build `7yyq_f69AQwgDQsAmq7Zn`.

Frozen runtime inventory: 868 entries, SHA256 `a55532948d32148d2d382d120ed6e4a9ba3160be2402c6129e683294e406680c`. All entries matched their original bytes after verification. Later documentation/status reconciliation is outside this runtime inventory. Catalogue SHA256: `9fb1b059f4fca90cec7f0deff37ca6b1e614d5f3fe5b03cae06a9f90a91e5d6d`.

After the final browser run, the isolated acceptance-test database was archived in ignored local recovery evidence. Its private application schemas were replayed from the same 208 sources, retaining all 133 Auth identities and credentials. The canonical reference-scenario seed ran through an ignored adapter changing only its exact local port guard from 56322 to 57422. One existing school-authored practice activity then received a Teacher draft and independent Coordinator approval through the actual API; Student readback confirmed approved task focus. The worker drained reference events. Acceptance-test course titles were removed from the review environment; `G:/Cuevo` was untouched. Evidence: `demo-restoration.json`, `reference-seed-adapter.json` and `readable-demo-focus.json` in the ignored evidence folder. A first restoration attempt encountered an existing provider-table Cuevo policy; it was corrected by recreating only the three owned Realtime policies with the canonical migrations, not by changing applied source bytes.

## Verification

| Layer | Observed result |
|---|---|
| Ordinary tests | 962 Vitest cases, 581 web cases and 4 local-runtime cases passed |
| Real Auth/controller/Postgres | 5 opt-in private rollback-tenant journeys passed using real Supabase sign-in and restricted API role |
| Focus SQL | 115 assertions: source/review/history 75, criterion/scope 16, capacity 4, material authority 20 |
| Existing SQL regressions | Assessment preparation 12, native source bridge 7, learning content 13 passed |
| Clean replay | All 208 immutable migrations passed in fresh scratch database `cuevo_bloom_replay_20261004_clean2`, function-body checks enabled, original reviewed dependency order retained |
| Actual browser | Final 10/10 passed in 37.96 seconds; no skips or flaky results in that run |
| Browser coverage | Teacher draft/independent review; learner completion/snapshot; source changes; stale/offline clearing; malformed-response original-key recovery; withdrawal/history; native-zero Parent evidence; published rubric criteria/native descriptor; actual Supabase material download/hash; dark Arabic keyboard/reflow |
| Accessibility/responsive | Scoped WCAG axe passed; 390/320 Arabic learner and 390 Parent views; 640×450 dark RTL keyboard focus visible, outlined and unobscured; no horizontal overflow in tested views |
| Worker | Restricted worker acknowledged metadata events; SQL denies forged actor/revision/source, expired/wrong lease and repeated completed acknowledgement; no XP/attainment writes |
| Packaging | Node and Vercel private catalogue hashes match, with 105 current source inputs. Persistent packaging tests passed, including tampered catalogue denial and changed-working-directory delivery |
| Structure/build | Lint, typecheck, production web/API builds, architecture/docs/repository guards and tests passed |

Final browser report: `C:/Users/hp/.codex/visualizations/2026/10/04/cuevo-bloom/persistent-browser-2026-10-04T04-06-57-179Z/results.json`, SHA256 `26a968f6accfa7431c6f47350a288ebe6d003df17e2baa8dacd4f2ccb64a28d7`. The same folder contains `qa-summary.md` and original attachment screenshots in `screens/`. Final API artifact hash: `9f5362a63343dbf7593ac21ce548a01525306a9183e21fb3f20b856a45eec96d`; Vercel artifact hash: `1572ff4441454c3efeffd505b77e7e49a19f89b2971e2e418fd13c72e70805fe`.

Ignored evidence includes `sql-final.json`, `integration-root-final.json`, `scratch-clean2-replay.json`, `api-artifact-final.json`, `vercel-artifact-final.json`, `final-source-manifest.json` and `final-freeze-check.json` under `.local/bloom-runtime/evidence`. Repeatable authored tests live in `apps/api/test/integration/thinking-focus-api.test.ts`, `tests/e2e/thinking-focus.spec.ts`, owner unit tests and SQL196–199. Integration/browser suites require explicit isolated-runtime flags and fail target checks; ordinary runs do not silently start hosted ingestion.

## Limits and retained failures

The 1,000-task probe uses ten statements of 100 targets, each under the existing five-second timeout. Final total: 11,838 ms. This establishes bounded per-statement capacity and complete receipts, not acceptable 1,000-task aggregate latency, tenant fairness, hosted scale or load/soak acceptance. Larger-volume latency remains a measured optimization gate.

One earlier browser run returned a draft conflict before any focus revision committed. It did not recur in three subsequent instrumented runs, including the final complete run. Its cause remains unconfirmed; no claim is made that it was fixed. Earlier reports are retained, including `persistent-browser-2026-10-04T04-03-12-701Z/results.json`. Persistent test instrumentation captures submitted basis, response and current source on recurrence. Published-criterion and Arabic keyboard checks initially expected selection to survive a source/locale refresh; tests were corrected to reopen the current explicitly scoped review without changing runtime behavior to hide stale context.

The first scratch replay failed because its empty provider baseline omitted `vault`; setup evidence remains in `scratch-clean-replay.json`. A fresh second scratch baseline completed all 208 migrations. Applied bytes were preserved. The dark keyboard test uses effective 200% reflow dimensions; it does not claim a browser zoom gesture.

University and bibliographic evidence supports the revised categories; closed primary full text was not copied or claimed licensed. No publisher/official curriculum endorsement is asserted. Knowledge dimension, automatic tagging, curriculum-wide adaptive sequencing and mastery rules remain outside this bounded version. Live-model, hosted storage/worker, production/legal and whole-MVP acceptance require their own evidence. This design-branch change has not been merged into the other chat's dirty checkout or deployed to a hosted customer environment.
