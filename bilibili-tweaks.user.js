// ==UserScript==
// @name         B站优化 · Bilibili Tweaks
// @namespace    https://github.com/bigbitbox/bilibili-tweaks
// @version      1.0.1
// @description  统一管理推荐净化、记忆倍速、长按加速与播放器快捷键，所有功能可开关。
// @author       bigbitbox
// @license      MIT
// @match        https://www.bilibili.com/*
// @run-at       document-start
// @noframes
// @sandbox      raw
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @homepageURL  https://github.com/bigbitbox/bilibili-tweaks
// @supportURL   https://github.com/bigbitbox/bilibili-tweaks/issues
// @downloadURL  https://raw.githubusercontent.com/bigbitbox/bilibili-tweaks/main/bilibili-tweaks.user.js
// @updateURL    https://raw.githubusercontent.com/bigbitbox/bilibili-tweaks/main/bilibili-tweaks.meta.js
// ==/UserScript==

(() => {
  'use strict';
  if (window.top !== window.self || document.getElementById('bt-host')) return;
  const KEY = 'bilibili-tweaks.v1';
  const defaults = {
    hideRecommendations: true, hideHome: false, speed: true, rememberSpeed: true,
    hold: true, shortcuts: true, numberKeys: true, showTime: false,
    defaultWide: false, copySubtitle: true, rate: 1,
    rates: [0.5, 1, 1.25, 1.5, 2, 2.5, 3, 4], holdA: 3, holdS: 4,
    holdRight: 2, rightRelative: true,
    keys: { danmaku: 'KeyD', wide: 'KeyB', web: 'KeyG', fullscreen: 'KeyF', subtitle: 'KeyZ' },
  };
  const validRate = value => typeof value === 'number' && Number.isFinite(value) && value >= 0.25 && value <= 16;
  function normalize(raw) {
    const result = { ...defaults, rates: [...defaults.rates], keys: { ...defaults.keys } };
    if (!raw || typeof raw !== 'object') return result;
    for (const key of Object.keys(defaults)) {
      if (typeof defaults[key] === 'boolean' && typeof raw[key] === 'boolean') result[key] = raw[key];
    }
    for (const key of ['rate', 'holdA', 'holdS', 'holdRight']) if (validRate(raw[key])) result[key] = raw[key];
    if (Array.isArray(raw.rates) && raw.rates.length && raw.rates.length <= 30 && raw.rates.every(validRate)) {
      result.rates = [...new Set(raw.rates)].sort((a, b) => a - b);
    }
    // 单字母重映射，保留长按键和浏览器组合键；整个键表原子校验。
    if (raw.keys && Object.keys(defaults.keys).every(k => /^Key[B-Z]$/.test(raw.keys[k]) && raw.keys[k] !== 'KeyS') &&
        new Set(Object.values(raw.keys)).size === Object.keys(defaults.keys).length) result.keys = Object.fromEntries(Object.keys(defaults.keys).map(key => [key, raw.keys[key]]));
    return result;
  }
  let settings;
  try { settings = normalize(GM_getValue(KEY, null)); } catch { settings = normalize(null); }
  function persist() {
    try { GM_setValue(KEY, settings); } catch { toast('设置未能保存，请检查篡改猴存储'); }
  }
  let media = null, player = null, mediaEvents = null, wideApplied = null;
  let baseRate = settings.rate, rightTimer = null, rightPending = false, toastTimer;
  const held = new Map();
  const PLAYER = '.bpx-player-container, .bilibili-player';
  const MEDIA = 'video, bwp-video';
  const controls = {
    danmaku: '.bpx-player-dm-switch input, .bpx-player-dm-switch, .bilibili-player-video-danmaku-switch input, .bilibili-player-video-danmaku-switch',
    wide: '.bpx-player-ctrl-wide span, .bpx-player-ctrl-wide, .bilibili-player-video-btn-widescreen',
    web: '.bpx-player-ctrl-web span, .bpx-player-ctrl-web, .bilibili-player-video-web-fullscreen',
    fullscreen: '.bpx-player-ctrl-full span, .bpx-player-ctrl-full, .bilibili-player-video-btn-fullscreen',
  };
  const host = document.createElement('div');
  host.id = 'bt-host';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host { all: initial; font: 14px/1.5 system-ui, sans-serif; color: #e9edf5; color-scheme: dark; }
      * { box-sizing: border-box; } [hidden] { display: none !important; }
      button, input { font: inherit; } button { cursor: pointer; }
      button, input[type=text], input[type=number] { border: 1px solid #445064; border-radius: 8px; background: #222b3b; color: #f3f5fa; padding: 7px 10px; }
      button:hover { background: #354158; } :focus-visible { outline: 2px solid #75cfff; outline-offset: 3px; }
      #launcher { position: fixed; right: 20px; bottom: 72px; z-index: 2147483646; box-shadow: 0 3px 15px #0005; }
      dialog { position: fixed; margin: auto; width: min(460px, calc(100vw - 24px)); max-height: min(760px, calc(100dvh - 32px)); padding: 0; border: 1px solid #445064; border-radius: 16px; background: #161d2b; color: #e9edf5; overflow: auto; box-shadow: 0 20px 80px #0009; }
      dialog::backdrop { background: #0008; } header { position: sticky; top: 0; z-index: 1; background: #161d2b; display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #303a4d; }
      h2 { margin: 0; font-size: 19px; } h3 { margin: 0 0 10px; font-size: 14px; color: #89d5ff; }
      section { margin: 0 20px; padding: 15px 0; border-bottom: 1px solid #303a4d; }
      label { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 9px 0; }
      input[type=checkbox] { accent-color: #64c9ff; width: 17px; height: 17px; flex: none; }
      input[type=number] { width: 90px; } input[data-key] { width: 80px; text-align: center; } #rates { width: 100%; }
      .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; } .muted { color: #a3afc4; font-size: 12px; margin: 8px 0; }
      #presets { margin-top: 10px; } #presets button[aria-pressed=true] { background: #12648a; border-color: #64c9ff; }
      footer { padding: 14px 20px; } #error { color: #ffb6b6; } #toast, #time { position: fixed; right: 24px; top: 80px; padding: 8px 14px; border-radius: 8px; background: #111d; color: white; z-index: 2147483647; pointer-events: none; }
      #time { top: 130px; font-variant-numeric: tabular-nums; }
    </style>
    <button id="launcher" aria-haspopup="dialog">B站优化</button>
    <dialog aria-labelledby="title">
      <header><h2 id="title">B站优化</h2><button id="close" aria-label="关闭设置">×</button></header>
      <section><h3>推荐净化</h3>
        <label>隐藏视频侧栏推荐<input type="checkbox" data-setting="hideRecommendations"></label>
        <label>隐藏首页推荐流<input type="checkbox" data-setting="hideHome"></label>
        <p class="muted">随时开关，立即恢复。保留搜索、评论和视频合集。</p>
      </section>
      <section><h3>播放速度</h3>
        <label>启用倍速控制<input type="checkbox" data-setting="speed"></label>
        <label>记住播放速度<input type="checkbox" data-setting="rememberSpeed"></label>
        <div class="row"><label for="rate">当前倍速</label><input id="rate" type="number" min="0.25" max="16" step="0.05"><button id="set-rate">应用</button></div>
        <div id="presets" class="row"></div>
        <label for="rates">预设倍速（逗号分隔，0.25–16）</label><input id="rates" type="text">
        <label>显示按倍速计算的剩余时间<input type="checkbox" data-setting="showTime"></label>
      </section>
      <section><h3>长按加速</h3>
        <label>启用长按（A / S / →）<input type="checkbox" data-setting="hold"></label>
        <label>A 键倍速<input type="number" data-number="holdA" min="0.25" max="16" step="0.25"></label>
        <label>S 键倍速<input type="number" data-number="holdS" min="0.25" max="16" step="0.25"></label>
        <label>右方向键倍速<input type="number" data-number="holdRight" min="0.25" max="16" step="0.25"></label>
        <label>右方向键按当前速度的倍数加速<input type="checkbox" data-setting="rightRelative"></label>
        <p class="muted">→ 短按前进 5 秒，长按 350ms 加速。松手或切走窗口时恢复。</p>
      </section>
      <section><h3>快捷键与显示</h3>
        <label>启用播放器快捷键<input type="checkbox" data-setting="shortcuts"></label>
        <label>数字键临时倍速 / Ctrl + 数字记忆倍速<input type="checkbox" data-setting="numberKeys"></label>
        <div id="keybindings"></div>
        <label>默认宽屏<input type="checkbox" data-setting="defaultWide"></label>
        <label>双击字幕复制<input type="checkbox" data-setting="copySubtitle"></label>
        <p class="muted">点击键位后按字母修改。保留小键盘 7 / 9 / * / + / − / 5。Ctrl + ↑ / ↓ 调速，F2 切换剩余时间。输入文字时快捷键自动避让。</p>
      </section>
      <footer><p id="error" role="status"></p><span class="muted">更改自动保存</span> <button id="reset">恢复默认</button></footer>
    </dialog>
    <div id="toast" role="status" hidden></div><div id="time" hidden></div>`;
  const $ = selector => shadow.querySelector(selector);
  const dialog = $('dialog');
  const cleanStyle = document.createElement('style');
  cleanStyle.id = 'bt-clean-style';
  function toast(message) {
    $('#toast').textContent = message;
    $('#toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 1600);
  }
  function error(message = '') { $('#error').textContent = message; }
  function applyClean() {
    const videoPage = /^\/(video|list|bangumi\/play|cheese\/play|festival)\//.test(location.pathname);
    const css = [
      settings.hideRecommendations && videoPage ? '#reco_list, .rec-list, .recommend-list-v1, .next-play { display: none !important; }' : '',
      settings.hideHome && location.pathname === '/' ? '.recommended-container_floor-aside, .recommended-swipe, .feed2 .bili-feed4-layout { display: none !important; }' : '',
    ].join('\n');
    if (cleanStyle.textContent !== css) cleanStyle.textContent = css;
  }
  function render() {
    shadow.querySelectorAll('[data-setting]').forEach(el => { el.checked = settings[el.dataset.setting]; });
    shadow.querySelectorAll('[data-number]').forEach(el => { el.value = settings[el.dataset.number]; });
    $('#rate').value = media?.playbackRate || settings.rate;
    $('#rates').value = settings.rates.join(', ');
    $('#presets').replaceChildren(...settings.rates.map(rate => {
      const button = document.createElement('button');
      button.textContent = `${rate}×`;
      button.setAttribute('aria-pressed', String(Math.abs((media?.playbackRate || settings.rate) - rate) < 0.001));
      button.addEventListener('click', () => setPermanent(rate));
      return button;
    }));
    shadow.querySelectorAll('[data-key]').forEach(el => { el.value = settings.keys[el.dataset.key].slice(3); });
  }
  for (const [action, title] of Object.entries({ danmaku: '开关弹幕', wide: '宽屏模式', web: '网页全屏', fullscreen: '全屏', subtitle: '开关字幕' })) {
    const label = document.createElement('label');
    label.textContent = title;
    const input = document.createElement('input');
    input.type = 'text'; input.readOnly = true; input.dataset.key = action; input.setAttribute('aria-label', `${title}快捷键`);
    input.addEventListener('keydown', e => {
      if (e.code === 'Tab' || e.code === 'Escape') return;
      e.preventDefault(); e.stopPropagation();
      if (e.ctrlKey || e.altKey || e.metaKey || !/^Key[B-Z]$/.test(e.code) || e.code === 'KeyS') return error('请选择 A、S 以外的字母');
      if (Object.entries(settings.keys).some(([key, value]) => key !== action && value === e.code)) return error('这个键位已被使用');
      settings.keys[action] = e.code; persist(); render(); error();
    });
    label.append(input); $('#keybindings').append(label);
  }
  function openSettings() { endHolds(); render(); error(); if (!dialog.open) dialog.showModal(); }
  $('#launcher').addEventListener('click', openSettings);
  $('#close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if (e.target === dialog && e.offsetX < 0) dialog.close(); });
  shadow.querySelectorAll('[data-setting]').forEach(el => el.addEventListener('change', () => {
    endHolds(); settings[el.dataset.setting] = el.checked;
    if (el.dataset.setting === 'defaultWide') wideApplied = null;
    persist(); applyClean(); updateTime(); applyWide();
  }));
  shadow.querySelectorAll('[data-number]').forEach(el => el.addEventListener('change', () => {
    const value = Number(el.value);
    if (!validRate(value)) { error('倍速需要在 0.25–16 之间'); render(); return; }
    endHolds(); settings[el.dataset.number] = value; persist(); error();
  }));
  $('#rates').addEventListener('change', () => {
    const parts = $('#rates').value.split(/[,，]/).map(s => s.trim());
    const rates = parts.map(Number);
    if (!parts.length || parts.length > 30 || parts.some(s => !s) || !rates.every(validRate)) return error('请输入 1–30 个有效倍速，每项在 0.25–16 之间');
    settings.rates = [...new Set(rates)].sort((a, b) => a - b); persist(); render(); error();
  });
  $('#set-rate').addEventListener('click', () => setPermanent(Number($('#rate').value)));
  $('#reset').addEventListener('click', () => {
    endHolds(); settings = normalize(null); baseRate = 1; persist(); applyClean(); setRate(1); render(); updateTime(); error();
  });
  try { GM_registerMenuCommand('B站优化 · 设置', openSettings); } catch { /* 页面按钮仍然可用 */ }

  function setRate(rate, target = media) {
    if (!target || !validRate(rate)) return false;
    try { target.playbackRate = rate; return Math.abs(target.playbackRate - rate) < 0.001; }
    catch { toast('当前播放器不支持这个倍速'); return false; }
  }
  function setPermanent(rate) {
    if (!settings.speed) return error('请先启用倍速控制');
    if (!validRate(rate)) return error('倍速需要在 0.25–16 之间');
    endHolds();
    if (!media || !setRate(rate)) return error('尚未找到可调速的播放器');
    baseRate = settings.rate = rate; persist(); render(); error(); updateTime(); toast(`${rate}×`);
  }
  function holdRate(code, rate) {
    if (!media || held.has(code)) return;
    if (!held.size) baseRate = media.playbackRate;
    if (setRate(Math.min(16, Math.max(0.25, rate)))) {
      held.set(code, Math.min(16, Math.max(0.25, rate))); toast(`${media.playbackRate}× · 松手恢复`);
    }
  }
  function release(code) {
    if (!held.delete(code)) return false;
    setRate(held.size ? [...held.values()].at(-1) : baseRate);
    updateTime(); return true;
  }
  function endHolds() {
    clearTimeout(rightTimer); rightPending = false;
    if (held.size) { held.clear(); setRate(baseRate); }
  }
  function visible(el) { return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'; }
  function findMedia() {
    const candidates = [...document.querySelectorAll(MEDIA)].filter(el => el.closest(PLAYER + ', #bilibili-player') && visible(el));
    return candidates.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0] || null;
  }
  function applyWide() {
    if (!settings.defaultWide || !player || wideApplied === player) return;
    const button = findControl('wide');
    if (!button) return;
    if (!player.classList.contains('bpx-state-wide') && !player.classList.contains('mode-widescreen') &&
        !button.classList.contains('bpx-state-active') && button.getAttribute('aria-pressed') !== 'true') button.click();
    wideApplied = player;
  }
  function bindMedia() {
    applyClean();
    const candidates = [...document.querySelectorAll(MEDIA)].filter(el => el.closest(PLAYER + ', #bilibili-player'));
    for (const el of watchedMedia) if (!candidates.includes(el)) { resizeObserver.unobserve(el); watchedMedia.delete(el); }
    for (const el of candidates) if (!watchedMedia.has(el)) { resizeObserver.observe(el); watchedMedia.add(el); }
    const next = findMedia();
    const nextPlayer = next?.closest(PLAYER) || next?.closest('#bilibili-player') || null;
    if (next === media && nextPlayer === player) { applyWide(); return; }
    endHolds(); mediaEvents?.abort();
    media = next; player = nextPlayer; wideApplied = null;
    if (!media) { updateTime(); return; }
    mediaEvents = new AbortController();
    const on = (name, fn) => media.addEventListener(name, fn, { signal: mediaEvents.signal });
    const restore = () => {
      endHolds();
      if (settings.speed && settings.rememberSpeed) setRate(settings.rate);
      baseRate = media.playbackRate; updateTime();
    };
    on('loadedmetadata', () => { restore(); wideApplied = null; applyWide(); });
    on('emptied', endHolds);
    on('ratechange', () => {
      if (settings.speed && settings.rememberSpeed && !held.size && validRate(media.playbackRate) && media.readyState > 0) {
        settings.rate = baseRate = media.playbackRate; persist();
      }
      updateTime();
    });
    on('timeupdate', updateTime); on('durationchange', updateTime);
    restore(); applyWide();
  }
  function timeString(seconds) {
    const n = Math.max(0, Math.ceil(seconds));
    return n >= 3600 ? `${Math.floor(n / 3600)}:${String(Math.floor(n / 60) % 60).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}` : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  }
  function updateTime() {
    const show = settings.showTime && media && Number.isFinite(media.duration) && media.playbackRate > 0;
    $('#time').hidden = !show;
    if (show) $('#time').textContent = `剩余 ${timeString((media.duration - media.currentTime) / media.playbackRate)} · ${media.playbackRate}×`;
  }
  function editable(e) {
    return e.composedPath().some(el => el instanceof Element && (el.matches('input, textarea, select, [role="textbox"], bili-comments, bili-comment-thread-renderer') || el.isContentEditable));
  }
  function findControl(action) {
    // querySelector('child, parent') 仍按 DOM 顺序返回 parent，必须显式按优先级查找。
    return controls[action].split(',').map(selector => player?.querySelector(selector.trim())).find(Boolean);
  }
  function clickControl(action) {
    const button = findControl(action);
    if (!button) { toast('当前播放器未提供此控件'); return false; }
    button.click(); return true;
  }
  function subtitle() {
    const off = player?.querySelector('.bpx-player-ctrl-subtitle-close-switch');
    const options = [...(player?.querySelectorAll('.bpx-player-ctrl-subtitle-language-item') || [])];
    if (!off) { toast('当前视频未提供字幕'); return; }
    if (!off.classList.contains('bpx-state-active')) off.click();
    else (options.find(el => /^(zh-Hans|ai-zh)$/.test(el.dataset.lan)) || options[0])?.click();
  }
  function cycle(direction, wrap = false) {
    const current = held.size ? baseRate : media.playbackRate;
    const rates = settings.rates;
    setPermanent(direction > 0 ? rates.find(r => r > current + 0.001) ?? (wrap ? rates[0] : rates.at(-1)) : [...rates].reverse().find(r => r < current - 0.001) ?? rates[0]);
  }
  const stop = e => { e.preventDefault(); e.stopImmediatePropagation(); };
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.isComposing || editable(e) || dialog.open || e.metaKey || e.altKey || e.shiftKey) return;
    if (!media?.isConnected || !visible(media)) bindMedia();
    if (!media) return;
    const code = e.code;
    if (settings.speed && settings.numberKeys && /^Digit[0-9]$/.test(code)) {
      stop(e); if (e.repeat) return;
      const rate = Number(code.slice(-1)) || 0.5;
      if (e.ctrlKey) setPermanent(rate); else holdRate(code, rate);
      return;
    }
    if (settings.speed && e.ctrlKey && ['ArrowUp', 'ArrowDown'].includes(code)) {
      stop(e); if (!e.repeat) cycle(code === 'ArrowUp' ? 1 : -1); return;
    }
    if (e.ctrlKey) return;
    if (settings.speed && settings.hold && ['KeyA', 'KeyS', 'ArrowRight'].includes(code)) {
      stop(e); if (e.repeat) return;
      if (code !== 'ArrowRight') holdRate(code, code === 'KeyA' ? settings.holdA : settings.holdS);
      else if (!rightPending) {
        rightPending = true;
        rightTimer = setTimeout(() => {
          if (rightPending && media?.isConnected) holdRate(code, settings.holdRight * (settings.rightRelative ? media.playbackRate : 1));
        }, 350);
      }
      return;
    }
    if (!settings.shortcuts) return;
    const action = Object.keys(settings.keys).find(k => settings.keys[k] === code) ||
      ({ Numpad7: 'danmaku', Numpad9: 'fullscreen', NumpadMultiply: 'wide', NumpadSubtract: 'web', Numpad5: 'play', NumpadAdd: 'cycle', KeyH: 'wide', F2: 'time' })[code];
    if (!action || (action === 'cycle' && !settings.speed)) return;
    stop(e); if (e.repeat) return;
    if (action === 'subtitle') subtitle();
    else if (action === 'cycle') cycle(1, true);
    else if (action === 'time') { settings.showTime = !settings.showTime; persist(); updateTime(); }
    else if (action === 'play') { if (media.paused) Promise.resolve(media.play()).catch(() => toast('请先点击播放器开始播放')); else media.pause(); }
    else clickControl(action);
  }, true);
  document.addEventListener('keyup', e => {
    // 无论焦点是否移入输入框，都必须释放已经接管的键。
    if (e.code === 'ArrowRight' && rightPending) {
      stop(e); clearTimeout(rightTimer); rightPending = false;
      if (!release(e.code) && media && Number.isFinite(media.duration)) media.currentTime = Math.min(media.duration, media.currentTime + 5);
    } else if (release(e.code)) stop(e);
  }, true);
  window.addEventListener('blur', endHolds);
  window.addEventListener('pagehide', endHolds);
  document.addEventListener('visibilitychange', () => { if (document.hidden) endHolds(); });
  document.addEventListener('focusin', e => { if (editable(e) || e.composedPath().includes(host)) endHolds(); });
  document.addEventListener('dblclick', async e => {
    if (!settings.copySubtitle || !player) return;
    const target = e.target instanceof Element && e.target.closest('.bpx-player-subtitle-panel-major-group');
    if (!target || !player.contains(target)) return;
    const text = target.textContent.replace(/^♪\s*|\s*♪$/g, '').trim();
    if (!text) return;
    try { await navigator.clipboard.writeText(text); toast('字幕已复制'); } catch { toast('无法复制，请检查剪贴板权限'); }
  });
  function mount() {
    if (!host.isConnected) document.documentElement.append(host);
    if (!cleanStyle.isConnected) document.documentElement.append(cleanStyle);
    bindMedia();
  }
  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; mount(); }, 100);
  }
  // 只关注结构变化，字幕文字更新、弹幕和面板内部刷新不会反复全页扫描。
  const relevant = node => node instanceof Element && (node.matches(MEDIA + ', ' + PLAYER + ', #bilibili-player') || node.querySelector(MEDIA + ', ' + PLAYER));
  const watchedMedia = new Set();
  const resizeObserver = new ResizeObserver(schedule);
  const observer = new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(relevant)) || !host.isConnected) schedule();
  });
  function start() {
    render(); mount(); observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
  window.addEventListener('popstate', () => { endHolds(); wideApplied = null; schedule(); });
  window.navigation?.addEventListener('currententrychange', () => { endHolds(); wideApplied = null; schedule(); });
  document.addEventListener('fullscreenchange', () => {
    (document.fullscreenElement || document.documentElement).append(host);
  });
})();
