import {test,expect} from '@playwright/test';
import {boardFixture} from './board-fixture.js';
const id='11111111-1111-4111-8111-111111111111';
const definition={name:'Long research',purpose:'Carry research forward',instructions:'Report findings',required_capabilities:[]};
async function fixture(page){
 const state={minutes:120,revision:0,conflict:false,puts:0,ends:0,retries:0};
 const work={id:'work1',attempt_id:'attempt1',attempt:1,revision:1,status:'working',check_in_minutes:null,last_check_in_at:'2026-10-31T10:00:00Z',lease_until:null,updated_at:'2026-10-31T10:00:00Z',input:{task:'Read a long report'}};
 await page.route('https://api.daemons.ai/v1/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname.slice(4);let data=[];
  if(path==='session')data={account:{email:'owner@example.test'},csrf:'token'};
  else if(path===`daemons/${id}`)data={id,draft:definition,published_revision:1,revision:1,check_in_minutes:state.minutes,execution_revision:state.revision};
  else if(path.endsWith('/appearance'))data={icon:'spark',color:'violet',revision:0};
  else if(path.endsWith('/automatic-pickup'))data={published:true,connections:[]};
  else if(path.endsWith('/task-discovery'))data=[];
  else if(path.endsWith('/execution-settings')){
   if(req.method()==='PUT'){
    state.puts++;expect(req.headers()['x-csrf-token']).toBe('token');const body=req.postDataJSON();
    if(state.conflict){state.conflict=false;state.revision++;return route.fulfill({status:409,json:{error:'Execution settings changed. Refresh before saving.'}});}
    expect(body.revision).toBe(state.revision);state.minutes=body.check_in_minutes;state.revision++;
   }
   data={check_in_minutes:state.minutes,revision:state.revision};
  }else if(path.endsWith('/board')){data=boardFixture([work]);for(const col of Object.values(data.columns))for(const card of col.items)Object.assign(card,{check_in_minutes:work.check_in_minutes,last_check_in_at:work.last_check_in_at,lease_until:work.lease_until});}
  else if(path==='work/work1')data=work;
  else if(path==='work/work1/activity')data={items:[]};
  else if(path==='work/work1/end-attempt'){
   state.ends++;expect(req.headers()['idempotency-key']).toBeTruthy();expect(req.headers()['x-csrf-token']).toBe('token');expect(req.postDataJSON().attempt_id).toBe('attempt1');
   work.status='attention_required';work.attention_reason='owner_ended';work.updated_at='2026-10-31T11:00:00Z';data=work;
  }else if(path==='work/work1/retry'){state.retries++;work.status='queued';work.updated_at='2026-10-31T12:00:00Z';work.attempt_id=null;data=work;}
  await route.fulfill({json:data});
 });return state;
}
test('check-in choices save, persist, explain unlimited work, and conflicts require refresh',async({page})=>{
 const state=await fixture(page);await page.goto(`/daemons/${id}#settings`);
 const select=page.getByLabel('Assistant check-in interval');await expect(select).toHaveValue('120');
 await expect(page.getByText('Tasks can take longer.',{exact:false})).toBeVisible();
 for(const value of ['30','480','none']){
  await select.selectOption(value);await expect(page.locator('[data-execution-state]')).toHaveText('Unsaved changes.');if(value==='none')await expect(page.getByText('Disconnected assistants do not expire automatically.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Save execution settings'}).click();await expect(page.getByText('Saved. This applies to new attempts.')).toBeVisible();
 }
 await expect.poll(()=>state.minutes).toBe(null);await page.reload();await expect(select).toHaveValue('none');
 state.conflict=true;await select.selectOption('120');await page.getByRole('button',{name:'Save execution settings'}).click();await expect(page.locator('[data-execution-state]')).toContainText('Refresh before saving');expect(state.puts).toBe(4);
 await page.getByRole('button',{name:'Refresh settings',exact:true}).click();await expect(select).toHaveValue('none');
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:'test-results/execution-settings-mobile.png',fullPage:true});
});
test('end requires inline confirmation and retry remains separate',async({page})=>{
 const state=await fixture(page);await page.goto(`/daemons/${id}`);
 await expect(page.locator('.board-card-check-in')).toContainText('No automatic expiry');
 await page.locator('[data-card="work1"] > summary').click();await expect(page.getByRole('dialog',{name:'Task details'})).toBeVisible();
 await expect(page.getByRole('dialog')).toContainText('Last check-in');
 await page.getByRole('button',{name:'End this attempt',exact:true}).click();await expect(page.getByRole('group',{name:'End this attempt?'})).toContainText('may still be working outside Daemons.ai');await page.getByRole('button',{name:'Keep attempt running'}).click();expect(state.ends).toBe(0);
 await page.getByRole('button',{name:'End this attempt',exact:true}).click();await page.getByRole('button',{name:'End attempt and require review'}).click();await expect(page.getByRole('dialog')).toContainText('You ended this attempt');expect(state.ends).toBe(1);expect(state.retries).toBe(0);
 await page.getByRole('button',{name:'Try task again'}).click();await expect(page.locator('[data-column="queued"] [data-card-id="work1"]')).toBeVisible();expect(state.retries).toBe(1);
});
