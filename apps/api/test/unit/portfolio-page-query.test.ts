import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('portfolio page keeps one exact source check for identity', () => {
  it('factorizes current identity without granting the trusted helper or bypassing the canonical wrapper', () => {
    const file = readdirSync('supabase/migrations').find(name => name.endsWith('_portfolio_page_source_identity.sql'));
    expect(file, 'An additive private source/identity migration is required.').toBeDefined();
    const sql = readFileSync('supabase/migrations/' + file!, 'utf8');
    expect(sql).toContain('create function internal.identity_from_validated_source(source jsonb)');
    expect(sql).toContain("source:=internal.portfolio_source(target_model,target_evidence,\"authorization\".current_role(school)='parent');");
    expect(sql).toContain('return internal.identity_from_validated_source(source);');
    expect(sql).toContain('internal.identity_from_validated_source(source)');
    expect(sql).toContain('from public,anon,authenticated,service_role,cuevo_api,cuevo_worker');
    expect(sql).not.toMatch(/grant execute on function internal\.identity_from_validated_source/);
    expect(sql).toContain('current exact identity');
  });
});
