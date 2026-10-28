import * as THREE from 'three';
import { makeRng } from './maze.js';

const smooth = (t) => t * t * (3 - 2 * t);
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

function valueNoise(size, cellsX, cellsY, rand) {
  const lattice = new Float32Array(cellsX * cellsY);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand();

  const x0 = new Int32Array(size);
  const x1 = new Int32Array(size);
  const tx = new Float32Array(size);
  for (let x = 0; x < size; x++) {
    const f = (x / size) * cellsX;
    const i = Math.floor(f);
    tx[x] = smooth(f - i);
    x0[x] = i % cellsX;
    x1[x] = (i + 1) % cellsX;
  }

  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const f = (y / size) * cellsY;
    const i = Math.floor(f);
    const ty = smooth(f - i);
    const r0 = (i % cellsY) * cellsX;
    const r1 = ((i + 1) % cellsY) * cellsX;
    const row = y * size;
    for (let x = 0; x < size; x++) {
      const a = lattice[r0 + x0[x]];
      const b = lattice[r0 + x1[x]];
      const c = lattice[r1 + x0[x]];
      const d = lattice[r1 + x1[x]];
      const top = a + (b - a) * tx[x];
      const bot = c + (d - c) * tx[x];
      out[row + x] = top + (bot - top) * ty;
    }
  }
  return out;
}

function fbm(size, cellsX, cellsY, octaves, rand, gain = 0.5) {
  const out = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const n = valueNoise(size, Math.min(size, cellsX << o), Math.min(size, cellsY << o), rand);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    total += amp;
    amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function normalFromHeight(height, size, strength) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const up = ((y + 1) % size) * size;
    const dn = ((y - 1 + size) % size) * size;
    const row = y * size;
    for (let x = 0; x < size; x++) {
      const l = height[row + ((x - 1 + size) % size)];
      const r = height[row + ((x + 1) % size)];
      const d = height[dn + x];
      const u = height[up + x];
      let nx = (l - r) * strength;
      let ny = (d - u) * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const o = (row + x) * 4;
      data[o] = (nx * 0.5 + 0.5) * 255;
      data[o + 1] = (ny * 0.5 + 0.5) * 255;
      data[o + 2] = (nz * 0.5 + 0.5) * 255;
      data[o + 3] = 255;
    }
  }
  return data;
}

function dataTexture(data, size, srgb) {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function packSet(size, color, rough, height, normalStrength) {
  const colorData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const o = i * 4;
    colorData[o] = clamp01(color[i * 3]) * 255;
    colorData[o + 1] = clamp01(color[i * 3 + 1]) * 255;
    colorData[o + 2] = clamp01(color[i * 3 + 2]) * 255;
    colorData[o + 3] = 255;
    const r = clamp01(rough[i]) * 255;
    roughData[o] = r;
    roughData[o + 1] = r;
    roughData[o + 2] = r;
    roughData[o + 3] = 255;
  }
  return {
    map: dataTexture(colorData, size, true),
    roughnessMap: dataTexture(roughData, size, false),
    normalMap: dataTexture(normalFromHeight(height, size, normalStrength), size, false),
  };
}

