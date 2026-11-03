import {test,expect} from '@playwright/test';
import {boardFixture} from './board-fixture.js';

const id='55555555-5555-4555-8555-555555555555';
const definition={schema_version:'daemons/v1',name:'Research thread',purpose:'Keep the research moving',instructions:'Use evidence',required_capabilities:[]};
async function fixture(page,role='manager'){
 const state={mode:'take_approval',revision:0,work:{id:'proposal',status:'awaiting_approval',revision:1,attempt:0,input:{task:'Compare two possible launch partners'},discovered_by_grant_id:'connection1',discovered_by_name:'Quincy',updated_at:new Date().toISOString()},writes:[],discoveryReads:0};
 await page.route('https://api.daemons.ai/v1/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname.slice(4),body=req.postDataJSON();let result={};
  if(path==='session')result={account:{email:'owner@example.test'},csrf:'csrf'};
  else if(path==='connections')result=[{id:'connection1',daemon_ids:[id],scopes:['work:submit','work:execute'],assistant:{name:'Quincy'},expires_at:'2099-01-01',revoked:false}];
  else if(path===`daemons/${id}`)result={id,draft:definition,revision:1,published_revision:1,access_role:role};
  else if(path.endsWith('/versions'))result=[{revision:1,definition}];
  else if(path.endsWith('/appearance'))result={icon:'spark',color:'violet',revision:0};
  else if(path.endsWith('/execution-settings'))result={check_in_minutes:null,revision:0};
  else if(path.endsWith('/automatic-pickup'))result={published:true,paused:false,connections:[]};
  else if(path.endsWith('/task-discovery')){
   state.discoveryReads++;
   if(req.method()==='PUT'){expect(req.headers()['x-csrf-token']).toBe('csrf');expect(body.connection_id).toBe('connection1');expect(body.expected_revision).toBe(state.revision);state.mode=body.mode;state.revision++;state.writes.push(body);}
   result=[{connection_id:'connection1',label:'',name:'Quincy',active:true,revoked:false,mode:state.mode,revision:state.revision}];
  }
  else if(path.endsWith('/board'))result=boardFixture([state.work]);
  else if(path==='work/proposal')result=state.work;
  else if(path==='work/proposal/activity')result={items:[]};
  else if(path==='work/proposal/approve-discovery'||path==='work/proposal/dismiss-discovery'){
   expect(req.headers()['x-csrf-token']).toBe('csrf');expect(req.headers()['idempotency-key']).toBeTruthy();
   state.work.status=path.endsWith('approve-discovery')?'queued':'rejected';state.work.updated_at=new Date().toISOString();state.writes.push(path);result=state.work;
  }
  else if(path.endsWith('/memory'))result={items:[]};
  else if(path.endsWith('/activity'))result=[];
  else if(path.endsWith('/context'))result={starting_context:null};
  await route.fulfill({json:result});
 });
 return state;
}

test('assistant task discovery policy is per connection and defaults to approval',async({page})=>{
 const state=await fixture(page);await page.goto(`/daemons/${id}`);await page.getByRole('link',{name:'Settings',exact:true}).click();
 const select=page.getByLabel('Discovered tasks');await expect(select).toHaveValue('take_approval');await expect(page.getByText('Automatic pickup is a separate setting',{exact:false})).toBeVisible();
 await select.selectOption('run_freely');await page.getByRole('button',{name:'Save',exact:true}).click();await expect.poll(()=>state.writes.length).toBe(1);await expect(select).toHaveValue('run_freely');expect(state.writes[0].mode).toBe('run_freely');
 await page.getByRole('link',{name:'Tasks',exact:true}).click();await expect(page.getByRole('region',{name:'Needs approval'})).toBeVisible();await page.locator('[data-card="proposal"] > summary').click();await expect(page.getByText('Suggested by Quincy')).toBeVisible();
 await page.getByRole('button',{name:'Approve and queue'}).click();await expect(page.locator('[data-column="queued"] [data-card-id="proposal"]')).toBeVisible();expect(state.writes.at(-1)).toBe('work/proposal/approve-discovery');
});

test('a viewer cannot see manager controls for discovered task policy',async({page})=>{
 const state=await fixture(page,'viewer');await page.goto(`/daemons/${id}#settings`);await expect(page.locator('#task-discovery-settings')).toBeHidden();expect(state.discoveryReads).toBe(0);
});
