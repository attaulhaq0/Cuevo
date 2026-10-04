import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button, CuevoIcon, type CuevoIconName } from '@cuevo/ui';
import { Brand } from '../../shared/components/brand';
import { trailAssets } from '../../shared/characters/assets';
import '../../shared/characters/styles.css';
import './styles.css';
import './student-trail-preview.css';
import { StudentTrailView } from './components/student-trail';
import type { StudentTrailAction, StudentTrailContext } from './trail-model';

const navigation: { icon: CuevoIconName; en: string; ar: string }[] = [
  { icon: 'home', en: 'My learning', ar: 'تعلّمي' }, { icon: 'feedback', en: 'Feedback', ar: 'الملاحظات' },
  { icon: 'milestones', en: 'My progress', ar: 'تقدّمي' }, { icon: 'development', en: 'Development', ar: 'تطوّري' },
  { icon: 'portfolio', en: 'Portfolio', ar: 'ملف أعمالي' }, { icon: 'community', en: 'Class community', ar: 'مجتمع الصف' },
  { icon: 'assessment', en: 'Approved next steps', ar: 'الخطوات المعتمدة' }, { icon: 'calendar', en: 'School day', ar: 'اليوم المدرسي' },
  { icon: 'notification', en: 'Updates', ar: 'التحديثات' },
];

