'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Button, Status } from '@cuevo/ui';
import type { Rubric } from '../model';
import type { Assessment, Course } from '../../learning/model';
import { useApp } from '../../../shared/session/providers';
import { useApi } from '../../../shared/hooks/use-api';
import { LearningApiError } from '../../../shared/api/client';
import { LearningError } from '../../../shared/components/feedback';
import { CommandForm } from '../../../shared/components/command-form';
import { academicAr, academicEn } from '../messages';
import { versionLabel } from '../../../shared/i18n/version-label';

type EditorCriterion = { id: string; levels: { id: string }[] };
export function RubricList({ rubrics, courses, assessments, canCreate, onChanged }: { rubrics: Rubric[]; courses: Course[]; assessments: Assessment[]; canCreate: boolean; onChanged: () => void }) {
  const { locale, membership, formDrafts } = useApp(); const t = locale === 'ar' ? academicAr : academicEn;
  const [creating, setCreating] = useState(!!formDrafts.get(`${membership?.schoolId}:${membership?.userId}:/v1/rubrics`));
  const [configuring, setConfiguring] = useState(false);
  const [assessmentId, setAssessmentId] = useState('');
  const assessment = assessments.find(item => item.id === assessmentId);
  const available = rubrics.filter(rubric => rubric.courseId === assessment?.courseId);
  function saved() { setCreating(false); setConfiguring(false); onChanged(); }
  return <section className="academic-rubric-workspace"><h2>{t.rubrics}</h2><p className="learning-form__note">{t.rubricImmutable}</p>{canCreate ? <div className="learning-actions"><Button type="button" disabled={!courses.length} onClick={() => { setCreating(true); setConfiguring(false); }}>{t.createRubric}</Button><Button type="button" variant="secondary" disabled={!rubrics.length || !assessments.length} onClick={() => { setConfiguring(true); setCreating(false); }}>{t.configureRubric}</Button></div> : null}{creating ? <RubricEditor courses={courses} onSaved={saved} onCancel={() => setCreating(false)} /> : null}{configuring ? <div><div className="field"><label htmlFor="rubric-assessment-selection">{t.assessment}</label><select id="rubric-assessment-selection" value={assessmentId} onChange={event => setAssessmentId(event.target.value)}><option value="">{t.assessment}</option>{assessments.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>{assessment && available.length ? <CommandForm key={`${assessment.id}:${assessment.policyVersion}`} title={t.configureRubric} path={`/v1/assessments/${assessment.id}/rubric`} fields={[{ name: 'rubricId', label: t.rubric, type: 'select', required: true, defaultValue: assessment.rubricId ?? undefined, options: available.map(rubric => ({ value: rubric.id, label: `${rubric.title} · ${versionLabel(rubric.version, locale)}` })) }]} body={values => ({ rubricId: String(values.get('rubricId')), expectedPolicyVersion: assessment.policyVersion })} onSaved={saved} onCancel={() => setConfiguring(false)} note={t.rubricConfigureNote} actionLabel={t.configureRubric} /> : assessment ? <p className="notice">{t.noRubrics}</p> : null}</div> : null}{rubrics.length ? rubrics.map(rubric => <article className="academic-row" key={rubric.id} data-rubric-id={rubric.id}><div className="learning-section-heading"><h3>{rubric.title}</h3><Status>{t.schoolAuthored}</Status></div><p className="learning-form__note">{t.rubricVersion}: <bdi>{versionLabel(rubric.version, locale)}</bdi></p><details><summary>{t.source}</summary><bdi>{rubric.version}</bdi></details><dl className="rubric-result-criteria">{rubric.criteria.map(criterion => <div key={criterion.key}><dt>{criterion.title}</dt><dd><ul>{criterion.levels.map(level => <li key={level.key}><strong>{level.label}</strong> — {level.description}</li>)}</ul></dd></div>)}</dl></article>) : <p className="learning-empty">{t.noRubrics}</p>}</section>;
}

function RubricEditor({ courses, onSaved, onCancel }: { courses: Course[]; onSaved: () => void; onCancel: () => void }) {
  const { locale, membership, formDrafts, announce, accessToken, online } = useApp(); const t = locale === 'ar' ? academicAr : academicEn;
  const { request, journal, t: common } = useApi();
  const prefix = useId();
  const retained = journal.get('/v1/rubrics');
  const workingSlot = `${membership?.schoolId}:${membership?.userId}:/v1/rubrics`;
  const scope = `${workingSlot}:${accessToken ?? ''}:${online}`;
  const currentScope = useRef(scope); currentScope.current = scope;
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const working = formDrafts.get(workingSlot);
  const [criteria, updateCriteria] = useState<EditorCriterion[]>(() => formDrafts.model<EditorCriterion[]>(workingSlot) ?? [{ id: 'initial-criterion', levels: [{ id: 'initial-level' }] }]);
  function setCriteria(update: (value: EditorCriterion[]) => EditorCriterion[]) { updateCriteria(previous => { const next = update(previous); formDrafts.saveModel(workingSlot, next); return next; }); }
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<LearningApiError | null>(retained ? new LearningApiError('unavailable', true) : null);
  const locked = pending || !!error?.uncertain;
  async function send(values?: FormData) {
    if (pending) return;
    setPending(true); setError(null);
    const expectedScope = scope; let commandKey: string | undefined;
    const ownsCommand = () => mounted.current && currentScope.current === expectedScope && (!commandKey || journal.get('/v1/rubrics')?.key === commandKey);
    try {
      const command = values ? journal.prepare('/v1/rubrics', '/v1/rubrics', { courseId: String(values.get('courseId')), title: String(values.get('title')), version: String(values.get('version') || 'school-' + new Date().toISOString()), criteria: criteria.map(criterion => ({ key: criterion.id, title: String(values.get(`${criterion.id}:title`)), levels: criterion.levels.map(level => ({ key: level.id, label: String(values.get(`${level.id}:label`)), description: String(values.get(`${level.id}:description`)) })) })) }) : journal.get('/v1/rubrics');
      if (!command) throw new LearningApiError('invalid');
      commandKey = command.key;
      const receipt = await request('/v1/rubrics', { command });
      if (!ownsCommand()) return;
      if (!receipt || typeof receipt !== 'object' || !('id' in receipt) || typeof receipt.id !== 'string') throw new LearningApiError('invalid', true);
      onSaved(); if (!ownsCommand()) return; journal.confirm('/v1/rubrics', command.key); formDrafts.remove(workingSlot); announce(`${t.createRubric}: ${common.saved}`);
    } catch (failure) {
      if (!ownsCommand()) return;
      const safe = failure instanceof LearningApiError ? failure : new LearningApiError('invalid');
      if (!safe.uncertain && commandKey) journal.confirm('/v1/rubrics', commandKey);
      setError(safe);
    } finally { if (mounted.current && currentScope.current === expectedScope) setPending(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void send(new FormData(event.currentTarget)); }
  const field = (name: string, label: string, multiline = false) => <div className="field"><label htmlFor={`${prefix}:${name}`}>{label}</label>{multiline ? <textarea id={`${prefix}:${name}`} name={name} required rows={3} maxLength={2000} defaultValue={String(working?.values[name] ?? '')} /> : <input id={`${prefix}:${name}`} name={name} required maxLength={name.endsWith(':key') ? 100 : 200} defaultValue={String(working?.values[name] ?? '')} />}</div>;
  function remember(form: HTMLFormElement) { formDrafts.save(workingSlot, Object.fromEntries([...new FormData(form).entries()].map(([key, value]) => [key, String(value)])), { model: criteria }); }
  return <section className="learning-form" aria-label={t.createRubric}><h3>{t.createRubric}</h3><p className="learning-form__note">{t.rubricImmutable}</p><form onSubmit={submit} onChange={event => remember(event.currentTarget)} aria-busy={pending}><fieldset disabled={locked}><div className="field"><label htmlFor={`${prefix}:course`}>{t.course}</label><select id={`${prefix}:course`} name="courseId" required defaultValue={String(working?.values.courseId ?? '')}><option value="">{common.choose}</option>{courses.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}</select></div>{field('title', t.title)}{criteria.map((criterion, index) => <fieldset className="rubric-criterion-editor" key={criterion.id}><legend>{t.criterion} {new Intl.NumberFormat(locale).format(index + 1)}</legend>{field(`${criterion.id}:title`, t.criterionTitle)}{criterion.levels.map((level, levelIndex) => <fieldset key={level.id} className="rubric-level-editor"><legend>{t.level} {new Intl.NumberFormat(locale).format(levelIndex + 1)}</legend>{field(`${level.id}:label`, t.levelLabel)}{field(`${level.id}:description`, t.levelDescription, true)}{criterion.levels.length > 1 ? <Button type="button" variant="quiet" onClick={() => setCriteria(items => items.map(item => item.id === criterion.id ? { ...item, levels: item.levels.filter(existing => existing.id !== level.id) } : item))}>{t.removeLevel}</Button> : null}</fieldset>)}<Button type="button" variant="secondary" disabled={criterion.levels.length >= 20} onClick={() => setCriteria(items => items.map(item => item.id === criterion.id ? { ...item, levels: [...item.levels, { id: crypto.randomUUID() }] } : item))}>{t.addLevel}</Button>{criteria.length > 1 ? <Button type="button" variant="quiet" onClick={() => setCriteria(items => items.filter(item => item.id !== criterion.id))}>{t.removeCriterion}</Button> : null}</fieldset>)}<Button type="button" variant="secondary" disabled={criteria.length >= 30} onClick={() => setCriteria(items => [...items, { id: crypto.randomUUID(), levels: [{ id: crypto.randomUUID() }] }])}>{t.addCriterion}</Button></fieldset>{error ? <LearningError error={error} /> : null}<div className="learning-form__actions">{error?.uncertain ? <Button type="button" disabled={pending} onClick={() => void send()}>{pending ? common.saving : common.retrySame}</Button> : <Button type="submit" disabled={pending}>{pending ? common.saving : common.save}</Button>}{!error?.uncertain ? <Button type="button" variant="quiet" disabled={pending} onClick={() => { formDrafts.remove(workingSlot); onCancel(); }}>{common.cancel}</Button> : null}</div></form></section>;
}
