import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

async function marketing(page){
  await page.route('http://127.0.0.1:8096/',route=>readFile('index.html','utf8').then(body=>route.fulfill({contentType:'text/html',body})));
  await page.route('http://127.0.0.1:8096/site.css',route=>readFile('site.css','utf8').then(body=>route.fulfill({contentType:'text/css',body})));
}
function luminance(hex){if(hex.length===4)hex='#'+hex.slice(1).split('').map(c=>c+c).join('');const a=hex.match(/[\da-f]{2}/gi).map(n=>parseInt(n,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*a[0]+.7152*a[1]+.0722*a[2];}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}

test('light-first startup, persisted choice, system changes, keyboard access and both responsive themes',async({page})=>{
  await marketing(page);await page.emulateMedia({colorScheme:'dark'});
  await page.addInitScript(()=>{requestAnimationFrame(()=>{window.firstTheme=document.documentElement.dataset.theme;});});
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await expect(page.getByRole('combobox',{name:'Appearance'})).toHaveValue('light');
  expect(await page.evaluate(()=>window.firstTheme)).toBe('light');
  await page.evaluate(()=>document.fonts.ready);expect(await page.evaluate(()=>document.fonts.check('16px Manrope'))).toBe(true);
  const appearance=page.getByRole('combobox',{name:'Appearance'});
  await appearance.focus();await page.keyboard.press('d');await page.keyboard.press('Tab');
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.reload();await expect(appearance).toHaveValue('dark');
  await appearance.selectOption('system');await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.emulateMedia({colorScheme:'light'});await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  for(const theme of ['light','dark']){
    await appearance.selectOption(theme);
    const tokens=await page.evaluate(()=>{const s=getComputedStyle(document.documentElement);return Object.fromEntries(['bg','surface','muted','text','purple','on-accent','surface-alt','accent-soft','danger','warning','success','control-line'].map(k=>[k,s.getPropertyValue('--'+k).trim()]));});
    for(const [fg,bg] of [['text','bg'],['muted','bg'],['text','surface'],['muted','surface'],['text','surface-alt'],['muted','surface-alt'],['purple','accent-soft'],['on-accent','purple'],['danger','surface'],['warning','surface'],['success','surface']])expect(contrast(tokens[fg],tokens[bg]),`${theme}: ${fg}/${bg}`).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tokens['control-line'],tokens.surface)).toBeGreaterThanOrEqual(3);
    for(const width of [1365,768,390,320]){
      await page.setViewportSize({width,height:900});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await expect(appearance).toBeVisible();
    }
    await page.setViewportSize({width:1365,height:1000});await page.screenshot({path:`test-results/brand-${theme}-desktop.png`,fullPage:true});
    await page.evaluate(()=>document.body.style.zoom='2');expect(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(n=>n.getBoundingClientRect().right>innerWidth+1).map(n=>n.tagName+'.'+n.className))).toEqual([]);await page.evaluate(()=>document.body.style.zoom='');
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:`test-results/brand-${theme}-mobile.png`,fullPage:true});
  }
  await page.emulateMedia({reducedMotion:'reduce'});expect(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
});

test('theme survives unavailable storage and no JavaScript defaults to a usable light page',async({browser})=>{
  const context=await browser.newContext();const page=await context.newPage();
  await marketing(page);
  await page.addInitScript(()=>{Object.defineProperty(Storage.prototype,'getItem',{value(){throw Error('blocked');}});Object.defineProperty(Storage.prototype,'setItem',{value(){throw Error('blocked');}});});
  await page.goto('/');await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.getByRole('combobox',{name:'Appearance'}).selectOption('dark');await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await context.close();
  const nojs=await browser.newContext({javaScriptEnabled:false,colorScheme:'dark'});const p=await nojs.newPage();await marketing(p);await p.goto('/');
  await expect(p.getByRole('heading',{level:1})).toBeVisible();await expect(p.getByRole('combobox',{name:'Appearance'})).toBeHidden();
  expect(await p.locator('body').evaluate(n=>getComputedStyle(n).backgroundColor)).toBe('rgb(255, 249, 243)');await nojs.close();
});

