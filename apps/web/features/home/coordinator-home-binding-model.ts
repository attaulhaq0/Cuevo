import { LearningApiError } from '../../shared/api/client.ts';
import { parsePeriodCoverage } from '../curriculum/model.ts';
import { parseIntervention,parseOutcome,type Intervention,type Outcome } from '../improvement/model.ts';
import {parseSchoolRow} from '../school/model.ts';
export type CoordinatorHomeReadContext={apiUrl:string;membership:{schoolId:string;userId:string;role:string}|null;accessToken:string|null;accessGeneration:number;online:boolean;status:string};
export type CoordinatorHomeRead<T>={scope:string|null;value:T};
export function coordinatorHomeReadScope(app:CoordinatorHomeReadContext,courseId:string,periodId:string,path:string|null,refresh:number):string|null {
 if(!path||!app.online||app.status!=='ready'||app.membership?.role!=='coordinator'||!app.accessToken)return null;
 return JSON.stringify([app.apiUrl,app.membership.schoolId,app.membership.userId,app.membership.role,app.accessToken,app.accessGeneration,courseId,periodId,path,refresh]);
}
export function currentCoordinatorHomeRead<T>(source:CoordinatorHomeRead<T>|null|undefined,scope:string|null):T|null{return scope&&source?.scope===scope?source.value:null;}
export function parseCoordinatorHomeCoverage(value:unknown,courseId:string,periodId:string,revision:number) {
 const page=parsePeriodCoverage(value);if(page.courseId!==courseId||page.periodId!==periodId||page.periodRevision!==revision||page.items.some(plan=>plan.sourceStatus==='CURRENT'&&plan.periodRevision!==revision))throw new LearningApiError('invalid');return page;
}
export function coordinatorHomePlanIsCurrent(plan:{sourceStatus:string;periodRevision:number},revision:number):boolean{return plan.sourceStatus==='CURRENT'&&plan.periodRevision===revision;}
export function coordinatorHomeChoices<T extends {id:string}>(rows:T[],label:(row:T)=>string) {
 const choices=rows.map(row=>({value:row.id,label:label(row)}));return choices.map(choice=>({...choice,requiresReview:!choice.label.trim()||choices.filter(candidate=>candidate.label===choice.label).length!==1}));
}
export function coordinatorHomePeriod(value:unknown) {
 const row=parseSchoolRow(value);if(typeof row.name!=='string'||!row.name.trim()||typeof row.startsOn!=='string'||typeof row.endsOn!=='string'||!Number.isInteger(row.revision)||Number(row.revision)<1)throw new LearningApiError('invalid');return {...row,name:row.name,startsOn:row.startsOn,endsOn:row.endsOn,revision:Number(row.revision)};
}
export function coordinatorHomeOutcome(outcomeValues:unknown[],taskValues:unknown[]):{outcome:Outcome;task:Intervention}|null {
 const tasks=taskValues.map(parseIntervention),outcomes=outcomeValues.map(value=>parseOutcome(value)).sort((a,b)=>Date.parse(b.measuredAt)-Date.parse(a.measuredAt));
 for(const outcome of outcomes){const task=tasks.find(task=>task.id===outcome.interventionId&&task.status==='MEASURED'&&!task.requiresReview&&task.baselineResultId===outcome.baselineResultId&&(!outcome.context||outcome.context.learnerId===task.learnerId));if(task&&!outcome.requiresReview)return {outcome,task};}return null;
}
