import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button, CuevoIcon } from '@cuevo/ui';
import { Brand } from '../../shared/components/brand';
import { trailAssets } from '../../shared/characters/assets';
import '../../shared/characters/styles.css';
import './styles.css';
import './coordinator-trail-preview.css';
import { CoordinatorTrailHomeView } from './components/coordinator-trail-home';
import type { CoordinatorTrailAction, CoordinatorTrailContext } from './coordinator-trail-model';

function CoordinatorPreview({ locale, theme, state }: { locale: 'en' | 'ar'; theme: 'light' | 'dark'; state: 'reference' | 'unknown' | 'partial' | 'offline' | 'denied' | 'pending' | 'rubric' }) {
  const ar = locale === 'ar';
  const [receipt, setReceipt] = useState('');
  const action = (en: string, arabic: string): CoordinatorTrailAction => ({ label: ar ? arabic : en, pending: state === 'pending', onClick: () => setReceipt(ar ? 'معاينة تصميم فقط؛ لم يتغير سجل مدرسي.' : 'Design preview only; no school record changed.') });
  const context: CoordinatorTrailContext = {
    availability: 'ready', classLabel: ar ? 'صف توضيحي' : 'Example class', periodLabel: ar ? 'فترة مدرسية توضيحية' : 'Example school period', dateLabel: ar ? '٢ أكتوبر ٢٠٢٦' : '2 Oct 2026', primaryAction: action('Review class evidence', 'مراجعة شواهد الصف'),
    programmes: [
      { key: 'school-custom', name: 'School Custom', contextLabel: ar ? 'سياق مدرسي توضيحي حدده المعلّم' : 'Teacher-defined example school context', status: 'reviewed-school-context', statusLabel: ar ? 'سياق مدرسي مسجّل' : 'Recorded school context', action: action('Review programme', 'مراجعة البرنامج') },
      { key: 'period-source', name: ar ? 'مصادر الفترة والتخطيط' : 'Period sources and planning', contextLabel: ar ? 'خطة معلنة، وتعليم مسجّل، وشواهد أصلية' : 'Declared plan, recorded teaching and native evidence', status: 'requires-review', statusLabel: ar ? 'تتطلب المراجعة' : 'Requires review', action: action('Review source context', 'مراجعة سياق المصدر') },
    ],
    evidence: { status: 'ready', coverage: 'not-established', gap: { status: 'unknown', count: null, basis: null }, records: [{ key: 'fictional-source', learnerName: ar ? 'نور حسن' : 'Noor Hassan', title: ar ? 'اشرح طريقتك' : 'Explain your approach', contextLabel: ar ? 'استراتيجيات التعلّم · أظهر طريقة تفكيرك' : 'Learning strategies · Show your thinking', teacherName: ar ? 'مايا رحمن' : 'Maya Rahman', feedback: ar ? 'أظهر كل خطوة واشرح سبب اختيارك.' : 'Show each step and explain your choice.', action: action('View evidence', 'عرض الشواهد') }] },
    outcome: { title: ar ? 'متابعة مسجّلة مرتبطة بمصدر' : 'Recorded source-linked follow-up', nativeKind: state === 'rubric' ? 'rubric' : 'numeric', baselineView: <p className="coordinator-trail-preview__native" dir="ltr">{state === 'rubric' ? ar ? 'التعليل: نامٍ' : 'Reasoning: Developing' : ar ? '٢ من ٤' : '2 / 4'}</p>, followUpView: <p className="coordinator-trail-preview__native" dir="ltr">{state === 'rubric' ? ar ? 'التعليل: متقن' : 'Reasoning: Secure' : ar ? '٣ من ٤' : '3 / 4'}</p>, baselineDate: ar ? '٣٠ سبتمبر ٢٠٢٦' : '30 Sep 2026', followUpDate: ar ? '١ أكتوبر ٢٠٢٦' : '1 Oct 2026', observationLabel: state === 'rubric' ? ar ? 'قابلية مقارنة المعيار مجهولة' : 'Rubric comparability is unknown' : ar ? 'تغيّر ملحوظ +١ ضمن هذا المقياس الأصلي' : 'Observed change +1 on this native scale', action: action('Review source comparison', 'مراجعة مقارنة المصدر') },
    review: { title: ar ? 'متابعة الشواهد المرتبطة بالمصدر' : 'Follow up the source-linked evidence', description: ar ? 'راجع المتابعة المسجّلة مع المعلّم المسؤول قبل استخلاص نتيجة.' : 'Review the recorded follow-up with its responsible teacher before drawing a conclusion.', ownerName: ar ? 'مايا رحمن' : 'Maya Rahman', dueLabel: ar ? '٩ أكتوبر ٢٠٢٦' : '9 Oct 2026', action: action('Open review', 'فتح المراجعة') },
  };
  if (state === 'unknown') { context.programmes = []; context.evidence.status = 'unavailable'; context.evidence.records = []; context.outcome = null; context.review = null; context.classLabel = null; context.periodLabel = null; context.dateLabel = null; }
  if (state === 'partial') { context.availability = 'partial'; context.evidence.status = 'partial'; }
  if (state === 'offline' || state === 'denied') context.availability = state;
  const navigation = [{ label: ar ? 'البرامج' : 'Programmes', icon: 'learning' as const }, { label: ar ? 'المصادر والحقوق' : 'Sources and rights', icon: 'reflection' as const }, { label: ar ? 'شواهد الصف' : 'Class evidence', icon: 'community' as const }, { label: ar ? 'نتائج التقييم' : 'Assessment outcomes', icon: 'milestones' as const }, { label: ar ? 'نتائج الدعم' : 'Support outcomes', icon: 'parent' as const }, { label: ar ? 'تقارير أصلية' : 'Native reports', icon: 'reflection' as const }, { label: ar ? 'سياق المدرسة' : 'School context', icon: 'settings' as const }];
  return <div className="workspace coordinator-trail-preview" data-theme={theme} lang={locale} dir={ar ? 'rtl' : 'ltr'}><header className="coordinator-trail-preview__header"><Brand compact /><Button type="button" variant="secondary" className="coordinator-trail-preview__search" onClick={action('Open available navigation', 'فتح التنقل المتاح').onClick}><CuevoIcon name="search" />{ar ? 'الانتقال إلى مساحة العمل…' : 'Go to a workspace…'}</Button><span className="coordinator-trail-preview__school"><CuevoIcon name="school" variant="filled" />{ar ? 'مدرسة المثال' : 'Example school'}</span><div className="coordinator-trail-preview__account"><CuevoIcon name="person" /><div><strong>{ar ? 'رامي صالح' : 'Rami Saleh'}</strong><p>{ar ? 'منسّق' : 'Coordinator'}</p></div></div></header><nav className="coordinator-trail-preview__navigation" aria-label={ar ? 'مساحات المنسّق' : 'Coordinator workspaces'}>{navigation.map((item, index) => <button type="button" key={`${item.icon}:${index}`} aria-current={index === 0 ? 'page' : undefined} onClick={action(item.label, item.label).onClick}><CuevoIcon name={item.icon} variant="filled" size={27} /><span>{item.label}</span></button>)}</nav><main><CoordinatorTrailHomeView context={context} locale={locale} background={trailAssets.background} /></main>{receipt ? <div className="coordinator-trail-preview__receipt" role="status"><p>{receipt}</p><Button type="button" variant="quiet" aria-label={ar ? 'إغلاق' : 'Dismiss'} onClick={() => setReceipt('')}><CuevoIcon name="close" /></Button></div> : null}</div>;
}
const meta = { title: 'Coordinator/Trail home', component: CoordinatorPreview, parameters: { layout: 'fullscreen', trailFullscreen: true }, args: { locale: 'en', theme: 'light', state: 'reference' } } satisfies Meta<typeof CoordinatorPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Reference: Story = {};
export const Arabic: Story = { args: { locale: 'ar' }, globals: { locale: 'ar' } };
export const Dark: Story = { args: { theme: 'dark' } };
export const Unknown: Story = { args: { state: 'unknown' } };
export const Partial: Story = { args: { state: 'partial' } };
export const Offline: Story = { args: { state: 'offline' } };
export const Denied: Story = { args: { state: 'denied' } };
export const Pending: Story = { args: { state: 'pending' } };
export const Rubric: Story = { args: { state: 'rubric' } };
