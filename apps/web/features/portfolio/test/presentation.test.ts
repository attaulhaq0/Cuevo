import assert from 'node:assert/strict';
import test from 'node:test';
import { portfolioReleasedWorkChoices } from '../presentation-model.ts';
import { parseReleasedResult } from '../../academic/model.ts';

const source = parseReleasedResult({ id: 'result', submissionId: 'submission', learnerId: 'learner', referenceId: 'reference', referenceVersion: 'source-v1', evidenceId: 'evidence', createdAt: '2026-10-01T11:00:00Z', status: 'RELEASED', revision: 1, policyVersion: 1, feedback: 'Show your reasoning.', assessmentTitle: 'My explanation', referenceTitle: 'Checking an explanation', model: 'numeric', score: 0, maxScore: 4, nativeResult: { type: 'numeric', score: 0, maxScore: 4, policyVersion: 1 } });
const labels = { sourceTitleUnavailable: 'Work title unavailable', releasedOn: 'Released', resultRevision: 'Result version' };

test('released work choices distinguish same-name sources through recorded date and revision', () => {
  const choices = portfolioReleasedWorkChoices([source, { ...source, id: 'second-result', evidenceId: 'second-evidence', revision: 2, createdAt: '2026-10-02T11:00:00Z' }], 'en', labels);
  assert.equal(choices.every(choice => !choice.ambiguous), true);
  assert.match(choices[0].label, /My explanation/);
  assert.match(choices[0].label, /Checking an explanation/);
  assert.match(choices[1].label, /Result version 2/);
  assert.equal(choices.some(choice => choice.label.includes('second-result') || choice.label.includes('source-v1')), false);
});

test('unresolved and indistinguishable released work cannot become a selectable source', () => {
  const choices = portfolioReleasedWorkChoices([source, { ...source, id: 'other', evidenceId: 'other-evidence' }, { ...source, id: 'unknown', evidenceId: 'unknown-evidence', assessmentTitle: undefined }], 'ar', labels);
  assert.equal(choices.every(choice => choice.ambiguous), true);
  assert.match(choices[2].label, /Work title unavailable/);
  assert.equal(choices.some(choice => choice.label.includes('unknown-evidence')), false);
});
