import { readFileSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';

it('materializes exact academic source rows before request-local verdict predicates', () => {
  const file = readdirSync('supabase/migrations').find(name => name.endsWith('_recommendation_page_exact_source_candidates.sql'));
  const sql = readFileSync('supabase/migrations/' + file!, 'utf8');
  expect(sql).toContain('with candidate as materialized');
  expect(sql).toContain('submission.id=target_submission');
  expect(sql).toContain('assessment.id=target_assessment');
  expect(sql).toContain('result.id=target_result');
  expect(sql).toContain('outcome.id=target_outcome');
  expect(sql).not.toContain('grant execute');
  expect(sql).not.toContain('return true');
});
