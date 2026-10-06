// Root promotes to apps/api/test/integration after source review. No runtime execution by the author.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createCustomerContext, customerActor, type CustomerContext } from './customer-test-context';

const sourceId = (index: number) => `19600000-0000-4000-8000-${String(index).padStart(12, '0')}`;
type Notice = { id: string; kind: string; title: string; revision?: number; readAt: string | null };
type Page = { items: Notice[]; nextCursor: string | null };
describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION !== '1')('current notification page under historical volume', () => {
 let context: CustomerContext;
 beforeAll(async () => { context = await createCustomerContext(); }, 60_000);
 beforeEach(async () => { await context.client.query('SAVEPOINT notification_page_case'); });
 afterEach(async () => { await context.client.query('ROLLBACK TO SAVEPOINT notification_page_case'); await context.client.query('RELEASE SAVEPOINT notification_page_case'); });
 afterAll(async () => { await context?.close(); });

 it('filters current denied sources before paging and expands only the selected exact revisions', async () => {
  await context.client.query(`insert into app.community_announcements(school_id,id,class_id,title,body,parent_visible,actor_id)
   select $1,('19600000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
    case when n between 151 and 300 then $3::uuid else $2::uuid end,
    'Synthetic notice '||n,'Private historical fixture body.',
    not(n<=150 or n between 461 and 470),$4::uuid from generate_series(1,1000)n`,
   [context.school,context.classId,context.secondClassId,customerActor(4)]);
  await context.client.query(`insert into app.community_announcement_revisions(school_id,announcement_id,revision,title,body,parent_visible,state,reason,actor_id)
   select $1,('19600000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,2,
    'Current notice '||n,'Exact reviewed revision.',n not between 451 and 460,
    case when n<=450 then 'WITHDRAWN' else 'PUBLISHED' end,
    'Explicit synthetic source revision.',$2 from generate_series(301,471)n`,[context.school,customerActor(4)]);
  await context.client.query('insert into app.community_notification_reads(school_id,announcement_id,actor_id)values($1,$2,$3)',[context.school,sourceId(471),customerActor(72)]);
  await context.client.query('insert into app.community_announcement_revision_reads(school_id,announcement_id,revision,actor_id)values($1,$2,2,$3)',[context.school,sourceId(472),customerActor(72)]);
  // A revision-1 receipt remains legitimate only for a revision-1 source.
  await context.client.query('insert into app.community_notification_reads(school_id,announcement_id,actor_id)values($1,$2,$3)',[context.school,sourceId(473),customerActor(72)]);
  const ids: string[] = []; const notices: Notice[] = []; const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
   const started=performance.now();
   const response=await context.request('parent',`/v1/community/notifications?limit=25${cursor?`&cursor=${cursor}`:''}`);
   expect(response.statusCode,response.body).toBe(200); expect(performance.now()-started).toBeLessThan(5000);
   expect(Buffer.byteLength(response.body)).toBeLessThan(500000);
   const page=response.json() as Page; expect(page.items.length).toBeLessThanOrEqual(25);
   if(page.nextCursor)expect(page.items).toHaveLength(25);
   ids.push(...page.items.map(item=>item.id)); notices.push(...page.items);
   cursor=page.nextCursor;
   if(cursor){expect(cursor).toBe(page.items.at(-1)?.id);expect(cursors.has(cursor)).toBe(false);cursors.add(cursor);}
  } while(cursor);
  expect(ids).toEqual(Array.from({length:540},(_,index)=>sourceId(index+461)));
  expect(new Set(ids).size).toBe(ids.length);
  expect(notices.find(item=>item.id===sourceId(461))).toMatchObject({title:'Current notice 461',revision:2,readAt:null});
  expect(notices.find(item=>item.id===sourceId(471))).toMatchObject({title:'Current notice 471',revision:2,readAt:null});
  // A receipt with another revision cannot mark the original current revision read.
  expect(notices.find(item=>item.id===sourceId(472))?.readAt).toBeNull();
  expect(notices.find(item=>item.id===sourceId(473))?.readAt).toEqual(expect.any(String));
  expect(notices.every(item=>item.kind==='ANNOUNCEMENT'&&!('body'in item)&&!('canManage'in item))).toBe(true);
  for(let sample=0;sample<7;sample++){
   const started=performance.now();const response=await context.request('parent','/v1/community/notifications?limit=25');
   expect(response.statusCode,response.body).toBe(200);expect(performance.now()-started).toBeLessThan(5000);
  }
  expect((await context.request('parent',`/v1/community/announcements/${sourceId(1)}`)).statusCode).toBe(403);
  expect((await context.request('parent',`/v1/community/announcements/${sourceId(151)}`)).statusCode).toBe(403);
  expect((await context.request('parent',`/v1/community/announcements/${sourceId(301)}`)).statusCode).toBe(403);
  await context.client.query("update app.parent_relationships set status='revoked' where school_id=$1 and parent_actor_id=$2",[context.school,customerActor(72)]);
  const revoked=await context.request('parent','/v1/community/notifications?limit=25');expect(revoked.statusCode).toBe(200);expect(revoked.json()).toEqual({items:[],nextCursor:null});
  const grants=await context.client.query(`select
   has_function_privilege('cuevo_api','internal.read_community_notifications(integer,uuid)','execute') raw_helper,
   has_function_privilege('authenticated','internal.read_community_notifications(integer,uuid)','execute') browser_helper,
   has_table_privilege('cuevo_api','app.community_announcements','select') raw_source`);
  expect(grants.rows[0]).toEqual({raw_helper:false,browser_helper:false,raw_source:false});
 },60_000);

 it('merges real announcement and mention source identities before one global cursor and removes hidden mentions',async()=>{
  const room=await context.command('teacher','/v1/community/rooms',{classId:context.classId,name:'Mixed source group',type:'GROUP',memberIds:[customerActor(12),customerActor(13)]});
  const announcements:string[]=[];
  for(let index=0;index<5;index++){
   const notice=await context.command('teacher','/v1/community/announcements',{classId:context.classId,title:`School announcement ${index}`,body:'Approved exact source.',parentVisible:true});announcements.push(notice.id);
  }
  const post=await context.command('strong',`/v1/community/rooms/${room.id}/posts`,{body:'Review this school explanation.',replyToId:null,mentionActorIds:[customerActor(13)]});
  const mention=(await context.client.query('select id from app.community_post_mentions where school_id=$1 and post_id=$2 and recipient_id=$3',[context.school,post.id,customerActor(13)])).rows[0].id as string;
  await context.command('observed',`/v1/community/mentions/${mention}/read`,{});
  await context.command('teacher',`/v1/community/groups/${room.id}/lifecycle`,{name:'Current mixed source group',state:'ACTIVE',expectedRevision:1,reason:'Teacher reviews current group title.',confirmChange:true});
  const ids:string[]=[];let cursor:string|null=null;let mentionNotice:Notice|undefined;
  do{
   const response=await context.request('observed',`/v1/community/notifications?limit=1${cursor?`&cursor=${cursor}`:''}`);expect(response.statusCode,response.body).toBe(200);
   const page=response.json() as Page;expect(page.items).toHaveLength(1);ids.push(page.items[0].id);
   if(page.items[0].id===mention)mentionNotice=page.items[0];cursor=page.nextCursor;
   if(cursor)expect(cursor).toBe(page.items[0].id);
  }while(cursor);
  expect(ids).toEqual([...announcements,mention].sort());expect(new Set(ids).size).toBe(6);
  expect(mentionNotice).toMatchObject({id:mention,kind:'MENTION',title:'Current mixed source group',readAt:expect.any(String)});
  const parent=await context.request('parent','/v1/community/notifications?limit=100');expect(parent.statusCode).toBe(200);expect(parent.json().items.map((item:Notice)=>item.id)).toEqual([...announcements].sort());
  expect((await context.request('parent',`/v1/community/mentions/${mention}/source`)).statusCode).toBe(403);
  await context.command('teacher',`/v1/community/posts/${post.id}/moderate`,{action:'HIDE',reason:'Teacher hides the exact source.',confirmModeration:true});
  const hidden=await context.request('observed','/v1/community/notifications?limit=100');expect(hidden.statusCode).toBe(200);expect(hidden.json().items.map((item:Notice)=>item.id)).toEqual([...announcements].sort());
  expect((await context.request('observed',`/v1/community/mentions/${mention}/source`)).statusCode).toBe(403);
 });
});
