import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CuevoIcon, type CuevoIconName } from './icon';

const names: CuevoIconName[] = ['learning', 'practice', 'feedback', 'milestones', 'student', 'people', 'parent', 'school', 'shield'];
const meta = { title: 'Cuevo/Icon', component: CuevoIcon, args: { name: 'learning', size: 24 } } satisfies Meta<typeof CuevoIcon>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Utility: Story = {};
export const Filled: Story = { args: { variant: 'filled' } };
export const LearningAndRoles: Story = {
  render: () => <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap', color: 'var(--color-link)' }}>
    {names.map(name => <div key={name} style={{ display: 'grid', gap: 'var(--space-2)', justifyItems: 'center' }}><CuevoIcon name={name} variant="filled" size={32} /><span>{name}</span></div>)}
  </div>,
};
