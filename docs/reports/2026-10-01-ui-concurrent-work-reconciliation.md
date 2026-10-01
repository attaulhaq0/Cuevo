# UI concurrent-work reconciliation

Read-only source comparison, 1 October 2026. UI implementation remains awaiting explicit founder approval.

The customer-readiness checkout at `G:/Cuevo` is on `codex/customer-readiness-hardening`, HEAD `946cca0d9d31a128a950c64ddeb4507d72806ab2`, with uncommitted tracked and untracked changes. The isolated design checkout is `C:/Users/hp/.codex/worktrees/cuevo-design-system/Cuevo`, proposal commit `5d5c6329b82d9d20af63476cf9cecb365667708c`, starting from baseline `946cca0d9d31a128a950c64ddeb4507d72806ab2`.

**This is an uncommitted, mutable source snapshot, not runtime or acceptance evidence.** The scoped 79-file SHA-256 manifest was captured at `2026-10-01T17:00:39.2533246Z` and reread unchanged at 17:01:34 UTC. That bounded reread does not freeze the other chat's future work. No tests, services, browser, database or credential operations were run. Only this report was written in the isolated worktree; the other checkout was read.

The comparison used Git status/diffs and direct source reads of affected frontend providers/navigation/public interfaces, API contracts consumed by those interfaces and browser selectors. Backend source-function names below describe calls observed in controllers; their SQL implementation/runtime behavior was outside this review. Read context included root/scoped instructions, owner READMEs, context/codebase/layout maps, product sources 08/13/18/21/36/38/39/43/62/63, and synthetic pack manifests/golden cases/unknowns. Packs remain `synthetic-1`, `TECHNICAL_FIXTURE`, `customerReady:false` and `productionApproved:false`.

## Preserve when the redesign is approved

- [ ] **Verified-session navigation and history.** Current shell reads `?view=`, uses native push/replace history, allows only current navigation entries and falls back to overview for invalid/forbidden values. Back/Forward and later sign-in recover the permitted view; explicit navigation focuses the destination heading. Preserve the twelve current view identities and supported actions while changing their presentation.
- [ ] **Typed work and exact uncertain retries.** Session-owned `FormDrafts` holds working values and original expected-version basis by school/actor/endpoint, with a shared semantic response key for draft-save versus submission. Successful same-scope refresh can remount school, marking, rubric and portfolio work. Save validates the receipt through `onSaved` before confirming the command journal; persistent localized status follows confirmed success. Offline/sign-out/actor changes, denied/unauthorized requests, membership failure and owner read failures clear the applicable drafts. These remain memory-only.
- [ ] **An exact authorized child across workspaces.** Home, Academic, Progress and Portfolio use the shared current `/v1/people?limit=100` child directory and session selection. A sole child is automatic only when the page is complete; multiple children require selection. Duplicate display-name/class-context choices are disabled with a recovery message. Parent Academic/Home use selected-learner academic-report; Portfolio adds `learnerId`; absent/revoked/ambiguous selection does not fall back to result-derived children.
- [ ] **Bounded course navigation and current completion.** Course detail now shows one selected unit's lesson page with first/next unit/lesson controls. Use server-provided next author sequence positions instead of a page's array length. Own activity completion receipts initialize completed state when reopening; do not present the completion command again for a completed source.
- [ ] **Readable primary labels and deliberate source detail.** Preserve current human assessment/objective/child/class/year/relationship labels, localized missing-name states and EN/AR copy. Support, source, actor, result, baseline, run and policy identifiers increasingly live behind opened disclosures. Rubric/quiz teachers author visible descriptors/answer text while stable internal keys are generated. Generated school versions use readable date context where `versionLabel` is applied. Native numeric zero, complete criterion levels, evidence and explicit fixture/approval limits remain truthful.
- [ ] **Academic-source review warnings.** Intervention/outcome `requiresReview` with `ACADEMIC_SOURCE_CHANGED` produces a visible warning. Home omits these tasks from executable queues; intervention completion/link/measurement controls are withheld. Retain historical comparison and its non-causality limitation without presenting it as current actionable support.
- [ ] **Returned/total/unknown coverage.** Current learner projection and practice signals carry bounded coverage, and frontend parsers reject mismatched denominators or clipped pages described as complete. Preserve returned/total/truncated display, unknown observation counts and native result separation. Report export remains fresh authorized `CURRENT_RELEASED_PAGE` with `NOT_ESTABLISHED` coverage; IDs move into source disclosure, not primary report identity.
- [ ] **Current operational basis and recovery.** Attention refresh/policy forms derive expected versions from the current policy read. School identity edit starts from the selected record's actual role/status/effective window; attendance correction starts from the chosen record and requires its revision/reason. Initial School context failure exposes local retry. Preserve disabled/denied/error/loading/offline/unknown states and explicit unchecked high-impact confirmations.

