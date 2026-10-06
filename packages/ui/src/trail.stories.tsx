import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from './button';
import { CuevoIcon, type CuevoIconName } from './icon';
import { Status } from './status';

const destinations: CuevoIconName[] = ['home', 'learning', 'feedback', 'progress', 'development', 'portfolio', 'community', 'assessment', 'curriculum', 'calendar', 'notification', 'settings'];

function TrailFoundation({ theme, density, locale, motion }: {
  theme: 'light' | 'dark' | 'system'; density: 'standard' | 'compact'; locale: 'en' | 'ar'; motion: 'standard' | 'quiet';
}) {
  const arabic = locale === 'ar';
  return <div className="workspace" data-theme={theme} data-density={density} data-motion={motion} lang={locale} dir={arabic ? 'rtl' : 'ltr'} style={{ display: 'block', minBlockSize: 'auto', inlineSize: 'min(64rem, 100%)', padding: 'var(--density-padding)' }}>
    <div style={{ display: 'grid', gap: 'var(--density-gap)' }}>
      <header style={{ display: 'grid', gap: 'var(--space-2)' }}>
        <h1 style={{ fontSize: 'var(--type-title)' }}>{arabic ? 'خطوتك التالية في التعلّم' : 'Your next learning step'}</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>{arabic ? 'اعرف ما يمكنك فعله، وراجع الملاحظات والخطوات المعتمدة.' : 'See what you can do, review feedback and choose an approved next step.'}</p>
      </header>
      <div role="group" aria-label={arabic ? 'مساحات العمل' : 'Workspaces'}>
        <button type="button" aria-pressed="true"><CuevoIcon name="learning" /> {arabic ? 'تعلّمي' : 'My learning'}</button>
        <button type="button" aria-pressed="false"><CuevoIcon name="feedback" /> {arabic ? 'الملاحظات' : 'Feedback'}</button>
        <button type="button" aria-pressed="false"><CuevoIcon name="portfolio" /> {arabic ? 'ملف أعمالي' : 'Portfolio'}</button>
      </div>
      <section style={{ display: 'grid', gap: 'var(--space-5)', background: 'var(--color-material-reading)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', padding: 'var(--density-padding)', boxShadow: 'var(--elevation-subtle)' }}>
        <h2 style={{ fontSize: 'var(--type-xl)' }}>{arabic ? 'اشرح طريقتك' : 'Explain your approach'}</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <Status>{arabic ? 'متاح' : 'Available'}</Status>
          <Status tone="positive">{arabic ? 'تم الحفظ' : 'Saved'}</Status>
          <Status tone="warning">{arabic ? 'بانتظار المراجعة' : 'Awaiting review'}</Status>
        </div>
        <div className="field"><label htmlFor="trail-reflection">{arabic ? 'تأمّلك' : 'Your reflection'}</label><textarea id="trail-reflection" rows={3} placeholder={arabic ? 'اكتب تأمّلك…' : 'Write your reflection…'} /></div>
        <div className="field"><label htmlFor="trail-choice">{arabic ? 'الخطوة المعتمدة' : 'Approved next step'}</label><select id="trail-choice"><option>{arabic ? 'اختر خطوة متاحة' : 'Choose an available step'}</option></select></div>
        <div className="field"><label htmlFor="trail-invalid">{arabic ? 'عنوان مطلوب' : 'Required title'}</label><input id="trail-invalid" aria-invalid="true" aria-describedby="trail-error" /><p id="trail-error" style={{ color: 'var(--color-danger)' }}>{arabic ? 'أدخل عنوانًا قبل الحفظ.' : 'Enter a title before saving.'}</p></div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <Button type="button">{arabic ? 'افتح الدرس' : 'Open lesson'} <CuevoIcon name="arrow" /></Button>
          <Button type="button" variant="secondary"><CuevoIcon name="feedback" /> {arabic ? 'اقرأ الملاحظات' : 'Read feedback'}</Button>
          <Button type="button" variant="quiet">{arabic ? 'عرض المصدر' : 'View source'}</Button>
          <Button type="button" disabled aria-busy="true">{arabic ? 'جارٍ الحفظ…' : 'Saving…'}</Button>
        </div>
      </section>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-5)', color: 'var(--color-accent)' }}>
        {destinations.map(name => <div key={name} style={{ display: 'grid', gap: 'var(--space-2)', justifyItems: 'center' }}><CuevoIcon name={name} variant="filled" size={28} /><span style={{ fontSize: 'var(--type-xs)', color: 'var(--color-text-secondary)' }}>{name}</span></div>)}
      </div>
    </div>
  </div>;
}

const meta = {
  title: 'Foundation/Trail', component: TrailFoundation,
  args: { theme: 'light', density: 'standard', locale: 'en', motion: 'standard' },
  argTypes: {
    theme: { control: 'select', options: ['light', 'dark', 'system'] },
    density: { control: 'select', options: ['standard', 'compact'] },
    locale: { control: 'select', options: ['en', 'ar'] },
    motion: { control: 'select', options: ['standard', 'quiet'] },
  },
} satisfies Meta<typeof TrailFoundation>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Light: Story = {};
export const Dark: Story = { args: { theme: 'dark' } };
export const Compact: Story = { args: { density: 'compact' } };
export const Arabic: Story = { args: { locale: 'ar' }, globals: { locale: 'ar' } };
export const Quiet: Story = { args: { motion: 'quiet' } };
