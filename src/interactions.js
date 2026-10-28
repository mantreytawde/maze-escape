import * as THREE from 'three';
import { KEY_PICKUP, GATE_REACH } from './config.js';
import { NUMERALS } from './game.js';

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,220,140,0.9)');
  grad.addColorStop(0.35, 'rgba(255,190,90,0.35)');
  grad.addColorStop(1, 'rgba(255,170,60,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Keys are collected just by walking up to them and go into your pocket (no holding anything).
// Walk up to the gate with its key and it flies out of your hand into the padlock by itself.
export class Interactions {
  constructor({ scene, camera, renderer, world, audio, game, player }) {
    Object.assign(this, { scene, camera, renderer, world, audio, game, player });
    this.onCollect = null;
    this.onUnlock = null;
    this.onLockedGate = null;

    const tex = glowTexture();
    this.glows = world.keys.map((k) => {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
      );
      s.scale.setScalar(0.5);
      s.position.copy(k.home);
      scene.add(s);
      return s;
    });
    this.reset();
  }

  reset() {
    this.flying = [];
    this.inserting = null;
    this.prompt = '';
    this.lockedNotice = 0;
  }

  handPoint() {
    if (this.renderer.xr.isPresenting) {
      const c = this.player.hand('right') ?? this.player.controllers.find((x) => x.source);
      if (c?.source) {
        const obj = c.source.hand ? c.hand.joints?.['wrist'] ?? c.grip : c.grip;
        const p = obj.getWorldPosition(new THREE.Vector3());
        if (p.lengthSq() > 0) return p;
      }
    }
    return this.camera.localToWorld(new THREE.Vector3(0.2, -0.25, -0.45));
  }

  collect(key) {
    key.state = 'collected';
    this.scene.attach(key.mesh);
    this.flying.push({ key, from: key.mesh.position.clone(), t: 0 });
    this.audio.at('jingle', key.mesh.position, 0.9);
    this.audio.play('correct', 0.35);
    this.game.onKeyChanged();
    this.onCollect?.(key);
  }

  // The padlock side of the gate is the side you arrive from.
  nearLock(gate, head) {
    const lock = gate.lockWorld();
    const d = Math.hypot(head.x - lock.x, head.z - lock.z);
    const out = new THREE.Vector3(0, 0, 1).applyQuaternion(gate.group.quaternion);
    const side = (head.x - lock.x) * out.x + (head.z - lock.z) * out.z;
    return { d, front: side > -0.1 };
  }

  unlock(gate) {
    const key = this.world.keys[gate.number];
    key.state = 'inserting';
    key.mesh.visible = true;
    key.mesh.scale.setScalar(1.3);
    const lock = gate.lockWorld();
    const out = new THREE.Vector3(0, 0, 1).applyQuaternion(gate.group.quaternion);
    const shaftIntoLock = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    const reach = -key.tipLocal.y * 1.3 - 0.01;
    const from = this.handPoint();
    key.mesh.position.copy(from);
    this.inserting = {
      key,
      gate,
      t: 0,
      from,
      fromQuat: key.mesh.quaternion.clone(),
      to: lock.clone().addScaledVector(out, reach),
      toQuat: gate.group.quaternion.clone().multiply(shaftIntoLock),
      turned: 0,
    };
    this.audio.at('jingle', from, 0.6, 1.1);
  }

  desktopUse() {
    const gate = this.game.currentGate;
    if (!gate || gate.state !== 'locked' || this.inserting) return;
    const key = this.world.keys[gate.number];
    if (key.state !== 'collected') return;
    const head = this.camera.getWorldPosition(new THREE.Vector3());
    if (this.nearLock(gate, head).d < GATE_REACH + 1) this.unlock(gate);
  }

  update(dt, head, time) {
    this.prompt = '';
    this.lockedNotice = Math.max(0, this.lockedNotice - dt);

    for (let i = 0; i < this.world.keys.length; i++) {
      const k = this.world.keys[i];
      const glow = this.glows[i];
      glow.visible = k.state === 'hanging';
      if (glow.visible) {
        glow.material.opacity = 0.55 + Math.sin(time * 3 + i) * 0.25;
        k.mesh.rotation.z = Math.sin(time * 1.7 + i) * 0.12;
        const dy = Math.abs(head.y - k.home.y);
        if (this.game.running && Math.hypot(head.x - k.home.x, head.z - k.home.z) < KEY_PICKUP && dy < 1.4) {
          this.collect(k);
        }
      }
    }

    for (const f of this.flying) {
      f.t += dt / 0.45;
      const t = Math.min(1, f.t);
      const target = this.handPoint();
      const p = f.key.mesh.position.lerpVectors(f.from, target, t * t * (3 - 2 * t));
      p.y += Math.sin(t * Math.PI) * 0.25;
      f.key.mesh.rotation.y += dt * 12;
      f.key.mesh.scale.setScalar(1.3 * (1 - t * 0.7));
      if (f.t >= 1) {
        f.key.mesh.visible = false;
        f.done = true;
      }
    }
    this.flying = this.flying.filter((f) => !f.done);

    if (this.inserting) {
      const s = this.inserting;
      s.t += dt;
      if (s.t <= 0.55) {
        const t = Math.min(1, s.t / 0.5);
        s.key.mesh.position.lerpVectors(s.from, s.to, t * t * (3 - 2 * t));
        s.key.mesh.quaternion.slerpQuaternions(s.fromQuat, s.toQuat, t);
      } else {
        if (s.turned === 0) this.audio.at('unlock', s.to, 1);
        const step = Math.min(Math.PI / 2 - s.turned, dt * 8);
        s.turned += step;
        s.key.mesh.rotateY(step);
      }
      if (s.t > 0.8) {
        s.key.mesh.visible = false;
        s.key.state = 'used';
        this.world.unlockGate(s.gate);
        this.audio.at('grind', s.gate.group.getWorldPosition(new THREE.Vector3()).setY(1.5), 1);
        this.game.onGateOpened(s.gate);
        this.onUnlock?.(s.gate);
        this.inserting = null;
      }
      return;
    }

    const gate = this.game.currentGate;
    if (!gate || gate.state !== 'locked' || !this.game.running) return;
    const key = this.world.keys[gate.number];
    const { d, front } = this.nearLock(gate, head);
    if (d > GATE_REACH + 1.2) return;
    const n = NUMERALS[gate.number];
    if (key.state === 'collected') {
      if (d < GATE_REACH && front) this.unlock(gate);
      else this.prompt = `Walk up to gate ${n} to unlock it`;
    } else {
      this.prompt = `Gate ${n} is locked. Find key ${n}`;
      if (d < GATE_REACH && this.lockedNotice <= 0) {
        this.lockedNotice = 6;
        this.onLockedGate?.(gate);
      }
    }
  }
}
