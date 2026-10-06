# Internal-team staging access and handover

Status: prepared procedure; usable hosted access, account confirmation and the complete managed learning-loop handover remain unverified. This guide contains no password and is not permission to provision, reset or promote an environment. The [CI/CD runbook](ci-cd.md), [scoped learning verification decision](../decisions/2026-10-06-scoped-hosted-learning-verification.md) and [active delivery ledger](../reports/2026-10-06-active-delivery-ledger.md) define the current source and evidence boundaries.

## Release owner checklist before sharing access

Use one exact signed main/source SHA and successful canonical push CI. Record the backend run/attempt, public transfer artifact ID/archive digest/JSON digest, web run/attempt/deployment/artifact/review identity and native QA package/result identity. Retain original proof times; importing an artifact never renews them.

| Evidence | Required observation | What it establishes |
|---|---|---|
| `population-result.json`, `auth-result.json`, `reference-result.json` | Population `POPULATED_CONFIRMED` or admitted `NOOP` with `commitment: CONFIRMED`; Auth `CONFIRMED`, `confirmed: 133`, original receipt digest and `cleanupCode: null`; current source/reference and role receipts pass the completed backend handover | The selected fictional population and initial identities have confirmed original provisioning evidence. A private access file alone is insufficient. |
| `api-origin-result.json` and completed web transfer | `API_ORIGIN_BOUND`, `healthVerified`, `currentActorVerified`, `corsVerified` and `sessionsClosed` true; exact API/Auth/public settings agree with the selected completed backend | The reserved API mapping and public dependencies match the same source. Team members sign in through the web interface. |
| `web-deployment-result.json`, `web-origin-result.json` | `WEB_DEPLOYMENT_VERIFIED` and `WEB_ORIGIN_BOUND`; exact source/run/deployment/artifact/review/transfer identities; current provider alias matches | The reserved frontend mapping serves the admitted web artifact. The reserved hostname alone is not a usable URL receipt. |
| `hosted-browser-result.json` and cleanup | `HOSTED_ROLE_ACCESS_VERIFIED`, five role sessions/sign-outs, `demoAbsent` and `sessionsClosed` true, zero unexpected requests/domain writes/console or page faults | Normal five-role access and bounded English/Arabic, mobile and recovery checks. It does not prove the academic loop. |
| UI `result.json`, command manifest and paired journal/companions | `UI_LOOP_VERIFIED`, known sessions closed, exact original command identities and hashes; official artifact `cuevo-learning-loop-ui-<run>-<attempt>` | The selected visible synthetic learning journey. Missing/truncated/uncertain originals require review. |
| `learning-native-result.json` | Top-level `NATIVE_PROOF_VERIFIED`, `officialAdmissionVerified: true`, `nativeExecutionVerified: true`, `readOnly: true`; package mode `FULL_LOOP`, nested `result.status: VERIFIED` and `result.chainVerified: true` | Credential-separated native original-command/audit/outbox/processed/source/habit/state/outcome proof for that scope. `ORIGINAL_RECONCILIATION_VERIFIED` proves originals only. |

The source reserves `https://cuevo-beta.vercel.app` for internal staging and `https://cuevo-api.vercel.app` for its API. They are expected mappings, not currently verified team access links. Share the actual frontend URL only after the matching mapping, current normal sessions and full-loop receipts above pass. Keep its immutable deployment URL and run/SHA as support details. Auth uses the exact Supabase origin admitted in `web-handover-public.json` and the completed transfer; users do not need provider dashboards or operator endpoints.

Native `apiFreshnessScope: CAPTURED_AUTHORIZED_UI_OBSERVATION` proves that the retained UI projection was current when observed. It does not renew the snapshot later. Keep `customerReady`, `hostedAcceptance` and `allNestedWorkflowAcceptance` false in every scoped handover; numeric fixture proof does not cover all nested role flows, official curriculum, live AI, real adoption or production/legal acceptance.

## Fictional role roster

These are committed reference identities from [identities.json](../../supabase/seed/identities.json), not verified hosted accounts. Select the same admitted people, school/class/enrollment and current guardian relationship used by the release receipts.

