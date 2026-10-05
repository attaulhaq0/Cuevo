'use client';
import { useCallback, useState } from 'react';
import { Button, WorkspaceState } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { CommandForm } from '../../../shared/components/command-form';
import { LoadMore } from '../../../shared/components/load-more';
import { LearningError } from '../../../shared/components/feedback';
import { EvidenceDetail } from '../../academic/ui';
import { currentAttentionPolicy, parseLearnerAttentionSignal } from '../model';
import { progressAr, progressEn } from '../messages';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { LearningApiError } from '../../../shared/api/client';
import { AttentionSignalReading,TeacherAttentionReading } from './attention-reading';
type AttentionPolicy = { id: string; version: number; minimumDecline: number; maxScore: number; missingDueCount: number; windowDays: number; approvedAt: string };
function parsePolicy(value: unknown): { policy: AttentionPolicy | null } {
  if (!value || typeof value !== 'object' || !('policy' in value)) throw new LearningApiError('invalid');
  if (value.policy === null) return { policy: null };
  const policy = value.policy as AttentionPolicy;
  if (!policy || typeof policy !== 'object' || typeof policy.id !== 'string' || !Number.isInteger(policy.version) || policy.version < 1 || !Number.isFinite(policy.minimumDecline) || policy.minimumDecline <= 0 || !Number.isFinite(policy.maxScore) || policy.maxScore <= 0 || !Number.isInteger(policy.missingDueCount) || !Number.isInteger(policy.windowDays) || !Number.isFinite(Date.parse(policy.approvedAt))) throw new LearningApiError('invalid');
  return { policy };
}
export function AttentionSection({ learnerId, refresh }: { learnerId: string; refresh: number }) {
  const { membership, locale, accessToken, accessGeneration, online, status, apiUrl } = useApp(); const t = locale === 'ar' ? progressAr : progressEn; const parent = membership?.role === 'parent'; const staff = !!membership && !['student', 'parent'].includes(membership.role);
  const [localRefresh, setLocalRefresh] = useState(0); const [refreshForm, setRefreshForm] = useState(false); const [policyForm, setPolicyForm] = useState(false); const [evidence, setEvidence] = useState<string | null>(null);
  const parseCurrentSignal = useCallback((value: unknown) => parseLearnerAttentionSignal(value, learnerId), [learnerId]);
  const signals = usePaginatedLearningQuery(parent ? null : `/v1/attention-signals?limit=100&learnerId=${learnerId}`, parseCurrentSignal, refresh + localRefresh);
  const policyScope=`${apiUrl}:${membership?.schoolId}:${membership?.userId}:${membership?.role}:${accessToken??''}:${accessGeneration}:${online}:${status}:${refresh}:${localRefresh}`;
  const policyParser=useCallback((value:unknown)=>({scope:policyScope,value:parsePolicy(value)}),[policyScope]);
  const policyRead = useApiQuery(staff ? '/v1/attention-policy' : null, policyParser, refresh + localRefresh);
  const policy={...policyRead,data:policyRead.data?.scope===policyScope?policyRead.data.value:null};
  const approvedPolicy=currentAttentionPolicy(policyRead.data,policyScope,policyRead.loading,!!policyRead.error);
  if (parent) return null;
  const records=<>{signals.loading ? <WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/> : signals.error ? <LearningError error={signals.error} /> : signals.data.length ? signals.data.map(signal => <AttentionSignalReading key={signal.id} signal={signal} locale={locale} evidenceId={evidence} onEvidence={setEvidence} evidence={evidence?<EvidenceDetail evidenceId={evidence}/>:null}/>) : <WorkspaceState kind={!signals.loaded||signals.nextCursor||signals.moreError||signals.loadingMore?"unknown":"empty"} icon="progress" description={!signals.loaded||signals.nextCursor||signals.moreError||signals.loadingMore?t.moreClassSources:t.noAttention}/>}<LoadMore query={signals} /></>;
  const controls=<>{staff ? <div className="learning-actions"><Button type="button" variant="quiet" onClick={()=>setLocalRefresh(value=>value+1)}>{t.refreshAttentionRecords}</Button><Button type="button" variant="secondary" disabled={policy.loading || !!policy.error || !approvedPolicy} onClick={() => setRefreshForm(value => !value)}>{t.attentionRefresh}</Button>{membership?.role === 'admin' ? <Button type="button" variant="quiet" disabled={policy.loading || !!policy.error || !policy.data} onClick={() => setPolicyForm(value => !value)}>{t.approveAttentionPolicy}</Button> : null}</div> : null}{staff && policy.error ? <LearningError error={policy.error}/> : null}{refreshForm && !signals.loading && !signals.error && !policy.loading && !policy.error && approvedPolicy ? <CommandForm title={t.attentionRefresh} path={`/v1/learners/${learnerId}/attention-refresh`} fields={[]} body={() => ({ expectedPolicyVersion: approvedPolicy!.version })} onSaved={() => { setRefreshForm(false); setLocalRefresh(value => value + 1); }} onCancel={() => setRefreshForm(false)} actionLabel={t.attentionRefresh} /> : null}{policyForm && membership?.role === 'admin' ? <CommandForm title={t.approveAttentionPolicy} path="/v1/attention-policies" fields={[{ name: 'minimumDecline', label: t.minimumDecline, type: 'number', min: 0.01, step: 'any', required: true }, { name: 'maxScore', label: t.policyMaxScore, type: 'number', min: 0.01, step: 'any', required: true }, { name: 'missingDueCount', label: t.missingThreshold, type: 'number', min: 1, max: 100, required: true }, { name: 'windowDays', label: t.windowDays, type: 'number', min: 1, max: 365, required: true }, { name: 'confirmApproval', label: t.confirmAttention, type: 'checkbox', required: true }]} body={values => ({ expectedVersion: policy.data?.policy?.version ?? 0, minimumDecline: Number(values.get('minimumDecline')), maxScore: Number(values.get('maxScore')), missingDueCount: Number(values.get('missingDueCount')), windowDays: Number(values.get('windowDays')), confirmApproval: values.get('confirmApproval') === 'on' })} onSaved={() => { setPolicyForm(false); setLocalRefresh(value => value + 1); }} onCancel={() => setPolicyForm(false)} note={t.attentionNote} /> : null}</>;
  return membership?.role=== 'teacher' ? <TeacherAttentionReading locale={locale} controls={controls}>{records}</TeacherAttentionReading> : <section className="progress-section progress-attention" aria-label={t.attention}><h2>{t.attention}</h2><p className="notice">{t.attentionNote}</p>{controls}{records}</section>;
}
