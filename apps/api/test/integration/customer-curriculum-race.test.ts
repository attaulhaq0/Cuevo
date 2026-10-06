import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { config as dotenv } from 'dotenv';
dotenv({ path: '.env.local', quiet: true });
const enabled = process.env.CUEVO_REQUIRE_INTEGRATION === '1';
const school = '10000000-0000-4000-8000-000000000001';
const teacher = '20000000-0000-4000-8000-000000000004';
const administrator = '20000000-0000-4000-8000-000000000001';

describe.skipIf(!enabled)('customer curriculum configuration transaction race', () => {
  let pool: Pool;
  beforeAll(() => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== '127.0.0.1' || url.port !== '56322') throw Error('Guarded Cuevo local database required');
    url.username = 'postgres'; url.password = 'postgres'; pool = new Pool({ connectionString: url.toString() });
  });
  afterAll(async () => { await pool?.end(); });
  const actor = async (client: PoolClient, id: string) => {
    await client.query('set local role cuevo_api');
    await client.query("select set_config('app.school_id',$1,true),set_config('app.actor_id',$2,true)", [school, id]);
  };
  it('DATA02 an uncommitted programme binding serializes a competing assessment reference link', async () => {
    const setup = await pool.connect(); const binder = await pool.connect(); const linker = await pool.connect();
    const course = randomUUID(); const assessment = randomUUID(); let pack: string | undefined; let reference: string | undefined; let programme: string | undefined;
    try {
      await setup.query('BEGIN');
      await setup.query("insert into app.courses(school_id,id,class_id,subject_id,created_by,title,description,status)values($1,$2,$3,$4,$5,'Customer race course','Synthetic','PUBLISHED')", [school, course, '30000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', teacher]);
      await setup.query("insert into app.assessments(school_id,id,course_id,created_by,title,instructions,max_score)values($1,$2,$3,$4,'Customer race assessment','Synthetic',10)", [school, assessment, course, teacher]);
      await actor(setup, administrator);
      const command = async (name: string, payload: Record<string, unknown>) => (await setup.query('select internal.configure_curriculum($1,null,$2::jsonb,$3,$4,$5) receipt', [name, JSON.stringify(payload), randomUUID(), 'a'.repeat(64), 'customer-curriculum-race'])).rows[0].receipt.id as string;
      pack = await command('version.create', { packId: `customer-race-${course}`, kind: 'school_custom', framework: 'School Custom', programme: 'School source race', version: 'school-1', scope: 'synthetic', sourceStatus: 'VERIFIED', rightsStatus: 'PERMITTED', sourceLocation: 'repo:synthetic', sourceChecksum: null, synthetic: true, reason: 'Independent concurrency regression' });
      reference = await command('reference.create', { packVersionId: pack, parentId: null, type: 'objective', title: 'Concurrent school objective', description: 'Synthetic', code: null, sequence: 1, subjectId: null, yearGroupId: null });
      for(const[state,expectedRevision]of [['APPROVED',1],['ACTIVE',2]]as const)await setup.query('select internal.transition_curriculum_lifecycle($1,$2::jsonb,null,$3,$4,$5)',[pack,JSON.stringify({state,expectedRevision,reviewBasis:'SCHOOL_AUTHORED',artifactDirectory:null,replacementVersionId:null,reason:'Reviewed synthetic concurrency source.',confirmTransition:true}),randomUUID(),'a'.repeat(64),'customer-curriculum-race']);
      programme = await command('programme.create', { packVersionId: pack, name: 'Concurrent programme', classId: '30000000-0000-4000-8000-000000000001', subjectId: '43000000-0000-4000-8000-000000000001', yearGroupId: '42000000-0000-4000-8000-000000000001', confirmConfiguration: true });
      await setup.query('COMMIT');
      await binder.query('BEGIN'); await actor(binder, administrator);
      await binder.query('select internal.configure_curriculum($1,$2,$3::jsonb,$4,$5,$6)', ['course.configure', course, JSON.stringify({ programmeId: programme, referenceId: reference, expectedVersion: 1, confirmConfiguration: true }), randomUUID(), 'b'.repeat(64), 'customer-curriculum-race']);
      await linker.query('BEGIN'); await actor(linker, teacher);
      await linker.query("set local lock_timeout='150ms'");
      let blocked = false;
      try { await linker.query('select internal.link_assessment_reference($1,$2,1)', [assessment, '61000000-0000-4000-8000-000000000001']); }
      catch (error) { blocked = (error as { code?: string }).code === '55P03'; }
      expect(blocked).toBe(true);
    } finally {
      await linker.query('ROLLBACK'); await binder.query('ROLLBACK'); await setup.query('ROLLBACK');
      // The committed setup has never been used by an academic result; remove the isolated fixture.
      await setup.query('BEGIN');
      await setup.query('set local session_replication_role=replica');
      await setup.query('delete from internal.outbox_events where school_id=$1 and entity_id=any($2::uuid[])', [school, [pack!, reference!, programme!, course]]);
      await setup.query('delete from internal.audit_events where school_id=$1 and entity_id=any($2::uuid[])', [school, [pack!, reference!, programme!, course]]);
      // Immutable source tables intentionally require fixture cleanup through a transaction-local trigger disable.
      await setup.query('delete from app.assessments where school_id=$1 and id=$2', [school, assessment]);
      await setup.query('delete from app.learning_content_current where school_id=$1 and source_id=$2',[school,course]);
      await setup.query('delete from app.learning_content_revisions where school_id=$1 and course_id=$2',[school,course]);
      await setup.query('delete from app.courses where school_id=$1 and id=$2', [school, course]);
      if (programme!) await setup.query('delete from app.programme_instances where school_id=$1 and id=$2', [school, programme!]);
      if (reference!) await setup.query('delete from app.curriculum_references where school_id=$1 and id=$2', [school, reference!]);
      if(pack!)await setup.query('delete from app.curriculum_lifecycle_revisions where school_id=$1 and version_id=$2',[school,pack!]);
      if (pack!) await setup.query('delete from app.curriculum_versions where school_id=$1 and id=$2', [school, pack!]);
      await setup.query('delete from internal.idempotency_keys where school_id=$1 and response->>\'id\'=any($2::text[])', [school, [pack!, reference!, programme!]]);
      await setup.query('COMMIT');
      expect((await setup.query('select count(*)::integer count from app.curriculum_lifecycle_revisions where school_id=$1 and version_id=$2',[school,pack??null])).rows[0].count).toBe(0);
      expect((await setup.query('select count(*)::integer count from app.learning_content_revisions where school_id=$1 and course_id=$2',[school,course])).rows[0].count).toBe(0);
      setup.release(); binder.release(); linker.release();
    }
  }, 30000);
});
