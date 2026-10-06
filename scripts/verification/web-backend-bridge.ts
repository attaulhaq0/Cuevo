import { createHash } from 'node:crypto';
import { z } from 'zod';
import { readCompletedBackendWebTransferAdmission } from './backend-web-transfer-admission';
import { canonicalReleaseReviewJson, parseCanonicalReleaseReviewJson, type ReleaseReviewInput } from './release-review';

const fail = () => Error('Web release backend bridge requires exact completed evidence and review; contents withheld.');
const id = z.string().regex(/^[1-9][0-9]{0,19}$/).refine(value => Number.isSafeInteger(Number(value)));
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const selectionSchema = z.object({ backendRunId: id, backendRunAttempt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), artifactId: id, transferSha256: digest }).strict();
export type WebBackendSelection = z.infer<typeof selectionSchema>;
type Admission = Awaited<ReturnType<typeof readCompletedBackendWebTransferAdmission>>;
export type WebBackendBridge = Omit<Admission, 'observedAt'>;
const same = (left: unknown, right: unknown) => canonicalReleaseReviewJson(left) === canonicalReleaseReviewJson(right);
const hash = (text: string) => createHash('sha256').update(text).digest('hex');

/** Missing selection is the original legacy path; partial/foreign input never falls back. */
export function backendSelectionForWebEvent(raw: unknown, eventName: string, environment: string): WebBackendSelection | null {
  try {
    const event = z.object({ inputs: z.record(z.string(), z.unknown()).optional() }).passthrough().parse(JSON.parse(canonicalReleaseReviewJson(raw)));
    const values = ['backend_run_id', 'backend_run_attempt', 'backend_artifact_id', 'backend_transfer_sha256'].map(key => event.inputs?.[key]);
    if (values.every(value => value === undefined || value === '')) return null;
    if (eventName !== 'workflow_dispatch' || environment !== 'staging' || values.some(value => typeof value !== 'string' || value.length === 0)
      || !/^[1-9][0-9]{0,19}$/.test(String(values[1]))) throw fail();
    return selectionSchema.parse({ backendRunId: values[0], backendRunAttempt: Number(values[1]), artifactId: values[2], transferSha256: values[3] });
  } catch { throw fail(); }
}
export function readWebBackendSelection(encoded: string): WebBackendSelection | null {
  try {
    if (encoded === '') return null;
    if (encoded.length > 2048 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw fail();
    const text = new TextDecoder('utf8', { fatal: true }).decode(Buffer.from(encoded, 'base64'));
    if (Buffer.from(text).toString('base64') !== encoded) throw fail();
    return selectionSchema.parse(parseCanonicalReleaseReviewJson(text));
  } catch { throw fail(); }
}
export function encodeWebBackendSelection(selection: WebBackendSelection | null) { return selection ? Buffer.from(canonicalReleaseReviewJson(selection)).toString('base64') : ''; }

export async function readWebBackendBridge(input: { selection: WebBackendSelection; repoRoot: string; githubToken: string; releaseSha: string; ciRunId: string; environment: string; web: { teamId: string; projectId: string; target: 'preview' | 'production' } }): Promise<WebBackendBridge> {
  try {
    if (input.environment !== 'staging' || input.web.target !== 'preview') throw fail();
    const result = await readCompletedBackendWebTransferAdmission({ ...selectionSchema.parse(input.selection), repoRoot: input.repoRoot, githubToken: input.githubToken, releaseSha: input.releaseSha, ciRunId: input.ciRunId, web: input.web });
    // Consumer read times change. Every original proof and identity stays bound.
    return { purpose: result.purpose, provenance: result.provenance, manifest: result.manifest, publicConfig: result.publicConfig, reviewFacts: result.reviewFacts, assignments: result.assignments, originalEvidence: result.originalEvidence,
      backendIdentity: result.backendIdentity, privateProofReexecuted: false, backendMutationAllowed: false, customerReady: false, hostedAcceptance: false };
  } catch { throw fail(); }
}

/** Only actual operator web review supplies independent-attestation flags.
 * Backend facts constrain it; they never create a second passing review. */
export function bindWebReviewToBackend(raw: unknown, assignmentsRaw: unknown, bridge: WebBackendBridge): ReleaseReviewInput {
  try {
    const input = JSON.parse(canonicalReleaseReviewJson(raw)) as ReleaseReviewInput;
    const assignments = z.object({ baseSha: z.string(), reviews: z.array(z.object({ category: z.string(), taskId: z.string(), reportSha256: digest, evidenceSha256: digest }).strict()).length(2) }).strict().parse(JSON.parse(canonicalReleaseReviewJson(assignmentsRaw)));
    const b = bridge.backendIdentity;
    if (input.version !== 1 || input.repository !== b.repository || input.releaseSha !== b.sourceSha || input.baseSha !== b.baseSha || input.ciRunId !== b.ciRunId
      || assignments.baseSha !== b.baseSha || !same([...assignments.reviews].sort((a, b) => a.category.localeCompare(b.category)), [...bridge.assignments].sort((a, b) => a.category.localeCompare(b.category)))
      || !same(input.web, { teamId: b.web.teamId, projectId: b.web.projectId, target: b.web.target }) || !Array.isArray(input.reviews) || input.reviews.length !== 2) throw fail();
    for (const row of input.reviews) {
      const original = bridge.reviewFacts.find(fact => fact.category === row.category);
      if (!original || row.provenance !== 'RETAINED_INDEPENDENT_AGENT_REPORT' || row.independenceAttested !== true
        || !same({ category: row.category, taskId: row.taskId, releaseSha: row.releaseSha, baseSha: row.baseSha, sourceManifestSha256: row.sourceManifestSha256, diffSha256: row.diffSha256, reportSha256: row.reportSha256, evidenceSha256: row.evidenceSha256, reviewedAt: row.reviewedAt },
          { category: original.category, taskId: original.taskId, releaseSha: original.releaseSha, baseSha: original.baseSha, sourceManifestSha256: original.sourceManifestSha256, diffSha256: original.diffSha256, reportSha256: original.reportSha256, evidenceSha256: original.evidenceSha256, reviewedAt: original.reviewedAt })) throw fail();
    }
    const manifestSha256 = hash(canonicalReleaseReviewJson(bridge.manifest));
    if (manifestSha256 !== b.manifestSha256) throw fail();
    return { ...input, manifestSha256 };
  } catch { throw fail(); }
}

export function readCanonicalWebOutput(base64: string, maximum = 48 * 1024): unknown {
  try {
    if (!base64 || base64.length > Math.ceil(maximum * 4 / 3) || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw fail();
    const text = new TextDecoder('utf8', { fatal: true }).decode(Buffer.from(base64, 'base64'));
    if (Buffer.byteLength(text) > maximum || Buffer.from(text).toString('base64') !== base64) throw fail();
    return parseCanonicalReleaseReviewJson(text);
  } catch { throw fail(); }
}
