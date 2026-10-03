'use client';
import { useState } from 'react';
import { useApp } from '../../../shared/session/providers';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { parseSchoolPerson } from '../model';
import { CommandForm } from '../../../shared/components/command-form';
import { LearningError } from '../../../shared/components/feedback';
import { LoadMore } from '../../../shared/components/load-more';
export function SchoolAccountRecovery({ onRequested }: { onRequested: () => void }) {
  const { locale, dictionary } = useApp(); const ar = locale === 'ar'; const [selected, setSelected] = useState('');
  const people = usePaginatedLearningQuery('/v1/school/people?limit=100', parseSchoolPerson, 0); const person = people.data.find(item => item.id === selected && item.status === 'active');
  return <section className="school-section" aria-label={ar ? 'استعادة حساب عضو المدرسة' : 'Recover a school member account'}><h3>{ar ? 'استعادة حساب عضو المدرسة' : 'Recover a school member account'}</h3><p>{ar ? 'راجع هوية العضو الحالي قبل الموافقة. تُغيّر الاستعادة كلمة المرور ولا تعيد صلاحيات موقوفة أو ملغاة.' : 'Review the current member identity before approval. Recovery changes a password and does not restore suspended or revoked access.'}</p>{people.loading ? <p role="status">{ar ? 'جارٍ تحميل الأعضاء…' : 'Loading members…'}</p> : people.error ? <LearningError error={people.error} /> : <label>{ar ? 'العضو الحالي' : 'Current member'}<select value={selected} onChange={event => setSelected(event.target.value)}><option value="">{ar ? 'اختر…' : 'Choose…'}</option>{people.data.filter(person => person.status === 'active').map(person => <option key={person.id} value={person.id}>{person.displayName} · {dictionary.roles[person.role]}</option>)}</select></label>}<LoadMore query={people} />{person ? <CommandForm key={`${person.id}:${person.revision}`} title={ar ? 'الموافقة على استعادة الحساب' : 'Approve account recovery'} path={`/v1/school/accounts/${person.id}/recovery`} fields={[{ name: 'reason', label: ar ? 'سبب موافقة المدرسة' : 'School approval reason', type: 'textarea', required: true, maxLength: 1000 }, { name: 'confirmRecovery', label: ar ? 'راجعت هوية هذا العضو وأوافق على الاستعادة' : 'I reviewed this member identity and approve recovery', type: 'checkbox', required: true }]} body={values => ({ expectedMembershipRevision: person.revision, reason: String(values.get('reason')).trim(), confirmRecovery: values.get('confirmRecovery') === 'on' })} onSaved={onRequested} /> : null}</section>;
}
