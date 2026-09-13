// 使用已安装当前脚本的独立篡改猴测试 profile；不复制日常浏览器的用户数据。
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { html, script } from './helpers.mjs';
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
  // 解压加载的测试扩展可能在浏览器重启后要求重存脚本，使用编辑器正常保存当前版本。
  await page.goto('chrome-extension://dhdgffkkebhmkfjojejmpbldmpobfkfo/options.html#nav=dashboard');
  await page.getByTitle('Edit', {exact:true}).first().click();
  await page.locator('.CodeMirror:visible').click();
  await page.keyboard.press('Meta+a'); await page.keyboard.insertText(script); await page.keyboard.press('Meta+s');
  await page.waitForTimeout(1500);
  await page.goto('chrome-extension://dhdgffkkebhmkfjojejmpbldmpobfkfo/options.html#nav=dashboard');
  await page.locator('.scripttr').waitFor();
  console.log('enabled', await page.locator('.scripttr .enabler').getAttribute('class'));


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
    const dmBefore=await dm(); await page.keyboard.press('d'); const dmAfter=await dm(); await page.keyboard.press('d');
    await page.keyboard.press('b');
    const wide=await page.locator('.bpx-player-container').getAttribute('class');
    await page.keyboard.press('b');
    await page.keyboard.press('g');
    const web=await page.locator('.bpx-player-container').getAttribute('class');
    await page.keyboard.press('g');
    await page.keyboard.down('a'); const held=await page.locator('video').evaluate(el=>el.playbackRate);
    await page.keyboard.up('a'); const restored=await page.locator('video').evaluate(el=>el.playbackRate);
    assert.equal(held,3); assert.equal(restored,1.75); assert.equal(shown,true); assert.equal(hidden,true);
    assert.notEqual(dmBefore,dmAfter); assert.match(wide,/bpx-state-wide/); assert.match(web,/bpx-state-web/);
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
