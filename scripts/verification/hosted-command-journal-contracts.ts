import { z } from 'zod';

export type HostedCommandJournalRecipe = 'learning-loop' | 'community';

function identitySchema() {
  const digest = z.string().regex(/^[a-f0-9]{64}$/), sha = z.string().regex(/^[a-f0-9]{40}$/);
  const uuid = z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  const runId = z.string().regex(/^[1-9][0-9]{0,19}$/).refine(value => Number.isSafeInteger(Number(value)));
  return z.object({
    projectRef: z.string().regex(/^[a-z]{20}$/), schoolId: uuid, sourceSha: sha, treeSha: sha,
    ciRunId: runId, runId, runAttempt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    backendTransferSha256: digest, webDeploymentId: z.string().regex(/^dpl_[A-Za-z0-9]{1,100}$/),
  }).strict();
}

function contracts<const P extends string, const O extends readonly [string, ...string[]]>(purpose: P, folder: string, message: string, operations: O) {
  const digest = z.string().regex(/^[a-f0-9]{64}$/);
  const uuid = z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  const identity = identitySchema();
  const commandSchema = z.object({
    step: z.string().regex(/^[a-z][a-z0-9_.:-]{0,99}$/), actorId: uuid,
    role: z.enum(['admin', 'teacher', 'student', 'coordinator', 'parent']), schoolId: uuid,
    path: z.string().min(5).max(400).regex(/^\/v1\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/),
    operation: z.enum(operations),
    sourceIds: z.array(uuid).max(16).refine(values => new Set(values).size === values.length),
    sourceRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
    key: z.string().min(8).max(200).regex(/^[A-Za-z0-9_.:-]+$/), requestBodySha256: digest,
  }).strict();
  const stateSchema = z.enum(['INTENT', 'FORWARDING_AUTHORIZED', 'HTTP_CONFIRMED', 'NATIVE_CONFIRMED', 'UNCERTAIN']);
  const originalSchema = z.object({ identity, command: commandSchema, intentSequence: z.number().int().min(1).max(512), intentRecordSha256: digest }).strict();
  const recordSchema = z.object({
    version: z.literal(1), purpose: z.literal(purpose), sequence: z.number().int().min(1).max(512),
    previousRecordSha256: digest.nullable(), identity, command: commandSchema,
    state: stateSchema, intentSequence: z.number().int().min(1).max(512), intentRecordSha256: digest.nullable(),
    httpReceiptSha256: digest.nullable(), nativeReceiptSha256: digest.nullable(),
    nativeProof: z.literal('CALLER_ATTESTED_INDEPENDENT_NATIVE_ORIGINAL_COMMAND_PROOF').nullable(),
    localDurabilityOnly: z.literal(true), recordSha256: digest,
  }).strict();
  const headSchema = z.object({ version: z.literal(1), purpose: z.literal(purpose), sequence: z.number().int().min(1).max(512), recordSha256: digest, previousRecordSha256: digest.nullable() }).strict();
  const httpSchema = z.object({ status: z.literal(200), receiptSha256: digest }).strict();
  const nativeSchema = z.object({ receiptSha256: digest, provenance: z.literal('INDEPENDENT_NATIVE_ORIGINAL_COMMAND_PROOF') }).strict();
  const inputSchema = z.object({ repoRoot: z.string().min(1).max(2048), identity }).strict();
  return { purpose, folder, failure: () => Error(message), commandSchema, originalSchema, recordSchema, headSchema, httpSchema, nativeSchema, inputSchema };
}

function learningLoopContracts() {
  return contracts('CUEVO_HOSTED_LEARNING_LOOP_COMMAND_JOURNAL', 'hosted-learning-loop',
    'Original learning-loop journal ownership or durability requires review; contents withheld.',
    ['course.create', 'unit.create', 'lesson.create', 'activity.create', 'course.publish',
      'assessment.create', 'assessment.preparation', 'assessment.publish', 'activity.complete',
      'submission.draft', 'submission.create', 'assessment.reference', 'marking.create', 'result.release',
      'intelligence.analyze', 'improvement.decision', 'improvement.complete', 'improvement.reassessment',
      'improvement.measure', 'portfolio.create', 'portfolio.review', 'portfolio.revoke', 'intelligence.policy.approve']);
}

function communityContracts() {
  return contracts('CUEVO_HOSTED_COMMUNITY_COMMAND_JOURNAL', 'hosted-community',
    'Original community journal ownership or durability requires review; contents withheld.',
    ['room.create', 'member.configure', 'post.create', 'reaction.configure', 'post.report', 'post.moderate',
      'room.restrict', 'announcement.create', 'notification.read', 'group.lifecycle', 'announcement.withdraw']);
}

/** Only source-owned recipes are selectable. Every selection creates private
 * schemas; consumers cannot mutate a retained schema to broaden another journal. */
export function hostedCommandJournalContracts(recipe: HostedCommandJournalRecipe) {
  if (recipe === 'learning-loop') return learningLoopContracts();
  if (recipe === 'community') return communityContracts();
  throw Error('Hosted command journal recipe requires review; contents withheld.');
}

type ContractMap = { 'learning-loop': ReturnType<typeof learningLoopContracts>; community: ReturnType<typeof communityContracts> };
export type HostedCommandJournalIdentity = z.infer<ReturnType<typeof identitySchema>>;
export type HostedCommandJournalCommand<R extends HostedCommandJournalRecipe> = z.infer<ContractMap[R]['commandSchema']>;
export type HostedCommandJournalOriginal<R extends HostedCommandJournalRecipe> = {
  identity: HostedCommandJournalIdentity; command: HostedCommandJournalCommand<R>; intentSequence: number; intentRecordSha256: string;
};
export type HostedCommandJournalRecord<R extends HostedCommandJournalRecipe> = z.infer<ContractMap[R]['recordSchema']>;
export type HostedCommandJournalState = HostedCommandJournalRecord<HostedCommandJournalRecipe>['state'];
export type HostedCommandJournalCommandState<R extends HostedCommandJournalRecipe> = {
  original: HostedCommandJournalOriginal<R>; state: HostedCommandJournalState; httpReceiptSha256: string | null; nativeReceiptSha256: string | null;
};
export type HostedCommandJournalChain<R extends HostedCommandJournalRecipe> = { records: HostedCommandJournalRecord<R>[]; commands: HostedCommandJournalCommandState<R>[] };
export type HostedCommandJournalRead<R extends HostedCommandJournalRecipe> = HostedCommandJournalChain<R> & {
  lastRecordSha256: string | null; evidence: 'LOCAL_DURABLE_METADATA_ONLY'; hostedAcceptance: false; runnerLossRecoveryVerified: false;
};
export type HostedCommandJournal<R extends HostedCommandJournalRecipe> = {
  intent(command: unknown): Promise<HostedCommandJournalOriginal<R>>;
  startForwarding<T>(original: unknown, forward: () => Promise<T>): Promise<T>;
  recordHttpReceipt(original: unknown, receipt: unknown): Promise<void>;
  recordNativeConfirmation(original: unknown, proof: unknown): Promise<void>;
  markUncertain(original: unknown): Promise<void>;
  read(): Promise<HostedCommandJournalRead<R>>;
};
