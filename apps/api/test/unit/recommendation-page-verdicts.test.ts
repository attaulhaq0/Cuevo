import { readFileSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';
it('keeps statement-local full-argument verdicts private and canonical page predicates', () => {
 const file = readdirSync('supabase/migrations').find(name => name.endsWith('_recommendation_page_source_verdicts.sql'));
 const sql = readFileSync('supabase/migrations/' + file!, 'utf8');
 expect(sql).toContain('create function internal.recommendation_page_verdict(');
 expect(sql).toContain('jsonb_build_array(kind,arguments)::text');
 expect(sql).toContain('Current page source verdict unavailable');
 expect(sql).toContain('recommendation_source_allowed');
 expect(sql).toContain('require_stored_insight_scope');
 expect(sql).toContain('require_native_insight_scope');
 expect(sql).toContain('can_read_academic_source');
 expect(sql).toContain('parent_allowed');
 expect(sql).toContain('priorInterventions');
 expect(sql).not.toMatch(/grant execute/);
});
