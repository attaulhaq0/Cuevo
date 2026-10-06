import { describe, expect, it } from 'vitest';
import { browserDiagnosticSchema, browserDiagnosticsConfigSchema } from '@cuevo/contracts';

const diagnostic = { diagnosticId: '00000000-0000-4000-8000-000000000001', category: 'api_error', feature: 'learning', status: 'denied', timing: 'under_250ms', locale: 'en', viewport: 'desktop' };

describe('minimized current-session browser diagnostics contract', () => {
  it('accepts only the fixed observation fields and a random version-four identity', () => {
    expect(browserDiagnosticSchema.parse(diagnostic)).toEqual(diagnostic);
    expect(browserDiagnosticsConfigSchema.parse({ enabled: false })).toEqual({ enabled: false });
  });
  it('rejects raw content, identifiers, invented categories and nonrandom source identities', () => {
    for (const key of ['message', 'stack', 'url', 'accessToken', 'schoolId', 'actorId', 'selectedChildId', 'requestBody', 'requestId']) {
      expect(browserDiagnosticSchema.safeParse({ ...diagnostic, [key]: 'private' }).success).toBe(false);
    }
    for (const value of [{ category: 'private_exception' }, { feature: '/v1/learner/private' }, { status: 403 }, { timing: 4.5 }, { diagnosticId: '00000000-0000-1000-8000-000000000001' }, { diagnosticId: '00000000-0000-0000-0000-000000000000' }]) {
      expect(browserDiagnosticSchema.safeParse({ ...diagnostic, ...value }).success).toBe(false);
    }
    expect(browserDiagnosticsConfigSchema.safeParse({ enabled: true, projectKey: 'secret' }).success).toBe(false);
  });
});
