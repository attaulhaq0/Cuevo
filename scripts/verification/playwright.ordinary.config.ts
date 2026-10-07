import { defineConfig } from '@playwright/test';
import config from './playwright.production.config';
import { ordinaryBrowserExclusionPatterns } from './browser-runtime-scope';
export default defineConfig({ ...config, testIgnore: ordinaryBrowserExclusionPatterns });