## Public interfaces and UI-used boundary changes

| Surface | Current change to reconcile |
|---|---|
| `useApp()` / provider context | Adds `formDrafts:FormDrafts`, `notice:string|null`, `announce(message)`, `selectedChildId:string`, `selectChild(id)`. Provider component props are unchanged. |
| `CommandForm` / `FormField` | Adds optional `draftKey:string`, `onValuesChange(FormData)`; field types add `date` and `time`. Existing `onSaved(result:unknown)` receipt callback remains. Retained expectedRevision/expectedVersion/expectedPolicyVersion/expectedAvailabilityVersion fields are applied only when the current payload contains them. |
| Shared people/child surfaces | New `PersonChoice={id,userId,displayName,role,classLabels:string[]}`, `parsePersonChoice`, `useChildContext(refresh=0)`, `ChildSelector({context})`; `id` aliases userId for pagination. Missing classLabels parses as an empty array; malformed labels are rejected. |
| Membership failure | `SCHOOL_SELECTION_REQUIRED` joins `MULTIPLE_SCHOOLS` as the existing multiple-schools presentation; no school-selection implementation is introduced. |
| Learning public model | `Activity.completion?:{id,completedAt}|null`; `Unit.nextLessonSequence?:number`; `CourseDetail.selectedUnitId/nextUnitCursor/nextLessonCursor?:string|null`, `nextUnitSequence?:number`, optional `curriculumContext:{version,programmeId,referenceId}`. |
| Learning query contract/API | New `courseDetailQuerySchema`: limit 1–10/default 10 plus optional unitId/unitCursor/lessonCursor UUIDs. `GET /v1/courses/:id` accepts these fields. Service returns selected/paged sources and completion; selected lesson page rejects more than 1000 activities or 500KB. `/v1/people` adds current authorized `classLabels` (bounded to 20). |
| Learner public model/contracts | `AcademicStateRow` adds optional assessmentTitle/referenceTitle; `LearnerState.projection?` uses new `learnerProjectionSchema` with `CURRENT_AUTHORIZED_SOURCES`, academic/observation/source-event coverage and optional support/outcome coverage. Each coverage object has nullable totalCount, returnedCount and truncated; academic adds nextCursor. |
| Signal model | `Signal.sourceCoverage?:{totalCount,returnedCount,truncated}`; parser verifies total=count, returned=observationIds length and truncation. |
| Support/outcome models/contracts | Intervention and Outcome plus shared learner support/outcome schemas add optional requiresReview and nullable/optional reviewReason=`ACADEMIC_SOURCE_CHANGED`. Public component props are otherwise unchanged. |
| Learner/attention API | Existing state route calls `internal.read_current_learner_projection` and validates `learnerStateSchema`; signals use `internal.read_current_practice_signals`. New staff `GET /v1/attention-policy` supports the UI's `{policy:null|{id,version,minimumDecline,maxScore,missingDueCount,windowDays,approvedAt}}` expectation; student/parent are excluded from that read. |
| School owner component | `SchoolRecords` adds optional `names?:Record<string,string>` for relationship ID resolution and localized dates/statuses. It is feature-local, not a new cross-feature public export. |

Existing feature `ui.tsx`, `api.ts`, `copy.ts` entrypoint names and primary workspace props were not changed by this scoped diff. Keep imports on those documented public surfaces; the new shared session mechanisms belong below features.

## Overlap and selector checklist

At `5d5c632` the design branch changes only `docs/README.md`, its source inventory and proposal. **There is no implemented runtime patch to merge at that commit.** Both branches currently modify `docs/README.md`; combine its entries when integration is authorized. The proposal/runtime baseline still matches `946cca0`, so future frontend implementation would overlap these current customer changes:

