import assert from 'node:assert/strict';
import test from 'node:test';
import * as owner from '../learner-profile-choice-state.ts';

const ready = { loaded: true, loading: false, loadingMore: false, nextCursor: null, error: null, moreError: null };
const choices = [{ value: 'learner-a', requiresReview: false }, { value: 'learner-b', requiresReview: true }];

test('learner choices never turn pending, incomplete or failed source reads into confirmed emptiness', () => {
  assert.equal(owner.learnerProfileChoiceState({ ...ready, loaded: false }, [], ''), 'LOADING');
  assert.equal(owner.learnerProfileChoiceState({ ...ready, loading: true }, [], ''), 'LOADING');
  assert.equal(owner.learnerProfileChoiceState({ ...ready, loadingMore: true, nextCursor: 'next' }, [], ''), 'LOADING');
  assert.equal(owner.learnerProfileChoiceState({ ...ready, nextCursor: 'next' }, [], ''), 'INCOMPLETE');
  assert.equal(owner.learnerProfileChoiceState({ ...ready, error: new Error('unavailable') }, [], ''), 'FAILED');
  assert.equal(owner.learnerProfileChoiceState({ ...ready, moreError: new Error('unavailable') }, [], ''), 'FAILED');
});
test('only a complete successful zero learner choice set is empty; current unselected choices need selection', () => {
  assert.equal(owner.learnerProfileChoiceState(ready, [], ''), 'EMPTY');
  assert.equal(owner.learnerProfileChoiceState(ready, choices, ''), 'CHOOSE');
  assert.equal(owner.learnerProfileChoiceState(ready, choices, 'learner-a'), 'SELECTED');
});
test('missing or ambiguous learner choices require review without rebinding an existing selection', () => {
  assert.equal(owner.learnerProfileChoiceState(ready, choices, 'learner-b'), 'REQUIRES_REVIEW');
  assert.equal(owner.learnerProfileChoiceState(ready, choices, 'withdrawn-learner'), 'REQUIRES_REVIEW');
  assert.equal(owner.learnerProfileChoiceState(ready, [{ value: 'learner-a', requiresReview: true }], ''), 'REQUIRES_REVIEW');
  assert.equal(owner.learnerProfileChoiceState({ ...ready, nextCursor: 'next' }, choices, 'learner-a'), 'INCOMPLETE');
  assert.equal(owner.learnerProfileChoiceState({ ...ready, error: new Error('denied') }, choices, 'learner-a'), 'FAILED');
});
