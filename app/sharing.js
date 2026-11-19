import {shortConnection} from './connection-identity.js';

const roles=['viewer','operator','editor','manager'];
const rank={viewer:1,operator:2,editor:3,manager:4};
const title=value=>value.charAt(0).toUpperCase()+value.slice(1);
const descriptions={viewer:'Read instructions, shared memory, tasks, and results.',operator:'Also add and organize tasks and contribute memory.',editor:'Also edit and publish instructions and curate memory.',manager:'Also manage sharing, assistant approvals, and execution settings.'};
const permissions={
 'daemons:read':['Read shared work','Read instructions, memory, tasks, and results.'],
 'work:submit':['Manage tasks','Add tasks, answer questions, reorder, stop, retry, and archive.'],
 'work:execute':['Carry out tasks','Pick up tasks and report progress and results.'],
 'memory:write':['Contribute memory','Save and archive shared Daemon memory.'],
 'daemons:manage':['Manage instructions and work','Edit and publish instructions, pause task starts, and manage tasks.'],
 'tools:use':['Use connected tools','Use separately approved tools during assigned tasks.'],
};
const historyNotice='Anyone you add can read this Daemon’s existing shared memory, tasks, results, and history.';
const date=value=>new Date(value).toLocaleString();
const expired=inv=>Date.parse(inv.expires_at)<=Date.now();
const sourceLabel=s=>s.source_type==='team'?`Via ${s.source_name}`:s.source_name;
const assistantStatus=e=>e.revoked||e.status==='revoked'?'revoked':e.active===false||Date.parse(e.expires_at)<=Date.now()?'expired':!e.authorizer_role&&e.authorizer_role!==undefined?'unavailable':e.status;

