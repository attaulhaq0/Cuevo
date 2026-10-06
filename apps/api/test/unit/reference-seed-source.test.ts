import{describe,it,expect}from'vitest';
import * as seed from'../../../../scripts/seed-reference-scenarios';
const requireExact=(seed as unknown as{requireExactSeedSource:(actual:Record<string,unknown>|undefined,expected:Record<string,unknown>)=>void}).requireExactSeedSource;
const source={id:'90000000-0000-4000-8000-000000000001',packVersionId:'90000000-0000-4000-8000-000000000002',parentId:null,type:'objective',title:'School check',description:'School authored',code:null,sequence:1,subjectId:null,yearGroupId:null};
describe('immutable reference reseed source',()=>{
 it('requires an existing exact source identity before reusing a reviewed record',()=>{expect(requireExact).toBeDefined();expect(()=>requireExact(source,{...source})).not.toThrow();expect(()=>requireExact(undefined,source)).toThrow();});
 it.each(['packVersionId','parentId','type','title','description','code','sequence','subjectId','yearGroupId'])('fails closed for changed %s instead of updating the immutable source',field=>{expect(requireExact).toBeDefined();expect(()=>requireExact({...source,[field]:'changed'},source)).toThrow();});
});
