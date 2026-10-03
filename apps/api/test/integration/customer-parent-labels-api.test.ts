import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config as dotenv } from 'dotenv';
import { createCustomerContext, customerActor, type CustomerContext } from './customer-test-context';

dotenv({ path: '.env.local', quiet: true });
const enabled = process.env.CUEVO_REQUIRE_INTEGRATION === '1';
describe.skipIf(!enabled)('real parent child class labels retain exact relationship and enrollment scope', () => {
  let context: CustomerContext;
  beforeAll(async () => { context = await createCustomerContext(); }, 60_000);
  afterAll(async () => { await context?.close(); });
  it('duplicate child/class names retain authorized year context without leaking another child class after withdrawal', async () => {
    const nextYear = await context.client.query("insert into app.academic_years(school_id,name,starts_on,ends_on)values($1,'Different academic year','2028-01-01','2028-12-31')returning id", [context.school]);
    await context.client.query('update app.classes set academic_year_id=$3 where school_id=$1 and id=$2', [context.school, context.secondClassId, nextYear.rows[0].id]);
    await context.client.query("insert into app.enrollments(school_id,class_id,student_actor_id,effective_from)values($1,$2,$3,now()-interval '1 day')", [context.school, context.secondClassId, customerActor(13)]);
    await context.client.query('delete from app.parent_relationships where school_id=$1 and parent_actor_id=$2 and student_actor_id<>all($3::uuid[])', [context.school, customerActor(72), [customerActor(12), customerActor(13)]]);
    const response = await context.request('parent', '/v1/people?limit=100'); expect(response.statusCode).toBe(200);
    const people = response.json().items as { userId: string; displayName: string; role: string; classLabels: string[] }[];
    expect(people.filter(person => person.role === 'student').map(person => person.userId).sort()).toEqual([customerActor(12), customerActor(13)]);
    expect(people.find(person => person.userId === customerActor(12))).toMatchObject({ displayName: 'Same name — اسم مكرر', classLabels: ['Duplicate class — صف · Synthetic year'] });
    expect(people.find(person => person.userId === customerActor(13))?.classLabels.sort()).toEqual(['Duplicate class — صف · Different academic year', 'Duplicate class — صف · Synthetic year']);
    await context.client.query("update app.enrollments set status='revoked'where school_id=$1 and class_id=$2 and student_actor_id=$3", [context.school, context.secondClassId, customerActor(13)]);
    const withdrawn = await context.request('parent', '/v1/people?limit=100'); expect(withdrawn.statusCode).toBe(200); const current = withdrawn.json().items as typeof people;
    expect(current.find(person => person.userId === customerActor(12))?.classLabels).toEqual(['Duplicate class — صف · Synthetic year']);
    expect(current.find(person => person.userId === customerActor(13))?.classLabels).toEqual(['Duplicate class — صف · Synthetic year']);
    await context.client.query("update app.parent_relationships set status='revoked'where school_id=$1 and parent_actor_id=$2 and student_actor_id=$3", [context.school, customerActor(72), customerActor(13)]);
    const revoked = await context.request('parent', '/v1/people?limit=100'); expect(revoked.statusCode).toBe(200); expect(revoked.json().items.some((person: { userId: string }) => person.userId === customerActor(13))).toBe(false);
  });
});
