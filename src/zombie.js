import * as THREE from 'three';
import { CELL, WALL_H, ZOMBIE_SPEED, ZOMBIE_REACH } from './config.js';
import { makeRng } from './maze.js';

// Face patch on the front of the skull, as a slice of a sphere.
const PHI_START = Math.PI / 2 - 0.36 * Math.PI;
const PHI_LEN = 0.72 * Math.PI;
const THETA_START = 0.17 * Math.PI;
const THETA_LEN = 0.62 * Math.PI;
const HEAD_R = 0.112;
const HEAD_SCALE = new THREE.Vector3(0.9, 1.12, 0.98);
const EYES = [
  [190, 228],
  [322, 228],
];

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return [c, c.getContext('2d')];
}

function texture(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function crack(ctx, rand, x, y, steps, width, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  let a = rand() * Math.PI * 2;
  for (let i = 0; i < steps; i++) {
    a += (rand() - 0.5) * 1.2;
    x += Math.cos(a) * 9;
    y += Math.sin(a) * 9;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function skinCanvas(rand, size) {
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#4f5649';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < size * 30; i++) {
    const v = 55 + Math.floor(rand() * 50);
    ctx.fillStyle = `rgba(${v},${v + 6},${v - 6},0.28)`;
    ctx.fillRect(rand() * size, rand() * size, 2, 2);
  }
  for (let i = 0; i < 22; i++) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    const tone = ['48,30,46', '52,58,30', '30,26,22'][Math.floor(rand() * 3)];
    g.addColorStop(0, `rgba(${tone},0.6)`);
    g.addColorStop(1, `rgba(${tone},0)`);
    ctx.save();
    ctx.translate(rand() * size, rand() * size);
    ctx.scale(20 + rand() * 50, 14 + rand() * 40);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  for (let i = 0; i < 26; i++) crack(ctx, rand, rand() * size, rand() * size, 8 + rand() * 10, 1.2, 'rgba(50,25,55,0.55)');
  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const x = rand() * size;
    const y = rand() * size;
    ctx.strokeStyle = `rgba(${55 + rand() * 30},6,6,0.55)`;
    ctx.lineWidth = 2 + rand() * 5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + (rand() - 0.5) * 30, y + 20, x + (rand() - 0.5) * 30, y + 40, x + (rand() - 0.5) * 20, y + 30 + rand() * 60);
    ctx.stroke();
  }
  return c;
}

function makeSkin(rand) {
  return texture(skinCanvas(rand, 256));
}

function makeRags(rand) {
  const [c, ctx] = canvas(256);
  const [a, actx] = canvas(256);
  ctx.fillStyle = '#2b2520';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) {
    const v = 25 + Math.floor(rand() * 30);
    ctx.fillStyle = `rgba(${v},${v - 4},${v - 8},0.5)`;
    ctx.fillRect(rand() * 256, rand() * 256, 1, 3);
  }
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = rand() < 0.6 ? 'rgba(80,12,10,0.55)' : 'rgba(70,60,30,0.45)';
    ctx.beginPath();
    ctx.ellipse(rand() * 256, rand() * 256, 10 + rand() * 30, 8 + rand() * 24, rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  actx.fillStyle = '#fff';
  actx.fillRect(0, 0, 256, 256);
  actx.fillStyle = '#000';
  for (let i = 0; i < 9; i++) {
    actx.beginPath();
    const x = rand() * 256;
    const y = rand() * 256;
    actx.moveTo(x, y);
    for (let k = 0; k < 7; k++) actx.lineTo(x + (rand() - 0.5) * 50, y + (rand() - 0.5) * 50);
    actx.fill();
  }
  return { map: texture(c), alphaMap: texture(a, false) };
}

