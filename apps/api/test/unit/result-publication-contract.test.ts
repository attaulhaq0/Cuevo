import{describe,it,expect}from'vitest';import * as contracts from'@cuevo/contracts';import type{z}from'zod';
describe('independent native result publication',()=>{
 it('requires a human sharing decision with current publication and immutable result revision',()=>{
  const schema=(contracts as unknown as Record<string,z.ZodType>).resultPublicationSchema;expect(schema).toBeDefined();const input={parentVisible:false,expectedPublicationRevision:0,expectedResultRevision:1,reason:'Revoke parent publication of this exact release.',confirmPublication:true};expect(schema.safeParse(input).success).toBe(true);for(const extra of [{confirmPublication:false},{expectedPublicationRevision:-1},{expectedResultRevision:0},{score:9},{parentVisible:null}])expect(schema.safeParse({...input,...extra}).success).toBe(false);
 });
});
