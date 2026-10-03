import { describe, expect, it } from 'vitest';
import { AcademicService } from '../../src/modules/academic/academic.service';
import type { Database } from '../../src/platform/database/database';
const actor = { userId: '19000000-0000-4000-8000-000000000001', schoolId: '19000000-0000-4000-8000-000000000002', membershipId: '19000000-0000-4000-8000-000000000003', role: 'teacher' as const, entitlements: ['assessment', 'curriculum'] };
describe('native academic source service errors', () => {
  it('maps source scope denial without returning a generic infrastructure failure or private SQL text', async () => {
    const database = { actorTransaction: async () => { throw Object.assign(Error('Private SQL source details'), { code: '42501' }); } } as unknown as Database;
    await expect(new AcademicService(database).source(actor, '19000000-0000-4000-8000-000000000004')).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403, message: 'The native academic source is unavailable for your current access.' });
  });
});