| Role | Fictional person | Source email |
|---|---|---|
| Administrator | Mariam Al-Nuaimi | `synthetic-001@cuevo.test` |
| Coordinator | Nadia Rahman | `synthetic-002@cuevo.test` |
| Teacher | Samira Hassan | `synthetic-004@cuevo.test` |
| Student | Lina Al-Kuwari | `synthetic-012@cuevo.test` |
| Parent / guardian | Ahmed Al-Kuwari | `synthetic-072@cuevo.test` |

The operator writes private `synthetic-access.json` before Auth confirmation. Its presence or source/password fields do not prove that any account works. The release owner must match its source to confirmed Auth/population/reference receipts and verify each selected person's normal sign-in before handover. Do not substitute passwords from local `synthetic-accounts.json`, a local pilot page, G checkout or an earlier source/run.

Deliver the actual hosted synthetic credential separately through an existing approved private credential channel to authorized internal recipients. This repository does not record an approved channel or a private account-document producer; until the operator establishes that channel and recipient authority, credential delivery remains unverified. Never put the credential or private account guide in Git, this guide, screenshots, logs, chat output or workflow artifacts. Share only the safe URL, fictional role mapping, same-source receipt references and known limits here.

## Team sign-in and bounded use

After the operator supplies verified access, open the supplied frontend URL and use normal **Sign in** with the school-provided fictional account. Each account represents one role; choose the account for the intended task instead of selecting a privileged role in the browser. Confirm the displayed person and school, then use English or Arabic and the existing workspace navigation. Sign out before changing account, and verify that the sign-in screen returns.

Hosted quick login and the localhost product tour remain unavailable. Do not enable them or use local Auth/session data to bypass a hosted sign-in problem. Use synthetic records only. Teacher grade release and support approval remain explicit customer actions; Student completion, Parent approved work and Coordinator review retain their current scope. Demonstration analysis uses the approved deterministic hosted fixture and does not authorize live model/provider activation.

Record unsupported, empty, denied, offline and unknown states accurately. A rendering pass, successful sign-in or friendly demo wording cannot turn unverified records into official/customer-ready claims. Retain separate nested Learning/quiz/rubric/Bloom, Community/moderation/notifications, private-file/Realtime, Development/XP and mobile/RTL/reflow evidence before broader acceptance.

## Failed access or uncertain actions

1. Stop new domain actions when access, source or a mutation receipt is unknown. Capture only the displayed safe error/status, affected workspace, role, date and admitted release identity; exclude submitted content, credentials and raw console/trace output. The operator records the incident owner through the existing support process. No new delivery channel or named contact is assumed by this guide.
2. Check the current source/deployment/alias/public settings and normal Auth/membership receipts. If the account is denied or a relationship changed, retain the denied state. Do not use another role, local quick login or direct provider credentials to obtain access.
3. Preserve the original UI key, body hash, fingerprint, intent/HTTP companion, journal head and official artifact. Do not resend with a new key, repeat initial setup or reconstruct private work from its hash. An intact failed UI artifact may support `ORIGINAL_RECONCILIATION` through the separately approved native QA workflow; missing/failed/ambiguous native evidence remains `REQUIRES_REVIEW`.
4. Keep failed result and cleanup receipts. Known browser tokens must be closed and denied on a later membership read; a closed tab alone is insufficient. SQL closure and read-only execution are separate native observations. An uncertain alias, worker wake, migration or provider write requires its own owner reconciliation before another attempt.
5. Hosted recovery never calls local bootstrap/reset/seed, deletes migration history or sanitizes customer-authored content. Use the existing incident/recovery runbook with explicit approval, a compatible immutable artifact or forward repair, and separately verified restore authority. The bounded isolated database/private-byte restore test is not proof of managed point-in-time recovery or a tested hosted disaster-recovery plan.

Keep safe artifact references before their configured retention ends. The public completed backend handover is retained for two days, learning-loop UI/native metadata for fourteen days, and original backend/web consumption expires within its admitted absolute window of at most twenty-four hours. Artifact retention does not extend approval or authorize continued mutation. Revalidate after expiry or source/provider/access change; preserve earlier evidence as history.
