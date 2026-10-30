import {connectionTitle} from './connection-identity.js';
// Owner settings only. This module never claims or executes a task.
export function mountAutomaticPickup({root,id,connectionId,api,notify,esc}) {
  let busy=false,loading=false,last='',timer;
  const path=`daemons/${id}/automatic-pickup`;
  root.innerHTML='<p>Loading automatic pickup settings…</p>';
  function render(data){
    const rows=(data.connections||[]).filter(r=>!connectionId||r.connection_id===connectionId);
    const brief=document.querySelector('#pickup-brief');if(brief){const active=rows.filter(r=>r.active),enabled=active.filter(r=>r.enabled);const checked=active.filter(r=>r.last_checked_at).sort((a,b)=>b.last_checked_at.localeCompare(a.last_checked_at))[0];brief.textContent=`${data.paused?'Paused':enabled.length?enabled.length+' connection'+(enabled.length===1?'':'s')+' enabled':'Off'}${checked?' · Last checked '+new Date(checked.last_checked_at).toLocaleString():''}`;}
    const html=`<p class="helper">When an assistant checks for work, it may start the next queued task without another prompt. The assistant must be running and support automatic pickup. This does not wake or schedule an assistant.</p>${data.paused?'<p class="callout">Automatic pickup paused. Resume task starts to allow new work.</p>':''}${!data.published?'<p>Publish instructions before enabling automatic pickup.</p>':''}${rows.length?rows.map(r=>`<div class="list-row"><label class="check"><input type="checkbox" data-auto-connection="${esc(r.connection_id)}" data-revision="${r.revision}" ${r.enabled?'checked':''} ${!r.active||!data.published?'disabled':''} aria-label="Auto-start queued tasks for ${esc(connectionTitle(r))}"><span><strong>${esc(connectionTitle(r))}</strong>${r.label?`<br><small>${esc(r.assistant_name||r.name)}</small>`:""}<br>Auto-start queued tasks</span></label><p class="helper">${!r.active?'Connection expired or revoked. ':''}${r.last_checked_at?`Last checked ${esc(new Date(r.last_checked_at).toLocaleString())}`:'Never checked'}${r.last_outcome?` · Last outcome: ${esc(({disabled:'Off',paused:'Paused',busy:'Task in progress',empty:'No queued tasks',claimed:'Task started',incompatible:'Assistant abilities do not match'})[r.last_outcome]||'Check recorded')}`:''}${r.active_work_id?' · Task in progress':''}</p></div>`).join(''):'<p>No authorized executor connections for this Daemon. <a href="/connect">Connect an assistant</a> with permission to pick up tasks.</p>'}<details><summary>How automatic pickup works</summary><p class="helper">Turning this off prevents future automatic starts; active work continues. Explicitly requested manual pickup is still allowed. One automatic task starts only when this connection has no task in progress. <a href="${'https://api.daemons.ai'}/docs/mcp#automatic-pickup">Executor loop guide →</a></p></details><button type="button" class="secondary" data-auto-refresh>Refresh pickup settings</button>`;
    if(html!==last){root.innerHTML=html;last=html;}
  }
  async function refresh(force=false){
    if(!root.isConnected){clearInterval(timer);return;}
    if(busy||loading||(!force&&(document.hidden||root.contains(document.activeElement))))return;
    loading=true;
    try{const data=await api(path);if(root.isConnected)render(data);}catch(e){if(!last)root.innerHTML='<p>Pickup settings could not be loaded.</p><button type="button" class="secondary" data-auto-refresh>Try again</button>';if(force)notify(e.message);}finally{loading=false;}
  }
  root.addEventListener('change',async e=>{
    const input=e.target.closest('[data-auto-connection]');if(!input||busy)return;
    busy=true;input.disabled=true;
    try{const data=await api(path,{method:'PUT',body:JSON.stringify({connection_id:input.dataset.autoConnection,enabled:input.checked,expected_revision:Number(input.dataset.revision)})});render(data);notify(input.checked?'Automatic pickup enabled. The assistant must check for work.':'Automatic pickup disabled. Active work continues.');}
    catch(err){notify(err.message);last='';}
    finally{busy=false;input.disabled=false;await refresh(true);}
  });
  root.addEventListener('click',e=>{if(e.target.closest('[data-auto-refresh]'))refresh(true);});
  timer=setInterval(()=>refresh(),15000);refresh(true);
  return {refresh};
}
