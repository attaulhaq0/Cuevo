'use client';
import { useState } from 'react';
import { Button } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { LearningApiError } from '../../../shared/api/client';
import { LearningError } from '../../../shared/components/feedback';
import { CommandForm } from '../../../shared/components/command-form';
import { parsePortfolioSourceWork, type PortfolioItem } from '../model';
import { portfolioAr, portfolioEn } from '../messages';
import { PortfolioArtifactDownload } from './artifact-download';

export function PortfolioSourceWork({ item, reviewing = false, onSaved, onCancel }: { item: PortfolioItem; reviewing?: boolean; onSaved: () => void; onCancel: () => void }) {
  const { locale } = useApp(); const t = locale === 'ar' ? portfolioAr : portfolioEn;
  const [refresh, setRefresh] = useState(0); const [reviewedArtifacts,setReviewedArtifacts]=useState<string[]>([]);
  const query = useApiQuery(`/v1/portfolio/items/${item.id}/revisions/${item.revisionId}/source-work`, parsePortfolioSourceWork, refresh);
  const work = query.data;
  const matches = work && work.itemId === item.id && work.revisionId === item.revisionId && work.portfolioRevision === item.revision && work.learnerId === item.learnerId && work.evidenceId === item.evidenceId && work.resultId === item.resultId && work.source.submissionId === item.submissionId && work.policyVersion === item.policyVersion && work.referenceId === item.referenceId && work.referenceVersion === item.referenceVersion;
  return <section aria-label={t.sourceWork} className="portfolio-source-work">{query.loading ? <p role="status">{t.loadingWork}</p> : query.error ? <><LearningError error={query.error} /><Button type="button" variant="quiet" onClick={() => setRefresh(value => value + 1)}>{t.retryWork}</Button></> : !matches ? <LearningError error={new LearningApiError('invalid')} /> : <><h3>{t.sourceWork}</h3><p><bdi>{work.learnerName}</bdi> · {work.source.assessmentTitle}</p><p className="learning-form__note">{t.submissionRevision}: {new Intl.NumberFormat(locale).format(work.source.submissionRevision)} · <bdi>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(work.source.submittedAt))}</bdi></p>{work.source.kind==='TEXT'?<p className="lesson-content" dir="auto">{work.source.content}</p>:null}{work.source.artifacts?.map(asset=><PortfolioArtifactDownload key={asset.id} itemId={item.id} revisionId={item.revisionId} asset={asset} onReviewed={reviewing?()=>setReviewedArtifacts(current=>current.includes(asset.id)?current:[...current,asset.id]):undefined}/>)}{reviewing && work.source.artifacts?.some(asset=>!reviewedArtifacts.includes(asset.id)||asset.state!=='AVAILABLE') ? <p className="notice">{t.reviewDocuments}</p> : null}{reviewing && !work.source.artifacts?.some(asset=>!reviewedArtifacts.includes(asset.id)||asset.state!=='AVAILABLE') ? <CommandForm key={item.revisionId} title={t.review} path={`/v1/portfolio/items/${item.id}/review`} fields={[{ name: 'feedback', label: t.feedback, type: 'textarea', required: true, maxLength: 10000 }, { name: 'confirmSourceReview', label: t.confirmSourceReview, type: 'checkbox', required: true }, { name: 'featured', label: t.featured, type: 'checkbox', defaultChecked: item.featured }, { name: 'parentVisible', label: t.parentVisible, type: 'checkbox' }, { name: 'confirmParentApproval', label: t.confirmParentApproval, type: 'checkbox' }]} body={values => ({ feedback: String(values.get('feedback')), confirmSourceReview: values.get('confirmSourceReview') === 'on', featured: values.get('featured') === 'on', parentVisible: values.get('parentVisible') === 'on', confirmParentApproval: values.get('confirmParentApproval') === 'on', expectedRevision: item.revision })} onSaved={onSaved} onCancel={onCancel} note={t.reviewNote} /> : null}</>}{reviewing && !matches ? <Button type="button" variant="quiet" onClick={onCancel}>{t.cancelReview}</Button> : null}</section>;
}


