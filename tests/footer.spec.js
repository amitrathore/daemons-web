import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test('footer links lead to readable legal/support pages and theme control is in the footer',async({page})=>{
  const mime={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ico':'image/x-icon'};
  await page.route('http://127.0.0.1:8096/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    let file=path==='/'?'index.html':path.endsWith('/')?path.slice(1)+'index.html':path.slice(1);
    try{const body=await readFile(file);return route.fulfill({contentType:mime[file.slice(file.lastIndexOf('.'))]||'text/html',body});}catch{return route.continue();}
  });
  for(const path of ['/','/terms/','/privacy/','/contact/']){
    await page.goto(path);
    await expect(page.locator('header #appearance')).toHaveCount(0);
    await expect(page.locator('footer #appearance')).toHaveCount(1);
    for(const theme of ['light','dark']){
      await page.getByRole('combobox',{name:'Appearance'}).selectOption(theme);
      for(const width of [1365,390,320]){
        await page.setViewportSize({width,height:900});
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      }
      if(path==='/'){
        await page.setViewportSize({width:1365,height:1000});await page.locator('footer').screenshot({path:`test-results/footer-${theme}-desktop.png`});
        await page.setViewportSize({width:390,height:844});await page.locator('footer').screenshot({path:`test-results/footer-${theme}-mobile.png`});
      }
    }
    const links=await page.locator('footer a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));
    expect(links).toContain('/privacy/');expect(links).toContain('/terms/');expect(links).toContain('/contact/');
    if(path!=='/'){
      await expect(page.getByRole('heading',{level:1})).toBeVisible();
      await expect(page.locator('.legal-page')).toContainText('Daemons LLP');
      await expect(page.locator('.legal-page a[href="mailto:hello@daemons.ai"]').first()).toBeVisible();
      const text=await page.locator('.legal-page').innerText();expect(text).not.toMatch(/Yvatar|Agents of SEO|TODO|placeholder/);
      await page.setViewportSize({width:1365,height:1000});await page.evaluate(()=>document.body.style.zoom='2');
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.evaluate(()=>document.body.style.zoom='');
    }
  }
  await page.goto('/');await page.getByRole('link',{name:'Privacy Policy',exact:true}).click();await expect(page).toHaveURL(/\/privacy\/$/);
  await page.getByRole('link',{name:'Terms of Service',exact:true}).click();await expect(page).toHaveURL(/\/terms\/$/);
  await page.getByRole('link',{name:'Contact & support',exact:true}).click();await expect(page).toHaveURL(/\/contact\/$/);
});

test('console footer includes public legal links and preserves theme choice',async({page})=>{
  await page.route('https://api.daemons.ai/v1/**',route=>route.fulfill({status:401,json:{error:'Please log in to Daemons.ai.'}}));
  await page.goto('/');
  await expect(page.locator('header #appearance')).toHaveCount(0);
  await page.locator('footer #appearance').selectOption('dark');await page.reload();
  await expect(page.locator('footer #appearance')).toHaveValue('dark');
  await expect(page.locator('footer a[href="https://daemons.ai/privacy/"]')).toHaveText('Privacy Policy');
  await expect(page.locator('footer a[href="https://daemons.ai/terms/"]')).toHaveText('Terms of Service');
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
