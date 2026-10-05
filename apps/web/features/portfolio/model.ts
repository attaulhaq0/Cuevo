import { LearningApiError } from '../../shared/api/client.ts';
export type PortfolioCollection={id:string;title:string;description:string};
export type PortfolioPlacement={id:string;collectionId:string|null;position:number;revision:number};
export type PortfolioFeedbackRequest={id:string;itemId:string;revisionId:string;learnerId:string;learnerName:string;title:string;message:string;state:'PENDING';requestedAt:string};
export function parsePortfolioCollection(value:unknown):PortfolioCollection{if(!value||typeof value!=='object'||!('id'in value)||typeof value.id!=='string'||!('title'in value)||typeof value.title!=='string'||!('description'in value)||typeof value.description!=='string')throw new LearningApiError('invalid');return value as PortfolioCollection;}
export function parsePortfolioPlacement(value:unknown):PortfolioPlacement{if(!value||typeof value!=='object'||!('id'in value)||typeof value.id!=='string'||!('collectionId'in value)||!(value.collectionId===null||typeof value.collectionId==='string')||!('position'in value)||!Number.isInteger(value.position)||!('revision'in value)||!Number.isInteger(value.revision))throw new LearningApiError('invalid');return value as PortfolioPlacement;}
export function parsePortfolioFeedbackRequest(value:unknown):PortfolioFeedbackRequest{if(!value||typeof value!=='object'||['id','itemId','revisionId','learnerId','learnerName','title','message','requestedAt'].some(key=>!(key in value)||typeof(value as Record<string,unknown>)[key]!=='string'||!(value as Record<string,unknown>)[key])||!('state'in value)||value.state!=='PENDING'||!Number.isFinite(Date.parse(String((value as Record<string,unknown>).requestedAt))))throw new LearningApiError('invalid');return value as PortfolioFeedbackRequest;}
export function parsePortfolioCollectionPage(value:unknown):{id:string;title:string;items:{id:string;title:string;reflection:string;position:number}[];nextCursor:string|null}{if(!value||typeof value!=='object'||!('id'in value)||typeof value.id!=='string'||!('title'in value)||typeof value.title!=='string'||!('items'in value)||!Array.isArray(value.items)||value.items.some(item=>!item||typeof item!=='object'||typeof item.id!=='string'||typeof item.title!=='string'||typeof item.reflection!=='string'||!Number.isInteger(item.position))||!('nextCursor'in value)||!(value.nextCursor===null||typeof value.nextCursor==='string'))throw new LearningApiError('invalid');return value as{id:string;title:string;items:{id:string;title:string;reflection:string;position:number}[];nextCursor:string|null};}
import { parseNativeResult, parseReleasedResult, type NativeResult, type ReleasedResult } from '../academic/model.ts';
import { portfolioAr, portfolioEn } from './messages.ts';
import { assetStageSchema, portfolioSourceWorkSchema, portfolioRequestedReviewSchema,portfolioIdentitySchema,type PortfolioIdentity, type PortfolioSourceWork, type PortfolioRequestedReview, type SubmissionWorkSource, type SubmissionArtifact } from '@cuevo/contracts';
export type { PortfolioSourceWork } from '@cuevo/contracts';
export function parsePortfolioSourceWork(value: unknown): PortfolioSourceWork { const parsed = portfolioSourceWorkSchema.safeParse(value); if (!parsed.success) throw new LearningApiError('invalid'); return parsed.data; }
export function parsePortfolioRequestedReview(value:unknown):PortfolioRequestedReview{const parsed=portfolioRequestedReviewSchema.safeParse(value);if(!parsed.success)throw new LearningApiError('invalid');return parsed.data;}
export type PortfolioItem = {identity:PortfolioIdentity; id: string; revisionId: string; revision: number; learnerId: string; sourceModel: 'numeric' | 'rubric'; title: string; reflection: string; createdAt: string; feedback: string | null; featured: boolean; approvalState: 'AWAITING_REVIEW' | 'REVIEWED'; parentVisible: boolean; reviewedAt: string | null; evidenceId: string; resultId: string; submissionId: string; referenceId: string; referenceVersion: string; policyVersion: number; nativeResult: NativeResult; assessmentTitle: string; referenceTitle: string; submissionKind?: 'TEXT' | 'QUIZ'; sourceWorkApproved?: boolean; responseKind?: 'TEXT' | 'FILE'; artifactCount?: number };
const unknownIdentity:PortfolioIdentity={status:'REQUIRES_REVIEW',learnerName:null,className:null,yearGroupName:null,academicYearName:null,courseTitle:null,assessmentTitle:null,submittedAt:null,submissionRevision:null};
export type PortfolioChoice = { value: string; label: string; ambiguous: boolean; unavailable: boolean };
function choiceText(locale: 'en' | 'ar') { return locale === 'ar' ? portfolioAr : portfolioEn; }
function savedDate(value: string, locale: 'en' | 'ar') {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return choiceText(locale).contextUnavailable;
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC', timeZoneName: 'short' }).format(date);
}
function distinctChoices(choices: Omit<PortfolioChoice, 'ambiguous'>[], locale: 'en' | 'ar'): PortfolioChoice[] {
  const key = (label: string) => label.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase(locale);
  const counts = new Map<string, number>();
  for (const choice of choices) counts.set(key(choice.label), (counts.get(key(choice.label)) ?? 0) + 1);
  return choices.map(choice => ({ ...choice, ambiguous: (counts.get(key(choice.label)) ?? 0) > 1 }));
}
export function portfolioIdentityLabel(identity: PortfolioIdentity, locale: 'en' | 'ar'): string {
  const t = choiceText(locale);
  return [identity.learnerName ?? t.unknownLearner, `${t.classLabel}: ${identity.className ?? t.contextUnavailable}`, `${t.yearGroupLabel}: ${identity.yearGroupName ?? t.contextUnavailable}`, `${t.academicYearLabel}: ${identity.academicYearName ?? t.contextUnavailable}`].join(' · ');
}
export function portfolioEvidenceChoices(results: ReleasedResult[], locale: 'en' | 'ar'): PortfolioChoice[] {
  const t = choiceText(locale); const numbers = new Intl.NumberFormat(locale);
  return distinctChoices(results.map(result => ({ value: result.evidenceId, unavailable: !result.assessmentTitle?.trim() || !result.referenceTitle?.trim() || !Number.isFinite(Date.parse(result.createdAt)), label: [result.assessmentTitle?.trim() || t.contextUnavailable, ...(result.learnerName?.trim() ? [result.learnerName] : []), `${t.objectiveLabel}: ${result.referenceTitle?.trim() || t.contextUnavailable}`, `${t.resultRevision}: ${numbers.format(result.revision)}`, `${t.releasedOn}: ${savedDate(result.createdAt, locale)}`].join(' · ') })), locale);
}
export function portfolioCollectionChoices(collections: PortfolioCollection[], locale: 'en' | 'ar'): PortfolioChoice[] {
  const t = choiceText(locale);
  const titleKey = (title: string) => title.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase(locale);
  const titles = new Map<string, number>();
  for (const collection of collections) titles.set(titleKey(collection.title), (titles.get(titleKey(collection.title)) ?? 0) + 1);
  return distinctChoices(collections.map(collection => ({ value: collection.id, unavailable: !collection.title.trim(), label: [collection.title.trim() || t.contextUnavailable, ...((titles.get(titleKey(collection.title)) ?? 0) > 1 && collection.description.trim() ? [collection.description.trim()] : [])].join(' · ') })), locale);
}
export function portfolioWorkChoices(items: PortfolioItem[], locale: 'en' | 'ar'): PortfolioChoice[] {
  const t = choiceText(locale); const numbers = new Intl.NumberFormat(locale);
  return distinctChoices(items.map(item => ({ value: item.id, unavailable: item.identity.status !== 'READY', label: [item.title, ...(item.identity.status === 'READY' ? [portfolioIdentityLabel(item.identity, locale), `${t.courseLabel}: ${item.identity.courseTitle}`, `${t.assessmentLabel}: ${item.identity.assessmentTitle}`, `${t.objectiveLabel}: ${item.referenceTitle}`, `${t.submittedOn}: ${savedDate(item.identity.submittedAt!, locale)}`, `${t.submissionRevision}: ${numbers.format(item.identity.submissionRevision!)}`] : [item.assessmentTitle, t.contextUnavailable]), `${t.revision}: ${numbers.format(item.revision)}`].join(' · ') })), locale);
}
export function parsePortfolioItem(value: unknown): PortfolioItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LearningApiError('invalid'); const row = value as Record<string, unknown>;
  if (['id', 'revisionId', 'learnerId', 'title', 'reflection', 'evidenceId', 'resultId', 'submissionId', 'referenceId', 'referenceVersion', 'assessmentTitle', 'referenceTitle'].some(key => typeof row[key] !== 'string' || !row[key]) || !Number.isInteger(row.revision) || Number(row.revision) < 1 || !Number.isInteger(row.policyVersion) || Number(row.policyVersion) < 1 || typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt)) || typeof row.featured !== 'boolean' || typeof row.parentVisible !== 'boolean' || !['AWAITING_REVIEW', 'REVIEWED'].includes(String(row.approvalState)) || !(row.feedback === null || typeof row.feedback === 'string') || !(row.reviewedAt === null || typeof row.reviewedAt === 'string' && Number.isFinite(Date.parse(row.reviewedAt)))) throw new LearningApiError('invalid');
  const nativeResult = parseNativeResult(row.nativeResult);
  const identity=portfolioIdentitySchema.safeParse(row.identity??unknownIdentity);if(!identity.success)throw new LearningApiError('invalid');
  if (row.submissionKind !== undefined && !['TEXT', 'QUIZ'].includes(String(row.submissionKind))) throw new LearningApiError('invalid');
  if (row.responseKind !== undefined && !['TEXT', 'FILE'].includes(String(row.responseKind)) || row.artifactCount !== undefined && (!Number.isInteger(row.artifactCount) || Number(row.artifactCount) < 0 || Number(row.artifactCount) > 5) || row.responseKind === 'FILE' && (row.submissionKind === 'QUIZ' || !row.artifactCount)) throw new LearningApiError('invalid');
  if (row.sourceWorkApproved !== undefined && typeof row.sourceWorkApproved !== 'boolean' || row.sourceWorkApproved === true && row.approvalState !== 'REVIEWED') throw new LearningApiError('invalid');
  if (nativeResult.type !== row.sourceModel || nativeResult.policyVersion !== row.policyVersion || row.approvalState === 'AWAITING_REVIEW' && (row.parentVisible || row.reviewedAt !== null || row.feedback !== null) || row.approvalState === 'REVIEWED' && (row.reviewedAt === null || !row.feedback)) throw new LearningApiError('invalid');
  return { ...row, nativeResult,identity:identity.data } as PortfolioItem;
}
export function parsePortfolioRevision(value: unknown): PortfolioItem { const item = parsePortfolioItem(value); return { ...item, id: item.revisionId }; }
export function parsePortfolioItemForLearner(value:unknown,learnerId:string|null,parent:boolean):PortfolioItem {
 const item=parsePortfolioItem(value);
 if(!learnerId||item.learnerId!==learnerId||parent&&(item.approvalState!=='REVIEWED'||item.parentVisible!==true))throw new LearningApiError('invalid');
 return item;
}
export function parsePortfolioReleasedResultForLearner(value:unknown,learnerId:string|null) {
 const result=parseReleasedResult(value);
 if(!learnerId||result.learnerId!==learnerId)throw new LearningApiError('invalid');
 return result;
}
export function parsePortfolioHistoryForItem(value:unknown,anchor:PortfolioItem):PortfolioItem {
 const item=parsePortfolioItem(value);
 if(['id','learnerId','sourceModel','evidenceId','resultId','submissionId','referenceId','referenceVersion','policyVersion'].some(key=>item[key as keyof PortfolioItem]!==anchor[key as keyof PortfolioItem]))throw new LearningApiError('invalid');
 return {...item,id:item.revisionId};
}
export type PrivateAsset = { id: string; ownerId: string; name: string; contentType: 'text/plain' | 'image/png' | 'image/jpeg' | 'application/pdf'; byteSize: number; sha256: string; state: 'STAGED' | 'AVAILABLE' | 'RETIRED'; createdAt: string };
export function parsePrivateAsset(value: unknown): PrivateAsset { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LearningApiError('invalid'); const row = value as Record<string, unknown>; if (['id', 'ownerId', 'name', 'sha256'].some(key => typeof row[key] !== 'string' || !row[key]) || !['text/plain', 'image/png', 'image/jpeg', 'application/pdf'].includes(String(row.contentType)) || typeof row.byteSize !== 'number' || !Number.isInteger(row.byteSize) || row.byteSize <= 0 || row.byteSize > 524288 || !/^[a-f0-9]{64}$/.test(String(row.sha256)) || !['STAGED', 'AVAILABLE', 'RETIRED'].includes(String(row.state)) || typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt))) throw new LearningApiError('invalid'); return row as PrivateAsset; }

