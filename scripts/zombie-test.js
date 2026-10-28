// Walks into a dark branch in headless Chrome and steps the zombie through reveal, chase, catch and respawn.
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE ?? 'http://localhost:2005/';

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

await page.goto(`${BASE}?shot`, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction('window.__maze !== undefined', { timeout: 60000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(1500);

// Stand two cells into the first dark branch off the lit route, looking deeper into it.
const setup = await page.evaluate(() => {
  const { layout, player, hints, audio, zombie } = window.__maze;
  audio.init();
  zombie.step = zombie.update.bind(zombie);
  zombie.update = () => {};
  const m = layout.maze;
  for (const c of hints.path) {
    for (const n of m.links(c)) {
      if (hints.onRoute(n)) continue;
      const deeper = m.links(n).find((x) => x !== c);
      if (deeper === undefined || hints.isSafe(deeper)) continue;
      const p = m.center(deeper);
      const q = m.center(n);
      player.spawn(p.x, p.z, Math.atan2((q.x - p.x), (q.z - p.z)));
      return { junction: c, offRoute: n, deeper, audio: audio.ready };
    }
  }
  return null;
});
console.log('dark branch', setup);

// The animation loop runs slowly in software rendering, so step the zombie by hand.
const step = (seconds, walkToZombie = false) =>
  page.evaluate(
    (seconds, walkToZombie) => {
      const { player, zombie, layout } = window.__maze;
      for (let t = 0; t < seconds; t += 1 / 30) {
        player.update(1 / 30);
        const head = player.head();
        zombie.step(1 / 30, head, layout.maze.cellAt(head.x, head.z));
        if (walkToZombie && zombie.state === 'chase') {
          const z = zombie.root.position;
          player.rig.position.x += (z.x - head.x) * 0.02;
          player.rig.position.z += (z.z - head.z) * 0.02;
        }
      }
      const z = zombie.root.position;
      const h = player.head();
      return {
        state: zombie.state,
        visible: zombie.root.visible,
        distance: Math.hypot(z.x - h.x, z.z - h.z).toFixed(2),
        frozen: player.frozen,
        fade: player.fade.toFixed(2),
        catches: zombie.catches,
        lives: window.__maze.game.lives,
        playerCell: layout.maze.cellAt(h.x, h.z),
      };
    },
    seconds,
    walkToZombie,
  );

console.log('after 0.3 s in the dark', await step(0.3));
const holdLight = (intensity) =>
  page.evaluate((intensity) => {
    const { zombie } = window.__maze;
    zombie.root.visible = true;
    zombie.light.intensity = intensity;
  }, intensity);
await holdLight(4);
await wait(1800);
await page.screenshot({ path: 'shots/zombie-reveal.png' });
console.log('after reveal', await step(0.8));
console.log('chasing', await step(0.6));
await holdLight(3);
await wait(1800);
await page.screenshot({ path: 'shots/zombie-chase.png' });

let s;
for (let i = 0; i < 20; i++) {
  s = await step(0.25, true);
  if (s.state === 'caught') break;
}
console.log('caught?', s);
await step(0.12);
await holdLight(1.1);
await wait(1500);
await page.screenshot({ path: 'shots/zombie-jumpscare.png' });
console.log('after jumpscare', await step(1.6));
const lit = await page.evaluate(() => {
  const { player, hints, layout } = window.__maze;
  const h = player.head();
  return hints.onRoute(layout.maze.cellAt(h.x, h.z));
});
console.log('respawned on the route:', lit);
await wait(1500);
await page.screenshot({ path: 'shots/zombie-respawn.png' });

console.log(errors.length ? `errors:\n  ${errors.join('\n  ')}` : 'no page errors');
await browser.close();