function StudentHomePreview({ locale, theme, state, density, quiet }: { locale: 'en' | 'ar'; theme: 'light' | 'dark'; state: 'reference' | 'unknown' | 'processing' | 'denied'; density: 'standard' | 'compact'; quiet: boolean }) {
  const ar = locale === 'ar';
  const [visible, setVisible] = useState(!quiet);
  const [participating, setParticipating] = useState(false);
  const [selected, setSelected] = useState('home');
  const [message, setMessage] = useState('');
  const [goal, setGoal] = useState(ar ? 'اجعل شرحي أسهل في المتابعة.' : 'Make my explanation easier to follow.');
  const [editingGoal, setEditingGoal] = useState(false);
  const action = (en: string, arabic: string, target: string): StudentTrailAction => ({ label: ar ? arabic : en, onClick: () => { setSelected(target); setMessage(ar ? `${arabic} — معاينة تصميم ببيانات توضيحية.` : `${en} — design preview with illustrative records.`); } });
  // Fictional presentation records belong only to Storybook. Runtime consumers
  // supply their own current, authorized contract mapping to this same view.
  const context: StudentTrailContext = {
    displayName: ar ? 'نور' : 'Noor', schoolName: ar ? 'مدرسة المثال' : 'Example School', availability: 'ready',
    goal: { text: goal, action: { label: ar ? 'تغيير الهدف' : 'Change goal', onClick: () => setEditingGoal(true) } },
    task: { title: ar ? 'اشرح طريقتك' : 'Explain your approach', description: ar ? 'اكتب شرحك الخاص' : 'Write your own explanation', course: ar ? 'الرياضيات · الكسور' : 'Maths · Fractions', unit: ar ? 'الوحدة ٢ · حلّ المسائل' : 'Unit 2 · Solving problems', stepNumber: 3, state: 'available', primaryAction: action('Open lesson', 'افتح الدرس', 'learning') },
    stages: [
      { key: 'lesson', title: ar ? '١. الدرس' : '1. Lesson', description: ar ? 'اقرأ واستكشف' : 'Read & explore', state: 'complete', action: action('Open lesson', 'افتح الدرس', 'learning') },
      { key: 'feedback', title: ar ? '٢. الملاحظات' : '2. Feedback', description: ar ? 'اطّلع على ملاحظات المعلّم' : 'See teacher input', state: 'complete', action: action('Read feedback', 'اقرأ الملاحظات', 'feedback') },
      { key: 'practice', title: ar ? '٤. التدريب' : '4. Practice', description: ar ? 'جرّب المهام المعتمدة' : 'Try approved tasks', state: 'available', action: action('Open approved practice', 'افتح التدريب المعتمد', 'assessment') },
      { key: 'reflect', title: ar ? '٥. التأمّل' : '5. Reflect', description: ar ? 'فكّر ودوّن' : 'Think and note', state: 'available', action: action('Write a reflection', 'اكتب تأمّلًا', 'portfolio') },
      { key: 'grow', title: ar ? '٦. النمو' : '6. Grow', description: ar ? 'اطّلع على تقدّمك' : 'See your progress', state: 'available', action: action('See your progress', 'اطّلع على تقدّمك', 'milestones') },
    ],
    feedback: { teacherName: ar ? 'مايا رحمن' : 'Maya Rahman', teacherContext: ar ? 'معلّمة الرياضيات' : 'Maths Teacher', dateLabel: ar ? '١٢ مارس ٢٠٢٥' : '12 Mar 2025', text: ar ? 'أظهر كل خطوة واشرح سبب اختيارك.' : 'Show each step and explain your choice.', action: action('Read teacher feedback', 'اقرأ ملاحظات المعلّم', 'feedback') },
    upcoming: { title: ar ? 'تدريب معتمد' : 'Approved practice', description: ar ? 'أسئلة مشابهة، خطوة بخطوة' : 'Similar questions, step by step', availabilityLabel: ar ? 'متاح الآن' : 'Available now', action: action('Open approved practice', 'افتح التدريب المعتمد', 'assessment'), viewAll: action('View all', 'عرض الكل', 'assessment') },
    recognition: { status: 'recorded', totalPoints: 12, periodLabel: null, currentMilestone: null, entries: [{ kind: 'practice', label: ar ? 'تدريب واحد' : '1 practice', points: 5 }, { kind: 'revision', label: ar ? 'مراجعة واحدة' : '1 revision', points: 3 }, { kind: 'reflection', label: ar ? 'تأمّلان' : '2 reflections', points: 4 }], action: action('View all', 'عرض الكل', 'development') },
    classChallenge: { title: ar ? 'شارك شرحًا واضحًا' : 'Share a clear explanation', description: ar ? 'ساعدوا بعضكم بشرح واضح.' : 'Help each other with good explanations.', periodLabel: ar ? 'هذه الفترة: ١٠ مارس – ٤ أبريل' : 'This period: 10 Mar – 4 Apr', alias: 'NH-Explorer', participating, participationLabel: ar ? 'شارك باسم «NH-Explorer» (اختياري)' : 'Join as “NH-Explorer” (optional)', onParticipationChange: value => { setParticipating(value); setMessage(ar ? 'تغيّر خيار المشاركة في المعاينة فقط.' : 'Preview participation preference changed.'); } },
    help: { title: ar ? 'مساعدة في هذا التدريب' : 'Help with this practice', description: ar ? 'راجع المواد التي اعتمدها معلّمك أو اطلب مساعدته في الخطوة التالية.' : 'Review your teacher’s approved materials or ask your teacher for help with your next step.', mode: 'human', note: ar ? 'مساعدة في التعلّم مرتبطة بتدريبك الحالي.' : 'Learning support linked to your current practice.', action: action('Ask my teacher', 'اطلب مساعدة معلّمك', 'help') },
    companion: { visible, name: 'Foxi', alternative: { name: ar ? 'جرّب البومة؟' : 'Try the owl?', description: ar ? 'مظهر مختلف لرفيق تعلّمك.' : 'A different look for your learning companion.', action: action('Preview', 'معاينة', 'companion') }, hideAction: { label: visible ? ar ? 'إخفاء الشخصية' : 'Hide character' : ar ? 'إظهار الشخصية' : 'Show character', onClick: () => setVisible(!visible) } },
  };
  if (state !== 'reference') {
    context.displayName = null; context.goal = null; context.task = null; context.feedback = null; context.upcoming = null; context.classChallenge = null; context.help = null;
    context.stages = context.stages.map(stage => ({ ...stage, state: 'unknown' }));
    context.recognition = { status: state === 'processing' ? 'processing' : 'unavailable', totalPoints: null, periodLabel: null, currentMilestone: null, entries: [] };
    context.availability = state === 'denied' ? 'denied' : state === 'processing' ? 'partial' : 'ready';
    context.recovery = action('Open my learning', 'افتح مساحة تعلّمي', 'home');
  }
  return <div className="workspace student-trail-preview" data-theme={theme} data-density={density} data-motion={quiet ? 'quiet' : 'standard'} lang={locale} dir={ar ? 'rtl' : 'ltr'}>
    <header className="student-trail-preview__header"><div className="student-trail-preview__identity"><Brand compact /><div className="student-trail-preview__account"><span><CuevoIcon name="school" variant="filled" size={26} /><bdi>{context.schoolName}</bdi></span><span className="student-trail-preview__divider" /><span className="student-trail-preview__avatar">NH</span><bdi>{ar ? 'نور حسن' : 'Noor Hassan'}</bdi><Button type="button" variant="quiet" aria-label={ar ? 'افتح الحساب' : 'Open account'} onClick={() => setMessage(ar ? 'معاينة الحساب' : 'Account preview')}><CuevoIcon name="chevron" /></Button></div></div><nav className="student-trail-preview__nav" aria-label={ar ? 'مساحات التعلّم' : 'Learning workspaces'}>{navigation.map(item => <button key={item.icon} type="button" aria-current={selected === item.icon ? 'page' : undefined} onClick={() => { setSelected(item.icon); setMessage(ar ? item.ar : item.en); }}><CuevoIcon name={item.icon} variant="filled" size={27} /><span>{ar ? item.ar : item.en}</span></button>)}</nav></header>
    <main><StudentTrailView context={context} assets={trailAssets} locale={locale} /></main>
    <footer className="student-trail-preview__footer"><Brand compact /><span>{context.schoolName}</span><span className="student-trail-preview__divider" /><span>{ar ? 'غد أكثر إشراقًا بالتعلّم' : 'A brighter learning tomorrow'}</span><div className="student-trail-preview__footer-links"><span>English</span><span>العربية</span><span>{ar ? 'الخصوصية ومعلومات الجهاز' : 'Privacy & device information'}</span><span><CuevoIcon name="help" />{ar ? 'مساعدة' : 'Help'}</span></div></footer>
    {message ? <div className="student-trail-preview__receipt" role="status"><p>{message}</p><Button type="button" variant="quiet" onClick={() => setMessage('')} aria-label={ar ? 'إغلاق' : 'Dismiss'}><CuevoIcon name="close" /></Button></div> : null}
    {editingGoal ? <div className="student-trail-preview__dialog" role="dialog" aria-modal="true" aria-labelledby="preview-goal-title"><form onSubmit={event => { event.preventDefault(); setEditingGoal(false); setMessage(ar ? 'تغيّر الهدف في المعاينة فقط.' : 'Preview goal changed.'); }}><h2 id="preview-goal-title">{ar ? 'هدفي في التعلّم' : 'My learning goal'}</h2><label htmlFor="preview-goal">{ar ? 'هدفك' : 'Your goal'}</label><textarea id="preview-goal" autoFocus value={goal} onChange={event => setGoal(event.currentTarget.value)} rows={3} /><div><Button type="submit">{ar ? 'حفظ المعاينة' : 'Save preview'}</Button><Button type="button" variant="secondary" onClick={() => setEditingGoal(false)}>{ar ? 'إلغاء' : 'Cancel'}</Button></div></form></div> : null}
  </div>;
}

const meta = { title: 'Student/Trail home', component: StudentHomePreview, parameters: { layout: 'fullscreen', trailFullscreen: true }, args: { locale: 'en', theme: 'light', state: 'reference', density: 'standard', quiet: false } } satisfies Meta<typeof StudentHomePreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Reference: Story = {};
export const Arabic: Story = { args: { locale: 'ar' }, globals: { locale: 'ar' } };
export const Unknown: Story = { args: { state: 'unknown' } };
export const Processing: Story = { args: { state: 'processing' } };
export const Denied: Story = { args: { state: 'denied' } };
export const Quiet: Story = { args: { quiet: true } };
export const Dark: Story = { args: { theme: 'dark' } };
export const Compact: Story = { args: { density: 'compact' } };
