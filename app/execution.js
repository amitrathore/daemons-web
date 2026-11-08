export function checkInText(w){
 if(w.status!=='working')return '';
 const last=w.last_check_in_at?`Last check-in: ${new Date(w.last_check_in_at).toLocaleString()}. `:'Awaiting a check-in. ';
 if(w.check_in_minutes===null)return last+'No automatic expiry.';
 if(!w.lease_until)return last;
 return last+`${Date.parse(w.lease_until)<=Date.now()?'Check-in overdue':'Next check-in due'}: ${new Date(w.lease_until).toLocaleString()}.`;
}
export function mountExecution({root,id,d,api,notify}){
 root.innerHTML=`<h4>If an assistant stops checking in</h4><form><label for="check-in-minutes">How long to wait for progress</label><select id="check-in-minutes" name="interval"><option value="30">30 minutes</option><option value="120">2 hours (default)</option><option value="480">8 hours</option><option value="none">No automatic expiry</option></select><p class="helper">This is how long an assistant can go without reporting progress before the task needs your review. It is not a limit on how long the task can take.</p><p class="helper">Changes apply to new attempts. Tasks already in progress keep their current setting.</p><p class="callout" data-no-expiry hidden>A task will stay in progress until the assistant reports a result or you end its attempt. If you end it, the assistant may still be working outside Daemons.ai. Access can still expire or be revoked.</p><div class="actions"><button>Save</button><button type="button" class="secondary" data-refresh-execution>Refresh</button></div><p role="status" data-execution-state></p></form>`;
 const form=root.querySelector('form'),select=form.elements.interval,note=root.querySelector('[data-no-expiry]'),status=root.querySelector('[data-execution-state]');
 let revision=d.execution_revision??0;
 const paint=value=>{select.value=value===null?'none':String(value??120);note.hidden=select.value!=='none';};paint(d.check_in_minutes);
 select.addEventListener('change',()=>{note.hidden=select.value!=='none';status.textContent='Unsaved changes.';});
 const load=async()=>{const settings=await api(`daemons/${id}/execution-settings`);revision=settings.revision;paint(settings.check_in_minutes);};
 root.querySelector('[data-refresh-execution]').addEventListener('click',async()=>{try{await load();status.textContent='Settings refreshed.';}catch(e){status.textContent=e.message;}});
 form.addEventListener('submit',async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;status.textContent='Saving…';try{const result=await api(`daemons/${id}/execution-settings`,{method:'PUT',body:JSON.stringify({revision,check_in_minutes:select.value==='none'?null:Number(select.value)})});revision=result.revision;paint(result.check_in_minutes);status.textContent='Saved. This applies to new attempts.';}catch(e){status.textContent=e.message;notify(e.message);}finally{button.disabled=false;}});
}
