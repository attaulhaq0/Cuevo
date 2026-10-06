import { describe,expect,it } from 'vitest';
import { learningSourceContextSchema } from '@cuevo/contracts';
const id='00000000-0000-4000-8000-000000000001';
describe('exact historical learning source context',()=>{
 it('keeps legacy missing context unknown and rejects invented source content',()=>{expect(learningSourceContextSchema.safeParse({sourceId:id,contextStatus:'UNKNOWN',course:null,lesson:null,activity:null,assessment:null}).success).toBe(true);expect(learningSourceContextSchema.safeParse({sourceId:id,contextStatus:'UNKNOWN',course:{revisionId:id,revision:1,title:'Current title guessed as historical',content:'Current'},lesson:null,activity:null,assessment:null}).success).toBe(false);});
});
