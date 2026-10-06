import { expect, it } from 'vitest';
import { resolve } from 'node:path';
import { analyticsFixtureDirectory } from '../src/platform/analytics-path';

it('uses one repository fixture analytics location independent of caller working directory', () => {
  expect(analyticsFixtureDirectory()).toBe(resolve('apps/worker/../../.local/analytics'));
  expect(analyticsFixtureDirectory()).toBe(resolve('.local/analytics'));
});