function makeFace(rand) {
  const [c, ctx] = canvas(512);
  ctx.drawImage(skinCanvas(rand, 512), 0, 0);

  for (const [x, y] of [
    [150, 330],
    [362, 330],
  ]) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, 70);
    g.addColorStop(0, 'rgba(20,18,22,0.75)');
    g.addColorStop(1, 'rgba(20,18,22,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
  }

  for (const [x, y] of EYES) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.82);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 78);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.45, 'rgba(8,4,6,0.95)');
    g.addColorStop(1, 'rgba(30,20,25,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 78, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(120,10,10,0.8)';
    for (let i = 0; i < 3; i++) {
      const dx = (rand() - 0.5) * 30;
      ctx.fillRect(x + dx - 2, y + 30, 4, 40 + rand() * 70);
    }
    const ex = x + (rand() - 0.5) * 6;
    const iris = ctx.createRadialGradient(ex, y + 4, 0, ex, y + 4, 13);
    iris.addColorStop(0, '#d8d4bd');
    iris.addColorStop(0.6, '#9c9a86');
    iris.addColorStop(1, 'rgba(60,58,50,0)');
    ctx.fillStyle = iris;
    ctx.beginPath();
    ctx.arc(ex, y + 4, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(30,28,24,0.8)';
    ctx.beginPath();
    ctx.arc(ex + 1, y + 5, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(25,15,20,0.8)';
  ctx.lineWidth = 7;
  for (const [x0, x1] of [
    [120, 236],
    [276, 392],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x0, 160);
    ctx.quadraticCurveTo((x0 + x1) / 2, x0 < 256 ? 175 : 140, x1, x0 < 256 ? 140 : 175);
    ctx.stroke();
  }

  ctx.fillStyle = '#0a0606';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(256 + s * 4, 280);
    ctx.lineTo(256 + s * 22, 318);
    ctx.lineTo(256 + s * 6, 322);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(256, 395);
  const mg = ctx.createRadialGradient(0, 0, 0, 0, 0, 100);
  mg.addColorStop(0, '#000');
  mg.addColorStop(0.75, '#140405');
  mg.addColorStop(1, '#3a0b0b');
  ctx.fillStyle = mg;
  ctx.beginPath();
  ctx.ellipse(0, 0, 100, 66, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#4a0f10';
  ctx.lineWidth = 10;
  ctx.stroke();
  const tooth = (x, y, w, h, down) => {
    ctx.fillStyle = rand() < 0.3 ? '#5f5436' : rand() < 0.5 ? '#9a8c62' : '#b7aa80';
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.lineTo(x + w / 2, y);
    ctx.lineTo(x + (rand() - 0.5) * 4, y + (down ? h : -h));
    ctx.closePath();
    ctx.fill();
  };
  for (let x = -82; x <= 82; x += 11) {
    if (rand() < 0.22) continue;
    const edge = Math.sqrt(Math.max(0, 1 - (x / 100) ** 2)) * 66;
    tooth(x + (rand() - 0.5) * 4, -edge + 3, 9 + rand() * 4, 9 + rand() * 15, true);
    if (rand() < 0.75) tooth(x + 5, edge - 3, 8 + rand() * 4, 8 + rand() * 12, false);
  }
  ctx.restore();

  ctx.fillStyle = 'rgba(105,8,8,0.85)';
  for (const x of [170, 200, 300, 330, 250]) {
    ctx.fillRect(x - 4, 430, 8, 50 + rand() * 80);
  }
  for (let i = 0; i < 18; i++) crack(ctx, rand, 256 + (rand() - 0.5) * 300, 200 + rand() * 250, 6 + rand() * 8, 2, 'rgba(40,15,35,0.7)');

  ctx.globalCompositeOperation = 'destination-in';
  const mask = ctx.createRadialGradient(256, 280, 150, 256, 280, 256);
  mask.addColorStop(0, 'rgba(0,0,0,1)');
  mask.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, 512, 512);

  const [e, ectx] = canvas(256);
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, 256, 256);
  for (const [x, y] of EYES) {
    const g = ectx.createRadialGradient(x / 2, y / 2 + 2, 0, x / 2, y / 2 + 2, 6);
    g.addColorStop(0, '#a8a490');
    g.addColorStop(1, 'rgba(120,118,100,0)');
    ectx.fillStyle = g;
    ectx.fillRect(0, 0, 256, 256);
  }
  return { map: texture(c), emissiveMap: texture(e) };
}

function capsule(r, len, mat) {
  return new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat);
}

function onFace(cx, cy, r) {
  const phi = PHI_START + (cx / 512) * PHI_LEN;
  const theta = THETA_START + (cy / 512) * THETA_LEN;
  return new THREE.Vector3(
    -r * Math.cos(phi) * Math.sin(theta),
    r * Math.cos(theta),
    r * Math.sin(phi) * Math.sin(theta),
  ).multiply(HEAD_SCALE);
}