| Area | Current changed/new owners requiring preservation |
|---|---|
| Shell/shared | `features/shell/components/workspace.tsx`, provider/membership/form-drafts, CommandForm/feedback, API/pagination hooks, people/child surfaces and shared i18n. |
| Learning/Academic | course-editor, quiz, submission-lifecycle and learning model/messages; academic-workspace, marking, rubrics, references, results, native-result. |
| Home/Progress/Improvement/Portfolio | role-home; progress-workspace, attention, model, HTML report/messages; improvement proposals/interventions/outcomes/model/messages; portfolio-workspace. |
| School/Curriculum/Development/Community/Auth | School setup/access/daily/records/workspace/labels; curriculum-workspace/messages; development-workspace/messages; room-discussion and access-state. |
| API/contracts | Five API module files and two shared contract files in the manifest below. Keep these customer changes owned by their current implementation chat; frontend redesign must consume the completed boundary. |
| Guidance | Web/scoped and changed feature/shared/shell READMEs describe these mechanisms. Retain the stricter customer-language/source-disclosure rule in current root/web instructions. |

- [ ] Adapt navigation button/landmark selectors to the approved header/launcher/command/dock while preserving all permitted destinations, destination heading focus, keyboard and access-clearing checks.
- [ ] Preserve new `customer-experience.spec.ts` scenarios: response/draft switching and server resume; same-scope school refresh versus denial; suspended identity defaults; Back/Forward; context retry; shared child selection and revocation; readable relationships; rubric descriptor work after refresh; five-role EN/AR primary labels; reopened completion.
- [ ] Existing lifecycle selectors now choose quiz correct answers/options by visible text. Rubric truth no longer fills Version/Criterion key/Level key, chooses levels by visible descriptor, and reads the actual generated rubric version. Recognition no longer fills expected current version or milestone key.
- [ ] Foundation/all-role accessibility no longer assume technical synthetic account labels; they use returned current displayName or readable labels. Preserve protected name removal after offline/denied access.
- [ ] Curriculum save waits for its successful POST and finds the record by framework/programme human heading; do not revert to an internal pack identity primary label.
- [ ] Existing data-result-id/data-rubric-id/data-intervention-id/data-outcome-id attributes remain useful non-visible source selectors. Retain domain assertions even if presentation classes such as .workspace-intro/.course-list/.marking-queue change.

Two source observations require reconciliation by the owning implementation before integration: the shell still gates Progress/Next steps with `learning` and Academic with only `assessment`, as the original proposal already flagged; navigation metadata must follow actual API-required capabilities. Also, learning.controller.ts's hand-authored response schemas still omit new classLabels, completion and detail cursor/sequence fields even though its query docs and service return them. Do not generate a redesign client from that stale response shape without resolving the contract. These are static observations, not demonstrated runtime defects.

## Immutable baseline references

These Git blob IDs are identical at `946cca0` and `5d5c632`. Read them using `git show <commit>:<path>`; raw-byte SHA-256 values below identify the mutable G checkout and are intentionally a different hash system.

| Path | Baseline/proposal Git blob |
|---|---|
| `apps/web/features/shell/components/workspace.tsx` | `f8bb0335323d569f1ad7909099cc4a0b9e406890` |
| `apps/web/shared/session/providers.tsx` | `7340b372da315e34cf18fcdf67c3e6d11e99e7fb` |
| `apps/web/shared/components/command-form.tsx` | `d69f47fa7aa20158fd2e9b89e8590e9e6a672ba9` |
| `apps/web/features/learning/model.ts` | `1dd0bcb4a711982e2f9b9de39a832008aed54c40` |
| `apps/web/features/progress/model.ts` | `f91d07d2e84150a6db0d28226c69c5e18dc1033e` |
| `packages/contracts/src/learner-state.ts` | `eacb7540ba7d6ec75de1ead8f921a48cac679d8b` |
| `packages/contracts/src/school-learning.ts` | `2e616381979ef285db99c52cdf2b881f25339aeb` |

Proposal inventory blob: `085f0eac4cb361774652b9b9ad222e19de7d4cd3`. Proposal design blob: `093fa2718845bf22573b29eb612c0507ee241390`. Both are new at `5d5c632`.

## Mutable G checkout SHA-256 manifest

