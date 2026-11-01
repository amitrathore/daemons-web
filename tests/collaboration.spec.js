import {test,expect} from '@playwright/test';
import {boardFixture} from './board-fixture.js';
const user='11111111-1111-4111-8111-111111111111',org='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
const definition={schema_version:'daemons/v1',name:'Shared research',purpose:'Carry company research forward',instructions:'Use sources',required_capabilities:[]};
async function fixture(page,role='manager'){
 const state={revision:0,invites:0,confirmed:0,scopes:[],writes:[],claimed:false};
 await page.route('https://api.daemons.ai/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname.slice(4),body=req.postDataJSON();let result=[];
  if(req.method()!=='GET'){expect(req.headers()['x-csrf-token']).toBe('csrf');state.writes.push(path);}
  if(path==='session')result={account:{id:user,email:'owner@example.test'},csrf:'csrf',collaboration_enabled:true};
  else if(path==='workspaces')result={items:[{id:user,name:'Personal',kind:'personal',role:'owner'},{id:org,name:'Founders',kind:'org',role:'owner'}]};
  else if(path===`workspaces/${org}`)result={workspace:{id:org,name:'Founders',membership_role:'owner'},members:[{account_id:user,email:'owner@example.test',role:'owner'}],teams:[],invitations:[],audit:[]};
  else if(path==='control-room')result=[{id,draft:definition,workspace_id:org,access_role:role,published_revision:1,work_summary:{counts:{queued:0,working:0,attention:0}}}];
  else if(path===`daemons/${id}`)result={id,...(role==='manager'?{draft:definition}:{}),display_definition:definition,workspace_id:org,workspace_name:'Founders',lead_name:'Owner',access_role:role,revision:1,published_revision:1};
  else if(path.endsWith('/appearance'))result={icon:'spark',color:'violet',revision:0};
  else if(path.endsWith('/board'))result=boardFixture([]);
  else if(path.endsWith('/versions')){expect(role).toBe('manager');result=[{revision:1,definition}];}
  else if(path.endsWith('/automatic-pickup'))result={published:true,connections:[]};
  else if(path.endsWith('/sharing')){
   if(req.method()==='POST'){expect(body.revision).toBe(state.revision);state.revision++;if(body.operation==='executor')state.scopes=body.approved_scopes;}
   result={revision:state.revision,workspace_id:org,lead_id:user,access:[],members:[{account_id:user,email:'owner@example.test'}],teams:[],invitations:[{id:'invite1',status:'claimed',candidate_id:'colleague',candidate_email:'colleague@example.test',inviter_id:user,role:'operator',expires_at:'2099-01-01'}],executors:[{grant_id:'grant1',status:'pending',client_name:'Research assistant',authorizer_email:'colleague@example.test',scopes:['daemons:read','work:execute'],approved_scopes:state.scopes}]};
  }else if(path==='invitations'){expect(body.acknowledge_history).toBe(true);state.invites++;result={id:'invite2',token:'single-use-test-token'};}
  else if(path==='invitations/claim'){expect(body.token).toBe('test-invite-token');state.claimed=true;result={status:'claimed'};}
  else if(path==='invitations/invite1'){expect(body.approve).toBe(true);state.confirmed++;result={status:'accepted'};}
  else if(path.endsWith('/memory'))result={items:[]};
  else if(path==='connections')result=[];
  await route.fulfill({json:result});
 });return state;
}
test('workspace selection is explicit and Org settings are reachable',async({page})=>{
 await fixture(page);await page.goto('/');await expect(page.getByLabel('Workspace',{exact:true})).toHaveValue(user);
 await page.getByLabel('Workspace',{exact:true}).selectOption(org);await expect(page.getByLabel('Workspace',{exact:true})).toHaveValue(org);
 await page.getByRole('link',{name:'Manage workspaces'}).click();await page.getByRole('link',{name:'Manage members and Teams'}).click();await expect(page.getByRole('heading',{name:'Founders'})).toBeVisible();
});
test('sharing explains history, confirms accepting identity and separately approves executors',async({page})=>{
 const state=await fixture(page);await page.goto(`/daemons/${id}#settings`);
 await expect(page.getByLabel('Workspace',{exact:true})).toHaveValue(org);
 await expect(page.getByText('Assistant connections and personal tool credentials are not shared.',{exact:false})).toBeVisible();
 const form=page.locator('#daemon-invite');await form.locator('[name=role]').selectOption('operator');await form.locator('[name=history]').check();await form.getByRole('button',{name:'Create invitation link'}).click();
 await expect(page.getByLabel('Invitation link')).toHaveValue(/\/invite#single-use-test-token$/);expect(state.invites).toBe(1);
 await page.getByRole('button',{name:'Confirm this identity'}).click();await expect.poll(()=>state.confirmed).toBe(1);
 const executor=page.locator('[data-executor=grant1]');await executor.locator('[value="daemons:read"]').check();await executor.getByRole('button',{name:'Save assistant approval'}).click();await expect.poll(()=>state.scopes).toEqual(['daemons:read']);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:'test-results/sharing-mobile.png',fullPage:true});
});
test('Viewer reads shared published instructions and sees no mutation controls',async({page})=>{
 await fixture(page,'viewer');await page.goto(`/daemons/${id}`);await expect(page.getByRole('heading',{name:'Shared research',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Customize Daemon appearance',exact:true})).toBeHidden();await expect(page.locator('.pickup-summary')).toBeHidden();await expect(page.getByRole('button',{name:'Add a task',exact:true})).toBeHidden();await expect(page.getByRole('link',{name:'Edit instructions',exact:true})).toHaveCount(0);
 await page.getByRole('link',{name:'Memory',exact:true}).click();await expect(page.locator('#memory-editor')).toBeHidden();
 await page.getByRole('link',{name:'Settings',exact:true}).click();await expect(page.getByRole('button',{name:'Create invitation link'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Create a copy',exact:true})).toBeVisible();
});
test('invitation token is removed from the URL and acceptance waits for confirmation',async({page})=>{
 const state=await fixture(page);await page.goto('/invite#test-invite-token');await expect(page).toHaveURL(/\/invite$/);await expect(page.getByText('You will have no access until they confirm your identity.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Submit my identity'}).click();await expect(page.locator('#accept-state')).toContainText('Waiting for the inviter');expect(state.claimed).toBe(true);
});

test('Org guests do not see a create action and direct creation explains the boundary',async({page})=>{
 await fixture(page,'viewer');
 await page.route('https://api.daemons.ai/v1/workspaces',route=>route.fulfill({json:{items:[{id:user,name:'Personal',kind:'personal',role:'owner'},{id:org,name:'Founders',kind:'org',role:'guest'}]}}));
 await page.goto('/');await page.getByLabel('Workspace',{exact:true}).selectOption(org);
 await expect(page.getByRole('link',{name:'+ Create a Daemon',exact:true})).toHaveCount(0);
 await page.goto('/new');await expect(page.getByText('Guests cannot create Daemons in this workspace. Choose Personal to create your own.',{exact:true})).toBeVisible();
});
