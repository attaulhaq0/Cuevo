'use client';
import { useState } from 'react';
import { Button, CuevoIcon } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { LearningError } from '../../../shared/components/feedback';
import { parseSchoolAutomation, type SchoolAutomation } from '../automation-model';
import { automationEn, automationAr } from '../automation-messages';
import { SchoolAutomationReading, type AutomationControl } from './automation-reading';
export type { AutomationControl } from './automation-reading';

export function SchoolAutomationReview({ onControl }: { onControl?: (control: AutomationControl) => void }) {
  const { membership, locale } = useApp(); const t = locale === 'ar' ? automationAr : automationEn;
  const [refresh, setRefresh] = useState(0), [selectedId, setSelectedId] = useState<SchoolAutomation['policies'][number]['id'] | null>(null);
  const review = useApiQuery(membership?.role === 'admin' ? '/v1/school/automation' : null, parseSchoolAutomation, refresh);
  if (membership?.role !== 'admin') return null;
  return <section className="school-automation-review" aria-label={t.title}><header className="cuevo-section-header"><div className="cuevo-section-header__context"><h2>{t.title}</h2><details className="school-automation-help"><summary>{t.approval}</summary><p>{t.note}</p></details></div><Button type="button" variant="quiet" aria-label={t.refresh} onClick={() => setRefresh(value => value + 1)}><CuevoIcon name="refresh"/><span className="school-automation-refresh-label">{t.refresh}</span></Button></header>{review.loading ? <p role="status">{t.refresh}</p> : review.error ? <LearningError error={review.error} /> : review.data ? <SchoolAutomationReading review={review.data} locale={locale} selectedId={selectedId} onSelected={setSelectedId} onControl={onControl} /> : null}</section>;
}
