import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button, CuevoIcon } from '@cuevo/ui';
import { Brand } from '../../shared/components/brand';
import { trailAssets } from '../../shared/characters/assets';
import '../../shared/characters/styles.css';
import './styles.css';
import './teacher-trail-preview.css';
import { TeacherTrailHomeView } from './components/teacher-trail-home';
import type { TeacherTrailAction, TeacherTrailContext } from './teacher-trail-model';

function TeacherPreview({ locale, theme, state }: { locale: 'en' | 'ar'; theme: 'light' | 'dark'; state: 'reference' | 'unknown' | 'partial' | 'offline' | 'denied' | 'pending' }) {
  const ar = locale === 'ar';
  const [receipt, setReceipt] = useState('');
  const action = (label: string, arabic: string): TeacherTrailAction => ({ label: ar ? arabic : label, pending: state === 'pending', onClick: () => setReceipt(ar ? 'معاينة تصميم ببيانات توضيحية؛ لم يتغير سجل مدرسي.' : 'Design preview with illustrative records; no school record changed.') });
  const context: TeacherTrailContext = {
    availability: 'ready', dateLabel: ar ? 'الجمعة، ٢ أكتوبر ٢٠٢٦' : 'Fri 2 Oct 2026',
    attention: { status: 'ready', items: [
      { key: 'fictional-marking', kind: 'marking', title: ar ? 'اشرح طريقتك' : 'Explain your approach', learnerName: ar ? 'نور حسن' : 'Noor Hassan', classLabel: ar ? 'صف توضيحي' : 'Example class', state: 'needs-review', statusLabel: ar ? 'تم تسليم محاولة جديدة' : 'New attempt submitted', dateLabel: ar ? '٢ أكتوبر ٢٠٢٦' : '2 Oct 2026', nativeKind: 'numeric', action: action('Review work', 'مراجعة العمل'), currentSubmission: { text: ar ? 'اخترت جدولًا لأنه ساعدني في إظهار خطواتي.' : 'I chose a table because it helped me show my steps.', dateLabel: null, action: action('Open current submission', 'فتح التسليم الحالي') }, earlierFeedback: { text: ar ? 'أظهر كل خطوة واشرح سبب اختيارك.' : 'Show each step and explain your choice.', authorName: ar ? 'مايا رحمن' : 'Maya Rahman', dateLabel: ar ? '١ أكتوبر ٢٠٢٦' : '1 Oct 2026', action: action('Read earlier feedback', 'قراءة الملاحظات السابقة') } },
      { key: 'fictional-support', kind: 'support', title: ar ? 'تدريب معتمد' : 'Approved practice', learnerName: ar ? 'نور حسن' : 'Noor Hassan', classLabel: ar ? 'صف توضيحي' : 'Example class', state: 'waiting', statusLabel: ar ? 'بانتظار المتابعة' : 'Awaiting follow-up', action: action('Review support', 'مراجعة الدعم') },
      { key: 'fictional-portfolio', kind: 'portfolio', title: ar ? 'أعمال مختارة لملف الأعمال' : 'Selected portfolio work', learnerName: ar ? 'نور حسن' : 'Noor Hassan', classLabel: ar ? 'صف توضيحي' : 'Example class', state: 'waiting', statusLabel: ar ? 'بانتظار مراجعة المشاركة' : 'Awaiting sharing review', action: action('Review selection', 'مراجعة الاختيار') },
    ] },
    workspaces: [
      { key: 'learning', title: ar ? 'التعلّم' : 'Learning', description: ar ? 'التخطيط والتقديم' : 'Plan and deliver', icon: 'learning', selected: true, action: action('Open learning', 'فتح التعلّم') },
      { key: 'academic', title: ar ? 'التقييم' : 'Assessment', description: ar ? 'الاطّلاع والتصحيح' : 'View and mark', icon: 'milestones', action: action('Open assessment', 'فتح التقييم') },
      { key: 'progress', title: ar ? 'شواهد المتعلّم' : 'Learner evidence', description: ar ? 'المراجعة والتسجيل' : 'Review and record', icon: 'reflection', action: action('Open learner evidence', 'فتح شواهد المتعلّم') },
      { key: 'proposals', title: ar ? 'مراجعة المقترحات' : 'Review proposals', description: ar ? 'مراجعة المقترحات' : 'Review proposals', icon: 'arrow', action: action('Open review proposals', 'فتح مراجعة المقترحات') },
      { key: 'sources', title: ar ? 'مراجعة المصادر' : 'Review sources', description: ar ? 'مراجعة المصادر' : 'Review sources', icon: 'learning', action: action('Open source review', 'فتح مراجعة المصادر') },
      { key: 'school', title: ar ? 'اليوم المدرسي' : 'School day', description: ar ? 'التخطيط والتنظيم' : 'Plan and organise', icon: 'calendar', action: action('Open school day', 'فتح اليوم المدرسي') },
      { key: 'community', title: ar ? 'مناقشات الصف' : 'Class discussions', description: ar ? 'مناقشات الصف' : 'Class discussions', icon: 'community', action: action('Open discussions', 'فتح المناقشات') },
      { key: 'portfolio', title: ar ? 'مراجعة ملف الأعمال' : 'Portfolio review', description: ar ? 'المراجعة والمشاركة' : 'Review and share', icon: 'portfolio', action: action('Open portfolio review', 'فتح مراجعة ملف الأعمال') },
      { key: 'reports', title: ar ? 'تقارير معتمدة' : 'Approved reports', description: ar ? 'تقارير معتمدة' : 'Approved reports', icon: 'progress', action: action('Open approved reports', 'فتح التقارير المعتمدة') },
    ], allWorkspaces: action('All workspaces', 'كل مساحات العمل'),
    insight: { mode: 'fixture', approval: 'awaiting-review', sourceTitle: ar ? 'نتيجة مقياس المدرسة المنشورة سابقًا' : 'Earlier released School Custom result', sourceContext: ar ? 'المقياس الأصلي: ٢ من ٤' : 'Native scale: 2 / 4', sourceAction: action('View source', 'عرض المصدر'), interpretation: ar ? 'قد يركز التدريب التالي على شرح كل خطوة.' : 'A next practice could focus on explaining each step.', limitation: ar ? 'نتيجة واحدة لا تثبت السبب.' : 'One result does not establish cause.', reviewAction: action('Review sources', 'مراجعة المصادر') },
    nextActions: [
      { key: 'mark', title: ar ? 'مراجعة محاولة نور الجديدة' : 'Review Noor’s new attempt', icon: 'reflection', action: action('Review this attempt', 'مراجعة هذه المحاولة') },
      { key: 'practice', title: ar ? 'تخطيط تدريب متاح' : 'Plan available practice', icon: 'calendar', action: action('Review available practice', 'مراجعة التدريب المتاح') },
      { key: 'share', title: ar ? 'مراجعة طلب مشاركة' : 'Review sharing request', icon: 'portfolio', action: action('Review this sharing request', 'مراجعة طلب المشاركة') },
    ],
  };
  if (state === 'unknown') { context.dateLabel = null; context.attention = { status: 'unavailable', items: [] }; context.workspaces = []; context.insight = null; context.nextActions = []; }
  if (state === 'partial') { context.availability = 'partial'; context.attention.status = 'partial'; }
  if (state === 'offline' || state === 'denied') context.availability = state;
  return <div className="workspace teacher-trail-preview" data-theme={theme} lang={locale} dir={ar ? 'rtl' : 'ltr'}>
    <header className="teacher-trail-preview__header"><Brand compact /><button type="button" className="teacher-trail-preview__context" onClick={action('Preview school context', 'معاينة السياق المدرسي').onClick}><CuevoIcon name="school" variant="filled" /><span>{ar ? 'مدرسة المثال' : 'Example school'}</span><CuevoIcon name="chevron" /></button><button type="button" className="teacher-trail-preview__context" onClick={action('Preview class context', 'معاينة سياق الصف').onClick}><CuevoIcon name="community" variant="filled" /><span>{ar ? 'صف توضيحي' : 'Example class'}</span><CuevoIcon name="chevron" /></button><p>{ar ? 'مثال تصميم · ٢ أكتوبر ٢٠٢٦' : 'Design example · 2 Oct 2026'}</p><Button type="button" variant="secondary" className="teacher-trail-preview__search" onClick={action('Preview available navigation', 'معاينة التنقل المتاح').onClick}><CuevoIcon name="search" />{ar ? 'الانتقال إلى مساحة العمل…' : 'Go to a workspace…'}</Button><Button type="button" variant="quiet" aria-label={ar ? 'عرض التحديثات' : 'View updates'} onClick={action('Preview updates', 'معاينة التحديثات').onClick}><CuevoIcon name="notification" /></Button><div className="teacher-trail-preview__account"><span aria-hidden="true"><CuevoIcon name="person" /></span><div><strong>{ar ? 'مايا رحمن' : 'Maya Rahman'}</strong><p>{ar ? 'معلّمة' : 'Teacher'}</p></div></div></header>
    <main><TeacherTrailHomeView context={context} locale={locale} background={trailAssets.background} /></main>
    {receipt ? <div className="teacher-trail-preview__receipt" role="status"><p>{receipt}</p><Button type="button" variant="quiet" aria-label={ar ? 'إغلاق' : 'Dismiss'} onClick={() => setReceipt('')}><CuevoIcon name="close" /></Button></div> : null}
  </div>;
}

const meta = { title: 'Teacher/Trail home', component: TeacherPreview, parameters: { layout: 'fullscreen', trailFullscreen: true }, args: { locale: 'en', theme: 'light', state: 'reference' } } satisfies Meta<typeof TeacherPreview>;
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
