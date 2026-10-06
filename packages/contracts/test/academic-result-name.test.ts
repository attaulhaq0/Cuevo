import { describe, expect, it } from 'vitest';
import { academicReportResultSchema, academicReportSchema } from '../src/academic';
const id=(n:number)=>`40000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const result={id:id(1),submissionId:id(2),assessmentId:id(3),learnerId:id(4),revision:1,feedback:'Current school feedback',status:'RELEASED',policyVersion:2,referenceId:id(5),referenceVersion:'school-v1',evidenceId:id(6),createdAt:'2026-10-05T08:00:00Z',actorId:id(7),parentVisible:false,assessmentTitle:'Explain a method',referenceTitle:'Checking reasons',model:'numeric',score:0,maxScore:10,nativeResult:{type:'numeric',score:0,maxScore:10,policyVersion:2}};
const resultBase=Object.fromEntries(Object.entries(result).filter(([key])=>!['score','maxScore','nativeResult'].includes(key)));
const rubric={...resultBase,model:'rubric',nativeResult:{type:'rubric',rubricId:id(10),rubricTitle:'School checking rubric',rubricVersion:'school-v1',policyVersion:2,normalized:null,criteria:[{criterionKey:'check',criterionTitle:'Checking',levelKey:'shown',levelLabel:'Shown',levelDescription:'A checking step is shown.'}]}};
describe('current result learner-name read contract',()=>{
 it('accepts legacy absence, explicit unknown and current literal names without changing native zero',()=>{
  for(const row of [result,{...result,learnerName:null},{...result,learnerName:'Lina Al-Kuwari'},{...result,learnerName:'  Current school name  '},{...result,learnerName:id(4)}]) {
   const parsed=academicReportResultSchema.parse(row);expect(parsed.nativeResult).toEqual(result.nativeResult);expect(parsed.learnerId).toBe(result.learnerId);if('learnerName'in row)expect(parsed.learnerName).toBe(row.learnerName);
  }
 });
 it('retains the same nullable human context for native rubric rows without numeric substitutes',()=>{
  for(const name of [null,'Lina Al-Kuwari']){const parsed=academicReportResultSchema.parse({...rubric,learnerName:name});expect(parsed.learnerName).toBe(name);expect(parsed.nativeResult).toEqual(rubric.nativeResult);expect(parsed).not.toHaveProperty('score');expect(parsed).not.toHaveProperty('maxScore');}
 });
 it.each(['','   ','x'.repeat(201),42,false,{},[]])('rejects malformed learner-name context %j',name=>{
  expect(academicReportResultSchema.safeParse({...result,learnerName:name}).success).toBe(false);
 });
 it('keeps ordinary and period report rows compatible while preserving strict private-field rejection',()=>{
  const report={schemaVersion:'1',schoolId:id(8),learnerId:id(4),generatedAt:'2026-10-05T08:00:00Z',scope:'CURRENT_RELEASED_PAGE',coverage:'NOT_ESTABLISHED',items:[{...result,learnerName:null}],nextCursor:null};
  expect(academicReportSchema.safeParse(report).success).toBe(true);
  expect(academicReportSchema.safeParse({...report,scope:'CURRENT_RELEASED_PERIOD_PAGE',period:{id:id(9),name:'Autumn',revision:1,startsOn:'2026-09-01',endsOn:'2026-12-01',basis:'SOURCE_SUBMITTED_DATE_UTC'}}).success).toBe(true);
  expect(academicReportSchema.safeParse({...report,items:[{...result,learnerName:'Lina',privateNote:'Excluded'}]}).success).toBe(false);
 });
});
