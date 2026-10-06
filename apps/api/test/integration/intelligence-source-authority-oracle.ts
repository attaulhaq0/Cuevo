import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// Frozen inputs precede the canonical candidate-materialization repair. The oracle
// never derives expectations from pg_get_functiondef on the current database.
const sources = {
  current: ['supabase/migrations/20261001161916_customer_current_source_authority.sql', '557371f13848ff146a6df1b4ea25f5a31f988d8d41bd1bb0d70e95eb682c4a91'],
  native: ['supabase/migrations/20261002021737_native_academic_source_identity.sql', '52066e47c55d0529d9a5bd3e2295fdceaffad64ecd40a71366c426d087872bac'],
  nativeLearner: ['supabase/migrations/20261002022040_native_source_exact_current_learner.sql', 'ccb165e8888071274a35a0f1f0f200a882bf88e0782c0ba2f9645067bf9cb7c3'],
  publication: ['supabase/migrations/20261002023738_result_parent_publication.sql', '808fd73c500e015385d54f6a2a9bfcf4efa3d5e7d4e5339edcbc3fb10eab86a3'],
  baseline: ['supabase/migrations/20261002022519_improvement_native_source_ownership.sql', '5bb1635d41ab37771c6de4bde0e303b067ecad626741aa7d22b94d21d4dd8b0b'],
  insight: ['supabase/migrations/20261001132353_stored_insight_current_authority.sql', '06f31772d279efb64e840d97fb35a579d0458cbbfde336b5c779275e111d721e'],
  nativeInsight: ['supabase/migrations/20261002023742_intelligence_native_context.sql', '621533f1d39c19dfb44d1d93e71b1bab5fbe871caf6e0660719e7ecb9b229f2f'],
  context: ['supabase/tests/192_teacher_insight_context_parity.test.sql', '7af74ebe95be4fc12f1580d28e8a40d0ccadbaa01433bfdbc11cc1dfbd92749d'],
} as const;

export const canonicalAuthority = [
  { name: '"authorization".can_read_academic_source', parameters: 'target_school uuid,target_learner uuid,parent_allowed boolean,target_assessment uuid', args: 'target_school,target_learner,parent_allowed,target_assessment', types: 'uuid,uuid,boolean,uuid' },
  { name: '"authorization".can_mark_submission', parameters: 'target_school uuid,target_submission uuid', args: 'target_school,target_submission', types: 'uuid,uuid' },
  { name: 'internal.native_academic_source_allowed', parameters: 'target_school uuid,target_result uuid,require_current boolean', args: 'target_school,target_result,require_current', types: 'uuid,uuid,boolean' },
  { name: '"authorization".can_manage_baseline', parameters: 'target_school uuid,target_result uuid', args: 'target_school,target_result', types: 'uuid,uuid' },
  { name: 'internal.insight_result_allowed', parameters: 'target_school uuid,target_result uuid,target_learner uuid,target_course uuid,target_reference uuid,target_version text,require_current boolean', args: 'target_school,target_result,target_learner,target_course,target_reference,target_version,require_current', types: 'uuid,uuid,uuid,uuid,uuid,text,boolean' },
] as const;

function localName(name: string, prefix: string) { return 'pg_temp.' + prefix + name.split('.')[1].replaceAll('"', ''); }
export function beforeName(name: string) { return localName(name, 'before_'); }
export function currentName(name: string) { return localName(name, 'current_'); }

function definition(source: string, name: string) {
  const starts = ['create function ' + name + '(', 'create or replace function ' + name + '('].map(text => source.indexOf(text)).filter(index => index >= 0);
  if (starts.length !== 1) throw Error('Frozen source must contain exactly one definition: ' + name);
  const start = starts[0]; const bodyStart = source.indexOf('$$', start); const end = source.indexOf('$$;', bodyStart + 2);
  if (bodyStart < start || end <= bodyStart) throw Error('Frozen source body boundary missing: ' + name);
  return source.slice(start, end + 3);
}
function replaceExactly(source: string, from: string, to: string) {
  if (source.split(from).length !== 2) throw Error('Frozen transformation anchor changed: ' + from);
  return source.replace(from, to);
}

export async function frozenAuthoritySql() {
  const loaded = Object.fromEntries(await Promise.all(Object.entries(sources).map(async ([key, [path, hash]]) => {
    const bytes = await readFile(path);
    if (createHash('sha256').update(bytes).digest('hex') !== hash) throw Error('Frozen authority source bytes changed: ' + path);
    return [key, bytes.toString('utf8')] as const;
  }))) as Record<keyof typeof sources, string>;
  let native = definition(loaded.native, 'internal.native_academic_source_allowed');
  // Reproduce the two reviewed historical substitutions, with their source
  // scripts hash-locked above and independently checked literal anchors here.
  if (!loaded.nativeLearner.includes('and(not require_current or "authorization".current_learner_course(target_school,assessment.course_id,source.learner_id)) ')) throw Error('Frozen native learner amendment changed');
  native = replaceExactly(native, 'and(not require_current or(', 'and(not require_current or "authorization".current_learner_course(target_school,assessment.course_id,source.learner_id)) and(not require_current or(');
  if (!loaded.publication.includes("execute replace(definition,anchor,'internal.result_parent_published(target_school,target_result)')")) throw Error('Frozen publication amendment changed');
  native = replaceExactly(native, 'coalesce(numeric.parent_visible,rubric.parent_visible)', 'internal.result_parent_published(target_school,target_result)');
  let insight = definition(loaded.insight, 'internal.insight_result_allowed');
  if (!loaded.nativeInsight.includes("definition:=replace(definition,'app.result_revisions','internal.improvement_result_sources')")) throw Error('Frozen native insight amendment changed');
  insight = insight.replaceAll('app.result_revisions', 'internal.improvement_result_sources').replaceAll('app.academic_evidence', 'internal.improvement_evidence_sources').replaceAll('app.current_results', 'internal.improvement_current_results');
  const originals = [
    definition(loaded.current, canonicalAuthority[0].name), definition(loaded.current, canonicalAuthority[1].name), native,
    definition(loaded.baseline, canonicalAuthority[3].name), insight,
    definition(loaded.nativeInsight, 'internal.intelligence_context'), definition(loaded.insight, 'internal.insight_outcome_allowed'),
    definition(loaded.context, 'pg_temp.original_native_insight_context'), definition(loaded.context, 'pg_temp.original_teacher_insight_context'),
  ];
  const names = [...canonicalAuthority.map(item => item.name), 'internal.intelligence_context', 'internal.insight_outcome_allowed', 'pg_temp.original_native_insight_context', 'pg_temp.original_teacher_insight_context'];
  const frozen = originals.map(original => {
    let sql = original;
    // Quoted canonical names may follow AND/OR without whitespace in the
    // historical SQL. A pg_temp identifier requires a real token boundary.
    for (const name of names) sql = sql.replaceAll(name + '(', ' ' + beforeName(name) + '(');
    if (names.some(name => sql.includes(name + '('))) throw Error('Frozen graph still invokes a changed canonical helper');
    return sql;
  });
  return { originals, frozen, names };
}
