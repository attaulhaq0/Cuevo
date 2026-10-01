export type LearningApiConfig = { apiUrl: string; accessToken: string; schoolId: string };
export type Command = { key: string; path: string; body: Record<string, unknown> };
export class LearningApiError extends Error {
  kind: 'unavailable' | 'denied' | 'unauthorized' | 'conflict' | 'invalid' | 'too-large';
  uncertain: boolean;
  requestId?: string;
  constructor(kind: LearningApiError['kind'], uncertain = false, requestId?: string) {
    super('Learning request could not be completed.');
    this.kind = kind; this.uncertain = uncertain; this.requestId = requestId;
  }
}
export class CommandJournal {
  private commands = new Map<string, Command>();
  prepare(slot: string, path: string, body: Record<string, unknown>): Command {
    const existing = this.commands.get(slot);
    if (existing) {
      if (existing.path !== path || JSON.stringify(existing.body) !== JSON.stringify(body)) throw new LearningApiError('conflict', true);
      return existing;
    }
    const command = { key: crypto.randomUUID(), path, body: structuredClone(body) };
    this.commands.set(slot, command);
    return command;
  }
  get(slot: string): Command | undefined { return this.commands.get(slot); }
  confirm(slot: string): void { this.commands.delete(slot); }
  clear(): void { this.commands.clear(); }
}
export async function apiRequest(config: LearningApiConfig, path: string, options: { method?: 'GET' | 'POST'; key?: string; body?: Record<string, unknown>; signal?: AbortSignal } = {}): Promise<unknown> {
  const mutation = options.method === 'POST';
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
  } catch { throw new LearningApiError('unavailable', mutation); }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const requestId = payload && typeof payload === 'object' && 'requestId' in payload && typeof payload.requestId === 'string' ? payload.requestId : undefined;
    const kind = response.status === 401 ? 'unauthorized' : response.status === 403 ? 'denied' : response.status === 409 ? 'conflict' : response.status === 413 ? 'too-large' : response.status >= 500 || response.status === 429 ? 'unavailable' : 'invalid';
    throw new LearningApiError(kind, mutation && (response.status >= 500 || response.status === 429), requestId);
  }
  if (!payload || typeof payload !== 'object') throw new LearningApiError('invalid', mutation);
  return payload;
}
