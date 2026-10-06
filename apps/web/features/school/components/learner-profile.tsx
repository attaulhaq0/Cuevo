'use client';
import { WorkspaceState } from '@cuevo/ui';
import { useCallback, useId, useState } from 'react';
import { CuevoIcon, IconButton } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { parsePersonChoice, currentLearnerChoices } from '../../../shared/api/people';
import { LearningError } from '../../../shared/components/feedback';
import { LoadMore } from '../../../shared/components/load-more';
import { ChildSelector } from '../../../shared/components/child-selector';
import { useChildContext } from '../../../shared/hooks/use-child-context';
import { currentSchoolRead, parseCurrentLearnerProfile } from '../model';
import { learnerProfileAr, learnerProfileEn } from '../day-messages';
import { learnerProfileChoiceState } from '../learner-profile-choice-state';

export function LearnerProfile() {
  const { membership } = useApp();
  return <CurrentLearnerProfile key={`${membership?.schoolId}:${membership?.userId}:${membership?.role}`} />;
}
function CurrentLearnerProfile() {
  const { membership, locale, status, online, apiUrl, accessGeneration, accessToken } = useApp();
  const t = locale === 'ar' ? learnerProfileAr : learnerProfileEn;
  const own = membership?.role === 'student'; const parent = membership?.role === 'parent';
  const ready = status === 'ready' && online && !!membership?.entitlements.includes('school.operations');
  const [selected, setSelected] = useState(''); const [refresh, setRefresh] = useState(0); const id = useId();
  const childContext = useChildContext(refresh);
  const people = usePaginatedLearningQuery(ready && !own && !parent ? '/v1/people?limit=25' : null, parsePersonChoice, refresh);
  const choices = currentLearnerChoices(people.data, t.contextUnknown);
  const choiceState = learnerProfileChoiceState(people, choices, selected);
  const complete = people.loaded && !people.loading && !people.nextCursor && !people.error && !people.moreError;
  const childComplete = childContext.query.loaded && !childContext.query.loading && !childContext.query.nextCursor && !childContext.query.error && !childContext.query.moreError;
  const learnerId = !ready ? '' : own ? membership.userId : parent ? childComplete ? childContext.child?.id ?? '' : '' : complete && choices.some(choice => choice.value === selected && !choice.requiresReview) ? selected : '';
  const scope = `${apiUrl}:${membership?.schoolId}:${membership?.userId}:${membership?.role}:${accessToken ?? ''}:${online}:${learnerId}:${refresh}:${accessGeneration}`;
  const parse = useCallback((value: unknown) => ({ scope, value: parseCurrentLearnerProfile(value, learnerId) }), [scope, learnerId]);
  const read = useApiQuery(learnerId ? `/v1/school/learners/${encodeURIComponent(learnerId)}/profile` : null, parse, refresh);
  const profile = currentSchoolRead(read.data, scope);
  const date = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));
  if (!ready) return null;
  return <section className="school-profile cuevo-record" aria-label={t.title}>
    <header className="school-day-heading"><CuevoIcon name="person" variant="filled" size={32} /><div><h2>{t.title}</h2><p>{t.note}</p></div><IconButton icon="refresh" label={t.refresh} onClick={() => setRefresh(value => value + 1)} /></header>
    {parent ? <ChildSelector context={childContext} /> : !own ? <div className="field school-profile-selector"><label htmlFor={`${id}-learner`}>{t.choose}</label><select id={`${id}-learner`} value={selected} onChange={event => setSelected(event.target.value)}><option value="">{t.choose}</option>{choices.map(choice => <option key={choice.value} value={choice.value} disabled={choice.requiresReview}>{choice.label}</option>)}</select><LoadMore query={people} />{people.nextCursor ? <WorkspaceState kind="review" icon="people" description={t.completeChoices}/> : null}{choices.some(choice => choice.requiresReview) ? <WorkspaceState kind="review" icon="people" description={t.ambiguous}/> : null}{people.error ? <LearningError error={people.error} /> : null}</div> : null}
    {!learnerId ? <WorkspaceState kind={parent ? "unknown" : choiceState === 'LOADING' ? "loading" : choiceState === 'FAILED' ? "unavailable" : choiceState === 'INCOMPLETE' || choiceState === 'REQUIRES_REVIEW' ? "review" : choiceState === 'EMPTY' ? "empty" : "unknown"} icon="person" description={parent ? t.chooseChild : choiceState === 'LOADING' ? t.loadingChoices : choiceState === 'FAILED' ? t.choicesUnavailable : choiceState === 'INCOMPLETE' ? t.completeChoices : choiceState === 'EMPTY' ? t.noLearners : choiceState === 'REQUIRES_REVIEW' ? t.ambiguous : t.chooseContext} role="status"/> : read.loading || !profile && !read.error ? <WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/> : read.error ? <LearningError error={read.error} /> : profile ? <>
      <section className="school-profile-identity"><CuevoIcon name="school" variant="filled" size={32} /><div><h3><bdi>{profile.displayName}</bdi></h3><p><bdi>{profile.schoolName}</bdi></p></div></section>
      <div className="school-profile-layout"><section className="school-day-panel"><div className="school-day-heading"><CuevoIcon name="people" variant="filled" size={26} /><h3>{t.classes}</h3></div>{profile.enrollments.length ? <ul className="school-profile-list">{profile.enrollments.map(item => <li key={item.classId}><h4><bdi>{item.className}</bdi></h4><p><bdi>{item.yearGroupName}</bdi> · <bdi>{item.academicYearName}</bdi></p><dl><div><dt>{t.from}</dt><dd><time dateTime={item.effectiveFrom}>{date(item.effectiveFrom)}</time></dd></div><div><dt>{t.to}</dt><dd>{item.effectiveTo ? <time dateTime={item.effectiveTo}>{date(item.effectiveTo)}</time> : t.ongoing}</dd></div></dl></li>)}</ul> : <WorkspaceState kind="empty" icon="learning" description={t.empty}/>}</section>
      <section className="school-day-panel"><div className="school-day-heading"><CuevoIcon name="learning" variant="filled" size={26} /><h3>{t.courses}</h3></div>{profile.courses.length ? <ul className="school-profile-list">{profile.courses.map(item => <li key={item.id}><h4><bdi>{item.title}</bdi></h4><p><bdi>{item.className}</bdi> · <bdi>{item.subjectName}</bdi></p></li>)}</ul> : <WorkspaceState kind="empty" icon="learning" description={t.empty}/>}</section></div>
    </> : null}
  </section>;
}
