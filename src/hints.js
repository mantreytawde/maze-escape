import * as THREE from 'three';
import { HINT_COOLDOWN, TRAIL_CELLS, TRAIL_SECONDS } from './config.js';
import { makeArrowTexture } from './textures.js';

const APPEAR_DELAY = 0.4;

function decal(texture, size) {
  const holder = new THREE.Group();
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      roughness: 0.8,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    }),
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = 0.009;
  plane.renderOrder = 3;
  holder.add(plane);
  holder.visible = false;
  return { holder, plane, cell: -1, opacity: 0 };
}

export class Hints {
  constructor(scene, maze) {
    this.maze = maze;
    this.target = -1;
    this.dist = null;
    this.cooldown = 0;
    this.trailTime = 0;
    this.used = 0;
    this.lastCell = -1;
    this.timeInCell = 0;

    const tex = makeArrowTexture();
    this.arrows = [decal(tex, 1.0), decal(tex, 1.0)];
    this.trail = Array.from({ length: TRAIL_CELLS }, () => decal(tex, 0.62));
    for (const d of [...this.arrows, ...this.trail]) scene.add(d.holder);
  }

  get ready() {
    return this.cooldown <= 0;
  }

  setTarget(cell) {
    if (cell === this.target) return;
    this.target = cell;
    this.dist = cell >= 0 ? this.maze.distances(cell).dist : null;
    for (const a of this.arrows) a.cell = -1;
    this.trailTime = Math.min(this.trailTime, 0);
  }

  nextStep(cell) {
    if (!this.dist || cell < 0) return -1;
    const d = this.dist[cell];
    if (d <= 0) return -1;
    for (const n of this.maze.links(cell)) if (this.dist[n] === d - 1) return n;
    return -1;
  }

  place(slot, cell, next, offset) {
    const dir = this.maze.dirBetween(cell, next);
    const p = this.maze.center(cell);
    slot.holder.position.set(p.x + dir.dx * offset, 0, p.z + dir.dz * offset);
    slot.holder.rotation.y = Math.atan2(-dir.dx, -dir.dz);
    slot.cell = cell;
  }

  requestTrail(cell) {
    if (!this.ready || cell < 0 || cell === this.target) return false;
    let cur = cell;
    let placed = 0;
    for (const slot of this.trail) {
      const next = this.nextStep(cur);
      if (next < 0) break;
      this.place(slot, cur, next, -0.35);
      slot.opacity = 0;
      slot.delay = placed * 0.18;
      cur = next;
      placed++;
    }
    for (let i = placed; i < this.trail.length; i++) this.trail[i].cell = -1;
    if (!placed) return false;
    this.trailTime = TRAIL_SECONDS;
    this.cooldown = HINT_COOLDOWN;
    this.used++;
    return true;
  }

  reset() {
    this.target = -1;
    this.dist = null;
    this.cooldown = 0;
    this.trailTime = 0;
    this.used = 0;
    for (const d of [...this.arrows, ...this.trail]) {
      d.cell = -1;
      d.opacity = 0;
      d.holder.visible = false;
    }
  }

  update(dt, cell) {
    this.cooldown = Math.max(0, this.cooldown - dt);

    if (cell !== this.lastCell) {
      this.lastCell = cell;
      this.timeInCell = 0;
    } else {
      this.timeInCell += dt;
    }

    const decision = cell >= 0 && this.maze.degree(cell) !== 2 && cell !== this.target;
    const showCell = decision && this.timeInCell >= APPEAR_DELAY ? cell : -1;
    if (showCell >= 0 && !this.arrows.some((a) => a.cell === showCell)) {
      const next = this.nextStep(showCell);
      if (next >= 0) {
        const slot = this.arrows[0].opacity <= this.arrows[1].opacity ? this.arrows[0] : this.arrows[1];
        this.place(slot, showCell, next, 0.55);
      }
    }
    for (const a of this.arrows) {
      const want = a.cell >= 0 && a.cell === showCell ? 1 : 0;
      a.opacity += (want - a.opacity) * Math.min(1, dt * (want ? 3 : 5));
      this.apply(a, 0.92);
    }

    this.trailTime -= dt;
    for (const t of this.trail) {
      if (t.cell < 0) {
        t.opacity = 0;
      } else if (this.trailTime > 0) {
        t.delay -= dt;
        if (t.delay <= 0) t.opacity = Math.min(1, t.opacity + dt * 2.5);
        if (this.trailTime < 3) t.opacity = Math.min(t.opacity, this.trailTime / 3);
      } else {
        t.opacity = 0;
        t.cell = -1;
      }
      this.apply(t, 0.7);
    }
  }

  apply(slot, max) {
    slot.plane.material.opacity = slot.opacity * max;
    slot.holder.visible = slot.opacity > 0.01;
  }
}
