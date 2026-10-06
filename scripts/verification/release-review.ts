import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { z } from 'zod';

const maximumBytes = 48 * 1024;
const maximumAgeMs = 24 * 60 * 60 * 1000;
const fail = (): never => { throw Error('Release review or founder approval is invalid, unavailable or requires review; contents withheld.'); };
const sha = z.string().regex(/^[a-f0-9]{40}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const identifier = z.string().regex(/^[1-9][0-9]{0,19}$/).refine(value => Number.isSafeInteger(Number(value)));
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const repository = z.string().regex(/^[a-zA-Z0-9_.-]{1,100}\/[a-zA-Z0-9_.-]{1,100}$/);
const category = z.enum(['source-spec-code', 'qa-regression-operations']);
const taskId = z.string().min(1).max(200).regex(/^[a-zA-Z0-9_./:-]+$/);
const webTarget=z.object({teamId:z.string().regex(/^team_[a-zA-Z0-9]+$/),projectId:z.string().regex(/^prj_[a-zA-Z0-9]+$/),target:z.enum(['preview','production'])}).strict();
const reviewSchema = z.object({
  category, taskId, releaseSha: sha, baseSha: sha, sourceManifestSha256: digest, diffSha256: digest,
  reportSha256: digest, evidenceSha256: digest, reviewedAt: z.iso.datetime({ offset: true }),
  provenance: z.literal('RETAINED_INDEPENDENT_AGENT_REPORT'), independenceAttested: z.literal(true),
}).strict();
const reviewAssignmentSchema = z.object({ category, taskId, reportSha256: digest, evidenceSha256: digest }).strict();
const inputSchema = z.object({
  version: z.literal(1), repository, releaseSha: sha, baseSha: sha, ciRunId: identifier,
  manifestSha256: digest, sourceManifestSha256: digest, diffSha256: digest,
  web:webTarget,
  reviews: z.array(reviewSchema).length(2),
}).strict();
const expectedSchema = z.object({
  repository, releaseSha: sha, baseSha: sha, ciRunId: identifier, releaseRunId: identifier,
  runAttempt: positive, environmentId: positive, environmentName: z.enum(['staging', 'production']),
  now: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), manifestSha256: digest,
  sourceManifestSha256: digest, diffSha256: digest, reviews: z.array(reviewAssignmentSchema).length(2),
  web:webTarget,
}).strict();
const packageSchema = inputSchema.extend({
  purpose: z.literal('PREBUILD_RELEASE_ADMISSION'), releaseRunId: identifier, runAttempt: positive,
  environmentId: positive, environmentName: z.enum(['staging', 'production']),
  preparedAt: z.iso.datetime({ offset: true }),
}).strict();
const preparedSchema = z.object({ canonicalJson: z.string().max(maximumBytes), base64: z.string().max(maximumBytes * 4 / 3), sha256: digest, comment: z.string().max(300) }).strict();

export type ReleaseReviewInput = z.infer<typeof inputSchema>;
export type ReleaseReviewExpected = z.infer<typeof expectedSchema>;
export type PreparedReleaseReviewPackage = z.infer<typeof preparedSchema>;

