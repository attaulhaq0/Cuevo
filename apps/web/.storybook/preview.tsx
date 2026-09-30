import type { Preview } from '@storybook/nextjs-vite';
import '@cuevo/ui/tokens.css';
import '../app/globals.css';

const preview: Preview = {
  globalTypes: {
    locale: {
      description: 'Preview language and reading direction',
      toolbar: { icon: 'globe', items: [{ value: 'en', title: 'English' }, { value: 'ar', title: 'العربية' }] },
    },
  },
  initialGlobals: { locale: 'en' },
  decorators: [
    (Story, context) => <div lang={context.globals.locale === 'ar' ? 'ar' : 'en'} dir={context.globals.locale === 'ar' ? 'rtl' : 'ltr'} style={{ fontFamily: context.globals.locale === 'ar' ? 'var(--font-arabic)' : 'var(--font-sans)', padding: 'var(--space-8)' }}><Story /></div>,
  ],
  parameters: { layout: 'centered', controls: { expanded: true } },
};
export default preview;
