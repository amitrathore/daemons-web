import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test('corporate site explains the product, links to setup, and works across screen sizes',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://127.0.0.1:8096/**',async route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname==='/site.css')return route.fulfill({contentType:'text/css',body:await readFile('site.css','utf8')});
    if(pathname==='/')return route.fulfill({contentType:'text/html',body:await readFile('index.html','utf8')});
    return route.continue();
  });
  await page.goto('/');
  await expect(page).toHaveTitle('Daemons.ai — A lasting home for your AI agents');
  await expect(page.getByRole('heading',{level:1})).toHaveText('Give your AI agentsa lasting home.');
  await expect(page.getByRole('link',{name:'Open Daemons.ai ↗',exact:true}).first()).toHaveAttribute('href','https://app.daemons.ai');
  await expect(page.getByRole('link',{name:'Connect an assistant →',exact:true})).toHaveAttribute('href','https://app.daemons.ai/connect');
  await expect(page.locator('form,input,canvas,script')).toHaveCount(0);
  await expect(page.getByText('ILLUSTRATIVE PRODUCT PREVIEW · EXAMPLE DATA')).toBeVisible();
  await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'Skip to content'})).toBeFocused();
  await page.keyboard.press('Enter');await expect(page).toHaveURL(/#main$/);
  for(const width of [1365,900,768,560,390,320]){
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    for(const label of ['Queued','In progress','Needs attention','Finished'])await expect(page.getByRole('heading',{name:new RegExp(`^${label}\\s*1$`)})).toBeVisible();
  }
  await page.setViewportSize({width:1365,height:1000});await page.screenshot({path:'test-results/landing-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/landing-mobile.png',fullPage:true});
  await page.getByText('Where does the work run?',{exact:true}).click();
  await expect(page.getByText('Work runs in your connected assistant’s environment,',{exact:false})).toBeVisible();
  await page.emulateMedia({reducedMotion:'reduce'});
  expect(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
  const links=await page.locator('a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));
  expect(links.every(h=>h&&h!=='#')).toBe(true);
  for(const href of links.filter(h=>h.startsWith('#')))await expect(page.locator(href)).toHaveCount(1);
  expect(errors).toEqual([]);
});
