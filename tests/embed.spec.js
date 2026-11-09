import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const daemon='33333333-3333-4333-8333-333333333333',connection='44444444-4444-4444-8444-444444444444';
async function host(page,{viewer=false}={}){
 await page.route('**/embed/v1?**',async route=>route.fulfill({contentType:'text/html',body:await readFile('app/embed/v1.html','utf8')}));
 await page.route('**/embed-test',route=>route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'; frame-src 'self'"},body:`<!doctype html><html><body><h1>Comic remains visible</h1><intergraph-daemons label="Work with test Daemon"></intergraph-daemons><script type="module">
 import '/embed/component-v1.js';
 window.calls=[];let tasks=[];const panel=document.querySelector('intergraph-daemons');
 panel.contextProvider=()=>({title:'Reviewed strip',url:location.origin+'/comic',text:'An alternative ending.'});
 panel.transport=async(operation,args)=>{window.calls.push({operation,args});if(operation==='status')return {eligible:true,game_id:'11111111-1111-4111-8111-111111111111',frame_origin:location.origin,default_daemon_id:'${daemon}'};if(operation==='start')return {authorization_url:location.origin+'/connect-game?request=fixture'};
 if(args.operation==='list')return {items:[{id:'${daemon}',connection_id:'${connection}',access_role:'${viewer?'viewer':'operator'}',can_submit:${!viewer},published_revision:1,published_definition:{name:'Test Daemon',instructions:'Only approved test work.'}}]};
 if(args.operation==='submit'){tasks=[{id:'task1',input:args.input,status:'queued'}];return tasks[0];}
 if(args.operation==='task')return {result:'The reported outcome'};
 if(args.operation==='tasks')return {counts:{queued:tasks.length,working:0,attention:0,finished:0},columns:{queued:{items:tasks,next_cursor:null},working:{items:[],next_cursor:null},attention:{items:[],next_cursor:null},finished:{items:[],next_cursor:null}}};return {};};
 </script></body></html>`}));
 await page.goto('/embed-test');await page.getByRole('button',{name:'Work with test Daemon'}).click();return page.frameLocator('iframe');
}
test('App component attaches reviewed context, submits once and shows task results',async({page})=>{
 const panel=await host(page);await expect(panel.getByLabel('Daemon',{exact:true})).toContainText('Test Daemon');
 const drawer=await page.getByRole('dialog').boundingBox();expect(drawer.width).toBeGreaterThan(450);expect(drawer.height).toBeGreaterThan(600);
 await panel.getByLabel('New task').fill('Explore an ending');expect(await page.evaluate(()=>calls.filter(c=>c.args.operation==='submit').length)).toBe(0);
 await panel.getByRole('button',{name:'Attach page context'}).click();await expect(panel.locator('#preview')).toContainText('An alternative ending.');
 await panel.getByRole('button',{name:'Submit task',exact:true}).click();await expect(panel.getByText('Explore an ending',{exact:true})).toBeVisible();
 const writes=await page.evaluate(()=>calls.filter(c=>c.args.operation==='submit'));expect(writes).toHaveLength(1);expect(writes[0].args.input.context.title).toBe('Reviewed strip');expect(writes[0].args.idempotency_key).toBeTruthy();
 await panel.getByText('Explore an ending',{exact:true}).click();await expect(panel.getByText('The reported outcome')).toBeVisible();
 await panel.getByRole('button',{name:'Close Daemons panel'}).click();await expect(page.getByRole('dialog')).not.toBeVisible();await expect(page.getByRole('button',{name:'Work with test Daemon'})).toBeFocused();
});
test('Viewer panel excludes submission and ignores forged message channels',async({page})=>{
 const panel=await host(page,{viewer:true});await expect(panel.getByLabel('Daemon',{exact:true})).toContainText('Test Daemon');await expect(panel.getByLabel('New task')).toBeHidden();
 await page.evaluate(()=>window.postMessage({protocol:'daemons-embed/1',nonce:'forged',id:99,operation:'submit',args:{input:{task:'Forged'}}},location.origin));
 expect(await page.evaluate(()=>calls.some(c=>c.args.operation==='submit'))).toBe(false);
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();
});
test('mobile panel fits the viewport and failed submission preserves draft and retry key',async({page})=>{
 await page.setViewportSize({width:390,height:844});const panel=await host(page);await expect(panel.getByLabel('Daemon',{exact:true})).toContainText('Test Daemon');
 await page.evaluate(()=>{const p=document.querySelector('intergraph-daemons'),original=p.transport;p.transport=async(op,args)=>{if(args.operation==='submit'){calls.push({operation:op,args});throw Error('Network interrupted');}return original(op,args);};});
 await panel.getByLabel('New task').fill('Keep this draft');await panel.getByRole('button',{name:'Submit task',exact:true}).click();await expect(panel.locator('#notice')).toContainText('Network interrupted');await expect(panel.getByLabel('New task')).toHaveValue('Keep this draft');
 await panel.getByRole('button',{name:'Submit task',exact:true}).click();await expect.poll(()=>page.evaluate(()=>calls.filter(c=>c.args.operation==='submit').length)).toBe(2);
 const keys=await page.evaluate(()=>calls.filter(c=>c.args.operation==='submit').map(c=>c.args.idempotency_key));expect(keys[0]).toBe(keys[1]);
 const box=await page.locator('intergraph-daemons').locator('iframe').boundingBox();expect(box.width).toBeLessThanOrEqual(390);
 await page.screenshot({path:'test-results/daemons-embed-mobile.png'});
});
test('App consent explicitly selects Daemons and capabilities without executor authorization',async({page})=>{
 let approved;
 await page.route('https://api.daemons.ai/v1/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname.slice(4);let result=[];
 if(path==='session')result={account:{id:daemon,email:'person@example.test'},csrf:'csrf',embed_enabled:true,collaboration_enabled:true};
 else if(path==='workspaces')result={items:[{id:daemon,kind:'personal',name:'Personal',role:'owner'}]};
 else if(path==='game-connections/request/request1'){
  if(req.method()==='GET')result={id:'request1',game_name:'OVERHEAD',origin:'https://overhead.im'};
  else{expect(req.headers()['x-csrf-token']).toBe('csrf');approved=req.postDataJSON();result={redirect_to:'/game-connected'};}
 }else if(path==='daemons'){expect(new URL(req.url()).searchParams.getAll('workspace_id')).toEqual([daemon]);result=[{id:daemon,draft:{name:'I.M. Overhead'},access_role:'operator'}];}
 await route.fulfill({json:result});});
 await page.goto('/connect-game?request=request1');await expect(page.getByRole('heading',{name:'Connect OVERHEAD to your Daemons'})).toBeVisible();
 await expect(page.getByText('including existing task history.',{exact:false})).toBeVisible();
 await expect(page.getByRole('link',{name:'Connected apps',exact:true})).toHaveAttribute('href','/game-connections');
 await page.locator('[name=daemon]').check();await page.locator('[name=submit]').check();await page.getByRole('button',{name:'Connect app',exact:true}).click();
 await expect.poll(()=>approved).toEqual({workspace_id:daemon,daemon_ids:[daemon],requested_capabilities:['read','submit']});
});
test('Only registered origins can frame the dedicated embed route',async({request})=>{
 const consolePage=await request.get('/');expect(consolePage.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
 const invalid=await request.get('/embed/v1?game=invalid&parent_origin=https://attacker.test');expect(invalid.status()).toBe(400);
});

test('Connected apps lists existing connections and disconnects through the compatible endpoint',async({page})=>{
 let disconnected=false;
 await page.route('https://api.daemons.ai/v1/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname.slice(4);let result=[];
  if(path==='session')result={account:{id:daemon,email:'person@example.test'},csrf:'csrf',embed_enabled:true};
  else if(path==='game-connections')result=disconnected?[]:[{id:connection,game_name:'OVERHEAD',origin:'https://overhead.im',capabilities:['read','submit'],revoked:false,expires_at:'2026-12-08T12:00:00Z'}];
  else if(path===`game-connections/${connection}`){expect(req.method()).toBe('DELETE');expect(req.headers()['x-csrf-token']).toBe('csrf');disconnected=true;result={status:'disconnected'};}
  await route.fulfill({json:result});
 });
 await page.goto('/game-connections');
 await expect(page.getByRole('heading',{name:'Connected apps',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'OVERHEAD',exact:true})).toBeVisible();
 await expect(page.getByText('Connected assistants carry out the tasks.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Disconnect app',exact:true}).click();
 await expect(page.getByText('No connected apps yet.',{exact:false})).toBeVisible();
 expect(disconnected).toBe(true);
});
