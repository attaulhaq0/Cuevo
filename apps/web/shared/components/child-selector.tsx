'use client';
import { useId } from 'react';
import { useApp } from '../session/providers';
import { useChildContext } from '../hooks/use-child-context';
import { LearningError } from './feedback';
import { LoadMore } from './load-more';
export function ChildSelector({ context }: { context: ReturnType<typeof useChildContext> }) {
  const { locale } = useApp(); const id = useId();
  if (!context.parent) return null;
  const t = locale === 'ar' ? { child: 'الطفل', choose: 'اختر الطفل لعرض سجلاته', empty: 'لا يتاح طفل ضمن العلاقات الحالية المعتمدة.', loading: 'جارٍ التحقق من علاقات الأطفال…', ambiguous: 'تحتاج المدرسة إلى توضيح السجلات المتشابهة قبل الاختيار.' } : { child: 'Child', choose: 'Choose a child to view their records', empty: 'No child is available through your current approved relationships.', loading: 'Checking current child relationships…', ambiguous: 'Your school needs to distinguish matching child records before selection.' };
  const label = (child: (typeof context.children)[number]) => [child.displayName, ...child.classLabels].join(' · ');
  const ambiguous = context.children.some(child => context.children.filter(person => label(person) === label(child)).length > 1);
  return <section className="home-context-section">{context.query.error ? <LearningError error={context.query.error} /> : context.query.loading ? <p role="status">{t.loading}</p> : context.children.length ? <div className="field"><label htmlFor={id}>{t.child}</label><select id={id} value={context.child?.id ?? ''} onChange={event => context.selectChild(event.target.value)}><option value="">{t.choose}</option>{context.children.map(child => <option key={child.id} value={child.id} disabled={context.children.filter(person => label(person) === label(child)).length > 1}>{label(child)}</option>)}</select>{ambiguous ? <p className="notice">{t.ambiguous}</p> : null}</div> : <p>{t.empty}</p>}<LoadMore query={context.query} /></section>;
}
