import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CuevoIcon, type CuevoIconName } from '@cuevo/ui';
import { Brand } from '../../shared/components/brand';
import '../../shared/characters/styles.css';
import './styles.css';
import { WorkspaceChrome } from './components/workspace-chrome';
import { WorkspaceCommandNavigation } from './components/workspace-command-navigation';
import type { WorkspaceChromeContext } from './model';

function ChromePreview({ locale, theme, expression, state }: { locale: 'en' | 'ar'; theme: 'light' | 'dark' | 'system'; expression: 'student' | 'staff' | 'parent'; state: 'reference' | 'unknown' | 'pending' }) {
  const ar = locale === 'ar';
  const [selected, setSelected] = useState('learning');
  const names: { id: string; en: string; ar: string; icon: CuevoIconName }[] = [{ id: 'learning', en: 'My learning', ar: 'تعلّمي', icon: 'learning' }, { id: 'feedback', en: 'Feedback', ar: 'الملاحظات', icon: 'feedback' }, { id: 'progress', en: 'My progress', ar: 'تقدّمي', icon: 'milestones' }, { id: 'development', en: 'Development', ar: 'التطوّر', icon: 'development' }, { id: 'portfolio', en: 'Portfolio', ar: 'ملف الأعمال', icon: 'portfolio' }, { id: 'community', en: 'Class community', ar: 'مجتمع الصف', icon: 'community' }, { id: 'practice', en: 'Approved next steps', ar: 'الخطوات المعتمدة', icon: 'assessment' }, { id: 'school', en: 'School day', ar: 'اليوم المدرسي', icon: 'calendar' }, { id: 'updates', en: 'Updates', ar: 'التحديثات', icon: 'notification' }];
  const context: WorkspaceChromeContext = { locale, theme, expression, selectedId: selected, navigationLabel: ar ? 'مساحات العمل الحالية' : 'Current workspaces', schoolName: state === 'unknown' ? null : ar ? 'مدرسة المثال' : 'Example school', personName: state === 'unknown' ? null : ar ? 'نور حسن' : 'Noor Hassan', roleLabel: state === 'unknown' ? null : ar ? 'مثال دور حالي' : 'Current role example', brand: <Brand compact />, navigation: state === 'unknown' ? [] : names.map(item => ({ id: item.id, label: ar ? item.ar : item.en, icon: item.icon, pending: state === 'pending' && item.id === 'practice', onSelect: () => setSelected(item.id) })), languageControl: <div className="language-switch" role="group" aria-label={ar ? 'اللغة' : 'Language'}><CuevoIcon name="language" /><button type="button" lang="en" aria-pressed={!ar}>EN</button><button type="button" lang="ar" aria-pressed={ar}>العربية</button></div>, accountAction: { label: ar ? 'عرض الحساب' : 'View account', onClick: () => setSelected('account') } };
  return <WorkspaceCommandNavigation navigation={context.navigation} selectedId={selected} locale={locale}>{(searchAction, commandDialog) => <WorkspaceChrome context={{ ...context, searchAction }}><main style={{ padding: 'var(--space-8)', maxInlineSize: 'var(--content-width)', marginInline: 'auto' }}><h1>{ar ? 'مساحة العمل الحالية' : 'Current workspace'}</h1><p>{ar ? 'هذه معاينة للمكوّن. يقدّم صاحب الميزة الوجهات والبيانات الحالية ضمن الصلاحيات.' : 'This is a component preview. The feature owner supplies current authorized destinations and data.'}</p><p>{ar ? 'لا يتغير سجل مدرسي هنا.' : 'No school record changes here.'}</p></main>{commandDialog}</WorkspaceChrome>}</WorkspaceCommandNavigation>;
}
const meta = { title: 'Shell/Workspace chrome', component: ChromePreview, parameters: { layout: 'fullscreen', trailFullscreen: true }, args: { locale: 'en', theme: 'light', expression: 'student', state: 'reference' } } satisfies Meta<typeof ChromePreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Student: Story = {};
export const Staff: Story = { args: { expression: 'staff' } };
export const Parent: Story = { args: { expression: 'parent' } };
export const Arabic: Story = { args: { locale: 'ar' }, globals: { locale: 'ar' } };
export const Dark: Story = { args: { theme: 'dark' } };
export const Unknown: Story = { args: { state: 'unknown' } };
export const Pending: Story = { args: { state: 'pending' } };
