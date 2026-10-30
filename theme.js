// Runs before styles load, without inline code or a dependency on application startup.
(()=>{
  const values=['light','dark','system'],key='daemons_appearance';
  const shared=location.hostname==='daemons.ai'||location.hostname.endsWith('.daemons.ai');
  const media=window.matchMedia('(prefers-color-scheme: dark)');
  let choice='light',transient=false;
  function read(){
    try{
      const value=shared?document.cookie.split('; ').find(x=>x.startsWith(key+'='))?.slice(key.length+1):localStorage.getItem(key);
      return values.includes(value)?value:'light';
    }catch{return 'light';}
  }
  function apply(value){
    choice=value;
    document.documentElement.dataset.theme=choice==='system'?(media.matches?'dark':'light'):choice;
    document.documentElement.dataset.appearance=choice;
    const select=document.querySelector('#appearance');if(select)select.value=choice;
  }
  apply(read());
  media.addEventListener('change',()=>{if(choice==='system')apply(choice);});
  function refresh(){if(!transient)apply(read());}
  window.addEventListener('storage',e=>{if(!shared&&e.key===key)refresh();});
  window.addEventListener('pageshow',refresh);
  window.addEventListener('focus',refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  function mount(){
    const select=document.querySelector('#appearance');if(!select)return;
    select.value=choice;select.closest('.appearance-picker').hidden=false;
    select.addEventListener('change',()=>{
      if(!values.includes(select.value))return;
      const value=select.value;
      try{
        if(shared)document.cookie=`${key}=${value}; Domain=daemons.ai; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
        else localStorage.setItem(key,value);
        transient=read()!==value;
      }catch{transient=true;}
      apply(value);
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