/** Exact JSON bytes only: callers cannot smuggle getters, prototypes or omitted values into the hash. */
export function canonicalReleaseReviewJson(value: unknown): string {
  return canonicalJson(value, maximumBytes);
}
/** Bounded operator execution bundle only; approval/review packages retain their 48 KiB limit. */
export function canonicalReleaseExecutionJson(value: unknown): string {
  return canonicalJson(value, 1024 * 1024, 100000);
}
export function parseReleaseExecutionJson(text: string): unknown {
  try {
    if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 1024 * 1024) return fail();
    const value: unknown = JSON.parse(text);
    if (canonicalReleaseExecutionJson(value) !== text) return fail();
    return value;
  } catch { return fail(); }
}
function canonicalJson(value: unknown, maximum: number, maximumNodes = 10000): string {
  let nodes = 0;
  const active = new Set<object>();
  function encode(item: unknown, depth: number): string {
    if (++nodes > maximumNodes || depth > 20) return fail();
    if (item === null) return 'null';
    if (typeof item === 'boolean') return item ? 'true' : 'false';
    if (typeof item === 'number') { if (!Number.isFinite(item) || Object.is(item, -0)) return fail(); return JSON.stringify(item); }
    if (typeof item === 'string') {
      // UTF-8 encoding of a lone surrogate would replace the original code unit.
      for (let index = 0; index < item.length; index++) {
        const code = item.charCodeAt(index);
        if (code >= 0xd800 && code <= 0xdbff) {
          const next = item.charCodeAt(++index);
          if (!(next >= 0xdc00 && next <= 0xdfff)) return fail();
        } else if (code >= 0xdc00 && code <= 0xdfff) return fail();
      }
      return JSON.stringify(item);
    }
    if (!item || typeof item !== 'object' || types.isProxy(item) || active.has(item)) return fail();
    active.add(item);
    try {
      if (Array.isArray(item)) {
        if (Reflect.ownKeys(item).length !== item.length + 1) return fail();
        const values: string[] = [];
        for (let index = 0; index < item.length; index++) {
          const property = Object.getOwnPropertyDescriptor(item, String(index));
          if (!property || !('value' in property) || !property.enumerable) return fail();
          values.push(encode(property.value, depth + 1));
        }
        return `[${values.join(',')}]`;
      }
      if (![Object.prototype, null].includes(Object.getPrototypeOf(item))) return fail();
      const keys = Reflect.ownKeys(item);
      if (keys.some(key => typeof key !== 'string')) return fail();
      return `{${(keys as string[]).sort().map(key => {
        const property = Object.getOwnPropertyDescriptor(item, key);
        if (!property || !('value' in property) || !property.enumerable) return fail();
        return `${encode(key, depth + 1)}:${encode(property.value, depth + 1)}`;
      }).join(',')}}`;
    } finally { active.delete(item); }
  }
  const text = encode(value, 0);
  if (Buffer.byteLength(text, 'utf8') > maximum) return fail();
  return text;
}

/** A raw JSON handoff must already be canonical, so duplicate keys or lossy spellings cannot be admitted. */
export function parseCanonicalReleaseReviewJson(text: string): unknown {
  try {
    if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > maximumBytes) return fail();
    const value: unknown = JSON.parse(text);
    if (canonicalReleaseReviewJson(value) !== text) return fail();
    return value;
  } catch { return fail(); }
}

function parse<T>(schema: z.ZodType<T>, value: unknown, maximum = maximumBytes): T {
  // Validate exact JSON first: Zod must never evaluate input accessors or hide undefined fields.
  // Official API objects include irrelevant profile fields, but remain bounded JSON.
  // Packages use the smaller fixed 48 KiB limit; official evidence may include 100 reviews.
  const snapshot=JSON.parse(canonicalJson(value, maximum),(_key,item:unknown)=>{if(item&&typeof item==='object'&&!Array.isArray(item))Object.setPrototypeOf(item,null);return item;}) as unknown;
  const result = schema.safeParse(snapshot);
  if (!result.success) return fail();
  const ownOutput=JSON.parse(canonicalJson(result.data,maximum),(_key,item:unknown)=>{if(item&&typeof item==='object'&&!Array.isArray(item))Object.setPrototypeOf(item,null);return item;}) as T;
  if(canonicalJson(ownOutput,maximum)!==canonicalJson(result.data,maximum))return fail();
  return ownOutput;
}
function fresh(timestamp: string, now: number): void {
  const recorded = Date.parse(timestamp);
  if (!Number.isFinite(recorded) || recorded > now || now - recorded > maximumAgeMs) fail();
}
function checkInput(input: ReleaseReviewInput, expected: ReleaseReviewExpected): void {
  if(canonicalReleaseReviewJson(input.web)!==canonicalReleaseReviewJson(expected.web)||input.web.target!==(expected.environmentName==='staging'?'preview':'production'))fail();
  for (const key of ['repository', 'releaseSha', 'baseSha', 'ciRunId', 'manifestSha256', 'sourceManifestSha256', 'diffSha256'] as const) {
    if (input[key] !== expected[key]) fail();
  }
  for (const rows of [input.reviews, expected.reviews]) {
    if (new Set(rows.map(row => row.taskId)).size !== 2 || new Set(rows.map(row => row.category)).size !== 2) fail();
  }
  for (const review of input.reviews) {
    if (review.releaseSha !== expected.releaseSha || review.baseSha !== expected.baseSha
      || review.sourceManifestSha256 !== expected.sourceManifestSha256 || review.diffSha256 !== expected.diffSha256) fail();
    const assignment = expected.reviews.find(row => row.category === review.category);
    if (!assignment || review.taskId !== assignment.taskId || review.reportSha256 !== assignment.reportSha256
      || review.evidenceSha256 !== assignment.evidenceSha256) fail();
    fresh(review.reviewedAt, expected.now);
  }
}
function approvalComment(sha: string, runId: string, attempt: number, packageDigest: string): string {
  return `Cuevo release admission approved: sha=${sha}; run=${runId}; attempt=${attempt}; package=sha256:${packageDigest}`;
}

