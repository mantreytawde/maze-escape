// Runs the headset flow in headless Chrome with Meta's WebXR emulator (IWER) and tracked hands:
// the tutorial done with real hand gestures, panel buttons pressed by aiming and pinching, then the
// game with the VR HUD, a question answered by pinch, and the menu gesture.
import { mkdirSync, readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE ?? 'http://localhost:2005/';
const IWER = readFileSync(new URL('../node_modules/iwer/build/iwer.min.js', import.meta.url), 'utf8');

mkdirSync('shots', { recursive: true });
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
  d.primaryInputMode = 'hand';
  window.__xr = d;`);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`, detail);
};

await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction('window.__maze !== undefined', { timeout: 60000 });
await page.waitForFunction('!document.getElementById("enter-vr").disabled', { timeout: 20000 });
await page.click('#enter-vr');
await page.waitForFunction('window.__maze.mode === "tutorial"', { timeout: 30000 });

const state = () =>
  page.evaluate(() => {
    const { tutorial, player, ui, panel } = window.__maze;
    return {
      mode: window.__maze.mode,
      step: tutorial.active ? tutorial.index : -1,
      done: tutorial.done,
      stats: { ...player.stats },
      hands: player.usingHands,
      hud: ui.vrHud.mesh.visible,
      panel: panel.visible,
    };
  });

// Places an emulated hand (headset-relative, metres) pointing along `dir`, in a pose, with a pinch value.
const hand = (side, pos, dir = [0, 0, -1], pose = 'open', pinch = 0) =>
  page.evaluate(
    (side, pos, dir, pose, pinch) => {
      const h = window.__xr.hands[side];
      const Q = window.__maze.player.rig.quaternion.constructor;
      const V = window.__maze.player.rig.position.constructor;
      const q = new Q().setFromUnitVectors(new V(0, 0, -1), new V(...dir).normalize());
      h.position.set(...pos);
      h.quaternion.set(q.x, q.y, q.z, q.w);
      if (h.poseId !== pose) h.poseId = pose;
      h.setPinchValueImmediate(pinch);
    },
    side,
    pos,
    dir,
    pose,
    pinch,
  );
const rest = async () => {
  await hand('left', [-0.22, 0.85, 0.05], [0, -1, 0]);
  await hand('right', [0.22, 0.85, 0.05], [0, -1, 0]);
};

// Aim the right hand's ray at a button on a panel and pinch it.
async function press(panelName, id) {
  const aim = () =>
    page.evaluate(
      (panelName, id) => {
        const { panel, tutorialPanel, player } = window.__maze;
        const p = panelName === 'tutorial' ? window.__maze.tutorial.panel : panel;
        const r = p.rects.find((x) => x.id === id);
        if (!r) return { error: `no button ${id}`, buttons: p.rects.map((x) => x.id) };
        const V = player.rig.position.constructor;
        const local = new V((r.x + r.w / 2) / p.px * p.width - p.width / 2, p.height / 2 - (r.y + r.h / 2) / p.py * p.height, 0);
        const world = p.mesh.localToWorld(local);
        const target = player.rig.worldToLocal(world.clone());
        const c = player.hand('right');
        const from = player.rig.worldToLocal(c.ctrl.getWorldPosition(new V()));
        return { dir: [target.x - from.x, target.y - from.y, target.z - from.z], hover: p.hover };
      },
      panelName,
      id,
    );
  await hand('right', [0.2, 1.25, -0.25]);
  await wait(400);
  for (let i = 0; i < 3; i++) {
    const a = await aim();
    if (a.error) return a;
    await hand('right', [0.2, 1.25, -0.25], a.dir);
    await wait(500);
  }
  const before = await page.evaluate((n) => (n === 'tutorial' ? window.__maze.tutorial.panel : window.__maze.panel).hover, panelName);
  const a = await aim();
  await hand('right', [0.2, 1.25, -0.25], a.dir, 'pinch', 1);
  await wait(700);
  await hand('right', [0.2, 1.25, -0.25], a.dir, 'open', 0);
  await wait(500);
  await rest();
  await wait(300);
  return { hovered: before };
}

const settle = async (ms) => {
  await rest();
  await wait(ms);
};

let s = await state();
check('VR session starts in the tutorial with hand text', s.mode === 'tutorial' && s.hands, JSON.stringify(s));
await page.screenshot({ path: 'shots/xr-tutorial-start.png' });

await settle(1500);
const still = await state();
check('hands resting at your sides do not move you', still.stats.forward < 0.05 && still.stats.back < 0.05 && still.stats.turns === 0, JSON.stringify(still.stats));

let r = await press('tutorial', 'next');
s = await state();
check('pinch on "Next" goes to step 2 (walk forward)', s.step === 1, JSON.stringify({ r, s }));

await hand('right', [0.15, 1.38, -0.58]);
for (let i = 0; i < 16 && (await state()).step === 1; i++) await wait(500);
s = await state();
check('open hand held forward walks forward', s.stats.forward > 1.4 && s.step === 2, JSON.stringify(s.stats));
await page.screenshot({ path: 'shots/xr-walk.png' });

await settle(300);
await hand('right', [0.2, 1.38, 0.02], [0, 1, -0.2]);
for (let i = 0; i < 16 && (await state()).step === 2; i++) await wait(500);
s = await state();
check('hand pulled back by the shoulder walks back', s.stats.back > 0.5 && s.step === 3, JSON.stringify(s.stats));

