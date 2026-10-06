import assert from 'node:assert/strict';
import test from 'node:test';
import { LearningApiError } from '../../../shared/api/client.ts';
import { portfolioReadScope } from '../../portfolio/model.ts';
import * as binding from '../student-home-model.ts';
import { parentHomeSourceDenial } from '../parent-home-binding-model.ts';

const id = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const app = { apiUrl: 'https://api.invalid', membership: { schoolId: id, userId: id, role: 'student' }, accessToken: 'token', accessGeneration: 1, online: true, status: 'ready' };
const path = '/v1/portfolio/items?limit=25';
const scope = portfolioReadScope(app, path, 0)!;
const item = { id, revisionId: id, revision: 1, learnerId: id, sourceModel: 'numeric', title: 'My checking explanation', reflection: 'I explained why the check works.', createdAt: '2026-10-03T09:00:00Z', feedback: null, featured: false, approvalState: 'AWAITING_REVIEW', parentVisible: false, reviewedAt: null, evidenceId: id, resultId: id, submissionId: id, referenceId: id, referenceVersion: 'locked-reference-token', policyVersion: 1, nativeResult: { type: 'numeric', score: 7, maxScore: 10, policyVersion: 1 }, assessmentTitle: 'Checking methods', referenceTitle: 'Explain your evidence', identity: { status: 'READY', learnerName: 'Lina Hassan', className: 'Cedar', yearGroupName: 'Year 8', academicYearName: '2026–2027', courseTitle: 'Mathematics', assessmentTitle: 'Checking methods', submittedAt: '2026-10-03T08:00:00Z', submissionRevision: 3 } };
const page = <T = binding.StudentHomePortfolioSource,>(data: T[] = []) => ({ data, loaded: true, loading: false, nextCursor: null as string | null, error: null as LearningApiError | null, moreError: null as LearningApiError | null });

test('Student portfolio binding rejects another learner before exposing reflection text', () => {
  assert.equal(typeof binding.parseStudentHomePortfolio, 'function');
  const parsed = binding.parseStudentHomePortfolio(item, id, scope);
  assert.equal(parsed.title, 'My checking explanation');
  assert.throws(() => binding.parseStudentHomePortfolio({ ...item, learnerId: other }, id, scope), LearningApiError);
  assert.throws(() => binding.parseStudentHomePortfolio(item, id, null), LearningApiError);
});

test('Student portfolio preview bounds own rows and preserves real reflection review context without identifiers', () => {
  assert.equal(typeof binding.studentHomePortfolio, 'function');
  const data = [item, { ...item, id: other, title: 'My second method', approvalState: 'REVIEWED', feedback: 'Clear explanation.', reviewedAt: '2026-10-04T09:00:00Z' }, { ...item, id: '00000000-0000-4000-8000-000000000003', title: 'My next reflection' }].map(value => binding.parseStudentHomePortfolio(value, id, scope));
  const result = binding.studentHomePortfolio(page(data), scope, id, 'en', null);
  assert.equal(result.state, 'ready');
  assert.deepEqual(result.items.map(row => row.title), ['My checking explanation', 'My second method']);
  assert.equal(result.items[0].reflection, 'I explained why the check works.');
  assert.equal(result.items[0].reviewed, false); assert.equal(result.items[1].reviewed, true);
  assert.match(result.items[0].contextLabel!, /Class: Cedar/);
  assert.match(result.items[0].contextLabel!, /Mathematics/);
  assert.doesNotMatch(JSON.stringify(result), /locked-reference-token|00000000/);
  assert.match(result.items[0].dateLabel!, /UTC/);
});

test('Student portfolio source refuses a previous access actor API token or refresh frame on its first projection', () => {
  const data = [binding.parseStudentHomePortfolio(item, id, scope)];
  for (const next of [portfolioReadScope({ ...app, apiUrl: 'https://next.invalid' }, path, 0), portfolioReadScope({ ...app, accessToken: 'next' }, path, 0), portfolioReadScope({ ...app, accessGeneration: 2 }, path, 0), portfolioReadScope({ ...app, membership: { ...app.membership, userId: other } }, path, 0), portfolioReadScope(app, path, 1)]) {
    assert.deepEqual(binding.studentHomePortfolio(page(data), next, id, 'en', null).items, []);
  }
  assert.deepEqual(binding.studentHomePortfolio(page(data), null, id, 'en', null).items, []);
});

