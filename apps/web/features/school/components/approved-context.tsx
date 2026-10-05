'use client';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Button, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { CommandForm, type FormField } from '../../../shared/components/command-form';
import { LearningError } from '../../../shared/components/feedback';
import { LoadMore } from '../../../shared/components/load-more';
import { LearningApiError } from '../../../shared/api/client';
import { parseCampus, parseClassCampus, parseLearningSupport, parseSchoolRow, parseSchoolPerson, currentSchoolRead } from '../model';
import { parseCourse, parseAssessment } from '../../learning/model';
import { schoolAr, schoolEn } from '../messages';
import { currentSupportSelection, parseSupportSelection, publishedSupportCourses, supportApprovalBody, supportAssessmentCurrent, supportChoices, supportDraftKey, supportPath, supportRecovery, validateSupportReceipt, type SupportInput, type SupportSelection } from '../support-review-model';

export function ApprovedSchoolContext({ pageHeading = false }: { pageHeading?: boolean } = {}) {
  const { locale, membership, formDrafts, commandJournal, apiUrl, accessToken, online, accessGeneration } = useApp();
  const t = locale === 'ar' ? schoolAr : schoolEn;
  useSyncExternalStore(commandJournal.subscribe, commandJournal.getSnapshot, commandJournal.getSnapshot);
  const intentSlot = `${membership?.schoolId}:${membership?.userId}:${supportPath}:selection`;
  const [refresh, setRefresh] = useState(0);
  const [classId, setClassId] = useState('');
  const [selection, setSelection] = useState<SupportSelection>(() => parseSupportSelection(formDrafts.model(intentSlot)) ?? { courseId: '', learnerId: '' });
  const [creating, setCreating] = useState<'campus' | 'support' | null>(() => commandJournal.get(supportPath) || formDrafts.model(intentSlot) ? 'support' : null);
  const [supportLocked, setSupportLocked] = useState(false);
  const [, setDraftRevision] = useState(0);
  const [campusLocked, setCampusLocked] = useState(false);
  const onSupportLocked = useCallback((locked: boolean) => setSupportLocked(locked), []);
  const onCampusLocked = useCallback((locked: boolean) => setCampusLocked(locked), []);
  const admin = membership?.role === 'admin';
  const approve = admin || membership?.role === 'coordinator';
  const retained = commandJournal.get(supportPath);
  const recovery = supportRecovery(retained);
  const selected: SupportSelection = recovery?.input ?? selection;
  const sourceLocked = supportLocked || !!retained;
  const campuses = usePaginatedLearningQuery(approve ? '/v1/school/campuses?limit=25' : null, parseCampus, refresh);
  const classes = usePaginatedLearningQuery(admin ? '/v1/school/classes?limit=25' : null, parseSchoolRow, refresh);
  const people = usePaginatedLearningQuery(approve && creating === 'support' ? '/v1/school/people?limit=25' : null, parseSchoolPerson, refresh);
  const courses = usePaginatedLearningQuery(approve && creating === 'support' ? '/v1/courses?limit=100' : null, parseCourse, refresh);
  const assessments = usePaginatedLearningQuery(approve && creating === 'support' ? '/v1/assessments?limit=100' : null, parseAssessment, refresh);
  const support = usePaginatedLearningQuery('/v1/school/learning-support?limit=25', parseLearningSupport, refresh);
  const campusScope = `${apiUrl}:${membership?.schoolId}:${membership?.userId}:${membership?.role}:${accessToken ?? ''}:${online}:${accessGeneration}:${refresh}:${classId}`;
  const parseSelectedCampus = useCallback((value: unknown) => {
    const parsed = parseClassCampus(value);
    if (parsed.id !== classId) throw new LearningApiError('invalid');
    return { scope: campusScope, value: parsed };
  }, [campusScope, classId]);
  const campusRead = useApiQuery(admin && classId ? `/v1/school/classes/${classId}/campus` : null, parseSelectedCampus, refresh);
  const campus = { ...campusRead, data: currentSchoolRead(campusRead.data, campusScope) };
  const choiceQueries = [people, courses, assessments];
  const choicesReady = choiceQueries.every(query => query.loaded && !query.loading && !query.loadingMore && !query.error && !query.moreError && !query.nextCursor);
  const choicesLoading = choiceQueries.some(query => query.loading || query.loadingMore);
  const choiceFailure = choiceQueries.find(query => query.error || query.moreError);
  const sourceError = choiceFailure?.error ?? choiceFailure?.moreError ?? support.error;
  const sourceDenied = !!sourceError && ['denied', 'unauthorized'].includes(sourceError.kind);
  useEffect(() => {
    if (sourceError) formDrafts.clearRead(`${membership?.schoolId}:${membership?.userId}:`, supportPath);
  }, [sourceError, formDrafts, membership?.schoolId, membership?.userId]);
  const currentSelection = choicesReady ? currentSupportSelection(selected, courses.data, people.data) : null;
  const courseChoices = supportChoices(publishedSupportCourses(courses.data).map(course => ({ id: course.id, label: course.title })), t.nameUnavailable);
  const learnerChoices = supportChoices(people.data.filter(person => person.role === 'student' && person.status === 'active').map(person => ({ id: person.id, label: person.displayName })), t.nameUnavailable);
  const assessmentChoices = supportChoices(assessments.data.filter(task => task.courseId === selected.courseId).map(task => ({ id: task.id, label: task.title })), t.nameUnavailable);
  const selectedCourse = courses.data.find(course => course.id === selected.courseId);
  const selectedLearner = people.data.find(person => person.id === selected.learnerId);
  const selectedTaskId = recovery?.input.assessmentId ?? (String(formDrafts.get(`${membership?.schoolId}:${membership?.userId}:${supportDraftKey(selected)}`)?.values.assessmentId ?? '') || null);
  const assessmentCurrent = supportAssessmentCurrent(selected, selectedTaskId, assessments.data);
  const reviewReady = !!currentSelection && assessmentCurrent && !support.loading && !support.error && !(retained && !recovery);
  function changeSelection(next: SupportSelection) {
    if (sourceLocked) return;
    setSelection(next); formDrafts.saveModel(intentSlot, next);
  }
  function saved() { if (!sourceLocked) setCreating(null); setRefresh(value => value + 1); }
  function savedSupport() { formDrafts.remove(intentSlot); setCreating(null); setRefresh(value => value + 1); }
  function cancelSupport() { formDrafts.remove(intentSlot); setCreating(null); }
  function clearAssessment() {
    if (sourceLocked) return;
    const slot = `${membership?.schoolId}:${membership?.userId}:${supportDraftKey(selected)}`;
    const draft = formDrafts.get(slot);
    if (draft) formDrafts.save(slot, { ...draft.values, assessmentId: '', confirmApproval: false }, draft.basis);
    setDraftRevision(value => value + 1);
  }
  function supportFields(): FormField[] {
    return [{ name: 'assessmentId', label: t.supportAssessment, type: 'select', options: assessmentChoices.filter(choice => !choice.requiresReview).map(({ value, label }) => ({ value, label })) }, { name: 'title', label: t.supportTitle, required: true }, { name: 'instructions', label: t.supportInstructions, type: 'textarea', required: true, maxLength: 4000 }, { name: 'effectiveFrom', label: t.supportFrom, type: 'date', required: true }, { name: 'effectiveTo', label: t.supportTo, type: 'date', required: true }, { name: 'studentVisible', label: t.shareSupportStudent, type: 'checkbox' }, { name: 'parentVisible', label: t.shareSupportParent, type: 'checkbox' }, { name: 'reason', label: t.schoolApprovalReason, type: 'textarea', required: true }, { name: 'confirmApproval', label: t.confirmSupport, type: 'checkbox', required: true }];
  }
  return <section aria-label={t.approvedContext}>
    <header className="cuevo-section-header"><div className="cuevo-section-header__context">{pageHeading ? null : <h2>{t.approvedContext}</h2>}<p>{t.supportMetadataNote}</p></div><div className="learning-actions">
    <Button type="button" variant="quiet" onClick={() => setRefresh(value => value + 1)}>{t.refresh}</Button>
    {admin ? <Button type="button" disabled={sourceLocked || campusLocked} onClick={() => setCreating('campus')}>{t.createCampus}</Button> : null}
    {approve ? <Button type="button" variant="secondary" disabled={campusLocked} onClick={() => setCreating('support')}>{t.approveLearningSupport}</Button> : null}
    </div></header>{creating === 'campus' ? <CommandForm title={t.createCampus} path="/v1/school/campuses" fields={[{ name: 'name', label: t.campusName, required: true }, { name: 'location', label: t.campusLocation }, { name: 'reason', label: t.schoolApprovalReason, type: 'textarea', required: true, maxLength: 2000 }, { name: 'confirmConfiguration', label: t.confirmCampus, type: 'checkbox', required: true }]} body={values => ({ name: String(values.get('name')), location: values.get('location') ? String(values.get('location')) : null, reason: String(values.get('reason')), confirmConfiguration: values.get('confirmConfiguration') === 'on' })} onSaved={saved} onCancel={() => setCreating(null)} /> : null}
    {approve ? campuses.loading ? <p role="status">{t.loading}</p> : campuses.error ? <LearningError error={campuses.error} /> : campuses.data.map(item => <article className="school-record" key={item.id}><h3>{item.name}</h3><p>{item.location ?? t.campusLocationUnknown}</p><Status>{item.retired ? t.retiredCampus : t.activeCampus}</Status>{admin && !item.retired ? <CommandForm title={t.retireCampus} path={`/v1/school/campuses/${item.id}/retire`} fields={[{ name: 'reason', label: t.schoolApprovalReason, type: 'textarea', required: true }, { name: 'confirmRetirement', label: t.confirmCampusRetire, type: 'checkbox', required: true }]} body={values => ({ reason: String(values.get('reason')), confirmRetirement: values.get('confirmRetirement') === 'on' })} onSaved={saved} /> : null}</article>) : null}
    <LoadMore query={campuses} label={t.campusName} />
    {admin ? <><div className="field"><label htmlFor="campus-class">{t.class}</label><select id="campus-class" disabled={campusLocked} value={classId} onChange={event => setClassId(event.target.value)}><option value="">{t.class}</option>{classes.data.map(item => <option key={item.id} value={item.id}>{String(item.name)}</option>)}</select></div>{campus.loading || classId && !campus.data && !campus.error ? <p role="status">{t.loading}</p> : campus.error ? <LearningError error={campus.error} /> : campus.data ? <CommandForm key={`${classId}:${campus.data.revision}`} onLockedChange={onCampusLocked} title={t.assignCampus} path={`/v1/school/classes/${classId}/campus`} fields={[{ name: 'campusId', label: t.campusName, type: 'select', options: [{ value: '', label: t.noCampus }, ...campuses.data.filter(item => !item.retired).map(item => ({ value: item.id, label: item.name }))], defaultValue: campus.data.campusId ?? '' }, { name: 'reason', label: t.schoolApprovalReason, type: 'textarea', required: true }, { name: 'confirmConfiguration', label: t.confirmCampus, type: 'checkbox', required: true }]} body={values => ({ campusId: values.get('campusId') ? String(values.get('campusId')) : null, expectedRevision: campus.data!.revision, reason: String(values.get('reason')), confirmConfiguration: values.get('confirmConfiguration') === 'on' })} onSaved={saved} /> : null}<LoadMore query={classes} label={t.classes} /></> : null}
    {approve && creating === 'support' ? <section aria-label={t.approveLearningSupport}>
      <div className="field"><label htmlFor="support-course">{t.supportCourse}</label><select id="support-course" value={selected.courseId} disabled={sourceLocked || courses.loading || !!courses.error} onChange={event => changeSelection({ ...selection, courseId: event.target.value })}><option value="">{t.supportCourse}</option>{courseChoices.map(choice => <option key={choice.value} value={choice.value} disabled={choice.requiresReview}>{choice.label}</option>)}</select><LoadMore query={courses} label={t.supportCourse} /></div>
      <div className="field"><label htmlFor="support-learner">{t.supportLearner}</label><select id="support-learner" value={selected.learnerId} disabled={sourceLocked || people.loading || !!people.error} onChange={event => changeSelection({ ...selection, learnerId: event.target.value })}><option value="">{t.supportLearner}</option>{learnerChoices.map(choice => <option key={choice.value} value={choice.value} disabled={choice.requiresReview}>{choice.label}</option>)}</select><LoadMore query={people} label={t.supportLearner} /></div>
      {choicesLoading ? <p role="status">{t.supportChecking}</p> : null}
      {choiceFailure ? <LearningError error={choiceFailure.error ?? choiceFailure.moreError!} /> : null}
      {!choiceFailure && !choicesLoading && !choicesReady ? <p className="notice">{t.supportCompleteChoices}</p> : null}
      <LoadMore query={assessments} label={t.supportAssessment} />
      {retained && !recovery ? <p className="notice">{t.supportInvalidRecovery}</p> : null}
      {recovery && !sourceDenied ? <OriginalSupport input={recovery.input} learnerName={selectedLearner?.displayName ?? t.nameUnavailable} courseTitle={selectedCourse?.title ?? t.nameUnavailable} assessmentTitle={assessments.data.find(task => task.id === recovery.input.assessmentId)?.title ?? t.nameUnavailable} /> : null}
      {choicesReady && selected.courseId && selected.learnerId && !currentSelection ? <p className="notice">{t.supportSourceUnavailable}</p> : null}
      {choicesReady && currentSelection && !assessmentCurrent ? <><p className="notice">{t.supportAssessmentUnavailable}</p>{!retained ? <Button type="button" variant="secondary" onClick={clearAssessment}>{t.supportChooseAssessmentAgain}</Button> : null}</> : null}
      {choicesReady && currentSelection && !assessmentChoices.length ? <p>{t.supportNoAssessments}</p> : null}
      {reviewReady ? <CommandForm key={supportDraftKey(selected)} title={t.approveLearningSupport} asRegion={false} path={supportPath} draftKey={supportDraftKey(selected)} fields={supportFields()} body={values => { if (!choicesReady || !currentSupportSelection(selected, courses.data, people.data)) throw new LearningApiError('conflict'); return supportApprovalBody(selected, values, assessments.data); }} validateReceipt={validateSupportReceipt} onValuesChange={() => setDraftRevision(value => value + 1)} onLockedChange={onSupportLocked} onSaved={savedSupport} onCancel={cancelSupport} note={`${selectedLearner?.displayName ?? t.nameUnavailable} · ${selectedCourse?.title ?? t.nameUnavailable}`} /> : null}
    </section> : null}
    {support.loading ? <p role="status">{t.loading}</p> : support.error ? <LearningError error={support.error} /> : support.data.map(item => <article className="school-record" key={item.id}><h3>{item.title}</h3><p>{item.learnerName} · {item.courseTitle}{item.assessmentTitle ? ` · ${item.assessmentTitle}` : ''}</p><p>{item.instructions}</p><p><bdi dir="ltr">{item.effectiveFrom}–{item.effectiveTo}</bdi></p><Status>{t.supportStates[item.state]}</Status>{item.approvalReason ? <details><summary>{t.supportApprovalDetails}</summary><p>{item.approvalReason}</p></details> : null}{approve && item.state !== 'REVOKED' ? <CommandForm title={t.revokeSupport} path={`/v1/school/learning-support/${item.id}/revoke`} fields={[{ name: 'reason', label: t.schoolApprovalReason, type: 'textarea', required: true }, { name: 'confirmRevocation', label: t.confirmSupportRevoke, type: 'checkbox', required: true }]} body={values => ({ expectedRevision: item.revision, reason: String(values.get('reason')), confirmRevocation: values.get('confirmRevocation') === 'on' })} validateReceipt={validateSupportReceipt} onSaved={saved} /> : null}</article>)}
    <LoadMore query={support} label={t.taskSupport} />
  </section>;
}

