import {connectionTitle} from './connection-identity.js';

// Per assistant and Daemon. This policy affects only tasks the assistant discovers.
export function mountTaskDiscovery({root,id,api,notify,esc}) {
  let busy=false,loading=false,last='';
  const path=`daemons/${id}/task-discovery`;
  root.innerHTML='<p>Loading assistant-discovered task settings…</p>';
  function render(rows){
    const live=rows.filter(r=>r.active),inactive=rows.filter(r=>!r.active);
    const html=`<p class="helper">Choose what happens when each connected assistant finds a useful follow-up task while working. This setting applies only to tasks that assistant discovers; tasks you add yourself keep the normal queue rules.</p><p class="helper"><strong>Take approval</strong> saves a proposal for you to review. It cannot start until a manager approves it. <strong>Run freely</strong> adds it directly to the queue. Automatic pickup is a separate setting and does not wake an assistant.</p>${live.length?live.map(r=>`<div class="list-row discovery-policy" data-policy="${esc(r.connection_id)}"><div><strong>${esc(connectionTitle(r))}</strong>${r.label?`<br><small>${esc(r.name)}</small>`:''}</div><label>Discovered tasks<select data-mode data-connection="${esc(r.connection_id)}" data-revision="${r.revision}"><option value="take_approval" ${r.mode==='take_approval'?'selected':''}>Take approval (recommended)</option><option value="run_freely" ${r.mode==='run_freely'?'selected':''}>Run freely</option></select></label><button type="button" data-save="${esc(r.connection_id)}" class="secondary" disabled>Save</button></div>`).join(''):'<p>No active assistant connections can add tasks to this Daemon.</p>'}${inactive.length?`<details><summary>Expired or revoked connections (${inactive.length})</summary>${inactive.map(r=>`<p class="helper">${esc(connectionTitle(r))} · ${r.revoked?'Revoked':'Expired'} · Setting: ${r.mode==='run_freely'?'Run freely':'Take approval'}</p>`).join('')}</details>`:''}<details><summary>How this works</summary><p class="helper">In Take approval mode, a discovered task appears in Needs approval on the task board. A manager can approve it into the queue or dismiss it. Pending proposals are never available to manual or automatic task pickup. In Run freely mode, the assistant can add a discovered task to the queue if its connection has permission to add tasks. Neither mode gives permission to use external tools or perform actions outside Daemons.ai.</p></details><button type="button" class="secondary" data-discovery-refresh>Refresh discovered-task settings</button>`;
    if(html!==last){root.innerHTML=html;last=html;}
  }
  async function refresh(force=false){
    if(!root.isConnected||loading||busy||(!force&&(document.hidden||root.contains(document.activeElement))))return;
    loading=true;try{const rows=await api(path);if(root.isConnected)render(rows);}catch(e){if(!last)root.innerHTML='<p>Task discovery settings could not be loaded.</p><button type="button" class="secondary" data-discovery-refresh>Try again</button>';if(force)notify(e.message);}finally{loading=false;}
  }
  root.addEventListener('change',e=>{const select=e.target.closest('[data-mode]');if(!select)return;const button=root.querySelector(`[data-save="${CSS.escape(select.dataset.connection)}"]`);if(button)button.disabled=false;});
  root.addEventListener('click',async e=>{
    if(e.target.closest('[data-discovery-refresh]')){await refresh(true);return;}
    const button=e.target.closest('[data-save]');if(!button||busy)return;
    const select=root.querySelector(`[data-mode][data-connection="${CSS.escape(button.dataset.save)}"]`);if(!select)return;
    busy=true;button.disabled=true;
    try{const rows=await api(path,{method:'PUT',body:JSON.stringify({connection_id:select.dataset.connection,mode:select.value,expected_revision:Number(select.dataset.revision)})});render(rows);notify('Discovered task setting saved.');}
    catch(err){notify(err.message);last='';busy=false;await refresh(true);}
    finally{busy=false;}
  });
  refresh(true);
}
