import {
  CELL,
  MAZE_W,
  MAZE_H,
  MIN_ROUTE_CELLS,
  MAX_ROUTE_CELLS,
  GATE_FRACTIONS,
  KEY_MIN_DEPTH,
  KEY_MAX_DEPTH,
} from './config.js';

export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;

export const DIRS = [
  { bit: N, opp: S, dx: 0, dz: -1 },
  { bit: E, opp: W, dx: 1, dz: 0 },
  { bit: S, opp: N, dx: 0, dz: 1 },
  { bit: W, opp: E, dx: -1, dz: 0 },
];

export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Maze {
  constructor(width, height, open) {
    this.width = width;
    this.height = height;
    this.open = open;
  }

  get size() {
    return this.width * this.height;
  }

  idx(x, z) {
    return z * this.width + x;
  }

  cx(i) {
    return i % this.width;
  }

  cz(i) {
    return Math.floor(i / this.width);
  }

  center(i) {
    return { x: (this.cx(i) + 0.5) * CELL, z: (this.cz(i) + 0.5) * CELL };
  }

  cellAt(x, z) {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    if (cx < 0 || cz < 0 || cx >= this.width || cz >= this.height) return -1;
    return this.idx(cx, cz);
  }

  neighbor(i, dir) {
    const x = this.cx(i) + dir.dx;
    const z = this.cz(i) + dir.dz;
    if (x < 0 || z < 0 || x >= this.width || z >= this.height) return -1;
    return this.idx(x, z);
  }

  links(i) {
    const out = [];
    for (const dir of DIRS) {
      if (this.open[i] & dir.bit) {
        const n = this.neighbor(i, dir);
        if (n >= 0) out.push(n);
      }
    }
    return out;
  }

  degree(i) {
    return this.links(i).length;
  }

  dirBetween(a, b) {
    const dx = this.cx(b) - this.cx(a);
    const dz = this.cz(b) - this.cz(a);
    return DIRS.find((d) => d.dx === dx && d.dz === dz);
  }

  distances(from) {
    const dist = new Int32Array(this.size).fill(-1);
    const prev = new Int32Array(this.size).fill(-1);
    const queue = new Int32Array(this.size);
    let head = 0;
    let tail = 0;
    dist[from] = 0;
    queue[tail++] = from;
    while (head < tail) {
      const c = queue[head++];
      for (const n of this.links(c)) {
        if (dist[n] < 0) {
          dist[n] = dist[c] + 1;
          prev[n] = c;
          queue[tail++] = n;
        }
      }
    }
    return { dist, prev };
  }

  path(from, to) {
    const { prev } = this.distances(from);
    const out = [];
    for (let c = to; c >= 0; c = prev[c]) out.push(c);
    out.reverse();
    return out[0] === from ? out : [];
  }
}

function carve(width, height, rng) {
  const open = new Uint8Array(width * height);
  const visited = new Uint8Array(width * height);
  const maze = new Maze(width, height, open);
  const first = Math.floor(rng() * width * height);
  const active = [first];
  visited[first] = 1;

  while (active.length) {
    const pick = rng() < 0.72 ? active.length - 1 : Math.floor(rng() * active.length);
    const c = active[pick];
    const options = [];
    for (const dir of DIRS) {
      const n = maze.neighbor(c, dir);
      if (n >= 0 && !visited[n]) options.push([dir, n]);
    }
    if (!options.length) {
      active.splice(pick, 1);
      continue;
    }
    const [dir, n] = options[Math.floor(rng() * options.length)];
    open[c] |= dir.bit;
    open[n] |= dir.opp;
    visited[n] = 1;
    active.push(n);
  }
  return maze;
}

function tryLayout(seed) {
  const rng = makeRng(seed);
  const maze = carve(MAZE_W, MAZE_H, rng);
  const start = maze.idx(0, MAZE_H - 1);
  const exit = maze.idx(MAZE_W - 1, 0);
  const path = maze.path(start, exit);
  if (path.length < 26) return null;

  const gateAt = GATE_FRACTIONS.map((f) => Math.floor(f * (path.length - 1)));

  const onPath = new Int32Array(maze.size).fill(-1);
  path.forEach((c, i) => (onPath[c] = i));

  // Every off-route cell hangs off exactly one route cell, since the maze is a tree.
  const attach = new Int32Array(maze.size).fill(-1);
  const depth = new Int32Array(maze.size).fill(-1);
  const queue = [];
  for (const c of path) {
    attach[c] = onPath[c];
    depth[c] = 0;
    queue.push(c);
  }
  for (let h = 0; h < queue.length; h++) {
    const c = queue[h];
    for (const n of maze.links(c)) {
      if (depth[n] < 0) {
        depth[n] = depth[c] + 1;
        attach[n] = attach[c];
        queue.push(n);
      }
    }
  }

  const keys = [];
  for (let k = 0; k < 3; k++) {
    const lo = k === 0 ? 0 : gateAt[k - 1] + 1;
    const hi = gateAt[k];
    let best = -1;
    for (let c = 0; c < maze.size; c++) {
      if (onPath[c] >= 0 || c === start || c === exit) continue;
      if (maze.degree(c) !== 1) continue;
      if (attach[c] < lo || attach[c] > hi) continue;
      if (depth[c] < KEY_MIN_DEPTH || depth[c] > KEY_MAX_DEPTH) continue;
      if (best < 0 || depth[c] > depth[best]) best = c;
    }
    if (best < 0) return null;
    keys.push(best);
  }

  const legs = [start, ...keys, exit];
  let route = 0;
  for (let i = 0; i < legs.length - 1; i++) {
    route += maze.distances(legs[i]).dist[legs[i + 1]];
  }
  if (route < MIN_ROUTE_CELLS || route > MAX_ROUTE_CELLS) return null;

  const gates = gateAt.map((g) => ({ a: path[g], b: path[g + 1] }));
  return { seed, maze, start, exit, path, gates, keys, route };
}

export function buildLayout(seed) {
  for (let s = seed; s < seed + 4000; s++) {
    const layout = tryLayout(s);
    if (layout) return layout;
  }
  throw new Error('No maze layout met the route length limits.');
}