await settle(300);
await hand('right', [0.68, 1.35, -0.05], [1, 0, 0]);
for (let i = 0; i < 6 && (await state()).stats.turns < 1; i++) await wait(500);
await settle(0);
for (let i = 0; i < 10 && (await state()).step === 3; i++) await wait(500);
s = await state();
check('arm out to the side turns', s.stats.turns >= 1 && s.step === 4, JSON.stringify(s.stats));

await settle(300);
await hand('right', [0.2, 1.25, -0.3], [0.1, -0.6, -1]);
await wait(400);
await hand('right', [0.2, 1.25, -0.3], [0.1, -0.6, -1], 'pinch', 1);
await wait(1500);
await page.screenshot({ path: 'shots/xr-teleport-aim.png' });
await hand('right', [0.2, 1.25, -0.3], [0.1, -0.6, -1], 'open', 0);
for (let i = 0; i < 10 && (await state()).step === 4; i++) await wait(500);
s = await state();
check('right pinch, aim and release teleports', s.stats.teleports >= 1 && s.step === 5, JSON.stringify(s.stats));

await settle(300);
r = await press('tutorial', 'next');
s = await state();
check('"Next" past keys and gates', s.step === 6, JSON.stringify({ r, s }));

const right = await page.evaluate(() => `opt${window.__maze.tutorial.step.quiz.answer}`);
r = await press('tutorial', 'opt0');
s = await state();
check('wrong practice answer keeps the question up', s.step === 6 && !s.done, JSON.stringify(s));
r = await press('tutorial', right);
s = await state();
check('right practice answer by pinch', s.done, JSON.stringify({ r, s }));
await wait(2000);
await press('tutorial', 'next');
s = await state();
check('reached the menu step', s.step === 8, JSON.stringify(s));

// Find a left-hand orientation the classifier reads as palm-to-face, then pinch it.
const palm = await page.evaluate(async () => {
  const { player } = window.__maze;
  const h = window.__xr.hands.left;
  const Q = player.rig.quaternion.constructor;
  const E = player.rig.rotation.constructor;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  h.position.set(-0.05, 1.45, -0.3);
  h.poseId = 'open';
  for (const x of [0, 1, 2, 3]) {
    for (const y of [0, 1, 2, 3]) {
      for (const z of [0, 1, 2, 3]) {
        const q = new Q().setFromEuler(new E((x * Math.PI) / 2, (y * Math.PI) / 2, (z * Math.PI) / 2));
        h.quaternion.set(q.x, q.y, q.z, q.w);
        await sleep(120);
        const c = player.hand('left');
        if (c?.gesture.palmToFace) return [x, y, z];
      }
    }
  }
  return null;
});
check('left palm toward the face is recognised', !!palm, JSON.stringify(palm));
if (palm) {
  await page.evaluate(() => window.__xr.hands.left.setPinchValueImmediate(1));
  await wait(800);
  await page.evaluate(() => window.__xr.hands.left.setPinchValueImmediate(0));
}
await settle(500);
for (let i = 0; i < 20 && (await state()).step === 8; i++) await wait(500);
s = await state();
check('menu gesture completes the menu step', s.step === 9, JSON.stringify(s));
await page.screenshot({ path: 'shots/xr-tutorial-end.png' });

r = await press('tutorial', 'start');
await wait(1500);
s = await state();
check('"Start game" starts the game with the VR HUD', s.mode === 'play' && s.hud, JSON.stringify({ r, s }));
await page.screenshot({ path: 'shots/xr-play.png' });

await page.evaluate(() => (window.__maze.quiz.timer = 0));
await page.waitForFunction('window.__maze.mode === "quiz"', { timeout: 15000 });
await wait(800);
await page.screenshot({ path: 'shots/xr-quiz.png' });
const answer = await page.evaluate(() => `opt${window.__maze.quiz.current.correct}`);
r = await press('menu', answer);
await wait(800);
s = await state();
const arrows = await page.evaluate(() => window.__maze.hints.arrowsOn);
check('question answered by pinch turns the arrows on', s.mode === 'play' && arrows, JSON.stringify({ r, s, arrows }));

if (palm) {
  await page.evaluate(
    ([x, y, z]) => {
      const { player } = window.__maze;
      const h = window.__xr.hands.left;
      const q = new player.rig.quaternion.constructor().setFromEuler(new player.rig.rotation.constructor((x * Math.PI) / 2, (y * Math.PI) / 2, (z * Math.PI) / 2));
      h.position.set(-0.05, 1.45, -0.3);
      h.quaternion.set(q.x, q.y, q.z, q.w);
    },
    palm,
  );
  await wait(500);
  await page.evaluate(() => window.__xr.hands.left.setPinchValueImmediate(1));
  await wait(800);
  await page.evaluate(() => window.__xr.hands.left.setPinchValueImmediate(0));
  await settle(800);
  s = await state();
  check('menu gesture opens the pause menu in the maze', s.mode === 'menu' && s.panel, JSON.stringify(s));
  await page.screenshot({ path: 'shots/xr-menu.png' });
  r = await press('menu', 'resume');
  s = await state();
  check('"Resume" closes the menu', s.mode === 'play', JSON.stringify({ r, s }));
}

console.log(errors.length ? `errors:\n  ${errors.join('\n  ')}` : 'no page errors');
console.log(failures ? `${failures} failed` : 'all headset checks ok');
await browser.close();
process.exit(failures ? 1 : 0);
