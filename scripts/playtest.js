// Plays the whole escape in headless Chrome by moving the player and using keys through the game API.
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE ?? 'https://localhost:5173/';

mkdirSync('shots', { recursive: true });
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  acceptInsecureCerts: true,
  args: ['--ignore-certificate-errors', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${BASE}?shot`, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction('window.__maze !== undefined', { timeout: 60000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(1500);

const state = () =>
  page.evaluate(() => {
    const { game, hints } = window.__maze;
    return { stage: game.stage, objective: game.objective(), target: hints.target, finished: game.finished };
  });

console.log('start', await state());

for (let n = 0; n < 3; n++) {
  await page.evaluate((n) => {
    const { layout, player, interactions, world } = window.__maze;
    const m = layout.maze;
    const key = world.keys[n];
    const from = m.center(m.links(key.cell)[0]);
    player.spawn(from.x, from.z, 0);
    interactions.attach(key, 'desktop');
  }, n);
  await wait(300);
  console.log(`took key ${n + 1}`, await state());

  await page.evaluate((n) => {
    const { layout, player, interactions, world } = window.__maze;
    const m = layout.maze;
    const g = world.gates[n];
    const a = m.center(g.edge.a);
    const b = m.center(g.edge.b);
    player.spawn(a.x, a.z, Math.atan2(-(b.x - a.x), -(b.z - a.z)));
    interactions.useOn(g);
  }, n);
  // Software rendering runs at a few frames per second, so advance the gate clock directly.
  const tick = (seconds) =>
    page.evaluate((seconds) => {
      const { world, player, interactions } = window.__maze;
      for (let t = 0; t < seconds; t += 0.05) {
        interactions.update(0.05);
        world.update(0.05, 0, player.head());
      }
    }, seconds);
  await wait(600);
  await tick(2.2);
  await page.screenshot({ path: `shots/gate${n + 1}-opening.png` });
  await tick(3);
  const g = await page.evaluate((n) => {
    const g = window.__maze.world.gates[n];
    return { state: g.state, blocking: g.box.enabled, lift: g.panel.position.y.toFixed(2) };
  }, n);
  console.log(`gate ${n + 1}`, g, await state());
}

await page.evaluate(() => {
  const { player, world } = window.__maze;
  const z = world.exitZone;
  player.spawn(z.minx + 0.3, (z.minz + z.maxz) / 2, -Math.PI / 2);
});
await wait(800);
console.log('at exit', await state());
await page.screenshot({ path: 'shots/finished.png' });

console.log(errors.length ? `errors:\n  ${errors.join('\n  ')}` : 'no page errors');
await browser.close();
