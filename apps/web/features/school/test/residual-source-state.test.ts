import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerHooks } from 'node:module';
import { LearningApiError } from '../../../shared/api/client.ts';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';
import { CommandJournal } from '../../../shared/api/client.ts';
const fixture = { locale: 'en', membership: { role: 'student', schoolId: 'school', userId: 'actor' }, accessGeneration: 1, formDrafts: new FormDrafts(), commandJournal: new CommandJournal() };
Object.assign(globalThis, { React, schoolResidualStateFixture: fixture });
registerHooks({ load(url, context, next) { if (url.replaceAll('\\', '/').endsWith('/shared/session/providers.tsx')) return { format: 'module', shortCircuit: true, source: 'export function useApp(){return globalThis.schoolResidualStateFixture}' }; return next(url, context); } });
const { SchoolDayRecords } = await import('../components/school-day-records.tsx');
const { ParentCalendar } = await import('../components/parent-calendar.tsx');
const { AccessDirectory } = await import('../components/access-directory.tsx');
const base = { loaded: true, loading: false, loadingMore: false, error: null as LearningApiError | null, moreError: null as LearningApiError | null, nextCursor: null as string | null };
const policy = { version: 1, parentAttendanceVisible: true, parentUpcomingVisible: true, studentMessagingEnabled: false as const, recognitionEnabled: false, leaderboardEnabled: false, analyticsEnabled: false };

test('native daily unknown dates and current empty records use shared state without inferring attendance', () => {
  for (const locale of ['en', 'ar']) { fixture.locale = locale;
    const render = (day: string) => renderToStaticMarkup(createElement(SchoolDayRecords, { attendance: [], timetable: [], calendar: [], policy, day, onDayChange() {} }));
    const unknown = render(''); assert.match(unknown, /data-state="unknown"/);
    const empty = render('2026-10-05'); assert.match(empty, /data-state="empty"/); assert.doesNotMatch(empty, /school-day-empty/);
    assert.match(empty, locale === 'en' ? /Missing records are not absence/ : /نقص السجلات لا يعني الغياب/);
    const partial = renderToStaticMarkup(createElement(SchoolDayRecords, { attendance: [], timetable: [], calendar: [], policy, day: '2026-10-05', partial: true, onDayChange() {} }));
    assert.match(partial, /data-state="review"/); assert.doesNotMatch(partial, /data-state="empty"/);
  }
});

test('parent disabled loading and incomplete date sources preserve distinct states and current denial', () => {
  fixture.locale = 'en'; fixture.membership.role = 'parent';
  const render = (source = base, enabled = true) => renderToStaticMarkup(createElement(SchoolDayRecords, { attendance: [], timetable: [], calendar: [], policy: { ...policy, parentAttendanceVisible: enabled, parentUpcomingVisible: enabled }, day: '2026-10-05', onDayChange() {}, parentChildId: 'child', parentSources: { calendar: source, attendance: source, timetable: source } }));
  assert.match(render(base, false), /data-state="unavailable"/);
  assert.match(render({ ...base, loading: true }), /data-state="loading"/);
  assert.match(render({ ...base, nextCursor: 'later' }), /data-state="review"/);
  const denied = render({ ...base, error: new LearningApiError('denied') } as typeof base); assert.match(denied, /role="alert"/); assert.doesNotMatch(denied, /No scheduled sessions|No attendance is recorded/);
  fixture.membership.role = 'student';
});

test('parent calendar partial empty is a review state and invalid date is unknown without changing controls', () => {
  const render = (day: string, source = base) => renderToStaticMarkup(createElement(ParentCalendar, { childId: 'child', locale: 'en', events: [], day, onDayChange() {}, source }));
  assert.match(render('2026-10-05'), /data-state="empty"/);
  assert.match(render('2026-10-05', { ...base, nextCursor: 'later' } as typeof base), /data-state="review"/);
  assert.match(render(''), /data-state="unknown"/); assert.match(render(''), /Selected school date/);
});

test('access directory empty and pending sources use state material while pending navigation remains disabled', () => {
  for (const loading of [false, true]) { const html = renderToStaticMarkup(createElement(AccessDirectory, { locale: 'en', kind: 'person', rows: [], selectedId: null, query: '', locked: true, statusLabel: String, onKind() {}, onQuery() {}, onSelect() {}, source: { ...base, loading, context: 'current' } }));
    assert.match(html, new RegExp(`data-state="${loading ? 'loading' : 'empty'}"`)); assert.match(html, /disabled=""/); assert.doesNotMatch(html, /Review record:/);
  }
});
