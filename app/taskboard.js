const relative=value=>{const m=Math.max(0,Math.floor((Date.now()-new Date(value))/60000));return m<1?'Just now':m<60?m+'m ago':m<1440?Math.floor(m/60)+'h ago':Math.floor(m/1440)+'d ago';};
// TaskBoard Protocol client. Poll only the board; preserve the surrounding editor state.
let cleanup=()=>{};
export const disposeBoard=()=>cleanup();
export function mountBoard({id,initial,api,post,notify,esc,renderTask,resultView,onUpdate}) {
  disposeBoard();
  const root=document.querySelector('#tasks'), grid=root.querySelector('.task-board');
  const labels={queued:'Queued',working:'In progress',attention:'Needs attention',finished:'Finished'};
  const empty={queued:'No tasks waiting.',working:'No tasks in progress.',attention:'Nothing needs attention.',finished:'No finished tasks.'};
  const status={queued:'Waiting for an assistant',working:'In progress',failed:'Failed',attention_required:'Needs your review',succeeded:'Completed',cancelled:'Cancelled'};
  const pageDepth=Object.fromEntries(Object.keys(labels).map(k=>[k,1]));
  let state=initial, busy=false, dead=false;
  const detailsCache=new Map(),activityCache=new Map(),movingDialogs=new WeakSet();
  const safe=fn=>async e=>{try{await fn(e);}catch(err){notify(err.message);}};
  grid.innerHTML=Object.entries(labels).map(([key,label])=>`<section class="board-column" data-column="${key}" aria-label="${label}"><h3>${label} <span class="column-count"></span></h3><div class="board-cards"></div><p class="column-empty"></p><button class="secondary board-more" data-more="${key}" hidden>More ${label.toLowerCase()} tasks</button></section>`).join('');
  function activeKey(){const el=document.activeElement;return el?.closest('[data-card-id]')?{id:el.closest('[data-card-id]').dataset.cardId,move:el.dataset.move,action:el.dataset.action,summary:el.tagName==='SUMMARY'}:null;}
  function reconcile(board){
    const focus=activeKey(),scroll=window.scrollY,existing=new Map([...grid.querySelectorAll('[data-card-id]')].map(c=>[c.dataset.cardId,c]));
    for(const [col,label] of Object.entries(labels)){
      const section=grid.querySelector(`[data-column="${col}"]`),holder=section.querySelector('.board-cards'),items=board.columns[col].items;
      section.querySelector('.column-count').textContent=String(board.counts[col]);
      section.querySelector('.column-empty').textContent=board.counts[col]===0?empty[col]:'';
      const more=section.querySelector('[data-more]');more.hidden=!board.columns[col].next_cursor;
      for(const w of items){
        let card=existing.get(w.id);
        if(!card){card=document.createElement('article');card.className='board-card';card.dataset.cardId=w.id;card.innerHTML=`<details data-card="${w.id}"><summary><span class="board-card-title"></span><span class="board-card-status"></span><span class="board-card-meta"></span><span class="board-card-progress"></span></summary><dialog class="task-drawer" aria-label="Task details"><div class="drawer-top"><h2>Task details</h2><button type="button" class="secondary" data-close-task aria-label="Close task details">✕</button></div><div class="board-detail"></div><div class="board-order actions" aria-label="Queue position"></div></dialog></details>`;}
        if(holder.children[items.indexOf(w)]!==card){
          const before=holder.children[items.indexOf(w)]||null;
          if(typeof holder.moveBefore==='function'&&card.isConnected)holder.moveBefore(card,before);
          else {
            // insertBefore disconnects the subtree. Preserve modal state explicitly
            // on browsers without atomic DOM moves (including older Safari).
            const dialog=card.querySelector('dialog'),modal=dialog?.open;
            if(modal){movingDialogs.add(dialog);dialog.close();}
            holder.insertBefore(card,before);
            if(modal)dialog.showModal();
          }
        }card.dataset.updated=w.updated_at;card.dataset.attempt=w.attempt_id||'';
        card.querySelector('.board-card-title').textContent=w.title||'Task';
        card.querySelector('.board-card-status').textContent=`${col==='queued'?`#${w.queue_position} · `:''}${status[w.status]||w.status}${w.cancel_requested&&w.status==='working'?' · Stop requested':''}`;
        card.querySelector('.board-card-meta').textContent=`${w.assistant?`${w.assistant} · `:''}${w.updated_at?relative(w.updated_at):''}`;
        card.querySelector('.board-card-progress').textContent=col==='working'?(w.progress||''):'';
        card.querySelector('.board-order').innerHTML=col==='queued'?['top','up','down','end'].map(move=>`<button class="secondary" data-move="${move}" ${((['top','up'].includes(move)&&!w.previous_id)||(['down','end'].includes(move)&&!w.next_id))?'disabled':''} aria-label="Move ${esc(w.title||'task')} ${move==='top'?'to top':move==='end'?'to end':move}">${{top:'Top',up:'↑ Up',down:'↓ Down',end:'End'}[move]}</button>`).join(''):'';
      }

    }
    // Cards that changed columns keep their detail state, regardless of processing order.
    for(const card of grid.querySelectorAll('[data-card-id]'))if(!Object.values(board.columns).some(c=>c.items.some(w=>w.id===card.dataset.cardId))){const dialog=card.querySelector('dialog');if(dialog?.open)dialog.close();card.remove();}
    if(focus){const card=grid.querySelector(`[data-card-id="${focus.id}"]`);const target=focus.move?card?.querySelector(`[data-move="${focus.move}"]`):focus.action?card?.querySelector(`[data-action="${focus.action}"]`):focus.summary?card?.querySelector('summary'):null;target?.focus({preventScroll:true});}
    document.querySelector('#board-updated').textContent=`Last refreshed ${new Date().toLocaleTimeString()} · Updates every 15 seconds while this page is visible.${board.paused?' New task starts are paused.':''}`;
    onUpdate?.(board);
    window.scrollTo({top:scroll,behavior:'instant'});
  }
  async function detail(card,force=false){
    const taskId=card.dataset.cardId,container=card.querySelector('.board-detail'),cached=detailsCache.get(taskId);
    if(!force&&cached?.updated===card.dataset.updated){if(!container.children.length)container.innerHTML=cached.html;return;}
    const [w,events]=await Promise.all([api(`work/${taskId}`),api(`work/${taskId}/activity`)]);
    if(dead||!card.isConnected)return;
    const open=[...container.querySelectorAll('details[open]')].map(d=>d.querySelector('summary')?.textContent);
    const eventHTML=events.items.map(e=>`<div class="list-row"><strong>${esc(e.type.replace('work.','').replaceAll('_',' '))}</strong><p class="helper">${esc(new Date(e.created_at).toLocaleString())}</p>${e.type==='work.progress'?resultView(e.data.report):''}</div>`).join('');
    const html=renderTask(w)+`<details class="task-progress"><summary>Progress history</summary><div class="progress-events">${eventHTML||'<p>No progress messages yet.</p>'}</div><button class="secondary" data-events="${taskId}" ${events.next_cursor?'':'hidden'}>More progress</button></details>${['succeeded','cancelled'].includes(w.status)?`<button class="secondary" data-archive="${taskId}">Archive finished task</button>`:''}`;
    // Rebuild only when the task changed; keep nested expansions on refresh.
    container.innerHTML=html;for(const d of container.querySelectorAll('details'))if(open.includes(d.querySelector('summary')?.textContent))d.open=true;
    detailsCache.set(taskId,{updated:card.dataset.updated,html});activityCache.set(taskId,events);
  }
  async function fetchBoard(){
    let board=await api(`daemons/${id}/board`);
    for(const col of Object.keys(labels)){
      for(let page=1;page<pageDepth[col]&&board.columns[col].next_cursor;page++){
        try{const r=await api(`daemons/${id}/board?column=${col}&cursor=${encodeURIComponent(board.columns[col].next_cursor)}`);if(col==='queued'&&r.queue_revision!==board.queue_revision)throw Error('The queue changed. Refresh it before continuing.');board.columns[col].items.push(...r.columns[col].items);board.columns[col].next_cursor=r.columns[col].next_cursor;}
        catch(e){if(col==='queued'&&e.message.includes('queue changed')){pageDepth.queued=1;return api(`daemons/${id}/board`);}throw e;}
      }
      board.columns[col].items=[...new Map(board.columns[col].items.map(w=>[w.id,w])).values()];
    }
    return board;
  }
  async function refresh(){
    if(busy||dead)return;busy=true;root.querySelector('#refresh').disabled=true;
    try{const board=await fetchBoard();if(dead)return;state=board;reconcile(board);root.querySelector('#board-error').hidden=true;for(const card of grid.querySelectorAll('[data-card-id]'))if(card.querySelector('details').open)await detail(card);}
    catch(err){if(!dead){const el=root.querySelector('#board-error');el.textContent=`Couldn’t refresh: ${err.message} Your last view is still shown. Use Refresh tasks to try again.`;el.hidden=false;}}
    finally{busy=false;if(!dead)root.querySelector('#refresh').disabled=false;}
  }
  root.addEventListener('toggle',safe(async e=>{
    const d=e.target;if(d.matches('details[data-card]')&&d.open){const card=d.closest('[data-card-id]'),dialog=card.querySelector('dialog');if(!dialog.open)dialog.showModal();await detail(card);}
    if(d.matches('[data-starting]')&&d.open){const r=await post(`daemons/${id}/context`,{work_id:d.dataset.starting,attempt_id:d.dataset.attempt});d.querySelector('div').innerHTML=r.starting_context?r.starting_context.items.map(item=>`<div class="list-row"><strong>${esc(item.title||'Earlier task')}</strong><p class="result-text">${esc(item.content||item.excerpt||'')}</p></div>`).join('')||'<p>No saved context items.</p>':'<p>No starting context was recorded for this older attempt.</p>';}
  }),true);
  root.addEventListener('click',safe(async e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-close-task')){b.closest('dialog').close();return;}
    if(b.id==='refresh'){await refresh();return;}
    if(b.dataset.more){pageDepth[b.dataset.more]++;await refresh();return;}
    if(b.dataset.events){const cached=activityCache.get(b.dataset.events);const r=await api(`work/${b.dataset.events}/activity?cursor=${encodeURIComponent(cached.next_cursor)}`);b.previousElementSibling.insertAdjacentHTML('beforeend',r.items.map(x=>`<div class="list-row">${esc(x.type)} ${x.type==='work.progress'?resultView(x.data.report):''}</div>`).join(''));activityCache.set(b.dataset.events,r);b.hidden=!r.next_cursor;return;}
    if(!b.dataset.move&&!b.dataset.work&&!b.dataset.archive)return;
    b.disabled=true;
    try{
      if(b.dataset.move){const w=state.columns.queued.items.find(w=>w.id===b.closest('[data-card-id]').dataset.cardId);const before={top:state.first_queued_id,up:w.previous_id,down:w.after_next_id,end:undefined}[b.dataset.move];await post(`daemons/${id}/work-order`,{work_id:w.id,before_work_id:before||undefined,expected_queue_revision:state.queue_revision},{'Idempotency-Key':crypto.randomUUID()});}
      if(b.dataset.work){await post(`work/${b.dataset.work}/${b.dataset.action}`);if(b.dataset.action==='retry')notify('Task queued again. Your assistant must pick it up to start a new attempt.');}
      if(b.dataset.archive)await post(`daemons/${id}/work-archive`,{work_id:b.dataset.archive},{'Idempotency-Key':crypto.randomUUID()});
    }catch(err){notify(err.message);}
    finally{b.disabled=false;await refresh();}
  }));
  root.addEventListener('close',e=>{if(e.target.matches('.task-drawer')){if(movingDialogs.delete(e.target))return;const details=e.target.closest('details');details.open=false;details.querySelector('summary').focus();}},true);
  root.addEventListener('click',e=>{if(e.target.matches('.task-drawer')){const b=e.target.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)e.target.close();}});
  const visibility=()=>{if(!document.hidden)refresh();};document.addEventListener('visibilitychange',visibility);
  const timer=setInterval(()=>{if(!document.hidden)refresh();},15000);
  cleanup=()=>{dead=true;clearInterval(timer);document.removeEventListener('visibilitychange',visibility);};
  reconcile(initial);
  return {refresh};
}
