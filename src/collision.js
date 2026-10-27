import { CELL, WALL_H } from './config.js';

const PAD = 0.8;

export class Collision {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.grid = Array.from({ length: width * height }, () => []);
    this.boxes = [];
  }

  addBox(minx, maxx, minz, maxz, maxy = WALL_H) {
    const box = { minx, maxx, minz, maxz, maxy, enabled: true };
    this.boxes.push(box);
    const x0 = this.clampX(Math.floor((minx - PAD) / CELL));
    const x1 = this.clampX(Math.floor((maxx + PAD) / CELL));
    const z0 = this.clampZ(Math.floor((minz - PAD) / CELL));
    const z1 = this.clampZ(Math.floor((maxz + PAD) / CELL));
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) this.grid[z * this.width + x].push(box);
    }
    return box;
  }

  clampX(x) {
    return Math.min(this.width - 1, Math.max(0, x));
  }

  clampZ(z) {
    return Math.min(this.height - 1, Math.max(0, z));
  }

  near(x, z) {
    const cx = this.clampX(Math.floor(x / CELL));
    const cz = this.clampZ(Math.floor(z / CELL));
    return this.grid[cz * this.width + cx];
  }

  resolveCircle(pos, radius) {
    let moved = false;
    for (let pass = 0; pass < 3; pass++) {
      let any = false;
      for (const b of this.near(pos.x, pos.z)) {
        if (!b.enabled) continue;
        const cx = Math.min(b.maxx, Math.max(b.minx, pos.x));
        const cz = Math.min(b.maxz, Math.max(b.minz, pos.z));
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          const push = (radius - d) / d;
          pos.x += dx * push;
          pos.z += dz * push;
        } else {
          const left = pos.x - b.minx + radius;
          const right = b.maxx - pos.x + radius;
          const back = pos.z - b.minz + radius;
          const front = b.maxz - pos.z + radius;
          const m = Math.min(left, right, back, front);
          if (m === left) pos.x -= left;
          else if (m === right) pos.x += right;
          else if (m === back) pos.z -= back;
          else pos.z += front;
        }
        any = true;
        moved = true;
      }
      if (!any) break;
    }
    return moved;
  }

  pointBlocked(x, y, z) {
    if (y >= WALL_H - 0.02) return true;
    for (const b of this.near(x, z)) {
      if (!b.enabled || y > b.maxy) continue;
      if (x >= b.minx && x <= b.maxx && z >= b.minz && z <= b.maxz) return true;
    }
    return false;
  }
}
