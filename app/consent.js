import {definitionFields,definitionFromForm,emptyDefinition} from './definition.js';

export async function mountConsent({main,api,post,esc,notify,id,session,workspace,canCreate,permissionLabels}) {
  const path=`authorization/${encodeURIComponent(id)}`;
  const personal=!session.collaboration_enabled||workspace===session.account.id;
  let request,daemons,scopes,selected=new Set(),savedDraft=null;
  const expired=()=>{
    main.innerHTML=`<h1>This connection request expired</h1><p>Return to your assistant and start the connection again.</p>${savedDraft?`<p>Your Daemon was saved as a draft. It has not been published or shared with this assistant.</p><a href="/daemons/${esc(savedDraft.id)}">Open your saved Daemon</a>`:''}<p>Existing Daemons remain saved in your <a href="/">control room</a>.</p>`;
  };
  const handleError=error=>{if(error.code==='invalid_request')expired();else notify(error.message);};
  try {
    [request,daemons]=await Promise.all([api(path),api('daemons')]);
  } catch(error) {handleError(error);if(error.code!=='invalid_request')throw error;return;}
  scopes=new Set(request.scopes.filter(s=>personal||s!=='daemons:create'));
  function render() {
    const available=request.scopes.filter(s=>personal||s!=='daemons:create');
    main.innerHTML=`<div class="eyebrow">Approve a connection</div><h1>Allow ${esc(request.client_name)}?</h1><p class="lead">Choose which Daemons this assistant may use and what it may do. Nothing is shared until you approve.</p>${session.collaboration_enabled?`<p class="helper">Use the workspace picker above to choose where to connect. ${personal?'New Daemons will be created in your Personal workspace.':'Shared Daemons require a manager’s approval. Assistants cannot create Daemons in this workspace; you can create them here yourself.'}</p>`:''}<section class="panel"><form id="consent"><h2>Which Daemons can it use?</h2>${daemons.length?daemons.map(d=>`<label class="check"><input type="checkbox" name="daemon" value="${esc(d.id)}" ${selected.has(d.id)?'checked':''}>${esc(d.draft?.name||d.display_definition?.name||'Unpublished Daemon')}</label>`).join(''):'<p id="first-daemon"></p>'}<h2>What can it do?</h2><ul id="permission-summary" class="consent-permissions" aria-label="Selected permissions"></ul><details><summary>Customize access</summary><fieldset><legend>Requested permissions</legend>${available.map(s=>`<label class="check"><input type="checkbox" name="scope" value="${esc(s)}" ${scopes.has(s)?'checked':''}>${esc(permissionLabels[s]||s)}</label>`).join('')}</fieldset></details><p>Access covers only your selected Daemons${personal?' and Daemons this connection creates':''}. Other existing or future Daemons are not included. Connected tools require separate account and action approval and can be used only during authorized tasks.</p><p>Access expires in 30 days. Remove it sooner in <a href="/connections">Assistant access</a>. Approval does not start an assistant, create a Daemon, or start a task.</p><p class="helper">After your decision, you’ll return to: ${esc(request.redirect_uri)}</p><p id="consent-help" role="status"></p><div class="actions"><button id="allow">Allow selected access</button><button type="button" id="deny" class="secondary">Cancel</button></div></form></section>${!daemons.length&&canCreate?`<details class="panel" id="create-first"><summary>Create your first Daemon here instead</summary><p>Save a draft, then review this connection again. This will not publish instructions or start work.</p><form id="first-definition">${definitionFields(emptyDefinition(),esc)}<button>Save draft and return to approval</button><p id="create-status" role="status"></p></form></details>`:''}`;
    const form=main.querySelector('#consent');
    let busy=false;
    const setBusy=value=>{busy=value;main.querySelectorAll('form button').forEach(button=>{button.disabled=value;});if(!value)update();};
    const update=()=>{
      const f=new FormData(form); selected=new Set(f.getAll('daemon'));scopes=new Set(f.getAll('scope'));
      const creates=personal&&scopes.has('daemons:create');
      const valid=scopes.size>0&&(selected.size>0||creates);
      main.querySelector('#allow').disabled=busy||!valid;
      main.querySelector('#consent-help').textContent=!scopes.size?'Choose at least one permission in Customize access.':!valid?(canCreate?'Select a Daemon to continue, or create a draft below.':'Select a Daemon, or choose another workspace. Ask a manager to share a Daemon if needed.'):'';
      const first=main.querySelector('#first-daemon');
      if(first)first.textContent=creates?`No Daemons yet. Connect ${request.client_name} to create your first one together.`:(canCreate?'No Daemons in this workspace yet. Create a draft below, or approve creating Daemons in Customize access if this assistant requested it.':'No Daemons available here. Choose another workspace, or ask a manager to share one with you.');
      const summaries={'daemons:read':'Read instructions, memory, tasks, and results','daemons:create':'Create new Daemons','daemons:manage':'Edit and publish instructions; manage tasks','work:submit':'Add and organize tasks','work:execute':'Carry out tasks and report results','memory:write':'Save and archive shared memory','tools:use':'Use approved tools during assigned tasks'};
      main.querySelector('#permission-summary').innerHTML=scopes.size?Array.from(scopes,s=>`<li>${esc(summaries[s]||permissionLabels[s]||s)}</li>`).join(''):'<li>No permissions selected.</li>';
    };
    form.onchange=update;update();
    form.onsubmit=async e=>{
      e.preventDefault();if(busy)return;update();const button=main.querySelector('#allow');if(button.disabled)return;setBusy(true);
      try {const r=await post(path,{daemon_ids:[...selected],scopes:[...scopes],...(session.collaboration_enabled?{workspace_id:workspace}:{})});location.assign(r.redirect_to);}
      catch(error){handleError(error);if(button.isConnected)setBusy(false);}
    };
    main.querySelector('#deny').onclick=async e=>{
      const button=e.currentTarget;if(busy)return;setBusy(true);
      try {const r=await post(path,{deny:true});location.assign(r.redirect_to);}catch(error){handleError(error);if(button.isConnected)setBusy(false);}
    };
    const create=main.querySelector('#first-definition');
    if(create)create.onsubmit=async e=>{
      e.preventDefault();const button=create.querySelector('button');if(busy||button.disabled)return;setBusy(true);
      let saving=false;
      try {
        await api(path); // Do not create a draft for an already expired request.
        saving=true;
        savedDraft=await post('daemons',{definition:definitionFromForm(new FormData(create))});
        selected.add(savedDraft.id);
        await api(path); // A saved draft survives an authorization that expires during creation.
        daemons=await api('daemons');render();
      } catch(error){
        if(error.code==='invalid_request'){expired();return;}
        notify(error.message);
        if(savedDraft){main.innerHTML=`<h1>Your draft is saved</h1><p>We couldn’t reload approval. Your Daemon has not been published or shared.</p><a href="/daemons/${esc(savedDraft.id)}">Open your saved Daemon</a><button id="retry-approval">Reload approval</button>`;main.querySelector('button').onclick=()=>location.reload();}
        else if(saving){setBusy(false);create.querySelector('#create-status').textContent='We couldn’t confirm whether the draft was saved. Reload approval and check your Daemons before creating another.';button.textContent='Reload approval';button.disabled=false;create.onsubmit=e=>{e.preventDefault();location.reload();};}
        else setBusy(false);
      }
    };
  }
  render();
}
