import { LIVES } from './config.js';

export const NUMERALS = ['I', 'II', 'III'];

export class Game {
  constructor({ world, hints, layout }) {
    this.world = world;
    this.hints = hints;
    this.layout = layout;
    this.onFinish = null;
    this.reset();
  }

  reset() {
    this.stage = 0;
    this.time = 0;
    this.running = false;
    this.finished = false;
    this.lives = LIVES;
    this.catches = 0;
    this.zonesCleared = 0;
    this.zonesFailed = 0;
  }

  start() {
    this.running = true;
  }

  get currentGate() {
    return this.stage < 3 ? this.world.gates[this.stage] : null;
  }

  get currentKey() {
    return this.stage < 3 ? this.world.keys[this.stage] : null;
  }

  get keysHeld() {
    return this.world.keys.filter((k) => k.state === 'collected' || k.state === 'inserting').length;
  }

  // Which keys the HUD shows: 'held', 'used' or 'missing' for each.
  keySlots() {
    return this.world.keys.map((k) =>
      k.state === 'collected' || k.state === 'inserting' ? 'held' : k.state === 'used' ? 'used' : 'missing',
    );
  }

  objective() {
    if (this.finished) return 'You escaped!';
    const key = this.currentKey;
    if (!key) return 'Find the way out';
    const n = NUMERALS[key.number];
    if (key.state === 'collected') return `Take key ${n} to gate ${n}`;
    if (key.state === 'inserting' || key.state === 'used') return `Gate ${n} is opening`;
    return `Find key ${n}`;
  }

  targetCell() {
    const key = this.currentKey;
    if (!key) return this.layout.exit;
    if (key.state !== 'hanging') return this.currentGate.edge.a;
    return key.cell;
  }

  // Where the route for the current step begins.
  anchorCell() {
    const key = this.currentKey;
    if (!key) return this.world.gates[2].edge.a;
    if (key.state !== 'hanging') return key.cell;
    return key.number === 0 ? this.layout.start : this.world.gates[key.number - 1].edge.a;
  }

  refreshRoute() {
    return this.hints.setRoute(this.anchorCell(), this.targetCell());
  }

  onKeyChanged() {
    this.refreshRoute();
  }

  onGateOpened() {
    this.stage++;
    this.refreshRoute();
  }

  loseLife() {
    this.lives = Math.max(0, this.lives - 1);
    return this.lives;
  }

  update(dt, head) {
    if (!this.running || this.finished) return;
    this.time += dt;
    const z = this.world.exitZone;
    if (this.stage === 3 && head.x > z.minx && head.z > z.minz && head.z < z.maxz) {
      this.finished = true;
      this.onFinish?.();
    }
  }
}

export function formatTime(seconds) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
