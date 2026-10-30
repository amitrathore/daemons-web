import {test,expect} from '@playwright/test';
import {boardFixture} from './board-fixture.js';
const id='11111111-1111-4111-8111-111111111111';
const definition={schema_version:'daemons/v1',name:'Hey108 Cofounder Finder',purpose:'Find the right partner to build and launch a local-first community platform.',instructions:'Use evidence. Ask before outreach.',required_capabilities:[]};
async function fixture(page){
 const state={appearance:{icon:'compass',color:'coral',revision:0},writes:0,conflict:false,fail:false};
 await page.route('https://api.daemons.ai/v1/**',async route=>{
  const req=route.request(),p=new URL(req.url()).pathname.slice(4);let data;
  const daemon={id,draft:definition,revision:1,published_revision:1,paused:false};
  if(p==='session')data={account:{email:'design@example.test'},csrf:'csrf'};
  else if(p==='control-room')data=[{...daemon,appearance:state.appearance,work_summary:{counts:{queued:3,working:1,attention:1},updated_at:new Date().toISOString()}},{...daemon,id:'22222222-2222-4222-8222-222222222222',draft:{...definition,name:'Weekly creative partner',purpose:'Turn scattered ideas into a clear plan for the week.'},appearance:{icon:'spark',color:'violet'},work_summary:{counts:{queued:2,working:0,attention:0}}},{...daemon,id:'33333333-3333-4333-8333-333333333333',draft:{...definition,name:'Research scout',purpose:'Find useful signals, save the evidence, and connect the dots.'},appearance:{icon:'search',color:'mint'},work_summary:{counts:{queued:0,working:1,attention:0}}}];
  else if(p===`daemons/${id}`)data=daemon;
  else if(p.endsWith('/appearance')){if(req.method()==='PUT'){state.writes++;expect(req.headers()['x-csrf-token']).toBe('csrf');if(state.conflict){state.conflict=false;state.appearance={icon:'leaf',color:'mint',revision:1};return route.fulfill({status:409,json:{error:'Appearance changed. Refresh before saving again.'}});}const b=req.postDataJSON();expect(b.expected_revision).toBe(state.appearance.revision);state.appearance={icon:b.icon,color:b.color,revision:b.expected_revision+1};}data=state.appearance;}
  else if(p==='connections')data=[{daemon_ids:[id],scopes:['work:execute'],expires_at:'2099-01-01',revoked:false}];
  else if(p.endsWith('/versions'))data=[{revision:1,definition}];
  else if(p.endsWith('/board'))data=boardFixture([{id:'task1',status:'queued',input:{task:'Prepare the next cofounder shortlist'},updated_at:new Date().toISOString()},{id:'task2',status:'working',input:{task:'Review local merchant experience'},updated_at:new Date().toISOString()},{id:'task3',status:'succeeded',input:{task:'Define the partner criteria'},updated_at:new Date().toISOString()}]);
  else if(p.endsWith('/automatic-pickup'))data={published:true,connections:[]};
  else if(p.endsWith('/memory'))data={items:[]};
  else if(p.endsWith('/work')&&req.method()==='POST'){if(state.fail)return route.fulfill({status:503,json:{error:'Try again shortly.'}});data={};}
  else data=[];
  await route.fulfill({json:data});
 });return state;
}
test('control room is scannable, searchable, priority sorted and responsive in both themes',async({page})=>{
 await fixture(page);await page.goto('/');
 await expect(page.locator('.daemon-card').first()).toContainText('Hey108');
 await expect(page.locator('.daemon-card').nth(1)).toContainText('Research scout');
 await expect(page.getByRole('heading',{name:'How Daemons.ai works'})).not.toBeVisible();
 await page.getByRole('searchbox',{name:'Search Daemons'}).fill('weekly');await expect(page.locator('.daemon-card')).toHaveCount(1);
 await page.getByRole('searchbox',{name:'Search Daemons'}).fill('no matches');await expect(page.getByText('No Daemons match your search.')).toBeVisible();
 await page.getByRole('searchbox',{name:'Search Daemons'}).fill('');
 for(const theme of ['light','dark']){await page.getByRole('combobox',{name:'Appearance'}).selectOption(theme);for(const width of [1440,768,375]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/control-room-${theme}-${width}.png`,fullPage:true});}}
});
test('appearance persists independently; conflicts refresh without a second write; task drafts survive tabs, Escape and errors',async({page})=>{
 const state=await fixture(page);await page.goto(`/daemons/${id}`);
 await page.getByRole('button',{name:'Customize Daemon appearance'}).click();await expect(page).toHaveURL(/#settings$/);
 await page.getByRole('radio',{name:'rocket',exact:true}).check();await page.getByRole('radio',{name:'sky',exact:true}).check();await page.getByRole('button',{name:'Save appearance'}).click();await expect(page.locator('#notice')).toContainText('Appearance saved');
 await page.reload();await expect(page.getByRole('radio',{name:'rocket',exact:true})).toBeChecked();
 state.conflict=true;await page.getByRole('radio',{name:'star',exact:true}).check();await page.getByRole('button',{name:'Save appearance'}).click();await expect(page.locator('#notice')).toContainText('Appearance changed');await expect(page.getByRole('radio',{name:'leaf',exact:true})).toBeChecked();expect(state.writes).toBe(2);
 await page.getByRole('button',{name:'Add a task',exact:true}).click();await page.getByLabel('Task',{exact:true}).fill('Keep this thought');await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Add a task',exact:true})).toBeFocused();
 await page.getByRole('link',{name:'Memory',exact:true}).click();await page.getByText('Add or edit memory',{exact:true}).click();await page.getByLabel('Title',{exact:true}).fill('A durable thought');await page.getByRole('link',{name:'Instructions',exact:true}).click();await page.getByRole('link',{name:'Memory',exact:true}).click();await expect(page.getByLabel('Title',{exact:true})).toHaveValue('A durable thought');
 await page.getByRole('button',{name:'Add a task',exact:true}).click();await expect(page.getByLabel('Task',{exact:true})).toHaveValue('Keep this thought');state.fail=true;await page.getByRole('button',{name:'Add task',exact:true}).click();await expect(page.locator('#notice')).toContainText('Try again shortly');await expect(page.getByLabel('Task',{exact:true})).toHaveValue('Keep this thought');await page.keyboard.press('Escape');
 await page.getByRole('link',{name:'Tasks',exact:true}).click();await expect(page.locator('#notice')).toBeHidden({timeout:8000});
 for(const theme of ['light','dark']){await page.getByRole('combobox',{name:'Appearance'}).selectOption(theme);for(const width of [1440,768,375]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.getByRole('link',{name:'Settings',exact:true})).toBeInViewport();await page.screenshot({path:`test-results/daemon-room-${theme}-${width}.png`,fullPage:true});}}
});
