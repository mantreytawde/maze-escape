import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import {
  EYE_HEIGHT,
  PLAYER_RADIUS,
  WALK_SPEED,
  TELEPORT_SPEED,
  TELEPORT_COOLDOWN,
  SNAP_ANGLE,
} from './config.js';

const ARC_POINTS = 100;
const UP = new THREE.Vector3(0, 1, 0);

function stick(source) {
  const gp = source?.gamepad;
  if (!gp) return [0, 0];
  const a = gp.axes;
  return a.length >= 4 ? [a[2], a[3]] : [a[0] ?? 0, a[1] ?? 0];
}

export class Player {
  constructor({ renderer, camera, scene, collision, audio }) {
    this.renderer = renderer;
    this.camera = camera;
    this.scene = scene;
    this.collision = collision;
    this.audio = audio;

    this.rig = new THREE.Group();
    this.rig.add(camera);
    scene.add(this.rig);
    camera.position.set(0, EYE_HEIGHT, 0);

    this.yaw = 0;
    this.pitch = 0;
    this.keysDown = new Set();
    this.enabled = false;
    this.stepDistance = 0;
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.teleportCooldown = 0;
    this.aiming = false;
    this.turnArmed = true;
    this.pendingRecenter = null;

    this.onSqueeze = null;
    this.onPrimary = null;

    this.buildControllers();
    this.buildTeleportVisuals();
    this.buildFade();
    this.bindDesktop();

    renderer.xr.addEventListener('sessionstart', () => this.enterXR());
    renderer.xr.addEventListener('sessionend', () => this.exitXR());
  }

