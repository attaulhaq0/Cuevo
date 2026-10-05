'use client';
import { useState } from 'react';
import { Button } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { LearningError } from '../../../shared/components/feedback';
import type { LearningApiError } from '../../../shared/api/client';
import { parseSchoolAudit, type SchoolAuditRow } from '../model';
import { schoolAr, schoolEn } from '../messages';
import { auditAr, auditEn } from '../audit-messages';
import { currentAuditDenial, admittedAuditRows, currentAuditPages, auditPageRows, navigateAuditPage, auditReadFrame, type AuditDenial, type AuditPages } from '../audit-read-model';
import { SchoolAuditReading } from './audit-reading';

export function SchoolAudit({ pageHeading = false }: { pageHeading?: boolean } = {}) {
  const app = useApp();
  return <CurrentSchoolAudit key={auditReadFrame(app)} pageHeading={pageHeading} />;
}
function CurrentSchoolAudit({ pageHeading }: { pageHeading: boolean }) {
  const { locale } = useApp(); const [refresh, setRefresh] = useState(0);
  const query = usePaginatedLearningQuery('/v1/school/audit?limit=25', parseSchoolAudit, refresh);
  const scope = query.context;
  const [denial, setDenial] = useState<AuditDenial | null>(null);
  const currentDenial = currentAuditDenial(denial, scope, query);
  if (currentDenial !== denial) setDenial(currentDenial);
  const [pages, setPages] = useState<AuditPages<SchoolAuditRow> | null>(null);
  const currentPages = currentAuditPages(pages, scope, query, currentDenial);
  if (currentPages !== pages) setPages(currentPages);
  const rows = auditPageRows(currentPages, admittedAuditRows(query, currentDenial));
  const source = currentDenial ? { ...query, error: currentDenial.error } : query;
  const canNext = currentPages.index < currentPages.pages.length - 1 || !!query.nextCursor;
  function next() {
    const updated = navigateAuditPage(currentPages, 'next');
    setPages(updated);
    if (updated.pendingNext && !currentPages.pendingNext) query.loadMore();
  }
  return <SchoolAuditView pageHeading={pageHeading} source={source} rows={rows} locale={locale} canPrevious={currentPages.index > 0} canNext={canNext}
    onRefresh={() => setRefresh(value => value + 1)} onPrevious={() => setPages(navigateAuditPage(currentPages, 'previous'))} onNext={next} />;
}

type Source = { loading: boolean; loadingMore: boolean; error: LearningApiError | null; moreError: LearningApiError | null; nextCursor: string | null };
/** One cursor-page presentation over the existing admitted current query. */
export function SchoolAuditView({ source, rows, locale, canPrevious, canNext, onPrevious, onNext, onRefresh, pageHeading = false }: {
  source: Source; rows: SchoolAuditRow[]; locale: 'en' | 'ar'; canPrevious: boolean; canNext: boolean; pageHeading?: boolean;
  onPrevious: () => void; onNext: () => void; onRefresh: () => void;
}) {
  const t = locale === 'ar' ? schoolAr : schoolEn, copy = locale === 'ar' ? auditAr : auditEn;
  const denied = [source.error, source.moreError].find(error => error?.kind === 'denied' || error?.kind === 'unauthorized');
  const error = denied ?? source.error;
  return <section aria-label={t.audit}><header className="cuevo-section-header"><div className="cuevo-section-header__context">{pageHeading ? null : <h2>{t.audit}</h2>}<p>{t.auditNote}</p></div><Button type="button" variant="quiet" onClick={onRefresh}>{t.refresh}</Button></header>
    {source.loading ? <p role="status">{t.loading}</p> : error ? <LearningError error={error} /> : <>
      <SchoolAuditReading pageHeading={pageHeading} rows={rows} locale={locale} />{!rows.length ? <p>{copy.emptyPage}</p> : null}
      {source.moreError ? <LearningError error={source.moreError} /> : null}
      <nav className="school-audit-pagination pagination-actions" aria-label={copy.navigation}>
        <p role="status">{copy.loadedPage}</p>
        <Button type="button" variant="secondary" data-audit-previous disabled={!canPrevious || source.loadingMore} onClick={onPrevious}>{copy.previous}</Button>
        <Button type="button" variant="secondary" data-audit-next disabled={!canNext || source.loadingMore} onClick={onNext}>{source.loadingMore ? t.loading : copy.next}</Button>
      </nav>
    </>}
  </section>;
}
