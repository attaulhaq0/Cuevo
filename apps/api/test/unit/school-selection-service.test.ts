import { describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import type { Database } from '../../src/platform/database/database';
import { SchoolService } from '../../src/modules/school/school.service';
const id='00000000-0000-4000-8000-000000000001';
const actor={userId:id,schoolId:id,membershipId:id,role:'admin' as const,entitlements:['school.operations','school.context']};
const person={id,displayName:'Current learner',role:'student',status:'active',effectiveFrom:'2026-10-01T00:00:00Z',effectiveTo:null,synthetic:true,revision:1,selectionContext:{status:'READY',enrollmentState:'NONE',classes:[]}};
function service(page:unknown){return new SchoolService({actorTransaction:async(_actor:string,_school:string,callback:(client:PoolClient)=>Promise<unknown>)=>callback({query:async()=>({rows:[{page}]})}as unknown as PoolClient)}as unknown as Database);}
describe('School current selection read validation',()=>{
 it('returns the owner context without manufacturing enrollment',async()=>{expect(await service({items:[person],nextCursor:null}).list(actor,'people',{limit:100})).toEqual({items:[person],nextCursor:null});});
 it('refuses missing or private selection response fields',async()=>{for(const page of [{items:[{...person,selectionContext:undefined}],nextCursor:null},{items:[{...person,privateNote:'hidden'}],nextCursor:null},{items:[person,person],nextCursor:null}])await expect(service(page).list(actor,'people',{limit:100})).rejects.toMatchObject({code:'REQUEST_UNAVAILABLE',status:503});});
});
