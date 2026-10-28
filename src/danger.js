import { CELL, WALK_SPEED, DANGER_MAX_CELLS, DANGER_SLACK, FLICKER_CELLS } from './config.js';

// Index along the main path where each key's dead end branches off.
function keyAttachments(layout) {
  const { maze, path, keys } = layout;
  const attach = new Int32Array(maze.size).fill(-1);
  const queue = [];
  path.forEach((c, i) => {
    attach[c] = i;
    queue.push(c);
  });
  for (let h = 0; h < queue.length; h++) {
    const c = queue[h];
    for (const n of maze.links(c)) {
      if (attach[n] < 0) {
        attach[n] = attach[c];
        queue.push(n);
      }
    }
  }
  return keys.map((k) => attach[k]);
}

function makeZone(path, from, to, final) {
  const cells = path.slice(from, to + 1);
  const seconds = Math.ceil((cells.length * CELL * DANGER_SLACK) / WALK_SPEED + 6);
  return {
    cells,
    set: new Set(cells),
    respawn: path[Math.max(0, from - 1)],
    toward: cells[0],
    end: cells[cells.length - 1],
    final,
    limit: seconds,
    state: 'idle',
    time: seconds,
  };
}

// Two alarm zones: the longer clear stretch after gate I or II, and the run from gate III to the exit.
// Plus two strips of failing lights elsewhere on the main path.
export function planHazards(layout) {
  const { path, gates } = layout;
  const index = new Map(path.map((c, i) => [c, i]));
  const attach = keyAttachments(layout);
  const gateB = gates.map((g) => index.get(g.b));

  const stretches = [
    [gateB[0], attach[1]],
    [gateB[1], attach[2]],
  ].map(([a, b]) => [a, Math.min(b, a + DANGER_MAX_CELLS - 1)]);
  stretches.sort((s, t) => t[1] - t[0] - (s[1] - s[0]));
  const zones = [];
  const [a, b] = stretches[0];
  if (b - a >= 3) zones.push(makeZone(path, a, b, false));
  const last = path.length - 1;
  zones.push(makeZone(path, Math.max(gateB[2], last - DANGER_MAX_CELLS + 1), last, true));

  const used = new Set(zones.flatMap((z) => z.cells));
  const flicker = new Set();
  for (const frac of [0.18, 0.5]) {
    let s = Math.floor(frac * path.length);
    while (s < path.length - FLICKER_CELLS && path.slice(s, s + FLICKER_CELLS + 1).some((c) => used.has(c))) s++;
    for (let i = s; i < s + FLICKER_CELLS && i < path.length; i++) if (i > 1) flicker.add(path[i]);
  }
  return { zones, flicker };
}

export class Hazards {
  constructor(layout) {
    const { zones, flicker } = planHazards(layout);
    this.zones = zones;
    this.flicker = flicker;
    this.active = null;
    this.grace = 0;
  }

  reset() {
    for (const z of this.zones) {
      z.state = 'idle';
      z.time = z.limit;
    }
    this.active = null;
    this.grace = 0;
  }

  // Returns 'start', 'clear', 'fail', 'tick' (one per second in the last five) or null.
  update(dt, cell, canStart) {
    this.grace = Math.max(0, this.grace - dt);
    const z = this.active;
    if (!z) {
      if (!canStart || this.grace > 0) return null;
      const hit = this.zones.find((zone) => zone.state === 'idle' && zone.set.has(cell));
      if (!hit) return null;
      hit.state = 'active';
      hit.time = hit.limit;
      this.active = hit;
      return 'start';
    }
    const before = Math.ceil(z.time);
    z.time -= dt;
    if (cell === z.end || (z.final && cell < 0)) {
      z.state = 'cleared';
      this.active = null;
      return 'clear';
    }
    if (z.time <= 0) {
      z.time = 0;
      return 'fail';
    }
    return Math.ceil(z.time) !== before && z.time < 5 ? 'tick' : null;
  }

  // After the player is caught for running out of time: the zone resets so it can be tried again.
  failed() {
    const z = this.active;
    if (!z) return null;
    z.state = 'idle';
    z.time = z.limit;
    this.active = null;
    this.grace = 2.5;
    return z;
  }

  lampMode(cell, base) {
    if (this.active?.set.has(cell)) return 'alarm';
    if (this.flicker.has(cell)) return 'flicker';
    return base;
  }
}
