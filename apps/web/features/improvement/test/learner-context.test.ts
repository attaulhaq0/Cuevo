import assert from 'node:assert/strict';
import test from 'node:test';
import { improvementLearnerContext } from '../labels.ts';
import type { PersonChoice } from '../../../shared/api/people.ts';

const learner: PersonChoice = { id: 'learner', userId: 'learner', role: 'student', displayName: 'Alex', classLabels: ['Cedar · Year 6 · 2026–2027'] };
test('current support identity resolves only one exact authorized learner with human class context', () => {
  assert.equal(improvementLearnerContext('learner', [learner], 'Unavailable'), 'Alex · Cedar · Year 6 · 2026–2027');
  assert.equal(improvementLearnerContext('other', [learner], 'Unavailable'), 'Unavailable');
  assert.equal(improvementLearnerContext('learner', [{ ...learner, role: 'teacher' }], 'Unavailable'), 'Unavailable');
  assert.equal(improvementLearnerContext('learner', [learner, { ...learner, displayName: 'Different returned identity' }], 'Unavailable'), 'Unavailable');
});
test('matching human labels and missing class context require review without displaying an identifier', () => {
  assert.equal(improvementLearnerContext('learner', [learner, { ...learner, id: 'other', userId: 'other' }], 'Review school records'), 'Review school records');
  assert.equal(improvementLearnerContext('learner', [{ ...learner, classLabels: [] }], 'Review school records'), 'Review school records');
  assert.equal(improvementLearnerContext('learner', [], 'Review school records'), 'Review school records');
});
