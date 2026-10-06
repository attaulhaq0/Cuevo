import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button, CuevoIcon, type CuevoIconName } from '@cuevo/ui';
import { Brand } from '../../shared/components/brand';
import { trailAssets } from '../../shared/characters/assets';
import '../../shared/characters/styles.css';
import './styles.css';
import './admin-trail-preview.css';
import { AdminTrailHomeView } from './components/admin-trail-home';
import type { AdminTrailAction, AdminTrailContext } from './admin-trail-model';

function AdminPreview({ locale, theme, state }: { locale: 'en' | 'ar'; theme: 'light' | 'dark'; state: 'reference' | 'unknown' | 'partial' | 'denied' | 'offline' | 'error' | 'pending' }) {
  const ar = locale === 'ar';
  const [receipt, setReceipt] = useState('');
  const action = (en: string, arabic: string): AdminTrailAction => ({ label: ar ? arabic : en, pending: state === 'pending', onClick: () => setReceipt(ar ? 'معاينة تصميم فقط؛ لم يتغير سجل مدرسي.' : 'Design preview only; no school record changed.') });
  const areas: { title: string; ar: string; description: string; descriptionAr: string; icon: CuevoIconName }[] = [
    { title: 'School details', ar: 'تفاصيل المدرسة', description: 'Key information', descriptionAr: 'معلومات أساسية', icon: 'settings' },
    { title: 'People and relationships', ar: 'الأشخاص والعلاقات', description: 'Current identities and scope', descriptionAr: 'الهويات والنطاق الحالي', icon: 'people' },
    { title: 'Classes and enrolment', ar: 'الصفوف والتسجيل', description: 'Classes and groups', descriptionAr: 'الصفوف والمجموعات', icon: 'learning' },
    { title: 'Programmes and sources', ar: 'البرامج والمصادر', description: 'Curriculum and context', descriptionAr: 'المنهج والسياق', icon: 'reflection' },
    { title: 'School capabilities', ar: 'إمكانات المدرسة', description: 'Review current capabilities', descriptionAr: 'مراجعة الإمكانات الحالية', icon: 'school' },
    { title: 'Permissions', ar: 'الصلاحيات', description: 'Roles and current access', descriptionAr: 'الأدوار والوصول الحالي', icon: 'shield' },
    { title: 'Policies', ar: 'السياسات', description: 'Safety and communication', descriptionAr: 'السلامة والتواصل', icon: 'parent' },
    { title: 'Automation and recovery', ar: 'الأتمتة والاسترداد', description: 'Existing deterministic receipts', descriptionAr: 'إيصالات المعالجة الحالية', icon: 'refresh' },
    { title: 'AI governance', ar: 'حوكمة الذكاء الاصطناعي', description: 'Purpose and human review', descriptionAr: 'الغرض والمراجعة البشرية', icon: 'help' },
    { title: 'Reports and audit', ar: 'التقارير والتدقيق', description: 'Current source activity', descriptionAr: 'نشاط المصدر الحالي', icon: 'milestones' },
  ];
  const context: AdminTrailContext = {
    availability: 'ready', schoolName: ar ? 'مدرسة المثال' : 'Example school', environmentLabel: ar ? 'مثال تصميم ببيانات توضيحية' : 'Design example with illustrative records', dateLabel: ar ? '٢ أكتوبر ٢٠٢٦' : '2 Oct 2026',
    primaryAction: action('Review school settings', 'مراجعة إعدادات المدرسة'),
    facts: [
      { key: 'school', label: ar ? 'المدرسة' : 'School', value: ar ? 'مدرسة المثال' : 'Example school', icon: 'school' },
      { key: 'programme', label: ar ? 'البرنامج' : 'Programme', value: 'School Custom', icon: 'calendar' },
      { key: 'course', label: ar ? 'المقرر' : 'Course', value: ar ? 'استراتيجيات التعلّم' : 'Learning strategies', icon: 'learning' },
      { key: 'class', label: ar ? 'الصف' : 'Class', value: ar ? 'صف توضيحي' : 'Example class', icon: 'community' },
      { key: 'year', label: ar ? 'السنة الدراسية' : 'Academic year', value: null, icon: 'calendar' },
    ],
    areas: areas.map((area, index) => ({ key: String(index), title: ar ? area.ar : area.title, description: ar ? area.descriptionAr : area.description, icon: area.icon, selected: index === 0, action: action('Review', 'مراجعة') })),
    people: { status: 'ready', records: [
      { key: 'teacher', name: ar ? 'مايا رحمن' : 'Maya Rahman', context: ar ? 'معلّمة' : 'Teacher', action: action('View', 'عرض') },
      { key: 'coordinator', name: ar ? 'رامي صالح' : 'Rami Saleh', context: ar ? 'منسّق' : 'Coordinator', action: action('View', 'عرض') },
      { key: 'student', name: ar ? 'نور حسن' : 'Noor Hassan', context: ar ? 'متعلّم · صف توضيحي' : 'Student · Example class', action: action('View', 'عرض') },
      { key: 'parent', name: ar ? 'سميرة حسن' : 'Samira Hassan', context: ar ? 'ولي أمر ضمن علاقة حالية معتمدة' : 'Parent in a current approved relationship', action: action('View', 'عرض') },
    ], action: action('View all', 'عرض الكل') },
    policies: [
      { key: 'recognition', title: ar ? 'سياسة تقدير الأفعال المرصودة' : 'Observed-action recognition policy', description: ar ? 'سياسة مدرسية توضيحية معتمدة' : 'School-approved example policy', state: 'reviewed' },
      { key: 'messages', title: ar ? 'رسائل مباشرة للطلاب' : 'Student direct messages', description: ar ? 'معطّلة ضمن السياسة الحالية' : 'Disabled under the current school policy', state: 'disabled' },
      { key: 'discussion', title: ar ? 'مناقشة مدرسية خاضعة للإشراف' : 'School-scoped moderated discussion', description: ar ? 'مناقشة مسموحة داخل هذه المدرسة' : 'Discussion permitted within this school', state: 'reviewed' },
    ], policyAction: action('View policy', 'عرض السياسة'),
    governance: { mode: 'fixture-only', title: ar ? 'بيئة توضيحية' : 'Example environment', description: ar ? 'لم تثبت الجاهزية المباشرة؛ يتطلب التشغيل موافقة وتكوينًا حاليين.' : 'Live readiness is not established; execution requires current approval and configuration.', action: action('Review governance', 'مراجعة الحوكمة') },
    execution: { state: 'unavailable', title: ar ? 'المعالجة الحتمية' : 'Deterministic processing', description: ar ? 'افتح مساحة المراجعة للتحقّق من الإيصالات الحالية.' : 'Open the review workspace to check current receipts.', receiptLabel: null, action: action('Review execution', 'مراجعة التنفيذ') },
    audit: { status: 'unavailable', records: [], action: action('View audit', 'عرض التدقيق') },
  };
  if (state === 'unknown') { context.facts = []; context.areas = []; context.people = { status: 'unavailable', records: [] }; context.policies = []; context.governance = null; context.execution = null; context.audit = { status: 'unavailable', records: [] }; context.schoolName = null; context.dateLabel = null; }
  if (state === 'partial') { context.availability = 'partial'; context.people.status = 'partial'; context.audit.status = 'partial'; }
  if (state === 'denied' || state === 'offline' || state === 'error') context.availability = state;
  return <div className="workspace admin-trail-preview" data-theme={theme} lang={locale} dir={ar ? 'rtl' : 'ltr'}><header className="admin-trail-preview__header"><Brand compact /><Button type="button" variant="secondary" className="admin-trail-preview__school" onClick={action('Review current school context', 'مراجعة سياق المدرسة الحالي').onClick}><CuevoIcon name="school" variant="filled" />{ar ? 'مدرسة المثال' : 'Example school'}<CuevoIcon name="chevron" /></Button><div className="admin-trail-preview__utilities"><Button type="button" variant="quiet" aria-label={ar ? 'فتح التنقل المتاح' : 'Open available navigation'} onClick={action('Navigation preview', 'معاينة التنقل').onClick}><CuevoIcon name="search" /></Button><Button type="button" variant="quiet" aria-label={ar ? 'مساعدة' : 'Help'} onClick={action('Help preview', 'معاينة المساعدة').onClick}><CuevoIcon name="help" /></Button><span><CuevoIcon name="language" />English · العربية</span></div><div className="admin-trail-preview__account"><CuevoIcon name="person" /><div><strong>{ar ? 'عمر علي' : 'Omar Ali'}</strong><p>{ar ? 'مسؤول المدرسة' : 'School administrator'}</p></div></div></header><main><AdminTrailHomeView context={context} locale={locale} background={trailAssets.background} /></main>{receipt ? <div className="admin-trail-preview__receipt" role="status"><p>{receipt}</p><Button type="button" variant="quiet" aria-label={ar ? 'إغلاق' : 'Dismiss'} onClick={() => setReceipt('')}><CuevoIcon name="close" /></Button></div> : null}</div>;
}
const meta = { title: 'Admin/Trail home', component: AdminPreview, parameters: { layout: 'fullscreen', trailFullscreen: true }, args: { locale: 'en', theme: 'light', state: 'reference' } } satisfies Meta<typeof AdminPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Reference: Story = {};
export const Arabic: Story = { args: { locale: 'ar' }, globals: { locale: 'ar' } };
export const Dark: Story = { args: { theme: 'dark' } };
export const Unknown: Story = { args: { state: 'unknown' } };
export const Partial: Story = { args: { state: 'partial' } };
export const Denied: Story = { args: { state: 'denied' } };
export const Offline: Story = { args: { state: 'offline' } };
export const Error: Story = { args: { state: 'error' } };
export const Pending: Story = { args: { state: 'pending' } };
