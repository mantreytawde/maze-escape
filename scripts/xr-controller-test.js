// Headset flow with emulated Quest controllers: tutorial text, stick walking and turning, trigger on
// panel buttons, and the A/X menu button in the maze.
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE ?? 'http://localhost:2005/';
const IWER = readFileSync(new URL('../node_modules/iwer/build/iwer.min.js', import.meta.url), 'utf8');

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.evaluateOnNewDocument(`${IWER};
  const d = new IWER.XRDevice(IWER.metaQuest3, { stereoEnabled: false });
  d.installRuntime({ forceInstall: true });
  d.primaryInputMode = 'controller';
  window.__xr = d;`);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`, detail);
};
const state = () =>
  page.evaluate(() => {
    const { tutorial, player, ui, panel } = window.__maze;
    return { mode: window.__maze.mode, step: tutorial.active ? tutorial.index : -1, hands: player.usingHands, stats: { ...player.stats }, hud: ui.vrHud.mesh.visible, panel: panel.visible, text: tutorial.active ? tutorial.step.text : '' };
  });
const ctrl = (side, fn) => page.evaluate(fn, side);

async function triggerOn(panelName, id) {
  for (let i = 0; i < 3; i++) {
    await page.evaluate(
      (panelName, id) => {
        const { panel, player } = window.__maze;
        const p = panelName === 'tutorial' ? window.__maze.tutorial.panel : panel;
        const r = p.rects.find((x) => x.id === id);
        const V = player.rig.position.constructor;
        const Q = player.rig.quaternion.constructor;
        const local = new V(((r.x + r.w / 2) / p.px) * p.width - p.width / 2, p.height / 2 - ((r.y + r.h / 2) / p.py) * p.height, 0);
        const target = player.rig.worldToLocal(p.mesh.localToWorld(local));
        const c = window.__xr.controllers.right;
        c.position.set(0.2, 1.2, -0.3);
        const dir = target.sub(new V(0.2, 1.2, -0.3)).normalize();
        const q = new Q().setFromUnitVectors(new V(0, 0, -1), dir);
        c.quaternion.set(q.x, q.y, q.z, q.w);
      },
      panelName,
      id,
    );
    await wait(500);
  }
  await ctrl('right', (s) => window.__xr.controllers[s].updateButtonValue('trigger', 1));
  await wait(600);
  await ctrl('right', (s) => window.__xr.controllers[s].updateButtonValue('trigger', 0));
  await wait(600);
}

await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction('window.__maze !== undefined', { timeout: 60000 });
await page.waitForFunction('!document.getElementById("enter-vr").disabled', { timeout: 20000 });
await page.click('#enter-vr');
await page.waitForFunction('window.__maze.mode === "tutorial"', { timeout: 30000 });
await wait(1000);

let s = await state();
check('controllers get the controller tutorial', !s.hands && /trigger/.test(s.text), JSON.stringify(s));
await triggerOn('tutorial', 'next');
s = await state();
check('trigger on "Next"', s.step === 1, JSON.stringify(s));

await ctrl('left', (side) => window.__xr.controllers[side].updateAxes('thumbstick', 0, -1));
for (let i = 0; i < 16 && (await state()).step === 1; i++) await wait(500);
await ctrl('left', (side) => window.__xr.controllers[side].updateAxes('thumbstick', 0, 0));
s = await state();
check('left stick walks forward', s.stats.forward > 1.4 && s.step === 2, JSON.stringify(s.stats));

await ctrl('right', (side) => window.__xr.controllers[side].updateAxes('thumbstick', 1, 0));
await wait(800);
await ctrl('right', (side) => window.__xr.controllers[side].updateAxes('thumbstick', 0, 0));
s = await state();
check('right stick snap turns', s.stats.turns >= 1, JSON.stringify(s.stats));

await page.evaluate(() => {
  window.__maze.tutorial.stop();
  window.__maze.tutorial.onFinish();
});
await wait(1500);
s = await state();
check('game runs with the VR HUD', s.mode === 'play' && s.hud, JSON.stringify(s));

await ctrl('right', (side) => window.__xr.controllers[side].updateButtonValue('a-button', 1));
await wait(600);
await ctrl('right', (side) => window.__xr.controllers[side].updateButtonValue('a-button', 0));
await wait(600);
s = await state();
check('A button opens the menu', s.mode === 'menu' && s.panel, JSON.stringify(s));
await triggerOn('menu', 'resume');
s = await state();
check('trigger on "Resume"', s.mode === 'play', JSON.stringify(s));

console.log(errors.length ? `errors:\n  ${errors.join('\n  ')}` : 'no page errors');
console.log(failures ? `${failures} failed` : 'all controller checks ok');
await browser.close();
process.exit(failures ? 1 : 0);
