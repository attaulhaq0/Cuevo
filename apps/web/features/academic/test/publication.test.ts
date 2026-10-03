import assert from 'node:assert/strict';
import test from 'node:test';
import { resultPublicationScope, currentResultPublication, parseCurrentResultPublication, validateResultPublicationReceipt, publicationDecisionCurrent, parsePublicationMutationBasis } from '../publication-model.ts';
import { CommandJournal, confirmCommandReceipt, LearningApiError } from '../../../shared/api/client.ts';

const resultId = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
const context = { apiUrl: 'https://api.example.invalid', membership: { userId: 'teacher', schoolId: 'school', role: 'teacher', entitlements: ['learning','assessment','curriculum'] }, accessToken: 'fictional-token', online: true, status: 'ready', accessGeneration: 1 };
const publication = { id: resultId, parentVisible: false, publicationRevision: 0, resultRevision: 1 };

test('publication reads bind exact result and current actor request envelope before rendering', () => {
  const scope = resultPublicationScope(context, resultId, 0);
  assert.ok(scope); assert.equal(currentResultPublication({ scope, value: publication }, scope), publication);
  for (const patch of [{ accessGeneration: 2 }, { accessToken: 'replacement-token' }, { online: false }, { status: 'verifying' }, { membership: { ...context.membership, userId: 'other-teacher' } }]) assert.equal(currentResultPublication({ scope, value: publication }, resultPublicationScope({ ...context, ...patch }, resultId, 0)), null);
  assert.equal(currentResultPublication({ scope, value: publication }, resultPublicationScope(context, otherId, 0)), null);
  assert.equal(resultPublicationScope({ ...context, membership: { ...context.membership, role: 'parent' } }, resultId, 0), null);
  assert.equal(resultPublicationScope({ ...context, membership: { ...context.membership, entitlements: [] } }, resultId, 0), null);
  assert.equal(parseCurrentResultPublication(publication, resultId).publicationRevision, 0);
  assert.throws(() => parseCurrentResultPublication(publication, otherId), LearningApiError);
});

test('publication receipt validates original sharing and both source revisions after unmount', () => {
  const journal = new CommandJournal(); const path = `/v1/results/${resultId}/publication`;
  const command = journal.prepare(path, path, { parentVisible: true, expectedPublicationRevision: 0, expectedResultRevision: 1, reason: ' Reviewed current parents. ', confirmPublication: true });
  const receipt = { ...publication, parentVisible: true, publicationRevision: 1 };
  for (const patch of [{ id: otherId }, { parentVisible: false }, { publicationRevision: 2 }, { resultRevision: 2 }, { privateNote: 'Excluded' }]) {
    assert.throws(() => confirmCommandReceipt(journal, path, command.key, { ...receipt, ...patch }, undefined, validateResultPublicationReceipt), error => error instanceof LearningApiError && error.uncertain);
    assert.equal(journal.get(path), command);
  }
  assert.equal(confirmCommandReceipt(journal, path, command.key, receipt, undefined, validateResultPublicationReceipt), true);
});

test('publication receipt requires explicit original reason and approval without invented receipt echoes', () => {
  const path = `/v1/results/${resultId}/publication`;
  const command = { key: 'original', path, body: { parentVisible: false, expectedPublicationRevision: 1, expectedResultRevision: 1, reason: 'Reviewed sharing withdrawal.', confirmPublication: true } };
  const receipt = { ...publication, publicationRevision: 2 };
  assert.equal(validateResultPublicationReceipt(receipt, command).parentVisible, false);
  for (const body of [{ ...command.body, reason: '' }, { ...command.body, confirmPublication: false }, { ...command.body, expectedPublicationRevision: undefined }]) assert.throws(() => validateResultPublicationReceipt(receipt, { ...command, body }), error => error instanceof LearningApiError && error.uncertain);
  assert.throws(() => validateResultPublicationReceipt(receipt, { ...command, path: `/v1/results/${otherId}/publication` }), error => error instanceof LearningApiError && error.uncertain);
});

test('fresh publication decision cannot silently adopt a later sharing or native revision', () => {
  const basis = { parentVisible: true, expectedPublicationRevision: 0, expectedResultRevision: 1 };
  assert.equal(publicationDecisionCurrent(publication, resultId, basis), true);
  assert.equal(publicationDecisionCurrent({ ...publication, id: otherId }, resultId, basis), false);
  assert.equal(publicationDecisionCurrent({ ...publication, parentVisible: true }, resultId, basis), false);
  assert.equal(publicationDecisionCurrent({ ...publication, publicationRevision: 1 }, resultId, basis), false);
  assert.equal(publicationDecisionCurrent({ ...publication, resultRevision: 2 }, resultId, basis), false);
});

test('working publication decision retains only bounded original input basis without protected record fields', () => {
  const basis = { parentVisible: true, expectedPublicationRevision: 0, expectedResultRevision: 1 };
  assert.deepEqual(parsePublicationMutationBasis(basis), basis);
  for (const value of [undefined, { ...basis, reason: 'Private reason belongs to form values' }, { ...basis, expectedResultRevision: 0 }, { ...basis, expectedPublicationRevision: -1 }, { ...basis, parentVisible: 'true' }]) assert.equal(parsePublicationMutationBasis(value), null);
});
