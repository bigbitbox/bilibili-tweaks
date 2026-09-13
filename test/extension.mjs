// 使用已安装当前脚本的独立篡改猴测试 profile；不复制日常浏览器的用户数据。
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { html } from './helpers.mjs';
if (!process.env.TM_PATH || !process.env.TM_PROFILE) throw new Error('请设置 TM_PATH（扩展程序目录）和 TM_PROFILE（已安装脚本的测试 profile）');
mkdirSync('test-results', {recursive:true});
const context=await chromium.launchPersistentContext(process.env.TM_PROFILE,{
  channel:'chromium',headless:process.env.HEADED!=='1',
  args:[`--disable-extensions-except=${process.env.TM_PATH}`,`--load-extension=${process.env.TM_PATH}`],
  ...(process.env.BROWSER_PROXY?{proxy:{server:process.env.BROWSER_PROXY}}:{}),viewport:{width:1440,height:1000},
});
const page=await context.newPage();
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
const report={};
page.on('console', message => { if (message.type()==='error') console.error('console:', message.text().slice(0,500)); });
try {
  // 通过公开安装链接重装到独立测试 profile，验证真正的下载/安装路径。
  await page.goto('chrome-extension://dhdgffkkebhmkfjojejmpbldmpobfkfo/options.html#nav=dashboard');
  await page.locator('.scripttr').filter({hasText:'B站优化 · Bilibili Tweaks'}).waitFor();
  await page.goto(`https://raw.githubusercontent.com/bigbitbox/bilibili-tweaks/main/bilibili-tweaks.user.js?t=${Date.now()}`).catch(e => {
    if (!String(e).includes('ERR_ABORTED')) throw e;
  });
  let installer;
  for (let attempt=0;attempt<60;attempt++) {
    installer=context.pages().find(p=>p.url().includes('/ask.html?aid='));
    if (installer) break;
    await page.waitForTimeout(500);
  }
  if (!installer) throw new Error('篡改猴安装页未打开');
  await installer.getByRole('button',{name:/^(Reinstall|Install|Update)$/}).click();
  await page.waitForTimeout(1500);
  report.installedFromGitHub=true;
  const routeURL='https://www.bilibili.com/video/BVfixture/';
  await context.route(routeURL,route=>route.fulfill({contentType:'text/html; charset=utf-8',body:html}));
  await page.goto(routeURL);
  await page.getByRole('button',{name:'B站优化',exact:true}).waitFor();
  await page.getByRole('button',{name:'B站优化',exact:true}).click();
  await page.getByRole('button',{name:'恢复默认',exact:true}).click();
  await page.locator('[data-setting=hideRecommendations]').uncheck();
  assert.equal(await page.locator('.rec-list').isVisible(),true);
  await page.locator('#rate').fill('1.75'); await page.locator('#set-rate').click();
  await page.reload();
  await page.getByRole('button',{name:'B站优化',exact:true}).waitFor();
  assert.equal(await page.locator('.rec-list').isVisible(),true);
  assert.equal(await page.locator('video').evaluate(el=>el.playbackRate),1.75);
  report.GMStoragePersisted=true;
  report.pageGMType=await page.evaluate(()=>typeof window.GM_getValue);
  await page.keyboard.down('a'); assert.equal(await page.locator('video').evaluate(el=>el.playbackRate),3);
  await page.keyboard.up('a'); assert.equal(await page.locator('video').evaluate(el=>el.playbackRate),1.75);
  report.fixtureHold=true;
  await page.getByRole('button',{name:'B站优化',exact:true}).click();
  await page.locator('[data-setting=hideRecommendations]').check();
  await page.screenshot({path:'test-results/tampermonkey-settings.png'});
  await context.unroute(routeURL);
  if (process.env.VIDEO_URL) {
    await page.goto(process.env.VIDEO_URL,{waitUntil:'domcontentloaded',timeout:60000});
    await page.getByRole('button',{name:'B站优化',exact:true}).waitFor({timeout:30000});
    await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2,{},{timeout:45000});
    await page.waitForTimeout(2000);
    await page.getByRole('button',{name:'B站优化',exact:true}).click();
    await page.locator('#rate').fill('1.75'); await page.locator('#set-rate').click();
    assert.equal(await page.locator('video').evaluate(el=>el.playbackRate),1.75);
    await page.locator('[data-setting=hideRecommendations]').uncheck();
    const shown=await page.locator('.rec-list').isVisible();
    await page.locator('[data-setting=hideRecommendations]').check();
    const hidden=!(await page.locator('.rec-list').isVisible());
    await page.getByRole('button',{name:'关闭设置'}).click();
    await page.locator('body').click({position:{x:2,y:2}});
    const dm=()=>page.locator('.bpx-player-dm-switch').getAttribute('class');
    const dmBefore=await dm(); await page.keyboard.press('d'); await page.waitForTimeout(150); const dmAfter=await dm(); await page.keyboard.press('d');
    const normalWidth=await page.locator('.bpx-player-container').evaluate(el=>el.clientWidth);
    await page.keyboard.press('b'); await page.waitForTimeout(150);
    const wide=await page.locator('.bpx-player-container').evaluate(el=>({width:el.clientWidth,attributes:Object.fromEntries([...el.attributes].map(a=>[a.name,a.value]))}));
    await page.getByRole('button',{name:'B站优化',exact:true}).click();
    await page.locator('[data-setting=defaultWide]').check();
    assert.equal(await page.locator('.bpx-player-container').getAttribute('data-screen'),'wide');
    await page.locator('[data-setting=defaultWide]').uncheck();
    await page.getByRole('button',{name:'关闭设置'}).click();
    await page.locator('body').click({position:{x:2,y:2}});
    await page.keyboard.press('b');
    await page.keyboard.press('g'); await page.waitForTimeout(150);
    const web=await page.locator('#bilibili-player').getAttribute('class');
    await page.keyboard.press('g');
    await page.keyboard.down('a'); const held=await page.locator('video').evaluate(el=>el.playbackRate);
    await page.keyboard.up('a'); const restored=await page.locator('video').evaluate(el=>el.playbackRate);
    assert.equal(held,3); assert.equal(restored,1.75); assert.equal(shown,true); assert.equal(hidden,true);
    assert.notEqual(dmBefore,dmAfter); assert.notEqual(wide.width,normalWidth); assert.match(web,/mode-webscreen/);
    report.live={url:page.url(),shown,hidden,dmBefore,dmAfter,wide,web,held,restored};
    await page.getByRole('button',{name:'B站优化',exact:true}).click();
    await page.screenshot({path:'test-results/tampermonkey-live.png'});
  }
  report.errors=errors;
  writeFileSync('test-results/tampermonkey.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} catch(e) {
  console.error('PAGE',page.url(),(await page.locator('body').innerText()).slice(0,700),errors);
  await page.screenshot({path:'test-results/tampermonkey-failure.png'}); throw e;
} finally { await context.close(); }
