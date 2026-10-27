// Renders views of the running dev server with headless Chrome and saves screenshots to shots/.
// Usage: node scripts/shoot.js [name=query ...]
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE ?? 'https://localhost:5173/';

const views = process.argv.slice(2).length
  ? process.argv.slice(2).map((a) => {
      const i = a.indexOf('=');
      return [a.slice(0, i), a.slice(i + 1)];
    })
  : [
      ['intro', ''],
      ['start', 'shot'],
    ];

mkdirSync('shots', { recursive: true });
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  acceptInsecureCerts: true,
  args: ['--ignore-certificate-errors', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
});

for (const [name, query] of views) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  const q = query.replaceAll(';', '&');
  await page.goto(`${BASE}?${q}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('window.__maze !== undefined', { timeout: 60000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 3500));
  await page.screenshot({ path: `shots/${name}.png` });
  console.log(`${name}: saved${errors.length ? `\n  ${errors.join('\n  ')}` : ''}`);
  await page.close();
}
await browser.close();
