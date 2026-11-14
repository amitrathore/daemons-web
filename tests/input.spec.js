import {test,expect} from '@playwright/test';
import {boardFixture} from './board-fixture.js';
const id='00000000-0000-4000-8000-000000000009';
async function fixture(page,role='manager'){
 const request={id:'question-1',question:'Which audience? <script>unsafe()</script>',checkpoint:'Research saved. No emails sent. Next: draft outreach.'};
 const work=[{id:'input',daemon_id:id,status:'awaiting_input',attempt:1,attempt_id:'old-attempt',revision:1,input:{task:'Draft outreach'},input_request:request,updated_at:'2026-11-14T10:00:00Z'},{id:'approval',status:'awaiting_approval',revision:1,input:{task:'Suggested follow-up'},updated_at:'2026-11-14T10:00:00Z'}];
 const definition={name:'Research partner',purpose:'Help with research',instructions:'Ask when unclear',required_capabilities:[]};
 let fail=true;const writes=[];
 await page.route('https://api.daemons.ai/v1/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname.slice(4);let data=[];
  if(path==='session')data={account:{email:'owner@example.test'},csrf:'csrf'};
  else if(path==='connections')data=[{daemon_ids:[id],scopes:['work:execute'],expires_at:'2099-01-01',revoked:false}];
  else if(path===`daemons/${id}`)data={id,draft:definition,published_definition:definition,revision:1,published_revision:1,access_role:role};
  else if(path.endsWith('/board'))data=boardFixture(work);
  else if(path.endsWith('/versions'))data=[{revision:1,definition}];
  else if(path.endsWith('/appearance'))data={icon:'spark',color:'violet',revision:0};
  else if(path.endsWith('/automatic-pickup'))data={published:true,connections:[]};
  else if(path.endsWith('/memory'))data={items:[]};
  else if(path.endsWith('/activity'))data={items:[]};
  else if(path.endsWith('/input-history'))data={items:[{...request,answer:'Earlier answer',resolution:'answered'}]};
  else if(path==='work/input/answer-input'){
   writes.push({body:req.postDataJSON(),headers:req.headers()});
   if(fail){fail=false;return route.fulfill({status:503,json:{error:'Temporarily unavailable. Please try again.'}});}
   work[0].status='queued';work[0].input_request=null;work[0].attempt_id=null;work[0].updated_at='2026-11-14T12:00:00Z';data=work[0];
  }
  else if(path==='work/input')data=work[0];
  else if(path==='work/approval')data=work[1];
  await route.fulfill({json:data});
 });
 return {writes,bump(){work[0].updated_at='2026-11-14T11:00:00Z';}};
}

test('Needs you distinguishes Approval and Input; drafts survive polling and failed replies',async({page})=>{
 const state=await fixture(page);await page.goto(`/daemons/${id}`);
 await expect(page.getByRole('region',{name:'Needs you',exact:true})).toBeVisible();
 await expect(page.locator('[data-card-id="input"] .board-card-status')).toHaveText('Input');
 await expect(page.locator('[data-card-id="approval"] .board-card-status')).toHaveText('Approval');
 await page.locator('[data-card="input"] > summary').click();
 const dialog=page.getByRole('dialog',{name:'Task details'});
 await expect(dialog.getByRole('heading',{name:requestQuestion()})).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Try task again'})).toHaveCount(0);
 await dialog.getByLabel('Your answer').fill('Use local founders');
 await page.screenshot({path:'test-results/input-request-desktop.png',fullPage:true});
 state.bump();await page.getByRole('button',{name:'Refresh tasks',exact:true}).evaluate(el=>el.click());
 await expect(dialog.getByLabel('Your answer')).toHaveValue('Use local founders');
 await dialog.getByRole('button',{name:'Reply and queue task'}).click();
 await expect(dialog.getByRole('alert')).toContainText('Temporarily unavailable');
 await expect(dialog.getByLabel('Your answer')).toHaveValue('Use local founders');
 await dialog.getByRole('button',{name:'Reply and queue task'}).click();
 await expect(page.locator('[data-column="queued"] [data-card-id="input"]')).toHaveCount(1);
 expect(state.writes).toHaveLength(2);
 expect(state.writes[0].headers['idempotency-key']).toBeTruthy();
 expect(state.writes[1].headers['idempotency-key']).toBe(state.writes[0].headers['idempotency-key']);
 expect(state.writes[0].headers['x-csrf-token']).toBe('csrf');
 expect(state.writes[0].body).toEqual({request_id:'question-1',answer:'Use local founders'});
 await dialog.getByText('Questions and answers',{exact:true}).click();
 await expect(dialog.getByText('Answer: Earlier answer',{exact:true})).toBeVisible();
 await page.setViewportSize({width:320,height:900});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
function requestQuestion(){return 'Which audience? <script>unsafe()</script>';}

test('viewers can read the question but cannot answer, cancel or approve',async({page})=>{
 const state=await fixture(page,'viewer');await page.goto(`/daemons/${id}`);
 await page.locator('[data-card="input"] > summary').click();
 const dialog=page.getByRole('dialog',{name:'Task details'});
 await expect(dialog.getByRole('heading',{name:requestQuestion()})).toBeVisible();
 await expect(dialog.getByLabel('Your answer')).toHaveCount(0);
 await expect(dialog.getByRole('button',{name:'Cancel task'})).toHaveCount(0);
 expect(state.writes).toHaveLength(0);
});
