'use client';
import { WorkspaceState } from '@cuevo/ui';
import { useState } from 'react';
import { Button, CuevoIcon, Status } from '@cuevo/ui';
import { accessDirectoryEn, accessDirectoryAr, accessPageEn, accessPageAr } from '../access-directory-messages';
import { accessDirectoryPageSize, currentAccessDirectoryPage, navigateAccessDirectoryPage, type AccessDirectoryPage, type AccessDirectorySource, type AccessDirectoryKind, type AccessDirectoryRow } from '../access-directory-model';
import { LearningError } from '../../../shared/components/feedback';

export function AccessDirectory({ locale, kind, rows, selectedId, query, locked, statusLabel, onKind, onQuery, onSelect, source }: { locale: 'en' | 'ar'; kind: AccessDirectoryKind; rows: AccessDirectoryRow[]; selectedId: string | null; query: string; locked: boolean; statusLabel: (value: unknown) => string; onKind: (kind: AccessDirectoryKind) => void; onQuery: (value: string) => void; onSelect: (row: AccessDirectoryRow) => void; source?: AccessDirectorySource }) {
  const t = locale === 'ar' ? accessDirectoryAr : accessDirectoryEn; const pageCopy=locale==='ar'?accessPageAr:accessPageEn;
  const [expanded, setExpanded] = useState(false);
  const scope = `${source?.context ?? ''}:${kind}:${query}`;
  const [page,setPage] = useState<AccessDirectoryPage|null>(null);
  const currentPage = currentAccessDirectoryPage(page,scope,rows.length,source);
  // Reconcile metadata during render so old page intent cannot appear in a new frame.
  if (currentPage !== page) setPage(currentPage);
  const visibleRows = currentPage.denied || source && (!source.loaded || source.loading || source.error) ? [] : rows.slice(currentPage.index*accessDirectoryPageSize,(currentPage.index+1)*accessDirectoryPageSize);
  const waiting = !!currentPage.pendingCursor || !!source?.loadingMore;
  const canNext = (currentPage.index+1)*accessDirectoryPageSize<rows.length || !!source?.nextCursor;
  function navigate(direction:'previous'|'next') {
    if(locked||waiting)return;
    const next=navigateAccessDirectoryPage(currentPage,direction,rows.length,source);setPage(next);
    if(next.pendingCursor&&!currentPage.pendingCursor)source?.loadMore?.();
  }
  const labels = { person: t.people, enrollment: t.enrollment, assignment: t.assignment, guardian: t.guardian };
  return <section className="school-access-directory" aria-label={t.records} data-selected={!!selectedId} data-expanded={expanded}><div className="school-access-directory__groups" role="group" aria-label={t.title}>{(Object.keys(labels) as AccessDirectoryKind[]).map(key => <Button key={key} type="button" variant="quiet" aria-pressed={kind === key} disabled={locked} onClick={() => { setExpanded(false); onKind(key); }}>{labels[key]}</Button>)}</div>{selectedId ? <Button type="button" className="school-access-directory__change" variant="quiet" disabled={locked} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{t.change}</Button> : null}<div className="school-access-directory__search field"><label htmlFor="school-access-directory-search">{t.search}</label><input id="school-access-directory-search" type="search" value={query} disabled={locked} onChange={event => onQuery(event.target.value)} /></div><p className="learning-form__note">{t.partial}</p><div className="school-access-directory__rows">{currentPage.denied || source?.error ? <LearningError error={currentPage.denied??source!.error!}/> : source?.loading || source&&!source.loaded ? <WorkspaceState kind="loading" icon="refresh" description={pageCopy.loading} role="status"/> : visibleRows.length ? <ul>{visibleRows.map(row => <li key={row.id}><button type="button" disabled={locked || row.requiresReview} aria-current={selectedId === row.id ? 'true' : undefined} aria-label={`${t.review}: ${row.title} · ${row.context}`} onClick={() => { setExpanded(false); onSelect(row); }}><CuevoIcon name={kind === 'guardian' ? 'parent' : kind === 'person' ? 'person' : 'school'} size={28}/><span><strong><bdi>{row.title}</bdi></strong><small><bdi>{row.context}</bdi></small></span><Status tone={row.status === 'active' ? 'positive' : 'neutral'}>{statusLabel(row.status)}</Status><CuevoIcon name="arrow" size={18} className="directional-icon" /></button></li>)}</ul> : <WorkspaceState kind={source?.nextCursor || source?.moreError ? "review" : "empty"} icon="people" description={t.noMatches} role="status"/>}</div>{source?.moreError&&!currentPage.denied?<LearningError error={source.moreError}/>:null}{!currentPage.denied&&!source?.error&&(!source||source.loaded&&!source.loading)?<nav className="school-access-pagination pagination-actions" aria-label={pageCopy.navigation}><p>{pageCopy.page}</p><Button type="button" variant="secondary" disabled={locked||waiting||currentPage.index===0} onClick={()=>navigate('previous')}>{pageCopy.previous}</Button><Button type="button" variant="secondary" disabled={locked||waiting||!canNext} onClick={()=>navigate('next')}>{waiting?pageCopy.loading:pageCopy.next}</Button></nav>:null}</section>;
}
