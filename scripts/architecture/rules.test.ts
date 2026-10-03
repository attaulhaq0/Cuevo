import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkArchitecture, type ArchitectureFile } from './rules';
const file = (path: string, content = ''): ArchitectureFile => ({ path, content });
const rules = (files: ArchitectureFile[]) => checkArchitecture(files, { navigation: false }).map(issue => issue.rule);
test('feature public interfaces, platform services and pure package exports are allowed', () => {
  assert.deepEqual(rules([file('apps/web/features/progress/model.ts', "import type { Result } from '../academic/model';"), file('apps/web/features/academic/model.ts', 'export type Result = string;'), file('apps/api/src/modules/academic/academic.service.ts', "import { Database } from '../../platform/database/database'; import { schema } from '@cuevo/contracts';"), file('apps/api/src/platform/database/database.ts'), file('packages/contracts/src/index.ts')]), []);
});
test('shared and platform cannot depend on feature/domain implementation', () => {
  assert.ok(rules([file('apps/web/shared/hooks/use-data.ts', "export { Feature } from '../../features/academic/ui';"), file('apps/web/features/academic/ui.tsx')]).includes('shared-direction'));
  assert.ok(rules([file('apps/api/src/platform/database/database.ts', "import { Academic } from '../../modules/academic/academic.service';"), file('apps/api/src/modules/academic/academic.service.ts')]).includes('platform-direction'));
});
test('type and lazy imports cannot bypass feature or browser boundaries', () => {
  assert.ok(rules([file('apps/web/features/learning/model.ts', "type Hidden = import('../academic/components/marking').Hidden;"), file('apps/web/features/academic/components/marking.tsx')]).includes('feature-api'));
  assert.ok(rules([file('apps/web/features/academic/model.ts', "const data = import('@cuevo/config');"), file('packages/config/src/index.ts')]).includes('browser-server'));
  assert.ok(rules([file('packages/domain/src/rule.ts', "import type { Pool } from 'pg';")]).includes('browser-server'));
});
test('relative deep package imports and cross-application runtime imports are denied', () => {
  assert.ok(rules([file('apps/api/src/modules/academic/academic.service.ts', "import { rule } from '../../../../../packages/domain/src/index';"), file('packages/domain/src/index.ts')]).includes('package-api'));
  assert.ok(rules([file('apps/api/src/modules/academic/academic.service.ts', "import { Worker } from '../../../../worker/src/jobs/outbox/processor';"), file('apps/worker/src/jobs/outbox/processor.ts')]).includes('application-direction'));
});
test('integration tests may compose API and worker deliberately', () => {
  assert.deepEqual(rules([file('apps/api/test/integration/state.test.ts', "import { Worker } from '../../../worker/src/jobs/outbox/processor';"), file('apps/worker/src/jobs/outbox/processor.ts')]), []);
});
test('cycles and unresolved moved imports fail instead of silently passing', () => {
  assert.ok(rules([file('packages/domain/src/a.ts', "export * from './b';"), file('packages/domain/src/b.ts', "export * from './a';")]).includes('cycle'));
  assert.ok(rules([file('apps/web/features/academic/model.ts', "import './missing';")]).includes('unresolved-import'));
});
test('navigation is required for new features and domains', () => {
  assert.ok(checkArchitecture([file('apps/web/features/community/model.ts')]).some(issue => issue.file === 'apps/web/features/community' && issue.rule === 'navigation'));
});
test('an unregistered alias or repository-script dependency cannot evade runtime checks', () => {
  assert.ok(rules([file('apps/web/features/academic/model.ts', "import data from '@/server/database';")]).includes('alias-policy'));
  assert.ok(rules([file('packages/domain/src/index.ts', "import './../../../scripts/setup';"), file('scripts/setup.ts')]).includes('package-direction'));
});
test('routes use public surfaces and shared infrastructure cannot depend on routes', () => {
  assert.ok(rules([file('apps/web/app/page.tsx', "import { Marking } from '../features/academic/components/marking';"), file('apps/web/features/academic/components/marking.tsx')]).includes('feature-api'));
  assert.ok(rules([file('apps/web/shared/api/data.ts', "import { page } from '../../app/page';"), file('apps/web/app/page.tsx')]).includes('shared-direction'));
});
test('runtime imports cannot acquire test-only server dependencies', () => {
  assert.ok(rules([file('apps/web/features/academic/model.ts', "import { data } from './test/fixture';"), file('apps/web/features/academic/test/fixture.ts', "import { Pool } from 'pg';")]).includes('runtime-test'));
});
test('unowned web source cannot hide database/config imports', () => {
  assert.ok(rules([file('apps/web/server/private.ts', "import { Pool } from 'pg';"), file('apps/web/features/academic/model.ts', "import '../../server/private';")]).includes('layout'));
});
test('tooling names and unit tests cannot bypass canonical runtime/application ownership', () => {
  assert.ok(rules([file('apps/web/server/next.config.ts')]).includes('layout'));
  assert.ok(rules([file('apps/api/src/unowned/app.ts')]).includes('layout'));
  assert.ok(rules([file('apps/web/features/academic/model.ts', "import '../../next.config';"), file('apps/web/next.config.ts')]).includes('browser-server'));
  assert.ok(rules([file('apps/api/test/unit/worker.test.ts', "import '../../../worker/src/jobs/outbox/processor';"), file('apps/worker/src/jobs/outbox/processor.ts')]).includes('test-direction'));
});

test('only the documented portable analytics contract subpath crosses browser and Edge boundaries', () => {
  const accepted = [file('apps/web/shared/diagnostics/client.ts', "import { analyticsEventNames } from '@cuevo/contracts/analytics';"), file('packages/contracts/src/analytics.ts')];
  assert.deepEqual(rules(accepted), []);
  assert.ok(rules([file('apps/web/shared/diagnostics/client.ts', "import data from '@cuevo/contracts/private';"), file('packages/contracts/src/private.ts')]).includes('unresolved-import'));
});
