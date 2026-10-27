const NUMERALS = ['I', 'II', 'III'];

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

  objective() {
    if (this.finished) return 'You are out.';
    const key = this.currentKey;
    if (!key) return 'Find the way out';
    const n = NUMERALS[key.number];
    if (key.state === 'held' || key.state === 'flying') return `Take key ${n} to gate ${n}`;
    if (key.state === 'dropped') return `Pick up key ${n} again`;
    if (key.state === 'used') return `Gate ${n} is opening`;
    return `Find key ${n}`;
  }

  targetCell() {
    const maze = this.world.maze;
    const key = this.currentKey;
    if (!key) return this.layout.exit;
    if (key.state === 'held' || key.state === 'flying' || key.state === 'used') return this.currentGate.edge.a;
    if (key.state === 'dropped') {
      const c = maze.cellAt(key.mesh.position.x, key.mesh.position.z);
      return c >= 0 ? c : key.cell;
    }
    return key.cell;
  }

  onKeyChanged() {
    this.hints.setTarget(this.targetCell());
  }

  onGateOpened() {
    this.stage++;
    this.hints.setTarget(this.targetCell());
  }

  update(dt, head) {
    if (!this.running || this.finished) return;
    this.time += dt;
    this.hints.setTarget(this.targetCell());
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