All paths below resolve under `G:/Cuevo/`; they do not identify the isolated worktree's baseline files. The manifest covers selected changed/new frontend source/guidance/tests plus the five UI-used API module files and two shared contracts. It excludes unrelated runtime, database, seed and verification work. Recompute immediately before any authorized integration; the report is not a patch or permission to apply one.

```text
8dcaef1707d6cc8c904c934d4b622ca565196c2acb8dcac08fea5fa5d4410659  apps/api/src/modules/improvement/improvement.controller.ts
14f038cb9abfef4a1b5de042cfc3720e9a28982086a72049789c3bded3c79cda  apps/api/src/modules/learner-state/attention.controller.ts
75940794495d4fcac3d834985a42f34fafd159b27b13a5da714107463109b061  apps/api/src/modules/learner-state/learner-state.controller.ts
3bde986acc6a47b6f01ef795bb95631b4f4af55a51acac96de4e956ddb3ec550  apps/api/src/modules/school-learning/learning.controller.ts
b2e9b6f1c2bd20c28cab5e0980879847071974935e82fad9c503507bead3905f  apps/api/src/modules/school-learning/learning.service.ts
e6f0d130ebddb77808f213bfdb4adb38b20aa53e3347cd1bcc2bba002720bf72  apps/web/AGENTS.md
ccccad3f88ced77d97279fd4778e49c49f99005dac2ac4b177a84885dc2eb8d3  apps/web/features/academic/components/academic-workspace.tsx
ad69fd543e30142d29f976f9a6d89024b1d3657ecbd18d0034fc9a78791e0762  apps/web/features/academic/components/marking.tsx
cc91c480d2b29921dbb8a0836b9e61a57cd12d8bf17840aacbc3d400611c5c14  apps/web/features/academic/components/native-result.tsx
e6643d892e5c56b8a8d2be20c65bd00585f41c858cb96265767116f5d11f0dfd  apps/web/features/academic/components/references.tsx
10c1ef18f21146e6045ba68cc0457a23751135eaf927b763e7d481b3c3665b0e  apps/web/features/academic/components/results.tsx
2f504c3c61eac48b169bbb956ce181f405779846050a16903aca9ffe05aa4a06  apps/web/features/academic/components/rubrics.tsx
e62908eebcc9b094384ebad42f741870893e03451011708117698f2e5db3079d  apps/web/features/academic/README.md
5640ed2afac6b24a4bba7e53bf9b4ddd24af2f1acdbf1820f4fe923655dbc7b0  apps/web/features/auth/components/access-state.tsx
c374c6e910f821223d0ac3f568a459072f5b3e851df9f83c0baba2d9a9937012  apps/web/features/community/components/room-discussion.tsx
f45c68ff28e228f8cedcec119f4ba76adae6169c406cb9e79b6cb2cc5cc0c168  apps/web/features/curriculum/components/curriculum-workspace.tsx
da92ac9e22b445557411502bdc79cd0e24c7954da3dd5806009ac4a7948a0bae  apps/web/features/curriculum/messages.ts
107144b6b6ee47378cca7defb5fbc0da08b37bb225faff680b0e06865378de47  apps/web/features/development/components/development-workspace.tsx
711410c634f5540c8108889bddc371dd9e0fd1d5366da482141982f5f875b8ef  apps/web/features/development/messages.ts
3ad507e711ea2cbb09863bed4608ffab638cd68796bfe7c93c45bf99950d74d0  apps/web/features/home/components/role-home.tsx
dccd33f1549722f44f72fb53ac8210003e0f1080e24b52e71ed30920167e6cac  apps/web/features/home/messages.ts
732ff4c82f5a7cabd8b26916e6416f6db3085b994b68249569448ff0a014fb5e  apps/web/features/improvement/components/interventions.tsx
18d9f412dbe28222b6ab1ed0367d07c15313646a17d9a521a73fdd763ddf7fbf  apps/web/features/improvement/components/outcomes.tsx
b7ceb3b99612ea722562bf279e861d022b73622e4cff39ee8b8417da7a9b68b4  apps/web/features/improvement/components/proposals.tsx
5d2004b7ec2f29450d9186078d9c0840207a028b162959c62a520d7f46a6d536  apps/web/features/improvement/messages.ts
60692882cf34e9b232783ae3bb1c47b6211c4c137514e22672f811276bacca61  apps/web/features/improvement/model.ts
81d9866096871469000cfe076ee041c2c482c896ad78209a6a795c42a1e3a1c7  apps/web/features/learning/components/course-editor.tsx
fcea5b8ef4282400df69cf8c65ba61d9ef636ec7f3c68dde882d1bd120b6f8d6  apps/web/features/learning/components/quiz.tsx
de6db290b21112a3fb2a7b34653f730155b9c4845e5e4f5113688473f5e6a834  apps/web/features/learning/components/submission-lifecycle.tsx
eccf9811d7af451adbab336c1c2c1647f73d7949782af0017d87ef61107262c0  apps/web/features/learning/messages.ts
95c0b7a8882dabdbf5746293cdca80ed7c60161fb597bfc9a3d1e28f9674c546  apps/web/features/learning/model.ts
0ac889268748524f7f05d2fdb4055e98c493cbd6d7610313380e1a46a1fef8d3  apps/web/features/learning/README.md
24c6e64009c27ad6d13bec6ca8c87ad631c4d94d647fd25a6a0957a9497b3e8a  apps/web/features/learning/test/learning-contract.test.ts
bc7816c157cf2d07a1c457c02441e3f9dbe4ea2fa53c1364adb84c934620e835  apps/web/features/portfolio/components/portfolio-workspace.tsx
ec24afd3249d4e26c8d131a96371b9f6b122e7299d3079a9d6584df0de15e829  apps/web/features/portfolio/README.md
30e4916262dddcbb5b859132dcadcb4d373fe263529d76f53f9fe8810dcf819d  apps/web/features/progress/components/attention.tsx
a130728b3e0b81b32d9d571010a253b8167e6604f1d94f3e63ecdce05c100142  apps/web/features/progress/components/progress-workspace.tsx
2d86ea0c627683307ff2c00f707a08643abd18b18363d50e20930cd1b7c42bee  apps/web/features/progress/messages.ts
4e60509d55a9f3bcce8f39edca38ceb408c3334cf681b3dc57cc3ad1066a67c7  apps/web/features/progress/model.ts
b94aee3a4796d2c9205020e0459a0ef9f61daa3f4b114e4e52d5d2ad3c51db83  apps/web/features/progress/report.ts
6b49dcbee0d4f84c30bcb175de427d23bc2de65b560f2861360e0a38fdcc55ac  apps/web/features/progress/test/learner-state.test.ts
97c6b8cf979f47f1d6d952142f83aa546314f2bfb7be25b2bcc4330aa9523b84  apps/web/features/school/components/access.tsx
61d13e801e2cfaf2263cb812e16fb8650ec661cc06bcfbd82168b197c2ee677e  apps/web/features/school/components/daily.tsx
71d44759ee9bbe63705225e1664f4710af7b3eae15508a56dc1852f6b7194ce6  apps/web/features/school/components/records.tsx
c96672426d8087a7a7478a2399656a96f9bd1f57d1aa02c67ab5b1751e7af648  apps/web/features/school/components/school-workspace.tsx
f40169637c2dcfc831e6a6342a032a69774bff3a1f476db42f8df8a24b69944f  apps/web/features/school/components/setup.tsx
e19566889c4cc4092220262673549eeec4463d3f94f4f42ada3dd23041394df4  apps/web/features/school/labels.ts
8e76cf1dfe04b024e82841972a7d90eada5d5b212e95076b2fff30dcb459e58e  apps/web/features/school/messages.ts
4a116d79db3b23beb9641b6ded12f89603b72edca2033e9fc754367fd28f2c90  apps/web/features/school/README.md
c89449a2e0440d87a90f7914739f5ddee96e9a0c34bf2420c2156dbbd1c10bcd  apps/web/features/school/test/labels.test.ts
2ce53c45727e10b070dba386bbf7a3caef8fdf2f914f6e69bb065fe33ee02862  apps/web/features/shell/components/workspace.tsx
a00e0a2134f1fb7bd59f268dd8745ec30278747ad0c2ff9986441dec48f59492  apps/web/features/shell/README.md
d08dc2fd97ad57e8e19d31e2ed772108e58b17e57044e845d8e3e09e7e3fa660  apps/web/shared/api/people.ts
5233b37a07ddb87e15c36b469e828ce6ba971e496c6429b938087d2a6acfde2c  apps/web/shared/api/test/people.test.ts
70c25b61afd35df82d16d705a5ecdaedebd0c6854b51aec2bfacf87b6f425e71  apps/web/shared/components/child-selector.tsx
4bbcbee69cf212c35ec4024a2821886dcd8b2d50b5473b7ec610c7861225ee09  apps/web/shared/components/command-form.tsx
57955e4e0804a2e41fd49261daef822918b3f1d3f12d627f4f5539433e6c248a  apps/web/shared/components/feedback.tsx
79229d9e25cfde300d152781064146b43b440ac27e874461e6400c1c89dbf6df  apps/web/shared/hooks/use-api.ts
f51afd037dfbfd286786d2e190fa3d0249e7d7e0201b85c807dd2b9156ef18e1  apps/web/shared/hooks/use-child-context.ts
8da5b654ce54d07bb47de2be521d1edbf5bce783eb29b050e5ecc74f9076ef08  apps/web/shared/hooks/use-paginated-query.ts
4309d148eb48c02b7aabc1857627bb5c650c5a70f55c05d65c1adb73cfceb78a  apps/web/shared/i18n/ar.ts
3bea29ed3077859f1167e28a00cb75b597ebc7b988e1ff5442ca2de2ab4fe47d  apps/web/shared/i18n/common.ts
ecb86102c92a31d69a42f942e57a9a0cc739c94d23ef8aec32ffbb1a068dff17  apps/web/shared/i18n/en.ts
64df6b6ae4d7d176f93111924f693715758822d57bbfef8e9da430c8bd633897  apps/web/shared/i18n/version-label.ts
25640c1f6cbfc773b5656494f78e4e8c00f26a2a1251d32ae10a7fcd60d9ea72  apps/web/shared/README.md
15f6189adbd09488a71aa9683ded70bc74519fa0e5b208a0a871e744aacdfa6a  apps/web/shared/session/form-drafts.ts
f39de3e8293fd5e544bff0044d65163de938f5d39963e9f8b1cac495884b9dfd  apps/web/shared/session/membership.ts
7aec2afc77c31dd3408bc9173a6ef97eb6b7a2dd8b3c29acf1d28b6aa229c844  apps/web/shared/session/providers.tsx
f6256d1afa2492dd448bd3222f1ac998dbdd1a6c721c1007aaf8866fd954afbc  apps/web/shared/session/test/form-drafts.test.ts
110dcfbc81e98444daa57936d837781d1d962bad29520b8df438c855a0da0404  apps/web/shared/session/test/membership.test.ts
8473fccc8fdd7ebb6d25c1abff907558c44f6aea078b5a6e4d2d8ecbd4edddd9  packages/contracts/src/learner-state.ts
28f8673145b104878b33e610709bf8cbab3ad9ab8ce7998969cbf552a6824953  packages/contracts/src/school-learning.ts
bcd3dee2ffc44db9e4bd4a4e1e1e4e1e18f190f228d7788921d5c053a4d07e0f  tests/e2e/curriculum-context.spec.ts
a80313e9879da29692b699981af15872c03b8692fea1e00ae4a0d185464a8d9d  tests/e2e/customer-experience.spec.ts
246dd17b62a292493158af766b7a4e5eee234775f953ab9e1749c586183685ca  tests/e2e/foundation.spec.ts
2abdfbb7a9dda2756d73c81223b73b963bd7a5a682ed245357bcfdc7ffb5c20a  tests/e2e/learning-lifecycle.spec.ts
5120b07b8dfac1005e18a15c9e40cbc629a1af443a0048d11c50ed7111fc569f  tests/e2e/recognition-actions.spec.ts
f8be025393752ae73114f790fb2921ae4b33cac90d3ec5d35deccc1c2c301cb9  tests/e2e/role-accessibility.spec.ts
5d7a401a391365e8121ec24a50829ca2fa3086d3f42a84589672a757c06e39e0  tests/e2e/rubric-truth.spec.ts
```

No implementation, test result, rendered finding or acceptance claim is supplied by this report. Founder approval and a fresh completed-source reconciliation remain prerequisites to the proposed UI implementation/integration.