  // Setup ------------------------------------------------------------------
  buildControllers() {
    const factory = new XRControllerModelFactory();
    this.controllers = [0, 1].map((i) => {
      const ctrl = this.renderer.xr.getController(i);
      const grip = this.renderer.xr.getControllerGrip(i);
      grip.add(factory.createControllerModel(grip));
      this.rig.add(ctrl, grip);
      const state = { index: i, ctrl, grip, source: null, handedness: null, prev: [] };
      ctrl.addEventListener('connected', (e) => {
        state.source = e.data;
        state.handedness = e.data.handedness;
        state.prev = [];
      });
      ctrl.addEventListener('disconnected', () => {
        state.source = null;
        state.handedness = null;
      });

      const pointer = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -0.35)]),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 }),
      );
      ctrl.add(pointer);
      return state;
    });
  }

  hand(side) {
    return this.controllers.find((c) => c.handedness === side) ?? null;
  }

  buildTeleportVisuals() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARC_POINTS * 3), 3));
    this.arc = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0x9fd6ff, transparent: true, opacity: 0.85 }),
    );
    this.arc.frustumCulled = false;
    this.arc.visible = false;
    this.scene.add(this.arc);

    this.marker = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.25, 40),
      new THREE.MeshBasicMaterial({ color: 0x9fd6ff, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.012;
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.2, 40),
      new THREE.MeshBasicMaterial({ color: 0x9fd6ff, transparent: true, opacity: 0.15, depthWrite: false }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.011;
    this.marker.add(ring, disc);
    this.marker.visible = false;
    this.scene.add(this.marker);
    this.teleportTarget = new THREE.Vector3();
    this.teleportValid = false;
  }

  buildFade() {
    this.fadeMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    const fade = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.fadeMat);
    fade.position.z = -0.1;
    fade.renderOrder = 9000;
    fade.frustumCulled = false;
    this.camera.add(fade);
    this.fadeMesh = fade;
    this.fade = 0;
    this.fadeTarget = 0;
    this.fadeSpeed = 6;
  }

  fadeTo(value, speed = 6, color = 0x000000) {
    this.fadeTarget = value;
    this.fadeSpeed = speed;
    this.fadeMat.color.set(color);
  }

  blink() {
    this.fadeMat.color.set(0x000000);
    this.fade = 1;
    this.fadeTarget = 0;
    this.fadeSpeed = 6;
  }

  bindDesktop() {
    const canvas = this.renderer.domElement;
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas || !this.enabled) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch - e.movementY * 0.0022));
    });
    document.addEventListener('keydown', (e) => {
      this.keysDown.add(e.code);
      if (e.repeat || !this.enabled) return;
      if (e.code === 'KeyE') this.onUse?.();
      if (e.code === 'KeyH') this.onHint?.();
    });
    document.addEventListener('keyup', (e) => this.keysDown.delete(e.code));
    window.addEventListener('blur', () => this.keysDown.clear());
  }

  // Position helpers -------------------------------------------------------
  head() {
    this.rig.updateMatrixWorld(true);
    return this.rig.localToWorld(this.camera.position.clone());
  }

  headYaw() {
    const q = this.rig.quaternion.clone().multiply(this.camera.quaternion);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    return Math.atan2(-f.x, -f.z);
  }

  spawn(x, z, yaw) {
    this.yaw = yaw;
    this.pitch = 0;
    this.rig.rotation.set(0, yaw, 0);
    this.rig.position.set(x, 0, z);
    if (this.renderer.xr.isPresenting) {
      this.pendingRecenter = { x, z, yaw, frames: 2 };
    }
  }

  shiftHeadTo(x, z) {
    const h = this.head();
    this.rig.position.x += x - h.x;
    this.rig.position.z += z - h.z;
  }

  turn(angle) {
    const before = this.head();
    this.rig.rotation.y += angle;
    const after = this.head();
    this.rig.position.x += before.x - after.x;
    this.rig.position.z += before.z - after.z;
  }

  enterXR() {
    const x = this.rig.position.x;
    const z = this.rig.position.z;
    this.camera.position.set(0, 0, 0);
    this.camera.rotation.set(0, 0, 0);
    this.pendingRecenter = { x, z, yaw: this.yaw, frames: 2 };
  }

  exitXR() {
    const h = this.head();
    this.yaw = this.headYaw();
    this.pitch = 0;
    this.rig.rotation.set(0, this.yaw, 0);
    this.rig.position.set(h.x, 0, h.z);
    this.camera.position.set(0, EYE_HEIGHT, 0);
    this.camera.rotation.set(0, 0, 0);
    this.arc.visible = false;
    this.marker.visible = false;
    this.aiming = false;
  }

  // Desktop ----------------------------------------------------------------
  updateDesktop(dt) {
    const k = this.keysDown;
    let f = 0;
    let s = 0;
    if (this.enabled) {
      f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      s = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    }
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let mx = -sin * f + cos * s;
    let mz = -cos * f - sin * s;
    const len = Math.hypot(mx, mz);
    let moved = 0;
    if (len > 0) {
      mx = (mx / len) * WALK_SPEED * dt;
      mz = (mz / len) * WALK_SPEED * dt;
      const pos = { x: this.rig.position.x + mx, z: this.rig.position.z + mz };
      this.collision.resolveCircle(pos, PLAYER_RADIUS);
      moved = Math.hypot(pos.x - this.rig.position.x, pos.z - this.rig.position.z);
      this.rig.position.x = pos.x;
      this.rig.position.z = pos.z;
    }

    this.bobAmount += ((moved > 0.0005 ? 1 : 0) - this.bobAmount) * Math.min(1, dt * 6);
    this.bobPhase += moved * ((2 * Math.PI) / 1.5);
    this.camera.position.set(
      Math.cos(this.bobPhase * 0.5) * 0.012 * this.bobAmount,
      EYE_HEIGHT + Math.sin(this.bobPhase) * 0.02 * this.bobAmount,
      0,
    );
    this.stepDistance += moved;
    if (this.stepDistance > 0.75) {
      this.stepDistance = 0;
      this.audio.step();
    }

    this.rig.rotation.set(0, this.yaw, 0);
    this.camera.rotation.set(this.pitch, 0, 0);
  }

  // Headset ----------------------------------------------------------------
  updateXR(dt) {
    if (this.pendingRecenter && --this.pendingRecenter.frames <= 0) {
      const { x, z, yaw } = this.pendingRecenter;
      this.turn(yaw - this.headYaw());
      this.shiftHeadTo(x, z);
      this.pendingRecenter = null;
    }

    this.teleportCooldown = Math.max(0, this.teleportCooldown - dt);
    const left = this.hand('left');
    const right = this.hand('right');

    for (const c of this.controllers) {
      const gp = c.source?.gamepad;
      if (!gp) continue;
      const pressed = gp.buttons.map((b) => b.pressed);
      if (this.enabled) {
        if (pressed[1] && !c.prev[1]) this.onSqueeze?.(c);
        if ((pressed[4] && !c.prev[4]) || (pressed[5] && !c.prev[5])) this.onPrimary?.(c);
      }
      c.prev = pressed;
    }

    if (this.enabled && left) {
      const [x, y] = stick(left.source);
      if (Math.hypot(x, y) > 0.18) {
        const q = this.rig.quaternion.clone().multiply(this.camera.quaternion);
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q).setY(0).normalize();
        const side = new THREE.Vector3().crossVectors(fwd, UP);
        const move = fwd.multiplyScalar(-y).addScaledVector(side, x).multiplyScalar(WALK_SPEED * dt);
        const h = this.head();
        const pos = { x: h.x + move.x, z: h.z + move.z };
        this.collision.resolveCircle(pos, PLAYER_RADIUS);
        const moved = Math.hypot(pos.x - h.x, pos.z - h.z);
        this.rig.position.x += pos.x - h.x;
        this.rig.position.z += pos.z - h.z;
        this.stepDistance += moved;
        if (this.stepDistance > 0.75) {
          this.stepDistance = 0;
          this.audio.step();
        }
      }
    }

    if (this.enabled && right) {
      const [x, y] = stick(right.source);
      if (y < -0.6 && this.teleportCooldown <= 0) this.aiming = true;
      if (this.aiming) {
        this.updateArc(right);
        if (Math.abs(y) < 0.25 && Math.abs(x) < 0.25) {
          this.aiming = false;
          this.arc.visible = false;
          this.marker.visible = false;
          if (this.teleportValid) this.teleport(this.teleportTarget);
        }
      } else {
        if (Math.abs(x) < 0.3) this.turnArmed = true;
        if (this.turnArmed && Math.abs(x) > 0.7) {
          this.turnArmed = false;
          this.turn(x > 0 ? -SNAP_ANGLE : SNAP_ANGLE);
        }
      }
    } else {
      this.aiming = false;
      this.arc.visible = false;
      this.marker.visible = false;
    }

    // Keep the head out of walls when the player physically steps into one.
    const h = this.head();
    const pos = { x: h.x, z: h.z };
    if (this.collision.resolveCircle(pos, PLAYER_RADIUS * 0.75)) {
      this.rig.position.x += pos.x - h.x;
      this.rig.position.z += pos.z - h.z;
    }
  }

  updateArc(ctrl) {
    const origin = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    ctrl.ctrl.getWorldPosition(origin);
    ctrl.ctrl.getWorldQuaternion(quat);
    const vel = new THREE.Vector3(0, 0, -1).applyQuaternion(quat).multiplyScalar(TELEPORT_SPEED);
    const positions = this.arc.geometry.attributes.position;
    const p = origin.clone();
    const next = new THREE.Vector3();
    let count = 0;
    let valid = false;
    positions.setXYZ(count++, p.x, p.y, p.z);
    const step = 0.02;
    while (count < ARC_POINTS) {
      next.copy(p).addScaledVector(vel, step);
      vel.y -= 9.8 * step;
      if (next.y <= 0) {
        const t = p.y / (p.y - next.y);
        next.lerpVectors(p, next, t);
        next.y = 0;
        positions.setXYZ(count++, next.x, next.y, next.z);
        valid = true;
        break;
      }
      if (this.collision.pointBlocked(next.x, next.y, next.z)) {
        positions.setXYZ(count++, next.x, next.y, next.z);
        break;
      }
      positions.setXYZ(count++, next.x, next.y, next.z);
      p.copy(next);
    }
    positions.needsUpdate = true;
    this.arc.geometry.setDrawRange(0, count);
    this.arc.visible = true;

    if (valid) {
      const pos = { x: next.x, z: next.z };
      this.collision.resolveCircle(pos, PLAYER_RADIUS);
      const h = this.head();
      valid = Math.hypot(pos.x - h.x, pos.z - h.z) > 0.3;
      this.teleportTarget.set(pos.x, 0, pos.z);
    }
    this.teleportValid = valid;
    const color = valid ? 0x9fd6ff : 0xff7a66;
    this.arc.material.color.set(color);
    this.marker.visible = valid;
    if (valid) this.marker.position.copy(this.teleportTarget);
  }

  teleport(target) {
    this.blink();
    this.shiftHeadTo(target.x, target.z);
    this.teleportCooldown = TELEPORT_COOLDOWN;
    this.audio.step();
    setTimeout(() => this.audio.step(), 190);
  }

  // Frame ------------------------------------------------------------------
  update(dt) {
    if (this.renderer.xr.isPresenting) this.updateXR(dt);
    else this.updateDesktop(dt);

    if (this.fade !== this.fadeTarget) {
      const d = this.fadeTarget - this.fade;
      const stepSize = dt * this.fadeSpeed;
      this.fade = Math.abs(d) <= stepSize ? this.fadeTarget : this.fade + Math.sign(d) * stepSize;
    }
    this.fadeMat.opacity = this.fade;
    this.fadeMesh.visible = this.fade > 0.001;
  }
}
