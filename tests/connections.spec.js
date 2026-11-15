import {test,expect} from '@playwright/test';
const did='11111111-1111-4111-8111-111111111111',a='12345678-1000-4000-8000-000000000001',b='12345678-2000-4000-8000-000000000002';
async function fixture(page){
 const base={daemon_ids:[did],scopes:['daemons:read','work:execute'],assistant:{name:'Quincy'},client_name:'Muse',revoked:false,expires_at:'2099-01-01',created_at:'2026-10-01',label:null,label_revision:0};
 const state={writes:[],revokes:[],pickupWrites:[],pickup:{},pickupConflict:false,conflict:false,fail:false,daemons:[{id:did,draft:{name:'Hey108 Cofounder Finder'}}],rows:[{...base,id:a,short_id:'123456781',last_seen_at:'2026-10-25'},{...base,id:b,short_id:'123456782',last_seen_at:'2026-10-29'},{...base,id:'33333333-3333-4333-8333-333333333333',short_id:'33333333',expires_at:'2020-01-01',last_seen_at:'2026-10-30'},{...base,id:'44444444-4444-4444-8444-444444444444',short_id:'44444444',revoked:true,last_seen_at:'2026-10-30'},{...base,id:'55555555-5555-4555-8555-555555555555',short_id:'55555555',last_seen_at:null,created_at:'2026-10-28'}]};
 state.rows.forEach(row=>{row.daemon_ids=[...row.daemon_ids];});
 await page.route('https://api.daemons.ai/v1/**',async route=>{const req=route.request(),p=new URL(req.url()).pathname.slice(4);let data;
 if(p==='session')data={account:{email:'owner@example.test'},csrf:'csrf'};
 else if(p==='daemons')data=state.daemons;
 else if(p==='connections')data=state.rows;
 else if(p.endsWith('/label')){const id=p.split('/')[1],row=state.rows.find(r=>r.id===id),body=req.postDataJSON();state.writes.push({id,...body});expect(req.headers()['x-csrf-token']).toBe('csrf');if(state.fail)return route.fulfill({status:503,json:{error:'Could not save. Try again.'}});if(state.conflict){state.conflict=false;row.label='Other browser';row.label_revision++;return route.fulfill({status:409,json:{error:'This nickname changed. Review the saved label before trying again.'}});}expect(body.expected_revision).toBe(row.label_revision);row.label=body.label||null;row.label_revision++;data={id,label:row.label,label_revision:row.label_revision};}
 else if(p.startsWith('connections/')&&req.method()==='DELETE'){const id=p.split('/')[1];state.revokes.push(id);state.rows.find(r=>r.id===id).revoked=true;data={revoked:true};}
 else if(p.endsWith('/automatic-pickup')){
  const daemon=p.split('/')[1];
  if(req.method()==='PUT'){
   const body=req.postDataJSON(),key=daemon+':'+body.connection_id,prior=state.pickup[key]||{enabled:false,revision:0};
   state.pickupWrites.push({daemon,...body});expect(req.headers()['x-csrf-token']).toBe('csrf');
   expect(state.rows.find(r=>r.id===body.connection_id).daemon_ids).toContain(daemon);
   if(state.pickupConflict){state.pickupConflict=false;state.pickup[key]={...prior,revision:prior.revision+1};return route.fulfill({status:409,json:{error:'Automatic pickup changed. Refresh before editing it.'}});}
   expect(body.expected_revision).toBe(prior.revision);state.pickup[key]={enabled:body.enabled,revision:prior.revision+1};
  }
  data={published:true,connections:state.rows.filter(r=>r.daemon_ids.includes(daemon)&&r.scopes.includes('work:execute')).map(r=>({connection_id:r.id,name:r.label||'Quincy',assistant_name:'Quincy',label:r.label,short_id:r.short_id,active:!r.revoked&&new Date(r.expires_at)>new Date(),...(state.pickup[daemon+':'+r.id]||{enabled:false,revision:0})}))};
 }
 else if(p.endsWith('/task-discovery'))data=[];
 else throw Error(p);await route.fulfill({json:data});});return state;
}
test('active connections sort by recent use, expired/revoked collapse below, and duplicate names have distinct IDs',async({page})=>{
 await fixture(page);await page.goto('/connections?group=connection');
 await expect(page.getByRole('heading',{level:1,name:'Connected assistants',exact:true})).toBeVisible();await expect(page.getByRole('navigation',{name:'Main'}).getByRole('link',{name:'Connected assistants',exact:true})).toHaveAttribute('href','/connections');
 const active=page.locator('[data-connection-group=active]');await expect(active.locator('[data-connection]').nth(0)).toHaveAttribute('data-connection',b);await expect(active.locator('[data-connection]').nth(1)).toHaveAttribute('data-connection','55555555-5555-4555-8555-555555555555');await expect(active.locator('[data-connection]').nth(2)).toHaveAttribute('data-connection',a);
 await expect(page.locator('[data-connection-group=expired]')).not.toHaveAttribute('open','');await expect(page.locator('[data-connection-group=revoked]')).not.toHaveAttribute('open','');
 await expect(page.getByText('123456781',{exact:true})).toBeVisible();await expect(page.getByText('123456782',{exact:true})).toBeVisible();await expect(page.getByText('Not used yet',{exact:false})).toBeVisible();
 await page.locator(`[data-connection="${b}"]`).getByText('Automatic pickup by Daemon',{exact:true}).click();await expect(page.getByRole('checkbox',{name:'Start waiting tasks automatically for Quincy · 123456782',exact:true})).toBeVisible();
 for(const theme of ['light','dark']){await page.getByRole('combobox',{name:'Appearance'}).selectOption(theme);await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/connections-${theme}-mobile.png`,fullPage:true});}
});
test('nicknames persist, preserve the original assistant, clear, and recover stale saves without losing the draft',async({page})=>{
 const state=await fixture(page);await page.goto('/connections?group=connection');const card=page.locator(`[data-connection="${b}"]`),input=card.getByLabel('Connection nickname');
 await card.getByRole('button',{name:'Edit nickname'}).click();await input.fill('Muse — Chrome');await card.getByRole('button',{name:'Save nickname'}).click();await expect(card.getByRole('heading',{name:'Muse — Chrome',exact:true})).toBeVisible();await expect(card.locator('.connection-original')).toHaveText('Quincy · Muse');
 await page.reload();await expect(card.getByRole('heading',{name:'Muse — Chrome',exact:true})).toBeVisible();await card.getByText('Automatic pickup by Daemon',{exact:true}).click();await expect(card.getByRole('checkbox',{name:'Start waiting tasks automatically for Muse — Chrome · 123456782',exact:true})).toBeVisible();
 await card.getByRole('button',{name:'Edit nickname'}).click();await input.fill('Draft label');state.conflict=true;await card.getByRole('button',{name:'Save nickname'}).click();await expect(card.locator('.label-error')).toContainText('Saved label: Other browser');await expect(input).toHaveValue('Draft label');expect(state.writes.length).toBe(2);await expect(card.getByRole('heading',{name:'Other browser',exact:true})).toBeVisible();
 await card.getByRole('button',{name:'Cancel',exact:true}).click();await card.getByRole('button',{name:'Edit nickname'}).click();await input.fill('');await card.getByRole('button',{name:'Save nickname'}).click();await expect(card.getByRole('heading',{name:'Quincy',exact:true})).toBeVisible();expect(state.writes.at(-1).expected_revision).toBe(2);
 await card.getByRole('button',{name:'Edit nickname'}).click();await input.fill('<img src=x onerror=alert(1)>');await card.getByRole('button',{name:'Save nickname'}).click();await expect(card.getByRole('heading',{name:'<img src=x onerror=alert(1)>',exact:true})).toBeVisible();await expect(card.locator('img')).toHaveCount(0);
 await card.getByRole('button',{name:'Remove access to all Daemons',exact:true}).click();await expect.poll(()=>state.revokes).toEqual([b]);await expect(page.locator('[data-connection-group=revoked]')).not.toHaveAttribute('open','');
});
test('cancel and failed saves keep policy and names unchanged, and copying uses the full connection ID',async({page,context})=>{
 const state=await fixture(page);await context.grantPermissions(['clipboard-read','clipboard-write']);await page.goto('/connections?group=connection');const card=page.locator(`[data-connection="${a}"]`);
 await card.getByRole('button',{name:'Copy full ID'}).click();expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(a);
 await card.getByRole('button',{name:'Edit nickname'}).click();await card.getByLabel('Connection nickname').fill('Unsaved');await card.getByRole('button',{name:'Cancel',exact:true}).click();expect(state.writes).toHaveLength(0);
 await card.getByRole('button',{name:'Edit nickname'}).click();await card.getByLabel('Connection nickname').fill('Keep my draft');state.fail=true;await card.getByRole('button',{name:'Save nickname'}).click();await expect(card.locator('.label-error')).toContainText('Could not save');await expect(card.getByLabel('Connection nickname')).toHaveValue('Keep my draft');await expect(card.getByRole('heading',{name:'Quincy',exact:true})).toBeVisible();expect(state.writes).toHaveLength(1);
});

const secondDaemon='22222222-2222-4222-8222-222222222222',emptyDaemon='66666666-6666-4666-8666-666666666666';
const daemonGroup=(page,id)=>page.locator(`[data-daemon-group="${id}"]`);

test('Daemon is the default, sorts Daemons by name and counts distinct connection IDs',async({page})=>{
 const state=await fixture(page);
 state.daemons.push({id:secondDaemon,draft:{name:'Alpha research'}},{id:emptyDaemon,draft:{name:'Zebra ideas'}});
 state.rows.find(r=>r.id===b).daemon_ids.push(secondDaemon);
 await page.goto('/connections');
 await expect(page.getByRole('button',{name:'Daemon',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('[data-daemon-group]')).toHaveCount(3);
 await expect(page.locator('[data-daemon-group]').nth(0)).toHaveAttribute('data-daemon-group',secondDaemon);
 const first=daemonGroup(page,did),second=daemonGroup(page,secondDaemon),empty=daemonGroup(page,emptyDaemon);
 await expect(first.getByText('3 active connections',{exact:true})).toBeVisible();
 await expect(second.getByText('1 active connection',{exact:true})).toBeVisible();
 await expect(first.locator('[data-connection-group=active] [data-connection]').nth(0)).toHaveAttribute('data-connection',b);
 await expect(first.locator('[data-connection-group=active] [data-connection]').nth(1)).toHaveAttribute('data-connection','55555555-5555-4555-8555-555555555555');
 await expect(first.locator('[data-connection-group=active] [data-connection]').nth(2)).toHaveAttribute('data-connection',a);
 await expect(first.getByText('123456781',{exact:true})).toBeVisible();await expect(first.getByText('123456782',{exact:true})).toBeVisible();
 await expect(second.getByText('123456782',{exact:true})).toBeVisible();
 await expect(first.locator('[data-connection-group=expired]')).not.toHaveAttribute('open','');
 await expect(first.locator('[data-connection-group=revoked]')).not.toHaveAttribute('open','');
 await expect(empty.getByText('No active connections.',{exact:true})).toBeVisible();
 await expect(empty.getByRole('link',{name:'How to connect an assistant →'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Edit nickname'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Remove access to all Daemons'})).toHaveCount(0);
 await first.locator(`[data-connection="${b}"]`).getByText('Permissions',{exact:true}).click();
 await expect(first.locator(`[data-connection="${b}"]`).getByText('Pick up tasks and send progress and results',{exact:true})).toBeVisible();
 expect(state.writes).toHaveLength(0);expect(state.revokes).toHaveLength(0);expect(state.pickupWrites).toHaveLength(0);
});

test('view URLs preserve other parameters, reload and browser history without writes',async({page})=>{
 const state=await fixture(page);await page.goto('/connections?group=unknown&filter=owned');
 const daemon=page.getByRole('button',{name:'Daemon',exact:true}),connection=page.getByRole('button',{name:'Connection',exact:true});
 await expect(daemon).toHaveAttribute('aria-pressed','true');
 await connection.focus();await page.keyboard.press('Enter');
 await expect(connection).toHaveAttribute('aria-pressed','true');await expect(connection).toBeFocused();
 expect(new URL(page.url()).searchParams.get('group')).toBe('connection');expect(new URL(page.url()).searchParams.get('filter')).toBe('owned');
 await page.reload();await expect(connection).toHaveAttribute('aria-pressed','true');
 await daemon.click();expect(new URL(page.url()).searchParams.get('group')).toBe('daemon');
 await page.goBack();await expect(connection).toHaveAttribute('aria-pressed','true');
 await page.goForward();await expect(daemon).toHaveAttribute('aria-pressed','true');
 expect(state.writes).toHaveLength(0);expect(state.revokes).toHaveLength(0);expect(state.pickupWrites).toHaveLength(0);
});

test('Manage connection targets the exact instance and nickname changes appear in every Daemon',async({page})=>{
 const state=await fixture(page);state.daemons.push({id:secondDaemon,draft:{name:'Alpha research'}});state.rows.find(r=>r.id===b).daemon_ids.push(secondDaemon);
 await page.goto('/connections?group=daemon&filter=owned');
 await daemonGroup(page,secondDaemon).locator(`[data-connection="${b}"]`).getByRole('link',{name:'Manage connection'}).click();
 await expect(page).toHaveURL(new RegExp(`group=connection.*#connection-${b}$`));
 expect(new URL(page.url()).searchParams.get('filter')).toBe('owned');
 const canonical=page.locator(`#connection-${b}`);await expect(canonical).toBeFocused();
 await canonical.getByRole('button',{name:'Edit nickname'}).click();await canonical.getByLabel('Connection nickname').fill('Claude — Work laptop');await canonical.getByRole('button',{name:'Save nickname'}).click();
 await page.getByRole('button',{name:'Daemon',exact:true}).click();
 for(const daemon of [did,secondDaemon]){
  const card=daemonGroup(page,daemon).locator(`[data-connection="${b}"]`);
  await expect(card.getByRole('heading',{name:'Claude — Work laptop',exact:true})).toBeVisible();
  await expect(card.locator('.connection-original')).toHaveText('Quincy · Muse');
 }
 await expect(daemonGroup(page,did).locator(`[data-connection="${a}"]`).getByRole('heading',{name:'Quincy',exact:true})).toBeVisible();
 expect(state.writes).toHaveLength(1);expect(state.revokes).toHaveLength(0);
 await page.reload();await expect(daemonGroup(page,secondDaemon).getByRole('heading',{name:'Claude — Work laptop',exact:true})).toBeVisible();
});

test('connections without resolvable Daemons remain manageable without unknown pickup reads',async({page})=>{
 const state=await fixture(page),unselected='77777777-7777-4777-8777-777777777777',unavailable='88888888-8888-4888-8888-888888888888';
 state.rows.push({...state.rows[0],id:unselected,short_id:'77777777',daemon_ids:[]},{...state.rows[0],id:unavailable,short_id:'88888888',daemon_ids:['missing-daemon']});
 await page.goto('/connections');const other=page.locator('[data-other-connections]');
 await expect(other.getByRole('heading',{name:'Other connections',exact:true})).toBeVisible();
 await expect(other.getByText('No Daemon selected.',{exact:true})).toBeVisible();await expect(other.getByText('Daemon details unavailable.',{exact:true})).toBeVisible();
 await expect(other.locator('[data-pickup-daemon]')).toHaveCount(0);
 await expect(other.getByRole('link',{name:'Manage connection'})).toHaveCount(2);
 await other.locator(`[data-connection="${unavailable}"]`).getByRole('link',{name:'Manage connection'}).click();
 await expect(page.locator(`#connection-${unavailable}`)).toBeFocused();
 await expect(page.locator(`#connection-${unavailable}`).getByText('Some Daemon details are unavailable.',{exact:true})).toBeHidden();
 await page.locator(`#connection-${unavailable}`).getByText('Permissions and Daemons',{exact:true}).click();
 await expect(page.locator(`#connection-${unavailable}`).getByText('Some Daemon details are unavailable.',{exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Daemon',exact:true})).toHaveCount(0);
});

test('revoking one connection removes its access under all Daemons without changing other connections',async({page})=>{
 const state=await fixture(page);state.daemons.push({id:secondDaemon,draft:{name:'Alpha research'}});state.rows.find(r=>r.id===b).daemon_ids.push(secondDaemon);
 await page.goto('/connections');await daemonGroup(page,secondDaemon).locator(`[data-connection="${b}"]`).getByRole('link',{name:'Manage connection'}).click();
 const card=page.locator(`#connection-${b}`);await expect(card.getByText('This removes the connection’s access to every Daemon it can use.',{exact:true})).toBeVisible();
 await card.getByRole('button',{name:'Remove access to all Daemons',exact:true}).click();
 await expect.poll(()=>state.revokes).toEqual([b]);await expect(card.getByText('Access revoked',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Daemon',exact:true}).click();
 for(const daemon of [did,secondDaemon]){
  const group=daemonGroup(page,daemon);await expect(group.locator(`[data-connection-group=active] [data-connection="${b}"]`)).toHaveCount(0);
  const revoked=group.locator('[data-connection-group=revoked]');await expect(revoked).not.toHaveAttribute('open','');await revoked.locator('summary').first().click();
  await expect(revoked.locator(`[data-connection="${b}"]`).getByText('Access revoked',{exact:true})).toBeVisible();
 }
 await expect(daemonGroup(page,did).locator(`[data-connection-group=active] [data-connection="${a}"]`)).toBeVisible();
});

test('pickup changes are scoped to one Daemon–connection pair and conflicts do not retry writes',async({page})=>{
 const state=await fixture(page);state.daemons.push({id:secondDaemon,draft:{name:'Alpha research'}});state.rows.find(r=>r.id===b).daemon_ids.push(secondDaemon);
 await page.goto('/connections');const first=daemonGroup(page,did).locator(`[data-connection="${b}"]`),second=daemonGroup(page,secondDaemon).locator(`[data-connection="${b}"]`);
 for(const card of [first,second])await card.getByText('Automatic pickup',{exact:true}).click();
 const toggle=first.getByRole('checkbox',{name:'Start waiting tasks automatically for Quincy · 123456782',exact:true}),other=second.getByRole('checkbox',{name:'Start waiting tasks automatically for Quincy · 123456782',exact:true});
 await expect(toggle).not.toBeChecked();await toggle.check();await expect(toggle).toBeChecked();await expect(other).not.toBeChecked();
 expect(state.pickupWrites).toEqual([{daemon:did,connection_id:b,enabled:true,expected_revision:0}]);
 state.pickupConflict=true;await other.check();await expect(page.locator('#notice')).toContainText('Automatic pickup changed');await expect(other).not.toBeChecked();expect(state.pickupWrites).toHaveLength(2);
 await page.getByRole('button',{name:'Connection',exact:true}).click();const canonical=page.locator(`#connection-${b}`);await canonical.getByText('Automatic pickup by Daemon',{exact:true}).click();
 await expect(canonical.locator(`[data-pickup-daemon="${did}"]`).getByRole('checkbox')).toBeChecked();await expect(canonical.locator(`[data-pickup-daemon="${secondDaemon}"]`).getByRole('checkbox')).not.toBeChecked();
});

test('Daemon groups and connection controls fit mobile in both themes',async({page})=>{
 const state=await fixture(page);state.rows.find(r=>r.id===b).label='Claude — a long descriptive name for the work laptop connection';state.daemons[0].draft.name='A very long Daemon name for a shared responsibility with multiple assistants';
 await page.goto('/connections');
 for(const theme of ['light','dark']){
  await page.getByRole('combobox',{name:'Appearance'}).selectOption(theme);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/connections-daemon-${theme}-mobile.png`,fullPage:true});
 }
 await page.setViewportSize({width:1365,height:900});await page.screenshot({path:'test-results/connections-daemon-desktop.png',fullPage:true});
});
