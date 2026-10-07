import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalReleaseExecutionJson, canonicalReleaseReviewJson } from './release-review';
import { stagingVerificationJobPolicy, stagingVerificationWorkflowPath, validateBackendVerificationRun } from './staging-verification';
import { readCanonicalStagingSecurity, type GithubArtifactReader } from './staging-security';

const unavailable = () => new Error('Focused staging job evidence is unavailable or requires review; contents withheld.');
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const stepSchema = z.object({ name: z.string().min(1).max(200), number: positive, status: z.literal('completed'), conclusion: z.enum(['success', 'skipped']) });
const jobSchema = z.object({ id: positive, name: z.string().min(1).max(200), run_id: positive, run_attempt: positive, head_sha: z.string().regex(/^[a-f0-9]{40}$/), head_branch: z.literal('main'), status: z.literal('completed'), conclusion: z.literal('success'), steps: z.array(stepSchema).min(1).max(100) });
const pageSchema = z.object({ total_count: positive.max(1000), jobs: z.array(jobSchema).max(100) });
type GithubReader = (path: string) => Promise<unknown>;

/** Official GET facade supplied by the native admission owner. Canonical CI keeps its original admission behavior. */
export async function readStagingVerificationJobs(value: unknown, github: GithubReader, artifact?:GithubArtifactReader): Promise<{ runAttempt: number; jobsSha256: string } | undefined> {
  try {
    const identity = z.object({ id: positive, head_sha: z.string().regex(/^[a-f0-9]{40}$/), repository: z.object({ full_name: z.string() }) }).parse(JSON.parse(canonicalReleaseReviewJson(value)));
    const expected = { sha: identity.head_sha, repository: identity.repository.full_name, ciRunId: String(identity.id) };
    const run = validateBackendVerificationRun(value, expected);
    if (run.path !== stagingVerificationWorkflowPath) return undefined;
    const runPath = `actions/runs/${run.id}`, initial = canonicalReleaseReviewJson(run);
    const current = async () => { if (canonicalReleaseReviewJson(validateBackendVerificationRun(await github(runPath), expected)) !== initial) throw unavailable(); };
    await current();
    const rows: z.infer<typeof jobSchema>[] = [], ids = new Set<number>(); let total: number | undefined;
    for (let page = 1; page <= 10; page++) {
      const response = pageSchema.parse(JSON.parse(canonicalReleaseExecutionJson(await github(`${runPath}/attempts/${run.run_attempt}/jobs?per_page=100&page=${page}`))));
      if (total !== undefined && response.total_count !== total || response.jobs.length === 0) throw unavailable();
      total = response.total_count;
      for (const row of response.jobs) { if (ids.has(row.id)) throw unavailable(); ids.add(row.id); rows.push(row); }
      if (rows.length > total) throw unavailable();
      if (rows.length === total) break;
      if (response.jobs.length !== 100 || page === 10) throw unavailable();
    }
    if (rows.length !== total || rows.length !== Object.keys(stagingVerificationJobPolicy).length || new Set(rows.map(row => row.name)).size !== rows.length) throw unavailable();
    const normalized = rows.map(row => {
      const policy = stagingVerificationJobPolicy[row.name];
      if (!policy || row.run_id !== run.id || row.run_attempt !== run.run_attempt || row.head_sha !== run.head_sha) throw unavailable();
      const names = new Set<string>(), numbers = new Set<number>(), authored: string[] = [];
      for (const [index, step] of row.steps.entries()) {
        if (names.has(step.name) || numbers.has(step.number) || index > 0 && step.number <= row.steps[index - 1].number) throw unavailable();
        names.add(step.name); numbers.add(step.number);
        if (policy.steps.includes(step.name)) { if (step.conclusion !== 'success') throw unavailable(); authored.push(step.name); }
        else if (step.name === 'Set up job' || step.name === 'Complete job') { if (step.conclusion !== 'success') throw unavailable(); }
        else if (!policy.actionSteps.some(name => step.name === `Post ${name}`)) throw unavailable();
      }
      if (canonicalReleaseReviewJson(authored) !== canonicalReleaseReviewJson(policy.steps)) throw unavailable();
      return { id: row.id, name: row.name, status: row.status, conclusion: row.conclusion, steps: row.steps };
    }).sort((a, b) => a.name.localeCompare(b.name));
    const canonicalSecurity = await readCanonicalStagingSecurity({ sha: run.head_sha, repository: run.repository.full_name }, github,artifact);
    if (canonicalSecurity.status !== 'VERIFIED') throw unavailable();
    await current();
    const jobsSha256 = createHash('sha256').update(canonicalReleaseReviewJson({ runId: run.id, runAttempt: run.run_attempt, commitSha: run.head_sha, repository: run.repository.full_name, canonicalSecurity, jobs: normalized })).digest('hex');
    return { runAttempt: run.run_attempt, jobsSha256 };
  } catch { throw unavailable(); }
}