export async function mountSharing({root,id,d,api,esc,notify,session,workspaces}){
 const manager=!d.access_role||d.access_role==='manager';
 const workspace=workspaces.find(w=>w.id===d.workspace_id);
 const admin=workspace?.kind==='org'&&['owner','admin'].includes(workspace.role);
 const workspaceName=workspace?.name||d.workspace_name||'Personal';
 const request=(path,body)=>api(path,{method:'POST',body:JSON.stringify(body)});
 let state=null;
 const option=(value,label,selected)=>`<option value="${esc(value)}" ${selected?'selected':''}>${esc(label)}</option>`;
 const roleOptions=selected=>roles.map(r=>option(r,title(r),r===selected)).join('');
 const roleField=(selected='viewer')=>`<label>Role<select name="role" aria-label="Role">${roleOptions(selected)}</select></label><p class="sharing-role-help" data-role-help>${descriptions[selected]}</p>`;
 const acknowledgment='<label class="check history-consent"><input type="checkbox" name="history" required>I understand that existing shared work and history will be visible.</label>';
 const personName=p=>p.email||p.account_id;
 const sources=p=>p.sources.map(s=>`<li><span>${esc(sourceLabel(s))}</span><strong>${title(s.role)}</strong></li>`).join('');
 const workspaceLink=admin?`<a href="/workspaces/${esc(d.workspace_id)}">Manage workspace members and Teams</a>`:'';

 async function load(){state=await api(`daemons/${id}/sharing`);}
 async function reload(){await load();render();}
 async function command(body){await request(`daemons/${id}/sharing`,{revision:state.revision,...body});}
 function guarded(fn){return async()=>{try{await fn();}catch(error){notify(error.message);}};}
 function dialog(name,content,submitLabel,onSubmit,{onReady}={}){
  const opener=document.activeElement;
  const modal=document.createElement('dialog');modal.className='sharing-dialog';modal.setAttribute('aria-labelledby','sharing-dialog-title');
  modal.innerHTML=`<form><div class="sharing-dialog-heading"><h2 id="sharing-dialog-title">${esc(name)}</h2><button type="button" class="secondary" data-close aria-label="Close dialog">✕</button></div>${content}<p class="error" role="alert" data-error hidden></p><button type="button" class="secondary" data-review hidden>Review latest access</button><div class="sharing-dialog-actions"><button type="button" class="secondary" data-close>${submitLabel?'Cancel':'Close'}</button>${submitLabel?`<button type="submit">${esc(submitLabel)}</button>`:''}</div></form>`;
  root.append(modal);
  const form=modal.querySelector('form'),error=modal.querySelector('[data-error]'),review=modal.querySelector('[data-review]');
  for(const button of modal.querySelectorAll('[data-close]'))button.onclick=()=>modal.close();
  modal.addEventListener('close',()=>{modal.remove();if(opener?.isConnected)opener.focus();else root.querySelector('summary')?.focus();});
  const select=form.querySelector('[name=role]');if(select)select.onchange=()=>{form.querySelector('[data-role-help]').textContent=descriptions[select.value];};
  review.onclick=guarded(async()=>{await load();modal.close();render();notify('Access refreshed. Review the current details before making your change again.');});
  form.onsubmit=async event=>{
   event.preventDefault();if(!onSubmit)return;
   const button=event.submitter;button.disabled=true;error.hidden=true;
   try{await onSubmit(new FormData(form),modal);}
   catch(e){error.textContent=e.message;error.hidden=false;if(e.status===409&&/sharing changed|daemon moved|review the current daemon/i.test(e.message)){review.hidden=false;error.textContent+=' Refresh and review the current access before saving again.';return;}}
   finally{if(review.hidden&&button.isConnected)button.disabled=false;}
  };
  onReady?.(form,modal);modal.showModal();return modal;
 }
 async function saved(modal,message){await load();modal.close();render();notify(message);}
 function invitationDialog(){
  dialog('Invite someone',`<p>Create a link for one person. They sign in and accept; you then confirm their account before access is granted.</p>${roleField()}<p class="sharing-disclosure">${historyNotice}</p>${acknowledgment}`,'Create invitation link',async(data,modal)=>{
   const inv=await request('invitations',{daemon_id:id,role:data.get('role'),acknowledge_history:true});
   const link=location.origin+'/invite#'+inv.token;
   // The secret exists only in this dialog and is never persisted or refetched.
   modal.querySelector('form').innerHTML=`<div class="sharing-dialog-heading"><h2 id="sharing-dialog-title">Invitation ready</h2></div><p>Send this single-use link to the intended person. It expires in seven days. No email has been sent.</p><label>Invitation link<input readonly value="${esc(link)}"></label><p>After they accept, confirm their account in Invitations.</p><p role="status" data-copy-status></p><div class="sharing-dialog-actions"><button type="button" class="secondary" data-done>Done</button><button type="button" data-copy>Copy invitation link</button></div>`;
   modal.querySelector('[data-copy]').onclick=async()=>{try{await navigator.clipboard.writeText(link);modal.querySelector('[data-copy-status]').textContent='Invitation link copied.';}catch{modal.querySelector('input').select();modal.querySelector('[data-copy-status]').textContent='Select and copy the invitation link above.';}};
   modal.querySelector('[data-done]').onclick=()=>modal.close();
   modal.addEventListener('close',()=>{if(root.isConnected)reload().catch(e=>notify(e.message));},{once:true});
   modal.querySelector('[data-copy]').focus();
  });
 }
 function editPerson(p){
  const direct=p.sources.find(s=>s.source_type==='direct'),inherited=p.sources.filter(s=>s.source_type!=='direct');
  const inheritedRole=inherited.reduce((best,s)=>rank[s.role]>(rank[best]||0)?s.role:best,null);
  dialog(`Access for ${personName(p)}`,`<p>Current access: <strong>${title(p.role)}</strong></p><ul class="sharing-sources">${sources(p)}</ul>${direct?`${roleField(direct.role)}<label class="check"><input type="checkbox" name="remove">Remove direct access</label><p class="helper" data-access-effect></p><div data-history>${acknowledgment}</div>`:`<p>This person’s access is inherited. Change it at its source.</p>${workspaceLink}`}`,direct?'Save access':null,direct?async(data,modal)=>{
   await command({operation:'access',account_id:p.account_id,role:data.has('remove')?null:data.get('role'),acknowledge_history:data.has('history')});
   await saved(modal,'Access updated.');
  }:null,{onReady:form=>{
   if(!direct)return;
   const role=form.querySelector('[name=role]'),remove=form.querySelector('[name=remove]'),history=form.querySelector('[data-history]'),effect=form.querySelector('[data-access-effect]');
   const update=()=>{role.disabled=remove.checked;const increasing=!remove.checked&&rank[role.value]>rank[direct.role];history.hidden=!increasing;history.querySelector('input').required=increasing;
    effect.textContent=remove.checked?(inheritedRole?`They will keep ${title(inheritedRole)} access through ${inherited.map(sourceLabel).join(', ')}.`:'They will no longer have access to this Daemon.'):(inheritedRole&&rank[inheritedRole]>rank[role.value]?`Their effective role remains ${title(inheritedRole)} through inherited access.`:'This changes their direct access only.');};
   remove.onchange=update;role.addEventListener('change',update);update();
  }});
 }
 function editTeam(team,access){
  dialog(access?`Access for ${team.name}`:'Share with a Team',`${access?`<p>${esc(team.name)} · ${team.member_count} eligible members</p>`:`<label>Team<select name="team">${state.teams.filter(t=>!state.access.some(a=>a.team_id===t.id)).map(t=>option(t.id,`${t.name} (${t.member_count} members)`)).join('')}</select></label>`}${roleField(access?.role||'viewer')}${access?'<label class="check"><input type="checkbox" name="remove">Remove this Team’s access</label><p class="helper">Members may retain access through another Team, direct sharing, or a workspace role.</p>':''}<div data-history><p class="sharing-disclosure">${historyNotice}</p>${acknowledgment}</div>`,access?'Save Team access':'Share with Team',async(data,modal)=>{
   await command({operation:'access',team_id:team?.id||data.get('team'),role:data.has('remove')?null:data.get('role'),acknowledge_history:data.has('history')});await saved(modal,'Team access updated.');
  },{onReady:form=>{
   const role=form.querySelector('[name=role]'),remove=form.querySelector('[name=remove]'),history=form.querySelector('[data-history]');
   const update=()=>{const needed=!remove?.checked&&(!access||rank[role.value]>rank[access.role]);history.hidden=!needed;history.querySelector('input').required=needed;role.disabled=!!remove?.checked;};remove?.addEventListener('change',update);role.addEventListener('change',update);update();
  }});
 }
 function decideInvitation(inv,approve){
  dialog(approve?'Confirm this person’s access':'Revoke invitation',approve?`<p>Grant <strong>${esc(inv.candidate_email||inv.candidate_id)}</strong> ${title(inv.role)} access to this Daemon?</p><p class="sharing-disclosure">${historyNotice}</p>`:'<p>This invitation will no longer be usable. It has not granted access.</p>',approve?'Confirm access':'Revoke invitation',async(_,modal)=>{await request('invitations/'+inv.id,{approve});await saved(modal,approve?'Access granted.':'Invitation revoked.');});
 }
 function editAssistant(e){
  const status=assistantStatus(e),editable=['pending','approved'].includes(status);
  const scopes=e.scopes.filter(s=>s!=='daemons:create');
  dialog(`${editable?'Permissions':'Access'} for ${e.assistant?.name||e.client_name||'Assistant'}`,`<p>Connection <code>${esc(shortConnection({id:e.grant_id}))}</code> · Authorized by ${esc(e.authorizer_email||e.authorizer_id)}</p><p>These permissions apply to this Daemon only. Tool accounts need separate approval in Tools.</p>${editable?'<p>Clear every permission to revoke access. Reconnecting will be required to approve it again.</p>':'<p>This connection needs fresh consent before it can be approved again.</p>'}<fieldset class="assistant-permissions"><legend>${editable?'Allow this assistant to':'Previously approved permissions'}</legend>${scopes.map(s=>{const allowed=editable&&(e.allowed_scopes||scopes).includes(s),label=permissions[s]||[s,''];return `<label class="check"><input type="checkbox" name="scope" value="${esc(s)}" ${e.approved_scopes.includes(s)?'checked':''} ${allowed?'':'disabled'}><span><strong>${esc(label[0])}</strong><small>${esc(label[1])}${editable&&!allowed?' Unavailable for the authorizing person’s current role.':''}</small></span></label>`;}).join('')}</fieldset>`,editable?'Save permissions':null,editable?async(data,modal)=>{await command({operation:'executor',grant_id:e.grant_id,approved_scopes:data.getAll('scope')});await saved(modal,'Assistant permissions updated.');}:null);
 }
 function render(){
  const opened=new Set([...root.querySelectorAll(':scope > details[open]')].map(x=>x.id));
  if(state){const label=document.querySelector('.daemon-access-summary');if(label)label.textContent=`${workspaceName} · ${d.access_role||'manager'} · Lead: ${personName(state.people.find(p=>p.account_id===state.lead_id)||{account_id:'Unassigned'})}`;}
  const pending=state?.invitations.filter(i=>['pending','claimed'].includes(i.status)&&!expired(i))||[];
  const oldInvites=state?.invitations.filter(i=>['pending','claimed'].includes(i.status)&&expired(i))||[];
  const people=state?.people||[];
  const teamShares=state?.access.filter(a=>a.team_id)||[];
  const unsharedTeams=state?.teams.filter(t=>!teamShares.some(a=>a.team_id===t.id))||[];
  const destinations=workspaces.filter(w=>w.id===session.account.id||['owner','admin','member'].includes(w.role));
  const orgs=destinations.filter(w=>w.kind==='org');
  const inviteRow=inv=>`<li class="sharing-row"><div><strong>${esc(inv.candidate_email||inv.candidate_id||'Invitation link')}</strong><p>${title(inv.role)} · ${expired(inv)?'Expired':inv.status==='claimed'?'Needs your confirmation':'Waiting for acceptance'}</p><small>${expired(inv)?'Expired':'Expires'} ${esc(date(inv.expires_at))}</small></div><div class="actions">${!expired(inv)?inv.inviter_id===session.account.id?`${inv.status==='claimed'?`<button data-invite-confirm="${esc(inv.id)}">Review person</button>`:''}<button class="secondary" data-invite-revoke="${esc(inv.id)}">Revoke invitation</button>`:'<span class="helper">The inviter must confirm or revoke.</span>':''}</div></li>`;
  const assistantRow=e=>{const s=assistantStatus(e),labels={pending:'Needs approval',approved:'Access approved',expired:'Access expired',revoked:'Access revoked',unavailable:'Authorizing person no longer has access'};return `<li class="sharing-row"><div><strong>${esc(e.assistant?.name||e.client_name||'Assistant')}</strong><p>Connection <code>${esc(shortConnection({id:e.grant_id}))}</code> · ${esc(e.authorizer_email||e.authorizer_id)}</p><small>${esc(labels[s]||s)}${e.expires_at?` · Expires ${esc(date(e.expires_at))}`:''}</small></div><button class="secondary" data-assistant="${esc(e.grant_id)}">${s==='pending'?'Review request':s==='approved'?'Manage permissions':'View details'}</button></li>`;};
  const assistants=state?.executors||[],live=assistants.filter(e=>['pending','approved'].includes(assistantStatus(e))).sort((a,b)=>(assistantStatus(a)==='pending'?0:1)-(assistantStatus(b)==='pending'?0:1)),inactive=assistants.filter(e=>!live.includes(e));
  root.innerHTML=`<details class="panel sharing-settings" id="sharing-section" ${manager||opened.has('sharing-section')||location.hash==='#sharing'?'open':''}><summary><span><strong>Sharing and access</strong><small>People, Teams, and invitations</small></span></summary><div class="sharing-content">
   <div class="sharing-overview"><div><p class="sharing-eyebrow">${esc(workspaceName)} workspace</p><h3>Who has access${manager?` <span class="column-count">${people.length}</span>`:''}</h3><p class="helper">${manager?'Each person is listed once with their highest role.':'A manager can review and change who has access.'}</p></div>${manager?'<button id="invite-person">Invite someone</button>':''}</div>
   ${manager?`<ul class="sharing-list" aria-label="People with access">${people.map(p=>`<li class="sharing-row"><div class="sharing-person"><span class="sharing-avatar" aria-hidden="true">${esc(personName(p).charAt(0).toUpperCase())}</span><div><strong>${esc(personName(p))}${p.account_id===session.account.id?' <span class="sharing-you">You</span>':''}</strong><p>${p.sources.map(s=>esc(sourceLabel(s))).join(' · ')}</p></div></div><div class="sharing-person-actions"><span class="sharing-role">${title(p.role)}</span><button class="secondary" data-person="${esc(p.account_id)}" aria-label="Manage access for ${esc(personName(p))}">${p.sources.some(s=>s.source_type==='direct')?'Manage access':'View access'}</button></div></li>`).join('')||'<li class="sharing-empty">Access details are unavailable. Refresh to try again.</li>'}</ul>
   <p class="sharing-footnote">People with access can read existing shared work and history. Assistant connections and personal tool credentials are not shared.</p>
   <div class="sharing-subheading"><h3>Shared Teams</h3>${unsharedTeams.length?'<button class="secondary" id="share-team">Share with a Team</button>':''}</div>${teamShares.length?`<ul class="sharing-list">${teamShares.map(a=>{const t=state.teams.find(t=>t.id===a.team_id);return `<li class="sharing-row"><div><strong>${esc(a.team_name||t?.name||'Team')}</strong><p>${t?.member_count??0} eligible ${(t?.member_count??0)===1?'member':'members'} · ${title(a.role)}</p></div><button class="secondary" data-team="${esc(a.team_id)}">Manage Team access</button></li>`;}).join('')}</ul>`:`<p class="sharing-empty">${state.teams.length?'No Teams have been given access.':'No Teams in this workspace.'}</p>`}${workspaceLink}
   <div class="sharing-subheading"><h3>Invitations <span class="column-count">${pending.length}</span></h3><button class="secondary" id="refresh-sharing">Refresh access</button></div><p class="helper">An invitation grants access only after the person accepts and the inviter confirms their account.</p>${pending.length?`<ul class="sharing-list">${pending.map(inviteRow).join('')}</ul>`:'<p class="sharing-empty">No invitations waiting.</p>'}${oldInvites.length?`<details class="sharing-inactive"><summary>Expired invitations (${oldInvites.length})</summary><ul class="sharing-list">${oldInvites.map(inviteRow).join('')}</ul></details>`:''}`:''}
  </div></details>
  ${manager?`<details class="panel sharing-settings" id="assistant-access-section" ${opened.has('assistant-access-section')?'open':''}><summary><span><strong>Assistant access</strong><small>${live.filter(e=>assistantStatus(e)==='pending').length} ${live.filter(e=>assistantStatus(e)==='pending').length===1?'request':'requests'} to review · ${live.filter(e=>assistantStatus(e)==='approved').length} approved</small></span></summary><div class="sharing-content"><p>People and assistants have separate access. Review what each assistant is allowed to do for this Daemon.</p>${live.length?`<ul class="sharing-list">${live.map(assistantRow).join('')}</ul>`:'<p class="sharing-empty">No active assistant connections.</p>'}${inactive.length?`<details class="sharing-inactive"><summary>Inactive connections (${inactive.length})</summary><ul class="sharing-list">${inactive.map(assistantRow).join('')}</ul></details>`:''}<a href="/connections?group=daemon">Manage connected assistants</a></div></details>
  <details class="panel sharing-settings" id="responsibility-section" ${opened.has('responsibility-section')?'open':''}><summary><span><strong>Responsibility</strong><small>${esc(personName(people.find(p=>p.account_id===state.lead_id)||{account_id:'No lead assigned'}))}</small></span></summary><div class="sharing-content"><h3>Accountable lead</h3><p>The lead is responsible for moving this Daemon’s work forward. Being the lead does not add permissions.</p><button class="secondary" id="change-lead">Change lead</button></div></details>`:''}
  <details class="panel sharing-settings" id="copy-move-section" ${opened.has('copy-move-section')?'open':''}><summary><span><strong>Copy or move</strong><small>Start a copy or change its workspace</small></span></summary><div class="sharing-content"><h3>Create a copy</h3><p>Copy the published instructions into a new draft. Tasks, history, memory, collaborators, and assistant connections are not copied.</p><button class="secondary" id="copy-daemon" ${d.published_revision?'':'disabled'}>Create a copy</button>${!d.published_revision?'<p class="helper">Publish instructions before creating a copy.</p>':''}${manager&&d.workspace_id===session.account.id&&orgs.length?'<hr><h3>Move to an Org</h3><p>Move this Daemon and its full history. Existing sharing, invitations, and assistant approvals will be removed. Automatic pickup will be turned off. Connected tool access will be removed.</p><button class="secondary" id="move-daemon">Review move</button>':''}</div></details>`;
  root.querySelector('#copy-daemon').onclick=()=>dialog('Create a copy',`<p>The new Daemon starts with published instructions only. Choose where to create it.</p><label>Copy into<select name="workspace">${destinations.map(w=>option(w.id,w.name)).join('')}</select></label>`,'Create copy',async(data)=>{const copy=await request(`daemons/${id}/copy`,{workspace_id:data.get('workspace')});location.assign(`/daemons/${copy.id}/edit`);});
  if(!manager)return;
  root.querySelector('#invite-person').onclick=invitationDialog;
  root.querySelector('#refresh-sharing').onclick=guarded(async()=>{await reload();notify('Access refreshed.');});
  root.querySelector('#share-team')?.addEventListener('click',()=>editTeam(null,null));
  for(const button of root.querySelectorAll('[data-person]'))button.onclick=()=>editPerson(people.find(p=>p.account_id===button.dataset.person));
  for(const button of root.querySelectorAll('[data-team]'))button.onclick=()=>editTeam(state.teams.find(t=>t.id===button.dataset.team),teamShares.find(a=>a.team_id===button.dataset.team));
  for(const button of root.querySelectorAll('[data-invite-confirm],[data-invite-revoke]'))button.onclick=()=>decideInvitation(state.invitations.find(i=>i.id===(button.dataset.inviteConfirm||button.dataset.inviteRevoke)),!!button.dataset.inviteConfirm);
  for(const button of root.querySelectorAll('[data-assistant]'))button.onclick=()=>editAssistant(assistants.find(e=>e.grant_id===button.dataset.assistant));
  root.querySelector('#change-lead').onclick=()=>dialog('Change accountable lead',`<p>Choose someone with Editor or Manager access.</p><label>Accountable lead<select name="lead">${option('','Unassigned',!state.lead_id)}${state.lead_candidates.map(p=>option(p.account_id,personName(p),p.account_id===state.lead_id)).join('')}</select></label>`,'Save lead',async(data,modal)=>{await command({operation:'lead',lead_id:data.get('lead')||null});await saved(modal,'Accountable lead updated.');});
  root.querySelector('#move-daemon')?.addEventListener('click',()=>dialog('Move this Daemon to an Org',`<p>This preserves the Daemon’s address and history, but removes existing sharing, invitations, and assistant approvals. Everyone will need fresh access. Active work and external memory cleanup must finish first.</p><label>Destination Org<select name="workspace">${orgs.map(w=>option(w.id,w.name)).join('')}</select></label><label class="check history-consent"><input type="checkbox" required>I understand that existing access will be removed and the full history will move.</label>`,'Move to Org',async(data)=>{await request(`daemons/${id}/move`,{workspace_id:data.get('workspace'),revision:state.revision,acknowledge_history:true});location.reload();}));
 }
 try{if(manager)await load();render();}
 catch(error){root.innerHTML='<p class="error" role="alert">Sharing settings could not be loaded.</p><button class="secondary">Try again</button>';root.querySelector('button').onclick=guarded(reload);notify(error.message);}
}
