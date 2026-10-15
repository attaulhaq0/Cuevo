export type RecoveryDecision = {
  status: 'unknown' | 'refused' | 'advice'; reasons: string[];
  nativeExecutionAuthorized: false; nativeAcceptance: false; authenticCustodyCreated: false; futureEffectAdmitted: false;
  diagnosticReadAdmitted: boolean; preparationReadbackMatches: boolean;
  restorationAdvice: null | { kind: 'RESET_ORIGINAL_TIMEOUT' | 'SET_ORIGINAL_TIMEOUT'; originalValue: string | null; roleOid: string; databaseOid: string; preserveUnrelatedEntries: true };
};
export function decideRecovery(action: string, input: unknown): RecoveryDecision;
