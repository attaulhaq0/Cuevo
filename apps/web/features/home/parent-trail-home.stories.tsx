import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button, CuevoIcon } from '@cuevo/ui';
import { Brand } from '../../shared/components/brand';
import { trailAssets } from '../../shared/characters/assets';
import '../../shared/characters/styles.css';
import './styles.css';
import './parent-trail-preview.css';
import { ParentTrailHomeView } from './components/parent-trail-home';
import type { ParentTrailAction, ParentTrailContext } from './parent-trail-model';

function ParentPreview({ locale, theme, state }: { locale: 'en' | 'ar'; theme: 'light' | 'dark'; state: 'reference' | 'unknown' | 'resolving' | 'selection' | 'denied' | 'offline' | 'error' | 'pending' }) {
  const ar = locale === 'ar';
  const [receipt, setReceipt] = useState('');
  const action = (en: string, arabic: string): ParentTrailAction => ({ label: ar ? arabic : en, pending: state === 'pending', onClick: () => setReceipt(ar ? 'معاينة تصميم فقط؛ لم يتغير سجل مدرسي.' : 'Design preview only; no school record changed.') });
  const context: ParentTrailContext = {
    availability: 'ready', child: { status: 'ready', key: 'storybook-child', name: ar ? 'نور حسن' : 'Noor Hassan', classLabel: ar ? 'صف توضيحي' : 'Example class', schoolName: ar ? 'مدرسة المثال' : 'Example school' },
    selector: <label className="parent-trail-preview__selector">{ar ? 'الطفل الحالي' : 'Current child'}<select aria-label={ar ? 'اختر الطفل' : 'Choose a child'} defaultValue="noor"><option value="noor">{ar ? 'نور حسن · صف توضيحي' : 'Noor Hassan · Example class'}</option></select></label>,
    snapshot: { childKey: 'storybook-child', status: 'ready',
      feedback: { publication: 'approved', title: ar ? 'اشرح طريقتك' : 'Explain your approach', text: ar ? 'أظهر كل خطوة واشرح سبب اختيارك.' : 'Show each step and explain your choice.', teacherName: ar ? 'مايا رحمن' : 'Maya Rahman', dateLabel: ar ? '١ أكتوبر ٢٠٢٦' : '1 Oct 2026', description: ar ? 'تخص هذه الملاحظات عمل نور المنشور. يمكنك استخدامها لمناقشة الشرح التالي.' : 'This feedback belongs to Noor’s released work. You can use it to discuss the next explanation.', nativeResultView: <p>{ar ? 'المقياس الأصلي المعرّف من المعلّم: ٣ من ٤' : 'Teacher-defined native scale: 3 / 4'}</p>, action: action('Read approved report', 'قراءة التقرير المعتمد') },
      portfolio: { publication: 'approved', title: ar ? 'اشرح طريقتك' : 'Explain your approach', description: ar ? 'عمل نور المنشور والمختار.' : 'Noor’s selected released work.', action: action('View approved work', 'عرض العمل المعتمد') },
      upcoming: [{ key: 'school-update', title: ar ? 'تحديث مدرسي معتمد' : 'Approved school update', description: ar ? 'راجع العمل والتواريخ التي شاركتها المدرسة.' : 'Review the work and dates shared by your school.', dateLabel: ar ? '٢ أكتوبر ٢٠٢٦' : '2 Oct 2026', action: action('Open school update', 'فتح التحديث المدرسي') }],
      communication: { status: 'available', title: ar ? 'رسائل مدرسية مع المعلّم' : 'School-scoped conversation with your teacher', teacherName: ar ? 'مايا رحمن' : 'Maya Rahman', description: ar ? 'افتح المحادثة الحالية المعتمدة لطفلك مع معلّمه.' : 'Open the current authorized conversation for your child and teacher.', action: action('Open school communication', 'فتح التواصل المدرسي') },
      support: { title: ar ? 'اطلب من نور شرح الاختيار وكل خطوة.' : 'Ask Noor to explain the choice and each step.', description: ar ? 'راجعوا العمل معًا وناقشوا طريقة الشرح المرتبطة بملاحظات المعلّم المعتمدة.' : 'Look at the work together and talk through the explanation linked to approved teacher feedback.', action: action('See support ideas', 'عرض أفكار الدعم') },
    },
  };
  if (state === 'unknown') context.snapshot = { ...context.snapshot!, status: 'unavailable', feedback: null, portfolio: null, upcoming: [], communication: null, support: null };
  if (state === 'resolving') context.child = { status: 'resolving' };
  if (state === 'selection') context.child = { status: 'selection-required' };
  if (state === 'denied' || state === 'offline' || state === 'error') context.availability = state;
  const navigation = [{ name: ar ? 'نظرة على الطفل' : 'Child overview', icon: 'home' as const }, { name: ar ? 'التقدّم' : 'Progress', icon: 'progress' as const }, { name: ar ? 'القادم' : 'Upcoming', icon: 'calendar' as const }, { name: ar ? 'ملف أعمال معتمد' : 'Approved portfolio', icon: 'portfolio' as const }, { name: ar ? 'التواصل المدرسي' : 'School communication', icon: 'feedback' as const }];
  return <div className="workspace parent-trail-preview" data-theme={theme} lang={locale} dir={ar ? 'rtl' : 'ltr'}><header className="parent-trail-preview__header"><Brand compact /><nav aria-label={ar ? 'مساحات ولي الأمر' : 'Parent workspaces'}>{navigation.map((item, index) => <button key={item.icon} type="button" aria-current={index === 0 ? 'page' : undefined} onClick={action(item.name, item.name).onClick}><CuevoIcon name={item.icon} size={24} /><span>{item.name}</span></button>)}</nav><div className="parent-trail-preview__account"><CuevoIcon name="person" /><div><strong>{ar ? 'سميرة حسن' : 'Samira Hassan'}</strong><p>{ar ? 'ولي أمر' : 'Parent / Guardian'}</p></div></div></header><main><ParentTrailHomeView context={context} locale={locale} background={trailAssets.background} /></main>{receipt ? <div className="parent-trail-preview__receipt" role="status"><p>{receipt}</p><Button type="button" variant="quiet" aria-label={ar ? 'إغلاق' : 'Dismiss'} onClick={() => setReceipt('')}><CuevoIcon name="close" /></Button></div> : null}</div>;
}
const meta = { title: 'Parent/Trail home', component: ParentPreview, parameters: { layout: 'fullscreen', trailFullscreen: true }, args: { locale: 'en', theme: 'light', state: 'reference' } } satisfies Meta<typeof ParentPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Reference: Story = {};
export const Arabic: Story = { args: { locale: 'ar' }, globals: { locale: 'ar' } };
export const Dark: Story = { args: { theme: 'dark' } };
export const Unknown: Story = { args: { state: 'unknown' } };
export const Resolving: Story = { args: { state: 'resolving' } };
export const Selection: Story = { args: { state: 'selection' } };
export const Denied: Story = { args: { state: 'denied' } };
export const Offline: Story = { args: { state: 'offline' } };
export const Error: Story = { args: { state: 'error' } };
export const Pending: Story = { args: { state: 'pending' } };
