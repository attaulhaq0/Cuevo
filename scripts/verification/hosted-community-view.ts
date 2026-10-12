import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalReleaseExecutionJson } from './release-review';
import { hostedCommandJournalContracts } from './hosted-command-journal-contracts';

const digest=z.string().regex(/^[a-f0-9]{64}$/),uuid=z.uuid(),date=z.iso.datetime({offset:true});
const count=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const identitySchema=hostedCommandJournalContracts('community').originalSchema.shape.identity;
const stage=z.enum(['GROUP_READY','DISCUSSION_READY','READ_ONLY_DISCUSSION','MODERATION_RESTORED','FAMILY_NOTIFICATION_READ','RETIREMENT_CONFIRMED']);
const definitions=[
 {stage:'GROUP_READY',role:'teacher',scopeGeneration:1,confirmedCommandCount:1},
 {stage:'DISCUSSION_READY',role:'student',scopeGeneration:3,confirmedCommandCount:5},
 {stage:'READ_ONLY_DISCUSSION',role:'student',scopeGeneration:7,confirmedCommandCount:10},
 {stage:'MODERATION_RESTORED',role:'teacher',scopeGeneration:9,confirmedCommandCount:13},
 {stage:'FAMILY_NOTIFICATION_READ',role:'parent',scopeGeneration:11,confirmedCommandCount:15},
 {stage:'RETIREMENT_CONFIRMED',role:'teacher',scopeGeneration:13,confirmedCommandCount:18},
] as const;
export const hostedCommunityViewStages=Object.freeze(definitions.map(row=>Object.freeze({...row})));
const customerLabel=z.string().trim().min(1).max(500).refine(value=>!/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}|\b[a-f0-9]{40,64}\b/i.test(value)&&![...value].some(character=>character.charCodeAt(0)<32||character.charCodeAt(0)===127));
// Closed recipe labels copied from their current owners. Shared verification
// cannot import application implementation; browser tests use literal oracles.
const labels={en:{refresh:'Refresh community',back:'Back to rooms',connected:'Private updates connected',members:'Group members',actor:'Member',membershipStatus:'Membership status',confirmModeration:'I approve this moderation action',post:'Post to room',message:'Message',reply:'Reply',report:'Report post',reason:'Reason',cancel:'Cancel',readonly:'Your current access permits reading only.',reports:'Reported content',reportedMessage:'Reported message',reportReview:'Review this report',read:'Read',notifications:'Notifications',closeAnnouncement:'Close announcement',openAnnouncement:'Open announcement',empty:'No permitted community records are available.',createAnnouncement:'Publish announcement',rooms:'Class rooms and groups',openRoom:'Open discussion',closedNote:'This group is closed. Current members can read permitted history; new discussion is paused.',announcements:'Announcements'},
 ar:{refresh:'تحديث المجتمع',back:'العودة إلى الغرف',connected:'تم الاتصال بالتحديثات الخاصة',members:'أعضاء المجموعة',actor:'العضو',membershipStatus:'حالة العضوية',confirmModeration:'أوافق على إجراء الإشراف هذا',post:'النشر في الغرفة',message:'الرسالة',reply:'رد',report:'الإبلاغ عن المنشور',reason:'السبب',cancel:'إلغاء',readonly:'تسمح صلاحياتك الحالية بالقراءة فقط.',reports:'المحتوى المُبلَّغ عنه',reportedMessage:'الرسالة المبلّغ عنها',reportReview:'مراجعة هذا البلاغ',read:'مقروء',notifications:'الإشعارات',closeAnnouncement:'إغلاق الإعلان',openAnnouncement:'فتح الإعلان',empty:'لا تتاح سجلات مجتمع ضمن الصلاحيات.',createAnnouncement:'نشر إعلان',rooms:'غرف الصف والمجموعات',openRoom:'فتح النقاش',closedNote:'هذه المجموعة مغلقة. يمكن للأعضاء الحاليين قراءة السجل المسموح؛ النقاش الجديد متوقف.',announcements:'الإعلانات'}} as const;