/** Report digests and independence are trusted operator attestations, not proof that an agent read the source. */
export function prepareReleaseReviewPackage(value: unknown, expectedValue: ReleaseReviewExpected): PreparedReleaseReviewPackage {
  const expected = parse(expectedSchema, expectedValue);
  const input = parse(inputSchema, value);
  checkInput(input, expected);
  const preparedAt = new Date(expected.now).toISOString();
  const body = { ...input, reviews: [...input.reviews].sort((a, b) => a.category.localeCompare(b.category)),
    purpose: 'PREBUILD_RELEASE_ADMISSION' as const, releaseRunId: expected.releaseRunId, runAttempt: expected.runAttempt,
    environmentId: expected.environmentId, environmentName: expected.environmentName, preparedAt };
  const canonicalJson = canonicalReleaseReviewJson(body);
  const sha256 = createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
  return { canonicalJson, base64: Buffer.from(canonicalJson, 'utf8').toString('base64'), sha256,
    comment: approvalComment(expected.releaseSha, expected.releaseRunId, expected.runAttempt, sha256) };
}

/** Decode only canonical standard base64; this handoff carries no executable artifact. */
export function readPreparedReleaseReviewPackage(base64: string, expectedValue: ReleaseReviewExpected): PreparedReleaseReviewPackage {
  if (typeof base64 !== 'string' || base64.length > maximumBytes * 4 / 3 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) fail();
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.toString('base64') !== base64) fail();
  let canonicalJson: string;
  try { canonicalJson = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return fail(); }
  const body = parse(packageSchema, parseCanonicalReleaseReviewJson(canonicalJson));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return validatePreparedReleaseReviewPackage({ canonicalJson, base64, sha256,
    comment: approvalComment(body.releaseSha, body.releaseRunId, body.runAttempt, sha256) }, expectedValue);
}

/** Re-admit saved bytes at a new clock without changing their original preparation time or digest. */
export function validatePreparedReleaseReviewPackage(preparedValue: unknown, expectedValue: ReleaseReviewExpected): PreparedReleaseReviewPackage {
  const expected = parse(expectedSchema, expectedValue);
  const prepared = parse(preparedSchema, preparedValue, 256 * 1024);
  const body = parse(packageSchema, parseCanonicalReleaseReviewJson(prepared.canonicalJson));
  if (Buffer.from(prepared.canonicalJson, 'utf8').toString('base64') !== prepared.base64
    || createHash('sha256').update(prepared.canonicalJson, 'utf8').digest('hex') !== prepared.sha256) fail();
  if (body.releaseRunId !== expected.releaseRunId || body.runAttempt !== expected.runAttempt
    || body.environmentId !== expected.environmentId || body.environmentName !== expected.environmentName) fail();
  checkInput({ version: body.version, repository: body.repository, releaseSha: body.releaseSha,
    baseSha: body.baseSha, ciRunId: body.ciRunId, manifestSha256: body.manifestSha256,
    sourceManifestSha256: body.sourceManifestSha256, diffSha256: body.diffSha256, reviews: body.reviews,web:body.web }, expected);
  fresh(body.preparedAt, expected.now);
  if (prepared.comment !== approvalComment(expected.releaseSha, expected.releaseRunId, expected.runAttempt, prepared.sha256)) fail();
  return prepared;
}

