import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
export const script = readFileSync(new URL('../bilibili-tweaks.user.js', import.meta.url), 'utf8');
export const html = `<!doctype html><html><head><meta charset="utf-8"><title>播放器回归测试</title></head><body>
<style>body{margin:32px;background:#f3f5f7;color:#202536;font:16px system-ui}.bpx-player-container{position:relative;width:800px;height:450px;background:#111}video,bwp-video{display:block;width:800px;height:400px}button{padding:8px}.rec-list{padding:20px}.bpx-player-subtitle-panel-major-group{color:white}</style>
<h1>B站优化 · 播放器回归测试</h1><div id="bilibili-player"><div class="bpx-player-container"><video></video>
<button class="bpx-player-dm-switch">弹幕</button><button class="bpx-player-ctrl-wide">宽屏</button><button class="bpx-player-ctrl-web">网页全屏</button><button class="bpx-player-ctrl-full">全屏</button>
<div class="bpx-player-subtitle-panel-major-group"><span>测试字幕</span></div>
<button class="bpx-player-ctrl-subtitle-close-switch bpx-state-active">关闭字幕</button><button class="bpx-player-ctrl-subtitle-language-item" data-lan="zh-Hans">中文字幕</button>
</div></div><aside class="rec-list">推荐内容</aside><section class="video-sections-content-list">合集不能被隐藏</section><input id="comment" placeholder="评论"><div id="editor" contenteditable="true">编辑</div><div id="shadow-editor"></div>
<script>window.clicks={};document.querySelectorAll('button').forEach(button=>button.onclick=()=>{clicks[button.className]=(clicks[button.className]||0)+1});document.querySelector('#shadow-editor').attachShadow({mode:'open'}).innerHTML='<input placeholder="影子输入框">';</script>
</body></html>`;
export async function browser() { return chromium.launch({ headless: process.env.HEADED !== '1' }); }
export async function fixture(browser, stored = null, path = '/video/BVtest/') {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.route('https://www.bilibili.com/**', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.addInitScript(value => {
    if (!localStorage.getItem('test-initialized')) {
      localStorage.setItem('test-initialized', '1');
      localStorage.setItem('test-settings', JSON.stringify(value));
    }
    window.GM_getValue = () => JSON.parse(localStorage.getItem('test-settings'));
    window.GM_setValue = (_, value) => localStorage.setItem('test-settings', JSON.stringify(value));
    window.GM_registerMenuCommand = (_, callback) => { window.openSettings = callback; };
  }, stored);
  await page.goto(`https://www.bilibili.com${path}`);
  await page.addScriptTag({ content: script });
  await page.waitForSelector('#bt-host', { state: 'attached' });
  return { page, context, errors };
}
export const rate = page => page.locator('video,bwp-video').first().evaluate(el => el.playbackRate);
export const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('test-settings')));
export async function panel(page) { await page.getByRole('button', { name: 'B站优化', exact: true }).click(); }
export async function closePanel(page) { await page.getByRole('button', { name: '关闭设置' }).click(); await page.locator('body').click({ position: { x: 2, y: 2 } }); }