test('a previous portfolio denial cannot attach to a newly rendered token scope before its source reset', () => {
  assert.equal(typeof binding.currentStudentHomePortfolioPage, 'function');
  const denied = { ...page([binding.parseStudentHomePortfolio(item, id, scope)]), moreError: new LearningApiError('denied') };
  const nextScope = portfolioReadScope({ ...app, accessToken: 'next' }, path, 0)!;
  const first = binding.currentStudentHomePortfolioPage(denied, nextScope, scope);
  assert.deepEqual(first.data, []); assert.equal(first.moreError, null); assert.equal(first.loaded, false); assert.equal(first.loading, true);
  assert.equal(parentHomeSourceDenial(null, nextScope, first), null);
  const reset = binding.currentStudentHomePortfolioPage({ ...page(), loaded: false, loading: true }, nextScope, nextScope);
  assert.equal(parentHomeSourceDenial(null, nextScope, reset), null);
  const settled = binding.currentStudentHomePortfolioPage(page([binding.parseStudentHomePortfolio(item, id, nextScope)]), nextScope, nextScope);
  assert.equal(binding.studentHomePortfolio(settled, nextScope, id, 'en', null).items.length, 1);
});

test('Student portfolio empty loading partial and failed continuation states never become a complete zero claim', () => {
  const data = [binding.parseStudentHomePortfolio(item, id, scope)];
  assert.equal(binding.studentHomePortfolio(page(), scope, id, 'en', null).state, 'empty');
  assert.equal(binding.studentHomePortfolio({ ...page(), loaded: false, loading: true }, scope, id, 'en', null).state, 'loading');
  const partial = { ...page(data), nextCursor: other };
  assert.equal(binding.studentHomePortfolio(partial, scope, id, 'en', null).state, 'partial');
  const outage = { ...partial, moreError: new LearningApiError('unavailable') };
  assert.equal(binding.studentHomePortfolio(outage, scope, id, 'en', null).items.length, 1);
  assert.equal(binding.studentHomePortfolio(outage, scope, id, 'en', null).state, 'partial');
  assert.deepEqual(binding.studentHomePortfolio({ ...partial, moreError: new LearningApiError('invalid') }, scope, id, 'en', null).items, []);
  assert.deepEqual(binding.studentHomePortfolio({ ...page(data), error: new LearningApiError('unavailable') }, scope, id, 'en', null).items, []);
  assert.deepEqual(binding.studentHomePortfolio({ ...partial, moreError: new LearningApiError('unauthorized') }, scope, id, 'en', null).items, []);
});

test('Student portfolio denied continuation cannot resurrect prior private work by clearing the same-scope retry error', () => {
  const data = [binding.parseStudentHomePortfolio(item, id, scope)];
  const denied = { ...page(data), nextCursor: other, moreError: new LearningApiError('denied') };
  const barrier = parentHomeSourceDenial(null, scope, denied);
  assert.deepEqual(binding.studentHomePortfolio(denied, scope, id, 'en', barrier).items, []);
  const retry = { ...denied, moreError: null };
  const retained = parentHomeSourceDenial(barrier, scope, retry);
  assert.equal(binding.studentHomePortfolio(retry, scope, id, 'en', retained).state, 'unavailable');
  assert.deepEqual(binding.studentHomePortfolio(retry, scope, id, 'en', retained).items, []);
  const freshScope = portfolioReadScope(app, path, 1)!;
  const fresh = page([binding.parseStudentHomePortfolio(item, id, freshScope)]);
  assert.equal(binding.studentHomePortfolio(fresh, freshScope, id, 'en', parentHomeSourceDenial(retained, freshScope, fresh)).items.length, 1);
});

test('Student portfolio preview withholds missing and duplicate human context instead of using opaque suffixes', () => {
  const duplicate = [item, { ...item, id: other }].map(value => binding.parseStudentHomePortfolio(value, id, scope));
  assert.deepEqual(binding.studentHomePortfolio(page(duplicate), scope, id, 'en', null).items, []);
  assert.equal(binding.studentHomePortfolio(page(duplicate), scope, id, 'en', null).state, 'unavailable');
  for (const value of [{ ...item, title: id }, { ...item, identity: { ...item.identity, status: 'REQUIRES_REVIEW', className: null } }]) {
    assert.deepEqual(binding.studentHomePortfolio(page([binding.parseStudentHomePortfolio(value, id, scope)]), scope, id, 'ar', null).items, []);
  }
  const available = binding.parseStudentHomePortfolio({ ...item, id: '00000000-0000-4000-8000-000000000003', title: 'My different reflection' }, id, scope);
  const partial = binding.studentHomePortfolio(page([...duplicate, available]), scope, id, 'ar', null);
  assert.equal(partial.state, 'partial'); assert.deepEqual(partial.items.map(row => row.title), ['My different reflection']);
});
