import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('portfolio page batches pure identity after exact source checks', () => {
  it('keeps canonical row authority and bounded owner-only identity aggregation', () => {
    const file = readdirSync('supabase/migrations').find(name => name.endsWith('_portfolio_page_identity_batch.sql'));
    const sql = readFileSync('supabase/migrations/' + file!, 'utf8');
    expect(sql).toContain('create function internal.portfolio_page_identities(authorized_rows jsonb)');
    expect(sql).toContain('exact_peers as materialized');
    expect(sql).toContain('jsonb_array_length(authorized_rows)>101');
    expect(sql).toContain('"authorization".can_view_person(school,peer_actor)');
    expect(sql).toContain('result:=internal.portfolio_page_identities(result);');
    expect(sql).toContain('begin source:=internal.portfolio_source(row_item.source_model,row_item.evidence_id,role_name=\'\'parent\'\');exception when insufficient_privilege then continue;end;');
    expect(sql).not.toMatch(/grant execute on function internal\.portfolio_page_identities/);
    expect(sql).toContain('from public,anon,authenticated,service_role,cuevo_api,cuevo_worker');
  });
});
