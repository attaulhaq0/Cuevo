import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config as dotenv } from 'dotenv';
import { createCustomerContext, customerActor, customerCourse, customerReleased, type CustomerContext, type CustomerRole } from './customer-test-context';
import { portfolioIdentitySchema } from '@cuevo/contracts';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {createClient}from'@supabase/supabase-js';
import {parseServerConfig}from'@cuevo/config';

dotenv({ path: '.env.local', quiet: true });
describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION !== '1')('portfolio page validated-source identity parity', () => {
  let context: CustomerContext;
  const createdObjects = new Set<string>();
  const actorNumber = (role: CustomerRole) => role === 'admin' ? 1 : role === 'coordinator' ? 2 : role === 'parent' ? 72 : role === 'strong' ? 12 : role === 'observed' ? 13 : role === 'otherTeacher' ? 5 : 4;
  beforeAll(async () => {
    context = await createCustomerContext();
    await context.client.query('update app.people set display_name=case when actor_id=$2 then $4 else $5 end where school_id=$1 and actor_id in($2,$3)', [context.school, customerActor(12), customerActor(13), 'Lina Hassan', 'Maha Hassan']);
    const originalMigration = await readFile('supabase/migrations/20261002103511_portfolio_primary_record_identity.sql', 'utf8');
    expect(createHash('sha256').update(originalMigration).digest('hex')).toBe('3f42a31d9a9a0cbe76d2d9bbb4634353ace28b43cea53c90a05fb86f154ce31e');
    const identityStart = originalMigration.indexOf('create function internal.portfolio_record_identity(');
    const identityEnd = originalMigration.indexOf('revoke execute on function internal.portfolio_record_identity(', identityStart);
    expect(identityStart).toBeGreaterThan(0); expect(identityEnd).toBeGreaterThan(identityStart);
    await context.client.query(originalMigration.slice(identityStart, identityEnd).replace('internal.portfolio_record_identity(', 'pg_temp.original_portfolio_identity('));
    await context.client.query('revoke execute on function pg_temp.original_portfolio_identity(text,uuid)from public');
    const originalPage = `create function pg_temp.original_portfolio_page(page_limit integer,page_cursor uuid,target_learner uuid,history_item uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();role_name text:="authorization".current_role("authorization".school_id());row_item record;source jsonb;result jsonb:='[]';count_rows integer:=0;item_filter app.portfolio_items;
begin
 if not"authorization".has_entitlement(school,'portfolio')or page_limit is null or page_limit not between 1 and 100 then raise exception 'Portfolio read denied'using errcode='42501';end if;
 if target_learner is not null and not"authorization".can_view_person(school,target_learner)then raise exception 'Portfolio learner denied'using errcode='42501';end if;
 if history_item is not null then select*into item_filter from app.portfolio_items where school_id=school and id=history_item;if not found or role_name='parent'then raise exception 'Portfolio history denied'using errcode='42501';end if;perform internal.portfolio_source(item_filter.source_model,item_filter.evidence_id,false);end if;
 for row_item in select i.id,i.learner_id,i.source_model,i.evidence_id,r.id revision_id,r.revision,r.title,r.reflection,r.created_at,review.feedback,review.featured,(current_item.parent_revision_id=r.id and coalesce(review.parent_visible,false))as parent_visible,review.reviewed_at,coalesce(review.source_review_confirmed,false)as source_review_confirmed
 from app.portfolio_items i join app.portfolio_current current_item on current_item.school_id=i.school_id and current_item.item_id=i.id join app.portfolio_revisions r on r.school_id=i.school_id and r.item_id=i.id and((history_item is not null)or r.id=case when role_name='parent'then current_item.parent_revision_id else current_item.revision_id end)left join app.portfolio_reviews review on review.school_id=r.school_id and review.revision_id=r.id
 where i.school_id=school and(target_learner is null or i.learner_id=target_learner)and(history_item is null or i.id=history_item)and(page_cursor is null or r.id>page_cursor)and"authorization".can_view_person(school,i.learner_id)and(role_name<>'parent'or review.parent_visible)order by r.id
 loop
  begin source:=internal.portfolio_source(row_item.source_model,row_item.evidence_id,role_name='parent');exception when insufficient_privilege then continue;end;
  count_rows:=count_rows+1;result:=result||jsonb_build_array(source||jsonb_build_object('id',row_item.id,'revisionId',row_item.revision_id,'revision',row_item.revision,'learnerId',row_item.learner_id,'identity',pg_temp.original_portfolio_identity(row_item.source_model,row_item.evidence_id),'sourceModel',row_item.source_model,'title',row_item.title,'reflection',row_item.reflection,'createdAt',row_item.created_at,'feedback',row_item.feedback,'featured',coalesce(row_item.featured,false),'approvalState',case when row_item.feedback is null then'AWAITING_REVIEW'else'REVIEWED'end,'parentVisible',coalesce(row_item.parent_visible,false),'reviewedAt',row_item.reviewed_at,'sourceWorkApproved',row_item.source_review_confirmed,'artifactCount',(select count(*)from app.portfolio_artifacts selected where selected.school_id=school and selected.item_id=row_item.id and selected.revision_id=row_item.revision_id)));
  exit when count_rows>page_limit;
 end loop;
 if octet_length(result::text)>500000 then raise exception 'Portfolio page requires smaller view'using errcode='22023';end if;
 return jsonb_build_object('items',(select coalesce(jsonb_agg(item),'[]'::jsonb)from jsonb_array_elements(result)with ordinality value(item,ordinal)where ordinal<=page_limit),'nextCursor',case when count_rows>page_limit then result->(page_limit-1)->>'revisionId'else null end);
end$$;`;
    // Reconstructed from the unchanged applied original source + publication/text/artifact/identity additions.
    // It does not copy any optimized page definition, so later set-based changes cannot define their own oracle.
    await context.client.query(originalPage);
    await context.client.query('revoke execute on function pg_temp.original_portfolio_page(integer,uuid,uuid,uuid)from public');
    await context.client.query('grant execute on function pg_temp.original_portfolio_page(integer,uuid,uuid,uuid)to cuevo_api');
  }, 60000);
  afterAll(async () => {
    try {
      if(createdObjects.size){const config=parseServerConfig(process.env,'api');
        if(!config.supabaseUrl||!config.storageSecret||!['127.0.0.1','localhost'].includes(new URL(config.supabaseUrl).hostname))throw Error('Guarded local fixture cleanup requires current storage authority.');
        const storage=createClient(config.supabaseUrl,config.storageSecret,{auth:{persistSession:false,autoRefreshToken:false}}).storage.from('learner-private');
        const result=await storage.remove([...createdObjects]);if(result.error)throw Error('Owned fixture object cleanup unavailable.');
      }
    }
    finally { await context?.close(); }
  });

  async function oldPage(role: CustomerRole, limit: number, cursor: string | null, historyId: string | null) {
    await context.client.query('SAVEPOINT portfolio_parity_read');
    await context.client.query('set local role cuevo_api');
    try {
      await context.client.query("set local statement_timeout='5s'");
      await context.client.query("select set_config('app.actor_id',$1,true),set_config('app.school_id',$2,true)", [customerActor(actorNumber(role)), context.school]);
      return (await context.client.query('select pg_temp.original_portfolio_page($1,$2,$3,$4)page', [limit, cursor, null, historyId])).rows[0].page;
    } finally { await context.client.query('ROLLBACK TO SAVEPOINT portfolio_parity_read'); await context.client.query('RELEASE SAVEPOINT portfolio_parity_read'); }
  }
  async function parity(role: CustomerRole, limit = 2, historyId: string | null = null) {
    let cursor: string | null = null; const all: (Record<string, unknown> & { id: string })[] = [];
    for (let attempt = 0; attempt < 20; attempt++) {
      const expected = await oldPage(role, limit, cursor, historyId);
      const response = await context.request(role, '/v1/portfolio/items' + (historyId ? '/' + historyId + '/history' : '') + '?limit=' + limit + (cursor ? '&cursor=' + cursor : ''));
      expect(response.statusCode, response.body).toBe(200);
      const page = response.json() as { items: (Record<string, unknown> & { id: string })[]; nextCursor: string | null };
      expect(page).toEqual(expected);
      for (const item of page.items) {
        expect(portfolioIdentitySchema.safeParse(item.identity).success).toBe(true);
        expect(item).not.toHaveProperty('content'); expect(item).not.toHaveProperty('checkedAnswers'); expect(item).not.toHaveProperty('objectPath');
      }
      all.push(...page.items); if (page.nextCursor === null) return all; expect(page.nextCursor).not.toBe(cursor); cursor = page.nextCursor;
    }
    throw Error('Portfolio parity continuation failed to terminate.');
  }
  async function readFiveRoles() {
    for (const role of ['strong', 'teacher', 'admin', 'coordinator', 'parent'] as const) await parity(role);
  }

  it('preserves full rows/cursors for five roles, retained parent revisions and source publication', async () => {
    const course = await customerCourse(context, 'Portfolio page exact source');
    const sources: (Awaited<ReturnType<typeof customerReleased>> & { itemId: string; revisionId: string })[] = [];
    for (let index = 0; index < 5; index++) {
      const source = await customerReleased(context, index % 2 ? 'observed' : 'strong', course.courseId, 'Same task ' + index, index);
      const item = await context.command(index % 2 ? 'observed' : 'strong', '/v1/portfolio/items', { sourceModel: 'numeric', evidenceId: source.evidenceId, title: 'Selected work ' + index, reflection: 'Exact reflection ' + index });
      await context.command('teacher', '/v1/portfolio/items/' + item.id + '/review', { expectedRevision: 1, feedback: 'Reviewed source ' + index, featured: index === 0, parentVisible: index !== 1, confirmParentApproval: index !== 1, confirmSourceReview: true });
      sources.push({ ...source, itemId: item.id, revisionId: String(item.revisionId) });
    }
    await context.command('strong', '/v1/portfolio/items/' + sources[0].itemId + '/reflection', { expectedRevision: 1, title: 'New private reflection', reflection: 'This revision has no parent approval.' });
    await readFiveRoles(); expect(await parity('otherTeacher')).toHaveLength(0);
    const parent = await parity('parent');
    expect(parent.find(row => row.id === sources[0].itemId)).toMatchObject({ revision: 1, revisionId: sources[0].revisionId });
    expect((await parity('strong')).find(row => row.id === sources[0].itemId)).toMatchObject({ revision: 2, parentVisible: false });
    await parity('teacher', 1, sources[0].itemId); await parity('strong', 1, sources[0].itemId);
    expect((await context.request('parent', '/v1/portfolio/items/' + sources[0].itemId + '/history?limit=2')).statusCode).toBe(403);
    const historical = sources[4];
    const corrected = await context.command('teacher', '/v1/submissions/' + historical.submissionId + '/results', { score: 7, feedback: 'Actual academic correction preserves selected portfolio history.', expectedPolicyVersion: 2, expectedRevision: 1, sourceEvidence: true });
    await context.command('teacher', '/v1/results/' + corrected.id + '/release', { expectedRevision: 2, parentVisible: false });
    expect((await parity('strong')).find(row => row.id === historical.itemId)).toMatchObject({ resultId: historical.resultId, nativeResult: { score: 4 } });
    const source = sources[2];
    const publication = (await context.request('teacher', '/v1/results/' + source.resultId + '/publication')).json();
    await context.command('teacher', '/v1/results/' + source.resultId + '/publication', { parentVisible: false, expectedPublicationRevision: publication.publicationRevision, expectedResultRevision: publication.resultRevision, reason: 'Remove exact underlying parent result publication.', confirmPublication: true });
    expect((await parity('parent')).some(row => row.id === source.itemId)).toBe(false);
    await context.command('teacher', '/v1/portfolio/items/' + sources[0].itemId + '/parent-revoke', { reason: 'Revoke exact selected parent revision.' });
    expect((await parity('parent')).some(row => row.id === sources[0].itemId)).toBe(false);
    await context.client.query('SAVEPOINT guardian_withdrawal');
    try {
      await context.client.query("update app.parent_relationships set status='revoked'where school_id=$1 and parent_actor_id=$2", [context.school, customerActor(72)]);
      expect(await parity('parent')).toHaveLength(0);
    } finally { await context.client.query('ROLLBACK TO SAVEPOINT guardian_withdrawal'); }
  }, 120000);

  it('preserves missing/duplicate human identity and blocks review without blocking sharing removal', async () => {
    await context.client.query('SAVEPOINT duplicate_names');
    try {
      await context.client.query('update app.people set display_name=$2 where school_id=$1 and actor_id in($3,$4)', [context.school, 'Lina Hassan', customerActor(12), customerActor(13)]);
      const teacher = await parity('teacher');
      expect(teacher.length).toBeGreaterThan(0);
      expect(teacher.every(row => (row.identity as { status: string }).status === 'REQUIRES_REVIEW')).toBe(true);
      const item = teacher[0];
      expect((await context.request('teacher', '/v1/portfolio/items/' + item.id + '/review', { expectedRevision: item.revision, feedback: 'Do not invent a disambiguation.', featured: false, parentVisible: false, confirmSourceReview: true })).statusCode).toBe(409);
      await parity('strong');
      const shared = (await parity('parent')).find(row => row.parentVisible === true);
      expect(shared, 'A currently shared ambiguous item must exist before testing removal').toBeDefined();
      await context.command('teacher', '/v1/portfolio/items/' + shared!.id + '/parent-revoke', { reason: 'Remove sharing while school identity review is pending.' });
      expect((await parity('parent')).some(row => row.id === shared!.id)).toBe(false);
    } finally { await context.client.query('ROLLBACK TO SAVEPOINT duplicate_names'); }
    await context.client.query('SAVEPOINT missing_person');
    try {
      await context.client.query('delete from app.people where school_id=$1 and actor_id=$2', [context.school, customerActor(13)]);
      const teacher = await parity('teacher');
      const affected = teacher.filter(row => row.learnerId === customerActor(13));
      expect(affected.length, 'Missing identity must retain the authorized source rows').toBeGreaterThan(0);
      expect(affected.every(row => (row.identity as { learnerName: string | null }).learnerName === null)).toBe(true);
    } finally { await context.client.query('ROLLBACK TO SAVEPOINT missing_person'); }
    await context.client.query('SAVEPOINT enrolled_source_withdrawal');
    try {
      await context.client.query("update app.enrollments set status='revoked'where school_id=$1 and class_id=$2 and student_actor_id=$3", [context.school, context.classId, customerActor(13)]);
      expect((await parity('teacher')).some(row => row.learnerId === customerActor(13))).toBe(false);
      expect((await parity('parent')).some(row => row.learnerId === customerActor(13))).toBe(false);
    } finally { await context.client.query('ROLLBACK TO SAVEPOINT enrolled_source_withdrawal'); }
  }, 30000);

  it('preserves FILE/QUIZ/native metadata and historical correction without broad byte authority', async () => {
    const course = await customerCourse(context, 'Portfolio source models');
    const assessment = await context.command('teacher', '/v1/assessments', { courseId: course.courseId, title: 'File source', instructions: 'Submit exact selected work.', maxScore: 10 });
    await context.command('teacher', '/v1/assessments/' + assessment.id + '/reference', { referenceId: context.referenceId, expectedPolicyVersion: 1 });
    const bytes = Buffer.from('Exact portfolio parity source. الإجابة الأصلية.');
    const digest = createHash('sha256').update(bytes).digest('hex');
    const asset = await context.command('strong', '/v1/assessments/' + assessment.id + '/work-assets', { name: 'Selected.txt', contentType: 'text/plain', byteSize: bytes.length, sha256: digest });
    await context.command('strong', '/v1/assessments/' + assessment.id + '/work-assets/' + asset.id + '/finalize', { contentBase64: bytes.toString('base64') });
    const storedObject = (await context.client.query('select object_path from app.private_assets where school_id=$1 and id=$2', [context.school, asset.id])).rows[0]?.object_path as string | undefined;
    expect(storedObject).toEqual(expect.any(String)); if (storedObject) createdObjects.add(storedObject);
    const document = await context.command('strong', '/v1/assessments/' + assessment.id + '/work-submissions', { responseKind: 'FILE', content: '', assetIds: [asset.id] });
    const documentMark = await context.command('teacher', '/v1/submissions/' + document.id + '/results', { score: 5, feedback: 'Actual selected document reviewed.', expectedPolicyVersion: 2, expectedRevision: 0, sourceEvidence: true });
    const documentResult = await context.command('teacher', '/v1/results/' + documentMark.id + '/release', { expectedRevision: 1, parentVisible: true });
    const documentItem = await context.command('strong', '/v1/portfolio/items', { sourceModel: 'numeric', evidenceId: documentResult.evidenceId, title: 'Exact FILE selection', reflection: 'The immutable manifest is selected.', assetIds: [asset.id] });
    await context.command('teacher', '/v1/portfolio/items/' + documentItem.id + '/review', { expectedRevision: 1, feedback: 'Reviewed selected document and reflection.', featured: false, parentVisible: true, confirmParentApproval: true, confirmSourceReview: true });
    expect((await parity('parent')).find(row => row.id === documentItem.id)).toMatchObject({ responseKind: 'FILE', artifactCount: 1, sourceWorkApproved: true });
    const bytePath = '/v1/portfolio/items/' + documentItem.id + '/revisions/' + documentItem.revisionId + '/artifacts/' + asset.id + '/download';
    expect((await context.request('parent', bytePath)).rawPayload.equals(bytes)).toBe(true);
    await context.command('strong', '/v1/assessments/' + assessment.id + '/work-assets/' + asset.id + '/retire', { reason: 'Explicit reviewed document retirement.', confirmRetirement: true });
    expect((await parity('parent')).find(row => row.id === documentItem.id)).toMatchObject({ responseKind: 'FILE', artifactCount: 1 });
    expect((await context.request('parent', bytePath)).statusCode).toBe(403);
    const quizAssessment = await context.command('teacher', '/v1/assessments', { courseId: course.courseId, title: 'Quiz portfolio source', instructions: 'Choose a checking step.', maxScore: 10 });
    await context.command('teacher', '/v1/assessments/' + quizAssessment.id + '/reference', { referenceId: context.referenceId, expectedPolicyVersion: 1 });
    const quiz = await context.command('teacher', '/v1/assessments/' + quizAssessment.id + '/quiz', { version: 'Quiz source v1', questions: [{ key: 'check', prompt: 'Check it?', options: [{ key: 'yes', label: 'Check' }, { key: 'no', label: 'Skip' }], correctOptionKey: 'yes' }] });
    await context.command('teacher', '/v1/assessments/' + quizAssessment.id + '/quiz/publish', { quizId: quiz.id, expectedPolicyVersion: 2 });
    const attempt = await context.command('observed', '/v1/assessments/' + quizAssessment.id + '/quiz/attempts', { quizId: quiz.id, answers: [{ questionKey: 'check', optionKey: 'yes' }] });
    const quizMark = await context.command('teacher', '/v1/submissions/' + attempt.submissionId + '/results', { score: 5, feedback: 'Human quiz source reviewed.', expectedPolicyVersion: 3, expectedRevision: 0, sourceEvidence: true });
    const quizResult = await context.command('teacher', '/v1/results/' + quizMark.id + '/release', { expectedRevision: 1, parentVisible: false });
    const quizItem = await context.command('observed', '/v1/portfolio/items', { sourceModel: 'numeric', evidenceId: quizResult.evidenceId, title: 'Selected quiz evidence', reflection: 'No raw quiz answer in list.' });
    expect((await parity('teacher')).find(row => row.id === quizItem.id)).toMatchObject({ submissionKind: 'QUIZ', responseKind: 'TEXT' });
    const rubric = await context.command('teacher', '/v1/rubrics', { courseId: course.courseId, title: 'Native portfolio criterion', version: 'native-v1', criteria: [{ key: 'check', title: 'Checking', levels: [{ key: 'shown', label: 'Shown', description: 'Show one check.' }] }] });
    const native = await context.command('teacher', '/v1/assessments', { courseId: course.courseId, title: 'Native portfolio task', instructions: 'Explain the checking step.', maxScore: 10 });
    await context.command('teacher', '/v1/assessments/' + native.id + '/rubric', { rubricId: rubric.id, expectedPolicyVersion: 1 });
    await context.command('teacher', '/v1/assessments/' + native.id + '/reference', { referenceId: context.referenceId, expectedPolicyVersion: 2 });
    const work = await context.command('observed', '/v1/assessments/' + native.id + '/submissions', { content: 'Native explanation.' });
    const mark = await context.command('teacher', '/v1/submissions/' + work.id + '/results', { nativeResult: { type: 'rubric', rubricId: rubric.id, criteria: [{ criterionKey: 'check', levelKey: 'shown' }] }, feedback: 'Human native review.', expectedPolicyVersion: 3, expectedRevision: 0, sourceEvidence: true });
    const result = await context.command('teacher', '/v1/results/' + mark.id + '/release', { expectedRevision: 1, parentVisible: false });
    const item = await context.command('observed', '/v1/portfolio/items', { sourceModel: 'rubric', evidenceId: result.evidenceId, title: 'Selected native work', reflection: 'Native criteria stay descriptors.' });
    expect((await parity('teacher')).find(row => row.id === item.id)).toMatchObject({ sourceModel: 'rubric', nativeResult: result.nativeResult, identity: { learnerName: 'Maha Hassan' } });
    await readFiveRoles();
  }, 60000);
});
