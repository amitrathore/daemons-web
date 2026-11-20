// Tool credentials stay on the server; this module receives account and permission summaries.
const services={drive:'Google Drive',gmail:'Gmail','intergraph-mcp':'Intergraph Player','custom-mcp':'MCP server',slack:'Slack',notion:'Notion',calendar:'Google Calendar',hubspot:'HubSpot'};
const actionNames={'drive.read':'Read a document','drive.search':'Search documents','gmail.read':'Read email','gmail.search':'Search email','intergraph:mom_read_game_state':'Read game state','intergraph:mom_read_inbox':'Read inbox','intergraph:mom_ack_inbox':'Acknowledge inbox','intergraph:mom_send_event_to_game_master':'Send an event to the Game Master'};
const serviceDescriptions={drive:'Find and read documents in this account.',gmail:'Search and read email in this account.','intergraph-mcp':'Use this player’s approved access within their game.','custom-mcp':'Use the actions provided by this connected MCP server.'};
const actionDescriptions={'drive.read':'Read the contents of a document.','drive.search':'Find documents by a search query.','gmail.read':'Read an email message.','gmail.search':'Find email messages by a search query.','intergraph:mom_read_game_state':'View the current state of the game.','intergraph:mom_read_inbox':'Read messages sent to this player.','intergraph:mom_ack_inbox':'Mark inbox messages as acknowledged.','intergraph:mom_send_event_to_game_master':'Send a request or action to the game using this player’s permissions.'};
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
 const groupKey=a=>JSON.stringify([a.binding_id,a.connection_id]);
 const actionDescription=a=>actionDescriptions[a.name]||a.description||'Use this action with the connected account’s approved permissions.';
 function groups(actions){
  const grouped=new Map();
  actions.forEach((a,index)=>{const k=groupKey(a);if(!grouped.has(k))grouped.set(k,[]);grouped.get(k).push({a,index});});
  return [...grouped.values()];
 }
 function groupHeader(a,count,all){
  const account=accountFor(a),title=account?`${account.service==='intergraph-mcp'?'Intergraph Player · ':''}${accountName(account)}`:actionAccount(a);
  const duplicates=all.filter(rows=>actionAccount(rows[0].a)===actionAccount(a)).length>1;
  return `<div class="tool-action-heading"><h3>${esc(title)}</h3><span class="badge">${count} action${count===1?'':'s'}</span></div><p class="helper">${esc(serviceDescriptions[account?.service]||'Actions approved for this connected account.')}${duplicates?` · Connection ${esc((a.connection_id||'').slice(0,8))} · Access ${esc((a.binding_id||'').slice(0,8))}`:''}</p>`;
 }
 function renderActionGroups(actions,editable=false){
  const all=groups(actions);
  return all.map(rows=>{
   const first=rows[0].a,header=`<div data-action-group="${esc(groupKey(first))}">${groupHeader(first,rows.length,all)}</div>`;
   if(editable)return `<fieldset class="tool-action-group"><legend class="sr-only">Actions for ${esc(actionAccount(first))}</legend>${header}<div class="actions tool-action-selection"><button type="button" class="secondary" data-select-actions="all" data-action-scope="${esc(groupKey(first))}">Select all</button><button type="button" class="secondary" data-select-actions="none" data-action-scope="${esc(groupKey(first))}">Unselect all</button></div><div class="tool-action-options">${rows.map(({a,index})=>`<label class="check"><input name="action" type="checkbox" value="${index}" ${selected().has(key(a))?'checked':''}><span><strong>${esc(actionName(a))}</strong><small>${esc(actionDescription(a))}</small></span></label>`).join('')}</div></fieldset>`;
   return `<section class="tool-action-group">${header}<ul class="tool-action-list">${rows.map(({a})=>`<li><strong>${esc(actionName(a))}</strong><span>${esc(actionDescription(a))}</span></li>`).join('')}</ul></section>`;
  }).join('');
 }
 function updateAccountLabels(){
  const list=root.querySelector('[data-published-actions]');
  if(list)list.innerHTML=renderActionGroups(state.published||[]);
  const all=groups(available);
  root.querySelectorAll('[data-actions] [data-action-group]').forEach(el=>{
   const rows=all.find(rows=>groupKey(rows[0].a)===el.dataset.actionGroup);
   if(rows){el.innerHTML=groupHeader(rows[0].a,rows.length,all);const legend=el.closest('.tool-action-group')?.querySelector('legend');if(legend)legend.textContent='Actions for '+actionAccount(rows[0].a);}
  });
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
   return `<article class="tool-account-card"><div class="toolbar"><h3>${esc(title)}</h3><span class="badge ${pending?'paused':''}">${esc(status)}</span></div><p class="helper">Connected by ${esc(c.contributor||'an account holder')}</p>${c.toolisman_owner_id?`<p class="helper">Toolisman account: ${esc(c.toolisman_owner_email||c.toolisman_owner_id)}</p>`:''}${pending?'<p class="helper">Finish setup in Toolisman, or remove this unfinished connection.</p>':accounts.length?`<ul class="tool-account-list">${accounts.map(a=>`<li><strong>${esc(services[a.service]||a.service||'Account')}</strong><span>${esc(accountName(a))}${a.status&&a.status!=='active'?' · Disconnected':a.authorization_status&&a.authorization_status!=='active'?' · Sign in again':''}</span></li>`).join('')}</ul>`:`<p class="helper">${esc(fallback)}</p>`}<p class="helper">${esc(audience(c))}</p>${state.can_manage?`<div class="actions">${c.contributor_id===session.account.id?`<button class="secondary" data-renew="${esc(c.id)}">${pending?'Finish setup':'Review connection'}</button>`:''}<button class="quiet" data-remove="${esc(c.id)}">${pending?'Remove unfinished setup':'Disconnect'}</button></div>`:''}<details class="tool-reference"><summary>Connection details</summary><p class="helper">Reference: ${esc(c.id)}</p>${errors.has(c.id)?`<p class="helper">${esc(errors.get(c.id))}</p><button class="secondary" data-retry-accounts="${esc(c.id)}">Reload account names</button>`:''}</details></article>`;
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
  <section class="panel"><h2>Allowed actions</h2><p>${published.length?`${published.length} action${published.length===1?' is':'s are'} enabled for new task attempts.`:state.connections.some(c=>c.status==='active')?'No actions enabled yet. Choose actions below, then enable them for tasks.':'No actions enabled yet. Finish connecting an account to choose its actions.'}</p><p class="helper">Assistants can use tools only while working on an assigned task.</p>${changed?'<p class="callout">You have saved changes that are not enabled yet.</p>':''}<div data-published-actions>${renderActionGroups(published)}</div>
  ${manage&&state.configured?'<button class="secondary" data-discover>Choose actions</button><form data-policy hidden><p class="helper">Select the actions to allow for each account.</p><div class="actions tool-action-selection"><button type="button" class="secondary" data-select-actions="all">Select all</button><button type="button" class="secondary" data-select-actions="none">Unselect all</button></div><div data-actions></div><button>Save action choices</button></form>':''}
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
   message('Loading the actions approved for your accounts…');const results=await Promise.all(state.connections.filter(c=>c.status==='active').map(c=>api(path('tools-actions')+'?binding_id='+encodeURIComponent(c.id))));available=results.flatMap(r=>r.actions);root.querySelector('[data-actions]').innerHTML=renderActionGroups(available,true)||'<p>No approved actions available. You can save an empty list to remove actions from future attempts.</p>';root.querySelector('[data-policy]').hidden=false;message('Choose the actions to allow, then save and enable your choices.');
  }));
  root.querySelector('[data-policy]')?.addEventListener('click',e=>{
   const button=e.target.closest('[data-select-actions]');if(!button)return;
   const scope=button.hasAttribute('data-action-scope')?button.closest('.tool-action-group'):e.currentTarget;
   scope.querySelectorAll('input[name=action]').forEach(input=>input.checked=button.dataset.selectActions==='all');
  });
  root.querySelector('[data-policy]')?.addEventListener('submit',e=>{e.preventDefault();action(async()=>{const picks=new FormData(e.currentTarget).getAll('action').map(i=>available[Number(i)]);await post(path('tools-draft'),{expected_revision:state.revision,actions:picks.map(a=>({binding_id:a.binding_id,connection_id:a.connection_id,action:a.name}))});await load();notify('Choices saved. Select Enable actions to make them available to new attempts.');});});
  root.querySelector('[data-publish]')?.addEventListener('click',()=>action(async()=>{await post(path('tools-publish'),{expected_revision:state.revision});await load();notify('Actions enabled for new task attempts.');}));
  root.querySelector('[data-activity]').onclick=()=>action(async()=>{const r=await api(path('tools-activity'));root.querySelector('[data-tool-activity]').innerHTML=r.invocations.map(i=>`<div class="list-row"><strong>${esc(actionName({name:i.action}))}</strong><p>${esc(i.status)} · ${esc(new Date(i.created_at).toLocaleString())}</p><details><summary>Technical details</summary><small>Task ${esc(i.work_id)} · Attempt ${esc(i.attempt_id)} · Action ${esc(i.action)} · Enabled version ${esc(i.policy_revision)}</small></details></div>`).join('')||'<p>No tool calls yet.</p>';});
 }
 const maybeLoad=()=>{if(root.isConnected&&!root.hidden&&!loaded){loaded=true;load();}};
 const observer=new MutationObserver(maybeLoad);observer.observe(root,{attributes:true,attributeFilter:['hidden']});maybeLoad();
}
