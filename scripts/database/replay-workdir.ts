import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { replayPlan, posthogEnvironmentMigration, posthogIntelligenceMigration } from './replay-plan';
import { assertCuevoLocalConfig } from '../configure-local';

type ReplayFile = { name: string; bytes: Buffer };
export type ReplayWorkdirs = {
  root: string; prefix: string; prerequisite: string;
  plan: ReturnType<typeof replayPlan>; files: ReplayFile[];
};
type CapturedReplay = { sourceRoot: string; config: string; partialConfig: string; files: ReplayFile[]; prefix: string; prerequisite: string; root: string; before: string[]; prerequisiteName: string; planJson: string };
const preparedReplays = new WeakMap<ReplayWorkdirs, CapturedReplay>();

/** Local bootstrap may share only an object created in this process, never supplied cache metadata. */
export async function createReplayWorkdirs() {
  const sourceRoot = resolve('.');
  const config = await readFile('supabase/config.toml', 'utf8');
  assertCuevoLocalConfig(config);
  const files = await Promise.all((await readdir('supabase/migrations')).filter(name => name.endsWith('.sql')).map(async name => ({ name, bytes: await readFile(resolve('supabase/migrations', name)) })));
  const plan = replayPlan(files);
  const parent = resolve('.local/migration-replay');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(resolve(parent, 'operation-'));
  const prefix = resolve(root, 'prefix'), prerequisite = resolve(root, 'prerequisite');
  const partialConfig = config.replace(/(\[db\.seed\][\s\S]*?enabled\s*=\s*)true/, '$1false');
  if (partialConfig === config) throw Error('Partial migration seed configuration missing');
  for (const directory of [prefix, prerequisite]) {
    await mkdir(resolve(directory, 'supabase/migrations'), { recursive: true });
    await writeFile(resolve(directory, 'supabase/config.toml'), partialConfig);
  }
  for (const name of plan.before) for (const directory of [prefix, prerequisite]) await writeFile(resolve(directory, 'supabase/migrations', name), files.find(file => file.name === name)!.bytes);
  await writeFile(resolve(prerequisite, 'supabase/migrations', plan.prerequisite), files.find(file => file.name === plan.prerequisite)!.bytes);
  await writeFile(resolve(root, 'plan.json'), JSON.stringify({ ...plan, checks: 'check_function_bodies remains enabled; original filenames and bytes unchanged' }, null, 2));
  const replay = { root, prefix, prerequisite, plan, files };
  preparedReplays.set(replay, { sourceRoot, config, partialConfig, files: files.map(file => ({ name: file.name, bytes: Buffer.from(file.bytes) })), root, prefix, prerequisite, before: [...plan.before], prerequisiteName: plan.prerequisite, planJson: JSON.stringify(plan) });
  return replay;
}

/** Fresh synchronous physical comparisons immediately precede each local effect. No approval is cached. */
export function assertReplayWorkdirs(replay: ReplayWorkdirs, consumedStage?: string) {
  const captured = preparedReplays.get(replay);
  if (!captured || resolve('.') !== captured.sourceRoot || replay.root !== captured.root || replay.prefix !== captured.prefix || replay.prerequisite !== captured.prerequisite) throw Error('Local migration replay was not prepared by this operation');
  const config = readFileSync('supabase/config.toml', 'utf8');
  assertCuevoLocalConfig(config);
  if (config !== captured.config) throw Error('Local migration configuration changed during replay');
  const names = (path: string) => readdirSync(path).filter(name => name.endsWith('.sql')).sort();
  const expectedNames = captured.files.map(file => file.name).sort();
  if (JSON.stringify(names('supabase/migrations')) !== JSON.stringify(expectedNames) || JSON.stringify(replay.files.map(file => file.name).sort()) !== JSON.stringify(expectedNames) || JSON.stringify(replay.plan) !== captured.planJson) throw Error('Migration inventory or plan changed during replay');
  for (const file of captured.files) {
    if (!readFileSync(resolve('supabase/migrations', file.name)).equals(file.bytes) || !replay.files.find(current => current.name === file.name)?.bytes.equals(file.bytes)) throw Error('Migration source changed during replay');
  }
  const stage = (directory: string, stageNames: string[]) => {
    if (readFileSync(resolve(directory, 'supabase/config.toml'), 'utf8') !== captured.partialConfig || JSON.stringify(names(resolve(directory, 'supabase/migrations'))) !== JSON.stringify([...stageNames].sort())) throw Error('Staged migration configuration or inventory changed during replay');
    for (const name of stageNames) if (!readFileSync(resolve(directory, 'supabase/migrations', name)).equals(captured.files.find(file => file.name === name)!.bytes)) throw Error('Staged migration bytes changed during replay');
  };
  if (consumedStage === captured.prefix) stage(captured.prefix, captured.before);
  else if (consumedStage === captured.prerequisite) stage(captured.prerequisite, [...captured.before, captured.prerequisiteName]);
  else if (consumedStage !== undefined) {
    if (consumedStage !== resolve(captured.root, 'posthog-environment')) throw Error('Unexpected local environment migration stage');
    stage(consumedStage, captured.files.filter(file => file.name.slice(0, 14) < posthogIntelligenceMigration.slice(0, 14) || file.name === posthogEnvironmentMigration).map(file => file.name));
  }
}
