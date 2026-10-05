import { test, expect, type Page } from '@playwright/test';
import { currentCoursePreparationOutline, openCurrentStaffAssessment } from './learning-source-navigation';
const id='fa100000-0000-4000-8000-000000000001',other='fa100000-0000-4000-8000-000000000002',courseId='fa200000-0000-4000-8000-000000000001';
const source={id,courseId,title:'Exact checking task',courseTitle:'Current school checking course',status:'DRAFT' as const};
type Choice=typeof source;
async function mountStaff(page:Page,rows:{value:Choice;disabled?:boolean}[]=[{value:source}],open=true,continuation?:{cursor?:string;publishChoice?:Choice}){
  await page.setContent('<div class="learning-workspace"><section class="learning-staff-directory"><details class="learning-staff-choice-disclosure"><summary>Choose current task</summary><ul></ul></details></section><div id="reader"></div></div>');
  await page.evaluate(({rows,open,continuation})=>{
    const workspace=document.querySelector('.learning-workspace')!,list=workspace.querySelector('ul')!;
    (workspace.querySelector('details')as HTMLDetailsElement).open=open;
    const appendChoice=({value,disabled=false}:typeof rows[number])=>{
      const row=document.createElement('li');row.dataset.assessmentChoice=value.id;
      const button=document.createElement('button');button.disabled=disabled;
      const title=document.createElement('strong');title.textContent=value.title;
      const course=document.createElement('small');course.textContent=value.courseTitle;
      button.append(title,course);row.append(button);list.append(row);
      button.onclick=async()=>{
        const response=await fetch('https://learning.fixture.invalid/v1/assessments/'+value.id);await response.json();button.setAttribute('aria-current','true');
        const article=document.createElement('article');article.className='assessment-section';article.dataset.assessmentId=value.id;
        const heading=document.createElement('h2');heading.textContent=value.title;article.append(heading);workspace.querySelector('#reader')!.replaceChildren(article);
      };
    };
    rows.forEach(appendChoice);
    if(continuation){
      const controls=document.createElement('div');controls.className='pagination-actions';
      const more=document.createElement('button');more.id='more';more.textContent='Load more';controls.append(more);workspace.append(controls);
      more.onclick=async()=>{
        const response=await fetch('https://learning.fixture.invalid/v1/assessments?limit=100'+(continuation.cursor?'&cursor='+continuation.cursor:''));await response.json();
        if(continuation.publishChoice)setTimeout(()=>{appendChoice({value:continuation.publishChoice!});more.remove();},100);
      };
    }
  },{rows,open,continuation});
}

