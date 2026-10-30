import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test('corporate site explains the product, links to setup, and works across screen sizes',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://127.0.0.1:8096/**',async route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname==='/footer.css')return route.fulfill({contentType:'text/css',body:await readFile('footer.css','utf8')});
    if(pathname==='/site.css')return route.fulfill({contentType:'text/css',body:await readFile('site.css','utf8')});
    if(pathname==='/')return route.fulfill({contentType:'text/html',body:await readFile('index.html','utf8')});
    return route.continue();
  });
  await page.goto('/');
  await expect(page).toHaveTitle('Daemons.ai — Give your agents a soul. Stay in control of their work.');
  await expect(page.getByRole('heading',{level:1})).toHaveText('Give your agents a soul. Stay in control of their work.');
  await expect(page.getByRole('link',{name:'Open Daemons.ai ↗',exact:true}).first()).toHaveAttribute('href','https://app.daemons.ai');
  await expect(page.getByRole('link',{name:'See how it works',exact:true})).toHaveAttribute('href','#how-it-works');
  await expect(page.getByRole('link',{name:'Create your first Daemon',exact:true})).toHaveCount(2);
  for (const link of await page.getByRole('link',{name:'Create your first Daemon',exact:true}).all()) await expect(link).toHaveAttribute('href','https://app.daemons.ai');
  await expect(page.locator('#examples article')).toHaveCount(3);
  await expect(page.getByText('A Daemon is a thread of responsibility you carry forward.',{exact:false})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Your workflow. Your choice of assistants.',exact:true})).toBeVisible();
  await expect(page.locator('#examples .example-sequence li')).toHaveCount(9);
  expect(await page.locator('#examples').evaluate(el=>Boolean(el.compareDocumentPosition(document.querySelector('#capabilities')) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await expect(page.locator('.selected strong')).toHaveText('Community gathering');
  await expect(page.locator('form,input,canvas')).toHaveCount(0);
  await expect(page.locator('script')).toHaveAttribute('src','/theme.js');
  await expect(page.getByText('ILLUSTRATIVE PRODUCT PREVIEW · EXAMPLE DATA')).toBeVisible();
  await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'Skip to content'})).toBeFocused();
  await page.keyboard.press('Enter');await expect(page).toHaveURL(/#main$/);
  for(const width of [1365,900,768,560,390,320]){
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(n=>n.getBoundingClientRect().right>innerWidth+1).map(n=>n.tagName+'.'+n.className)}))).toEqual({width,scroll:width,overflow:[]});
    for(const label of ['Queued','In progress','Needs attention','Finished'])await expect(page.getByRole('heading',{name:new RegExp(`^${label}\\s*1$`)})).toBeVisible();
    await expect(page.locator('.product-sidebar')).toBeVisible();
    await expect(page.getByText('Decision: prioritize accessible venues near transit. Members prefer weekday evenings.',{exact:true})).toBeVisible();
  }
  await page.setViewportSize({width:1365,height:1000});await page.screenshot({path:'test-results/landing-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/landing-mobile.png',fullPage:true});
  await page.getByText('What information can a connected assistant receive?',{exact:true}).click();
  await expect(page.getByText('Daemons.ai does not guarantee deletion of information already received by an external provider.',{exact:false})).toBeVisible();
  await page.getByText('Where does the work run?',{exact:true}).click();
  await expect(page.getByText('Work runs in your connected assistant’s environment,',{exact:false})).toBeVisible();
  await page.getByText('Can I organize a long-term project here?',{exact:true}).click();
  await expect(page.getByText('Daemons does not automatically schedule work or manage task dependencies.',{exact:false})).toBeVisible();
  await page.getByText('Can several assistants work with the same Daemon?',{exact:true}).click();
  await expect(page.locator('.faq').getByText('Authorize each assistant separately.',{exact:false})).toBeVisible();
  await page.emulateMedia({reducedMotion:'reduce'});
  expect(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
  const links=await page.locator('a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));
  expect(links.every(h=>h&&h!=='#')).toBe(true);
  for(const href of links.filter(h=>h.startsWith('#')))await expect(page.locator(href)).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('social metadata exposes a decodable large image and matching favicon exports',async({page})=>{
  const description='Keep instructions, memory, and tasks together. Choose which assistants contribute, and carry the work forward when tools change.';
  const assets={'/assets/og-familiar-v2.jpg':'image/jpeg','/assets/favicon-familiar-v2.svg':'image/svg+xml','/assets/favicon-familiar-v2.ico':'image/x-icon','/assets/apple-touch-icon-familiar-v2.png':'image/png'};
  await page.route('http://127.0.0.1:8096/**',async route=>{
    const p=new URL(route.request().url()).pathname;
    if(p==='/')return route.fulfill({contentType:'text/html',body:await readFile('index.html','utf8')});
    if(p==='/footer.css')return route.fulfill({contentType:'text/css',body:await readFile('footer.css','utf8')});
    if(p==='/site.css')return route.fulfill({contentType:'text/css',body:await readFile('site.css','utf8')});
    if(assets[p])return route.fulfill({contentType:assets[p],body:await readFile('.'+p)});
    return route.continue();
  });
  await page.goto('/');
  for(const selector of ['meta[property="og:title"]','meta[name="twitter:title"]'])await expect(page.locator(selector)).toHaveAttribute('content','Daemons.ai — Give your agents a soul. Stay in control of their work.');
  for(const selector of ['meta[name="description"]','meta[property="og:description"]','meta[name="twitter:description"]'])await expect(page.locator(selector)).toHaveAttribute('content',description);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content','summary_large_image');
  for(const selector of ['meta[property="og:image"]','meta[name="twitter:image"]'])await expect(page.locator(selector)).toHaveAttribute('content','https://daemons.ai/assets/og-familiar-v2.jpg');
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute('content','1200');
  await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute('content','630');
  await expect(page.locator('meta[property="og:image:type"]')).toHaveAttribute('content','image/jpeg');
  const iconLinks=await page.locator('link[rel="icon"],link[rel="apple-touch-icon"]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));
  expect(iconLinks.sort()).toEqual(Object.keys(assets).filter(p=>!p.endsWith('.jpg')).sort());
  for(const [src,size] of [['/assets/og-familiar-v2.jpg',[1200,630]],['/assets/apple-touch-icon-familiar-v2.png',[180,180]],['/assets/favicon-familiar-v2.svg',[64,64]]]){
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
