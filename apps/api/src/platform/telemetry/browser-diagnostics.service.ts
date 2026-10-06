import { DomainError, requireCapability, type ActorContext } from '@cuevo/domain';
import { browserDiagnosticSchema, browserDiagnosticsConfigSchema, browserDiagnosticReceiptSchema } from '@cuevo/contracts';
import type { Database } from '../database/database';

const message = 'Browser diagnostics are unavailable for the current school session.';
export class BrowserDiagnosticsService {
  constructor(private readonly database: Database) {}
  async config(actor: ActorContext) {
    requireCapability(actor, actor.schoolId, 'school.context', ['admin', 'coordinator', 'teacher', 'student', 'parent']);
    try {
      return await this.database.actorTransaction(actor.userId, actor.schoolId, async client => {
        const parsed = browserDiagnosticsConfigSchema.safeParse((await client.query('select internal.browser_diagnostics_config() as configuration')).rows[0]?.configuration);
        if (!parsed.success) throw new DomainError('DIAGNOSTICS_UNAVAILABLE', 503, message);
        return parsed.data;
      });
    } catch (error) { throw safeDiagnosticsError(error); }
  }
  async record(actor: ActorContext, payload: unknown, key: string | undefined, requestId: string) {
    requireCapability(actor, actor.schoolId, 'school.context', ['admin', 'coordinator', 'teacher', 'student', 'parent']);
    const parsed = browserDiagnosticSchema.safeParse(payload);
    if (!parsed.success || key !== parsed.data.diagnosticId) throw new DomainError('INVALID_DIAGNOSTIC', 400, 'Browser diagnostic observation is invalid.');
    try {
      return await this.database.actorTransaction(actor.userId, actor.schoolId, async client => {
        const receipt = browserDiagnosticReceiptSchema.safeParse((await client.query('select internal.record_browser_diagnostic($1::jsonb,$2::text) as receipt', [JSON.stringify(parsed.data), requestId])).rows[0]?.receipt);
        if (!receipt.success) throw new DomainError('DIAGNOSTICS_UNAVAILABLE', 503, message);
        return receipt.data;
      });
    } catch (error) { throw safeDiagnosticsError(error); }
  }
}
function safeDiagnosticsError(error: unknown): DomainError {
  if (error instanceof DomainError) return error;
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  return new DomainError(code === '42501' ? 'DIAGNOSTICS_DENIED' : code === 'P0003' ? 'DIAGNOSTICS_LIMIT_REACHED' : code === '22023' ? 'INVALID_DIAGNOSTIC' : 'DIAGNOSTICS_UNAVAILABLE', code === '42501' ? 403 : code === 'P0003' ? 429 : code === '22023' ? 400 : 503, message);
}
