import {test,expect} from '@playwright/test';
import {boardFixture} from './board-fixture.js';
const user='11111111-1111-4111-8111-111111111111',org='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
const definition={schema_version:'daemons/v1',name:'Shared research',purpose:'Carry company research forward',instructions:'Use sources',required_capabilities:[]};
async function fixture(page,role='manager'){
 const state={revision:0,invites:0,confirmed:0,scopes:[],writes:[],claimed:false,lastCommand:null,failSharingPost:false,people:[{account_id:user,email:'owner@example.test',role:'manager',sources:[{source_type:'workspace',source_name:'Workspace owner',role:'manager'}]},{account_id:'colleague',email:'colleague@example.test',role:'editor',sources:[{source_type:'direct',source_id:'direct1',source_name:'Direct access',role:'viewer'},{source_type:'team',source_id:'team1',source_name:'Editorial',role:'editor'}]}]};
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
  else if(path.endsWith('/task-discovery'))result=[];
  else if(path.endsWith('/sharing')){
   if(req.method()==='POST'){
    if(state.failSharingPost){state.failSharingPost=false;await route.fulfill({status:409,json:{error:'Sharing changed. Refresh before saving.'}});return;}
    expect(body.revision).toBe(state.revision);state.revision++;state.lastCommand=body;if(body.operation==='executor')state.scopes=body.approved_scopes;
    if(body.operation==='access'&&body.account_id){const p=state.people.find(p=>p.account_id===body.account_id);p.sources=p.sources.filter(s=>s.source_type!=='direct');if(body.role)p.sources.push({source_type:'direct',source_name:'Direct access',role:body.role});p.role=p.sources.map(s=>s.role).sort((a,b)=>({viewer:1,operator:2,editor:3,manager:4}[b]-{viewer:1,operator:2,editor:3,manager:4}[a]))[0];}
   }
   result={revision:state.revision,workspace_id:org,lead_id:user,people:state.people,lead_candidates:state.people.filter(p=>['editor','manager'].includes(p.role)),access:[{id:'direct1',account_id:'colleague',email:'colleague@example.test',role:'viewer'},{id:'team-access',team_id:'team1',team_name:'Editorial',role:'editor'}],members:[{account_id:user,email:'owner@example.test'}],teams:[{id:'team1',name:'Editorial',member_count:1},...(state.extraTeams||[])],invitations:[{id:'invite1',status:'claimed',candidate_id:'colleague',candidate_email:'colleague@example.test',inviter_id:user,role:'operator',expires_at:'2099-01-01'},...(state.extraInvites||[])],executors:[...(state.extraExecutors||[]),{grant_id:'grant1',status:state.scopes.length?'approved':'pending',active:true,authorizer_role:'operator',allowed_scopes:['daemons:read','work:execute'],expires_at:'2099-01-01',client_name:'Research assistant',authorizer_email:'colleague@example.test',scopes:['daemons:read','work:execute'],approved_scopes:state.scopes}]};
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
test('sharing shows effective access and creates an invitation without granting access',async({page})=>{
 const state=await fixture(page);await page.goto(`/daemons/${id}#sharing`);
 await expect(page.getByRole('heading',{name:'Who has access'})).toBeVisible();
 const people=page.getByRole('list',{name:'People with access'});await expect(people.getByText('owner@example.test')).toBeVisible();await expect(people.getByText('colleague@example.test')).toHaveCount(1);await expect(people.getByText('Editor',{exact:true})).toBeVisible();await expect(people.getByText('Direct access · Via Editorial')).toBeVisible();
 await page.locator('#collaboration-settings').screenshot({path:'test-results/sharing-desktop.png'});
 await page.getByRole('button',{name:'Invite someone',exact:true}).click();const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Role',{exact:true}).selectOption('operator');await expect(dialog.getByText('Also add and organize tasks and contribute memory.')).toBeVisible();
 await dialog.getByRole('button',{name:'Create invitation link'}).click();expect(state.invites).toBe(0);
 await dialog.locator('[name=history]').check();await dialog.getByRole('button',{name:'Create invitation link'}).click();
 await expect(dialog.getByLabel('Invitation link')).toHaveValue(/\/invite#single-use-test-token$/);expect(state.invites).toBe(1);await expect(dialog.getByText('No email has been sent.',{exact:false})).toBeVisible();await expect(dialog.getByRole('button',{name:'Copy invitation link'})).toBeVisible();
 await dialog.getByRole('button',{name:'Done',exact:true}).click();await expect(dialog).toHaveCount(0);
 await page.getByRole('button',{name:'Review person'}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirm access',exact:true}).click();await expect.poll(()=>state.confirmed).toBe(1);
});
test('removing direct access explains and preserves inherited Team access',async({page})=>{
 const state=await fixture(page);await page.goto(`/daemons/${id}#sharing`);await page.getByRole('button',{name:'Manage access for colleague@example.test'}).click();const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Remove direct access',{exact:true}).check();await expect(dialog.getByText('They will keep Editor access through Via Editorial.')).toBeVisible();await expect(dialog.locator('[name=history]')).toBeHidden();
 await dialog.getByRole('button',{name:'Save access',exact:true}).click();await expect.poll(()=>state.lastCommand?.role).toBe(null);expect(state.lastCommand.acknowledge_history).toBe(false);
 await expect(page.getByRole('list',{name:'People with access'}).getByText('Editor',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Manage access for colleague@example.test'}).click();await expect(page.getByRole('dialog').getByText('This person’s access is inherited.',{exact:false})).toBeVisible();await expect(page.getByRole('dialog').getByRole('button',{name:'Save access'})).toHaveCount(0);
});
test('access increases require history consent and stale changes require review',async({page})=>{
 const state=await fixture(page);await page.goto(`/daemons/${id}#sharing`);await page.getByRole('button',{name:'Manage access for colleague@example.test'}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Role',{exact:true}).selectOption('manager');await expect(dialog.locator('[name=history]')).toBeVisible();await dialog.getByRole('button',{name:'Save access',exact:true}).click();expect(state.lastCommand).toBe(null);
 await dialog.locator('[name=history]').check();state.failSharingPost=true;await dialog.getByRole('button',{name:'Save access',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Sharing changed');await expect(dialog.getByRole('button',{name:'Save access',exact:true})).toBeDisabled();await dialog.getByRole('button',{name:'Review latest access'}).click();await expect(dialog).toHaveCount(0);
 await page.getByRole('button',{name:'Manage access for colleague@example.test'}).click();await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.getByRole('button',{name:'Manage access for colleague@example.test'})).toBeFocused();
});
test('assistant approvals and responsibility have their own focused controls',async({page})=>{
 const state=await fixture(page);await page.goto(`/daemons/${id}#sharing`);await expect(page.locator('#sharing-section')).not.toContainText('Research assistant');await page.locator('#assistant-access-section > summary').click();await page.getByRole('button',{name:'Review request'}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Read shared work',{exact:false}).check();await dialog.getByRole('button',{name:'Save permissions'}).click();await expect.poll(()=>state.scopes).toEqual(['daemons:read']);
 await page.locator('#responsibility-section > summary').click();await page.getByRole('button',{name:'Change lead'}).click();await page.getByRole('dialog').getByLabel('Accountable lead').selectOption('colleague');await page.getByRole('dialog').getByRole('button',{name:'Save lead'}).click();await expect.poll(()=>state.lastCommand?.lead_id).toBe('colleague');
});
test('sharing is usable on mobile and in dark mode without horizontal overflow',async({page})=>{
 await fixture(page);await page.setViewportSize({width:390,height:844});await page.goto(`/daemons/${id}#sharing`);await page.evaluate(()=>document.documentElement.dataset.theme='dark');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.locator('#sharing-section').screenshot({path:'test-results/sharing-mobile.png'});
 await page.getByRole('button',{name:'Invite someone',exact:true}).click();expect(await page.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Invite someone',exact:true})).toBeFocused();
});
test('Viewer reads shared published instructions and sees no mutation controls',async({page})=>{
 await fixture(page,'viewer');await page.goto(`/daemons/${id}`);await expect(page.getByRole('heading',{name:'Shared research',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Customize Daemon appearance',exact:true})).toBeHidden();await expect(page.locator('.pickup-summary')).toBeHidden();await expect(page.getByRole('button',{name:'Add a task',exact:true})).toBeHidden();await expect(page.getByRole('link',{name:'Edit instructions',exact:true})).toHaveCount(0);
 await page.getByRole('link',{name:'Memory',exact:true}).click();await expect(page.locator('#memory-editor')).toBeHidden();
 await page.getByRole('link',{name:'Settings',exact:true}).click();await page.locator('#sharing-section > summary').click();await expect(page.getByRole('button',{name:'Create invitation link'})).toHaveCount(0);await page.locator('#copy-move-section > summary').click();await expect(page.getByRole('button',{name:'Create a copy',exact:true})).toBeVisible();
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

test('Team changes use a focused dialog and explain remaining access',async({page})=>{
 const state=await fixture(page);state.extraTeams=[{id:'team2',name:'Partners',member_count:2}];await page.goto(`/daemons/${id}#sharing`);
 await page.getByRole('button',{name:'Share with a Team',exact:true}).click();let dialog=page.getByRole('dialog');await dialog.getByRole('combobox',{name:'Team',exact:true}).selectOption('team2');await dialog.locator('[name=history]').check();await dialog.getByRole('button',{name:'Share with Team',exact:true}).click();await expect.poll(()=>state.lastCommand?.team_id).toBe('team2');expect(state.lastCommand.role).toBe('viewer');expect(state.lastCommand.acknowledge_history).toBe(true);
 await page.getByRole('button',{name:'Manage Team access'}).click();dialog=page.getByRole('dialog');await dialog.getByLabel('Remove this Team’s access').check();await expect(dialog.getByText('Members may retain access',{exact:false})).toBeVisible();await dialog.getByRole('button',{name:'Save Team access'}).click();await expect.poll(()=>state.lastCommand?.role).toBe(null);expect(state.lastCommand.acknowledge_history).toBe(false);
});
test('expired invitations and duplicate inactive assistants remain distinguishable',async({page})=>{
 const state=await fixture(page);state.extraInvites=[{id:'expired',status:'claimed',candidate_email:'expired@example.test',role:'viewer',inviter_id:user,expires_at:'2001-01-01'}];state.extraExecutors=[{grant_id:'grant2',status:'approved',active:false,authorizer_role:'operator',client_name:'Research assistant',authorizer_email:'colleague@example.test',expires_at:'2001-01-01',scopes:['daemons:read'],approved_scopes:['daemons:read']}];
 await page.goto(`/daemons/${id}#sharing`);await page.getByText('Expired invitations (1)',{exact:true}).click();const expired=page.getByText('expired@example.test',{exact:true}).locator('..').locator('..');await expect(expired).toContainText('Expired');await expect(expired.getByRole('button')).toHaveCount(0);
 await page.locator('#assistant-access-section > summary').click();await page.getByText('Inactive connections (1)',{exact:true}).click();await expect(page.locator('#assistant-access-section').getByText('Research assistant',{exact:true})).toHaveCount(2);await page.getByRole('button',{name:'View details',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('grant2');await expect(page.getByRole('dialog').getByRole('button',{name:'Save permissions'})).toHaveCount(0);
});
