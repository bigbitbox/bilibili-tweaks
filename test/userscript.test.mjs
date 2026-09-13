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

test('A/S 多键栈、窗口失焦恢复、输入框避让', async () => {
  const { page, context, errors } = await fixture(b, { rate: 1.5 });
  await page.keyboard.down('a'); assert.equal(await rate(page), 3);
  await page.keyboard.down('s'); assert.equal(await rate(page), 4);
  await page.keyboard.up('a'); assert.equal(await rate(page), 4);
  await page.keyboard.up('s'); assert.equal(await rate(page), 1.5);
  await page.keyboard.down('a'); assert.equal(await rate(page), 3);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal(await rate(page), 1.5); await page.keyboard.up('a');
  for (const selector of ['#comment', '#editor', '#shadow-editor input']) {
    await page.locator(selector).focus(); await page.keyboard.type('as23'); assert.equal(await rate(page), 1.5);
  }
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await page.keyboard.down('a'); await page.locator('#comment').focus(); assert.equal(await rate(page), 1.5); await page.keyboard.up('a');
  assert.deepEqual(errors, []); await context.close();
});

test('右方向键只快进、阻止原站长按倍速、Ctrl 调速有边界', async () => {
  const { page, context, errors } = await fixture(b, { rate: 1.5 });
  await page.locator('video').evaluate(el => { Object.defineProperty(el, 'duration', { value: 100 }); });
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('video').evaluate(el => el.currentTime), 5);
  await page.evaluate(() => document.addEventListener('keydown',e=>{if(e.code==='ArrowRight')document.querySelector('video').playbackRate=3}));
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(400);
  assert.equal(await rate(page), 1.5);
  await page.keyboard.up('ArrowRight'); assert.equal(await rate(page), 1.5);
  assert.equal(await page.locator('video').evaluate(el => el.currentTime), 10);
  await page.keyboard.press('Control+ArrowUp'); assert.equal(await rate(page), 2);
  for (let n=0;n<10;n++) await page.keyboard.press('Control+ArrowUp');
  assert.equal(await rate(page), 4);
  assert.deepEqual(errors, []); await context.close();
});