export type PortfolioReadContext = { apiUrl:string; membership:{schoolId:string;userId:string;role:string}|null; accessToken:string|null; accessGeneration:number; online:boolean; status:string };
export type PortfolioRead<T> = {scope:string|null;value:T};
/** A response is displayable only for the exact currently verified request context. */
export function portfolioReadScope(context:PortfolioReadContext,path:string|null,refresh:number):string|null {
  if(!path||context.status!=='ready'||!context.online||!context.membership||!context.accessToken)return null;
  return JSON.stringify([context.apiUrl,context.membership.schoolId,context.membership.userId,context.membership.role,context.accessToken,context.accessGeneration,context.online,context.status,path,refresh]);
}
export function currentPortfolioRead<T>(response:PortfolioRead<T>|null|undefined,scope:string|null):T|null {return scope&&response?.scope===scope?response.value:null;}

export function portfolioSourceMatchesItem(work:PortfolioSourceWork|null|undefined,item:PortfolioItem):work is PortfolioSourceWork {
  if(!work||work.itemId!==item.id||work.revisionId!==item.revisionId||work.portfolioRevision!==item.revision||work.learnerId!==item.learnerId||work.evidenceId!==item.evidenceId||work.resultId!==item.resultId||work.referenceId!==item.referenceId||work.referenceVersion!==item.referenceVersion||work.policyVersion!==item.policyVersion||work.source.submissionId!==item.submissionId||work.source.assessmentTitle!==item.assessmentTitle)return false;
  if(item.submissionKind==='QUIZ'||item.responseKind&&work.source.kind!==item.responseKind||item.artifactCount!==undefined&&(work.source.artifacts?.length??0)!==item.artifactCount)return false;
  const identity=item.identity;
  return !(identity.learnerName&&identity.learnerName!==work.learnerName||identity.assessmentTitle&&identity.assessmentTitle!==work.source.assessmentTitle||identity.submissionRevision!==null&&identity.submissionRevision!==work.source.submissionRevision||identity.submittedAt&&Date.parse(identity.submittedAt)!==Date.parse(work.source.submittedAt));
}
export function portfolioRequestedReviewMatchesRequest(source:PortfolioRequestedReview|null|undefined,request:PortfolioFeedbackRequest):source is PortfolioRequestedReview {
  if(!source||source.requestId!==request.id||source.itemId!==request.itemId||source.revisionId!==request.revisionId||source.learnerId!==request.learnerId||source.learnerName!==request.learnerName||source.title!==request.title)return false;
  const work=source.work;
  return !work||work.itemId===source.itemId&&work.revisionId===source.revisionId&&work.portfolioRevision===source.revision&&work.learnerId===source.learnerId&&work.learnerName===source.learnerName&&work.evidenceId===source.evidenceId&&work.resultId===source.resultId&&work.policyVersion===source.nativeResult.policyVersion&&work.source.assessmentTitle===source.assessmentTitle;
}
export function portfolioArtifactReviewKey(asset:SubmissionArtifact):string {return JSON.stringify([asset.id,asset.sha256,asset.byteSize,asset.contentType,asset.name,asset.state]);}
export function portfolioDocumentSourcesMatch(all:SubmissionWorkSource|null|undefined,current:PortfolioSourceWork|null|undefined,item:PortfolioItem):boolean {
  if(!all||!portfolioSourceMatchesItem(current,item)||all.submissionId!==current.source.submissionId||all.learnerId!==current.learnerId||all.assessmentId!==current.source.assessmentId||all.revision!==current.source.submissionRevision||all.responseKind!==current.source.kind||all.content!==current.source.content)return false;
  return !current.source.artifacts?.some(selected=>{const asset=all.artifacts.find(candidate=>candidate.id===selected.id);return !asset||portfolioArtifactReviewKey(asset)!==portfolioArtifactReviewKey(selected);});
}
export function portfolioDocumentSelectionValid(all:SubmissionWorkSource|null|undefined,current:PortfolioSourceWork|null|undefined,item:PortfolioItem,chosen:string[]):boolean {
  if(!all||!portfolioDocumentSourcesMatch(all,current,item)||chosen.length>5||new Set(chosen).size!==chosen.length||all.responseKind==='FILE'&&!chosen.length)return false;
  return chosen.every(id=>all.artifacts.some(asset=>asset.id===id&&asset.state==='AVAILABLE'));
}
/** SQL receipts retain full immutable asset metadata; validate it before settling any retry key. */
export function parsePrivateAssetReceipt(value:unknown,expected:unknown,phase:'stage'|'finalize',expectedId?:string):PrivateAsset {
  try {
    const asset=parsePrivateAsset(value);const metadata=assetStageSchema.parse(expected);
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(asset.id)||asset.ownerId!==metadata.ownerId||asset.name!==metadata.name||asset.contentType!==metadata.contentType||asset.byteSize!==metadata.byteSize||asset.sha256!==metadata.sha256||asset.state!==(phase==='stage'?'STAGED':'AVAILABLE')||phase==='finalize'&&(!expectedId||asset.id!==expectedId))throw new LearningApiError('invalid',true);
    return asset;
  } catch {throw new LearningApiError('invalid',true);}
}
export type PortfolioCommandReceipt={id:string;revisionId:string;revision:number;status:'AWAITING_REVIEW'|'REVIEWED'|'PARENT_REVOKED'};
/** Match the SQL command outcome before an immutable-revision command loses its original retry key. */
export function parsePortfolioCommandReceipt(value:unknown,command:'create'|'reflection'|'review'|'revoke',expected?:{id:string;revisionId:string;revision:number}):PortfolioCommandReceipt {
  const invalid=()=>{throw new LearningApiError('invalid',true);};
  if(!value||typeof value!=='object'||Array.isArray(value))return invalid();
  const receipt=value as Record<string,unknown>;const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if(typeof receipt.id!=='string'||!uuid.test(receipt.id)||typeof receipt.revisionId!=='string'||!uuid.test(receipt.revisionId)||!Number.isSafeInteger(receipt.revision)||Number(receipt.revision)<1)return invalid();
  const status=command==='review'?'REVIEWED':command==='revoke'?'PARENT_REVOKED':'AWAITING_REVIEW';
  if(receipt.status!==status)return invalid();
  if(command==='create'){if(receipt.revision!==1)return invalid();}
  else {
    if(!expected||!uuid.test(expected.id)||!uuid.test(expected.revisionId)||!Number.isSafeInteger(expected.revision)||expected.revision<1||receipt.id!==expected.id)return invalid();
    if(command==='reflection'?(receipt.revision!==expected.revision+1||receipt.revisionId===expected.revisionId):(receipt.revision!==expected.revision||receipt.revisionId!==expected.revisionId))return invalid();
  }
  return {id:receipt.id,revisionId:receipt.revisionId,revision:Number(receipt.revision),status};
}


