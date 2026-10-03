import { readFileSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';

it('materializes exact source candidates before unchanged authorization and the existing top-ten limit', () => {
  const file = readdirSync('supabase/migrations').find(name => name.endsWith('_intelligence_context_candidate_materialization.sql'));
  const sql = readFileSync('supabase/migrations/' + file!, 'utf8');
  expect(sql).toContain('with candidates as materialized(');
  expect(sql).toContain('internal.insight_result_allowed(school,r.id,baseline.learner_id,course.id,baseline.reference_id,baseline.reference_version,true)');
  expect(sql).toContain('internal.native_academic_source_allowed(school,result.id,true)');
  expect(sql).toContain('order by(r.id=baseline_id)desc,r.created_at desc,r.id limit 10');
  expect(sql).toContain('order by(result.id=baseline_id)desc,result.created_at desc,result.id limit 10');
  expect(sql).toContain('options:=internal.insight_published_options(school,course.id);');
  expect(sql).toContain('No early top-N limit');
  expect(sql).not.toContain('grant execute');
});
