import { describe, expect, it } from 'vitest';
import { resourceStageSchema, resourceAttachSchema, resourceRevisionSchema, resourcePublishSchema } from '@cuevo/contracts';
import { assetContentDisposition } from '../../src/modules/assets/public';
const id = '00000000-0000-4000-8000-000000000001';
describe('private learning resource boundary', () => {
  it('accepts Arabic display names without accepting header/path controls', () => {
    const base = { name: 'ورقة التحقق.pdf', contentType: 'application/pdf', byteSize: 100, sha256: 'a'.repeat(64) };
    expect(resourceStageSchema.safeParse(base).success).toBe(true);
    for (const name of ['../answer.pdf', 'a\\b.pdf', 'a\r\nheader.pdf', 'a\u202efile.pdf']) expect(resourceStageSchema.safeParse({ ...base, name }).success).toBe(false);
    expect(assetContentDisposition(base.name)).toContain("filename*=UTF-8''");
    expect(assetContentDisposition(base.name)).not.toContain('\n');
  });
  it('requires verified artifact identity and separate explicit publication/removal', () => {
    expect(resourceAttachSchema.safeParse({ assetId: id, title: 'Checking worksheet', sequence: 1 }).success).toBe(true);
    expect(resourceRevisionSchema.safeParse({ assetId: id, expectedRevision: 1, reason: 'Teacher replaces the worksheet.' }).success).toBe(true);
    expect(resourcePublishSchema.safeParse({ expectedRevision: 1, confirmPublication: true }).success).toBe(true);
    expect(resourcePublishSchema.safeParse({ expectedRevision: 1 }).success).toBe(false);
  });
});