function buildBody() {
  const rand = makeRng(66);
  const skin = new THREE.MeshStandardMaterial({ map: makeSkin(rand), roughness: 0.55 });
  const rags = makeRags(rand);
  const rag = new THREE.MeshStandardMaterial({
    ...rags,
    roughness: 0.95,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });
  const face = makeFace(rand);
  const faceMat = new THREE.MeshStandardMaterial({
    map: face.map,
    emissiveMap: face.emissiveMap,
    emissive: 0xffffff,
    emissiveIntensity: 0.9,
    roughness: 0.5,
    transparent: true,
  });

  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.93;
  root.add(hips);
  const pelvis = capsule(0.12, 0.14, rag);
  pelvis.rotation.z = Math.PI / 2;
  hips.add(pelvis);

  const spine = new THREE.Group();
  spine.position.y = 0.06;
  spine.rotation.x = 0.42;
  hips.add(spine);
  const chest = capsule(0.15, 0.36, skin);
  chest.position.y = 0.3;
  chest.scale.set(1, 1, 0.62);
  const shirt = capsule(0.162, 0.34, rag);
  shirt.position.y = 0.3;
  shirt.scale.set(1, 1, 0.64);
  spine.add(chest, shirt);

  const neck = new THREE.Group();
  neck.position.set(0, 0.6, 0.02);
  spine.add(neck);
  const neckMesh = capsule(0.042, 0.09, skin);
  neckMesh.position.y = 0.05;
  neck.add(neckMesh);

  const head = new THREE.Group();
  head.position.y = 0.15;
  head.rotation.x = -0.45;
  neck.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 24, 18), skin);
  skull.scale.copy(HEAD_SCALE);
  head.add(skull);
  const facePatch = new THREE.Mesh(
    new THREE.SphereGeometry(HEAD_R * 1.015, 32, 24, PHI_START, PHI_LEN, THETA_START, THETA_LEN),
    faceMat,
  );
  facePatch.scale.copy(HEAD_SCALE);
  head.add(facePatch);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x8f8c78 });
  for (const [x, y] of EYES) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 10, 8), eyeMat);
    eye.position.copy(onFace(x, y + 4, HEAD_R * 0.99));
    head.add(eye);
  }

  // Long, wet black hair hanging off the scalp and partly over the face.
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x090807, roughness: 0.45, side: THREE.DoubleSide });
  const strand = new THREE.PlaneGeometry(1, 1);
  strand.translate(0, -0.5, 0);
  for (let i = 0; i < 170; i++) {
    let a = (rand() - 0.5) * Math.PI * 2;
    const overFace = Math.abs(a) < 0.75;
    if (overFace && rand() < 0.7) a += Math.sign(a || 1) * 0.8;
    const phi = 0.25 + rand() * 1.15;
    const r = HEAD_R * 1.04;
    const hair = new THREE.Mesh(strand, hairMat);
    hair.position.set(
      Math.sin(phi) * Math.sin(a) * r * HEAD_SCALE.x,
      Math.cos(phi) * r * HEAD_SCALE.y,
      Math.sin(phi) * Math.cos(a) * r * HEAD_SCALE.z,
    );
    hair.scale.set(0.004 + rand() * 0.007, 0.28 + rand() * 0.38, 1);
    hair.rotation.set(-(0.08 + phi * 0.22 + rand() * 0.1), a, (rand() - 0.5) * 0.15, 'YXZ');
    head.add(hair);
  }

  const arms = [-1, 1].map((s) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.19, 0.52, 0);
    spine.add(shoulder);
    const upper = capsule(0.04, 0.26, skin);
    upper.position.y = -0.15;
    const sleeve = capsule(0.048, 0.12, rag);
    sleeve.position.y = -0.07;
    shoulder.add(upper, sleeve);
    const elbow = new THREE.Group();
    elbow.position.y = -0.31;
    shoulder.add(elbow);
    const fore = capsule(0.033, 0.25, skin);
    fore.position.y = -0.14;
    elbow.add(fore);
    const hand = new THREE.Group();
    hand.position.y = -0.29;
    elbow.add(hand);
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.085, 0.022), skin);
    palm.position.y = -0.03;
    hand.add(palm);
    for (let k = 0; k < 4; k++) {
      const finger = capsule(0.0075, 0.08, skin);
      finger.position.set((k - 1.5) * 0.017, -0.11, 0.008);
      finger.rotation.set(0.45, 0, (k - 1.5) * 0.14);
      hand.add(finger);
    }
    const thumb = capsule(0.008, 0.05, skin);
    thumb.position.set(-s * 0.04, -0.05, 0.015);
    thumb.rotation.z = -s * 0.8;
    hand.add(thumb);
    return { side: s, shoulder, elbow };
  });

  const legs = [-1, 1].map((s) => {
    const hip = new THREE.Group();
    hip.position.set(s * 0.095, -0.03, 0);
    hips.add(hip);
    const thigh = capsule(0.058, 0.32, rag);
    thigh.position.y = -0.2;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.43;
    hip.add(knee);
    const shin = capsule(0.047, 0.34, skin);
    shin.position.y = -0.2;
    knee.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.05, 0.21), skin);
    foot.position.set(0, -0.43, 0.05);
    knee.add(foot);
    return { side: s, hip, knee };
  });

  root.traverse((o) => {
    if (o.isMesh) o.frustumCulled = false;
  });
  return { root, parts: { hips, spine, neck, head, arms, legs } };
}

