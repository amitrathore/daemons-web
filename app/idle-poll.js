// Timers are local only. Inactive pages and collapsed panels generate no requests.
export function idlePoll(root,refresh,{interval=15000,idleMs=120000}={}) {
  let lastActivity=Date.now(),disposed=false;
  const visible=()=>!document.hidden&&root.isConnected&&root.getClientRects().length>0&&!root.closest('details:not([open])');
  const active=()=>visible()&&Date.now()-lastActivity<idleMs;
  const resume=()=>{const wasIdle=!active();lastActivity=Date.now();if(wasIdle&&visible())refresh();};
  const visibility=()=>{if(!document.hidden){lastActivity=Date.now();if(visible())refresh();}};
  for(const name of ['pointerdown','keydown','focusin'])document.addEventListener(name,resume,{passive:true});
  document.addEventListener('visibilitychange',visibility);
  const timer=setInterval(()=>{if(!root.isConnected){dispose();return;}if(active())refresh();},interval);
  function dispose(){if(disposed)return;disposed=true;clearInterval(timer);for(const name of ['pointerdown','keydown','focusin'])document.removeEventListener(name,resume);document.removeEventListener('visibilitychange',visibility);}
  return dispose;
}
