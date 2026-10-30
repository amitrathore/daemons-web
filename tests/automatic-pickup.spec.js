import {test,expect} from '@playwright/test';
import {boardFixture} from './board-fixture.js';
const id='11111111-1111-4111-8111-111111111111';
const definition={schema_version:'daemons/v1',name:'Creative partner',purpose:'Carry work forward',instructions:'Ask before external actions',required_capabilities:[]};
async function fixture(page){
 const state={enabled:false,revision:0,paused:false,conflict:false,puts:0};
 await page.route('https://api.daemons.ai/v1/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname.slice(4);let data=[];
  if(path==='session')data={account:{email:'owner@example.test'},csrf:'token'};
  else if(path==='connections')data=[{id:'c1',daemon_ids:[id],scopes:['daemons:read','work:execute'],assistant:{name:'My executor'},expires_at:'2099-01-01',revoked:false}];
  else if(path==='daemons')data=[{id,draft:definition,revision:1,published_revision:1}];
  else if(path===`daemons/${id}`)data={id,draft:definition,revision:1,published_revision:1,paused:state.paused};
  else if(path.endsWith('/board'))data={...boardFixture([]),paused:state.paused};
  else if(path.endsWith('/automatic-pickup')){
   if(req.method()==='PUT'){
    state.puts++;const b=req.postDataJSON();expect(req.headers()['x-csrf-token']).toBe('token');expect(b.connection_id).toBe('c1');
    if(state.conflict){state.revision++;state.conflict=false;return route.fulfill({status:409,json:{error:'Automatic pickup changed. Refresh before editing it.'}});}
    expect(b.expected_revision).toBe(state.revision);state.enabled=b.enabled;state.revision++;
   }
   data={daemon_id:id,published:true,paused:state.paused,connections:[{connection_id:'c1',name:'My executor',active:true,enabled:state.enabled,revision:state.revision,last_checked_at:null,last_outcome:null}]};
  }
  await route.fulfill({json:data});
 });return state;
}
test('owner enables/disables pickup, sees mirrored policy, and a conflict never blindly repeats a write',async({page})=>{
 const state=await fixture(page);await page.goto(`/daemons/${id}`);
 const toggle=page.getByRole('checkbox',{name:'Auto-start queued tasks for My executor'});
 await expect(toggle).not.toBeChecked();await expect(page.getByText('Never checked')).toBeVisible();
 await page.getByLabel('Task',{exact:true}).fill('Keep my task draft');
 await toggle.check();await expect(toggle).toBeChecked();await expect(page.getByLabel('Task',{exact:true})).toHaveValue('Keep my task draft');
 await page.goto('/connections');await page.getByText('Automatic pickup by Daemon',{exact:true}).click();await expect(toggle).toBeChecked();
 await toggle.uncheck();await expect(toggle).not.toBeChecked();
 await page.goto(`/daemons/${id}`);await expect(toggle).not.toBeChecked();
 state.conflict=true;await toggle.check();await expect(page.getByRole('status')).toContainText('Automatic pickup changed');await expect(toggle).not.toBeChecked();expect(state.puts).toBe(3);
 state.paused=true;await page.getByRole('button',{name:'Refresh pickup settings'}).click();await expect(page.getByText('Automatic pickup paused.',{exact:false})).toBeVisible();
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/automatic-pickup-mobile.png',fullPage:true});
});
test('setup explains the automatic loop and manual execution remains explicit',async({page})=>{
 await fixture(page);await page.goto('/connect');
 await expect(page.getByRole('heading',{name:'Optional: automatic pickup'})).toBeVisible();
 await expect(page.getByText('Use work_auto_claim',{exact:false})).toBeVisible();
});