function OriginalSupport({ input, learnerName, courseTitle, assessmentTitle }: { input: SupportInput; learnerName: string; courseTitle: string; assessmentTitle: string }) {
  const { locale } = useApp(); const t = locale === 'ar' ? schoolAr : schoolEn;
  return <section aria-label={t.supportOriginalAction}><p className="notice">{t.supportOriginalAction}</p><h3>{input.title}</h3><dl><div><dt>{t.supportLearner}</dt><dd><bdi>{learnerName}</bdi></dd></div><div><dt>{t.supportCourse}</dt><dd><bdi>{courseTitle}</bdi></dd></div><div><dt>{t.supportAssessment}</dt><dd>{input.assessmentId ? assessmentTitle : t.courseWideParentSupport}</dd></div><div><dt>{t.supportInstructions}</dt><dd>{input.instructions}</dd></div><div><dt>{t.supportWindow}</dt><dd><bdi dir="ltr">{input.effectiveFrom}–{input.effectiveTo}</bdi></dd></div><div><dt>{t.shareSupportStudent}</dt><dd>{input.studentVisible ? t.approved : t.notEnabled}</dd></div><div><dt>{t.shareSupportParent}</dt><dd>{input.parentVisible ? t.approved : t.notEnabled}</dd></div><div><dt>{t.schoolApprovalReason}</dt><dd>{input.reason}</dd></div></dl></section>;
}
