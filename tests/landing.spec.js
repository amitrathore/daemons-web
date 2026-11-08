import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test('homepage explains ongoing work and setup across compatible AI tools',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://127.0.0.1:8096/**',async route=>{
    const pathname=new URL(route.request().url()).pathname;
    const files={'/':'index.html','/footer.css':'footer.css','/site.css':'site.css'};
    if(files[pathname])return route.fulfill({contentType:pathname.endsWith('.css')?'text/css':'text/html',body:await readFile(files[pathname],'utf8')});
    return route.continue();
  });
  await page.goto('/');
  await expect(page.getByRole('heading',{level:1})).toHaveText('One place to organize ongoing work across your AI tools.');
  await expect(page.locator('.lead')).toContainText('compatible AI assistants, agents, chatbots, and copilots');
  await expect(page.locator('.daemon-definition')).toContainText('your connected assistants and agents do the work');
  for(const link of await page.getByRole('link',{name:'Get started',exact:true}).all())await expect(link).toHaveAttribute('href','https://app.daemons.ai');
  await expect(page.getByRole('link',{name:'Get started',exact:true})).toHaveCount(2);
  await page.getByRole('link',{name:'See an example',exact:true}).click();await expect(page).toHaveURL(/#examples$/);
  expect(await page.locator('main > section').evaluateAll(nodes=>nodes.slice(0,3).map(n=>n.className))).toEqual(['hero wrap','preview-section wrap','section wrap']);
  await expect(page.locator('.preview-parts article')).toHaveCount(3);
  await expect(page.locator('#examples .steps li')).toHaveCount(3);
  await expect(page.locator('#how-it-works .steps li')).toHaveCount(3);
  await expect(page.locator('#capabilities article')).toHaveCount(3);
  await expect(page.locator('.practical-notes')).toContainText('Approving a connection alone does not start work');
  await expect(page.locator('.practical-notes')).toContainText('Full conversations are not automatically copied');
  await expect(page.locator('body')).not.toContainText(/soul|thread of responsibility|any AI tool/i);
  await page.goto('/');await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'Skip to content'})).toBeFocused();
  await page.keyboard.press('Enter');await expect(page).toHaveURL(/#main$/);
  for(const width of [1365,900,768,560,390,320]){
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(n=>n.getBoundingClientRect().right>innerWidth+1).map(n=>n.tagName+'.'+n.className)}))).toEqual({width,scroll:width,overflow:[]});
    for(const name of ['Instructions','Saved decisions','Tasks & results'])await expect(page.locator('.preview-parts').getByRole('heading',{name,exact:true})).toBeVisible();
  }
  await page.setViewportSize({width:1365,height:1000});await page.screenshot({path:'test-results/landing-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/landing-mobile.png',fullPage:true});
  await page.getByText('What information can a connected AI tool receive?',{exact:true}).click();
  await expect(page.locator('.faq')).toContainText('Daemons.ai does not guarantee deletion of information already received by an external provider.');
  await page.getByText('Which AI tools can I connect?',{exact:true}).click();await expect(page.locator('.faq a').first()).toHaveAttribute('href','https://app.daemons.ai/connect');
  await page.emulateMedia({reducedMotion:'reduce'});expect(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
  const links=await page.locator('a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));
  expect(links.every(h=>h&&h!=='#')).toBe(true);
  for(const href of links.filter(h=>h.startsWith('#')))await expect(page.locator(href)).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('social metadata exposes a decodable large image and matching favicon exports',async({page})=>{
  const description='Keep instructions, saved decisions, tasks, and results together. Connect compatible AI assistants, agents, chatbots, and copilots so they can build on work already done.';
  const assets={'/assets/soul-familiar-v2.png':'image/png','/assets/favicon-familiar-v2.svg':'image/svg+xml','/assets/favicon-familiar-v2.ico':'image/x-icon','/assets/apple-touch-icon-familiar-v2.png':'image/png'};
  await page.route('http://127.0.0.1:8096/**',async route=>{
    const p=new URL(route.request().url()).pathname;
    if(p==='/')return route.fulfill({contentType:'text/html',body:await readFile('index.html','utf8')});
    if(p==='/footer.css')return route.fulfill({contentType:'text/css',body:await readFile('footer.css','utf8')});
    if(p==='/site.css')return route.fulfill({contentType:'text/css',body:await readFile('site.css','utf8')});
    if(assets[p])return route.fulfill({contentType:assets[p],body:await readFile('.'+p)});
    return route.continue();
  });
  await page.goto('/');
  for(const selector of ['meta[property="og:title"]','meta[name="twitter:title"]'])await expect(page.locator(selector)).toHaveAttribute('content','Daemons.ai — Organize ongoing work across your AI tools.');
  for(const selector of ['meta[name="description"]','meta[property="og:description"]','meta[name="twitter:description"]'])await expect(page.locator(selector)).toHaveAttribute('content',description);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content','summary_large_image');
  for(const selector of ['meta[property="og:image"]','meta[name="twitter:image"]'])await expect(page.locator(selector)).toHaveAttribute('content','https://daemons.ai/assets/soul-familiar-v2.png');
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute('content','800');
  await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute('content','800');
  await expect(page.locator('meta[property="og:image:type"]')).toHaveAttribute('content','image/png');
  const iconLinks=await page.locator('link[rel="icon"],link[rel="apple-touch-icon"]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));
  expect(iconLinks.sort()).toEqual(Object.keys(assets).filter(p=>!p.endsWith('soul-familiar-v2.png')).sort());
  for(const [src,size] of [['/assets/soul-familiar-v2.png',[800,800]],['/assets/apple-touch-icon-familiar-v2.png',[180,180]],['/assets/favicon-familiar-v2.svg',[64,64]]]){
    const dimensions=await page.evaluate(src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve([i.naturalWidth,i.naturalHeight]);i.onerror=reject;i.src=src;}),src);
    expect(dimensions).toEqual(size);
  }
  const ico=await readFile('assets/favicon-familiar-v2.ico');
  expect(ico.readUInt16LE(2)).toBe(1);
  expect(ico.readUInt16LE(4)).toBe(3);
  expect([0,1,2].map(i=>ico[6+16*i])).toEqual([16,32,48]);
  await page.setViewportSize({width:720,height:280});
  await page.setContent('<body style="margin:0;padding:32px;background:#10121a;color:#f2f1f7;font:14px Arial"><h2>Soul spark · favicon sizes</h2><div style="display:flex;gap:36px;align-items:center">'+[16,32,48,180].map(n=>`<div><img alt="${n}px favicon" src="http://127.0.0.1:8096/assets/${n===180?'apple-touch-icon-familiar-v2.png':'favicon-familiar-v2.svg'}" width="${n}" height="${n}"><p>${n}px</p></div>`).join('')+'</div></body>');
  await expect(page.getByAltText('16px favicon')).toBeVisible();
  await page.screenshot({path:'test-results/favicon-sizes.png'});
});