test('B/G/D/F 控件、键位重映射与冲突校验、关闭快捷键', async () => {
  const { page, context, errors } = await fixture(b);
  for (const key of ['b', 'f', 'd', 'Meta+f']) await page.keyboard.press(key);
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

test('默认宽屏重新启用、空格与 A 键叠加后恢复', async () => {
  const {page,context,errors}=await fixture(b,{rate:1.5,defaultWide:true});
  await panel(page); await page.locator('[data-setting=defaultWide]').uncheck(); await page.locator('[data-setting=defaultWide]').check();
  assert.equal(await page.evaluate(()=>clicks['bpx-player-ctrl-wide']),2);
  await page.locator('[data-setting=defaultWide]').uncheck();
  await page.locator('.bpx-player-container').evaluate(el=>el.setAttribute('data-screen','wide'));
  await page.locator('[data-setting=defaultWide]').check();
  assert.equal(await page.evaluate(()=>clicks['bpx-player-ctrl-wide']),2);
  await closePanel(page);
  await page.keyboard.down('a'); await page.keyboard.down('Space'); await page.waitForTimeout(400);
  assert.equal(await rate(page),2);
  await page.keyboard.up('Space'); assert.equal(await rate(page),3);
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


test('空格短按播放暂停、长按固定2倍速，失焦取消不误暂停', async () => {
  const {page,context,errors}=await fixture(b,{rate:1.5});
  await page.locator('video').evaluate(async el=>{
    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;
    const stream=canvas.captureStream(20);const recorder=new MediaRecorder(stream);const chunks=[];
    recorder.ondataavailable=e=>chunks.push(e.data);const done=new Promise(resolve=>recorder.onstop=resolve);
    recorder.start();const draw=setInterval(()=>canvas.getContext('2d').fillRect(0,0,320,180),40);
    await new Promise(resolve=>setTimeout(resolve,500));recorder.stop();await done;clearInterval(draw);stream.getTracks().forEach(t=>t.stop());
    el.src=URL.createObjectURL(new Blob(chunks,{type:recorder.mimeType}));el.muted=true;el.loop=true;await el.play();
    window.nativeSpaceUps=0;document.addEventListener('keyup',e=>{if(e.code==='Space')window.nativeSpaceUps++});
  });
  const paused=()=>page.locator('video').evaluate(el=>el.paused);
  await page.keyboard.press('Space');assert.equal(await paused(),true);
  await page.keyboard.press('Space');assert.equal(await paused(),false);
  await page.keyboard.down('Space');await page.waitForTimeout(400);
  assert.equal(await rate(page),2);assert.equal(await paused(),false);
  await page.keyboard.down('Space');await page.keyboard.up('Space');
  assert.equal(await rate(page),1.5);assert.equal(await paused(),false);
  await page.keyboard.down('Space');await page.waitForTimeout(400);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.keyboard.up('Space');
  assert.equal(await rate(page),1.5);assert.equal(await paused(),false);
  await page.keyboard.down('Space');await page.locator('#comment').focus();await page.keyboard.up('Space');
  assert.equal(await paused(),false);
  await page.keyboard.press('Space');assert.equal(await paused(),false);
  assert.equal(await page.locator('#comment').inputValue(),' ');
  assert.equal(await page.evaluate(()=>window.nativeSpaceUps),1);
  assert.deepEqual(errors,[]);await context.close();
});

test('主键盘1234直接记忆1/1.3/1.5/2，松手不还原且避让组合键', async () => {
  const {page,context,errors}=await fixture(b);
  for (const [key,value] of [['1',1],['2',1.3],['3',1.5],['4',2]]) {
    await page.keyboard.down(key);assert.equal(await rate(page),value);
    await page.keyboard.up(key);assert.equal(await rate(page),value);
    assert.equal((await saved(page)).rate,value);
  }
  await page.keyboard.press('Control+1');assert.equal(await rate(page),2);
  await page.keyboard.press('5');assert.equal(await rate(page),2);
  await page.reload();await page.addScriptTag({content:script});assert.equal(await rate(page),2);
  assert.deepEqual(errors,[]);await context.close();
});

test('抢先拦截 BewlyCat 风格的 window 捕获快捷键，并消费 keyup', async () => {
  const {page,context,errors}=await fixture(b);
  await page.evaluate(()=>{
    window.titleOverlay=0;window.foreignKeyups=0;
    window.addEventListener('keydown',e=>{
      if(e.code==='KeyB' && !e.target.matches('input,textarea')){e.preventDefault();e.stopImmediatePropagation();window.titleOverlay++;}
    },true);
    window.addEventListener('keyup',e=>{if(e.code==='KeyB')window.foreignKeyups++},true);
  });
  await page.keyboard.press('b');
  assert.equal(await page.evaluate(()=>clicks['bpx-player-ctrl-wide']),1);
  assert.equal(await page.evaluate(()=>window.titleOverlay),0);
  assert.equal(await page.evaluate(()=>window.foreignKeyups),0);
  await page.locator('#comment').focus();await page.keyboard.type('b');
  assert.equal(await page.locator('#comment').inputValue(),'b');
  assert.deepEqual(errors,[]);await context.close();
});


test('旧键位迁移为 F 网页全屏 / Meta+F 真全屏，不拦截其他 Meta 组合', async () => {
  const {page,context,errors}=await fixture(b,{keys:{danmaku:'KeyD',wide:'KeyB',web:'KeyG',fullscreen:'KeyF',subtitle:'KeyZ'}});
  await page.keyboard.press('f');await page.keyboard.press('Meta+f');
  assert.equal(await page.evaluate(()=>clicks['bpx-player-ctrl-web']),1);
  assert.equal(await page.evaluate(()=>clicks['bpx-player-ctrl-full']),1);
  await page.keyboard.press('Meta+b');
  assert.equal(await page.evaluate(()=>clicks['bpx-player-ctrl-wide']),undefined);
  await panel(page);assert.equal(await page.locator('[data-key=web]').inputValue(),'F');
  assert.equal(await page.locator('[data-key=fullscreen]').inputValue(),'⌘F');
  assert.deepEqual(errors,[]);await context.close();
});
