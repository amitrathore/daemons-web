import {test,expect} from '@playwright/test';
import {boardFixture} from './board-fixture.js';
const id='11111111-1111-4111-8111-111111111111', owner='22222222-2222-4222-8222-222222222222', binding='33333333-3333-4333-8333-333333333333', source='44444444-4444-4444-8444-444444444444', executor='55555555-5555-4555-8555-555555555555';
async function fixture(page,manager=true){
 const action={binding_id:binding,connection_id:source,name:'drive.read',description:'Read a document <img src=x>',account_label:'Test Drive',fingerprint:'schema',input:{type:'object',properties:{id:{type:'string'}}}};
 const tools={configured:true,can_manage:manager,revision:0,draft:[],published_revision:null,published:[],connections:[{id:binding,status:'active',contributor_id:owner,contributor:'owner@example.test',revision:1,delegation:{audience_mode:'selected',executors:[executor]}}],executors:[{id:executor,name:'Muse',scopes:['work:execute','tools:use']}]};
 const writes=[];
 await page.route('https://api.daemons.ai/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname.slice(4),method=req.method();let data;
  if(method!=='GET')writes.push({p,body:req.postDataJSON()});
  const definition={name:'Research Daemon',purpose:'Research carefully',instructions:'Use sources',required_capabilities:[]};
  if(p==='session')data={account:{id:owner,email:'owner@example.test'},csrf:'fixture'};
  else if(p===`daemons/${id}`)data={id,draft:definition,published_definition:definition,revision:1,published_revision:1,access_role:manager?'manager':'viewer',paused:false};
  else if(p==='connections')data=[];
  else if(p.endsWith('/versions'))data=[{revision:1,definition}];
  else if(p.endsWith('/board'))data=boardFixture([]);
  else if(p.endsWith('/appearance'))data={icon:'compass',color:'coral',revision:0};
  else if(p.endsWith('/execution-settings'))data={check_in_minutes:120,revision:0};
  else if(p.endsWith('/automatic-pickup'))data={connections:[]};
  else if(p.endsWith('/tools'))data=tools;
  else if(p.endsWith('/tools-actions'))data={actions:[action]};
  else if(p.endsWith('/tools-draft')){expect(req.postDataJSON()).toEqual({expected_revision:0,actions:[{binding_id:binding,connection_id:source,action:'drive.read'}]});tools.revision=1;tools.draft=[action];data=tools;}
  else if(p.endsWith('/tools-publish')){expect(req.postDataJSON().expected_revision).toBe(1);tools.published_revision=1;tools.published=[action];data=tools;}
  else if(p.endsWith('/tools-remove')){expect(req.postDataJSON()).toEqual({binding_id:binding,expected_revision:1});tools.connections=[];data=tools;}
  else if(p.endsWith('/tools-connect'))data={url:'https://app.toolisman.com/authorize?request=fixture'};
  else if(p.endsWith('/tools-activity'))data={invocations:[]};
  else if(p.endsWith('/memory'))data={items:[]};
  else data=[];
  await route.fulfill({json:data});
 });
 await page.goto(`/daemons/${id}#tools`);await expect(page.getByRole('heading',{name:'Connected tools'})).toBeVisible();return {tools,writes};
}
test('manager reviews and publishes specific actions, then removes live access',async({page})=>{
 await fixture(page);await page.getByRole('button',{name:'Review available actions'}).click();
 await page.getByLabel(/drive.read · Test Drive/).check();
 await expect(page.locator('[data-room-panel="tools"] img')).toHaveCount(0);
 await page.getByRole('button',{name:'Save tool draft'}).click();
 await expect(page.getByRole('button',{name:'Publish tool policy'})).toBeVisible();
 await page.getByRole('button',{name:'Publish tool policy'}).click();
 await expect(page.getByText('Published policy 1. Draft revision 1.')).toBeVisible();
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Remove access now'}).click();
 await expect(page.getByText('No accounts connected to this Daemon yet.')).toBeVisible();
});
test('executor audience is selected explicitly before the Toolisman redirect',async({page})=>{
 const {writes}=await fixture(page);
 await page.route('https://app.toolisman.com/**',r=>r.fulfill({body:'Fixture Toolisman consent'}));
 await page.getByRole('checkbox',{name:/Muse/}).check();
 await page.getByRole('button',{name:'Continue to Toolisman'}).click();
 await page.waitForURL('https://app.toolisman.com/authorize?request=fixture');
 expect(writes.find(w=>w.p.endsWith('/tools-connect')).body).toEqual({audience_mode:'selected',executors:[executor]});
});
test('viewers see published capabilities without management controls',async({page})=>{
 await fixture(page,false);await expect(page.getByText('A Daemon manager can change its tool policy.',{exact:false})).toBeVisible();
 await expect(page.getByRole('button',{name:'Continue to Toolisman'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Remove access now'})).toHaveCount(0);
});
