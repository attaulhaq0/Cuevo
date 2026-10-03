'use client';

import { useState } from 'react';
import { Button } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { LearningError } from '../../../shared/components/feedback';
import { LoadMore } from '../../../shared/components/load-more';
import { LearningApiError } from '../../../shared/api/client';
import { schoolAr, schoolEn } from '../messages';
import { parentSupportCourses, parentSupportMatches, parentSupportPath, parseParentLearnerProfile, parseParentLearningSupport } from '../parent-support-model';

export function ParentLearningSupport({ learnerId, learnerName, refresh }: { learnerId: string; learnerName: string; refresh: number }) {
  const { locale } = useApp();
  const t = locale === 'ar' ? schoolAr : schoolEn;
  const [courseId, setCourseId] = useState('');
  const [retry, setRetry] = useState(0);
  const profile = useApiQuery(`/v1/school/learners/${learnerId}/profile`, parseParentLearnerProfile, refresh + retry);
  const currentProfile = !profile.loading && !profile.error && profile.data?.id === learnerId ? profile.data : null;
  const choices = currentProfile ? parentSupportCourses(currentProfile) : [];
  const path = parentSupportPath(currentProfile, learnerId, courseId);
  const support = usePaginatedLearningQuery(path, parseParentLearningSupport, refresh + retry);
  const matches = parentSupportMatches(support.data, learnerId, courseId);
  const active = matches ? support.data.filter(source => source.state === 'ACTIVE') : [];
  const date = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
  return <section className="school-section" aria-label={t.parentSupport}>
    <h2>{t.parentSupport}</h2><p><bdi>{learnerName}</bdi></p><p className="notice">{t.parentSupportNote}</p>
    <Button type="button" variant="quiet" onClick={() => setRetry(value => value + 1)}>{t.refreshParentSupport}</Button>
    {profile.loading ? <p role="status">{t.loadingParentSupport}</p> : profile.error ? <LearningError error={profile.error} /> : !currentProfile ? <LearningError error={new LearningApiError('invalid')} /> : !choices.length ? <p>{t.noParentSupportCourses}</p> : <>
      <div className="field"><label htmlFor="parent-support-course">{t.parentSupportCourse}</label><select id="parent-support-course" value={path ? courseId : ''} onChange={event => setCourseId(event.target.value)}><option value="">{t.chooseParentSupportCourse}</option>{choices.map(choice => <option key={choice.value} value={choice.value} disabled={choice.requiresReview}>{choice.label}</option>)}</select></div>
      {choices.some(choice => choice.requiresReview) ? <p className="notice">{t.parentSupportAmbiguous}</p> : null}
      {!path ? <p>{t.chooseParentSupportCourse}</p> : support.loading ? <p role="status">{t.loadingParentSupport}</p> : support.error ? <LearningError error={support.error} /> : support.moreError ? <LearningError error={support.moreError} /> : !matches ? <LearningError error={new LearningApiError('invalid')} /> : <>{!active.length ? <p>{t.noParentSupport}</p> : active.map(source => <article className="school-record" key={source.id}>
        <h3>{source.title}</h3><p>{source.courseTitle} · {source.assessmentTitle ?? t.courseWideParentSupport}</p><p className="lesson-content" dir="auto">{source.instructions}</p><p>{t.supportWindow}: <time dateTime={source.effectiveFrom}>{date(source.effectiveFrom)}</time>–<time dateTime={source.effectiveTo}>{date(source.effectiveTo)}</time> · UTC</p>
      </article>)}<LoadMore query={support} label={t.parentSupport} /></>}
    </>}
  </section>;
}
