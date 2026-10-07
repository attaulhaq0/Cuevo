import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { safeEvidence } from './cicd-contracts';
import { verificationEvidence } from './verification-profiles';
import { canonicalReleaseReviewJson } from './release-review';
import { sameSourceManifest } from './rules';

const sha = z.string().regex(/^[a-f0-9]{40}$/), id = z.string().regex(/^[1-9][0-9]*$/);
export function fullVerificationSummary(input: { env: Record<string, string | undefined>; sourceSha: string; treeSha: string; evidence: unknown; before: unknown; after: unknown }) {
  const env = input.env, sourceSha = sha.parse(input.sourceSha), treeSha = sha.parse(input.treeSha);
  if (env.GITHUB_SHA !== sourceSha || env.GITHUB_WORKFLOW_SHA !== sourceSha || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_JOB !== 'technical-mvp' || env.GITHUB_ACTIONS !== 'true' || env.CI !== 'true'
    || env.GITHUB_WORKFLOW_REF !== `${env.GITHUB_REPOSITORY}/.github/workflows/full-regression.yml@refs/heads/main`) throw Error('Full evidence requires its exact source-owned workflow.');
  const purpose = z.enum(['regression', 'customer-candidate']).parse(env.CUEVO_FULL_VERIFICATION_PURPOSE);
  if (!['schedule', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME ?? '') || env.GITHUB_EVENT_NAME === 'schedule' && purpose !== 'regression') throw Error('Scheduled verification cannot authorize customer release.');
  const raw = z.object({ status: z.literal('VERIFIED'), rows: z.array(z.object({ name: z.string(), exitCode: z.literal(0), required: z.literal(true), durationMs: z.number().finite().nonnegative() })) }).parse(input.evidence);
  verificationEvidence('full', raw.rows);
  const sources = z.array(z.object({ path: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).min(1);
  const before = sources.parse(input.before), after = sources.parse(input.after);
  if (!sameSourceManifest(before, after)) throw Error('Full evidence requires unchanged source.');
  const runId = id.parse(env.GITHUB_RUN_ID), runAttempt = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(env.GITHUB_RUN_ATTEMPT);
  const repository = z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/).parse(env.GITHUB_REPOSITORY);
  const evidence = safeEvidence(raw, before, { sha: sourceSha, runId });
  return { version: 1 as const, profile: purpose === 'customer-candidate' ? 'CUSTOMER_CANDIDATE' as const : 'FULL_REGRESSION' as const, repository, sourceSha, treeSha, runId, runAttempt, evidence };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const root = resolve('.local/verification'), entries = await readdir(root, { withFileTypes: true });
  const latest = entries.filter(row => row.isDirectory() && /^\d{4}-\d{2}-\d{2}T/.test(row.name)).map(row => row.name).sort().at(-1);
  if (!latest) throw Error('No complete full verification receipt exists.');
  const git = (args: string[]) => execFileSync('git', args, { encoding: 'utf8', shell: false, windowsHide: true, timeout: 10000 }).trim();
  const sourceSha = git(['rev-parse', 'HEAD']); git(['diff', '--exit-code', 'HEAD', '--']);
  if (git(['ls-files', '--others', '--exclude-standard'])) throw Error('Uncommitted authored source cannot become full evidence.');
  const parse = async (name: string) => JSON.parse(await readFile(resolve(root, latest, name), 'utf8')) as unknown;
  const summary = fullVerificationSummary({ env: process.env, sourceSha, treeSha: git(['rev-parse', 'HEAD^{tree}']), evidence: await parse('evidence.json'), before: await parse('source.json'), after: await parse('source-final.json') });
  await mkdir(resolve('.local/full-verification'), { recursive: true });
  await writeFile(resolve('.local/full-verification/summary.json'), canonicalReleaseReviewJson(summary), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ status: summary.evidence.status, profile: summary.profile, sourceSha, runId: summary.runId }));
}
