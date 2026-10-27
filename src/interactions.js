import * as THREE from 'three';

const NUMERALS = ['I', 'II', 'III'];
const NEAR_GRAB = 0.24;
const RAY_GRAB = 4;
const RAY_WIDTH = 0.16;
const LOCK_TOUCH = 0.17;
const DESK_REACH = 2.2;

export class Interactions {
  constructor({ scene, camera, renderer, world, audio, game }) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.world = world;
    this.audio = audio;
    this.game = game;
    this.held = null;
    this.holder = null;
    this.flying = null;
    this.inserting = null;
    this.falling = [];
    this.prompt = '';
    this.desktopTarget = null;
  }

  reset() {
    this.held = null;
    this.holder = null;
    this.flying = null;
    this.inserting = null;
    this.falling = [];
    this.prompt = '';
    this.desktopTarget = null;
  }

  available() {
    return this.world.keys.filter((k) => k.state === 'hanging' || k.state === 'dropped');
  }

  worldPos(obj) {
    return obj.getWorldPosition(new THREE.Vector3());
  }

  // Headset ----------------------------------------------------------------
  squeeze(ctrl) {
    if (this.inserting || this.flying) return;
    if (this.held && this.holder === ctrl) {
      this.drop();
      return;
    }
    if (this.held) return;

    const grip = this.worldPos(ctrl.grip);
    let best = null;
    let bestD = NEAR_GRAB;
    for (const k of this.available()) {
      const d = this.worldPos(k.mesh).distanceTo(grip);
      if (d < bestD) {
        best = k;
        bestD = d;
      }
    }
    if (best) {
      this.attach(best, ctrl);
      return;
    }

    const origin = this.worldPos(ctrl.ctrl);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(ctrl.ctrl.getWorldQuaternion(new THREE.Quaternion()));
    let bestT = RAY_GRAB;
    for (const k of this.available()) {
      const v = this.worldPos(k.mesh).sub(origin);
      const t = v.dot(dir);
      if (t <= 0 || t > bestT) continue;
      if (v.addScaledVector(dir, -t).length() < RAY_WIDTH) {
        best = k;
        bestT = t;
      }
    }
    if (best) {
      this.scene.attach(best.mesh);
      best.state = 'flying';
      this.falling = this.falling.filter((f) => f.key !== best);
      this.flying = { key: best, ctrl, from: this.worldPos(best.mesh), t: 0 };
      this.audio.at('jingle', this.flying.from, 0.5, 1.15);
    }
  }

  attach(key, holder) {
    this.falling = this.falling.filter((f) => f.key !== key);
    key.state = 'held';
    key.holder = holder;
    this.held = key;
    this.holder = holder;
    if (holder === 'desktop') {
      this.camera.add(key.mesh);
      key.mesh.position.set(0.19, -0.16, -0.4);
      key.mesh.rotation.set(Math.PI / 2 - 0.35, 0.25, 0.5);
    } else {
      holder.grip.add(key.mesh);
      key.mesh.position.set(0, -0.012, -0.045);
      key.mesh.rotation.set(Math.PI / 2 + 0.25, 0, 0);
    }
    key.mesh.scale.setScalar(1.3);
    this.audio.at('jingle', this.worldPos(key.mesh), 0.75);
    this.game.onKeyChanged();
  }

  drop() {
    const key = this.held;
    if (!key) return;
    this.scene.attach(key.mesh);
    key.state = 'dropped';
    key.holder = null;
    this.held = null;
    this.holder = null;
    this.falling.push({ key, vy: 0 });
    this.game.onKeyChanged();
  }

  useOn(gate) {
    const key = this.held;
    if (!key || gate.state !== 'locked' || key.number !== gate.number) return;
    this.scene.attach(key.mesh);
    key.state = 'used';
    key.holder = null;
    this.held = null;
    this.holder = null;
    const lock = gate.lockWorld();
    const out = new THREE.Vector3(0, 0, 1).applyQuaternion(gate.group.quaternion);
    const shaftIntoLock = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    const reach = -key.tipLocal.y * key.mesh.scale.y - 0.01;
    this.inserting = {
      key,
      gate,
      t: 0,
      from: this.worldPos(key.mesh),
      fromQuat: key.mesh.quaternion.clone(),
      to: lock.clone().addScaledVector(out, reach),
      toQuat: gate.group.quaternion.clone().multiply(shaftIntoLock),
      turned: 0,
    };
  }

  // Frame ------------------------------------------------------------------
  update(dt) {
    const xr = this.renderer.xr.isPresenting;

    if (this.flying) {
      const f = this.flying;
      f.t += dt / 0.28;
      const target = this.worldPos(f.ctrl.grip);
      const t = Math.min(1, f.t);
      f.key.mesh.position.lerpVectors(f.from, target, t * t * (3 - 2 * t));
      if (f.t >= 1) {
        this.flying = null;
        this.attach(f.key, f.ctrl);
      }
    }

    if (this.inserting) {
      const s = this.inserting;
      s.t += dt;
      if (s.t <= 0.4) {
        const t = Math.min(1, s.t / 0.35);
        s.key.mesh.position.lerpVectors(s.from, s.to, t * t * (3 - 2 * t));
        s.key.mesh.quaternion.slerpQuaternions(s.fromQuat, s.toQuat, t);
      } else {
        if (s.turned === 0) this.audio.at('unlock', s.to, 1);
        const step = Math.min(Math.PI / 2 - s.turned, dt * 8);
        s.turned += step;
        s.key.mesh.rotateY(step);
      }
      if (s.t > 0.62) {
        s.key.mesh.visible = false;
        this.world.unlockGate(s.gate);
        this.audio.at('grind', this.worldPos(s.gate.group).setY(1.5), 1);
        this.game.onGateOpened(s.gate);
        this.inserting = null;
      }
    }

    for (const f of this.falling) {
      const p = f.key.mesh.position;
      f.vy -= 9.8 * dt;
      p.y += f.vy * dt;
      if (p.y <= 0.012) {
        p.y = 0.012;
        if (Math.abs(f.vy) > 0.6) this.audio.at('clank', p, 0.4, 1.4);
        f.done = true;
        f.key.mesh.rotation.set(-Math.PI / 2, Math.random() * Math.PI * 2, 0, 'YXZ');
        this.game.onKeyChanged();
      }
    }
    this.falling = this.falling.filter((f) => !f.done);

    if (xr) {
      this.prompt = '';
      this.desktopTarget = null;
      if (this.held && this.holder !== 'desktop') {
        const gate = this.game.currentGate;
        if (gate && gate.state === 'locked' && this.held.tip().distanceTo(gate.lockWorld()) < LOCK_TOUCH) {
          this.useOn(gate);
        }
      }
      return;
    }

    this.updateDesktopPrompt();
  }

  updateDesktopPrompt() {
    this.prompt = '';
    this.desktopTarget = null;
    if (this.inserting || this.flying) return;
    const head = this.worldPos(this.camera);
    const fwd = this.camera.getWorldDirection(new THREE.Vector3());

    const inView = (p, maxAngle) => {
      const v = p.clone().sub(head);
      const d = v.length();
      return d < DESK_REACH && v.normalize().dot(fwd) > Math.cos(maxAngle);
    };

    if (!this.held) {
      for (const k of this.available()) {
        if (inView(this.worldPos(k.mesh), 0.5)) {
          this.desktopTarget = k;
          this.prompt = `Press E to take key ${NUMERALS[k.number]}`;
          return;
        }
      }
      const gate = this.game.currentGate;
      if (gate && gate.state === 'locked' && inView(gate.lockWorld(), 0.55)) {
        this.prompt = `Locked. Gate ${NUMERALS[gate.number]} needs key ${NUMERALS[gate.number]}`;
      }
      return;
    }

    const gate = this.game.currentGate;
    if (gate && gate.state === 'locked' && inView(gate.lockWorld(), 0.55)) {
      this.desktopTarget = gate;
      this.prompt = `Press E to unlock gate ${NUMERALS[gate.number]}`;
    }
  }

  desktopUse() {
    const t = this.desktopTarget;
    if (!t) return;
    if (this.world.keys.includes(t)) this.attach(t, 'desktop');
    else this.useOn(t);
  }
}
