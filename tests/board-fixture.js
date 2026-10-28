export function boardFixture(work) {
 const columns=Object.fromEntries(['queued','working','attention','finished'].map(k=>[k,{items:[]}])) , groups={queued:'queued',working:'working',failed:'attention',attention_required:'attention',succeeded:'finished',cancelled:'finished'};
 const queued=work.filter(w=>w.status==='queued');
 for(const w of work)columns[groups[w.status]].items.push({id:w.id,status:w.status,title:w.input?.task||'Task',revision:w.revision,attempt:w.attempt,attempt_id:w.attempt_id,updated_at:w.updated_at,queue_position:queued.findIndex(x=>x.id===w.id)+1,previous_id:queued[queued.findIndex(x=>x.id===w.id)-1]?.id,next_id:queued[queued.findIndex(x=>x.id===w.id)+1]?.id,after_next_id:queued[queued.findIndex(x=>x.id===w.id)+2]?.id});
 return {queue_revision:work.length,counts:Object.fromEntries(Object.entries(columns).map(([k,v])=>[k,v.items.length])),columns,first_queued_id:queued[0]?.id,provider:{id:'native',status:'ready'}};
}
