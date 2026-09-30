import type { StorybookConfig } from '@storybook/nextjs-vite';
import { fileURLToPath } from 'node:url';

const config: StorybookConfig = {
  stories: ['../../../packages/ui/src/**/*.stories.@(ts|tsx)'],
  framework: { name: '@storybook/nextjs-vite', options: {} },
  async viteFinal(viteConfig) {
    const existingAliases = viteConfig.resolve?.alias;
    return {
      ...viteConfig,
      resolve: {
        ...viteConfig.resolve,
        alias: [
          ...(Array.isArray(existingAliases) ? existingAliases : Object.entries(existingAliases ?? {}).map(([find, replacement]) => ({ find, replacement }))),
          { find: '@cuevo/ui/tokens.css', replacement: fileURLToPath(new URL('../../../packages/ui/src/tokens.css', import.meta.url)) },
        ],
      },
    };
  },
};
export default config;
