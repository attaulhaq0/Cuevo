import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { companionPoses } from './companion-assets';
import { CompanionView } from './companion-view';
import type { CompanionName, CompanionState } from './model';
import './styles.css';

function CompanionPreview({ character, state, visible, quiet, locale }: { character: CompanionName; state: CompanionState; visible: boolean; quiet: boolean; locale: 'en' | 'ar' }) {
  return <div className="workspace" style={{ display: 'block', minBlockSize: 'auto', padding: 'var(--space-6)' }} lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}><h1 style={{ fontSize: 'var(--type-xl)' }}>{locale === 'ar' ? 'معاينة الشخصية الاختيارية' : 'Optional companion preview'}</h1><div style={{ maxInlineSize: '16rem' }}><CompanionView registry={companionPoses} character={character} state={state} visible={visible} quiet={quiet} receipt={state === 'acknowledge' ? { key: 'illustrative-confirmed-receipt', confirmed: true, current: true } : undefined} fallback={<p>{locale === 'ar' ? 'تبقى مهمتك وإجراءاتك متاحة عند إخفاء الشخصية أو غياب الصورة.' : 'Your task and actions stay available when the character is hidden or art is unavailable.'}</p>} /></div></div>;
}
const meta = { title: 'Shared/Companion', component: CompanionPreview, args: { character: 'foxi', state: 'ready', visible: true, quiet: false, locale: 'en' }, argTypes: { character: { control: 'select', options: ['foxi', 'owl', 'rabbit', 'turtle'] }, state: { control: 'select', options: ['ready', 'read', 'work', 'acknowledge'] } } } satisfies Meta<typeof CompanionPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
export const Read: Story = { args: { state: 'read' } };
export const Work: Story = { args: { state: 'work' } };
export const Quiet: Story = { args: { quiet: true } };
export const Hidden: Story = { args: { visible: false } };
export const Owl: Story = { args: { character: 'owl', state: 'read' } };
export const Rabbit: Story = { args: { character: 'rabbit', state: 'work' } };
export const Turtle: Story = { args: { character: 'turtle', state: 'work' } };
