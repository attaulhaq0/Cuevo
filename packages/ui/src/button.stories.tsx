import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from './button';

const meta = {
  title: 'Foundation/Button',
  component: Button,
  args: { children: 'Continue', type: 'button' },
  argTypes: { variant: { control: 'select', options: ['primary', 'secondary', 'quiet'] } },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};
export const Secondary: Story = { args: { variant: 'secondary', children: 'Review access' } };
export const Quiet: Story = { args: { variant: 'quiet', children: 'Return to sign-in' } };
export const Pending: Story = { args: { disabled: true, children: 'Signing in…' } };
export const Arabic: Story = { args: { children: 'تسجيل الدخول' }, globals: { locale: 'ar' } };
