import {connectionTitle} from './connection-identity.js';

// Per assistant and Daemon. This policy affects only tasks the assistant discovers.
export function mountTaskDiscovery({root,id,api,notify,esc}) {
  let busy=false,loading=false,last='';
  const path=`daemons/${id}/task-discovery`;
  root.innerHTML='<p>Loading task suggestion settings…</p>';
  function render(rows){
    const live=rows.filter(r=>r.active),inactive=rows.filter(r=>!r.active);
    const html=`<p class="helper">Choose what happens when each assistant suggests extra work. This applies only to suggestions; tasks you add yourself follow the usual rules.</p><p class="helper"><strong>Ask me first</strong> keeps the suggestion out of the waiting list until a Manager approves it. <strong>Add to waiting list</strong> queues it; the assistant can start it when it checks for work and has permission.</p>${live.length?live.map(r=>`<div class="list-row discovery-policy" data-policy="${esc(r.connection_id)}"><div><strong>${esc(connectionTitle(r))}</strong>${r.label?`<br><small>${esc(r.name)}</small>`:''}</div><label>For this assistant<select data-mode data-connection="${esc(r.connection_id)}" data-revision="${r.revision}" aria-label="Task suggestions for ${esc(connectionTitle(r))}"><option value="take_approval" ${r.mode==='take_approval'?'selected':''}>Ask me first (recommended)</option><option value="run_freely" ${r.mode==='run_freely'?'selected':''}>Add to waiting list</option></select></label><button type="button" data-save="${esc(r.connection_id)}" class="secondary" disabled>Save</button></div>`).join(''):'<p>No active assistant connections can add tasks to this Daemon. <a href="/connect">Connect an assistant</a> with permission to add tasks.</p>'}${inactive.length?`<details><summary>Inactive assistant connections (${inactive.length})</summary>${inactive.map(r=>`<p class="helper">${esc(connectionTitle(r))} · ${r.revoked?'Revoked':'Expired'} · ${r.mode==='run_freely'?'Adds suggestions to the waiting list':'Asks before adding suggestions'}</p>`).join('')}</details>`:''}<details><summary>More about task suggestions</summary><p class="helper">When you choose Ask me first, the assistant’s suggestion appears under Needs approval on the task board. It cannot start until a Manager approves it. Neither choice gives the assistant access to outside tools or changes its other permissions.</p></details><button type="button" class="secondary" data-discovery-refresh>Refresh</button>`;
    if(html!==last){root.innerHTML=html;last=html;}
  }
  async function refresh(force=false){
    if(!root.isConnected||loading||busy||(!force&&(document.hidden||root.contains(document.activeElement))))return;
    loading=true;try{const rows=await api(path);if(root.isConnected)render(rows);}catch(e){if(!last)root.innerHTML='<p>Task suggestion settings could not be loaded.</p><button type="button" class="secondary" data-discovery-refresh>Try again</button>';if(force)notify(e.message);}finally{loading=false;}
  }
  root.addEventListener('change',e=>{const select=e.target.closest('[data-mode]');if(!select)return;const button=root.querySelector(`[data-save="${CSS.escape(select.dataset.connection)}"]`);if(button)button.disabled=false;});
  root.addEventListener('click',async e=>{
    if(e.target.closest('[data-discovery-refresh]')){await refresh(true);return;}
    const button=e.target.closest('[data-save]');if(!button||busy)return;
    const select=root.querySelector(`[data-mode][data-connection="${CSS.escape(button.dataset.save)}"]`);if(!select)return;
    busy=true;button.disabled=true;
    try{const rows=await api(path,{method:'PUT',body:JSON.stringify({connection_id:select.dataset.connection,mode:select.value,expected_revision:Number(select.dataset.revision)})});render(rows);notify('Task suggestion setting saved.');}
    catch(err){notify(err.message);last='';busy=false;await refresh(true);}
    finally{busy=false;}
  });
  refresh(true);
}
