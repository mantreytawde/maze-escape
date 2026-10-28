import * as THREE from 'three';
import { CELL, WALL_T, WALL_H } from './config.js';
import { DIRS } from './maze.js';
import { makePaintArrowTexture } from './textures.js';

// Decals sit well off the wall so they never z-fight at a distance in the headset.
const FACE = CELL / 2 - WALL_T / 2 - 0.02;
const ARROW_SIZE = 1.0;
const ARROW_Y = 1.55;

const opposite = (d) => DIRS.find((x) => x.dx === -d.dx && x.dz === -d.dz);
const same = (a, b) => a.dx === b.dx && a.dz === b.dz;

function arrowMaterial(map, opacity) {
  return new THREE.MeshStandardMaterial({
    map,
    emissiveMap: map,
    emissive: 0xffffff,
    emissiveIntensity: 0.65,
    transparent: true,
    opacity,
    depthWrite: false,
    roughness: 0.85,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
}

// Wayfinding for the current leg of the route. Arrows only show for a while after a right answer,
// and always inside an active danger zone.
export class Hints {
  constructor(scene, maze) {
    this.scene = scene;
    this.maze = maze;
    this.anchor = -1;
    this.target = -1;
    this.path = [];
    this.route = new Set();
    this.dist = null;
    this.litDist = null;
    this.arrowTime = 0;
    this.fade = 0;
    this.danger = null;
    this.items = [];

    const tex = {
      left: makePaintArrowTexture('left'),
      right: makePaintArrowTexture('right'),
      up: makePaintArrowTexture('up'),
      signleft: makePaintArrowTexture('left', { drips: false }),
      signright: makePaintArrowTexture('right', { drips: false }),
      signup: makePaintArrowTexture('up', { drips: false }),
    };
    this.timed = {};
    this.always = {};
    for (const [k, t] of Object.entries(tex)) {
      this.timed[k] = arrowMaterial(t, 0);
      this.always[k] = arrowMaterial(t, 1);
    }
    this.plane = new THREE.PlaneGeometry(1, 1);
    this.decals = [];
    this.signs = [];
    this.signPlate = new THREE.MeshStandardMaterial({ color: 0x2c2f31, metalness: 0.4, roughness: 0.6 });
  }

  get arrowsOn() {
    return this.arrowTime > 0;
  }

  onRoute(cell) {
    return this.route.has(cell);
  }

  // Safe ground: the route itself and the first cell off it. Further in, the thing wakes up.
  isSafe(cell) {
    return cell < 0 || !this.litDist || this.litDist[cell] <= 1;
  }

  setRoute(anchor, target) {
    if (anchor === this.anchor && target === this.target) return false;
    this.anchor = anchor;
    this.target = target;
    this.dist = this.maze.distances(target).dist;
    this.path = this.maze.path(anchor, target);
    this.route = new Set(this.path);
    this.litDist = this.distanceFromRoute();
    this.rebuild();
    return true;
  }

  distanceFromRoute() {
    const m = this.maze;
    const dist = new Int32Array(m.size).fill(-1);
    const queue = [...this.route];
    for (const c of queue) dist[c] = 0;
    for (let h = 0; h < queue.length; h++) {
      const c = queue[h];
      for (const n of m.links(c)) {
        if (dist[n] < 0) {
          dist[n] = dist[c] + 1;
          queue.push(n);
        }
      }
    }
    return dist;
  }

  nextStep(cell) {
    if (!this.dist || cell < 0) return -1;
    const d = this.dist[cell];
    if (d <= 0) return -1;
    for (const n of this.maze.links(cell)) if (this.dist[n] === d - 1) return n;
    return -1;
  }

  showArrows(seconds) {
    this.arrowTime = seconds;
  }

  hideArrows() {
    this.arrowTime = 0;
  }

  setDanger(cells) {
    this.danger = cells;
    this.applyMaterials();
  }

  // Pools ------------------------------------------------------------------
  decal() {
    let mesh = this.decals[this.usedDecals];
    if (!mesh) {
      mesh = new THREE.Mesh(this.plane, this.timed.up);
      mesh.renderOrder = 3;
      this.scene.add(mesh);
      this.decals.push(mesh);
    }
    this.usedDecals++;
    mesh.scale.set(ARROW_SIZE, ARROW_SIZE, 1);
    mesh.rotation.set(0, 0, 0);
    return mesh;
  }

  sign() {
    let sign = this.signs[this.usedSigns];
    if (!sign) {
      sign = new THREE.Group();
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.46, 0.03), this.signPlate);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), this.timed.up);
      face.position.z = 0.02;
      face.renderOrder = 3;
      sign.add(plate, face);
      for (const x of [-0.28, 0.28]) {
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 6), this.signPlate);
        rod.position.set(x, 0.48, 0);
        sign.add(rod);
      }
      sign.userData.face = face;
      this.scene.add(sign);
      this.signs.push(sign);
    }
    this.usedSigns++;
    return sign;
  }

  // Paint the leg -----------------------------------------------------------
  rebuild() {
    const m = this.maze;
    this.usedDecals = 0;
    this.usedSigns = 0;
    this.items = [];

    for (let i = 0; i < this.path.length - 1; i++) {
      const c = this.path[i];
      const links = m.links(c);
      if (links.length < 3) continue;
      const go = m.dirBetween(c, this.path[i + 1]);

      for (const n of links) {
        if (n === this.path[i + 1]) continue;
        const from = m.dirBetween(c, n);
        const facing = opposite(from);
        const right = { dx: -facing.dz, dz: facing.dx };
        const turn = same(go, facing) ? 'up' : same(go, right) ? 'right' : 'left';
        const p = m.center(c);

        if (!(m.open[c] & facing.bit)) {
          const d = this.decal();
          d.position.set(p.x + facing.dx * FACE, ARROW_Y, p.z + facing.dz * FACE);
          d.rotation.y = Math.atan2(-facing.dx, -facing.dz);
          this.items.push({ cell: c, mesh: d, key: turn, sign: null });
        } else {
          const s = this.sign();
          s.position.set(p.x + from.dx * 0.3, WALL_H - 0.8, p.z + from.dz * 0.3);
          s.rotation.y = Math.atan2(from.dx, from.dz);
          this.items.push({ cell: c, mesh: s.userData.face, key: `sign${turn}`, sign: s });
        }
      }
    }
    for (let i = this.usedDecals; i < this.decals.length; i++) this.decals[i].visible = false;
    for (let i = this.usedSigns; i < this.signs.length; i++) this.signs[i].visible = false;
    this.applyMaterials();
  }

  applyMaterials() {
    for (const it of this.items) {
      const always = this.danger?.has(it.cell);
      it.always = !!always;
      it.mesh.material = always ? this.always[it.key] : this.timed[it.key];
    }
    this.applyVisibility();
  }

  applyVisibility() {
    const timedVisible = this.fade > 0.01;
    for (const it of this.items) {
      const visible = it.always || timedVisible;
      it.mesh.visible = visible;
      if (it.sign) it.sign.visible = visible;
    }
  }

  reset() {
    this.anchor = -1;
    this.target = -1;
    this.arrowTime = 0;
    this.fade = 0;
    this.danger = null;
  }

  update(dt) {
    this.arrowTime = Math.max(0, this.arrowTime - dt);
    const want = this.arrowTime > 0 ? 1 : 0;
    const before = this.fade > 0.01;
    this.fade += (want - this.fade) * Math.min(1, dt * (want ? 5 : 1.6));
    if (Math.abs(want - this.fade) < 0.005) this.fade = want;
    for (const mat of Object.values(this.timed)) mat.opacity = this.fade;
    if (before !== this.fade > 0.01) this.applyVisibility();
  }
}
