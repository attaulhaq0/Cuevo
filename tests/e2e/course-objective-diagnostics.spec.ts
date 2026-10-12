import { test, expect } from '@playwright/test';
import { attachDiagnosticPreservingFailure, diagnosticSource, observeCourseObjectiveTransport, serializeFailureDiagnostic } from './course-objective-diagnostics';
import { observeProgressFocus } from './progress-focus-diagnostics';

test('Community read failure diagnostics retain only bounded source state and reject private fields', () => {
  const read={reason:'UNSETTLED',source:'CLASS_ROSTER',role:'teacher',generation:1,confirmedWriteCount:1,cancelled:true,parsed:false,hasCursor:false,elapsedMs:15000,pendingReadCount:1};
  const value={schemaVersion:'1',code:'COMMUNITY_CURRENT_SOURCE_UNVERIFIED',confirmedWriteCount:1,read};
  expect(JSON.parse(serializeFailureDiagnostic(value))).toEqual(value);
  expect(JSON.parse(serializeFailureDiagnostic({...value,read:null}))).toEqual({...value,read:null});
  for(const extra of ['url','actorId','authorization','body','error','schoolId','token'])expect(()=>serializeFailureDiagnostic({...value,read:{...read,[extra]:'private-pupil-content-canary'}})).toThrow();
  expect(()=>serializeFailureDiagnostic({...value,privateDiagnostic:'private-pupil-content-canary'})).toThrow();
  for(const changed of [{source:'/v1/community/rooms/private/roster'},{role:'foreign'},{reason:'Raw driver failure'},{generation:0},{elapsedMs:3600001},{pendingReadCount:1001},{confirmedWriteCount:1001}])expect(()=>serializeFailureDiagnostic({...value,read:{...read,...changed}})).toThrow();
  expect(()=>serializeFailureDiagnostic({...value,confirmedWriteCount:1001})).toThrow();
});

test('course objective diagnostics preserve endpoint class while excluding keys, credentials and queries', () => {
  const origins={api:'https://api.fixture.invalid',auth:'https://auth.fixture.invalid',web:'https://web.fixture.invalid'};
  expect(diagnosticSource('https://api.fixture.invalid/v1/assessments/a1000000-0000-4000-8000-000000000001/preparation?token=private&answer=pupil',origins)).toEqual({origin:'api',path:'/v1/assessments/{record}/preparation'});
  expect(diagnosticSource('https://auth.fixture.invalid/auth/v1/logout?access_token=private',origins)).toEqual({origin:'auth',path:'/auth/v1/logout'});
  expect(diagnosticSource('https://outside.invalid/pupil-name?token=private',origins)).toEqual({origin:'other',path:'other'});
  expect(diagnosticSource('https://api.fixture.invalid/v1/private-pupil-title',origins)).toEqual({origin:'api',path:'/v1/other'});
  expect(diagnosticSource('https://api.fixture.invalid/'+Array(20).fill('v1').join('/'),origins)).toEqual({origin:'api',path:'bounded-other'});
  expect(diagnosticSource('https://api.fixture.invalid/v1/'+ 'private'.repeat(100),origins)).toEqual({origin:'api',path:'bounded-other'});
});

test('course objective diagnostics distinguish response 401 from cancelled transport without raw bodies', async ({page}) => {
  const read=observeCourseObjectiveTransport(page,{api:'https://api.fixture.invalid',auth:null,web:'about:blank'});
  await page.route('https://api.fixture.invalid/**',route=>route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({private:'Raw pupil content must not leave the page'})}));
  await page.evaluate(async()=>{await fetch('https://api.fixture.invalid/v1/me?token=private')});
  await expect.poll(()=>read().observations.some(row=>row.kind==='response'&&row.status===401)).toBe(true);
  expect(JSON.stringify(read())).not.toMatch(/private|pupil|token=|Raw/);
  expect(read().observations.find(row=>row.kind==='response')).toMatchObject({origin:'api',path:'/v1/me',method:'GET',status:401,cancelled:null});
});

test('Progress focus diagnostics record only current parity and bounded source status',async({page})=>{
 const read=observeProgressFocus(page,'https://api.fixture.invalid');await page.setContent('<html lang="ar" dir="rtl"><section class="progress-workspace"><select id="summary-class"><option value="private">Current class</option></select><h2 class="learner-detail-heading" tabindex="-1" aria-label="شواهد الطالب الحالي · Lina Al-Kuwari">Current source name</h2><article data-class-learner-id="private"></article></section></html>');await page.locator('h2').focus();const result=await read(/^شواهد الطالب الحالي · Lina Al-Kuwari/);expect(result.dom).toMatchObject({headingCount:1,labelMatches:true,headingFocused:true,classSelected:true,alertCount:0});expect(JSON.stringify(result)).not.toMatch(/private|Lina|Current source name|Current class/);
});

test('failed diagnostic attachment preserves the exact original assertion',async()=>{
 const original=new Error('Original current-source assertion'),attachment=new Error('Attachment failed');let captures=0;await expect(attachDiagnosticPreservingFailure(async()=>{throw original},async()=>{captures++;throw attachment})).rejects.toBe(original);expect(captures).toBe(1);expect(await attachDiagnosticPreservingFailure(async()=>7,async()=>{throw attachment})).toBe(7);
});

test('CI failure diagnostics reject arbitrary fields and text before serialization',()=>{
 const valid={schemaVersion:'1',code:'COURSE_OBJECTIVE_TRANSPORT_UNVERIFIED',observations:[{origin:'api',path:'/v1/me',sequence:1,kind:'response',method:'GET',status:401,cancelled:null,unauthorizedConsole:null}],truncated:false};expect(JSON.parse(serializeFailureDiagnostic(valid))).toEqual(valid);expect(()=>serializeFailureDiagnostic({...valid,privateContent:'pupil text'})).toThrow();expect(()=>serializeFailureDiagnostic({...valid,observations:[{...valid.observations[0],path:'/v1/private?pupil=raw'}]})).toThrow();expect(()=>serializeFailureDiagnostic({...valid,observations:[{...valid.observations[0],path:'/v1/pupil-name'}]})).toThrow();expect(()=>serializeFailureDiagnostic({...valid,observations:Array(41).fill(valid.observations[0])})).toThrow();
});
