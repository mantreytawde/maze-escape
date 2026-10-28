import { buildLayout } from '../src/maze.js';
import { CELL, MAZE_SEED } from '../src/config.js';

const t0 = performance.now();
const layout = buildLayout(MAZE_SEED);
const ms = performance.now() - t0;

const metres = layout.route * CELL;
const pace = (speed) => {
  const s = Math.round(metres / speed);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

console.log(`seed ${layout.seed} found in ${ms.toFixed(0)} ms`);
console.log(`main path ${layout.path.length} cells, full route ${layout.route} cells (${metres} m)`);
console.log(`walking at 1.8 m/s: ${pace(1.8)}`);