// Wall textures span exactly one 3 m wall height (v) and 3 m of length (u).
export function makeWallTextures(size = 1024, seed = 11) {
  const rand = makeRng(seed);
  const broad = fbm(size, 4, 4, 4, rand);
  const fine = fbm(size, 48, 48, 3, rand);
  const pores = valueNoise(size, 340, 340, rand);
  const micro = valueNoise(size, 220, 220, rand);
  const streak = fbm(size, 40, 2, 3, rand);
  const blotch = fbm(size, 3, 3, 3, rand);
  const chips = fbm(size, 36, 36, 3, rand);
  const scuff = fbm(size, 4, 90, 2, rand);

  const color = new Float32Array(size * size * 3);
  const rough = new Float32Array(size * size);
  const height = new Float32Array(size * size);

  const tieU = [0.375, 1.125, 1.875, 2.625];
  const tieV = [0.6, 1.8, 2.7];

  for (let y = 0; y < size; y++) {
    const vm = (y / size) * 3;
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const um = (x / size) * 3;

      let g = 0.6 + (broad[i] - 0.5) * 0.2 + (fine[i] - 0.5) * 0.1;
      let h = 0.5 + (micro[i] - 0.5) * 0.3 + (fine[i] - 0.5) * 0.1;
      let r = 0.9 - (fine[i] - 0.5) * 0.12;

      if (pores[i] > 0.9) {
        g -= 0.03;
        h -= 0.12;
      }

      const stain = smoothstep(0.57, 0.86, streak[i]) * smoothstep(0.6, 3, vm) * (0.5 + blotch[i]);
      g -= stain * 0.13;
      r -= stain * 0.1;

      const damp = smoothstep(0.62, 0.78, blotch[i]) * (1 - smoothstep(0.9, 1.8, vm));
      g -= damp * 0.08;

      const seamV = Math.min(Math.abs(vm - 1.2), Math.abs(vm - 2.4));
      const seamU = Math.min(um, 3 - um, Math.abs(um - 1.5));
      const seam = 1 - smoothstep(0.002, 0.007, Math.min(seamV, seamU));
      g -= seam * 0.13;
      h -= seam * 0.6;

      for (const tu of tieU) {
        for (const tv of tieV) {
          const d = Math.hypot(um - tu, vm - tv);
          if (d < 0.02) {
            const hole = 1 - smoothstep(0.008, 0.012, d);
            const rim = smoothstep(0.012, 0.016, d) * (1 - smoothstep(0.016, 0.02, d));
            g -= hole * 0.28 - rim * 0.03;
            h -= hole * 0.8;
          }
        }
      }

      let cr = g * 1.0;
      let cg = g * 0.985;
      let cb = g * 0.955;

      const bandTop = 0.9;
      const chipped = chips[i] > 0.74 || (vm > bandTop - 0.03 && chips[i] > 0.64);
      if (vm < bandTop && !chipped) {
        const p = 0.36 + (fine[i] - 0.5) * 0.04 + (broad[i] - 0.5) * 0.03;
        const scratch = smoothstep(0.72, 0.85, scuff[i]) * 0.06;
        cr = p * 0.92 + scratch;
        cg = p * 1.05 + scratch;
        cb = p * 0.98 + scratch;
        r = 0.55 + (fine[i] - 0.5) * 0.12 - scratch;
        h += 0.08;
      }

      const grime = 1 - smoothstep(0, 0.14, vm);
      const top = smoothstep(2.82, 3, vm);
      const shade = 1 - grime * 0.3 - top * 0.18;
      color[i * 3] = cr * shade;
      color[i * 3 + 1] = cg * shade;
      color[i * 3 + 2] = cb * shade;
      rough[i] = r;
      height[i] = h;
    }
  }
  return packSet(size, color, rough, height, 5);
}

// Floor textures span one 3 m cell, with saw-cut joints along the cell edges.
export function makeFloorTextures(size = 1024, seed = 23) {
  const rand = makeRng(seed);
  const broad = fbm(size, 3, 3, 4, rand);
  const fine = fbm(size, 64, 64, 3, rand);
  const speck = valueNoise(size, 300, 300, rand);
  const stains = fbm(size, 2, 2, 4, rand);
  const wear = fbm(size, 6, 6, 3, rand);
  const cracks = fbm(size, 10, 10, 5, rand);

  const color = new Float32Array(size * size * 3);
  const rough = new Float32Array(size * size);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    const vm = (y / size) * 3;
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const um = (x / size) * 3;

      let g = 0.44 + (broad[i] - 0.5) * 0.18 + (fine[i] - 0.5) * 0.07;
      let r = 0.6 + (fine[i] - 0.5) * 0.18 + (wear[i] - 0.5) * 0.25;
      let h = 0.5 + (fine[i] - 0.5) * 0.3;

      if (speck[i] > 0.84) {
        g += 0.06;
        h += 0.15;
      } else if (speck[i] < 0.12) {
        g -= 0.06;
        h -= 0.15;
      }

      const oil = smoothstep(0.6, 0.72, stains[i]);
      g -= oil * 0.1;
      r -= oil * 0.22;

      const crack = 1 - smoothstep(0.0, 0.004, Math.abs(cracks[i] - 0.5));
      const crackMask = smoothstep(0.62, 0.75, broad[i]);
      g -= crack * crackMask * 0.07;
      h -= crack * crackMask * 0.3;

      const joint = 1 - smoothstep(0.003, 0.008, Math.min(um, 3 - um, vm, 3 - vm));
      g -= joint * 0.18;
      h -= joint * 0.7;

      color[i * 3] = g * 1.0;
      color[i * 3 + 1] = g * 0.99;
      color[i * 3 + 2] = g * 0.97;
      rough[i] = r;
      height[i] = h;
    }
  }
  return packSet(size, color, rough, height, 4);
}

