import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { browser, fixture, rate, saved, panel, closePanel, script } from './helpers.mjs';
let b;
before(async () => { b = await browser(); });
after(async () => { await b?.close(); });

test('推荐开关立即生效、保留合集、持久化并适应新插入的推荐', async () => {
  const { page, context, errors } = await fixture(b);
  assert.equal(await page.locator('.rec-list').isVisible(), false);
  assert.equal(await page.locator('.video-sections-content-list').isVisible(), true);
  await panel(page);
  await page.locator('[data-setting=hideRecommendations]').uncheck();
  assert.equal(await page.locator('.rec-list').isVisible(), true);
  assert.equal((await saved(page)).hideRecommendations, false);
  await page.locator('[data-setting=hideRecommendations]').check();
  await page.evaluate(() => { const el=document.createElement('div'); el.className='next-play'; el.textContent='next'; document.body.append(el); });
  assert.equal(await page.locator('.next-play').isVisible(), false);
  await page.screenshot({ path: 'test-results/settings.png' });
  await page.reload(); await page.addScriptTag({ content: script });
  assert.equal(await page.locator('.rec-list').isVisible(), false);
  assert.deepEqual(errors, []); await context.close();
});

test('自定义倍速、非法值、排序去重、禁用功能', async () => {
  const { page, context, errors } = await fixture(b);
  await panel(page);
  await page.locator('#rate').fill('1.75'); await page.locator('#set-rate').click();
  assert.equal(await rate(page), 1.75);
  await page.locator('#rates').fill('2, 1, 1, 0.75'); await page.locator('#rates').blur();
  assert.deepEqual((await saved(page)).rates, [0.75, 1, 2]);
  await page.locator('#rates').fill('0, NaN, 99'); await page.locator('#rates').blur();
  assert.deepEqual((await saved(page)).rates, [0.75, 1, 2]);
  await page.locator('[data-setting=speed]').uncheck();
  await closePanel(page); await page.keyboard.press('Control+3');
  assert.equal(await rate(page), 1.75);
  assert.deepEqual(errors, []); await context.close();
});

test('A/S 多键栈、数字临时速度、窗口失焦恢复、输入框避让', async () => {
  const { page, context, errors } = await fixture(b, { rate: 1.5 });
  await page.keyboard.down('a'); assert.equal(await rate(page), 3);
  await page.keyboard.down('s'); assert.equal(await rate(page), 4);
  await page.keyboard.up('a'); assert.equal(await rate(page), 4);
  await page.keyboard.up('s'); assert.equal(await rate(page), 1.5);
  await page.keyboard.down('3'); assert.equal(await rate(page), 3);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal(await rate(page), 1.5); await page.keyboard.up('3');
  for (const selector of ['#comment', '#editor', '#shadow-editor input']) {
    await page.locator(selector).focus(); await page.keyboard.type('as23'); assert.equal(await rate(page), 1.5);
  }
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await page.keyboard.down('a'); await page.locator('#comment').focus(); assert.equal(await rate(page), 1.5); await page.keyboard.up('a');
  assert.deepEqual(errors, []); await context.close();
});

test('右方向键短按 seek、长按相对加速后恢复、Ctrl 调速有边界', async () => {
  const { page, context, errors } = await fixture(b, { rate: 1.5 });
  await page.locator('video').evaluate(el => { Object.defineProperty(el, 'duration', { value: 100 }); });
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('video').evaluate(el => el.currentTime), 5);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(400);
  assert.equal(await rate(page), 3);
  await page.keyboard.up('ArrowRight'); assert.equal(await rate(page), 1.5);
  assert.equal(await page.locator('video').evaluate(el => el.currentTime), 5);
  await page.keyboard.press('Control+ArrowUp'); assert.equal(await rate(page), 2);
  for (let n=0;n<10;n++) await page.keyboard.press('Control+ArrowUp');
  assert.equal(await rate(page), 4);
  assert.deepEqual(errors, []); await context.close();
});

test('B/G/D/F 控件、键位重映射与冲突校验、关闭快捷键', async () => {
  const { page, context, errors } = await fixture(b);
  for (const key of ['b', 'g', 'd', 'f']) await page.keyboard.press(key);
  const clicks = await page.evaluate(() => window.clicks);
  for (const cls of ['bpx-player-ctrl-wide', 'bpx-player-ctrl-web', 'bpx-player-dm-switch', 'bpx-player-ctrl-full']) assert.equal(clicks[cls], 1);
  await panel(page);
  await page.locator('[data-key=wide]').press('d');
  assert.equal((await saved(page))?.keys?.wide ?? 'KeyB', 'KeyB');
  await page.locator('[data-key=wide]').press('w'); assert.equal((await saved(page)).keys.wide, 'KeyW');
  await page.locator('[data-setting=shortcuts]').uncheck(); await closePanel(page);
  await page.keyboard.press('w'); assert.equal(await page.evaluate(() => clicks['bpx-player-ctrl-wide']), 1);
  assert.deepEqual(errors, []); await context.close();
});