test('theme preference is shared between the corporate site and console subdomain',async({context,page})=>{
  const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ico':'image/x-icon'};
  await context.route(/^https:\/\/(app\.)?daemons\.ai\//,async route=>{
    const u=new URL(route.request().url()),app=u.hostname==='app.daemons.ai';
    let file=u.pathname==='/'?(app?'app/index.html':'index.html'):u.pathname.slice(1);
    if(app&&['app.js','config.js','style.css','memory.js','taskboard.js'].includes(file))file='app/'+file;
    try{const ext=file.slice(file.lastIndexOf('.'));await route.fulfill({contentType:mime[ext]||'application/octet-stream',body:await readFile(file)});}catch{await route.fulfill({status:404,body:'Not found'});}
  });
  await context.route('https://api.daemons.ai/v1/**',route=>route.fulfill({status:401,json:{error:'Please log in to Daemons.ai.'}}));
  await page.goto('https://daemons.ai/');await page.getByRole('combobox',{name:'Appearance'}).selectOption('dark');
  const cookie=(await context.cookies()).find(c=>c.name==='daemons_appearance');
  expect(cookie).toMatchObject({value:'dark',domain:'.daemons.ai',path:'/',secure:true,sameSite:'Lax'});
  await page.goto('https://app.daemons.ai/');await expect(page.getByRole('heading',{name:'A home for your Daemons.'})).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.getByRole('combobox',{name:'Appearance'}).selectOption('light');
  await page.goto('https://daemons.ai/');await expect(page.locator('html')).toHaveAttribute('data-theme','light');
});

test('console forms, board and consent retain readable controls in light and dark',async({page})=>{
  const definition={name:'Creative partner',purpose:'Build useful ideas',instructions:'Cite sources.',required_capabilities:[]};
  const id='11111111-1111-4111-8111-111111111111';
  await page.route('https://api.daemons.ai/v1/**',async route=>{
    const p=new URL(route.request().url()).pathname.slice(4);let result=[];
    if(p==='session')result={account:{email:'owner@example.test'},csrf:'test'};
    else if(p==='daemons')result=[{id,draft:definition,revision:1,published_revision:1}];
    else if(p===`daemons/${id}`)result={id,draft:definition,revision:1,published_revision:1};
    else if(p.endsWith('/board'))result={queue_revision:0,counts:{queued:0,working:0,attention:0,finished:0},columns:Object.fromEntries(['queued','working','attention','finished'].map(k=>[k,{items:[]}])),provider:{id:'native'}};
    else if(p.startsWith('authorization/'))result={client_name:'Example assistant',redirect_uri:'https://assistant.example/callback',scopes:['daemons:read','work:execute']};
    await route.fulfill({json:result});
  });
  for(const theme of ['light','dark']){
    await page.goto('/');await page.getByRole('combobox',{name:'Appearance'}).selectOption(theme);
    for(const path of [`/daemons/${id}`,`/daemons/${id}/edit`,'/authorize?request=example','/connect','/connections']){
      await page.goto(path);await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
      for(const width of [1365,390]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
      if(path===`/daemons/${id}/edit`){const input=page.getByLabel('Name',{exact:true});await input.fill('My draft');await page.getByRole('combobox',{name:'Appearance'}).selectOption(theme==='light'?'dark':'light');await expect(input).toHaveValue('My draft');await page.getByRole('combobox',{name:'Appearance'}).selectOption(theme);}
      if(path===`/daemons/${id}`){await page.setViewportSize({width:1365,height:1000});await page.screenshot({path:`test-results/console-${theme}-desktop.png`,fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:`test-results/console-${theme}-mobile.png`,fullPage:true});}
    }
  }
});
