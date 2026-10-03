import { describe, expect, it } from 'vitest';
import * as contracts from '@cuevo/contracts';
import type { z } from 'zod';
const id='90000000-0000-4000-8000-000000000001';
const programme={id,packVersionId:id,name:'School pathway',classId:id,className:'Cedar',subjectId:id,subjectName:'Mathematics',yearGroupId:id,yearGroupName:'Year 1',academicYearName:'2026–2027',framework:'School Custom',packProgramme:'Primary pathway',packVersion:'v1'};
const schema=(name:string)=>(contracts as unknown as Record<string,z.ZodType>)[name];
describe('current curriculum directory contracts',()=>{
 it('requires human programme context and rejects hidden payload fields',()=>{const contract=schema('curriculumProgrammeSchema');expect(contract).toBeDefined();expect(contract.safeParse(programme).success).toBe(true);expect(contract.safeParse({...programme,subjectName:''}).success).toBe(false);expect(contract.safeParse({...programme,privateNote:'private'}).success).toBe(false);});
 it('keeps exact current assignment identity, approved source and explicit revoked status',()=>{const contract=schema('programmeLearnerPageSchema');expect(contract).toBeDefined();const item={id,programmeId:id,learnerId:id,learnerName:'Aisha',status:'revoked',approvedByName:'School coordinator',updatedAt:'2026-10-02T00:00:00Z'};expect(contract.safeParse({programme,items:[item],nextCursor:null}).success).toBe(true);expect(contract.safeParse({programme,items:[{...item,programmeId:'90000000-0000-4000-8000-000000000002'}],nextCursor:null}).success).toBe(false);expect(contract.safeParse({programme,items:[item,item],nextCursor:null}).success).toBe(false);});
});