const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

export class Zombie {
  constructor({ scene, camera, maze, collision, hints, audio, player, game, ui }) {
    Object.assign(this, { scene, camera, maze, collision, hints, audio, player, game, ui });
    const { root, parts } = buildBody();
    this.root = root;
    this.parts = parts;
    root.visible = false;
    scene.add(root);

    this.light = new THREE.PointLight(0xc8d6ff, 0, 7, 2);
    scene.add(this.light);

    this.enabled = true;
    this.phase = 0;
    this.twitchT = 0;
    this.twitch = new THREE.Euler();
    this.reset();
  }

  reset() {
    this.catches = 0;
    this.player.frozen = false;
    this.player.shake = 0;
    this.state = 'idle';
    this.t = 0;
    this.darkTime = 0;
    this.armed = true;
    this.lastSafe = -1;
    this.zCell = -1;
    this.speedNow = 0;
    this.stepDist = 0;
    this.repath = 0;
    this.target = new THREE.Vector3();
    this.root.visible = false;
    this.light.intensity = 0;
    this.audio.setGrowl(false);
    this.audio.setHeartbeat(0);
  }

  get active() {
    return this.state !== 'idle';
  }

  // Main loop ---------------------------------------------------------------
  update(dt, head, cell) {
    const lit = this.hints.isSafe(cell);
    if (cell >= 0 && this.hints.onRoute(cell)) this.lastSafe = cell;

    switch (this.state) {
      case 'idle':
        if (lit) this.armed = true;
        if (!this.enabled || !this.game.running || this.game.finished || !this.armed || lit) {
          this.darkTime = 0;
          return;
        }
        this.darkTime += dt;
        if (this.darkTime > 0.25) this.spawn(cell, head);
        return;
      case 'reveal':
        this.updateReveal(dt, head);
        break;
      case 'chase':
        this.updateChase(dt, head, cell, lit);
        break;
      case 'blocked':
        this.updateBlocked(dt, head, cell, lit);
        break;
      case 'vanish':
        this.updateVanish(dt, head);
        break;
      case 'caught':
        this.updateCaught(dt);
        break;
    }
  }

  // Up to two cells straight down the darker corridor the player is facing, so it is in plain sight.
  spawnCell(cell) {
    const m = this.maze;
    const depth = this.hints.litDist;
    const yaw = this.player.headYaw();
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const options = m.links(cell).filter((n) => depth[n] > depth[cell]);
    if (!options.length) return cell;
    let best = options[0];
    let bestDot = -Infinity;
    for (const n of options) {
      const d = m.dirBetween(cell, n);
      const dot = d.dx * fx + d.dz * fz;
      if (dot > bestDot) {
        bestDot = dot;
        best = n;
      }
    }
    const dir = m.dirBetween(cell, best);
    const further = m.neighbor(best, dir);
    return m.open[best] & dir.bit && further >= 0 && depth[further] > depth[best] ? further : best;
  }

