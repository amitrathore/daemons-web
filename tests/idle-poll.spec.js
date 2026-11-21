import {test,expect} from '@playwright/test';
test('idle and collapsed views stop refreshing; interaction resumes without losing the page',async({page})=>{
  await page.route('https://api.daemons.ai/**',route=>route.fulfill({status:401,json:{error:'Log in'}}));
  await page.clock.install();await page.goto('/');
  await page.evaluate(async()=>{
    const {idlePoll}=await import('/idle-poll.js');
    const root=document.createElement('div');root.id='idle-test';root.textContent='Wake view';document.body.append(root);
    window.idleCalls=0;window.stopIdle=idlePoll(root,()=>{window.idleCalls++;});
  });
  await page.clock.runFor(30000);expect(await page.evaluate(()=>window.idleCalls)).toBe(2);
  await page.clock.fastForward(180000);const quiet=await page.evaluate(()=>window.idleCalls);
  await page.clock.runFor(60000);expect(await page.evaluate(()=>window.idleCalls)).toBe(quiet);
  await page.locator('#idle-test').click();expect(await page.evaluate(()=>window.idleCalls)).toBe(quiet+1);
  await page.evaluate(()=>{const d=document.createElement('details');d.id='closed-panel';d.innerHTML='<summary>Settings</summary>';document.body.append(d);d.append(document.querySelector('#idle-test'));});
  const before=await page.evaluate(()=>window.idleCalls);await page.clock.runFor(60000);
  expect(await page.evaluate(()=>window.idleCalls)).toBe(before);
  await page.locator('#closed-panel summary').click();await page.clock.runFor(15000);
  expect(await page.evaluate(()=>window.idleCalls)).toBeGreaterThan(before);
  await page.evaluate(()=>window.stopIdle());const stopped=await page.evaluate(()=>window.idleCalls);
  await page.clock.runFor(60000);expect(await page.evaluate(()=>window.idleCalls)).toBe(stopped);
});
