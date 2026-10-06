import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config as dotenv } from 'dotenv';
import { createHash } from 'node:crypto';
import { createCustomerContext, customerActor, customerCourse, customerReleased, type CustomerContext } from './customer-test-context';

dotenv({ path: '.env.local', quiet: true });
const enabled = process.env.CUEVO_REQUIRE_INTEGRATION === '1';
describe.skipIf(!enabled)('independent customer API dirty-input and entitlement withdrawal', () => {
  let context: CustomerContext;
  beforeAll(async () => { context = await createCustomerContext(); }, 60_000);
  afterAll(async () => { await context?.close(); });
  it('academic entitlement revocation cannot deliver source data through cached state, report or evidence', async () => {
    const course = await customerCourse(context, 'Entitlement source withdrawal'); const source = await customerReleased(context, 'strong', course.courseId, 'Protected released result', 6); await context.drain();
    const before = await context.request('strong', `/v1/learners/${customerActor(12)}/state`); expect(before.statusCode).toBe(200); expect(before.json().academic.some((item: { resultId: string }) => item.resultId === source.resultId)).toBe(true);
    await context.client.query("update app.entitlements set enabled=false where school_id=$1 and code='assessment'", [context.school]);
    const denied = await context.request('strong', `/v1/learners/${customerActor(12)}/state`); expect(denied.statusCode).toBe(200); expect(denied.json().academic).toEqual([]); expect(denied.body).not.toContain(source.evidenceId);
    expect((await context.request('strong', `/v1/learners/${customerActor(12)}/academic-report?limit=25`)).statusCode).toBe(403);
    expect((await context.request('parent', `/v1/evidence/${source.evidenceId}`)).statusCode).toBe(403);
    await context.client.query("update app.entitlements set enabled=true where school_id=$1 and code='assessment'", [context.school]);
    expect((await context.request('strong', `/v1/evidence/${source.evidenceId}`)).statusCode).toBe(200);
  }, 30_000);
  it('malformed private file names/types/sizes and another owner are denied before asset authority is written', async () => {
    const metadata = { ownerId: customerActor(12), name: 'synthetic.txt', contentType: 'text/plain', byteSize: 4, sha256: createHash('sha256').update('safe').digest('hex') };
    for (const bad of [{ name: '../private.txt' }, { name: 'quote"\r\n.txt' }, { name: 'x'.repeat(121) }, { contentType: 'text/html' }, { byteSize: 524289 }, { byteSize: 0 }]) { const response = await context.request('strong', '/v1/assets', { ...metadata, ...bad }); expect(response.statusCode).toBe(400); expect(response.body).not.toMatch(/stack|postgres|supabase|SELECT|INSERT/); }
    expect((await context.request('strong', '/v1/assets', { ...metadata, ownerId: customerActor(13) })).statusCode).toBe(403);
    expect((await context.request('parent', '/v1/assets', metadata)).statusCode).toBe(403);
    expect((await context.client.query('select count(*)::integer count from app.private_assets where school_id=$1', [context.school])).rows[0].count).toBe(0);
  });
  it('mismatched bytes and executable text/PDF tokens fail without finalize audit, outbox or storage delivery', async () => {
    const examples = [
      { bytes: Buffer.from('mismatched'), declared: Buffer.from('expected'), type: 'text/plain', code: 'ASSET_INTEGRITY_MISMATCH' },
      { bytes: Buffer.from('<script>alert(1)</script>'), type: 'text/plain', code: 'ASSET_CONTENT_REQUIRES_REVIEW' },
      { bytes: Buffer.from('%PDF-1.7\n/JavaScript (synthetic)'), type: 'application/pdf', code: 'ASSET_CONTENT_REQUIRES_REVIEW' },
      { bytes: Buffer.from('not a PNG'), type: 'image/png', code: 'ASSET_CONTENT_REQUIRES_REVIEW' },
    ];
    for (const example of examples) {
      const staged = await context.command('strong', '/v1/assets', { ownerId: customerActor(12), name: 'rejected-synthetic-verification.txt', contentType: example.type, byteSize: (example.declared ?? example.bytes).length, sha256: createHash('sha256').update(example.declared ?? example.bytes).digest('hex') });
      const response = await context.request('strong', `/v1/assets/${staged.id}/finalize`, { contentBase64: example.bytes.toString('base64') }); expect(response.statusCode).toBe(409); expect(response.json().code).toBe(example.code);
      expect((await context.client.query('select state from app.private_assets where school_id=$1 and id=$2', [context.school, staged.id])).rows[0].state).toBe('STAGED');
      expect((await context.client.query("select count(*)::integer count from internal.audit_events where school_id=$1 and entity_id=$2 and action='asset.finalize'", [context.school, staged.id])).rows[0].count).toBe(0);
      expect((await context.client.query("select count(*)::integer count from internal.outbox_events where school_id=$1 and entity_id=$2 and deduplication_key=$3", [context.school, staged.id, `asset:finalize:${staged.id}`])).rows[0].count).toBe(0);
      expect((await context.request('strong', `/v1/assets/${staged.id}/download`)).statusCode).toBe(404);
    }
  });
});