  spawn(cell, head) {
    const m = this.maze;
    const cur = this.spawnCell(cell);
    const c = m.center(cur);
    const pos = { x: c.x, z: c.z };
    if (cur === cell) {
      const dx = c.x - head.x;
      const dz = c.z - head.z;
      const len = Math.hypot(dx, dz) || 1;
      pos.x += (dx / len) * 1.05;
      pos.z += (dz / len) * 1.05;
    }
    this.collision.resolveCircle(pos, 0.3);
    this.root.position.set(pos.x, 0, pos.z);
    this.faceToward(head, 1);
    this.zCell = m.cellAt(pos.x, pos.z);
    this.pose('stare');

    this.state = 'reveal';
    this.t = 0;
    this.audio.attachGrowl(this.root);
    this.audio.setGrowl(true, 1);
    this.audio.play('stinger', 0.85);
    this.audio.at('scream', new THREE.Vector3(pos.x, 1.6, pos.z), 1.1);
  }

  lampAbove(cell) {
    const c = this.maze.center(cell >= 0 ? cell : this.zCell);
    return new THREE.Vector3(c.x, WALL_H - 0.3, c.z);
  }

  distanceTo(head) {
    return Math.hypot(head.x - this.root.position.x, head.z - this.root.position.z);
  }

  fear(head) {
    return Math.max(0.2, 1 - this.distanceTo(head) / 10);
  }

  updateReveal(dt, head) {
    this.t += dt;
    const strobe = Math.random() < 0.5;
    this.light.position.copy(this.lampAbove(this.zCell));
    this.light.intensity = strobe ? 6 : 0.2;
    this.root.visible = this.t > 0.55 || strobe;
    this.faceToward(head, dt * 6);
    this.animate(dt, 'twitch');
    this.audio.setHeartbeat(this.fear(head));
    if (this.t > 0.9) {
      this.state = 'chase';
      this.t = 0;
      this.speedNow = 0;
      this.root.visible = true;
    }
  }

  chooseTarget(head, playerCell) {
    const m = this.maze;
    if (playerCell < 0) return false;
    if (this.zCell === playerCell) {
      this.target.set(head.x, 0, head.z);
      return !this.hints.isSafe(playerCell);
    }
    const path = m.path(this.zCell, playerCell);
    const next = path[1];
    if (next === undefined) return false;
    if (this.hints.isSafe(next)) {
      const a = m.center(this.zCell);
      const b = m.center(next);
      const dx = Math.sign(b.x - a.x);
      const dz = Math.sign(b.z - a.z);
      this.target.set(a.x + dx * (CELL / 2 - 0.45), 0, a.z + dz * (CELL / 2 - 0.45));
      return false;
    }
    const c = m.center(next);
    this.target.set(c.x, 0, c.z);
    return true;
  }

