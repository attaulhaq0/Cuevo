'use client';
import type { SchoolContext } from '../model';
import { useApp } from '../../../shared/session/providers';
import { CommandForm } from '../../../shared/components/command-form';
import { schoolAr, schoolEn } from '../messages';
export function SchoolPolicyForm({ context, canManage, onChanged }: { context: SchoolContext; canManage: boolean; onChanged: () => void }) {
  const { locale } = useApp(); const t = locale === 'ar' ? schoolAr : schoolEn;
  const toggles = [{ name: 'parentAttendanceVisible', label: t.parentAttendance }, { name: 'parentUpcomingVisible', label: t.parentUpcoming }, { name: 'recognitionEnabled', label: t.recognition }, { name: 'leaderboardEnabled', label: t.leaderboard }, { name: 'analyticsEnabled', label: t.analytics }];
  return <section className="school-section"><h2>{t.policies}</h2><p>{t.policyVersion}: {context.policy.version}</p><p className="notice">{t.policyNote}</p><dl className="academic-facts">{toggles.map(toggle => <div key={toggle.name}><dt>{toggle.label}</dt><dd>{context.policy[toggle.name as keyof typeof context.policy] === true ? t.approved : '—'}</dd></div>)}</dl>{canManage ? <CommandForm title={t.approvePolicy} path="/v1/school/policies" fields={[...toggles.map(toggle => ({ ...toggle, type: 'checkbox' as const, defaultChecked: context.policy[toggle.name as keyof typeof context.policy] === true })), { name: 'reason', label: t.reason, type: 'textarea', required: true, maxLength: 1000 }, { name: 'confirmPolicyApproval', label: t.confirmPolicy, type: 'checkbox', required: true }]} body={values => ({ expectedVersion: context.policy.version, studentMessagingEnabled: false, ...Object.fromEntries(toggles.map(toggle => [toggle.name, values.get(toggle.name) === 'on'])), reason: String(values.get('reason')), confirmPolicyApproval: values.get('confirmPolicyApproval') === 'on' })} onSaved={onChanged} note={t.policyNote} /> : null}</section>;
}
