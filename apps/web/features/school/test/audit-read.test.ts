import assert from 'node:assert/strict';
import test from 'node:test';
import { LearningApiError } from '../../../shared/api/client.ts';
import { currentAuditDenial, admittedAuditRows, currentAuditPages, navigateAuditPage, auditPageRows, auditReadFrame, type AuditPages } from '../audit-read-model.ts';

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

const pageSource = (data = rows) => ({ ...ready, data, loaded: true, loadingMore: false, nextCursor: 'cursor-next' as string | null });
test('Audit Previous and Next show actual admitted cursor pages without replacing or duplicating the source', () => {
  const first = pageSource();
  let pages = currentAuditPages(null, 'admin-current', first, null);
  assert.deepEqual(auditPageRows(pages, first.data), rows);
  assert.equal(pages.index, 0);
  pages = navigateAuditPage(pages, 'next');
  assert.equal(pages.index, 0); assert.equal(pages.pendingNext, true);
  const nextRow = { ...rows[0], id: 'next-source', actorName: 'Aisha Hassan' };
  const continuation = { ...first, data: [...first.data, nextRow], nextCursor: null };
  pages = currentAuditPages(pages, 'admin-current', continuation, null);
  assert.equal(pages.index, 1); assert.equal(pages.pendingNext, false);
  assert.deepEqual(auditPageRows(pages, continuation.data), [nextRow]);
  pages = navigateAuditPage(pages, 'previous');
  assert.deepEqual(auditPageRows(pages, continuation.data), rows);
  pages = navigateAuditPage(pages, 'next');
  assert.equal(pages.index, 1); assert.equal(pages.pendingNext, false);
});

test('Audit failed or pending Next never advances, while a successful retry advances once', () => {
  const first = pageSource();
  let pages = navigateAuditPage(currentAuditPages(null, 'admin-current', first, null), 'next');
  pages = currentAuditPages(pages, 'admin-current', { ...first, loadingMore: true }, null);
  assert.equal(pages.index, 0); assert.equal(pages.pendingNext, true);
  pages = currentAuditPages(pages, 'admin-current', { ...first, moreError: new LearningApiError('unavailable') }, null);
  assert.equal(pages.index, 0); assert.equal(pages.pendingNext, false);
  assert.deepEqual(auditPageRows(pages, first.data), rows);
  pages = navigateAuditPage(pages, 'next');
  const continuation = { ...first, data: [...rows, { ...rows[0], id: 'next-source' }], nextCursor: null };
  pages = currentAuditPages(pages, 'admin-current', continuation, null);
  assert.equal(pages.index, 1);
  assert.equal(currentAuditPages(pages, 'admin-current', continuation, null), pages);
});

test('Audit continuation denial clears all loaded page browsing until a fresh current read', () => {
  const first = pageSource();
  let pages: AuditPages<typeof rows[0]> = currentAuditPages(null, 'admin-current', first, null);
  const continuation = { ...first, data: [...rows, { ...rows[0], id: 'next-source' }] };
  pages = currentAuditPages(navigateAuditPage(pages, 'next'), 'admin-current', continuation, null);
  const denied = { ...continuation, moreError: new LearningApiError('denied') };
  const refusal = currentAuditDenial(null, 'admin-current', denied);
  pages = currentAuditPages(pages, 'admin-current', denied, refusal);
  assert.equal(pages.pages.length, 0); assert.equal(pages.index, 0); assert.equal(pages.pendingNext, false);
  pages = currentAuditPages(pages, 'admin-current', continuation, currentAuditDenial(refusal, 'admin-current', continuation));
  assert.deepEqual(auditPageRows(pages, continuation.data), []);
  pages = currentAuditPages(pages, 'new-refresh', { ...first, loading: true }, null);
  assert.equal(pages.pages.length, 0);
  pages = currentAuditPages(pages, 'new-refresh', first, null);
  assert.deepEqual(auditPageRows(pages, first.data), rows);
});

test('Audit late access scope clears pending browsing and an empty successful cursor page has no invented rows', () => {
  const first = pageSource();
  let pages = navigateAuditPage(currentAuditPages(null, 'admin-current', first, null), 'next');
  pages = currentAuditPages(pages, 'new-access', { ...first, data: [], loaded: false, loading: true }, null);
  assert.equal(pages.pages.length, 0); assert.equal(pages.pendingNext, false);
  pages = currentAuditPages(pages, 'new-access', first, null);
  pages = navigateAuditPage(pages, 'next');
  pages = currentAuditPages(pages, 'new-access', { ...first, data: [...first.data], nextCursor: null }, null);
  assert.equal(pages.index, 1); assert.deepEqual(auditPageRows(pages, first.data), []);
});

test('Audit mounted read frame changes with exact actor school token role and access validation', () => {
  const context = { apiUrl: 'https://school.invalid', membership: { schoolId: 'school-a', userId: 'admin-a', role: 'admin' }, accessToken: 'first-token', accessGeneration: 3, online: true, status: 'ready' };
  const frame = auditReadFrame(context);
  for (const updated of [{ ...context, accessToken: 'rotated-token' }, { ...context, accessGeneration: 4 }, { ...context, membership: { ...context.membership, schoolId: 'school-b' } }, { ...context, membership: { ...context.membership, userId: 'admin-b' } }, { ...context, membership: { ...context.membership, role: 'coordinator' } }, { ...context, online: false }]) {
    assert.notEqual(auditReadFrame(updated), frame);
  }
  assert.equal(auditReadFrame({ ...context }), frame);
});
