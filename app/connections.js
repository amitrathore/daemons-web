import {shortConnection} from './connection-identity.js';
import {mountAutomaticPickup} from './automatic-pickup.js';

export async function mountConnections({main,api,notify,esc,dateLabel,permissionLabels,readableKey}) {
  const [rows,daemons]=await Promise.all([api('connections'),api('daemons')]);
  const daemonName=d=>d.draft?.name||d.published_definition?.name||'Daemon';
  const names=new Map(daemons.map(d=>[d.id,daemonName(d)]));
  const stamp=value=>Number.isFinite(Date.parse(value))?Date.parse(value):0;
  const status=row=>row.revoked?'revoked':stamp(row.expires_at)>Date.now()?'active':'expired';
  const currentView=()=>new URL(location.href).searchParams.get('group')==='connection'?'connection':'daemon';
  const original=row=>row.assistant?.name||row.client_name||'Assistant';
  const metadata=row=>row.label?[original(row),row.client_name!==original(row)?row.client_name:''].filter(Boolean).join(' · '):row.client_name!==original(row)?row.client_name||'':'';
  rows.sort((a,b)=>stamp(b.last_seen_at||b.created_at)-stamp(a.last_seen_at||a.created_at)||stamp(b.created_at)-stamp(a.created_at)||String(a.id).localeCompare(String(b.id)));
  daemons.sort((a,b)=>daemonName(a).localeCompare(daemonName(b),undefined,{sensitivity:'base'})||String(a.id).localeCompare(String(b.id)));

  function card(row,daemon=null) {
    const canonical=!daemon;
    const knownIds=(row.daemon_ids||[]).filter(id=>names.has(id));
    const pickupIds=daemon?(names.has(daemon.id)?[daemon.id]:[]):knownIds;
    const key=canonical?`connection-${row.id}`:`daemon-${daemon.id}-connection-${row.id}`;
    const state=status(row);
    return `<section class="panel connection-card" data-connection="${esc(row.id)}" id="${esc(key)}" tabindex="-1" aria-labelledby="${esc(key)}-title">
      <div class="toolbar"><div><h3 class="connection-title" id="${esc(key)}-title">${esc(row.label||original(row))}</h3><p class="connection-original" ${metadata(row)?'':'hidden'}>${esc(metadata(row))}</p></div><span class="badge">${state==='active'?'Access approved':state==='expired'?'Access expired':'Access revoked'}</span></div>
      <div class="connection-meta"><span>Connection <code>${esc(shortConnection(row))}</code></span>${canonical?'<button class="secondary" type="button" data-copy-id>Copy full ID</button><button class="secondary" type="button" data-edit-label aria-expanded="false">Edit nickname</button>':`<a class="button secondary" data-manage-connection="${esc(row.id)}" href="${esc(viewUrl('connection',row.id))}">Manage connection</a>`}</div>
      ${canonical?`<form class="connection-label-form" hidden><label>Connection nickname<input name="label" maxlength="80" value="${esc(row.label||'')}" placeholder="e.g. Claude — Work laptop"></label><p class="helper">Only you control this label. Leave it blank to use the assistant’s name.</p><p class="label-error error" role="status"></p><div class="actions"><button>Save nickname</button><button type="button" class="secondary" data-cancel-label>Cancel</button></div></form>`:''}
      <p class="helper connection-dates">Approved: ${row.created_at?esc(dateLabel(row.created_at)):'Not recorded'} · Connection last used: ${row.last_seen_at?esc(dateLabel(row.last_seen_at)):'Not used yet'}<br>Access expires: ${esc(dateLabel(row.expires_at))}</p>
      ${daemon?.id==='other'?`<p class="helper">${(row.daemon_ids||[]).length?'Daemon details unavailable.':'No Daemon selected.'}</p>`:''}
      <details class="connection-permissions"><summary>${canonical?'Permissions and Daemons':'Permissions'}</summary><h4>Allowed to</h4><ul class="permission-list">${(row.scopes||[]).map(scope=>`<li>${esc(permissionLabels[scope]||readableKey(scope))}</li>`).join('')}</ul>${canonical?`<h4>For these Daemons</h4>${knownIds.length?`<ul>${knownIds.map(id=>`<li><a href="/daemons/${esc(id)}">${esc(names.get(id))}</a></li>`).join('')}</ul>`:''}${!(row.daemon_ids||[]).length?'<p>No Daemon selected. Create permission applies to Daemons this assistant creates.</p>':knownIds.length<row.daemon_ids.length?'<p>Some Daemon details are unavailable.</p>':''}`:''}</details>
      ${(row.scopes||[]).includes('work:execute')&&state==='active'&&pickupIds.length?`<details class="connection-pickup"><summary>${canonical?'Automatic pickup by Daemon':'Automatic pickup'}</summary>${pickupIds.map(id=>`<section>${canonical?`<h4>${esc(names.get(id))}</h4>`:''}<div data-pickup-daemon="${esc(id)}" data-pickup-connection="${esc(row.id)}"></div></section>`).join('')}</details>`:''}
      ${canonical?(!row.revoked?'<p class="helper connection-revoke-scope">This removes the connection’s access to every Daemon it can use.</p><button type="button" class="danger" data-revoke>Remove access to all Daemons</button>':'<p class="helper">This connection can no longer use Daemons.ai.</p>'):''}
    </section>`;
  }

  function statusGroups(subset,daemon=null) {
    return ['active','expired','revoked'].map(key=>{
      const selected=subset.filter(row=>status(row)===key);
      const title={active:'Active access',expired:'Expired',revoked:'Revoked'}[key];
      if(!selected.length)return key==='active'?'<p class="connection-empty">No active connections.</p>':'';
      const content=selected.map(row=>card(row,daemon)).join('');
      return key==='active'?`<section data-connection-group="active"><h${daemon?'3':'2'}>${title} <span class="column-count">${selected.length}</span></h${daemon?'3':'2'}>${content}</section>`:`<details class="inactive-connections" data-connection-group="${key}"><summary>${title} <span class="column-count">${selected.length}</span></summary>${content}</details>`;
    }).join('');
  }

  function daemonView() {
    const sections=daemons.map(daemon=>{
      const selected=rows.filter(row=>(row.daemon_ids||[]).includes(daemon.id));
      const count=selected.filter(row=>status(row)==='active').length;
      return `<section class="daemon-connections" data-daemon-group="${esc(daemon.id)}"><div class="toolbar daemon-connections-heading"><h2><a href="/daemons/${esc(daemon.id)}">${esc(daemonName(daemon))}</a></h2><span class="badge">${count} active connection${count===1?'':'s'}</span></div>${statusGroups(selected,daemon)}${selected.length?'':'<a href="/connect">How to connect an assistant →</a>'}</section>`;
    }).join('');
    const other=rows.filter(row=>!(row.daemon_ids||[]).some(id=>names.has(id)));
    return sections+(other.length?`<section class="other-connections" data-other-connections><h2>Other connections</h2><p class="helper">These connections have no selected Daemon or their Daemon details are unavailable.</p>${statusGroups(other,{id:'other'})}</section>`:'');
  }

  function viewUrl(view,connectionId=null) {
    const url=new URL(location.href);
    url.searchParams.set('group',view);
    url.hash=connectionId?`connection-${connectionId}`:'';
    return url.pathname+url.search+url.hash;
  }

  function navigate(view,connectionId=null) {
    history.pushState(null,'',viewUrl(view,connectionId));
    render();
    if(!connectionId)main.querySelector(`[data-group-view="${view}"]`)?.focus();
  }

  function updateRow(row,patch) {
    Object.assign(row,patch);
  }

  function render() {
    const view=currentView();
    const empty='<div class="empty"><h2>No connected assistants yet.</h2><p>Start in your assistant’s connection settings, then choose which Daemons it may use.</p><a href="/connect">How to connect an assistant →</a></div>';
    main.innerHTML=`<div class="eyebrow">You choose who can act</div><h1>Connected assistants</h1><p class="lead">See which assistants can work on each Daemon, or manage a connection across all its Daemons. Multiple connections can use the same assistant name; nicknames and connection IDs tell them apart.</p><p class="helper">Active access means permission is valid; it does not mean an assistant is online. Connection last used records API activity across all its Daemons. Removing access prevents further actions here, but does not shut down software elsewhere.</p><fieldset class="connection-grouping" data-connection-views><legend>Group by</legend><div class="connection-view-buttons"><button class="secondary" type="button" data-group-view="daemon" aria-pressed="${view==='daemon'}">Daemon</button><button class="secondary" type="button" data-group-view="connection" aria-pressed="${view==='connection'}">Connection</button></div></fieldset>${!rows.length?empty:''}<div class="connection-results">${view==='daemon'?daemonView():rows.length?statusGroups(rows):''}</div>`;
    main.querySelectorAll('[data-group-view]').forEach(button=>{button.onclick=()=>navigate(button.dataset.groupView);});
    main.querySelectorAll('[data-manage-connection]').forEach(link=>{link.onclick=event=>{
      if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
      event.preventDefault();navigate('connection',link.dataset.manageConnection);
    };});

    if(view==='connection')for(const el of main.querySelectorAll('[data-connection]')) {
      const row=rows.find(item=>item.id===el.dataset.connection);
      const form=el.querySelector('form'),input=form.elements.label,edit=el.querySelector('[data-edit-label]'),error=form.querySelector('.label-error');
      const paint=()=>{
        el.querySelector('.connection-title').textContent=row.label||original(row);
        const text=el.querySelector('.connection-original');text.textContent=metadata(row);text.hidden=!text.textContent;
      };
      const close=()=>{form.hidden=true;edit.setAttribute('aria-expanded','false');edit.focus();};
      edit.onclick=()=>{input.value=row.label||'';error.textContent='';form.hidden=false;edit.setAttribute('aria-expanded','true');input.focus();};
      el.querySelector('[data-cancel-label]').onclick=close;
      el.querySelector('[data-copy-id]').onclick=async()=>{try{await navigator.clipboard.writeText(row.id);notify('Connection ID copied.');}catch{notify('Couldn’t copy the ID. Please try again.');}};
      form.onsubmit=async event=>{
        event.preventDefault();const button=form.querySelector('button');button.disabled=true;error.textContent='';
        try {
          const result=await api(`connections/${row.id}/label`,{method:'PUT',body:JSON.stringify({label:input.value.trim(),expected_revision:row.label_revision||0})});
          updateRow(row,result);paint();close();notify('Connection nickname saved.');
          for(const root of el.querySelectorAll('[data-pickup-daemon]'))root.dispatchEvent(new CustomEvent('connection-label-saved'));
        } catch(errorResult) {
          error.textContent=errorResult.message;
          try{const saved=(await api('connections')).find(item=>item.id===row.id);if(saved){updateRow(row,saved);paint();error.textContent+=` Saved label: ${row.label||original(row)}. Your draft is kept.`;}}catch{}
        } finally {button.disabled=false;}
      };
      const revoke=el.querySelector('[data-revoke]');if(revoke)revoke.onclick=async()=>{
        revoke.disabled=true;
        try{await api(`connections/${row.id}`,{method:'DELETE'});updateRow(row,{revoked:true});render();notify('Connection access removed from all Daemons.');}
        catch(errorResult){notify(errorResult.message);revoke.disabled=false;}
      };
    }
    main.querySelectorAll('[data-pickup-daemon]').forEach(root=>{
      const controller=mountAutomaticPickup({root,id:root.dataset.pickupDaemon,connectionId:root.dataset.pickupConnection,api,notify,esc});
      root.addEventListener('connection-label-saved',()=>controller.refresh(true));
    });
    if(view==='connection'&&location.hash.startsWith('#connection-')) {
      const target=document.getElementById(location.hash.slice(1));
      if(target&&main.contains(target)){const section=target.closest('details.inactive-connections');if(section)section.open=true;target.focus({preventScroll:true});target.scrollIntoView({block:'center'});}
    }
  }

  const change=()=>{
    if(!main.querySelector('[data-connection-views]')){window.removeEventListener('popstate',change);return;}
    render();
  };
  window.addEventListener('popstate',change);
  render();
}
