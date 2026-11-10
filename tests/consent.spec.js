import {test,expect} from '@playwright/test';
const account='00000000-0000-4000-8000-000000000001',org='00000000-0000-4000-8000-000000000002',daemon='00000000-0000-4000-8000-000000000003';
const all=['daemons:read','daemons:create','daemons:manage','work:submit','work:execute','memory:write','tools:use'];
const definition={schema_version:'daemons/v1',name:'My first Daemon',purpose:'Help plan the launch',instructions:'Ask before contacting anyone.',required_capabilities:[]};
async function fixture(page,{scopes=all,shared=false,expired=false,expireAfterSave=false,existing=false}={}) {
 const state={daemons:existing?[{id:daemon,draft:definition}]:[],consent:null,created:[],expired};
 await page.route('https://api.daemons.ai/v1/**',async route=>{
  const r=route.request(),url=new URL(r.url()),p=url.pathname.slice(4);let data={};
  if(p==='session')data={account:{id:account,email:'new@example.test'},csrf:'csrf-only',collaboration_enabled:shared};
  else if(p==='workspaces')data={items:[{id:account,kind:'personal',role:'owner',name:'Personal'},{id:org,kind:'org',role:'member',name:'Launch team'}]};
  else if(p==='daemons'&&r.method()==='POST'){
   expect(r.headers()['x-csrf-token']).toBe('csrf-only');const body=r.postDataJSON();state.created.push(body);state.daemons.push({id:daemon,draft:body.definition});data=state.daemons[0];if(expireAfterSave)state.expired=true;
  } else if(p==='daemons')data=state.daemons;
  else if(p==='authorization/request'&&r.method()==='POST'){state.consent=r.postDataJSON();data={redirect_to:'http://127.0.0.1:8096/connected'};}
  else if(p==='authorization/request'){
   if(state.expired){await route.fulfill({status:400,json:{error:'invalid_request',error_description:'This authorization request expired. Start again from your assistant.'}});return;}
   data={client_name:'Muse <safe>',redirect_uri:'https://assistant.example/callback',scopes};
  } else if(p==='control-room')data=[];
  await route.fulfill({json:data});
 });
 await page.goto('/authorize?request=request');return state;
}
async function saveDraft(page){
 await page.getByText('Create your first Daemon here instead',{exact:true}).click();
 await page.getByLabel('Name',{exact:true}).fill(definition.name);
 await page.getByLabel('Purpose',{exact:true}).fill(definition.purpose);
 await page.getByLabel('Instructions',{exact:true}).fill(definition.instructions);
 await page.getByRole('button',{name:'Save draft and return to approval'}).click();
}
test('new account approves full requested access with no Daemons and can customize it',async({page})=>{
 const state=await fixture(page);
 await expect(page.getByText('No Daemons yet. Connect Muse <safe> to create your first one together.')).toBeVisible();
 const allow=page.getByRole('button',{name:'Allow selected access'});await expect(allow).toBeEnabled();
 await expect(page.getByText('Customize access',{exact:true})).toBeVisible();
 await expect(page.locator('#consent details')).not.toHaveAttribute('open','');
 await page.screenshot({path:'test-results/consent-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/consent-mobile.png',fullPage:true});
 await page.getByText('Customize access',{exact:true}).click();
 await page.getByLabel('Create new Daemons',{exact:true}).uncheck();await expect(allow).toBeDisabled();
 await page.getByLabel('Create new Daemons',{exact:true}).check();
 await allow.click();await expect(page).toHaveURL(/connected/);
 expect(state.consent).toEqual({daemon_ids:[],scopes:all});expect(state.created).toHaveLength(0);
});
test('narrow request creates a browser-authorized draft and resumes the original consent',async({page})=>{
 const state=await fixture(page,{scopes:['daemons:read','work:execute']});
 await expect(page.getByRole('button',{name:'Allow selected access'})).toBeDisabled();
 await expect(page.getByLabel('Create new Daemons',{exact:true})).toHaveCount(0);
 await saveDraft(page);
 await expect(page).toHaveURL(/authorize\?request=request/);
 await expect(page.getByLabel(definition.name,{exact:true})).toBeChecked();
 expect(state.created).toEqual([{definition}]);expect(state.consent).toBeNull();
 await page.getByRole('button',{name:'Allow selected access'}).click();await expect(page).toHaveURL(/connected/);
 expect(state.consent).toEqual({daemon_ids:[daemon],scopes:['daemons:read','work:execute']});
});
test('draft creation preserves customized permission choices and does not publish',async({page})=>{
 const state=await fixture(page);await page.getByText('Customize access',{exact:true}).click();
 await page.getByLabel('Save and archive shared Daemon memory',{exact:true}).uncheck();await saveDraft(page);
 await expect(page.getByLabel(definition.name,{exact:true})).toBeChecked();
 await page.getByText('Customize access',{exact:true}).click();await expect(page.getByLabel('Save and archive shared Daemon memory',{exact:true})).not.toBeChecked();
 await page.getByRole('button',{name:'Allow selected access'}).click();await expect(page).toHaveURL(/connected/);
 expect(state.consent.scopes).toEqual(all.filter(s=>s!=='memory:write'));
});
test('existing Daemons require explicit selection and zero permissions cannot be approved',async({page})=>{
 const state=await fixture(page,{scopes:['daemons:read','work:execute'],existing:true});
 await expect(page.getByLabel(definition.name,{exact:true})).not.toBeChecked();
 const allow=page.getByRole('button',{name:'Allow selected access'});await expect(allow).toBeDisabled();
 await page.getByLabel(definition.name,{exact:true}).check();await expect(allow).toBeEnabled();
 await page.getByText('Customize access',{exact:true}).click();
 for(const box of await page.locator('[name=scope]').all())await box.uncheck();
 await expect(allow).toBeDisabled();expect(state.consent).toBeNull();
});
test('shared workspace omits creation scope and explains manager approval',async({page})=>{
 const state=await fixture(page,{shared:true,existing:true});
 await page.getByLabel('Workspace',{exact:true}).selectOption(org);
 await expect(page.getByText(/Shared Daemons require a manager’s approval/)).toBeVisible();
 await expect(page.locator('[name=scope][value="daemons:create"]')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Allow selected access'})).toBeDisabled();
 await page.getByLabel(definition.name,{exact:true}).check();await page.getByRole('button',{name:'Allow selected access'}).click();await expect(page).toHaveURL(/connected/);
 expect(state.consent).toEqual({daemon_ids:[daemon],workspace_id:org,scopes:all.filter(s=>s!=='daemons:create')});
});
test('expired request gives restart instructions instead of an empty list',async({page})=>{
 await fixture(page,{expired:true});await expect(page.getByRole('heading',{name:'This connection request expired'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Allow selected access'})).toHaveCount(0);
 await expect(page.getByText('Return to your assistant and start the connection again.')).toBeVisible();
});
test('expiry during draft creation preserves the saved draft without granting access',async({page})=>{
 const state=await fixture(page,{expireAfterSave:true,scopes:['daemons:read']});await saveDraft(page);
 await expect(page.getByRole('heading',{name:'This connection request expired'})).toBeVisible();
 await expect(page.getByRole('link',{name:'Open your saved Daemon'})).toHaveAttribute('href',`/daemons/${daemon}`);
 expect(state.created).toHaveLength(1);expect(state.consent).toBeNull();
});
test('cancel remains available without creating or sharing anything',async({page})=>{
 const state=await fixture(page,{scopes:['daemons:read']});await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page).toHaveURL(/connected/);
 expect(state.consent).toEqual({deny:true});expect(state.created).toHaveLength(0);
});
