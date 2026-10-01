import ts from 'typescript';
import path from 'node:path';
import { isBuiltin } from 'node:module';

export type ArchitectureFile = { path: string; content: string };
export type ArchitectureIssue = { file: string; rule: string; message: string };
const source = /\.(?:ts|tsx|js|mjs)$/;
const publicFeatureFiles = new Set(['api.ts', 'model.ts', 'ui.tsx', 'copy.ts', 'styles.css']);
const serverPackages = ['pg', 'jose', '@nestjs/', 'fastify', '@fastify/', 'dotenv'];
const application = (file: string) => file.match(/^apps\/([^/]+)\//)?.[1];
const workspacePackage = (file: string) => file.match(/^packages\/([^/]+)\//)?.[1];
const webFeature = (file: string) => file.match(/^apps\/web\/features\/([^/]+)\//)?.[1];
const apiModule = (file: string) => file.match(/^apps\/api\/src\/modules\/([^/]+)\//)?.[1];
const testFile = (file: string) => file.includes('/test/') || file.includes('/tests/') || file.endsWith('.test.ts');
const webRuntime = (file: string) => file.startsWith('apps/web/app/') || file.startsWith('apps/web/features/') || file.startsWith('apps/web/shared/');

function imports(file: ArchitectureFile) {
  const ast = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, file.path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const values: string[] = [];
  function visit(node: ts.Node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) values.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require') && node.arguments.length > 0 && ts.isStringLiteralLike(node.arguments[0])) values.push(node.arguments[0].text);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) values.push(node.argument.literal.text);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return values;
}

export function checkArchitecture(input: ArchitectureFile[], options: { navigation?: boolean } = {}): ArchitectureIssue[] {
  const files = input.map(file => ({ ...file, path: file.path.replaceAll('\\', '/') }));
  const paths = new Set(files.map(file => file.path));
  const issues: ArchitectureIssue[] = [];
  const graph = new Map<string, string[]>();
  const fail = (file: string, rule: string, message: string) => issues.push({ file, rule, message });
  function resolve(from: string, specifier: string): string | undefined {
    let base: string;
    if (specifier.startsWith('.')) base = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
    else if (specifier.startsWith('@cuevo/')) {
      const [name, ...subpath] = specifier.slice('@cuevo/'.length).split('/');
      // The public workspace export lives at src/index.ts; UI exposes only tokens.css separately.
      if (subpath.length && !(name === 'ui' && subpath.join('/') === 'tokens.css')) return undefined;
      base = `packages/${name}/src/${subpath.length ? 'tokens.css' : 'index'}`;
    } else return undefined;
    const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}/index.ts`, `${base}/index.tsx`];
    return candidates.find(candidate => paths.has(candidate));
  }
  for (const file of files.filter(file => source.test(file.path) && !file.path.endsWith('next-env.d.ts'))) {
    const from = file.path;
    const app = application(from); const pkg = workspacePackage(from); const feature = webFeature(from);
    const runtime = (from.startsWith('apps/api/src/') || from.startsWith('apps/worker/src/') || from.startsWith('apps/web/app/') || from.startsWith('apps/web/features/') || from.startsWith('apps/web/shared/') || from.startsWith('packages/') && !testFile(from));
    if (app === 'web' && !testFile(from) && !webRuntime(from) && !from.startsWith('apps/web/.storybook/') && !['apps/web/next.config.ts', 'apps/web/instrumentation.ts', 'apps/web/proxy.ts'].includes(from)) fail(from, 'layout', 'Web runtime source must belong to app, features or shared.');
    if (from.startsWith('apps/web/components/') || from.startsWith('apps/web/lib/') || from.startsWith('apps/web/messages/')) fail(from, 'layout', 'Web source must have feature or shared ownership.');
    if (from.startsWith('apps/api/src/') && !['apps/api/src/app.ts', 'apps/api/src/main.ts'].includes(from) && !from.startsWith('apps/api/src/modules/') && !from.startsWith('apps/api/src/platform/')) fail(from, 'layout', 'API source belongs to a domain module or platform capability.');
    if (from.startsWith('apps/worker/src/') && from !== 'apps/worker/src/main.ts' && !from.startsWith('apps/worker/src/jobs/') && !from.startsWith('apps/worker/src/platform/')) fail(from, 'layout', 'Worker source belongs to jobs or platform.');
    graph.set(from, []);
    for (const specifier of imports(file)) {
      const target = resolve(from, specifier);
      const local = specifier.startsWith('.') || specifier.startsWith('@cuevo/');
      if (specifier.startsWith('@/') || specifier.startsWith('~/') || specifier.startsWith('#') || specifier.startsWith('/')) fail(from, 'alias-policy', `Unregistered local alias ${specifier}; add it to the convention and resolver before use.`);
      if (local && !target) { fail(from, 'unresolved-import', `Cannot resolve local/public import ${specifier}.`); continue; }
      if (target) {
        graph.get(from)!.push(target);
        const targetApp = application(target); const targetPkg = workspacePackage(target); const targetFeature = webFeature(target);
        if (runtime && !testFile(from) && testFile(target)) fail(from, 'runtime-test', 'Production/runtime code cannot import test fixtures or test-only adapters.');
        if (specifier.startsWith('.') && targetPkg && (targetPkg !== pkg || !pkg)) fail(from, 'package-api', `Use the @cuevo/${targetPkg} public export instead of ${specifier}.`);
        if (pkg && targetApp) fail(from, 'package-direction', 'Shared packages cannot import application implementation.');
        if (pkg && !targetPkg && !targetApp) fail(from, 'package-direction', 'Shared packages cannot import repository scripts or operations.');
        if (runtime && app && !targetApp && !targetPkg) fail(from, 'application-direction', 'Application runtime cannot import repository scripts or operations.');
        if (runtime && app && targetApp && app !== targetApp) fail(from, 'application-direction', 'Runtime applications cannot import another application implementation.');
        if (testFile(from) && app && targetApp && app !== targetApp && !from.includes('/test/integration/')) fail(from, 'test-direction', 'Only explicit integration suites may compose another application.');
        if (from.startsWith('apps/api/src/platform/') && apiModule(target)) fail(from, 'platform-direction', 'API platform cannot import domain modules.');
        if (apiModule(from) && apiModule(target) && apiModule(from) !== apiModule(target) && !target.endsWith('/public.ts')) fail(from, 'module-api', 'Cross-domain imports require an explicit public.ts surface.');
        if (from.startsWith('apps/worker/src/platform/') && target.startsWith('apps/worker/src/jobs/')) fail(from, 'platform-direction', 'Worker platform cannot import jobs.');
        if (from.startsWith('apps/web/shared/') && targetFeature) fail(from, 'shared-direction', 'Shared web infrastructure cannot import a feature.');
        if (from.startsWith('apps/web/shared/') && target.startsWith('apps/web/app/')) fail(from, 'shared-direction', 'Shared web infrastructure cannot import route composition.');
        if (webRuntime(from) && targetApp === 'web' && !webRuntime(target) && !testFile(target)) fail(from, 'browser-server', 'Web runtime cannot import build/tooling configuration.');
        if (from.startsWith('apps/web/app/') && targetFeature && (!publicFeatureFiles.has(path.posix.basename(target)) || path.posix.dirname(target) !== `apps/web/features/${targetFeature}`)) fail(from, 'feature-api', 'Route composition must use the feature public surface.');
        if (feature && targetFeature && feature !== targetFeature) {
          if (targetFeature === 'shell') fail(from, 'feature-direction', 'Features cannot depend on shell composition.');
          if (!publicFeatureFiles.has(path.posix.basename(target)) || path.posix.dirname(target) !== `apps/web/features/${targetFeature}`) fail(from, 'feature-api', `Import the ${targetFeature} feature through its documented public surface.`);
        }
        if (runtime && app === 'web' && targetPkg === 'config') fail(from, 'browser-server', 'Server configuration must not enter web imports.');
        if (['domain', 'contracts'].includes(pkg ?? '') && ['config', 'ui'].includes(targetPkg ?? '')) fail(from, 'pure-package', 'Pure domain/contracts cannot depend on server config or UI.');
        if (pkg === 'ui' && targetPkg && targetPkg !== 'ui' && targetPkg !== 'contracts') fail(from, 'ui-direction', 'Design primitives cannot depend on server or domain implementation.');
      }
      if (!testFile(from) && (app === 'web' && runtime || ['domain', 'contracts', 'ui'].includes(pkg ?? '')) && (isBuiltin(specifier) || serverPackages.some(name => name.endsWith('/') ? specifier.startsWith(name) : specifier === name || specifier.startsWith(name + '/')))) fail(from, 'browser-server', `Server-only dependency ${specifier} is forbidden here.`);
    }
  }
  const visited = new Set<string>(); const active: string[] = []; const emitted = new Set<string>();
  function cycle(file: string) {
    if (active.includes(file)) {
      const chain = [...active.slice(active.indexOf(file)), file]; const key = [...chain].sort().join('|');
      if (!emitted.has(key)) { fail(file, 'cycle', `Circular local dependency: ${chain.join(' -> ')}`); emitted.add(key); }
      return;
    }
    if (visited.has(file)) return;
    active.push(file); for (const next of graph.get(file) ?? []) cycle(next); active.pop(); visited.add(file);
  }
  for (const file of graph.keys()) cycle(file);
  if (options.navigation !== false) {
    const allowedRoots = new Set(['apps', 'packages', 'docs', 'scripts', 'supabase', 'tests', 'docker', '.github']);
    for (const top of new Set(files.filter(file => file.path.includes('/')).map(file => file.path.split('/')[0]))) if (!allowedRoots.has(top)) fail(top, 'layout', 'New top-level source ownership requires updating the repository convention and checker.');
    for (const required of ['README.md', 'AGENTS.md', 'START-HERE-CODEX-PROMPT.md', 'docs/README.md', 'docs/product/README.md', 'docs/product/context-map.md', 'docs/product/index.md', 'docs/product/registry.json', 'docs/codebase-map.md', 'docs/architecture/repository-layout.md', 'apps/api/README.md', 'apps/api/AGENTS.md', 'apps/web/README.md', 'apps/web/AGENTS.md', 'apps/worker/README.md', 'apps/worker/AGENTS.md']) if (!paths.has(required)) fail(required, 'navigation', 'Required repository navigation/instructions file is missing.');
    const features = new Set(files.map(file => webFeature(file.path)).filter((name): name is string => Boolean(name)));
    const modules = new Set(files.map(file => apiModule(file.path)).filter((name): name is string => Boolean(name)));
    for (const directory of [...features].map(name => `apps/web/features/${name}`).concat([...modules].map(name => `apps/api/src/modules/${name}`))) if (!paths.has(`${directory}/README.md`)) fail(directory, 'navigation', 'Each feature/domain needs a purpose and public-interface README.');
    for (const pkg of new Set(files.map(file => workspacePackage(file.path)).filter(Boolean))) if (!paths.has(`packages/${pkg}/README.md`)) fail(`packages/${pkg}`, 'navigation', 'Each package needs a documented responsibility and public API.');
  }
  return issues;
}
