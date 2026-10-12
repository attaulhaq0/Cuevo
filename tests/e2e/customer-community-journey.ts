import { expect, type Locator, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { membershipSchema, type MembershipResponse } from '@cuevo/contracts';
import { z } from 'zod';
import { confirmCommunityReceipt, parseRoom, parseRosterPerson, parseAnnouncement, type Room, type Announcement } from '../../apps/web/features/community/model';
import { observeCustomerLearningLoopMutation, type CustomerLearningLoopActor, type CustomerLearningLoopCommandObservation, type CustomerLearningLoopMutationIntent, type CustomerLearningLoopReceipt } from './customer-learning-loop';
import { expectTrailWorkspace, openTrailWorkspace, signOutTrailWorkspace } from './trail-workspace';
import { selectHumanChoice } from './human-choice';

export type CustomerCommunityRole = 'teacher' | 'student' | 'parent';
export type CustomerCommunityActor = CustomerLearningLoopActor & { role: CustomerCommunityRole };
export type CustomerCommunityAccount = CustomerCommunityActor & { password: string };
export type CustomerCommunityJourneyContent = {
  postBody: string; secondPostBody: string; replyBody: string; replyDraftOther: string; reportReason: string;
  muteReason: string; unmuteReason: string; hideReason: string; restoreReason: string; announcementTitle: string; announcementBody: string;
};
export type CustomerCommunityJourneyInput = {
  webOrigin: string; apiOrigin: string; title: string; content?: CustomerCommunityJourneyContent;
  retirement?: {groupClosureReason:string;announcementWithdrawalReason:string};
  actors: { teacher: CustomerCommunityAccount; student: CustomerCommunityAccount; parent: CustomerCommunityAccount };
  peer: CustomerLearningLoopActor & { role: 'student' };
  context: { schoolId: string; classId: string; classLabel: string; classRoom: { id: string; name: string } | null };
};
export type CustomerCommunityControls = {
  visibleMutation: (action: string, path: string, activate: () => Promise<void>) => Promise<CustomerLearningLoopReceipt>;
  currentClassRoom: () => Promise<Room | null>;
};
/** Local transport injection only. Hosted admission owns all forwarding. */
export type CustomerCommunityHeldReaction = {
  committed: Promise<void>; handled: Promise<void>; keys: string[]; release: () => void; dispose: () => Promise<void>;
};
export type CustomerCommunityPeerMembershipMilestone = Readonly<{ groupId: string; memberChangeId: string; peerActorId: string }>;
export type CustomerCommunityViewStage='GROUP_READY'|'DISCUSSION_READY'|'READ_ONLY_DISCUSSION'|'MODERATION_RESTORED'|'FAMILY_NOTIFICATION_READ'|'RETIREMENT_CONFIRMED';
export type CustomerCommunityViewCheckpoint=Readonly<{stage:CustomerCommunityViewStage;role:CustomerCommunityRole;groupId:string;postIds:readonly string[];announcementId:string;scopeGeneration:number}>;
/** Closed diagnostic metadata only; it never supplies source or effect authority. */
export type CustomerCommunityReadFailureDiagnostic = Readonly<{
  reason: 'UNSETTLED' | 'REQUEST_FAILED' | 'RESPONSE_UNVERIFIED';
  source: 'ME' | 'ROOM_DIRECTORY' | 'ANNOUNCEMENT_DIRECTORY' | 'CLASS_ROSTER' | 'GROUP_ROSTER' | 'OTHER_ROSTER';
  role: CustomerCommunityRole; generation: number; confirmedWriteCount: number;
  cancelled: boolean; parsed: boolean; hasCursor: boolean; elapsedMs: number; pendingReadCount: number;
}>;
export type CustomerCommunityFailureDiagnostic = Readonly<{ schemaVersion: '1'; code: 'COMMUNITY_CURRENT_SOURCE_UNVERIFIED'; confirmedWriteCount: number; read: CustomerCommunityReadFailureDiagnostic | null }>;
export type CustomerCommunityJourneyPorts = {
  step?: (name: string, work: () => Promise<void>) => Promise<void>;
  capture?: (name: string) => Promise<void>;
  normalAuth?: (account: Readonly<CustomerCommunityAccount>) => Promise<MembershipResponse>;
  sessionStarting?: (actor: Readonly<CustomerCommunityActor>) => Promise<void>;
  sessionStarted?: (actor: Readonly<CustomerCommunityActor>, membership: MembershipResponse) => Promise<void>;
  sessionEnded?: (actor: Readonly<CustomerCommunityActor>) => Promise<void>;
  beforeMutation?: (intent: CustomerLearningLoopMutationIntent) => Promise<void>;
  /** The Request is transient correlation evidence; consumers must never serialize its headers. */
  onCommand?: (observation: CustomerLearningLoopCommandObservation) => Promise<void>;
  /** Original receipt milestones permit an auxiliary read-only peer observer.
   * They issue no additional journey command or actor session. */
  peerMembershipAdded?: (source: CustomerCommunityPeerMembershipMilestone) => Promise<void>;
  peerMembershipRevoked?: (source: CustomerCommunityPeerMembershipMilestone) => Promise<void>;
  /** Current read-only observations never create another command or session. */
  observeView?: (checkpoint:CustomerCommunityViewCheckpoint)=>Promise<void>;
  prepareClassRoom?: (controls: CustomerCommunityControls) => Promise<{ id: string; name: string }>;
  holdReaction?: (path: string) => Promise<CustomerCommunityHeldReaction>;
  beforeRetirement?: (observation: Readonly<CustomerCommunityJourneyObservation>) => Promise<void>;
  verifyQuality?: () => Promise<void>;
  cleanup?: (observation: Readonly<CustomerCommunityJourneyObservation>) => Promise<void>;
  /** A failed journey may export only this minimized snapshot after cleanup. */
  captureFailure?: (diagnostic: CustomerCommunityFailureDiagnostic) => Promise<void>;
};
export type CustomerCommunityJourneyObservation = {
  groupId: string; postIds: string[]; replyId: string; reportId: string; membershipChangeIds: string[]; announcementId: string;
  writes: { action: string; path: string; actorId: string; scopeGeneration: number; status: number; id: string; key: string; keySha256: string; requestSha256: string; bodySha256: string; receiptSha256: string }[];
  sessionStartedCount: number; sessionEndedCount: number; cleanupCount: number;
  retirement: {status:'NOT_REQUESTED'|'CONFIRMED_UI_ONLY';groupClosed:boolean;announcementWithdrawn:boolean;mainMemberRevoked:boolean;referenceRestored:false};
  nativeChainVerified: false; hostedAcceptance: false; customerReady: false;
};
const contentSchema=z.object({postBody:z.string().trim().min(1).max(4000),secondPostBody:z.string().trim().min(1).max(4000),replyBody:z.string().trim().min(1).max(4000),replyDraftOther:z.string().trim().min(1).max(4000),reportReason:z.string().trim().min(1).max(1000),muteReason:z.string().trim().min(1).max(1000),unmuteReason:z.string().trim().min(1).max(1000),hideReason:z.string().trim().min(1).max(1000),restoreReason:z.string().trim().min(1).max(1000),announcementTitle:z.string().trim().min(1).max(200),announcementBody:z.string().trim().min(1).max(4000)}).strict();
const actorSchema = z.object({ role: z.enum(['teacher','student','parent']), actorId: z.uuid(), schoolId: z.uuid(), email: z.email(), displayName: z.string().trim().min(1).max(1000) }).strict();
function validateInput(value: CustomerCommunityJourneyInput): CustomerCommunityJourneyInput {
  const account = actorSchema.extend({ password: z.string().min(1).max(128) });
  const origin = z.string().url().refine(value => new URL(value).origin === value && !new URL(value).username && !new URL(value).password);
  const input = z.object({ webOrigin: origin, apiOrigin: origin, title: z.string().trim().min(1).max(150), content:contentSchema.optional(), retirement:z.object({groupClosureReason:z.string().trim().min(1).max(1000),announcementWithdrawalReason:z.string().trim().min(1).max(1000)}).strict().optional(), actors: z.object({ teacher: account, student: account, parent: account }).strict(), peer: actorSchema, context: z.object({ schoolId: z.uuid(), classId: z.uuid(), classLabel: z.string().trim().min(1).max(1000), classRoom: z.object({ id: z.uuid(), name: z.string().trim().min(1).max(200) }).strict().nullable() }).strict() }).strict().parse(value);
  const actors = Object.values(input.actors);
  if (input.actors.teacher.role !== 'teacher' || input.actors.student.role !== 'student' || input.actors.parent.role !== 'parent' || input.peer.role !== 'student' || new Set([...actors,input.peer].map(actor=>actor.actorId)).size !== 4 || new Set([...actors,input.peer].map(actor=>actor.email)).size !== 4 || [...actors,input.peer].some(actor=>actor.schoolId !== input.context.schoolId)) throw Error('The exact selected Community actors require review.');
  return input as CustomerCommunityJourneyInput;
}
const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
async function settled(page: Page) { await expect(page.locator('main [role="status"]').filter({ hasText: /^(Loading|جارٍ تحميل)/ })).toHaveCount(0); }

/** Existing visible Community recipe; input supplies identities, ports supply observations, never product authority. */
export async function runCustomerCommunityJourney(page: Page, input: CustomerCommunityJourneyInput, ports: CustomerCommunityJourneyPorts = {}): Promise<CustomerCommunityJourneyObservation> {
  input = validateInput(input);
  if (!input.context.classRoom && !ports.prepareClassRoom) throw Error('An exact admitted class discussion is required before the Community journey.');
  if(input.retirement&&!ports.beforeRetirement)throw Error('Current native object ownership is required before Community retirement.');
  page.setDefaultTimeout(15000);
  const apiOrigin = input.apiOrigin, title = input.title, studentName = input.actors.student.displayName, otherName = input.peer.displayName;
  const observation: CustomerCommunityJourneyObservation = { groupId:'',postIds:[],replyId:'',reportId:'',membershipChangeIds:[],announcementId:'',writes:[],sessionStartedCount:0,sessionEndedCount:0,cleanupCount:0,retirement:{status:'NOT_REQUESTED',groupClosed:false,announcementWithdrawn:false,mainMemberRevoked:false,referenceRestored:false},nativeChainVerified:false,hostedAcceptance:false,customerReady:false };
  const content=input.content??{postBody:'I checked the example by explaining each step.',secondPostBody:'A second example checks each step in another order.',replyBody:'My checking step uses the same school example.',replyDraftOther:'This reply belongs to the second example.',reportReason:'Please review this school example.',muteReason:'Temporary moderated practice pause.',unmuteReason:'Staff restored normal group participation.',hideReason:'Staff hides the example during review.',restoreReason:'Staff completes review and restores the source.',announcementTitle:title+' family update',announcementBody:'School-reviewed class practice is ready.'};
  const writes = observation.writes;
  let currentActor: Readonly<CustomerCommunityActor> | null = null, scopeGeneration = 0, scopeFailure: unknown;
  let admittedClassRoomId = input.context.classRoom?.id;
  let failedRead: CustomerCommunityReadFailureDiagnostic | null = null;
  let roomFacts = new Map<string, Room>();
  let announcementFacts=new Map<string,Announcement>();let confirmedMainRestriction:string|undefined;
  const rosterFacts = new Map<string, {id:string;displayName:string;role:string}[]>();
  const pendingReads = new Set<Promise<void>>();
  type ReadSnapshot={actor:Readonly<CustomerCommunityActor>;generation:number;authorization:string|undefined;school:string|undefined;key:string;path:string;cursor:string|null;nextCursor:string|null|undefined;retired:boolean;parsed:boolean;startedAt:number;cancelled:boolean;settled:Promise<void>;resolve:()=>void;timer:ReturnType<typeof setTimeout>};
  let enteringHome: {actor:Readonly<CustomerCommunityActor>;generation:number;homeReads:Set<ReadSnapshot>;expected:Set<string>;fresh:Map<string,ReadSnapshot>;ready:()=>void}|null=null;
  const readRequests=new WeakMap<import('@playwright/test').Request,ReadSnapshot>(),latestReads=new Map<string,ReadSnapshot>();
  const pageFacts=new Map<string,{path:string;cursor:string|null;rooms?:Room[];announcements?:Announcement[];roster?:{id:string;displayName:string;role:string}[]}>();
  const observedPath=(path:string)=>['/v1/me','/v1/community/rooms','/v1/community/announcements'].includes(path)||/^\/v1\/community\/rooms\/[^/]+\/roster$/.test(path);
  const currentReadRequest=(request:import('@playwright/test').Request)=>request.method()==='GET'&&new URL(request.url()).origin===apiOrigin;
  const retire=(snapshot:ReadSnapshot)=>{snapshot.retired=true;clearTimeout(snapshot.timer);snapshot.resolve();};
  const resetReads=()=>{for(const snapshot of latestReads.values())retire(snapshot);latestReads.clear();pageFacts.clear();};
  const sameEpoch=(snapshot:ReadSnapshot)=>currentActor===snapshot.actor&&scopeGeneration===snapshot.generation;
  const currentSnapshot=(snapshot:ReadSnapshot)=>sameEpoch(snapshot)&&!snapshot.retired&&latestReads.get(snapshot.key)===snapshot;
  const readFailure=(snapshot:ReadSnapshot,error:unknown,reason:CustomerCommunityReadFailureDiagnostic['reason'])=>{if(currentSnapshot(snapshot)){
    const source: CustomerCommunityReadFailureDiagnostic['source'] = snapshot.path === '/v1/me' ? 'ME' : snapshot.path === '/v1/community/rooms' ? 'ROOM_DIRECTORY' : snapshot.path === '/v1/community/announcements' ? 'ANNOUNCEMENT_DIRECTORY' : admittedClassRoomId && snapshot.path === `/v1/community/rooms/${admittedClassRoomId}/roster` ? 'CLASS_ROSTER' : observation.groupId && snapshot.path === `/v1/community/rooms/${observation.groupId}/roster` ? 'GROUP_ROSTER' : 'OTHER_ROSTER';
    failedRead ??= Object.freeze({reason,source,role:snapshot.actor.role,generation:snapshot.generation,confirmedWriteCount:writes.length,cancelled:snapshot.cancelled,parsed:snapshot.parsed,hasCursor:snapshot.cursor!==null,elapsedMs:Math.max(0,Date.now()-snapshot.startedAt),pendingReadCount:pendingReads.size});
    scopeFailure=error;scopeGeneration++;
  }clearTimeout(snapshot.timer);snapshot.resolve();};
  const requestObserver=(request:import('@playwright/test').Request)=>{
    if(!currentActor||!currentReadRequest(request))return;const url=new URL(request.url());if(!observedPath(url.pathname))return;
    const headers=request.headers(),key=url.pathname+url.search;let resolve!:()=>void;const settledRead=new Promise<void>(done=>resolve=done);
    const snapshot:ReadSnapshot={actor:currentActor,generation:scopeGeneration,authorization:headers.authorization,school:headers['x-school-id'],key,path:url.pathname,cursor:url.searchParams.get('cursor'),nextCursor:undefined,retired:false,parsed:false,startedAt:Date.now(),cancelled:false,settled:settledRead,resolve,timer:setTimeout(()=>readFailure(snapshot,Error('The current Community source did not settle.'),'UNSETTLED'),15000)};
    const previous=latestReads.get(key);if(previous)retire(previous);
    pageFacts.delete(key);
    if(snapshot.cursor===null&&snapshot.path!=='/v1/me'){
      for(const prior of latestReads.values())if(prior.path===snapshot.path&&prior.cursor!==null)retire(prior);
      for(const[key,page]of pageFacts)if(page.path===snapshot.path)pageFacts.delete(key);
    }
    latestReads.set(key,snapshot);readRequests.set(request,snapshot);pendingReads.add(settledRead);void settledRead.finally(()=>pendingReads.delete(settledRead));
    if(enteringHome&&sameEpoch(snapshot)&&snapshot.actor===enteringHome.actor&&snapshot.generation===enteringHome.generation){
      if(key==='/v1/community/announcements?limit=25')enteringHome.homeReads.add(snapshot);
      if(enteringHome.expected.has(key)){enteringHome.fresh.set(key,snapshot);if([...enteringHome.expected].every(key=>enteringHome!.fresh.has(key)))enteringHome.ready();}
    }
  };
  const requestFailedObserver=(request:import('@playwright/test').Request)=>{
    const snapshot=readRequests.get(request);if(!snapshot)return;snapshot.cancelled=request.failure()?.errorText==='net::ERR_ABORTED';
    // A real browser cancellation can precede its replacement request event.
    // Keep this query unknown within its original deadline; only a new exact
    // query or session retirement settles it without a positive observation.
    if(currentSnapshot(snapshot)&&request.failure()?.errorText==='net::ERR_ABORTED')return;
    readFailure(snapshot,Error('The current Community source request failed.'),'REQUEST_FAILED');
  };
  page.on('request',requestObserver);
  page.on('requestfailed',requestFailedObserver);
  const responseObserver = (response: import('@playwright/test').Response) => {
    if (response.request().method() !== 'GET' || new URL(response.url()).origin !== apiOrigin) return;
    const original=response.request(),snapshot=readRequests.get(original);if(!snapshot||!currentSnapshot(snapshot)||snapshot.parsed)return;
    const path = new URL(original.url()).pathname, actor = snapshot.actor;
    if ( !['/v1/me','/v1/community/rooms','/v1/community/announcements'].includes(path)&&!/^\/v1\/community\/rooms\/[^/]+\/roster$/.test(path)) return;
    let cancelledBodyPending=false;
    const read = (async()=>{
      const validHeaders=()=>{const headers=original.headers();if(original.url()!==apiOrigin+snapshot.key||headers.authorization!==snapshot.authorization||headers['x-school-id']!==snapshot.school||snapshot.school!==undefined&&snapshot.school!==actor.schoolId)throw Error('The original Community read identity changed.');};validHeaders();
      if (response.status() !== 200) throw Error('The current Community source could not be confirmed.');
      let value:unknown;
      try{value=await response.json();}catch(error){if(currentSnapshot(snapshot)&&snapshot.cancelled){cancelledBodyPending=true;return;}throw error;}
      if (!currentSnapshot(snapshot)) return;validHeaders();
      if (path === '/v1/me') { const membership = membershipSchema.parse(value); expect(membership).toMatchObject({ userId:actor.actorId,schoolId:actor.schoolId,role:actor.role,displayName:actor.displayName }); expect(membership.school.id).toBe(actor.schoolId); }
      else {
        const source=z.object({items:z.array(z.unknown()).max(100),nextCursor:z.uuid().nullable()}).strict().parse(value);
        snapshot.nextCursor=source.nextCursor;
        if(path==='/v1/community/announcements')pageFacts.set(snapshot.key,{path,cursor:snapshot.cursor,announcements:source.items.map(parseAnnouncement)});
        else if(path.endsWith('/roster'))pageFacts.set(snapshot.key,{path,cursor:snapshot.cursor,roster:source.items.map(parseRosterPerson)});
        else pageFacts.set(snapshot.key,{path,cursor:snapshot.cursor,rooms:source.items.map(parseRoom)});
        const pages=[...pageFacts.values()].filter(page=>page.path===path);
        if(path==='/v1/community/announcements')announcementFacts=new Map(pages.flatMap(page=>page.announcements??[]).map(row=>[row.id,row]));
        else if(path.endsWith('/roster'))rosterFacts.set(path,pages.flatMap(page=>page.roster??[]));
        else roomFacts=new Map(pages.flatMap(page=>page.rooms??[]).map(row=>[row.id,row]));
      }
      snapshot.parsed=true;
    })().catch(error=>{readFailure(snapshot,error,'RESPONSE_UNVERIFIED');}).finally(()=>{
      // A cancelled current body supplies no source proof. Keep its original
      // deadline until an exact replacement or session retirement settles it.
      if(currentSnapshot(snapshot)&&cancelledBodyPending&&!snapshot.parsed)return;
      clearTimeout(snapshot.timer);snapshot.resolve();
    });
    void read;
  };
  page.on('response',responseObserver);
  async function currentReads() { while(pendingReads.size){await Promise.all([...pendingReads]);if(scopeFailure)throw scopeFailure;}if(scopeFailure)throw scopeFailure; }
  async function signIn(role: CustomerCommunityRole) {
    if(currentActor)throw Error('The previous Community session must be signed out first.');
    const account=input.actors[role],actor=Object.freeze({role:account.role,actorId:account.actorId,schoolId:account.schoolId,email:account.email,displayName:account.displayName});
    resetReads();currentActor=actor;scopeGeneration++;scopeFailure=undefined;roomFacts=new Map();announcementFacts=new Map();rosterFacts.clear();await ports.sessionStarting?.(actor);
    let membership: MembershipResponse;
    if(ports.normalAuth) membership=membershipSchema.parse(await ports.normalAuth(Object.freeze({...account})));
    else {
      await page.goto(input.webOrigin+'/');await page.getByRole('button',{name:'English',exact:true}).click();await page.getByLabel('School email',{exact:true}).fill(account.email);await page.getByLabel('Password',{exact:true}).fill(account.password);
      const source=page.waitForResponse(response=>response.url()===apiOrigin+'/v1/me'&&response.request().method()==='GET');await page.getByRole('button',{name:'Sign in',exact:true}).click();const response=await source;expect(response.status()).toBe(200);membership=membershipSchema.parse(await response.json());
    }
    expect(membership).toMatchObject({userId:actor.actorId,schoolId:actor.schoolId,role:actor.role,displayName:actor.displayName});expect(membership.school.id).toBe(actor.schoolId);expect(membership.entitlements).toContain('community');await expectTrailWorkspace(page,role);await expect(page.locator('.workspace-chrome__person > button strong')).toHaveText(actor.displayName);await ports.sessionStarted?.(actor,membership);observation.sessionStartedCount++;
    const home=page.locator('.workspace-chrome__navigation [data-workspace-destination="overview"][aria-current="page"]');
    if(await home.count()){
      await expect(home).toHaveCount(1);await expect(page.locator('.workspace-chrome')).toHaveAttribute('data-navigation-mode','home');const generation=scopeGeneration;
      const homeReads=new Set([...latestReads.values()].filter(snapshot=>currentSnapshot(snapshot)&&snapshot.key==='/v1/community/announcements?limit=25'));
      let complete!:(value:boolean)=>void;const ready=new Promise<boolean>(done=>complete=done),timer=setTimeout(()=>complete(false),15000);
      const transition={actor,generation,homeReads,expected:new Set(role==='parent'?['/v1/community/announcements?limit=100']:['/v1/community/announcements?limit=100','/v1/community/rooms?limit=100']),fresh:new Map<string,ReadSnapshot>(),ready:()=>complete(true)};
      enteringHome=transition;
      try{
        await openTrailWorkspace(page,'Community');await expect(page.locator('.community-workspace')).toHaveCount(1);await expect(page.locator('.workspace-chrome')).toHaveAttribute('data-navigation-mode','focused');await expect(page.locator('[data-workspace-destination="community"][aria-current="page"]')).toHaveCount(1);await expect(home).toHaveCount(0);
        if(!await ready)throw Error('The fresh Community navigation sources are unavailable.');
        for(const key of transition.expected){let snapshot=transition.fresh.get(key)!;for(;;){await snapshot.settled;if(scopeFailure)throw scopeFailure;const latest=latestReads.get(key);if(latest&&latest!==snapshot){snapshot=latest;continue;}if(currentActor!==actor||scopeGeneration!==generation||!currentSnapshot(snapshot)||!snapshot.parsed||snapshot.cursor!==null||snapshot.nextCursor===undefined)throw Error('The fresh Community navigation source could not be confirmed.');break;}}
        await settled(page);await expect(page.locator('.community-workspace')).toBeVisible();await expect(page.locator('.workspace-chrome')).toHaveAttribute('data-navigation-mode','focused');await expect(page.locator('[data-workspace-destination="community"][aria-current="page"]')).toHaveCount(1);await expect(home).toHaveCount(0);if(currentActor!==actor||scopeGeneration!==generation||scopeFailure||[...transition.expected].some(key=>{const snapshot=latestReads.get(key);return !snapshot||!currentSnapshot(snapshot)||!snapshot.parsed;}))throw Error('The current Community navigation scope changed.');
        // Explicit Home unmount and independent current Community reads retire
        // only the old Home query. Different limits are never replacements.
        for(const snapshot of homeReads){retire(snapshot);if(latestReads.get(snapshot.key)===snapshot){latestReads.delete(snapshot.key);pageFacts.delete(snapshot.key);}}
        announcementFacts=new Map([...pageFacts.values()].flatMap(page=>page.announcements??[]).map(row=>[row.id,row]));
      }finally{clearTimeout(timer);complete(false);if(enteringHome===transition)enteringHome=null;}
    }else await openTrailWorkspace(page,'Community');
    await settled(page);await currentReads();
  }
  async function signOut() { const actor=currentActor;if(!actor)throw Error('The current Community session is unavailable.');await signOutTrailWorkspace(page);await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();resetReads();currentActor=null;scopeGeneration++;await ports.sessionEnded?.(actor);observation.sessionEndedCount++; }
  async function mutate(action: string, path: string, activate: () => Promise<void>, expectedBody?: Record<string,unknown>) {
    await currentReads();const actor=currentActor,generation=scopeGeneration;if(!actor)throw Error('The current Community actor is unavailable.');
    const receipt=await observeCustomerLearningLoopMutation(page,{apiOrigin,intent:{path,actor,scopeGeneration:generation},isCurrent:()=>currentActor===actor&&scopeGeneration===generation&&!scopeFailure,action:activate,beforeMutation:ports.beforeMutation,onCommand:async command=>{
      if(expectedBody)expect(command.body).toEqual(expectedBody);confirmCommunityReceipt(command.receipt,{key:command.key,path:command.path,body:command.body},actor.actorId);
      if(path==='/v1/community/rooms/'+observation.groupId+'/restrict'&&command.body.actorId===input.actors.student.actorId)confirmedMainRestriction=String(command.body.restriction);
      writes.push({action,path,actorId:actor.actorId,scopeGeneration:generation,status:command.status,id:command.receipt.id,key:command.key,keySha256:digest(command.key),requestSha256:digest(command.request.postDataBuffer()!),bodySha256:digest(JSON.stringify(command.body)),receiptSha256:digest(JSON.stringify(command.receipt))});await ports.onCommand?.(command);
    }});await settled(page);await currentReads();return receipt;
  }
  async function target(locator: Locator, owner: Locator) { await settled(page);const more=owner.locator(':scope > .pagination-actions').getByRole('button',{name:'Load more',exact:true});for(let count=0;count<30&&!await locator.count();count++){if(!await more.count())break;await expect(more).toHaveCount(1);await expect(more).toBeEnabled();await more.click();await expect(owner.getByRole('button',{name:'Loading more…',exact:true})).toHaveCount(0);await currentReads();}await expect(locator).toHaveCount(1);await expect(locator).toBeVisible(); }
  async function completeRoomDirectory() { const owner=page.locator('.community-workspace'),more=owner.locator(':scope > .pagination-actions').getByRole('button',{name:'Load more',exact:true});await settled(page);for(let count=0;count<30&&await more.count();count++){await expect(more).toHaveCount(1);await expect(more).toBeEnabled();const cursor=await more.getAttribute('data-page-cursor');const source=page.waitForResponse(response=>new URL(response.url()).origin===apiOrigin&&new URL(response.url()).pathname==='/v1/community/rooms'&&new URL(response.url()).searchParams.get('cursor')===cursor&&response.request().method()==='GET');await more.click();expect((await source).ok()).toBe(true);await settled(page);await currentReads();}await expect(more,'Complete the admitted room directory before selecting a class discussion').toHaveCount(0);await currentReads(); }
  async function currentClassRoom() { await completeRoomDirectory();const rooms=[...roomFacts.values()].filter(room=>room.type==='CLASS'&&room.classId===input.context.classId);if(rooms.length>1)throw Error('The admitted class has ambiguous current discussion sources.');if(rooms[0]&&rooms[0].status!=='ACTIVE')throw Error('The admitted class discussion is closed.');if(rooms[0])admittedClassRoomId=rooms[0].id;return rooms[0]??null; }
  async function openGroup() { const row=page.locator(`.community-room[data-room-id="${observation.groupId}"]`).filter({has:page.getByRole('heading',{name:title,exact:true})});await target(row,page.locator('.community-workspace'));await row.getByRole('button',{name:'Open discussion',exact:true}).click();await settled(page);await currentReads(); }
  async function exitRoom() {
    const actor=currentActor,generation=scopeGeneration,group=roomFacts.get(observation.groupId);
    const classRooms=[...roomFacts.values()].filter(item=>item.type==='CLASS'&&item.classId===input.context.classId);
    if(!actor||scopeFailure||!group||group.id!==observation.groupId||group.type!=='GROUP'||group.classId!==input.context.classId||group.name!==title||group.ownerId!==input.actors.teacher.actorId||classRooms.length!==1)throw Error('The current discussion sources require review before directory return.');
    const classRoom=classRooms[0],ownedRosters=new Set([`/v1/community/rooms/${group.id}/roster`,`/v1/community/rooms/${classRoom.id}/roster`]);
    const before=new Set(latestReads.values());
    const waiters=new Set<{settled:Promise<import('@playwright/test').Request|null>;cancel:()=>void}>();
    function nextDirectory(cursor:string|null) {
      let resolve!:(request:import('@playwright/test').Request|null)=>void,done=false;
      const settled=new Promise<import('@playwright/test').Request|null>(complete=>resolve=complete);
      const finish=(request:import('@playwright/test').Request|null)=>{if(done)return;done=true;clearTimeout(timer);page.off('request',observe);page.off('close',cancel);resolve(request);};
      const cancel=()=>finish(null),observe=(request:import('@playwright/test').Request)=>{const url=new URL(request.url());if(currentReadRequest(request)&&url.pathname==='/v1/community/rooms'&&url.searchParams.get('cursor')===cursor)finish(request);};
      const timer=setTimeout(cancel,15000);page.on('request',observe);page.on('close',cancel);const waiter={settled,cancel};waiters.add(waiter);return waiter;
    }
    try {
    const directoryRequest=nextDirectory(null);
    await page.getByRole('button',{name:'Back to rooms',exact:true}).click();
    const directory=page.locator('.community-workspace');await expect(directory).toHaveCount(1);await expect(page.locator('.community-discussion')).toHaveCount(0);
    async function confirmedDirectory(request:import('@playwright/test').Request|null) {
      if(!request)throw Error('The fresh discussion exit directory request is unavailable.');
      let snapshot=readRequests.get(request);if(!snapshot||before.has(snapshot))throw Error('A fresh current Community directory is required after discussion exit.');
      for(;;){await snapshot.settled;if(scopeFailure)throw scopeFailure;const latest=latestReads.get(snapshot.key);if(latest&&latest!==snapshot){snapshot=latest;continue;}if(currentActor!==actor||scopeGeneration!==generation||!currentSnapshot(snapshot)||!snapshot.parsed||snapshot.path!=='/v1/community/rooms'||snapshot.nextCursor===undefined)throw Error('The discussion exit directory could not be confirmed.');return snapshot;}
    }
    let source=await confirmedDirectory(await directoryRequest.settled);const chain=[source];await settled(page);
    const more=directory.locator(':scope > .pagination-actions').getByRole('button',{name:'Load more',exact:true});
    const cursors=new Set<string>();for(let count=0;source.nextCursor!==null;count++){const cursor=source.nextCursor;if(!cursor||count>=30||cursors.has(cursor)||cursor===source.cursor)throw Error('The discussion exit directory continuation requires review.');cursors.add(cursor);await expect(more).toHaveCount(1);await expect(more).toHaveAttribute('data-page-cursor',cursor);await expect(more).toBeEnabled();const request=nextDirectory(cursor);await more.click();source=await confirmedDirectory(await request.settled);chain.push(source);await settled(page);}
    await expect(more,'The current Community directory must be complete before retiring discussion-only reads').toHaveCount(0);
    for(const expected of [group,classRoom]){const current=roomFacts.get(expected.id);if(!current||current.classId!==expected.classId||current.name!==expected.name||current.type!==expected.type||current.ownerId!==expected.ownerId||current.status!==expected.status||current.revision!==expected.revision)throw Error('The discussion exit directory changed its exact source.');await expect(directory.locator(`.community-room[data-room-id="${expected.id}"]`).filter({has:page.getByRole('heading',{name:expected.name,exact:true})})).toHaveCount(1);}
    if(currentActor!==actor||scopeGeneration!==generation||scopeFailure)throw Error('The current Community scope changed during discussion exit.');
    if(chain[0].cursor!==null||source.nextCursor!==null||chain.some((snapshot,index)=>!currentSnapshot(snapshot)||!snapshot.parsed||snapshot.nextCursor===undefined||index>0&&chain[index-1].nextCursor!==snapshot.cursor))throw Error('The current Community directory changed before discussion source retirement.');
    // Only this confirmed navigation retires its no-longer-mounted roster owners.
    // Their cancellation supplies no positive source or authorization evidence.
    for(const[key,snapshot]of latestReads)if(ownedRosters.has(snapshot.path)){retire(snapshot);latestReads.delete(key);}
    for(const[key,fact]of pageFacts)if(ownedRosters.has(fact.path))pageFacts.delete(key);
    for(const path of ownedRosters)rosterFacts.delete(path);
    await currentReads();
    } finally {for(const waiter of waiters)waiter.cancel();await Promise.all([...waiters].map(waiter=>waiter.settled));}
  }
  async function observeView(stage:CustomerCommunityViewStage){
    if(!ports.observeView)return;await settled(page);await currentReads();const actor=currentActor,generation=scopeGeneration;if(!actor)throw Error('The current Community view actor is unavailable.');
    const before=JSON.stringify({groupId:observation.groupId,postIds:observation.postIds,announcementId:observation.announcementId,writes:writes.map(row=>({key:row.key,body:row.bodySha256,receipt:row.receiptSha256}))});
    await ports.observeView(Object.freeze({stage,role:actor.role,groupId:observation.groupId,postIds:Object.freeze([...observation.postIds]),announcementId:observation.announcementId,scopeGeneration:generation}));
    await settled(page);await currentReads();if(currentActor!==actor||scopeGeneration!==generation||before!==JSON.stringify({groupId:observation.groupId,postIds:observation.postIds,announcementId:observation.announcementId,writes:writes.map(row=>({key:row.key,body:row.bodySha256,receipt:row.receiptSha256}))}))throw Error('The original Community view scope changed during observation.');
  }
  const step=async(name:string,work:()=>Promise<void>)=>{if(ports.step)await ports.step(name,work);else await work();};
  let failure:unknown;
  try {
    await step('current Community recipe',async()=>{
    await signIn('teacher');
    const admittedRoom=input.context.classRoom??await ports.prepareClassRoom!({visibleMutation:mutate,currentClassRoom});
    const classRoom=await currentClassRoom();expect(classRoom).not.toBeNull();expect(classRoom).toMatchObject({id:admittedRoom.id,name:admittedRoom.name,classId:input.context.classId,type:'CLASS',status:'ACTIVE'});
    const classRow=page.locator('.community-room[data-room-type="CLASS"][data-room-id="'+admittedRoom.id+'"]').filter({has:page.getByRole('heading',{name:admittedRoom.name,exact:true})});await expect(classRow).toHaveCount(1);
    await page.getByRole('button', { name: 'Create selected study group', exact: true }).click();
    const groupForm = page.getByRole('region', { name: 'Create selected study group', exact: true });
    await selectHumanChoice(groupForm.getByLabel('Class',{exact:true}),input.context.classLabel,input.context.classId,groupForm.locator(':scope > .field')); await settled(page);
    const learnerChoice=groupForm.getByLabel(studentName,{exact:true});const groupRoster=groupForm.locator(':scope > fieldset'),groupMore=groupRoster.locator(':scope > .pagination-actions').getByRole('button',{name:'Load more',exact:true});for(let count=0;count<30&&!await learnerChoice.count();count++){if(!await groupMore.count())break;await expect(groupMore).toHaveCount(1);await groupMore.click();await settled(page);await currentReads();}await currentReads();const namedLearners=(rosterFacts.get('/v1/community/rooms/'+admittedRoom.id+'/roster')??[]).filter(person=>person.role==='student'&&person.displayName===studentName);expect(namedLearners).toHaveLength(1);expect(namedLearners[0].id).toBe(input.actors.student.actorId);await expect(learnerChoice).toHaveCount(1);await learnerChoice.check();
    await groupForm.getByLabel('Room name', { exact: true }).fill(title);
    const group = await mutate('selected teacher group created', '/v1/community/rooms', () => groupForm.getByRole('button', { name: 'Save', exact: true }).click());
    observation.groupId=group.id;await openGroup();await observeView('GROUP_READY');
    let members = page.getByRole('region', { name: 'Group members', exact: true });
    await settled(page); await expect.poll(async()=>await members.getByLabel('Member',{exact:true}).getByRole('option',{name:otherName,exact:true}).count()>0||await members.locator('..').locator('..').getByRole('button',{name:'Load more',exact:true}).count()>0,{timeout:15000,message:'Wait for the authorized current class learner choice.'}).toBe(true);await selectHumanChoice(members.getByLabel('Member',{exact:true}),otherName,input.peer.actorId,members.locator('..').locator('..'));await members.getByLabel('Membership status',{exact:true}).selectOption({label:'Active member'});await members.getByLabel('I approve this moderation action').check();
    const memberAdded=await mutate('teacher adds a current class member', `/v1/community/rooms/${group.id}/members`, () => members.getByRole('button', { name: 'Save', exact: true }).click());
    observation.membershipChangeIds.push(memberAdded.id);await currentReads();await ports.peerMembershipAdded?.(Object.freeze({groupId:group.id,memberChangeId:memberAdded.id,peerActorId:input.peer.actorId}));
    members = page.getByRole('region', { name: 'Group members', exact: true }); await expect.poll(async()=>await members.getByLabel('Membership status', { exact: true }).inputValue()).toBe(''); await selectHumanChoice(members.getByLabel('Member',{exact:true}),otherName,input.peer.actorId); await expect(members.getByLabel('Member', { exact: true }).locator('option:checked')).toHaveText(otherName); await members.getByLabel('Membership status', { exact: true }).selectOption({ label: 'Remove from group' }); await members.getByLabel('I approve this moderation action').check();
    const memberRevoked=await mutate('teacher revokes selected group membership', `/v1/community/rooms/${group.id}/members`, () => members.getByRole('button', { name: 'Save', exact: true }).click());
    observation.membershipChangeIds.push(memberRevoked.id);await currentReads();await ports.peerMembershipRevoked?.(Object.freeze({groupId:group.id,memberChangeId:memberRevoked.id,peerActorId:input.peer.actorId}));
    await signOut(); await signIn('student'); await openGroup();
    const postForm = page.getByRole('region', { name: 'Post to room', exact: true }); await postForm.getByLabel('Message', { exact: true }).fill(content.postBody);
    const post = await mutate('student posts inside selected group', `/v1/community/rooms/${group.id}/posts`, () => postForm.getByRole('button', { name: 'Post to room', exact: true }).click());
    await postForm.getByLabel('Message', { exact: true }).fill(content.secondPostBody);
    const secondPost = await mutate('student creates a second source for distinct reply drafts', `/v1/community/rooms/${group.id}/posts`, () => postForm.getByRole('button', { name: 'Post to room', exact: true }).click());
    observation.postIds.push(post.id,secondPost.id);let postRow = page.locator(`[data-post-id="${post.id}"]`); await target(postRow,page.locator('.community-discussion-main'));await observeView('DISCUSSION_READY');
    await expect(postRow.getByRole('button',{name:'Helpful · Count unavailable',exact:true})).toBeVisible();await expect(postRow.getByRole('button',{name:'Helpful · Count unavailable',exact:true})).toBeEnabled();await expect(postRow.getByRole('button',{name:'Helpful · 0',exact:true})).toHaveCount(0);
    const reactionPath='/v1/community/posts/'+post.id+'/reactions';
    const held=await ports.holdReaction?.(reactionPath);
    async function currentReaction() {
      const currentPosts=page.waitForResponse(response=>new URL(response.url()).origin===apiOrigin&&new URL(response.url()).pathname==='/v1/community/rooms/'+group.id+'/posts'&&response.request().method()==='GET');await page.getByRole('button',{name:'Refresh community',exact:true}).click();await settled(page);
      const currentPostResponse=await currentPosts;expect(currentPostResponse.ok()).toBe(true);const currentPostPage=await currentPostResponse.json() as {items:{id:string;reactions:{reaction:string;count:number;mine:boolean}[]}[]};const currentPost=currentPostPage.items.filter(item=>item.id===post.id);expect(currentPost).toHaveLength(1);expect(currentPost[0].reactions.filter(item=>item.reaction==='HELPFUL')).toEqual([{reaction:'HELPFUL',count:1,mine:true}]);
    }
    try {
      await mutate('student adds helpful reaction across source refresh',reactionPath,async()=>{
        await postRow.getByRole('button',{name:'Helpful · Count unavailable',exact:true}).click();
        if(held){await held.committed;await currentReaction();await expect(postRow.getByRole('button',{name:'Retry the same action',exact:true})).toHaveCount(3);held.release();await held.handled;}
      },{reaction:'HELPFUL',active:true});
      if(!held)await currentReaction();
      await expect(postRow.getByRole('button',{name:'Retry the same action',exact:true})).toHaveCount(0);await expect(postRow.getByRole('button',{name:'Helpful · 1',exact:true})).toBeEnabled();if(held)expect(held.keys).toHaveLength(1);
      await expect(postRow.getByRole('button',{name:'Helpful · 1',exact:true})).toBeVisible();await expect(postRow.getByRole('button',{name:'Helpful · 1',exact:true})).toBeEnabled();
      await mutate('student removes same reaction',reactionPath,()=>postRow.getByRole('button',{name:'Helpful · 1',exact:true}).click(),{reaction:'HELPFUL',active:false});
      if(held){expect(held.keys).toHaveLength(2);expect(held.keys[1]).not.toBe(held.keys[0]);}
    } finally {held?.release();await held?.dispose();}
    await expect(postRow.getByRole('button',{name:'Helpful · Count unavailable',exact:true})).toBeVisible();await expect(postRow.getByRole('button',{name:'Helpful · 0',exact:true})).toHaveCount(0);
    await postRow.getByRole('button', { name: 'Reply', exact: true }).click(); const reply = page.getByRole('region', { name: 'Reply', exact: true }); await reply.getByLabel('Message', { exact: true }).fill(content.replyBody);
    const secondPostRow = page.locator(`[data-post-id="${secondPost.id}"]`); await secondPostRow.getByRole('button', { name: 'Reply', exact: true }).click();
    await expect(reply.getByLabel('Message', { exact: true })).toHaveValue('');
    await reply.getByLabel('Message', { exact: true }).fill(content.replyDraftOther);
    await postRow.getByRole('button', { name: 'Reply', exact: true }).click();
    await expect(reply.getByLabel('Message', { exact: true })).toHaveValue(content.replyBody);
    await secondPostRow.getByRole('button', { name: 'Reply', exact: true }).click();
    await expect(reply.getByLabel('Message', { exact: true })).toHaveValue(content.replyDraftOther);
    await postRow.getByRole('button', { name: 'Reply', exact: true }).click();
    await page.getByRole('button', { name: 'Refresh community', exact: true }).click(); await settled(page);
    await expect(reply.getByLabel('Message', { exact: true })).toHaveValue(content.replyBody);
    await expect(page.getByRole('region', { name: 'Post to room', exact: true }).getByLabel('Message', { exact: true })).not.toHaveValue(content.replyBody);
    const replyRequest = page.waitForRequest(request => request.url()===apiOrigin+'/v1/community/rooms/'+group.id+'/posts' && request.method() === 'POST');
    const replyReceipt=await mutate('student replies to group source', `/v1/community/rooms/${group.id}/posts`, () => reply.getByRole('button', { name: 'Save', exact: true }).click());
    observation.replyId=replyReceipt.id;expect((await replyRequest).postDataJSON()).toMatchObject({ replyToId: post.id, body: content.replyBody });
    await postRow.getByRole('button', { name: 'Report post', exact: true }).click(); const report = page.getByRole('region', { name: 'Report post', exact: true }); await report.getByLabel('Reason', { exact: true }).fill(content.reportReason); const reportReceipt=await mutate('student reports with an explicit reason', `/v1/community/posts/${post.id}/report`, () => report.getByRole('button', { name: 'Save', exact: true }).click());
    observation.reportId=reportReceipt.id;await signOut(); await signIn('teacher'); await openGroup();
    await page.getByRole('button', { name: 'Manage participation', exact: true }).click(); let restriction = page.getByRole('region', { name: 'Manage participation', exact: true });
    await selectHumanChoice(restriction.getByLabel('Member',{exact:true}),studentName,input.actors.student.actorId); await restriction.getByLabel('Participation restriction', { exact: true }).selectOption({ label: 'Mute posting' }); await restriction.getByLabel('Reason', { exact: true }).fill(content.muteReason); await restriction.getByLabel('I approve this moderation action').check(); await mutate('teacher mutes posting', `/v1/community/rooms/${group.id}/restrict`, () => restriction.getByRole('button', { name: 'Save', exact: true }).click());
    await signOut(); await signIn('student'); await openGroup(); await expect(page.getByRole('region', { name: 'Post to room', exact: true })).toHaveCount(0); await expect(page.getByText('Your current access permits reading only.', { exact: true })).toBeVisible();await observeView('READ_ONLY_DISCUSSION');
    await signOut(); await signIn('teacher'); await openGroup(); await page.getByRole('button', { name: 'Manage participation', exact: true }).click(); restriction = page.getByRole('region', { name: 'Manage participation', exact: true });
    await selectHumanChoice(restriction.getByLabel('Member',{exact:true}),studentName,input.actors.student.actorId); await restriction.getByLabel('Participation restriction', { exact: true }).selectOption({ label: 'Remove restriction' }); await restriction.getByLabel('Reason', { exact: true }).fill(content.unmuteReason); await restriction.getByLabel('I approve this moderation action').check(); await mutate('teacher removes restriction', `/v1/community/rooms/${group.id}/restrict`, () => restriction.getByRole('button', { name: 'Save', exact: true }).click());
    postRow = page.locator(`[data-post-id="${post.id}"]`); await target(postRow,page.locator('.community-discussion-main')); await postRow.getByRole('button', { name: 'Hide post', exact: true }).click(); let moderation = page.getByRole('region', { name: 'Staff review', exact: true }); await moderation.getByLabel('Reason', { exact: true }).fill(content.hideReason); await moderation.getByLabel('I approve this moderation action').check(); await mutate('staff hides reported source', `/v1/community/posts/${post.id}/moderate`, () => moderation.getByRole('button', { name: 'Save', exact: true }).click()); await expect(postRow).not.toContainText(content.postBody); if(content.postBody==='I checked the example by explaining each step.')await expect(postRow).not.toContainText('I checked the example');
    await postRow.getByRole('button', { name: 'Restore post', exact: true }).click(); moderation = page.getByRole('region', { name: 'Staff review', exact: true }); await moderation.getByLabel('Reason', { exact: true }).fill(content.restoreReason); await moderation.getByLabel('I approve this moderation action').check(); await mutate('staff restores reviewed source', `/v1/community/posts/${post.id}/moderate`, () => moderation.getByRole('button', { name: 'Save', exact: true }).click()); await expect(postRow).toContainText(content.postBody);await observeView('MODERATION_RESTORED');
    await exitRoom(); await page.getByRole('button', { name: 'Announcements', exact: true }).click(); await page.getByRole('button', { name: 'Publish announcement', exact: true }).click(); const announcement = page.getByRole('region', { name: 'Publish announcement', exact: true }); await selectHumanChoice(announcement.getByLabel('Class',{exact:true}),input.context.classLabel,input.context.classId,page.locator('.community-workspace')); await announcement.getByLabel('Title', { exact: true }).fill(content.announcementTitle); await announcement.getByLabel('Message', { exact: true }).fill(content.announcementBody); await announcement.getByLabel('Approve this announcement for current parents / guardians').check(); const announcementReceipt = await mutate('teacher approves current family announcement', '/v1/community/announcements', () => announcement.getByRole('button', { name: 'Save', exact: true }).click()); observation.announcementId=announcementReceipt.id;await signOut();
    await signIn('parent'); await page.locator('[data-workspace-sections]').getByRole('button', { name: 'Notifications', exact: true }).click(); await settled(page);
    const notification = page.locator('.community-post').filter({ has: page.getByRole('heading', { name: content.announcementTitle, exact: true }) }); await target(notification,page.locator('.community-workspace')); await expect(notification.getByRole('button', { name: 'Mark read', exact: true })).toHaveCount(0);
    const sourceRead = page.waitForResponse(response => new URL(response.url()).origin===apiOrigin&&new URL(response.url()).pathname === `/v1/community/announcements/${announcementReceipt.id}` && response.request().method() === 'GET');
    await notification.getByRole('button', { name: 'Open announcement', exact: true }).click(); const openedSource = await sourceRead; expect(openedSource.ok()).toBe(true);
    const currentSource = await openedSource.json() as { id: string; revision: number; parentVisible: boolean }; expect(currentSource.id).toBe(announcementReceipt.id); expect(currentSource.parentVisible).toBe(true); expect(currentSource.revision).toBeGreaterThan(0);
    await expect(notification).toContainText(content.announcementBody); await settled(page); const markRead = notification.getByRole('button', { name: 'Mark read', exact: true }); await expect(markRead).toBeEnabled();
    const readPath = `/v1/community/notifications/${currentSource.id}/read`;
    const readReceipt=await mutate('parent records notification read receipt',readPath,()=>markRead.click(),{expectedRevision:currentSource.revision});expect(readReceipt).toEqual({id:currentSource.id,status:'READ',revision:currentSource.revision});
    const readWrites=writes.filter(write=>write.path===readPath);expect(readWrites).toHaveLength(1);expect(readWrites[0].key).not.toBe('');
    await settled(page); await expect(notification).toContainText('Read'); await expect(notification.getByRole('button', { name: 'Mark read', exact: true })).toHaveCount(0);
      await observeView('FAMILY_NOTIFICATION_READ');await ports.capture?.('parent-notification-confirmed');await ports.verifyQuality?.();
    });
    if(input.retirement)await step('retire exact test-owned Community sources',async()=>{
      await signOut();await signIn('teacher');await ports.beforeRetirement!(observation);await currentReads();
      await openGroup();expect(confirmedMainRestriction,'The successfully confirmed practice restriction must be restored before retirement').toBe('NONE');const groupSource=roomFacts.get(observation.groupId);expect(groupSource).toMatchObject({id:observation.groupId,classId:input.context.classId,name:title,type:'GROUP',ownerId:input.actors.teacher.actorId,status:'ACTIVE'});expect(groupSource!.revision).toBeGreaterThan(0);
      const memberForm=page.getByRole('region',{name:'Group members',exact:true});await selectHumanChoice(memberForm.getByLabel('Member',{exact:true}),studentName,input.actors.student.actorId,memberForm.locator('..').locator('..'));await memberForm.getByLabel('Membership status',{exact:true}).selectOption({label:'Remove from group'});await memberForm.getByLabel('I approve this moderation action').check();
      const revoked=await mutate('teacher revokes test-owned main group membership','/v1/community/rooms/'+observation.groupId+'/members',()=>memberForm.getByRole('button',{name:'Save',exact:true}).click(),{actorId:input.actors.student.actorId,status:'revoked',confirmAccessChange:true});observation.membershipChangeIds.push(revoked.id);observation.retirement.mainMemberRevoked=true;
      const currentGroup=roomFacts.get(observation.groupId);expect(currentGroup).toMatchObject({id:groupSource!.id,revision:groupSource!.revision,status:'ACTIVE',name:title,ownerId:input.actors.teacher.actorId});
      await page.getByRole('button',{name:'Review group lifecycle',exact:true}).click();const lifecycle=page.getByRole('region',{name:'Review group lifecycle',exact:true});await expect(lifecycle.getByLabel('Group name',{exact:true})).toHaveValue(title);await lifecycle.getByLabel('Group state',{exact:true}).selectOption({value:'CLOSED'});await lifecycle.getByLabel('Reason',{exact:true}).fill(input.retirement!.groupClosureReason);await lifecycle.getByLabel('I approve this group lifecycle change',{exact:true}).check();
      await mutate('teacher closes exact test-owned group','/v1/community/groups/'+observation.groupId+'/lifecycle',()=>lifecycle.getByRole('button',{name:'Save',exact:true}).click(),{name:title,state:'CLOSED',expectedRevision:currentGroup!.revision,reason:input.retirement!.groupClosureReason,confirmChange:true});observation.retirement.groupClosed=true;await expect(page.getByRole('region',{name:'Post to room',exact:true})).toHaveCount(0);
      await exitRoom();await page.locator('[data-workspace-sections]').getByRole('button',{name:'Announcements',exact:true}).click();await settled(page);const source=page.locator('.community-post').filter({has:page.getByRole('heading',{name:content.announcementTitle,exact:true})});await target(source,page.locator('.community-workspace'));await currentReads();const namedAnnouncements=[...announcementFacts.values()].filter(item=>item.title===content.announcementTitle);expect(namedAnnouncements).toHaveLength(1);const currentAnnouncement=namedAnnouncements[0];expect(currentAnnouncement).toMatchObject({id:observation.announcementId,classId:input.context.classId,title:content.announcementTitle,body:content.announcementBody,parentVisible:true,canManage:true});expect(currentAnnouncement.revision).toBeGreaterThan(0);
      await source.getByRole('button',{name:'Withdraw announcement',exact:true}).click();const withdrawal=page.getByRole('region',{name:'Withdraw announcement',exact:true});
      await withdrawal.getByLabel('Reason',{exact:true}).fill(input.retirement!.announcementWithdrawalReason);await withdrawal.getByLabel('I confirm this announcement should no longer be offered',{exact:true}).check();await mutate('teacher withdraws exact test-owned announcement','/v1/community/announcements/'+observation.announcementId+'/withdraw',()=>withdrawal.getByRole('button',{name:'Save',exact:true}).click(),{expectedRevision:currentAnnouncement.revision,reason:input.retirement!.announcementWithdrawalReason,confirmWithdrawal:true});observation.retirement.announcementWithdrawn=true;observation.retirement.status='CONFIRMED_UI_ONLY';await expect(source).toHaveCount(0);await observeView('RETIREMENT_CONFIRMED');
    });
  } catch(error) {failure=error;}
  const cleanupFailures:unknown[]=[];
  if(currentActor&&!page.isClosed())try{await signOut();}catch(error){cleanupFailures.push(error);}
  page.off('response',responseObserver);page.off('request',requestObserver);page.off('requestfailed',requestFailedObserver);resetReads();await Promise.all([...pendingReads]);
  if(ports.cleanup)try{observation.cleanupCount++;await ports.cleanup(observation);}catch(error){cleanupFailures.push(error);}
  if(failure){try{await ports.captureFailure?.(Object.freeze({schemaVersion:'1',code:'COMMUNITY_CURRENT_SOURCE_UNVERIFIED',confirmedWriteCount:writes.length,read:failedRead}));}catch{/* Diagnostic delivery cannot replace the original failure. */}if(cleanupFailures.length)throw new AggregateError([failure,...cleanupFailures],'Community verification and cleanup failed.',{cause:failure});throw failure;}
  if(cleanupFailures.length)throw new AggregateError(cleanupFailures,'Community cleanup failed.');
  return observation;
}