export function makeCeilingTextures(size = 512, seed = 37) {
  const rand = makeRng(seed);
  const broad = fbm(size, 4, 4, 4, rand);
  const fine = fbm(size, 40, 40, 3, rand);
  const color = new Float32Array(size * size * 3);
  const rough = new Float32Array(size * size);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const vm = (y / size) * 3;
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      let g = 0.36 + (broad[i] - 0.5) * 0.07 + (fine[i] - 0.5) * 0.05;
      const board = 1 - smoothstep(0.003, 0.01, Math.min(vm % 0.6, 0.6 - (vm % 0.6)));
      g -= board * 0.08;
      color[i * 3] = g;
      color[i * 3 + 1] = g * 0.98;
      color[i * 3 + 2] = g * 0.96;
      rough[i] = 0.95;
      height[i] = 0.5 + (fine[i] - 0.5) * 0.12 - board * 0.4;
    }
  }
  return packSet(size, color, rough, height, 3);
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function canvasTexture(c, srgb = true) {
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function gauss(rand) {
  return (rand() + rand() + rand() - 1.5) * 1.15;
}

function sprayStroke(ctx, rand, x0, y0, x1, y1, width, rgb) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  ctx.save();
  ctx.strokeStyle = `rgba(${rgb},0.88)`;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.shadowColor = `rgba(${rgb},0.9)`;
  ctx.shadowBlur = width * 0.6;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.restore();

  const steps = Math.ceil(len / 1.2);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const px = x0 + (x1 - x0) * t;
    const py = y0 + (y1 - y0) * t;
    for (let k = 0; k < 7; k++) {
      const ox = gauss(rand) * width * 0.9;
      const oy = gauss(rand) * width * 0.9;
      ctx.fillStyle = `rgba(${rgb},${0.05 + rand() * 0.18})`;
      ctx.beginPath();
      ctx.arc(px + ox, py + oy, 0.6 + rand() * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function weather(ctx, rand, w, h, count) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.2 + rand() * 0.6})`;
    ctx.beginPath();
    ctx.arc(rand() * w, rand() * h, 0.5 + rand() * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

const PAINT = '226,152,40';
const BLOOD_RED = '168,20,16';

function drip(ctx, rand, x, y, rgb, maxLen) {
  const len = 14 + rand() * maxLen;
  const w = 3 + rand() * 4;
  const g = ctx.createLinearGradient(0, y, 0, y + len);
  g.addColorStop(0, `rgba(${rgb},0.85)`);
  g.addColorStop(1, `rgba(${rgb},0.55)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - w / 2, y, w, len);
  ctx.beginPath();
  ctx.arc(x, y + len, w * 0.75, 0, Math.PI * 2);
  ctx.fill();
}

// dir is how the arrow reads to someone facing the painted surface: 'left', 'right' or 'up'.
export function makePaintArrowTexture(dir, { drips = true, rgb = PAINT, seed = 5 } = {}) {
  const rand = makeRng(seed + dir.length);
  const [c, ctx] = canvas(512, 512);
  const w = 46;
  if (dir === 'up') {
    sprayStroke(ctx, rand, 256, 450, 256, 110, w, rgb);
    sprayStroke(ctx, rand, 256, 80, 140, 210, w, rgb);
    sprayStroke(ctx, rand, 256, 80, 372, 210, w, rgb);
    if (drips) {
      for (const x of [130, 150, 362, 380]) if (rand() < 0.8) drip(ctx, rand, x, 220, rgb, 40);
      for (let i = 0; i < 3; i++) drip(ctx, rand, 244 + rand() * 24, 460, rgb, 30);
    }
  } else {
    const s = dir === 'right' ? 1 : -1;
    const tip = 256 + s * 190;
    sprayStroke(ctx, rand, 256 - s * 190, 256, tip - s * 30, 256, w, rgb);
    sprayStroke(ctx, rand, tip, 256, tip - s * 130, 140, w, rgb);
    sprayStroke(ctx, rand, tip, 256, tip - s * 130, 372, w, rgb);
    if (drips) {
      for (let i = 0; i < 6; i++) drip(ctx, rand, 256 + (rand() - 0.5) * 340, 272, rgb, 70);
      drip(ctx, rand, tip - s * 128, 384, rgb, 40);
    }
  }
  weather(ctx, rand, 512, 512, 1600);
  return canvasTexture(c);
}

export function makeXTexture({ drips = true, seed = 21 } = {}) {
  const rand = makeRng(seed);
  const [c, ctx] = canvas(512, 512);
  sprayStroke(ctx, rand, 90, 80, 420, 420, 50, BLOOD_RED);
  sprayStroke(ctx, rand, 425, 86, 96, 416, 50, BLOOD_RED);
  if (drips) {
    for (const x of [100, 120, 400, 420, 250, 270]) if (rand() < 0.85) drip(ctx, rand, x, x > 200 && x < 300 ? 270 : 420, BLOOD_RED, 60);
  }
  weather(ctx, rand, 512, 512, 1400);
  return canvasTexture(c);
}

export function makeHaloTexture() {
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,236,205,1)');
  g.addColorStop(0.18, 'rgba(255,214,160,0.55)');
  g.addColorStop(0.5, 'rgba(255,190,120,0.12)');
  g.addColorStop(1, 'rgba(255,180,110,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return canvasTexture(c);
}