test('explicit current staff choice opens only its human task/course receipt and a closed native disclosure',async({page})=>{
  await page.route('https://learning.fixture.invalid/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(source)}));await mountStaff(page,[{value:source},{value:{...source,id:other,courseTitle:'Other current course'}}],false);
  await expect(page.locator('.assessment-section')).toHaveCount(0);const row=await openCurrentStaffAssessment(page,source);await expect(row.getByRole('heading',{name:source.title,exact:true})).toBeVisible();await expect(page.locator(`[data-assessment-choice="${other}"] button`)).not.toHaveAttribute('aria-current','true');
});

test('current staff source refuses missing duplicate human context disabled choice and wrong exact read',async({page})=>{
  for(const state of ['missing','duplicate','disabled','wrongRead','denied']as const){await page.route('https://learning.fixture.invalid/**',route=>route.fulfill({status:state==='denied'?403:200,contentType:'application/json',body:JSON.stringify(state==='wrongRead'?{...source,courseId:other}:source)}));await mountStaff(page,state==='missing'?[]:state==='duplicate'?[{value:source},{value:{...source,id:other}}]:[{value:source,disabled:state==='disabled'}]);await expect(openCurrentStaffAssessment(page,source)).rejects.toThrow();if(['missing','duplicate','disabled'].includes(state))await expect(page.locator('.assessment-section')).toHaveCount(0);await page.unrouteAll({behavior:'wait'});}
});

test('own assessment continuation waits for delayed returned choices before another page and exact selection',async({page})=>{
  const prior={...source,id:other,title:'Earlier source'};let pages=0;await page.route('https://learning.fixture.invalid/**',route=>{const path=new URL(route.request().url()).pathname;if(path==='/v1/assessments'){pages++;return route.fulfill({contentType:'application/json',body:JSON.stringify({items:[source],nextCursor:null})});}return route.fulfill({contentType:'application/json',body:JSON.stringify(source)});});await mountStaff(page,[{value:prior}],true,{cursor:other,publishChoice:source});await openCurrentStaffAssessment(page,source);expect(pages).toBe(1);
});

test('denied source status blocks selection and malformed continued identities are refused',async({page})=>{
  await mountStaff(page);await page.evaluate(()=>{const alert=document.createElement('p');alert.setAttribute('role','alert');alert.textContent='Current source denied';document.querySelector('.learning-workspace')!.prepend(alert)});await expect(openCurrentStaffAssessment(page,source)).rejects.toThrow();await expect(page.locator('.assessment-section')).toHaveCount(0);
  await page.route('https://learning.fixture.invalid/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({items:[{id:'not-a-current-id'}],nextCursor:null})}));await mountStaff(page,[],true,{});await expect(openCurrentStaffAssessment(page,source)).rejects.toThrow();
});

test('same requested cursor and oversized continued assessment pages cannot become current choices',async({page})=>{
  for(const value of [{items:[],nextCursor:other},{items:Array.from({length:101},()=>({id:other})),nextCursor:null}]){await page.route('https://learning.fixture.invalid/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(value)}));await mountStaff(page,[],true,{cursor:other});await expect(openCurrentStaffAssessment(page,source)).rejects.toThrow();await expect(page.locator('.assessment-section')).toHaveCount(0);await page.unrouteAll({behavior:'wait'});}
});

test('course read loading settles before native hidden outline Back and preserves current unsent input',async({page})=>{
  for(const hidden of [false,true]){
    await page.setContent('<div class="course-view"><h1>Exact current course</h1><p role="status">Loading learning…</p><input value="Unsent current source"></div>');
    await page.evaluate(hidden=>{setTimeout(()=>{
      const course=document.querySelector('.course-view')!;
      document.querySelector('[role=status]')!.remove();
      const outline=document.createElement('nav');outline.setAttribute('aria-label','Course structure');outline.hidden=hidden;
      const choice=document.createElement('button');choice.textContent='Exact current course';outline.append(choice);
      if(hidden){const back=document.createElement('button');back.id='back';back.textContent='Back to course structure';back.onclick=()=>{outline.hidden=false};course.append(back);}
      course.append(outline);
    },100)},hidden);
    const outline=await currentCoursePreparationOutline(page);await expect(outline).toBeVisible();await expect(page.locator('input')).toHaveValue('Unsent current source');
  }
});

test('course preparation refuses denied missing duplicate and pending Back instead of using another source',async({page})=>{
  for(const state of ['denied','missing','duplicate','pending']as const){await page.setContent('<div class="course-view"></div>');await page.evaluate(state=>{
    const course=document.querySelector('.course-view')!;
    if(state==='denied'){const alert=document.createElement('p');alert.setAttribute('role','alert');alert.textContent='Denied current source';course.append(alert)}
    if(state!=='missing'){const nav=document.createElement('nav');nav.setAttribute('aria-label','Course structure');nav.hidden=state==='pending';course.append(nav)}
    if(state==='duplicate'){const nav=document.createElement('nav');nav.setAttribute('aria-label','Course structure');course.append(nav)}
    if(state==='pending'){const back=document.createElement('button');back.disabled=true;back.textContent='Back to course structure';course.append(back)}
  },state);await expect(currentCoursePreparationOutline(page)).rejects.toThrow();}
});

test('fixture task and course markup stays literal text through directory continuation and selected reader',async({page})=>{
  const hostile={...source,title:'</script><script>throw new Error("fixture injection")</script>',courseTitle:'<img src=x onerror="throw new Error(1)"> & <b>Current course</b>'};
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));let pages=0;
  await page.route('https://learning.fixture.invalid/**',route=>{if(new URL(route.request().url()).pathname==='/v1/assessments'){pages++;return route.fulfill({contentType:'application/json',body:JSON.stringify({items:[hostile],nextCursor:null})})}return route.fulfill({contentType:'application/json',body:JSON.stringify(hostile)})});
  await mountStaff(page,[],false,{cursor:other,publishChoice:hostile});
  const row=await openCurrentStaffAssessment(page,hostile);await expect(row.getByRole('heading',{name:hostile.title,exact:true})).toHaveText(hostile.title);await expect(page.locator('.learning-workspace strong')).toHaveText(hostile.title);await expect(page.locator('.learning-workspace small')).toHaveText(hostile.courseTitle);await expect(page.locator('.learning-workspace script,.learning-workspace img,.learning-workspace b')).toHaveCount(0);expect(pages).toBe(1);expect(errors).toEqual([]);
});
