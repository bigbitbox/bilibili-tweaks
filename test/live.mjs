import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { script } from './helpers.mjs';
mkdirSync('test-results', { recursive: true });
const browser = await chromium.launch({ headless: process.env.HEADED !== '1', ...(process.env.BROWSER_PROXY ? { proxy: {server: process.env.BROWSER_PROXY} } : {}) });
const context = await browser.newContext({ viewport: {width:1440,height:1000} });
const page = await context.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
try {
  await page.addInitScript(() => {
    window.GM_getValue=()=>JSON.parse(localStorage.getItem('bt-live')||'null');
    window.GM_setValue=(_,v)=>localStorage.setItem('bt-live',JSON.stringify(v));
    window.GM_registerMenuCommand=()=>{};
  });
  await page.goto('https://www.bilibili.com/', { waitUntil:'domcontentloaded', timeout:60000 });
  await page.waitForTimeout(5000);
  await page.addScriptTag({content:script});
  const videoLink = process.env.VIDEO_URL || await page.locator('a[href*="/video/BV"]').first().getAttribute('href');
  const home = await page.evaluate(()=>({title:document.title, recommendations:document.querySelectorAll('.recommended-container_floor-aside, .recommended-swipe, .feed2 .bili-feed4-layout').length}));
  console.log(JSON.stringify({home,videoLink}));
  if (!videoLink) throw new Error('首页没有可用视频链接');
  await page.goto(new URL(videoLink,'https://www.bilibili.com/').href,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('video, bwp-video', {timeout:45000});
  await page.waitForTimeout(5000);
  const before = await page.evaluate(()=>({title:document.title,url:location.href,media:[...document.querySelectorAll('video,bwp-video')].map(el=>({tag:el.tagName,ready:el.readyState,width:el.clientWidth,height:el.clientHeight,rate:el.playbackRate,duration:el.duration,paused:el.paused,ancestors:[el.parentElement?.className,el.parentElement?.parentElement?.className]})),controls:[...document.querySelectorAll('[class*="bpx-player-ctrl-"], .bpx-player-dm-switch')].map(el=>({tag:el.tagName,cls:el.className})).filter(x=>!/svg|path/i.test(x.tag)),recommendations:document.querySelectorAll('#reco_list,.rec-list,.recommend-list-v1,.next-play').length}));
  await page.addScriptTag({content:script});
  await page.getByRole('button',{name:'B站优化',exact:true}).click();
  await page.locator('#rate').fill('1.75'); await page.locator('#set-rate').click();
  const applied=await page.locator('video,bwp-video').first().evaluate(el=>el.playbackRate);
  await page.screenshot({path:'test-results/live-settings.png'});
  await page.getByRole('button',{name:'关闭设置'}).click();
  await page.locator('body').click({position:{x:2,y:2}});
  await page.keyboard.down('a');
  const held=await page.locator('video,bwp-video').first().evaluate(el=>el.playbackRate);
  await page.keyboard.up('a');
  const restored=await page.locator('video,bwp-video').first().evaluate(el=>el.playbackRate);
  const result={before,applied,held,restored,errors};
  writeFileSync('test-results/live.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
  await page.screenshot({path:'test-results/live-video.png'});
  if (applied!==1.75 || held!==3 || restored!==1.75) throw new Error('实站倍速验证失败');
} catch(e) {
  await page.screenshot({path:'test-results/live-failure.png'}).catch(()=>{});
  writeFileSync('test-results/live-failure.json',JSON.stringify({url:page.url(),error:String(e),body:(await page.locator('body').innerText().catch(()=>'' )).slice(0,2000),errors},null,2));
  throw e;
} finally {await browser.close();}
