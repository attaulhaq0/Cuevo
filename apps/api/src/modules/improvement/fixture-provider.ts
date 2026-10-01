import type { AIProvider } from './orchestrator';

/** Deterministic synthetic execution. It does not contact a model or claim model quality. */
export function createFixtureProvider(): AIProvider {
  return { generate: async ({ context, insight, signal }) => {
    signal.throwIfAborted();
    return { output: { evidenceIds: [context.evidenceId], facts: [{ kind: 'NUMERIC_RESULT', ...context }],
      action: 'GUIDED_PRACTICE', reason: 'REVIEW_RECORDED_RESULT', limitation: 'SINGLE_RESULT_NOT_CAUSAL', ...(insight?.learningOptions.find(option => option.kind === 'practice') ? { selectedActivityId: insight.learningOptions.find(option => option.kind === 'practice')!.activityId } : {}) }, outputTokens: 0, cost: 0 };
  } };
}
