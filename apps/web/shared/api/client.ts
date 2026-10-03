export type LearningApiConfig = { apiUrl: string; accessToken: string; schoolId: string };
export type Command = { key: string; path: string; body: Record<string, unknown> };
export type ApiObservation = { category: 'api_request' | 'api_error' | 'response_invalid'; status: 'success' | 'unauthorized' | 'denied' | 'conflict' | 'invalid' | 'unavailable' | 'unknown'; durationMs: number };
export class LearningApiError extends Error {
  kind: 'unavailable' | 'denied' | 'unauthorized' | 'conflict' | 'invalid' | 'too-large' | 'ai-unavailable' | 'ai-failed';
  uncertain: boolean;
  requestId?: string;
  constructor(kind: LearningApiError['kind'], uncertain = false, requestId?: string) {
    super('Learning request could not be completed.');
    this.kind = kind; this.uncertain = uncertain; this.requestId = requestId;
  }
}
export class CommandJournal {
  private commands = new Map<string, Command>();
  private revision = 0;
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.revision;
  private changed() { this.revision++; for (const listener of this.listeners) { try { listener(); } catch { /* Subscribers cannot change command settlement. */ } } }
  prepare(slot: string, path: string, body: Record<string, unknown>): Command {
    const existing = this.commands.get(slot);
    if (existing) {
      if (existing.path !== path || JSON.stringify(existing.body) !== JSON.stringify(body)) throw new LearningApiError('conflict', true);
      return existing;
    }
    const command = { key: crypto.randomUUID(), path, body: structuredClone(body) };
    this.commands.set(slot, command);
    this.changed();
    return command;
  }
  get(slot: string): Command | undefined { return this.commands.get(slot); }
  /** Feature recovery may inspect original commands without changing the journal. */
  pending(): Command[] { return [...this.commands.values()].map(command => structuredClone(command)); }
  confirm(slot: string, expectedKey?: string): boolean {
    const command = this.commands.get(slot);
    if (!command || expectedKey !== undefined && command.key !== expectedKey) return false;
    const removed = this.commands.delete(slot); if (removed) this.changed(); return removed;
  }
  clear(): void { if (this.commands.size) { this.commands.clear(); this.changed(); } }
}
export function confirmCommandReceipt(journal: CommandJournal, slot: string, expectedKey: string, receipt: unknown, onCurrentReceipt?: (receipt: unknown) => void, validateReceipt?: (receipt: unknown, originalCommand: Command) => void): boolean {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) || !('id' in receipt) || typeof receipt.id !== 'string' || !receipt.id) throw new LearningApiError('invalid', true);
  const originalCommand = journal.get(slot);
  if (!originalCommand || originalCommand.key !== expectedKey) return false;
  try {
    validateReceipt?.(receipt, originalCommand);
    if (journal.get(slot)?.key !== expectedKey) return false;
    onCurrentReceipt?.(receipt);
  } catch { throw new LearningApiError('invalid', true); }
  return journal.confirm(slot, expectedKey);
}
export async function apiRequest(config: LearningApiConfig, path: string, options: { method?: 'GET' | 'POST'; key?: string; body?: Record<string, unknown>; signal?: AbortSignal; observe?: (value: ApiObservation) => void } = {}): Promise<unknown> {
  const mutation = options.method === 'POST';
  const started = performance.now();
  const observe = (category: ApiObservation['category'], status: ApiObservation['status']) => { if (options.signal?.aborted) return; try { options.observe?.({ category, status, durationMs: Math.max(0, performance.now() - started) }); } catch { /* Diagnostics cannot change the request outcome. */ } };
  if (!config.accessToken || !config.schoolId || !path.startsWith('/v1/') || (mutation && !options.key)) throw new LearningApiError('invalid');
  const headers: Record<string, string> = { Accept: 'application/json', Authorization: `Bearer ${config.accessToken}`, 'x-school-id': config.schoolId };
  if (mutation) { headers['Content-Type'] = 'application/json'; headers['Idempotency-Key'] = options.key!; }
  let response: Response;
  try {
    response = await fetch(`${config.apiUrl.replace(/\/$/, '')}${path}`, {
      method: options.method ?? 'GET', headers, credentials: 'omit', cache: 'no-store',
      body: mutation ? JSON.stringify(options.body ?? {}) : undefined,
      signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
    });
  } catch { observe('api_error', 'unavailable'); throw new LearningApiError('unavailable', mutation); }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const requestId = payload && typeof payload === 'object' && 'requestId' in payload && typeof payload.requestId === 'string' ? payload.requestId : undefined;
    const code = payload && typeof payload === 'object' && 'code' in payload ? payload.code : undefined;
    const terminalAnalysis = typeof code === 'string' && ['INTELLIGENCE_TIMEOUT', 'INTELLIGENCE_LIMIT_EXCEEDED', 'INTELLIGENCE_PROVIDER_FAILED', 'INTELLIGENCE_REQUIRES_REVIEW', 'INTELLIGENCE_INSUFFICIENT_EVIDENCE'].includes(code);
    const kind = response.status === 503 && code === 'INTELLIGENCE_UNAVAILABLE' ? 'ai-unavailable' : terminalAnalysis ? 'ai-failed' : response.status === 401 ? 'unauthorized' : response.status === 403 ? 'denied' : response.status === 409 ? 'conflict' : response.status === 413 ? 'too-large' : response.status >= 500 || response.status === 429 ? 'unavailable' : 'invalid';
    const pendingOutcome=code==='INTELLIGENCE_OUTCOME_UNKNOWN'||code==='COMMAND_IN_PROGRESS';
    observe('api_error', kind === 'ai-unavailable' || kind === 'ai-failed' || kind === 'too-large' ? kind === 'too-large' ? 'invalid' : 'unavailable' : kind);
    throw new LearningApiError(kind, mutation && (pendingOutcome || kind !== 'ai-unavailable' && kind !== 'ai-failed' && (response.status >= 500 || response.status === 429)), requestId);
  }
  if (!payload || typeof payload !== 'object') { observe('response_invalid', 'invalid'); throw new LearningApiError('invalid', mutation); }
  observe('api_request', 'success');
  return payload;
}
