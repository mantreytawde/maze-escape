// Opens every screen and state through the debug URL flags, screenshots each, and reports page errors.
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE ?? 'http://localhost:2005/';
const only = process.argv[2];

mkdirSync('shots', { recursive: true });
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  acceptInsecureCerts: true,
  args: ['--ignore-certificate-errors', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const cases = [
  ['home', ''],
  ['howto', '', () => document.getElementById('show-howto').click()],
  ['tut-forward', '?tut=1'],
  ['tut-turn', '?tut=3'],
  ['tut-teleport', '?tut=4'],
  ['tut-quiz', '?tut=6'],
  ['tut-menu', '?tut=8'],
  ['play', '?shot&calm'],
  ['quiz', '?shot&calm&quiz'],
  ['danger', '?shot&calm&danger=0'],
  [
    'danger-active',
    '?shot&calm&danger=0',
    () => {
      const { hazards, player, layout } = window.__maze;
      const z = hazards.zones[0];
      const a = layout.maze.center(z.cells[0]);
      const b = layout.maze.center(z.cells[1]);
      player.spawn(a.x, a.z, Math.atan2(-(b.x - a.x), -(b.z - a.z)));
    },
  ],
  ['arrows', '?shot&calm&at=approach&arrows'],
  ['over', '?shot&calm&over'],
  ['won', '?shot&calm&won'],
  [
    'vr-hud',
    '?shot&calm&arrows',
    () => {
      const { ui, game } = window.__maze;
      ui.showHud(false);
      ui.showVrHud(true);
      game.world.keys[0].state = 'collected';
      ui.drawVrHud({ time: 83, lives: 2, keys: game.keySlots(), objective: game.objective(), status: 'Arrows showing: 14 s', statusColor: '#8ef08e', danger: null, prompt: '' });
      ui.toast('Key I collected', '#f2c14e', 60);
      ui.vrToast.mesh.visible = true;
    },
  ],
  [
    'vr-menu',
    '?shot&calm',
    () => {
      const { panel, player } = window.__maze;
      panel.show({
        title: 'Paused',
        titleSize: 56,
        layout: 'column',
        buttonHeight: 74,
        buttons: [
          { id: 'resume', label: 'Resume', color: '#7fe08a' },
          { id: 'restart', label: 'Restart' },
          { id: 'home', label: 'Exit to home' },
          { id: 'comfort', label: 'Comfort tunnel: on' },
          { id: 'exitvr', label: 'Exit VR' },
        ],
      });
      panel.setHover('restart');
      panel.placeInFront(player.head(), player.headYaw(), 1.2, -0.05);
    },
  ],
];

for (const [name, query, setup] of cases) {
  if (only && !name.includes(only)) continue;
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}${query}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('window.__maze !== undefined', { timeout: 60000 });
  await wait(1200);
  if (setup) await page.evaluate(setup);
  await wait(name.startsWith('tut') || name === 'won' ? 2500 : 1200);
  const info = await page.evaluate(() => ({ mode: window.__maze.mode, lives: window.__maze.game.lives }));
  await page.screenshot({ path: `shots/smoke-${name}.png` });
  console.log(name.padEnd(14), JSON.stringify(info), errors.length ? `ERRORS: ${errors.join(' | ')}` : 'ok');
  await page.close();
}
await browser.close();