test('播放器替换清理旧状态、新视频记忆倍速、单一面板', async () => {
  const { page, context, errors } = await fixture(b, { rate: 1.75 });
  await page.keyboard.down('a');
  await page.locator('video').evaluate(el => { window.oldVideo=el; el.replaceWith(document.createElement('video')); });
  await page.waitForTimeout(200);
  assert.equal(await rate(page), 1.75);
  assert.equal(await page.evaluate(() => oldVideo.playbackRate), 1.75);
  await page.keyboard.up('a');
  await page.addScriptTag({ content: script });
  assert.equal(await page.locator('#bt-host').count(), 1);
  assert.deepEqual(errors, []); await context.close();
});

test('无播放器页面、损坏存储、SPA 首页净化范围', async () => {
  const { page, context, errors } = await fixture(b, { rate: -10, rates: ['x'], hideHome: true }, '/');
  assert.equal(await rate(page), 1);
  assert.equal(await page.locator('.rec-list').isVisible(), true);
  await page.locator('#bilibili-player').evaluate(el => el.remove()); await page.waitForTimeout(200);
  await page.keyboard.press('a'); await page.keyboard.press('g');
  await page.evaluate(() => history.pushState({}, '', '/video/BVnext/')); await page.waitForTimeout(200);
  assert.equal(await page.locator('.rec-list').isVisible(), false);
  await panel(page); assert.equal(await page.locator('dialog').isVisible(), true);
  assert.deepEqual(errors, []); await context.close();
});

test('bwp-video 兼容、剩余时间与全屏挂载', async () => {
  const { page, context, errors } = await fixture(b, { rate: 2, showTime: true });
  await page.locator('video').evaluate(el => {
    const custom=document.createElement('bwp-video'); Object.assign(custom,{playbackRate:1,currentTime:60,duration:3660,readyState:4}); el.replaceWith(custom);
  });
  await page.waitForTimeout(200);
  assert.equal(await rate(page), 2);
  assert.match(await page.locator('#time').textContent(), /30:00/);
  await page.keyboard.down('s'); assert.equal(await rate(page), 4); await page.keyboard.up('s'); assert.equal(await rate(page), 2);
  await page.locator('.bpx-player-container').evaluate(el => el.requestFullscreen());
  await page.waitForFunction(() => document.querySelector('.bpx-player-container #bt-host'));
  assert.equal(await page.locator('.bpx-player-container #bt-host').count(), 1);
  await page.evaluate(() => document.exitFullscreen());
  assert.deepEqual(errors, []); await context.close();
});

test('同一 video 移入新播放器后，快捷键绑定新容器', async () => {
  const {page,context,errors}=await fixture(b);
  await page.locator('.bpx-player-container').evaluate(old => {
    const next=old.cloneNode(true); next.querySelector('video').replaceWith(old.querySelector('video'));
    next.querySelector('.bpx-player-ctrl-wide').onclick=()=>{window.newWide=(window.newWide||0)+1}; old.replaceWith(next);
  });
  await page.waitForTimeout(250); await page.keyboard.press('b');
  assert.equal(await page.evaluate(()=>window.newWide),1);
  assert.deepEqual(errors,[]); await context.close();
});

test('隐藏视频变为可见后自动恢复记忆速度', async () => {
  const {page,context,errors}=await fixture(b,{rate:1.75});
  await page.locator('video').evaluate(el => { const next=document.createElement('video');next.style.display='none';el.replaceWith(next); });
  await page.waitForTimeout(250);
  await page.locator('video').evaluate(el=>el.style.display='block');
  await page.waitForTimeout(250); assert.equal(await rate(page),1.75);
  assert.deepEqual(errors,[]); await context.close();
});

test('默认宽屏重新启用、右方向键以当前临时速度为基准', async () => {
  const {page,context,errors}=await fixture(b,{rate:1.5,defaultWide:true});
  await panel(page); await page.locator('[data-setting=defaultWide]').uncheck(); await page.locator('[data-setting=defaultWide]').check();
  assert.equal(await page.evaluate(()=>clicks['bpx-player-ctrl-wide']),2);
  await page.locator('[data-setting=defaultWide]').uncheck();
  await page.locator('.bpx-player-container').evaluate(el=>el.setAttribute('data-screen','wide'));
  await page.locator('[data-setting=defaultWide]').check();
  assert.equal(await page.evaluate(()=>clicks['bpx-player-ctrl-wide']),2);
  await closePanel(page);
  await page.keyboard.down('a'); await page.keyboard.down('ArrowRight'); await page.waitForTimeout(400);
  assert.equal(await rate(page),6);
  await page.keyboard.up('ArrowRight'); assert.equal(await rate(page),3);
  await page.keyboard.up('a'); assert.equal(await rate(page),1.5);
  assert.deepEqual(errors,[]); await context.close();
});

test('点击真正接收事件的子控件，不能被祖先选择器抢先匹配', async () => {
  const {page,context,errors}=await fixture(b);
  await page.locator('.bpx-player-dm-switch').evaluate(el=>{
    el.onclick=null; el.innerHTML='<input type="checkbox">';
  });
  await page.locator('.bpx-player-ctrl-wide').evaluate(el=>{
    el.onclick=null;el.innerHTML='<span>宽屏</span>';el.firstChild.onclick=()=>{window.childWide=true};
  });
  await page.keyboard.press('d');
  assert.equal(await page.locator('.bpx-player-dm-switch input').isChecked(),true);
  await page.keyboard.press('b');assert.equal(await page.evaluate(()=>window.childWide),true);
  assert.deepEqual(errors,[]);await context.close();
});