function expectedLabels(viewStage:z.infer<typeof stage>,locale:'en'|'ar'){
 const t=labels[locale],common=[t.refresh,t.back,t.connected];
 const controls=viewStage==='GROUP_READY'?[...common,t.members,t.actor,t.membershipStatus,t.confirmModeration]:viewStage==='DISCUSSION_READY'?[...common,t.post,t.message,t.reply,t.report,t.reason,t.cancel]
  :viewStage==='READ_ONLY_DISCUSSION'?[...common,t.readonly]:viewStage==='MODERATION_RESTORED'?[...common,t.reports,t.reportedMessage,t.reportReview,t.reason,t.cancel]
  :viewStage==='FAMILY_NOTIFICATION_READ'?[t.refresh,t.read,t.notifications,t.closeAnnouncement,t.openAnnouncement]:[t.refresh,t.empty,t.createAnnouncement,t.rooms,t.openRoom,t.closedNote,t.back,t.announcements];
 return{heading:viewStage==='FAMILY_NOTIFICATION_READ'?t.notifications:viewStage==='RETIREMENT_CONFIRMED'?t.announcements:'Checking our learning together',controls,
  keyboardControl:viewStage==='DISCUSSION_READY'?t.report:viewStage==='MODERATION_RESTORED'?t.reportReview:viewStage==='FAMILY_NOTIFICATION_READ'?t.closeAnnouncement:t.refresh};
}
const receiptSchema=z.object({version:z.literal(1),stage,role:z.enum(['teacher','student','parent']),locale:z.enum(['en','ar']),
 viewport:z.object({width:count,height:count}).strict(),identity:identitySchema,scopeGeneration:z.number().int().positive().max(13),journalHeadSha256:digest,sourceSha256:digest,observedAt:date,
 heading:customerLabel,controls:z.array(customerLabel).min(1).max(30).refine(rows=>new Set(rows).size===rows.length),keyboardControl:customerLabel,keyboardVerified:z.literal(true),
 axe:z.object({completed:z.literal(true),violations:z.literal(0)}).strict(),reflow:z.object({horizontalOverflow:z.literal(false),text200Percent:z.boolean()}).strict(),reducedMotion:z.literal(true),
 nativeExecutionVerified:z.literal(false),hostedAcceptance:z.literal(false),customerReady:z.literal(false)}).strict().superRefine((row,context)=>{
 const expected=expectedLabels(row.stage,row.locale);if(row.heading!==expected.heading||canonicalReleaseExecutionJson(row.controls)!==canonicalReleaseExecutionJson(expected.controls)||row.keyboardControl!==expected.keyboardControl)context.addIssue({code:'custom',message:'Only actually observed closed recipe labels belong in view receipts.'});
});
const observationsSchema=z.array(receiptSchema).max(12);
const expectedSchema=z.object({identity:identitySchema,groupId:uuid,postIds:z.array(uuid).length(2).refine(rows=>new Set(rows).size===rows.length),announcementId:uuid,
 journalHeads:z.array(z.object({confirmedCommandCount:count,journalHeadSha256:digest}).strict()).length(6),observedAfter:date,observedBefore:date}).strict();
export type HostedCommunityViewReceipt=z.infer<typeof receiptSchema>;
export type HostedCommunityViewExpected=z.infer<typeof expectedSchema>;
const hash=(value:unknown)=>createHash('sha256').update(canonicalReleaseExecutionJson(value)).digest('hex');
const fail=()=>Error('Community view observations require review; private contents withheld.');

/** Parse bounded supplied observations, including a partial failed run. Parsing
 * never establishes native execution, a completed inventory or hosted acceptance. */
export function parseHostedCommunityViewObservations(value:unknown):HostedCommunityViewReceipt[]{
 try{return observationsSchema.parse(JSON.parse(canonicalReleaseExecutionJson(value)));}catch{throw fail();}
}

/** Bind the closed bilingual inventory to independently selected original command
 * boundaries. Current actor/source checks and actual scans belong to the browser
 * producer; these supplied receipts cannot authorize a command or provider effect. */
export function validateHostedCommunityViewCompletion(value:unknown,expectedValue:unknown):HostedCommunityViewReceipt[]{
 try{
  const rows=parseHostedCommunityViewObservations(value),expected=expectedSchema.parse(JSON.parse(canonicalReleaseExecutionJson(expectedValue)));
  const after=Date.parse(expected.observedAfter),before=Date.parse(expected.observedBefore);let previous=after;
  if(rows.length!==12||before<after||expected.journalHeads.some((row,index)=>row.confirmedCommandCount!==definitions[index].confirmedCommandCount))throw fail();
  for(const[index,row]of rows.entries()){
   const definition=definitions[Math.floor(index/2)],locale=index%2===0?'en':'ar',viewport=locale==='en'?{width:1366,height:900}:{width:390,height:844};
   const source={groupId:expected.groupId,postIds:definition.confirmedCommandCount===1?[]:expected.postIds,announcementId:definition.confirmedCommandCount<15?'':expected.announcementId};
   const observed=Date.parse(row.observedAt);
   if(row.stage!==definition.stage||row.role!==definition.role||row.scopeGeneration!==definition.scopeGeneration||row.locale!==locale
    ||canonicalReleaseExecutionJson(row.viewport)!==canonicalReleaseExecutionJson(viewport)||canonicalReleaseExecutionJson(row.identity)!==canonicalReleaseExecutionJson(expected.identity)
    ||row.journalHeadSha256!==expected.journalHeads[Math.floor(index/2)].journalHeadSha256||row.sourceSha256!==hash(source)
    ||observed<previous||observed>before||!row.controls.includes(row.keyboardControl)
    ||row.reflow.text200Percent!==(definition.stage==='DISCUSSION_READY'||definition.stage==='FAMILY_NOTIFICATION_READ'))throw fail();
   previous=observed;
  }
  return rows;
 }catch{throw fail();}
}
