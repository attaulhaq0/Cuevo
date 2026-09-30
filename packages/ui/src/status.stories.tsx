import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Status } from './status';

const meta = {
  title: 'Foundation/Status',
  component: Status,
  args: { children: 'In development' },
  argTypes: { tone: { control: 'select', options: ['neutral', 'positive', 'warning'] } },
} satisfies Meta<typeof Status>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = {};
export const Verified: Story = { args: { tone: 'positive', children: 'School access verified' } };
export const NotConfigured: Story = { args: { tone: 'warning', children: 'Not configured' } };
export const Arabic: Story = { args: { tone: 'positive', children: 'تم التحقّق من الوصول إلى المدرسة' }, globals: { locale: 'ar' } };
