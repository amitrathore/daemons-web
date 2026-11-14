import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

async function publicSite(page){
  await page.route('http://127.0.0.1:8096/**',async route=>{
    const pathname=new URL(route.request().url()).pathname;
    const file=pathname==='/'?'index.html':pathname.endsWith('/')?pathname.slice(1)+'index.html':pathname.slice(1);
    const types={css:'text/css',js:'text/javascript',svg:'image/svg+xml',png:'image/png',woff2:'font/woff2',ico:'image/x-icon'};
    try{return route.fulfill({body:await readFile(file),contentType:types[file.split('.').pop()]||'text/html'});}
    catch{return route.fulfill({status:404,body:'Not found'});}
  });
}

test('A2A guide is reachable from public footers and explains the full handoff visually',async({page})=>{
  await publicSite(page);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  for(const path of ['/','/terms/','/privacy/','/contact/','/a2a/']){
    await page.goto(path);
    await expect(page.locator('footer').getByRole('link',{name:'Agent-to-agent (A2A)',exact:true})).toHaveAttribute('href','/a2a/');
  }
  await page.goto('/');
  await page.locator('footer').getByRole('link',{name:'Agent-to-agent (A2A)',exact:true}).click();
  await expect(page).toHaveURL(/\/a2a\/$/);
  await expect(page).toHaveTitle('Agent-to-agent (A2A), explained — Daemons.ai');
  await expect(page.getByRole('heading',{level:1})).toContainText('Daemons for help.');
  await expect(page.getByRole('figure')).toHaveCount(2);
  await expect(page.locator('.handoff-flow .flow-node')).toHaveCount(3);
  await expect(page.locator('.task-journey li')).toHaveCount(4);
  await expect(page.locator('main')).toContainText('doesn’t wake an assistant');
  await expect(page.locator('main')).toContainText('Available to A2A-compatible clients');
  await expect(page.locator('details')).not.toHaveAttribute('open','');
  await page.getByText('Connection details and current limits',{exact:false}).click();
  await expect(page.locator('details')).toHaveAttribute('open','');
  await expect(page.locator('.builder-details')).toContainText('MCP and A2A tokens are separate');
  for(const theme of ['light','dark']){
    await page.locator('footer #appearance').selectOption(theme);
    for(const width of [1440,768,390,320]){
      await page.setViewportSize({width,height:1000});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await expect(page.getByRole('heading',{level:1})).toBeVisible();
      if(width===1440||width===390){
        await page.screenshot({path:`test-results/a2a-${theme}-${width}.png`,fullPage:true});
      }
    }
  }
  await page.setViewportSize({width:1365,height:900});
  await page.evaluate(()=>document.body.style.zoom='2');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('console footer links to the public A2A guide',async({page})=>{
  await page.route('https://api.daemons.ai/v1/**',route=>route.fulfill({status:401,json:{error:'Please log in to Daemons.ai.'}}));
  await page.goto('/');
  await expect(page.locator('footer').getByRole('link',{name:'Agent-to-agent (A2A)',exact:true})).toHaveAttribute('href','https://daemons.ai/a2a/');
});
