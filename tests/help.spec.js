import {test,expect} from '@playwright/test';
const id='00000000-0000-4000-8000-000000000002';
const definition={schema_version:'daemons/v1',name:'Company researcher',purpose:'Prepare company briefs',instructions:'Cite reliable sources. Ask before contacting anyone.',required_capabilities:[]};
async function fixture(page,{published=true,paused=false,edited=false,work=[],connections=[]}={}) {
  const daemon={id,draft:definition,revision:edited?2:1,published_revision:published?1:null,paused};
  await page.route('https://api.daemons.ai/v1/**',async route=>{
    const path=new URL(route.request().url()).pathname.slice(4);
    let result;
    if(path==='session')result={account:{email:'owner@example.test'},csrf:'csrf'};
    else if(path==='daemons')result=[daemon];
    else if(path==='connections')result=connections;
    else if(path===`daemons/${id}`)result=daemon;
    else if(path.endsWith('/work'))result=work;
    else if(path.endsWith('/activity'))result=[{type:'work.claimed',created_at:'2026-01-01',data:{}}];
    else if(path.endsWith('/versions'))result=published?[{revision:1,definition}]:[];
    else throw Error('Unexpected route: '+path);
    await route.fulfill({json:result});
  });
}
test('home explains daemon versus task and the four steps on desktop and mobile',async({page})=>{
  await fixture(page);await page.goto('/');
  await expect(page.getByRole('heading',{name:'How Daemons.ai works'})).toBeVisible();
  await expect(page.locator('.steps li')).toHaveCount(4);
  await expect(page.getByText('A daemon is a reusable set of instructions for an agent.',{exact:false})).toBeVisible();
  await page.screenshot({path:'test-results/inline-help-home-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/inline-help-home-mobile.png',fullPage:true});
});
test('draft tells owners to publish, explains the effect, and keeps tasks disabled',async({page})=>{
  await fixture(page,{published:false});await page.goto(`/daemons/${id}`);
  await expect(page.getByRole('heading',{name:'Next: publish your instructions'})).toBeVisible();
  await expect(page.getByText('It does not launch an assistant or start a task.',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:'Add task',exact:true})).toBeDisabled();
  await expect(page.getByText('Publish the instructions above to enable tasks.',{exact:true})).toBeVisible();
  await expect(page.locator('pre')).not.toBeVisible();
});
test('published daemon explains waiting, interrupted work, results, and unpublished edits',async({page})=>{
  const work=[{id:'w1',status:'queued',attempt:0,revision:1,input:{task:'Research Acme'},updated_at:'2026-01-01'},
    {id:'w2',status:'attention_required',attempt:1,revision:1,input:{task:'Research Beta'},updated_at:'2026-01-01'},
    {id:'w3',status:'succeeded',attempt:1,revision:1,input:{task:'Research Gamma'},result:{message:'Brief is ready',sources:['https://example.test']},updated_at:'2026-01-01'}];
  await fixture(page,{edited:true,work});await page.goto(`/daemons/${id}`);
  await expect(page.getByRole('heading',{name:'Next: connect an assistant to do the work'})).toBeVisible();
  await expect(page.getByText('You have unpublished edits in draft version 2.',{exact:false})).toBeVisible();
  await expect(page.getByText('This task has not started.',{exact:false})).toBeVisible();
  await expect(page.getByText('Check what happened before trying again.',{exact:false})).toBeVisible();
  await expect(page.getByText('Brief is ready',{exact:true})).toBeVisible();
  await expect(page.getByText('Assistant picked up the task',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Try task again'})).toBeVisible();
  await page.screenshot({path:'test-results/inline-help-tasks-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('approved access is not presented as a live assistant',async({page})=>{
  const connections=[{id:'c1',daemon_ids:[id],scopes:['daemons:read','work:execute'],revoked:false,expires_at:'2099-01-01',last_seen_at:null,assistant:{},client_name:'My assistant'}];
  await fixture(page,{connections});await page.goto(`/daemons/${id}`);
  await expect(page.getByRole('heading',{name:'Next: give your daemon its first task'})).toBeVisible();
  await expect(page.getByText('Approval alone does not mean the assistant is currently running.',{exact:false})).toBeVisible();
  await page.goto('/connections');
  await expect(page.getByText('Pick up tasks and send progress and results',{exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'Company researcher',exact:true})).toBeVisible();
  await expect(page.getByText('work:execute',{exact:false})).not.toBeVisible();
});
test('assistant setup explains where to connect and why approval alone does not start tasks',async({page})=>{
  await fixture(page);await page.goto('/connect');
  await expect(page.getByText('MCP is a standard way for assistants to use tools in other apps.',{exact:false})).toBeVisible();
  await expect(page.getByText('Add a remote MCP server in your assistant.',{exact:true})).toBeVisible();
  await expect(page.getByText('Access approval alone does not start work.',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:'Copy server address'})).toBeVisible();
});