  move(dt, speed) {
    const p = this.root.position;
    const dx = this.target.x - p.x;
    const dz = this.target.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.02) return 0;
    const step = Math.min(d, speed * dt);
    const pos = { x: p.x + (dx / d) * step, z: p.z + (dz / d) * step };
    this.collision.resolveCircle(pos, 0.28);
    const moved = Math.hypot(pos.x - p.x, pos.z - p.z);
    p.x = pos.x;
    p.z = pos.z;
    const c = this.maze.cellAt(p.x, p.z);
    if (c >= 0) this.zCell = c;
    this.stepDist += moved;
    if (this.stepDist > 0.8) {
      this.stepDist = 0;
      this.audio.at('steps', new THREE.Vector3(p.x, 0.2, p.z), 0.7, 0.55 + Math.random() * 0.1);
    }
    return moved;
  }

  sputterLamp(time) {
    this.light.position.copy(this.lampAbove(this.zCell));
    const on = Math.sin(time * 31) > -0.3 && Math.random() > 0.15;
    this.light.intensity = on ? 2.2 + Math.random() * 1.5 : 0.1;
  }

  updateChase(dt, head, cell, lit) {
    this.t += dt;
    this.repath -= dt;
    let reachable = true;
    if (this.repath <= 0) {
      this.repath = 0.15;
      reachable = this.chooseTarget(head, cell);
      this.reachable = reachable;
    }
    this.speedNow = Math.min(ZOMBIE_SPEED, this.speedNow + dt * 6);
    this.move(dt, this.speedNow);
    this.faceToward(head, dt * 8);
    this.animate(dt, 'walk');
    this.sputterLamp(this.t);
    this.audio.setHeartbeat(this.fear(head));
    this.audio.setGrowl(true, 1.15);

    if (!lit && this.distanceTo(head) < ZOMBIE_REACH) {
      this.catchPlayer();
      return;
    }
    if (lit || this.reachable === false) {
      this.state = 'blocked';
      this.t = 0;
    } else if (this.t > 14) {
      this.state = 'vanish';
      this.t = 0;
    }
  }

  updateBlocked(dt, head, cell, lit) {
    this.t += dt;
    this.chooseTarget(head, cell);
    const moved = this.move(dt, 1.2);
    this.faceToward(head, dt * 6);
    this.animate(dt, moved > 0.001 ? 'walk' : 'stare');
    this.sputterLamp(this.t);
    this.audio.setHeartbeat(this.fear(head) * 0.8);
    if (!lit && cell >= 0) {
      this.state = 'chase';
      this.t = 0;
      return;
    }
    if (this.t > 1.8) {
      this.state = 'vanish';
      this.t = 0;
    }
  }

  updateVanish(dt, head) {
    this.t += dt;
    const strobe = Math.random() < 0.5 && this.t < 0.45;
    this.light.intensity = strobe ? 4 : 0;
    this.root.visible = strobe;
    this.animate(dt, 'twitch');
    this.audio.setHeartbeat(this.fear(head) * (1 - this.t / 0.6));
    if (this.t > 0.6) {
      this.hide();
      this.armed = false;
    }
  }

  hide() {
    this.state = 'idle';
    this.t = 0;
    this.darkTime = 0;
    this.root.visible = false;
    this.light.intensity = 0;
    this.audio.setGrowl(false);
    this.audio.setHeartbeat(0);
  }

  catchPlayer(respawnCell = -1) {
    this.state = 'caught';
    this.t = 0;
    this.reported = false;
    this.respawnCell = respawnCell;
    this.catches++;
    this.player.frozen = true;
    this.player.shake = 1;
    this.audio.setGrowl(false);
    this.audio.play('jumpscare', 1);
    this.audio.play('boom', 1);
    this.ui.scareFlash();
    this.pose('scare');
  }

  updateCaught(dt) {
    this.t += dt;
    const cam = this.camera.getWorldPosition(new THREE.Vector3());
    const fwd = this.camera.getWorldDirection(new THREE.Vector3());
    fwd.y = 0;
    fwd.normalize();
    const dist = THREE.MathUtils.lerp(1.0, 0.34, ease(this.t / 0.16));
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, Math.atan2(-fwd.x, -fwd.z), 0);
    this.animate(dt, 'scare');
    this.root.updateMatrixWorld(true);
    const h = this.parts.head.getWorldPosition(new THREE.Vector3());
    this.root.position.set(cam.x + fwd.x * dist - h.x, cam.y - 0.03 - h.y, cam.z + fwd.z * dist - h.z);
    this.root.visible = true;

    this.light.position.set(cam.x + fwd.x * 0.12 - fwd.z * 0.1, cam.y - 0.32, cam.z + fwd.z * 0.12 + fwd.x * 0.1);
    this.light.intensity = Math.random() < 0.65 ? 1.1 : 0.1;
    this.audio.setHeartbeat(1);

    if (this.t > 1.05) this.player.fadeTo(1, 7);
    if (this.t > 1.5 && !this.reported) {
      this.reported = true;
      if (this.onCaught) this.onCaught(this.respawnCell);
      else this.respawnPlayer(this.respawnCell);
    }
  }

  // The danger-zone punishment: it is simply there, in your face.
  ambush(respawnCell) {
    this.audio.attachGrowl(this.root);
    this.catchPlayer(respawnCell);
  }

  respawnPlayer(at = -1) {
    const cell = at >= 0 ? at : this.lastSafe >= 0 ? this.lastSafe : this.hints.anchor;
    const c = this.maze.center(cell);
    const next = this.hints.nextStep(cell);
    let yaw = this.player.yaw;
    if (next >= 0) {
      const n = this.maze.center(next);
      yaw = Math.atan2(-(n.x - c.x), -(n.z - c.z));
    }
    this.player.spawn(c.x, c.z, yaw);
    this.player.frozen = false;
    this.player.shake = 0;
    this.player.fadeTo(0, 2.2);
    this.hide();
    this.armed = false;
  }

  // Animation ---------------------------------------------------------------
  faceToward(head, rate) {
    const dx = head.x - this.root.position.x;
    const dz = head.z - this.root.position.z;
    const want = Math.atan2(dx, dz);
    let diff = want - this.root.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.root.rotation.y += diff * Math.min(1, rate);
  }

  pose(kind) {
    const P = this.parts;
    if (kind === 'scare') {
      P.spine.rotation.set(0.12, 0, 0);
      P.head.rotation.set(-0.12, 0, 0.32);
      for (const a of P.arms) {
        a.shoulder.rotation.set(-1.75, 0, a.side * 0.55);
        a.elbow.rotation.set(-0.5, 0, 0);
      }
    } else {
      P.spine.rotation.set(0.42, 0, 0);
      P.head.rotation.set(-0.45, 0, 0.3);
    }
  }

  animate(dt, mode) {
    const P = this.parts;
    const walking = mode === 'walk';
    this.phase += dt * (walking ? 3.4 * Math.max(1, this.speedNow) : 0);
    const ph = this.phase;

    for (const leg of P.legs) {
      const amp = leg.side < 0 ? 0.55 : 0.3;
      const o = leg.side < 0 ? 0 : Math.PI;
      const swing = walking ? Math.sin(ph + o) * amp : 0;
      const bend = walking ? Math.max(0, Math.sin(ph + o - 1.2)) * 0.95 : 0.12;
      leg.hip.rotation.x += (-swing - leg.hip.rotation.x) * Math.min(1, dt * 14);
      leg.knee.rotation.x += (bend - leg.knee.rotation.x) * Math.min(1, dt * 14);
    }
    P.hips.position.y = 0.91 + (walking ? Math.abs(Math.cos(ph)) * 0.035 : 0);
    P.hips.rotation.z = walking ? Math.sin(ph) * 0.08 : 0;

    if (mode !== 'scare') {
      for (const a of P.arms) {
        const reach = mode === 'stare' ? -0.85 : -1.3;
        const jit = (Math.random() - 0.5) * (mode === 'twitch' ? 0.25 : 0.06);
        a.shoulder.rotation.x = reach + Math.sin(ph * 0.5 + a.side) * 0.14 + jit;
        a.shoulder.rotation.z = a.side * (0.14 + Math.sin(ph * 0.7 + a.side) * 0.05);
        a.elbow.rotation.x = -0.45 + Math.sin(ph * 0.6 + a.side * 2) * 0.12;
      }
      if (mode === 'twitch' && Math.random() < dt * 9) {
        P.spine.rotation.x = 0.42 + (Math.random() - 0.5) * 0.35;
        P.spine.rotation.z = (Math.random() - 0.5) * 0.3;
      } else {
        P.spine.rotation.x += (0.42 - P.spine.rotation.x) * Math.min(1, dt * 4);
        P.spine.rotation.z += (0 - P.spine.rotation.z) * Math.min(1, dt * 4);
      }
    }

    this.twitchT -= dt;
    if (this.twitchT <= 0) {
      this.twitchT = (mode === 'twitch' ? 0.08 : 0.2) + Math.random() * (mode === 'scare' ? 0.15 : 0.9);
      const k = mode === 'scare' ? 0.25 : 1;
      this.twitch.set((Math.random() - 0.5) * 0.5 * k, (Math.random() - 0.5) * 0.8 * k, (Math.random() - 0.5) * 0.9 * k);
    }
    const base = mode === 'scare' ? [-0.12, 0, 0.32] : [-0.45, 0, 0.3];
    const h = P.head.rotation;
    const r = Math.min(1, dt * 30);
    h.x += (base[0] + this.twitch.x - h.x) * r;
    h.y += (base[1] + this.twitch.y - h.y) * r;
    h.z += (base[2] + this.twitch.z - h.z) * r;
  }
}
