# PR1 merge blockers and repair evidence

The founder supplied the PR1 check summary showing successful jobs, three medium CodeQL alerts and blocked merging. Current signed HEAD is19b798e15acf9394a2b9905c1f6cd616fcb4306a. Full PR37446902719 and push37446891570 CI passed, but successful CodeQL analysis is not a zero-findings security verdict. Later dirty source is not covered by those runs.

## CodeQL conversations

Authenticated readback confirms three current open `js/bad-code-sanitization` findings and matching unresolved review threads:

- Alert8: `apps/web/features/community/test/nested-source-state-render.test.ts`.
- Alert9: `apps/web/features/restricted-records/test/history-state-render.test.ts`.
- Alert10: `apps/web/features/school/test/support-state-render.test.ts`.

All three were fixed locally by preserving their fixture records as data and reading them from initialized globals through static module text. Original parser, stale-scope, locale, command journal and source-selection behavior stays covered. Each new regression failed on the original generated fixture source. Additional hostile text tests change the actual data after import and verify escaped rendering without code execution. Initial quoting errors during the repair were retained as development failures and corrected; they were not counted as passing security proof.

Focused27tests, full1164web tests, canonical typecheck, scoped lint and diff checks passed. Independent read-only investigation and final candidate review found no remaining fixture-data interpolation in these three owners. The reported inputs are fixed same-file test records and the sink is Node module replacement; no attacker-controlled HTTP input or production HTML script sink was established. This scopes exploitability without dismissing the unsafe coding pattern or claiming the scanner found nothing.

CodeQL alert closure and review-thread resolution remain pending a committed-source scan. No alert was dismissed, scanner disabled or unresolved thread marked resolved merely to obtain a green merge. Detailed source/failure/hash evidence is ignored under `.local/integration`.

Later 6 October11:39UTC authenticated readback confirms signed76bd7d05e372cc8d362b38e6504b184f18c73579/tree8e8945995b6dbb04ddb8e5f39fb5181ae101a7f9 contains exactly the three fixture repairs plus this report. CodeQL check112249003276 for that SHA reports no new alerts and zero annotations; current source-branch open-alert query returns zero, and each old alert instance on the source branch is marked fixed. The old PR merge-ref instances still describe prior6b22ea5 source until their analysis is reconciled; they are historical source evidence rather than new76bd findings. PR review-thread readback returns zero unresolved threads, without an operator dismissal or forced resolution. New full PR37457449798/push37457439728 checks remain running, and the final dirty candidate remains separately unverified. The signature blocker below is not resolved by CodeQL closure.

## Commit signatures

Authenticated PR commit readback:159introducedcommits,21verified,138unsigned. Recent commits, including19b798e, are valid GitHub-signed commits; their signatures do not apply to historical ancestors. Main retains required signatures, strict Actions CI, enforced administrators, PR/conversation controls and no bypass/force push/deletion. The founder is the PR author and cannot merge as administrator under current settings.

An independent review checked the current official [required-signature rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches#require-signed-commits). GitHub checks commits introduced by the test merge; unsigned head commits can block squash even if GitHub would sign the final squash and even for the author. Rebase-and-merge is not a proven signature repair. Do not promise that a signed squash automatically resolves this blocker or weaken protection.

The safe alternative without rewriting the integration branch is a new signed snapshot commit based on current main with the exact final candidate tree, a replacement PR, fresh source-specific CI/reviews and normal protected merge. Preserve PR1 and its original branch/commit objects as history/evidence. This changes the explicitly requested PR1 deliverable and needs a founder decision after the concrete final snapshot is prepared and verified. No replacement PR, new snapshot branch, force update, signature rewrite or merge has been performed. Retaining PR1 instead would require rewriting and signing unsigned head ancestry, which is not covered by current preservation authorization.

The merge repair does not provision Supabase or deploy Cuevo. Hosted original migrations, identities, API/worker, private/recovery proof, frontend handover and five-role/native-loop/customer gates remain required.