export function makePuddleTexture(seed = 13) {
  const rand = makeRng(seed);
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 256, 256);
  ctx.filter = 'blur(10px)';
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.ellipse(
      128 + gauss(rand) * 28,
      128 + gauss(rand) * 20,
      26 + rand() * 46,
      16 + rand() * 30,
      rand() * Math.PI,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.filter = 'none';
  return canvasTexture(c, false);
}

export function makeFadeStripTexture() {
  const h = 64;
  const data = new Uint8Array(4 * h * 4);
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    const a = Math.pow(1 - v, 2.2) * 255;
    for (let x = 0; x < 4; x++) {
      const o = (y * 4 + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = a;
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, 4, h, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function wrapLines(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function makeNoteTexture(paragraphs, footer, seed = 17) {
  const rand = makeRng(seed);
  const [c, ctx] = canvas(800, 1120);

  ctx.fillStyle = '#e7e0cf';
  ctx.fillRect(0, 0, 800, 1120);
  for (let i = 0; i < 9000; i++) {
    const v = 200 + Math.floor(rand() * 40);
    ctx.fillStyle = `rgba(${v},${v - 6},${v - 22},0.18)`;
    ctx.fillRect(rand() * 800, rand() * 1120, 1 + rand() * 2, 1 + rand() * 2);
  }
  const vignette = ctx.createRadialGradient(400, 560, 300, 400, 560, 760);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(90,70,40,0.28)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, 800, 1120);

  for (const y of [373, 746]) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(0, y, 800, 2);
    ctx.fillStyle = 'rgba(80,60,30,0.16)';
    ctx.fillRect(0, y + 2, 800, 3);
  }

  ctx.fillStyle = '#2a2621';
  ctx.font = 'bold 40px "Courier New", Courier, monospace';
  ctx.fillText('READ THIS FIRST', 70, 120);

  ctx.fillStyle = '#16130f';
  ctx.font = 'bold 30px "Courier New", Courier, monospace';
  let y = 190;
  for (const p of paragraphs) {
    for (const line of wrapLines(ctx, p, 660)) {
      ctx.fillText(line, 70 + gauss(rand) * 0.6, y);
      y += 40;
    }
    y += 22;
  }

  ctx.font = 'bold 24px "Courier New", Courier, monospace';
  ctx.fillStyle = '#3a342c';
  y = Math.max(y + 10, 960);
  for (const line of footer) {
    ctx.fillText(line, 70, y);
    y += 32;
  }

  ctx.fillStyle = 'rgba(232,222,170,0.55)';
  ctx.save();
  ctx.translate(90, 18);
  ctx.rotate(-0.12);
  ctx.fillRect(-60, -18, 150, 44);
  ctx.restore();
  ctx.save();
  ctx.translate(710, 18);
  ctx.rotate(0.1);
  ctx.fillRect(-90, -18, 150, 44);
  ctx.restore();

  return canvasTexture(c);
}

export function makeGateSignTexture(label, seed = 3) {
  const rand = makeRng(seed);
  const [c, ctx] = canvas(256, 160);
  ctx.fillStyle = '#6d726f';
  ctx.fillRect(0, 0, 256, 160);
  for (let i = 0; i < 2500; i++) {
    const v = 90 + Math.floor(rand() * 50);
    ctx.fillStyle = `rgba(${v},${v + 3},${v},0.35)`;
    ctx.fillRect(rand() * 256, rand() * 160, 2, 2);
  }
  ctx.fillStyle = 'rgba(120,70,40,0.35)';
  for (let i = 0; i < 40; i++) {
    ctx.beginPath();
    ctx.arc(rand() * 256, rand() * 160, 2 + rand() * 7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#1d1f1e';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 30px Impact, "Arial Black", sans-serif';
  ctx.fillText('G A T E', 128, 34);
  ctx.font = 'bold 86px Impact, "Arial Black", sans-serif';
  ctx.fillText(label, 128, 102);
  weather(ctx, rand, 256, 160, 260);
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#6d726f';
  ctx.fillRect(0, 0, 256, 160);
  for (const [x, y] of [
    [14, 14],
    [242, 14],
    [14, 146],
    [242, 146],
  ]) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#3a3c3b';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvasTexture(c);
}

export function makeTagTexture(label) {
  const [c, ctx] = canvas(128, 192);
  ctx.fillStyle = '#c9ad7a';
  ctx.fillRect(0, 0, 128, 192);
  ctx.fillStyle = 'rgba(90,60,20,0.25)';
  ctx.fillRect(0, 0, 128, 6);
  ctx.fillStyle = '#e9dfc9';
  ctx.beginPath();
  ctx.arc(64, 26, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7a5a2a';
  ctx.beginPath();
  ctx.arc(64, 26, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2b2118';
  ctx.font = 'bold 76px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 64, 118);
  return canvasTexture(c);
}
