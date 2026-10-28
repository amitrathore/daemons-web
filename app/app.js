import {API} from './config.js';
import {mountMemory} from './memory.js';
const main = document.querySelector('#main');
let session;
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pretty = v => esc(JSON.stringify(v, null, 2));
const status = v => `<span class="badge ${esc(v)}">${esc(statusLabels[v] || readableKey(v))}</span>`;
const newKey = () => crypto.randomUUID();
async function api(path, options={}) {
  const headers = {'Content-Type':'application/json', ...options.headers};
  if (options.method && options.method !== 'GET') headers['X-CSRF-Token'] = session?.csrf || '';
  const response = await fetch(`${API}/v1/${path}`, {...options, headers, credentials:'include'});
  let data; try { data = await response.json(); } catch { throw new Error('We couldn’t read the response. Please try again.'); }
  if (!response.ok) { if(response.status === 401) login(); throw new Error(data.error || 'Please try again.'); }
  return data;
}
function notify(message) { const el=document.querySelector('#notice'); el.textContent=message; el.style.display='block'; clearTimeout(notify.timer); notify.timer=setTimeout(()=>el.style.display='none',6000); }
function bind(selector, event, fn) { const el=document.querySelector(selector); if(el) el.addEventListener(event, async e=>{e.preventDefault(); const button=e.submitter || (e.currentTarget.tagName==='BUTTON' ? e.currentTarget : null); if(button)button.disabled=true; try { await fn(e); } catch(error){notify(error.message);} finally {if(button)button.disabled=false;} }); }
const post=(path,data={},headers={})=>api(path,{method:'POST',body:JSON.stringify(data),headers});
function login() {main.innerHTML=`<div class="login"><div class="eyebrow">Your agents. Your direction.</div><h1>A home for your daemons.</h1><p>A daemon is an agent with reusable instructions. Create one, connect an assistant you already use, and give it tasks. The assistant does the work; you follow progress and results here.</p>${location.search.includes('error=')?'<p class="error">Login couldn’t be completed. Please try again.</p>':''}<a class="button" href="${API}/auth/login?return_to=${encodeURIComponent(location.pathname==='/login'?'/':location.pathname+location.search)}">Log in with Intergraph →</a><p><small>One account across the Intergraph ecosystem.</small></p></div>`;}
const permissionLabels = {
  'memory:write': 'Save and archive shared daemon memory',
  'daemons:read': 'Read instructions, shared memory, tasks, and results',
  'daemons:manage': 'Change instructions, publish versions, pause task starts, and manage tasks',
  'daemons:create': 'Create new daemons',
  'work:submit': 'Add tasks, request stops, and try tasks again',
  'work:execute': 'Pick up tasks and send progress and results',
};
const statusLabels = {
  draft: 'Draft instructions', published: 'Instructions published', paused: 'Task starts paused',
  queued: 'Waiting for an assistant', working: 'In progress', succeeded: 'Completed',
  failed: 'Failed', cancelled: 'Cancelled', attention_required: 'Needs your review',
  authorized: 'Access approved', revoked: 'Access revoked', expired: 'Access expired',
};
const activityLabels = {
  'daemon.created': 'Daemon created', 'daemon.edited': 'Draft instructions saved',
  'daemon.published': 'Instructions published', 'daemon.paused': 'New task starts paused',
  'daemon.resumed': 'New task starts resumed', 'assistant.attached': 'Assistant ready to pick up tasks',
  'work.submitted': 'Task added', 'work.claimed': 'Assistant picked up the task',
  'work.progress': 'Progress update', 'work.succeeded': 'Task completed',
  'work.failed': 'Assistant reported a problem', 'work.cancelled': 'Task cancelled',
  'work.cancel_requested': 'Cancellation requested', 'work.retry_requested': 'Task added for another attempt',
};
const readableKey = value => String(value).replaceAll('_', ' ').replaceAll('.', ' ');
const dateLabel = value => value ? new Date(value).toLocaleString() : 'Not used yet';
function resultView(value) {
  if (value === null || value === undefined) return '<span class="muted">No result supplied.</span>';
  if (Array.isArray(value)) return `<ul>${value.map(item => `<li>${resultView(item)}</li>`).join('')}</ul>`;
  if (typeof value === 'object') return `<dl class="result-fields">${Object.entries(value).map(([key, item]) => `<dt>${esc(readableKey(key))}</dt><dd>${resultView(item)}</dd>`).join('')}</dl>`;
  return `<span class="result-text">${esc(value)}</span>`;
}
function instructionsView(spec) {
  return `<div class="instructions"><h3>${esc(spec.name)}</h3><p>${esc(spec.purpose)}</p><h3>Instructions for the assistant</h3><p class="result-text">${esc(spec.instructions)}</p>${spec.required_capabilities.length ? `<p><strong>Required abilities:</strong> ${spec.required_capabilities.map(esc).join(', ')}</p>` : ''}</div>`;
}
function gettingStarted() {
  return `<section class="panel guidance" aria-labelledby="how-it-works"><h2 id="how-it-works">How Daemons.ai works</h2><p>A daemon is a reusable set of instructions for an agent. Your assistant does the work; this console keeps the instructions, tasks, and results together.</p><ol class="steps"><li><strong>Describe your daemon</strong><span>Give it a purpose and instructions it can reuse.</span></li><li><strong>Publish its instructions</strong><span>Choose the saved version that new tasks will use.</span></li><li><strong>Connect an assistant</strong><span>Give an assistant you already use permission to work on its behalf.</span></li><li><strong>Add a task</strong><span>The assistant picks it up and sends progress and results back here.</span></li></ol><p class="helper">For example: “Research assistant” is a daemon. “Prepare a brief on Acme by Friday” is one task for it.</p></section>`;
}
async function home() {
  const daemons = await api('daemons');
  main.innerHTML = `<div class="toolbar"><div><div class="eyebrow">Your control room</div><h1>Daemons</h1><p>Give your agents reusable instructions, then follow the tasks your assistants carry out.</p></div><a class="button" href="/new">Create a daemon +</a></div>${gettingStarted()}${daemons.length ? `<div class="grid">${daemons.map(d => `<article class="card"><div class="toolbar">${status(d.paused ? 'paused' : d.published_revision ? 'published' : 'draft')}</div><h2><a href="/daemons/${esc(d.id)}">${esc(d.draft.name)}</a></h2><p>${esc(d.draft.purpose)}</p><p class="helper">${!d.published_revision ? 'Next: publish the instructions before adding a task.' : d.revision !== d.published_revision ? `You have unpublished edits. New tasks still use version ${d.published_revision}.` : `New tasks use instruction version ${d.published_revision}.`}</p><a href="/daemons/${esc(d.id)}">Open daemon →</a></article>`).join('')}</div>` : '<div class="empty"><h2>Your first daemon starts with a purpose.</h2><p>Start with an agent you would find useful, such as a research assistant or a weekly planning helper.</p><a href="/new" class="button">Create a daemon</a></div>'}`;
}
async function editor(id) {
  const d = id ? await api(`daemons/${id}`) : null;
  const spec = d?.draft || {name: '', purpose: '', instructions: '', required_capabilities: []};
  main.innerHTML = `<a href="${id ? '/daemons/' + id : '/'}">← Back</a><h1>${id ? 'Edit instructions' : 'Create a daemon'}</h1><p class="lead">Describe the job your daemon is meant to do repeatedly. You’ll give it individual tasks after publishing these instructions.</p><form id="definition" class="panel"><label for="daemon-name">Name</label><input id="daemon-name" name="name" required maxlength="160" value="${esc(spec.name)}" aria-describedby="name-help" placeholder="Research assistant"><p class="field-help" id="name-help">A name you and your assistant will recognize.</p><label for="daemon-purpose">Purpose</label><textarea id="daemon-purpose" name="purpose" required maxlength="4000" aria-describedby="purpose-help" placeholder="Prepare clear, well-sourced briefs on companies I’m interested in.">${esc(spec.purpose)}</textarea><p class="field-help" id="purpose-help">The ongoing job: what this daemon helps you accomplish.</p><label for="daemon-instructions">Instructions</label><textarea id="daemon-instructions" name="instructions" required maxlength="32000" aria-describedby="instructions-help" placeholder="Use reliable sources. Include links. Separate facts from assumptions. Ask me before publishing or contacting anyone.">${esc(spec.instructions)}</textarea><p class="field-help" id="instructions-help">How it should work: steps, standards, boundaries, and what a good result looks like. Put one-off requests in tasks later.</p><details ${spec.required_capabilities.length ? 'open' : ''}><summary>Advanced: required assistant abilities</summary><p>Usually, leave this blank. If you use capability names agreed with your assistant or connector, list them here. An assistant must report every listed ability before it can take a task. These labels do not grant access to files or services.</p><label for="daemon-capabilities">Required capabilities</label><input id="daemon-capabilities" name="capabilities" value="${esc(spec.required_capabilities.join(', '))}" placeholder="research, files.read" aria-describedby="capabilities-help"><p class="field-help" id="capabilities-help">Optional, comma separated. Names must match the ones your assistant reports.</p></details><div class="save-help"><p>${id ? `Saving creates a new draft. ${d.published_revision ? `Tasks continue to use published version ${d.published_revision} until you publish the changes.` : 'Publish it afterward to make it available for tasks.'}` : 'Saving creates a draft. Next, publish the instructions and connect an assistant to carry out tasks.'}</p><button>Save draft</button></div></form>`;
  bind('#definition', 'submit', async e => {
    const f = new FormData(e.currentTarget);
    const definition = {schema_version: 'daemons/v1', name: f.get('name'), purpose: f.get('purpose'), instructions: f.get('instructions'), required_capabilities: f.get('capabilities').split(',').map(x => x.trim()).filter(Boolean)};
    const result = id ? await api(`daemons/${id}`, {method: 'PUT', body: JSON.stringify({revision: d.revision, definition})}) : await post('daemons', {definition});
    location.href = `/daemons/${result.id}`;
  });
}
function nextStep(d, work, connections) {
  const approved = connections.some(c => !c.revoked && new Date(c.expires_at) > new Date() && c.daemon_ids.includes(d.id) && c.scopes.includes('work:execute'));
  let title, description, action = '';
  if (!d.published_revision) {
    title = 'Next: publish your instructions';
    description = 'Your daemon is saved as a draft. Publishing makes this version available for new tasks. It does not launch an assistant or start a task.';
    action = '<a href="#publish">Go to Publish instructions ↓</a>';
  } else if (d.paused) {
    title = 'New task starts are paused';
    description = 'You can still add tasks, but assistants cannot pick them up until you resume. Tasks already in progress can continue.';
  } else if (!approved) {
    title = 'Next: connect an assistant to do the work';
    description = 'The instructions are published. Give an assistant you already use access to this daemon. Tasks can wait here until that assistant connects and picks them up.';
    action = '<a href="/connect">How to connect an assistant →</a>';
  } else if (!work.length) {
    title = 'Next: give your daemon its first task';
    description = 'Assistant access is approved. Add a specific assignment below, then ask your assistant to pick it up. Approval alone does not mean the assistant is currently running.';
    action = '<a href="#submit-work">Write a task ↓</a>';
  } else if (work.some(w => w.status === 'attention_required' || w.status === 'failed')) {
    title = 'A task needs your review';
    description = 'Check its latest progress and what the assistant has already done before trying again. A new attempt can repeat actions already taken outside Daemons.ai.';
    action = '<a href="#tasks">Review tasks ↓</a>';
  } else if (work.some(w => w.status === 'queued')) {
    title = 'Waiting for an assistant to pick up a task';
    description = 'Access is approved, but a waiting task has not started yet. Ask your connected assistant to check Daemons.ai for tasks. Use Refresh tasks to see updates.';
  } else {
    return '';
  }
  return `<section class="panel guidance" aria-label="What to do next"><h2>${title}</h2><p>${description}</p>${action}</section>`;
}
// A common assistant response wraps the actual brief in {result, message}.
// Unwrap that payload once; keep arbitrary structured results intact.
function taskResultView(value) {
  if (value && !Array.isArray(value) && typeof value === 'object' && 'result' in value && Object.keys(value).every(k => ['result', 'message'].includes(k))) {
    return `${resultView(value.result)}${value.message && !['completed', 'complete', 'done', 'succeeded'].includes(String(value.message).trim().toLowerCase()) ? `<p class="helper">${esc(value.message)}</p>` : ''}`;
  }
  return resultView(value);
}
function activityView(activity) {
  return activity.length ? activity.map(a => `<div class="list-row"><strong>${esc(activityLabels[a.type] || readableKey(a.type))}</strong><div class="meta">${esc(dateLabel(a.created_at))}</div>${a.type === 'work.progress' && a.data?.report ? `<div class="activity-report">${resultView(a.data.report)}</div>` : ''}</div>`).join('') : '<p>No activity yet.</p>';
}
function taskView(w) {
  const explanations = {
    queued: 'This task has not started. A connected assistant needs to pick it up.',
    working: 'An assistant picked up this task. Its latest reported progress appears in Activity.',
    succeeded: '',
    failed: 'The assistant reported that it could not complete this attempt. Review its result and progress before trying again.',
    cancelled: 'This task was cancelled. If an assistant had started it, actions it already completed may still have taken effect.',
    attention_required: 'This attempt can no longer report results. Its assistant may have lost contact for 30 minutes, or its access may have ended. Check what happened before trying again.',
  };
  const canRetry = ['failed', 'cancelled', 'attention_required'].includes(w.status);
  return `<article class="list-row"><div class="toolbar">${status(w.status)}<span class="meta">Instructions v${w.revision} · ${w.attempt ? `Attempt ${w.attempt}` : 'Not started'}</span></div><p class="task-title">${esc(w.input.task || JSON.stringify(w.input))}</p>${explanations[w.status] ? `<p class="helper">${esc(explanations[w.status])}</p>` : ''}${w.cancel_requested && w.status === 'working' ? '<p class="callout">Stop requested. The assistant must acknowledge it; it may continue working until then.</p>' : ''}${w.result !== null && w.result !== undefined ? `<div class="task-result"><h3>${w.status === 'succeeded' ? 'Result' : 'Assistant’s report'}</h3>${taskResultView(w.result)}</div>` : ''}<p class="helper">Last update: ${esc(dateLabel(w.updated_at))}</p>${canRetry ? '<p class="helper">Before trying again, review any actions already completed. Another attempt may repeat them.</p>' : ''}<div class="actions">${['queued', 'working'].includes(w.status) ? `<button class="secondary" data-work="${esc(w.id)}" data-action="cancel">${w.status === 'queued' ? 'Cancel task' : 'Request stop'}</button>` : ''}${canRetry ? `<button data-work="${esc(w.id)}" data-action="retry">Try task again</button>` : ''}</div>${w.attempt_id ? `<details data-starting="${esc(w.id)}" data-attempt="${esc(w.attempt_id)}"><summary>Starting context</summary><div>Open to read the briefing used for this attempt.</div></details>` : ''}<details><summary>Technical task details</summary><div class="meta">Task ID: ${esc(w.id)}</div><pre>${pretty({input: w.input, attempt_id: w.attempt_id, result: w.result})}</pre></details></article>`;
}
async function daemon(id) {
  const [d, work, activity, versions, connections] = await Promise.all([api(`daemons/${id}`), api(`daemons/${id}/work`), api(`daemons/${id}/activity`), api(`daemons/${id}/versions`), api('connections')]);
  const current = d.revision === d.published_revision;
  main.innerHTML = `<a href="/">← All daemons</a>
    <div class="toolbar daemon-heading"><div><h1>${esc(d.draft.name)}</h1>${status(d.paused ? 'paused' : d.published_revision ? 'published' : 'draft')} <span class="meta">${d.published_revision ? `Tasks use version ${d.published_revision}` : `Draft version ${d.revision}`}</span></div><div class="actions"><a class="button secondary" href="/daemons/${id}/edit">Edit instructions</a><button id="pause" class="secondary" title="Pausing prevents new task starts. Tasks in progress can continue.">${d.paused ? 'Resume task starts' : 'Pause task starts'}</button>${!current ? '<button id="publish">Publish instructions</button>' : ''}</div></div>
    <p class="lead">${esc(d.draft.purpose)}</p>
    ${nextStep(d, work, connections)}
    ${d.published_revision && !current ? `<p class="callout">You have unpublished edits in draft version ${d.revision}. Publish instructions to use them for new tasks. Tasks already added keep the version they started with.</p>` : ''}
    <section class="panel"><h2>Give this daemon a task</h2><form id="submit-work"><label for="task-input">Task</label><textarea id="task-input" name="task" required aria-describedby="task-help" placeholder="What should the assistant accomplish this time?"></textarea><p id="task-help" class="field-help">${!d.published_revision ? 'Publish the instructions above to enable tasks.' : d.paused ? 'This task will wait until you resume task starts and an assistant picks it up.' : 'Your connected assistant must check for tasks to start this assignment.'}</p><details id="related-tasks"><summary>Use earlier tasks as context</summary><div id="related-options">Open to choose earlier tasks.</div></details><button ${!d.published_revision ? 'disabled' : ''}>Add task</button></form></section>
    <section class="panel" id="tasks"><div class="toolbar"><h2>Tasks and results</h2><button id="refresh" class="secondary">Refresh tasks</button></div><p class="helper">Refresh to see the latest updates reported by your assistant.</p>${work.length ? work.map(taskView).join('') : '<p>No tasks yet. Add a specific request above after publishing the instructions.</p>'}</section>
    <section class="panel daemon-reference"><details id="memory-panel"><summary>Memory</summary><div id="memory-content"></div></details><details><summary>Instructions and versions</summary><p class="helper">Published instructions are saved snapshots for tasks. Editing creates a draft; publishing chooses the version for new tasks.</p>${!current ? `<details ${!d.published_revision ? 'open' : ''}><summary>Draft version ${d.revision}</summary>${instructionsView(d.draft)}</details>` : ''}${versions.map(v => `<details><summary>Published version ${v.revision}${v.revision === d.published_revision ? ' · used by new tasks' : ''}</summary>${instructionsView(v.definition)}</details>`).join('')}<details><summary>Advanced: portable definition</summary><pre>${pretty(d.draft)}</pre></details></details>
    <details><summary>Activity</summary><p class="helper">Task events and progress messages. Finished reports are shown once, under Tasks and results.</p>${activityView(activity)}</details>
    <details><summary>How tasks and assistants work</summary><p>A daemon stores reusable instructions. An assistant you connect picks up individual tasks and sends progress and results here. Access approval does not mean the assistant is currently running.</p><p>Publishing chooses instructions for new tasks. Pausing prevents new task starts; it does not stop tasks already in progress.</p><p><a href="/connect">Connect an assistant</a> · <a href="/connections">Review assistant access</a></p></details></section>`;
  mountMemory({id, api, post, notify, esc, pretty, work});
  bind('#publish', 'click', async () => { await post(`daemons/${id}/publish`, {revision: d.revision}); await daemon(id); notify('Instructions published. New tasks will use this version.'); });
  bind('#pause', 'click', async () => { await post(`daemons/${id}/pause`, {paused: !d.paused}); await daemon(id); });
  bind('#refresh', 'click', () => daemon(id));
  const submitKey = newKey();
  bind('#submit-work', 'submit', async e => { await post(`daemons/${id}/work`, {input: {task: new FormData(e.currentTarget).get('task'), context_work_ids: new FormData(e.currentTarget).getAll('context_work_id')}}, {'Idempotency-Key': submitKey}); await daemon(id); notify('Task added. It will wait for an assistant to pick it up.'); });
  document.querySelectorAll('[data-work]').forEach(el => el.addEventListener('click', async () => { el.disabled = true; try { await post(`work/${el.dataset.work}/${el.dataset.action}`); await daemon(id); } catch (e) { notify(e.message); el.disabled = false; } }));
}
async function connections() {
  const [rows, daemons] = await Promise.all([api('connections'), api('daemons')]);
  const names = new Map(daemons.map(d => [d.id, d.draft.name]));
  main.innerHTML = `<div class="eyebrow">You choose who can act</div><h1>Assistant access</h1><p class="lead">These are permissions you’ve approved for assistants. An approval lets an assistant act on selected daemons; it does not mean the assistant is online or currently doing work.</p><p>Remove access here to prevent further actions in Daemons.ai. Any unfinished tasks assigned to that connection will need your review. Removing access does not shut down software running elsewhere.</p>${rows.length ? rows.map(r => `<section class="panel"><div class="toolbar"><h2>${esc(r.assistant.name || r.client_name)}</h2>${status(r.revoked ? 'revoked' : new Date(r.expires_at) < new Date() ? 'expired' : 'authorized')}</div><h3>Allowed to</h3><ul class="permission-list">${r.scopes.map(s => `<li>${esc(permissionLabels[s] || readableKey(s))}</li>`).join('')}</ul><h3>For these daemons</h3>${r.daemon_ids.length ? `<ul>${r.daemon_ids.map(id => `<li><a href="/daemons/${esc(id)}">${esc(names.get(id) || 'Daemon')}</a></li>`).join('')}</ul>` : '<p>No existing daemons selected. Create permission applies to daemons this assistant creates.</p>'}<p class="helper">Access expires: ${esc(dateLabel(r.expires_at))}<br>Last used: ${esc(dateLabel(r.last_seen_at))}. This records API use, not current availability.</p>${!r.revoked ? `<button class="danger" data-revoke="${esc(r.id)}">Remove access</button>` : '<p class="helper">This connection can no longer use Daemons.ai.</p>'}</section>`).join('') : '<div class="empty"><h2>No assistant access approved yet.</h2><p>Start in your assistant’s connection settings, then choose which daemons it may use.</p><a href="/connect">How to connect an assistant →</a></div>'}`;
  document.querySelectorAll('[data-revoke]').forEach(el => el.addEventListener('click', async () => { try { await api(`connections/${el.dataset.revoke}`, {method: 'DELETE'}); await connections(); } catch (e) { notify(e.message); } }));
}
function connect() {
  main.innerHTML = `<div class="eyebrow">Let your assistant do the work</div><h1>Connect an assistant</h1><p class="lead">Use an assistant you already have to work on your daemons. You set up the connection in that assistant, then approve its access here.</p><section class="panel guidance"><h2>What you need</h2><p>An assistant or external client that supports a remote <strong>MCP connection with account login (OAuth)</strong>. MCP is a standard way for assistants to use tools in other apps. Look for “Connectors,” “Integrations,” or “Tools” in your assistant’s settings.</p><p class="helper">If your assistant does not support this type of connection, it will need a compatible connector or client. Daemons.ai does not install or launch an assistant for you.</p></section><section class="panel"><h2>Authentication and developer docs</h2><p>Daemons.ai uses OAuth: your assistant discovers the sign-in flow, you log in with Intergraph, and you approve access. You do not need to copy an API key or your Intergraph session token into the assistant.</p><p><a href="${esc(API)}/docs/mcp">Read the official MCP developer guide →</a></p><p class="helper">For assistants and developers: the guide explains discovery, client registration, permissions, and how to report task results.</p></section><section class="panel"><h2>Set up the connection</h2><ol class="setup-steps"><li><strong>Add a remote MCP server in your assistant.</strong><p>Paste the server address below. The setting’s exact name depends on your assistant.</p><pre>${esc(API)}/mcp</pre><button id="copy" class="secondary">Copy server address</button></li><li><strong>Log in with Intergraph when prompted.</strong><p>Use the same account you use for this console so your daemons are available.</p></li><li><strong>Choose daemons and permissions.</strong><p>To carry out tasks, allow “Read instructions, shared memory, tasks, and results” and “Pick up tasks and send progress and results.” To let the assistant save lasting findings, also request and approve “Save and archive shared daemon memory.” Approve editing or task creation only if you want those actions too. Existing connections need renewed consent for memory writes.</p></li><li><strong>Ask your assistant to check for tasks.</strong><p>Access approval alone does not start work. The assistant must read the instructions and actively pick up a waiting task.</p></li></ol></section><section class="panel"><h2>Try this message in your assistant</h2><pre>Use my Daemons.ai connection. Find the daemon I want to work with and read its published instructions. Tell me which daemon you selected. Report your name and abilities, pick up a waiting task, read its starting context, and retrieve relevant earlier work as needed. You may request optional parallel memory evidence to help answer. Carry out the task and send progress and the result back to Daemons.ai. If I approved memory writes, save durable findings with their sources. Check for stop requests while working.</pre><p>Then return to the daemon’s page and choose <strong>Refresh tasks</strong> to see what the assistant reported.</p></section><section class="panel"><h2>If a task stays on the waiting list</h2><p>Check that the instructions are published, task starts are not paused, and the assistant has permission for this daemon. Ask the assistant to check for tasks again. An approved connection is not proof that an assistant is currently running.</p><p>If an assistant stops reporting for 30 minutes, the task will need your review. Check which actions already happened before trying again.</p><a href="/connections">Review assistant access →</a></section>`;
  bind('#copy', 'click', async () => { await navigator.clipboard.writeText(`${API}/mcp`); notify('Server address copied. Paste it into your assistant’s connection settings.'); });
}
async function authorize() {
  const id = new URLSearchParams(location.search).get('request');
  if (!id) throw new Error('Start the connection from your assistant.');
  const [request, daemons] = await Promise.all([api(`authorization/${encodeURIComponent(id)}`), api('daemons')]);
  main.innerHTML = `<div class="eyebrow">Approve a connection</div><h1>Allow ${esc(request.client_name)}?</h1><p class="lead">This assistant is asking to use Daemons.ai on your behalf. Choose the daemons it may access and what it may do. Nothing is shared until you approve.</p><section class="panel"><p class="helper">After your decision, you’ll return to: ${esc(request.redirect_uri)}</p><form id="consent"><h2>Which daemons can it use?</h2>${daemons.length ? daemons.map(d => `<label class="check"><input type="checkbox" name="daemon" value="${esc(d.id)}">${esc(d.draft.name)}</label>`).join('') : '<p>You have no daemons yet. You can allow this assistant to create one if it requested that permission.</p>'}<h2>What can it do?</h2>${request.scopes.map(s => `<label class="check"><input type="checkbox" name="scope" value="${esc(s)}" checked>${esc(permissionLabels[s] || readableKey(s))}</label>`).join('')}<p class="helper">Reading and carrying out tasks are separate from editing your instructions. Uncheck any permission you don’t want to grant. If you approve creating daemons, this connection can also access the daemons it creates.</p><p>Access expires in 30 days. You can remove it sooner in <a href="/connections">Assistant access</a>. Approval does not start an assistant or a task.</p><div class="actions"><button>Allow selected access</button><button type="button" id="deny" class="secondary">Deny</button></div></form></section>`;
  bind('#consent', 'submit', async e => { const form = new FormData(e.currentTarget); const result = await post(`authorization/${id}`, {daemon_ids: form.getAll('daemon'), scopes: form.getAll('scope')}); location.assign(result.redirect_to); });
  bind('#deny', 'click', async () => { const result = await post(`authorization/${id}`, {deny: true}); location.assign(result.redirect_to); });
}
async function start(){try{session=await api('session');document.querySelector('#account').innerHTML=`<span>${esc(session.account.email || 'Your account')}</span><button class="secondary" id="logout">Log out</button>`;bind('#logout','click',async()=>{const result=await post('logout');session=null;location.assign(result.logout_url);});const path=location.pathname;const match=path.match(/^\/daemons\/([0-9a-f-]+)(\/edit)?$/);if(path==='/authorize')await authorize();else if(path==='/new')await editor();else if(path==='/connections')await connections();else if(path==='/connect')connect();else if(match){if(match[2])await editor(match[1]);else await daemon(match[1]);}else await home();}catch(e){if(!session){login();if(!e.message.includes('log in'))notify(e.message);}else main.innerHTML=`<h1>We couldn’t load this page.</h1><p>${esc(e.message)}</p><button id="reload">Try again</button>`,bind('#reload','click',()=>location.reload());}}
start();
