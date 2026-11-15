// Tool credentials stay on the server; this module receives account and permission summaries.
const services={drive:'Google Drive',gmail:'Gmail','intergraph-mcp':'Intergraph Player','custom-mcp':'MCP server',slack:'Slack',notion:'Notion',calendar:'Google Calendar',hubspot:'HubSpot'};
const actionNames={'drive.read':'Read a document','drive.search':'Search documents','gmail.read':'Read email','gmail.search':'Search email','intergraph:mom_read_game_state':'Read game state','intergraph:mom_read_inbox':'Read inbox','intergraph:mom_ack_inbox':'Acknowledge inbox','intergraph:mom_send_event_to_game_master':'Send an event to the Game Master'};
export function mountTools({root,id,api,post,esc,notify,session}){
 let state,available=[],loaded=false;
 const summaries=new Map(),errors=new Map();
 const path=action=>`daemons/${id}/${action}`;
 const key=a=>JSON.stringify([a.binding_id,a.connection_id,a.name]);
 const selected=()=>new Set((state.draft||[]).map(key));
 const actionName=a=>actionNames[a.name]||a.name.split(/[.:]/).pop().replace(/^mom_/,'').replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
 function accountName(a){
  if(a.service==='intergraph-mcp'){
   const d=a.account_details||{},legacy=(a.account_label||'').replace(/^Intergraph player\s+/i,'');
   const player=d.player_name||(legacy&&legacy!=='(name unavailable)'?legacy:'Player name not provided');
   return `${player.startsWith('@')||player==='Player name not provided'?player:'@'+player} · ${d.game_name?'Game: '+d.game_name:'Game name not provided'}`;
  }
  const service=services[a.service]||a.service||'Account';
  return a.account_label&&a.account_label!==service?`${service} · ${a.account_label}`:service;
 }
 function accountFor(a){return (summaries.get(a.binding_id)?.accounts||[]).find(c=>c.id===a.connection_id);}
 const actionAccount=a=>accountFor(a)?accountName(accountFor(a)):a.account_label||'Connected account';
 function message(text){const el=root.querySelector('[data-tool-status]');if(el)el.textContent=text;}
 async function action(fn){const buttons=[...root.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);try{await fn();}catch(e){message(e.message);notify(e.message);}finally{buttons.filter(b=>b.isConnected).forEach(b=>b.disabled=false);}}
 async function load(){
  try{state={configured:false,can_manage:false,revision:0,draft:[],published_revision:null,published:[],connections:[],executors:[],...await api(path('tools'))};loaded=true;available=[];render();loadAccountNames();}
  catch(e){root.innerHTML=`<section class="panel"><h2>Connected accounts</h2><p role="status">${esc(e.message)}</p><button data-reload>Try again</button></section>`;root.querySelector('button').onclick=load;}
 }
 async function loadAccountNames(){
  const rows=state.connections.filter(c=>c.status==='active');let next=0;
  await Promise.all(Array.from({length:Math.min(4,rows.length)},async()=>{
   while(next<rows.length){const c=rows[next++];
    try{const result=await api(path('tools-accounts')+'?binding_id='+encodeURIComponent(c.id));summaries.set(c.id,result);if(Number.isInteger(result.revision))c.revision=result.revision;errors.delete(c.id);}
    catch(e){errors.set(c.id,e.message);}
    renderConnections();updateAccountLabels();
   }
  }));
 }
 function updateAccountLabels(){
  const list=root.querySelector('[data-published-actions]');
  if(list)list.innerHTML=(state.published||[]).map(a=>`<li><strong>${esc(actionName(a))}</strong><span>${esc(actionAccount(a))}</span></li>`).join('');
  root.querySelectorAll('[data-action-account]').forEach(el=>{const a=available[Number(el.dataset.actionAccount)];if(a)el.textContent=actionAccount(a);});
 }
 function audience(c){
  if(c.status==='pending')return 'No accounts have been approved through this setup yet.';
  if(c.delegation?.audience_mode==='all_approved')return 'Available to any approved assistant, including assistants you connect later.';
  const ids=c.delegation?.executors||[];
  if(!ids.length)return 'No assistants can use this connection yet. Review access to choose one.';
  const names=ids.map(id=>state.executors.find(e=>e.id===id)).filter(Boolean).map(e=>`${e.name} · ${e.id.slice(0,8)}`);
  return names.length===ids.length?'Selected assistants: '+names.join(', '):`Available to ${ids.length} selected assistant${ids.length===1?'':'s'}.`;
 }
 function renderConnections(){
  const holder=root.querySelector('[data-tool-connections]');if(!holder)return;
  holder.innerHTML=state.connections.map(c=>{
   const summary=summaries.get(c.id),accounts=summary?.accounts||[],pending=c.status==='pending';
   const title=pending?'Account setup not finished':accounts.length===1?accountName(accounts[0]):accounts.length?`${accounts.length} connected accounts`:'Account access';
   const status={active:'Connected',pending:'Setup not finished',reconnect_required:'Sign-in needed'}[c.status]||'Needs attention';
   const fallback=errors.has(c.id)?'Account names could not be loaded. Review the connection to check its access.':summary?'Account names are unavailable. Review the connection in Toolisman to identify its accounts.':'Loading account names…';
   return `<article class="tool-account-card"><div class="toolbar"><h3>${esc(title)}</h3><span class="badge ${pending?'paused':''}">${esc(status)}</span></div><p class="helper">Shared by ${esc(c.contributor||'an account holder')}</p>${pending?'<p class="helper">Finish setup in Toolisman, or remove this unfinished connection.</p>':accounts.length?`<ul class="tool-account-list">${accounts.map(a=>`<li><strong>${esc(services[a.service]||a.service||'Account')}</strong><span>${esc(accountName(a))}${a.status&&a.status!=='active'?' · Disconnected':a.authorization_status&&a.authorization_status!=='active'?' · Sign in again':''}</span></li>`).join('')}</ul>`:`<p class="helper">${esc(fallback)}</p>`}<p class="helper">${esc(audience(c))}</p>${state.can_manage?`<div class="actions">${c.contributor_id===session.account.id?`<button class="secondary" data-renew="${esc(c.id)}">${pending?'Finish setup':'Review connection'}</button>`:''}<button class="quiet" data-remove="${esc(c.id)}">${pending?'Remove unfinished setup':'Disconnect'}</button></div>`:''}<details class="tool-reference"><summary>Connection details</summary><p class="helper">Reference: ${esc(c.id)}</p>${errors.has(c.id)?`<p class="helper">${esc(errors.get(c.id))}</p><button class="secondary" data-retry-accounts="${esc(c.id)}">Reload account names</button>`:''}</details></article>`;
  }).join('')||'<p class="empty">No accounts connected yet. Connect an account to choose what this Daemon can use.</p>';
  holder.querySelectorAll('[data-renew]').forEach(b=>b.onclick=()=>reviewConnection(b.dataset.renew));
  holder.querySelectorAll('[data-retry-accounts]').forEach(b=>b.onclick=()=>action(loadAccountNames));
  holder.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>action(async()=>{
   if(!confirm('Disconnect these accounts from this Daemon? Further tool calls will be blocked, including for work in progress. The accounts remain connected in Toolisman.'))return;
   const c=state.connections.find(c=>c.id===b.dataset.remove);await post(path('tools-remove'),{binding_id:c.id,expected_revision:c.revision});summaries.delete(c.id);await load();notify('Accounts disconnected from this Daemon.');
  }));
 }
 function reviewConnection(binding){
  const c=state.connections.find(c=>c.id===binding),form=root.querySelector('[data-connect]');
  root.querySelector('[data-connect-section]').open=true;
  form.elements.binding_id.value=c.id;form.elements.audience_mode.value=c.delegation?.audience_mode||'selected';
  form.querySelectorAll('[name=executor]').forEach(e=>e.checked=(c.delegation?.executors||[]).includes(e.value));
  form.querySelector('[data-connect-title]').textContent=c.status==='pending'?'Finish connecting an account':'Review this connection';
  form.querySelector('[data-renew-note]').textContent=c.status==='pending'?'Choose the accounts you want to connect in Toolisman.':'Review the same accounts and choose which assistants may use them. To connect different accounts, start a new connection.';
  form.querySelector('[data-new-connection]').hidden=false;form.querySelector('[type=submit]').textContent='Review access in Toolisman';
  updateAudience(form);form.scrollIntoView({block:'nearest'});
 }
 function updateAudience(form){form.querySelector('fieldset').hidden=form.elements.audience_mode.value!=='selected';}
 function render(){
  const manage=state.can_manage,published=state.published||[],changed=state.revision>0&&state.revision!==state.published_revision;
  root.innerHTML=`<section class="panel"><h2>Connected accounts</h2><p>Choose the accounts this Daemon can use and which assistants may use them. Toolisman handles the account connection.</p><p data-tool-status role="status" aria-live="polite"></p>${!state.configured?'<p class="callout">Account connections are not available on this installation yet.</p>':''}<div data-tool-connections></div>
  ${manage&&state.configured?`<details data-connect-section ${state.connections.length?'':'open'}><summary>Connect another account</summary><form data-connect><h3 data-connect-title>Connect an account</h3><p class="helper" data-renew-note>First choose who may use the account. You’ll choose the account in Toolisman, then enable its actions here.</p><label>Who can use these tools?<select name="audience_mode"><option value="selected">Only assistants I choose</option><option value="all_approved">Any approved assistant, including future connections</option></select></label><fieldset><legend>Choose assistants</legend>${state.executors.map(e=>`<label class="check"><input type="checkbox" name="executor" value="${esc(e.id)}">${esc(e.name)} · ${esc(e.id.slice(0,8))}${e.scopes.includes('tools:use')?'':' · reconnect this assistant to allow tool use'}</label>`).join('')||'<p class="helper">No approved assistants yet. You can connect the account now and choose assistants later.</p>'}</fieldset><input type="hidden" name="binding_id"><div class="actions"><button type="submit">Choose accounts in Toolisman</button><button type="button" class="secondary" data-new-connection hidden>Start a new connection</button></div></form></details>`:''}</section>
  <section class="panel"><h2>Allowed actions</h2><p>${published.length?`${published.length} action${published.length===1?' is':'s are'} enabled for new task attempts.`:state.connections.some(c=>c.status==='active')?'No actions enabled yet. Choose actions below, then enable them for tasks.':'No actions enabled yet. Finish connecting an account to choose its actions.'}</p><p class="helper">Assistants can use tools only while working on an assigned task.</p>${changed?'<p class="callout">You have saved changes that are not enabled yet.</p>':''}<ul class="tool-action-list" data-published-actions>${published.map(a=>`<li><strong>${esc(actionName(a))}</strong><span>${esc(actionAccount(a))}</span></li>`).join('')}</ul>
  ${manage&&state.configured?'<button class="secondary" data-discover>Choose actions</button><form data-policy hidden><fieldset><legend>Actions this Daemon may use</legend><div data-actions></div></fieldset><button>Save action choices</button></form>':''}
  ${manage&&changed?'<button data-publish>Enable actions</button>':''}
  ${!manage?'<p class="helper">A Daemon manager can change the allowed actions. Account holders approve access to their own accounts.</p>':''}
  <details><summary>When do changes take effect?</summary><p class="helper">Enabling actions applies to new task attempts. Work already in progress keeps its current action list. Disconnecting an account blocks further calls immediately.</p><p class="helper">Enabled version: ${state.published_revision===null?'None':esc(state.published_revision)} · Saved version: ${esc(state.revision)}</p></details></section><section class="panel"><h2>Recent tool activity</h2><button class="secondary" data-activity>Show activity</button><div data-tool-activity></div></section>`;
  renderConnections();
  const form=root.querySelector('[data-connect]');
  if(form){
   form.elements.audience_mode.onchange=()=>updateAudience(form);
   form.querySelector('[data-new-connection]').onclick=()=>{form.reset();form.elements.binding_id.value='';form.querySelector('[data-connect-title]').textContent='Connect an account';form.querySelector('[data-renew-note]').textContent='Choose who may use the account, then choose the account in Toolisman.';form.querySelector('[data-new-connection]').hidden=true;form.querySelector('[type=submit]').textContent='Choose accounts in Toolisman';updateAudience(form);};
   form.addEventListener('submit',e=>{e.preventDefault();action(async()=>{const data=new FormData(e.currentTarget);message('Opening Toolisman to choose accounts…');const r=await post(path('tools-connect'),{audience_mode:data.get('audience_mode'),executors:data.get('audience_mode')==='all_approved'?[]:data.getAll('executor'),...(data.get('binding_id')?{binding_id:data.get('binding_id')}:{})});location.assign(r.url);});});
  }
  root.querySelector('[data-discover]')?.addEventListener('click',()=>action(async()=>{
   message('Loading the actions approved for your accounts…');const results=await Promise.all(state.connections.filter(c=>c.status==='active').map(c=>api(path('tools-actions')+'?binding_id='+encodeURIComponent(c.id))));available=results.flatMap(r=>r.actions);const picked=selected();root.querySelector('[data-actions]').innerHTML=available.map((a,i)=>`<label class="check"><input name="action" type="checkbox" value="${i}" ${picked.has(key(a))?'checked':''}><span><strong>${esc(actionName(a))}</strong> · <span data-action-account="${i}">${esc(actionAccount(a))}</span><small>${esc(a.description||'')}</small></span></label>`).join('')||'<p>No approved actions available. You can save an empty list to remove actions from future attempts.</p>';root.querySelector('[data-policy]').hidden=false;message('Choose the actions to allow, then save and enable your choices.');
  }));
  root.querySelector('[data-policy]')?.addEventListener('submit',e=>{e.preventDefault();action(async()=>{const picks=new FormData(e.currentTarget).getAll('action').map(i=>available[Number(i)]);await post(path('tools-draft'),{expected_revision:state.revision,actions:picks.map(a=>({binding_id:a.binding_id,connection_id:a.connection_id,action:a.name}))});await load();notify('Choices saved. Select Enable actions to make them available to new attempts.');});});
  root.querySelector('[data-publish]')?.addEventListener('click',()=>action(async()=>{await post(path('tools-publish'),{expected_revision:state.revision});await load();notify('Actions enabled for new task attempts.');}));
  root.querySelector('[data-activity]').onclick=()=>action(async()=>{const r=await api(path('tools-activity'));root.querySelector('[data-tool-activity]').innerHTML=r.invocations.map(i=>`<div class="list-row"><strong>${esc(actionName({name:i.action}))}</strong><p>${esc(i.status)} · ${esc(new Date(i.created_at).toLocaleString())}</p><details><summary>Technical details</summary><small>Task ${esc(i.work_id)} · Attempt ${esc(i.attempt_id)} · Action ${esc(i.action)} · Enabled version ${esc(i.policy_revision)}</small></details></div>`).join('')||'<p>No tool calls yet.</p>';});
 }
 const maybeLoad=()=>{if(root.isConnected&&!root.hidden&&!loaded){loaded=true;load();}};
 const observer=new MutationObserver(maybeLoad);observer.observe(root,{attributes:true,attributeFilter:['hidden']});maybeLoad();
}
