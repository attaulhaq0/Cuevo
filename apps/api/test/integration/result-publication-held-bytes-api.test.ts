import{describe,it,expect}from'vitest';import{createHash}from'node:crypto';import{createCustomerContext,customerCourse,customerActor}from'./customer-test-context';
describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION!=='1')('result publication revocation while private bytes are held',()=>{
 it('reauthorizes the exact academic publication after real Storage returns and sends no protected bytes',async()=>{
  let release!:()=>void;let fetched!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});const observed=new Promise<void>(resolve=>{fetched=resolve;});let hold=false;
  const context=await createCustomerContext({portfolioStorage:storage=>({...storage,download:async path=>{const bytes=await storage.download(path);if(hold){fetched();await gate;}return bytes;}})});
  const bytes=Buffer.from('Held protected school document. مصدر خاص.');const sha256=createHash('sha256').update(bytes).digest('hex');
  try{
   // Identity admission must succeed before this case reaches its held-byte revocation boundary.
   const confirmedNames=(await context.client.query<{actor_id:string;display_name:string}>('update app.people set display_name=case when actor_id=$2 then $4 else $5 end where school_id=$1 and actor_id in($2,$3)and synthetic is true returning actor_id,display_name',[context.school,customerActor(12),customerActor(13),'Lina Al-Kuwari','Omar Al-Kuwari'])).rows.sort((left,right)=>left.actor_id.localeCompare(right.actor_id));
   expect(confirmedNames).toEqual([{actor_id:customerActor(12),display_name:'Lina Al-Kuwari'},{actor_id:customerActor(13),display_name:'Omar Al-Kuwari'}]);
   expect(new Set(confirmedNames.map(person=>person.display_name)).size).toBe(2);
   const course=await customerCourse(context,'Held academic source publication');const assessment=await context.command('teacher','/v1/assessments',{courseId:course.courseId,title:'Held publication task',instructions:'Submit the exact school document.',maxScore:10});await context.command('teacher',`/v1/assessments/${assessment.id}/reference`,{referenceId:context.referenceId,expectedPolicyVersion:1});
   const asset=await context.command('strong',`/v1/assessments/${assessment.id}/work-assets`,{name:'School source.txt',contentType:'text/plain',byteSize:bytes.length,sha256});await context.command('strong',`/v1/assessments/${assessment.id}/work-assets/${asset.id}/finalize`,{contentBase64:bytes.toString('base64')});const work=await context.command('strong',`/v1/assessments/${assessment.id}/work-submissions`,{responseKind:'FILE',content:'',assetIds:[asset.id]});const mark=await context.command('teacher',`/v1/submissions/${work.id}/results`,{score:4,feedback:'Reviewed exact file work.',expectedPolicyVersion:2,expectedRevision:0,sourceEvidence:true});const result=await context.command('teacher',`/v1/results/${mark.id}/release`,{expectedRevision:1,parentVisible:true});
   const item=await context.command('strong','/v1/portfolio/items',{sourceModel:'numeric',evidenceId:result.evidenceId,title:'Selected file evidence',reflection:'Reviewed school file.',assetIds:[asset.id]});
   const portfolio=await context.request('teacher','/v1/portfolio/items?limit=100');expect(portfolio.statusCode).toBe(200);expect(portfolio.json().items.find((selected:{id:string})=>selected.id===item.id)).toMatchObject({id:item.id,revisionId:item.revisionId,learnerId:customerActor(12),identity:{status:'READY',learnerName:'Lina Al-Kuwari'}});
   await context.command('teacher',`/v1/portfolio/items/${item.id}/review`,{expectedRevision:1,feedback:'Exact parent source reviewed.',featured:false,parentVisible:true,confirmParentApproval:true,confirmSourceReview:true});const path=`/v1/portfolio/items/${item.id}/revisions/${item.revisionId}/artifacts/${asset.id}/download`;
   const initial=await context.request('parent',path);expect(initial.statusCode).toBe(200);expect(createHash('sha256').update(initial.rawPayload).digest('hex')).toBe(sha256);
   hold=true;const pending=context.request('parent',path);await observed;
   await context.command('teacher',`/v1/results/${result.id}/publication`,{parentVisible:false,expectedPublicationRevision:0,expectedResultRevision:1,reason:'School revoked exact result publication during delivery.',confirmPublication:true});release();const denied=await pending;expect(denied.statusCode,denied.body).toBe(403);expect(denied.rawPayload.equals(bytes)).toBe(false);expect(denied.body).not.toContain('Held protected school document');
   expect((await context.request('parent',path)).statusCode).toBe(403);
  }finally{release();await context.close();}
 },45000);
});