const officialRunSchema = z.object({
  id: positive, run_attempt: positive, repository: z.object({ full_name: repository }),
  head_sha: sha, head_branch: z.literal('main'), path: z.enum(['.github/workflows/release.yml','.github/workflows/backend-release.yml']),
  event: z.enum(['workflow_dispatch', 'workflow_run']), status: z.enum(['in_progress', 'waiting']),
  conclusion: z.null(),
});
const officialApprovalSchema = z.object({
  environments: z.array(z.object({ id: positive, name: z.string().min(1).max(100) })).min(1).max(20),
  state: z.enum(['approved', 'rejected', 'pending']),
  user: z.object({ id: positive, login: z.string().min(1).max(100), type: z.string().min(1).max(100) }),
  comment: z.string().max(2000),
});

const officialExpectedSchema=z.object({purpose:z.enum(['PREBUILD_RELEASE_ADMISSION','BACKEND_SYNTHETIC_STAGING']),repository,releaseSha:sha,releaseRunId:identifier,runAttempt:positive,environmentId:positive,environmentName:z.enum(['staging','production']),packageSha256:digest,comment:z.string().max(300)}).strict();
export type OfficialFounderApprovalExpected=z.infer<typeof officialExpectedSchema>;

/** Shared official JSON boundary only. Each purpose has its fixed run path/comment and must be preceded by its own package validation. */
export function validateOfficialFounderApproval(rawRun:unknown,rawApprovals:unknown,expectedValue:unknown){
 const expected=parse(officialExpectedSchema,expectedValue);
 const backend=expected.purpose==='BACKEND_SYNTHETIC_STAGING';
 const comment=backend?`Cuevo backend staging admission approved: sha=${expected.releaseSha}; run=${expected.releaseRunId}; attempt=${expected.runAttempt}; package=sha256:${expected.packageSha256}`:approvalComment(expected.releaseSha,expected.releaseRunId,expected.runAttempt,expected.packageSha256);
 if(expected.comment!==comment||backend&&expected.environmentName!=='staging')fail();
 const run=parse(officialRunSchema,rawRun);
 if(String(run.id)!==expected.releaseRunId||run.run_attempt!==expected.runAttempt||run.repository.full_name!==expected.repository||run.head_sha!==expected.releaseSha||run.path!==(backend?'.github/workflows/backend-release.yml':'.github/workflows/release.yml')||backend&&run.event!=='workflow_dispatch')fail();
 const approvals=parse(z.array(officialApprovalSchema).max(100),rawApprovals,512*1024);
 const matching=approvals.filter(row=>row.environments.some(environment=>environment.id===expected.environmentId||environment.name===expected.environmentName));
 if(matching.length!==1)fail();const approval=matching[0];
 if(approval.environments.length!==1||approval.environments[0].id!==expected.environmentId||approval.environments[0].name!==expected.environmentName||approval.state!=='approved'||approval.user.id!==95836629||approval.user.login!=='attaulhaq0'||approval.user.type!=='User'||approval.comment!==comment)fail();
 return{state:'approved' as const,repository:expected.repository,releaseSha:expected.releaseSha,releaseRunId:expected.releaseRunId,runAttempt:expected.runAttempt,environmentId:expected.environmentId,environmentName:expected.environmentName,founderId:95836629,founderLogin:'attaulhaq0',packageSha256:expected.packageSha256};
}

/** Official approvals provide no approval time or attempt. The exact comment binds the separately read run attempt. */
export function validateFounderReleaseApproval(preparedValue:PreparedReleaseReviewPackage,rawRun:unknown,rawApprovals:unknown,expectedValue:ReleaseReviewExpected){
 const expected=parse(expectedSchema,expectedValue),preparedPackage=validatePreparedReleaseReviewPackage(preparedValue,expected);
 return validateOfficialFounderApproval(rawRun,rawApprovals,{purpose:'PREBUILD_RELEASE_ADMISSION',repository:expected.repository,releaseSha:expected.releaseSha,releaseRunId:expected.releaseRunId,runAttempt:expected.runAttempt,environmentId:expected.environmentId,environmentName:expected.environmentName,packageSha256:preparedPackage.sha256,comment:preparedPackage.comment});
}
