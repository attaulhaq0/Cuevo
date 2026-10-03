import assert from 'node:assert/strict';
import test from 'node:test';
import { baselineLabel } from '../labels.ts';
import type { NumericReleasedResult } from '../../academic/model.ts';
test('baseline choices identify the learner, current class, assessment and source date without a UUID fallback', () => {
  const result = { id: 'opaque-result-id', model:'numeric', learnerId: 'learner-id', assessmentTitle: 'Checking explanation', score: 3, maxScore: 10, nativeResult:{type:'numeric',score:3,maxScore:10,policyVersion:2,normalized:null}, createdAt: '2026-10-01T00:00:00Z', revision: 2 } as NumericReleasedResult;
  const label = baselineLabel(result, [{ id: 'learner-id', userId: 'learner-id', displayName: 'Lina Al-Kuwari', role: 'student', classLabels: ['Year 8 · Cedar · 2026–2027'] }], 'en', 'Name unavailable');
  assert.match(label, /Lina Al-Kuwari.*Year 8.*Checking explanation.*3 \/ 10.*Revision 2/);
  assert.ok(!label.includes(result.id));
});
