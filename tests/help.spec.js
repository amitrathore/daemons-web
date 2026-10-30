import {boardFixture} from './board-fixture.js';
import {test,expect} from '@playwright/test';
const id='00000000-0000-4000-8000-000000000002';
const definition={schema_version:'daemons/v1',name:'Company researcher',purpose:'Prepare company briefs',instructions:'Cite reliable sources. Ask before contacting anyone.',required_capabilities:[]};
async function fixture(page,{published=true,paused=false,edited=false,work=[],connections=[],activity=[{type:'work.claimed',created_at:'2026-01-01',data:{}}]}={}) {
  const daemon={id,draft:definition,revision:edited?2:1,published_revision:published?1:null,paused};
  await page.route('https://api.daemons.ai/v1/**',async route=>{
    const path=new URL(route.request().url()).pathname.slice(4);
    let result;
    if(path.endsWith('/appearance'))result={icon:'spark',color:'violet',revision:0};
    else if(path.endsWith('/automatic-pickup'))result={published:true,paused:false,connections:[]};
    else if(path==='session')result={account:{email:'owner@example.test'},csrf:'csrf'};
    else if(path==='control-room')result=[daemon];
    else if(path==='daemons')result=[daemon];
    else if(path==='connections')result=connections;
    else if(path===`daemons/${id}`)result=daemon;
    else if(path.endsWith('/board'))result=boardFixture(work);
    else if(path.startsWith('work/'))result=path.endsWith('/activity')?{items:[]}:work.find(w=>w.id===path.split('/')[1]);
    else if(path.endsWith('/work'))result=work;
    else if(path.endsWith('/activity'))result=activity;
    else if(path.endsWith('/memory'))result={items:[]};
    else if(path.endsWith('/versions'))result=published?[{revision:1,definition}]:[];
    else throw Error('Unexpected route: '+path);
    await route.fulfill({json:result});
  });
}
test('home explains daemon versus task and the four steps on desktop and mobile',async({page})=>{
  await fixture(page);await page.goto('/');
  await expect(page.getByRole('heading',{name:'How Daemons.ai works'})).not.toBeVisible();await page.getByText('Getting started',{exact:true}).click();await expect(page.getByRole('heading',{name:'How Daemons.ai works'})).toBeVisible();
  await expect(page.locator('.steps li')).toHaveCount(4);
  await expect(page.getByText('A Daemon is a reusable set of instructions for an agent.',{exact:false})).toBeVisible();
  await page.screenshot({path:'test-results/inline-help-home-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/inline-help-home-mobile.png',fullPage:true});
});
test('draft tells owners to publish, explains the effect, and keeps tasks disabled',async({page})=>{
  await fixture(page,{published:false});await page.goto(`/daemons/${id}`);
  await expect(page.getByRole('heading',{name:'Next: publish your instructions'})).toBeVisible();
  await expect(page.getByText('It does not launch an assistant or start a task.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Add a task',exact:true}).click();await expect(page.getByRole('button',{name:'Add task',exact:true})).toBeDisabled();
  await expect(page.getByText('Publish the instructions above to enable tasks.',{exact:true})).toBeVisible();
  await expect(page.locator('pre')).not.toBeVisible();
});
test('published daemon explains waiting, interrupted work, results, and unpublished edits',async({page})=>{
  const work=[{id:'w1',status:'queued',attempt:0,revision:1,input:{task:'Research Acme'},updated_at:'2026-01-01'},
    {id:'w2',status:'attention_required',attempt:1,revision:1,input:{task:'Research Beta'},updated_at:'2026-01-01'},
    {id:'w3',status:'succeeded',attempt:1,revision:1,input:{task:'Research Gamma'},result:{message:'Brief is ready',sources:['https://example.test']},updated_at:'2026-01-01'}];
  await fixture(page,{edited:true,work});await page.goto(`/daemons/${id}`);
  await expect(page.getByRole('heading',{name:'Next: connect an assistant to do the work'})).toBeVisible();
  await expect(page.getByText('You have unpublished changes.',{exact:false})).toBeVisible();
  await page.locator('[data-card="w1"] > summary').click();await expect(page.getByText('This task has not started.',{exact:false})).toBeVisible();await page.getByRole('button',{name:'Close task details'}).click();
  await page.locator('[data-card="w2"] > summary').click();await expect(page.getByText('Check what happened before trying again.',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'Try task again'})).toBeVisible();await page.getByRole('button',{name:'Close task details'}).click();
  await page.locator('[data-card="w3"] > summary').click();
  await expect(page.getByText('Brief is ready',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Close task details'}).click();await page.getByRole('link',{name:'Settings',exact:true}).click();await page.getByText('Activity',{exact:true}).click();
  await expect(page.getByText('Assistant picked up the task',{exact:true})).toBeVisible();
  await page.screenshot({path:'test-results/inline-help-tasks-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('approved access is not presented as a live assistant',async({page})=>{
  const connections=[{id:'c1',daemon_ids:[id],scopes:['daemons:read','work:execute'],revoked:false,expires_at:'2099-01-01',last_seen_at:null,assistant:{},client_name:'My assistant'}];
  await fixture(page,{connections});await page.goto(`/daemons/${id}`);
  await expect(page.getByRole('heading',{name:'Next: give your Daemon its first task'})).toBeVisible();
  await expect(page.getByText('Approval alone does not mean the assistant is currently running.',{exact:false})).toBeVisible();
  await page.goto('/connections');
  await page.getByText('Permissions and Daemons',{exact:true}).click();await expect(page.getByText('Pick up tasks and send progress and results',{exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'Company researcher',exact:true})).toBeVisible();
  await expect(page.getByText('work:execute',{exact:false})).not.toBeVisible();
});
test('assistant setup explains where to connect and why approval alone does not start tasks',async({page})=>{
  await fixture(page);await page.goto('/connect');
  await expect(page.getByText('MCP is a standard way for assistants to use tools in other apps.',{exact:false})).toBeVisible();
  await expect(page.getByText('Add a remote MCP server in your assistant.',{exact:true})).toBeVisible();
  await expect(page.getByText('Access approval alone does not start work.',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:'Copy server address'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Read the official MCP developer guide →'})).toHaveAttribute('href','https://api.daemons.ai/docs/mcp');
});

test('completed daemon shows its report once and keeps reference material collapsed',async({page})=>{
  const report={result:'Partner search brief\nFive criteria and a search plan.',message:'Completed'};
  const work=[{id:'w1',status:'succeeded',attempt:1,revision:1,input:{task:'Prepare a partner search plan'},result:report,updated_at:'2026-01-01'}];
  const connections=[{daemon_ids:[id],scopes:['work:execute'],revoked:false,expires_at:'2099-01-01'}];
  const activity=[{type:'work.succeeded',created_at:'2026-01-01',data:{report}}, {type:'work.progress',created_at:'2026-01-01',data:{report:{message:'Preparing the plan'}}}];
  await fixture(page,{work,connections,activity});await page.goto(`/daemons/${id}`);
  await page.locator('[data-card="w1"] > summary').click();
  await expect(page.getByText(report.result,{exact:true})).toHaveCount(1);
  await expect(page.getByText(report.result,{exact:true})).toBeVisible();
  await expect(page.locator('.task-result dt')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Instructions published',exact:true})).toHaveCount(0);
  await expect(page.getByRole('region',{name:'What to do next'})).toHaveCount(0);
  await expect(page.getByText('Draft version 1',{exact:true})).toHaveCount(0);
  await expect(page.getByText('Preparing the plan',{exact:true})).not.toBeVisible();
  await page.getByRole('button',{name:'Close task details'}).click();await page.getByRole('link',{name:'Settings',exact:true}).click();await page.getByText('Activity',{exact:true}).click();
  await expect(page.getByText('Preparing the plan',{exact:true})).toBeVisible();
  await expect(page.getByText(report.result,{exact:true})).toHaveCount(1);
  await page.getByRole('link',{name:'Instructions',exact:true}).click();
  await expect(page.getByText(definition.instructions,{exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Tasks',exact:true}).click();
  await page.screenshot({path:'test-results/daemon-focused-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/daemon-focused-mobile.png',fullPage:true});
});