export type PortfolioOrganizationCommand='collection.create'|'placement.create'|'feedback.request';
export type PortfolioOrganizationReceipt={id:string;revision:number};
/** Organization SQL returns a new row ID; only placement revisions follow the original expected basis. */
export function parsePortfolioOrganizationReceipt(value:unknown,command:PortfolioOrganizationCommand,expectedRevision?:number):PortfolioOrganizationReceipt {
 const invalid=():never=>{throw new LearningApiError('invalid',true);};
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid();
 const receipt=value as Record<string,unknown>;const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(typeof receipt.id!=='string'||!uuid.test(receipt.id)||!Number.isSafeInteger(receipt.revision)||Number(receipt.revision)<1)return invalid();
 if(!['collection.create','placement.create','feedback.request'].includes(command))return invalid();
 if(command==='placement.create'&&(!Number.isSafeInteger(expectedRevision)||expectedRevision!<0||expectedRevision!>=Number.MAX_SAFE_INTEGER))return invalid();
 const revision=command==='placement.create'?expectedRevision!+1:1;
 if(receipt.revision!==revision)return invalid();
 return{id:receipt.id,revision};
}


export type PortfolioOrganizationSelection=
 |{kind:'create'}
 |{kind:'placement';itemId:string;revisionId:string;revision:number;placementRevision:number}
 |{kind:'feedback-request';itemId:string;revisionId:string;revision:number}
 |{kind:'review';requestId:string;itemId:string;revisionId:string};
