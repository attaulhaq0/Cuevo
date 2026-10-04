import assert from 'node:assert/strict';
import test from 'node:test';
import { LearningApiError } from '../../../shared/api/client.ts';
import { currentAuditDenial, admittedAuditRows } from '../audit-read-model.ts';

const rows = [{ id: 'current-source', actorName: 'Mariam Al-Nuaimi', action: 'school.policy', objectName: null }];
const ready = { data: rows, loading: false, error: null, moreError: null };

test('audit initial and continuation authorization refusal remove previously admitted facts', () => {
  for (const kind of ['denied', 'unauthorized'] as const) {
    for (const key of ['error', 'moreError'] as const) {
      const source = { ...ready, [key]: new LearningApiError(kind) };
      const denial = currentAuditDenial(null, 'current-admin-read', source);
      assert.equal(denial?.error.kind, kind);
      assert.deepEqual(admittedAuditRows(source, denial), []);
    }
  }
});
test('a same-scope continuation retry cannot reveal an audit page after its denial clears', () => {
  const denial = currentAuditDenial(null, 'current-admin-read', { ...ready, moreError: new LearningApiError('denied') });
  const retained = currentAuditDenial(denial, 'current-admin-read', ready);
  assert.equal(retained, denial); assert.deepEqual(admittedAuditRows(ready, retained), []);
  const fresh = currentAuditDenial(retained, 'fresh-admin-read', ready);
  assert.equal(fresh, null); assert.deepEqual(admittedAuditRows({ ...ready, loading: true }, fresh), []);
  assert.deepEqual(admittedAuditRows(ready, currentAuditDenial(fresh, 'fresh-admin-read', ready)), rows);
});
test('temporary audit continuation outage preserves only the authorized loaded partial page', () => {
  const source = { ...ready, moreError: new LearningApiError('unavailable') };
  assert.equal(currentAuditDenial(null, 'current-admin-read', source), null);
  assert.deepEqual(admittedAuditRows(source, null), rows);
  assert.deepEqual(admittedAuditRows({ ...ready, error: new LearningApiError('unavailable') }, null), []);
});
