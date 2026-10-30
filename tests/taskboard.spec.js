import {test,expect} from '@playwright/test';
import {boardFixture} from './board-fixture.js';
const id='00000000-0000-4000-8000-000000000009';
async function fixture(page){
 let revision=7,boards=0,reads=0,conflict=false,fail=false;
 let work=[{id:'w1',status:'queued',revision:1,input:{task:'Research local partners'},updated_at:'2026-10-28T10:00:00Z'}, {id:'w2',status:'queued',revision:1,input:{task:'Prepare outreach drafts'},updated_at:'2026-10-28T10:00:00Z'}, {id:'w3',status:'working',revision:1,attempt:1,attempt_id:'attempt',input:{task:'Evaluate the first shortlist'},updated_at:'2026-10-28T10:00:00Z'}, {id:'w4',status:'succeeded',revision:1,attempt:1,input:{task:'Define partner criteria'},result:{result:'A completed brief that starts collapsed'},updated_at:'2026-10-28T10:00:00Z'}];
 const definition={name:'Hey108 Cofounder Finder',purpose:'Find a partner to build and launch Hey108',instructions:'Use evidence and ask before outreach.',required_capabilities:[]};
 await page.route('https://api.daemons.ai/v1/**',async route=>{
  const req=route.request(),u=new URL(req.url()),path=u.pathname.slice(4),body=req.postDataJSON();let result;
  if(path.endsWith('/appearance'))result={icon:'spark',color:'violet',revision:0};
    else if(path.endsWith('/automatic-pickup'))result={published:true,paused:false,connections:[]};
    else if(path==='session')result={account:{email:'owner@example.test'},csrf:'csrf'};
  else if(path==='connections')result=[{daemon_ids:[id],scopes:['work:execute'],expires_at:'2099-01-01',revoked:false}];
  else if(path===`daemons/${id}`)result={id,draft:definition,revision:1,published_revision:1};
  else if(path.endsWith('/versions'))result=[{revision:1,definition}];
  else if(path.endsWith('/board')){boards++;if(fail){await route.fulfill({status:503,json:{error:'Temporarily unavailable'}});return;}result=boardFixture(work);result.queue_revision=revision;result.columns.finished.items.forEach(w=>{w.progress='Old progress should stay hidden';});result.columns.working.items.forEach(w=>{w.assistant='Muse';w.progress='Comparing experience and local relationships';});}
  else if(path.endsWith('/work-order')){expect(req.headers()['idempotency-key']).toBeTruthy();expect(req.headers()['x-csrf-token']).toBe('csrf');expect(body.expected_queue_revision).toBe(revision);if(conflict){revision++;await route.fulfill({status:409,json:{error:'The queue changed. Refresh it before reordering.'}});return;}const moving=work.find(w=>w.id===body.work_id);work=work.filter(w=>w!==moving);let pos=body.before_work_id?work.findIndex(w=>w.id===body.before_work_id):work.length;work.splice(pos,0,moving);revision++;result={queue_revision:revision};}
  else if(path.startsWith('work/')){const w=work.find(w=>w.id===path.split('/')[1]);if(path.endsWith('/activity'))result={items:[{id:1,type:'work.progress',created_at:'2026-10-28T10:00:00Z',data:{report:{message:'Progress reported'}}}]};else{reads++;result=w;}}
  else if(path.endsWith('/memory'))result={items:[]};
  else if(path.endsWith('/activity'))result=[];
  else if(path.endsWith('/context'))result={starting_context:null};
  else throw Error(path);
  await route.fulfill({json:result});
 });
 return {get boards(){return boards;},get reads(){return reads;},conflict:()=>conflict=true,fail:()=>fail=true,complete:()=>{work.find(w=>w.id==='w3').status='succeeded';work.find(w=>w.id==='w3').updated_at='2026-10-28T11:00:00Z';work.find(w=>w.id==='w3').result={result:'Shortlist evaluation completed'};}};
}
test('native board has collapsed results, progress, queue controls and usable mobile layout',async({page})=>{
 const state=await fixture(page);await page.goto(`/daemons/${id}`);
 for(const name of ['Queued','In progress','Needs attention','Finished'])await expect(page.getByRole('region',{name,exact:true})).toBeVisible();
 await expect(page.getByText('Old progress should stay hidden',{exact:true})).toHaveCount(0);expect(state.reads).toBe(0);await expect(page.getByText('A completed brief that starts collapsed',{exact:true})).toHaveCount(0);
 await expect(page.getByText('Comparing experience and local relationships',{exact:true})).toBeVisible();
 await page.locator('[data-card="w2"] > summary').click();await expect(page.getByRole('dialog',{name:'Task details'})).toBeVisible();await page.locator('[data-card-id="w2"] [data-move="top"]').focus();await page.keyboard.press('Enter');
 await expect(page.locator('[data-column="queued"] [data-card-id]').first()).toHaveAttribute('data-card-id','w2');
 await page.getByRole('button',{name:'Close task details'}).click();await page.locator('[data-card="w4"] > summary').click();
 await expect(page.getByText('A completed brief that starts collapsed',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Close task details'}).click();
 await page.screenshot({path:'test-results/taskboard-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/taskboard-mobile.png',fullPage:true});
});
test('polling preserves drafts and expanded cards as work completes; errors retain the last board',async({page})=>{
 await page.clock.install();const state=await fixture(page);await page.goto(`/daemons/${id}`);
 await page.getByRole('button',{name:'Add a task',exact:true}).click();await page.getByLabel('Task',{exact:true}).fill('Keep my unfinished assignment');await page.getByRole('button',{name:'Close task composer'}).click();
 await page.getByRole('link',{name:'Memory',exact:true}).click();await page.getByText('Add or edit memory',{exact:true}).click();await page.getByLabel('Title',{exact:true}).fill('Keep my unfinished memory');
 await page.getByRole('link',{name:'Tasks',exact:true}).click();await page.locator('[data-card="w3"] > summary').click();await expect(page.locator('[data-card-id="w3"] .task-title')).toBeVisible();
 state.complete();const before=state.boards;await page.clock.fastForward(15000);await expect.poll(()=>state.boards).toBeGreaterThan(before);
 await expect(page.getByText('Shortlist evaluation completed',{exact:true})).toBeVisible();
 await expect(page.locator('#task-input')).toHaveValue('Keep my unfinished assignment');await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Keep my unfinished memory');
 await expect(page.locator('[data-column="finished"] [data-card="w3"]')).toHaveAttribute('open','');
 const visibleRequests=state.boards;await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}));await page.clock.fastForward(45000);expect(state.boards).toBe(visibleRequests);await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,get:()=>false}));
 state.fail();await page.getByRole('button',{name:'Close task details'}).click();await page.getByRole('button',{name:'Refresh tasks',exact:true}).click();
 await expect(page.locator('#board-error')).toBeVisible();await page.locator('[data-card="w3"] > summary').click();await expect(page.getByText('Shortlist evaluation completed',{exact:true})).toBeVisible();
});
test('a queue conflict refreshes without silently repeating the requested reorder',async({page})=>{
 const state=await fixture(page);state.conflict();let orders=0;page.on('request',r=>{if(r.url().endsWith('/work-order'))orders++;});
 await page.goto(`/daemons/${id}`);await page.locator('[data-card="w2"] > summary').click();await page.locator('[data-card-id="w2"] [data-move="top"]').click();
 await expect(page.locator('#notice')).toContainText('The queue changed');expect(orders).toBe(1);
 await expect(page.locator('[data-column="queued"] [data-card-id]').first()).toHaveAttribute('data-card-id','w1');
});