/** In-memory navigation intent only: never restore query content or grant current source authority. */
export function parsePortfolioOrganizationSelection(value:unknown):PortfolioOrganizationSelection {
 const invalid=():never=>{throw new LearningApiError('invalid');};
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid();
 const row=value as Record<string,unknown>;const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const kind=row.kind;
 const keys=kind==='create'?['kind']:kind==='placement'?['kind','itemId','revisionId','revision','placementRevision']:kind==='feedback-request'?['kind','itemId','revisionId','revision']:kind==='review'?['kind','requestId','itemId','revisionId']:null;
 if(!keys||Object.keys(row).length!==keys.length||keys.some(key=>!(key in row)))return invalid();
 if(kind==='create')return{kind};
 if(['itemId','revisionId',...(kind==='review'?['requestId']:[])].some(key=>typeof row[key]!=='string'||!uuid.test(String(row[key]))))return invalid();
 if(kind==='review')return{kind,requestId:String(row.requestId),itemId:String(row.itemId),revisionId:String(row.revisionId)};
 if(!Number.isSafeInteger(row.revision)||Number(row.revision)<1||kind==='placement'&&(!Number.isSafeInteger(row.placementRevision)||Number(row.placementRevision)<0))return invalid();
 if(kind==='placement')return{kind,itemId:String(row.itemId),revisionId:String(row.revisionId),revision:Number(row.revision),placementRevision:Number(row.placementRevision)};
 return{kind:'feedback-request',itemId:String(row.itemId),revisionId:String(row.revisionId),revision:Number(row.revision)};
}
