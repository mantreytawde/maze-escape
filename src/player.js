import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { newGesture, readGesture, classifyLocomotion } from './gestures.js';
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
const GESTURE_HOLD = 0.12;

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
    this.frozen = false;
    this.uiLock = false;
    this.comfort = true;
    this.bounds = null;
    this.shake = 0;
    this.stepDistance = 0;
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.teleportCooldown = 0;
    this.aiming = false;
    this.turnArmed = true;
    this.pendingRecenter = null;
    this.moving = false;
    this.vignettePulse = 0;
    this.stats = { forward: 0, back: 0, turns: 0, teleports: 0 };

    this.onUse = null;
    this.onMenu = null;
    this.onAnswerKey = null;

    this.buildControllers();
    this.buildTeleportVisuals();
    this.buildFade();
    this.buildVignette();
    this.bindDesktop();

    renderer.xr.addEventListener('sessionstart', () => this.enterXR());
    renderer.xr.addEventListener('sessionend', () => this.exitXR());
  }

  get active() {
    return this.enabled && !this.frozen && !this.uiLock;
  }

  // Setup ------------------------------------------------------------------
  buildControllers() {
    const factory = new XRControllerModelFactory();
    const handFactory = new XRHandModelFactory();
    this.controllers = [0, 1].map((i) => {
      const ctrl = this.renderer.xr.getController(i);
      const grip = this.renderer.xr.getControllerGrip(i);
      const hand = this.renderer.xr.getHand(i);
      grip.add(factory.createControllerModel(grip));
      hand.add(handFactory.createHandModel(hand, 'mesh'));
      this.rig.add(ctrl, grip, hand);
      const state = { index: i, ctrl, grip, hand, source: null, handedness: null };
      this.resetInput(state);
      ctrl.addEventListener('connected', (e) => {
        state.source = e.data;
        state.handedness = e.data.handedness;
        this.resetInput(state);
      });
      ctrl.addEventListener('disconnected', () => {
        state.source = null;
        state.handedness = null;
        this.resetInput(state);
      });
      return state;
    });
  }

  resetInput(c) {
    c.prev = [];
    c.aiming = false;
    c.select = false;
    c.gesture = newGesture();
    c.loco = null;
    c.locoTime = 0;
    c.turnArmed = true;
  }

  hand(side) {
    return this.controllers.find((c) => c.handedness === side) ?? null;
  }

  get usingHands() {
    return this.controllers.some((c) => c.source?.hand);
  }

  buildTeleportVisuals() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARC_POINTS * 3), 3));
    this.arc = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x9fd6ff, transparent: true, opacity: 0.85 }));
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

  // Comfort tunnel: darkens the edges of sight while moving or turning in the headset. A sphere around
  // the head shaded by angle from the gaze, so it sits correctly in both eyes.
  buildVignette() {
    this.vignetteMat = new THREE.ShaderMaterial({
      uniforms: { strength: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float strength;
        varying vec3 vDir;
        void main() {
          float c = -normalize(vDir).z;
          float a = smoothstep(0.88, 0.62, c) * strength;
          gl_FragColor = vec4(0.0, 0.0, 0.0, a);
        }`,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.BackSide,
    });
    const v = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 16), this.vignetteMat);
    v.renderOrder = 8990;
    v.frustumCulled = false;
    v.visible = false;
    this.camera.add(v);
    this.vignette = v;
    this.vignetteLevel = 0;
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
      if (e.repeat) return;
      const n = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].indexOf(e.code);
      if (n >= 0) this.onAnswerKey?.(n % 3);
      if (!this.enabled) return;
      if (e.code === 'KeyE') this.onUse?.();
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

  snapTurn(sign) {
    this.turn(-sign * SNAP_ANGLE);
    this.vignettePulse = 0.35;
    this.stats.turns++;
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
    for (const c of this.controllers) this.resetInput(c);
  }

  // Desktop ----------------------------------------------------------------
  updateDesktop(dt) {
    const k = this.keysDown;
    let f = 0;
    let s = 0;
    if (this.active) {
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
      this.clampToBounds(pos);
      moved = Math.hypot(pos.x - this.rig.position.x, pos.z - this.rig.position.z);
      this.rig.position.x = pos.x;
      this.rig.position.z = pos.z;
      if (f > 0) this.stats.forward += moved;
      if (f < 0) this.stats.back += moved;
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

    const j = this.shake * 0.05;
    if (j > 0) {
      this.camera.position.x += (Math.random() - 0.5) * j;
      this.camera.position.y += (Math.random() - 0.5) * j;
    }
    this.rig.rotation.set(0, this.yaw, 0);
    this.camera.rotation.set(this.pitch + (Math.random() - 0.5) * j, (Math.random() - 0.5) * j, (Math.random() - 0.5) * j);
  }

  clampToBounds(pos) {
    const b = this.bounds;
    if (!b) return;
    const dx = pos.x - b.x;
    const dz = pos.z - b.z;
    const d = Math.hypot(dx, dz);
    if (d > b.r) {
      pos.x = b.x + (dx / d) * b.r;
      pos.z = b.z + (dz / d) * b.r;
    }
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
    this.moving = false;
    this.walkedThisFrame = false;
    const head = this.head();

    for (const c of this.controllers) {
      c.select = false;
      if (!c.source) continue;
      if (c.source.hand) {
        this.updateHand(c, dt, head);
        continue;
      }
      const gp = c.source.gamepad;
      if (!gp) continue;
      const pressed = gp.buttons.map((b) => b.pressed);
      const edge = (i) => pressed[i] && !c.prev[i];
      c.select = edge(0);
      if (edge(4) || edge(5)) this.onMenu?.();
      c.prev = pressed;
      if (!this.active) {
        c.aiming = false;
        continue;
      }
      const [x, y] = stick(c.source);
      if (c.handedness === 'left' && Math.hypot(x, y) > 0.18) this.walk(x, y, dt);
      if (c.handedness === 'right') this.updateRightStick(c, x, y);
    }

    const aimer = this.controllers.find((c) => c.aiming && c.source);
    this.aiming = !!aimer;
    if (aimer) {
      this.updateArc(aimer);
    } else {
      this.arc.visible = false;
      this.marker.visible = false;
    }

    // Keep the head out of walls when the player physically steps into one.
    const h = this.head();
    const pos = { x: h.x, z: h.z };
    const before = { x: pos.x, z: pos.z };
    this.collision.resolveCircle(pos, PLAYER_RADIUS * 0.75);
    this.clampToBounds(pos);
    this.rig.position.x += pos.x - before.x;
    this.rig.position.z += pos.z - before.z;
  }

  // x is strafe, y is stick-style (negative is forward), relative to where the head faces.
  walk(x, y, dt) {
    const q = this.rig.quaternion.clone().multiply(this.camera.quaternion);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q).setY(0).normalize();
    const side = new THREE.Vector3().crossVectors(fwd, UP);
    const move = fwd.multiplyScalar(-y).addScaledVector(side, x).multiplyScalar(WALK_SPEED * dt);
    const h = this.head();
    const pos = { x: h.x + move.x, z: h.z + move.z };
    this.collision.resolveCircle(pos, PLAYER_RADIUS);
    this.clampToBounds(pos);
    const moved = Math.hypot(pos.x - h.x, pos.z - h.z);
    this.rig.position.x += pos.x - h.x;
    this.rig.position.z += pos.z - h.z;
    this.moving = true;
    if (y < 0) this.stats.forward += moved;
    else if (y > 0) this.stats.back += moved;
    this.stepDistance += moved;
    if (this.stepDistance > 0.75) {
      this.stepDistance = 0;
      this.audio.step();
    }
  }

  updateRightStick(c, x, y) {
    if (y < -0.6 && this.teleportCooldown <= 0 && !c.overPanel) c.aiming = true;
    if (c.aiming) {
      if (Math.abs(y) < 0.25 && Math.abs(x) < 0.25) {
        c.aiming = false;
        if (this.teleportValid) this.teleport(this.teleportTarget);
      }
      return;
    }
    if (Math.abs(x) < 0.3) this.turnArmed = true;
    if (this.turnArmed && Math.abs(x) > 0.7) {
      this.turnArmed = false;
      this.snapTurn(x > 0 ? 1 : -1);
    }
  }

  // Hand tracking. An open hand held forward walks, held back beside the shoulder walks back, held out to
  // one side turns. Right pinch aims a teleport, released to jump. Left palm to the face plus a pinch opens
  // the menu. A pinch also presses buttons on panels (handled by the panel pointer).
  // Hands glow faintly so you can see them in dark corridors and the unlit lobby.
  styleHand(c) {
    if (c.handStyled) return;
    c.hand.traverse((o) => {
      if (!o.isMesh || !o.material?.emissive) return;
      o.material.emissive.set(0x5a4030);
      o.material.emissiveIntensity = 0.6;
      c.handStyled = true;
    });
  }

  updateHand(c, dt, head) {
    this.styleHand(c);
    const g = readGesture(c.hand, c.handedness, head, c.gesture);
    c.select = g.pinchStart;
    if (!g.tracked) {
      c.aiming = false;
      c.loco = null;
      return;
    }
    if (c.handedness === 'left' && g.pinchStart && g.palmToFace) {
      c.select = false;
      this.onMenu?.();
      return;
    }
    if (!this.active) {
      c.aiming = false;
      c.loco = null;
      return;
    }

    if (c.handedness === 'right') {
      if (g.pinchStart && this.teleportCooldown <= 0 && !c.overPanel) c.aiming = true;
      if (!g.pinch) {
        if (c.aiming && this.teleportValid) this.teleport(this.teleportTarget);
        c.aiming = false;
      }
    }

    const rel = this.relative(g.wrist);
    const kind = c.aiming ? null : classifyLocomotion(rel, !g.fist && !g.pinch);
    if (kind !== c.loco) {
      c.loco = kind;
      c.locoTime = 0;
    } else {
      c.locoTime += dt;
    }
    if (kind !== 'left' && kind !== 'right') c.turnArmed = true;
    if (!kind || c.locoTime < GESTURE_HOLD) return;

    if (kind === 'forward' && !this.walkedThisFrame) {
      this.walkedThisFrame = true;
      this.walk(0, -Math.min(1, 0.6 + (rel.fwd - 0.4) * 4), dt);
    } else if (kind === 'back' && !this.walkedThisFrame) {
      this.walkedThisFrame = true;
      this.walk(0, 0.65, dt);
    } else if ((kind === 'left' || kind === 'right') && c.turnArmed) {
      c.turnArmed = false;
      this.snapTurn(kind === 'right' ? 1 : -1);
    }
  }

  relative(p) {
    const h = this.head();
    const yaw = this.headYaw();
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const dx = p.x - h.x;
    const dz = p.z - h.z;
    return { fwd: dx * fx + dz * fz, side: dx * -fz + dz * fx, up: p.y - h.y };
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
      if (this.bounds) valid = valid && Math.hypot(pos.x - this.bounds.x, pos.z - this.bounds.z) < this.bounds.r;
      this.teleportTarget.set(pos.x, 0, pos.z);
    }
    this.teleportValid = valid;
    this.arc.material.color.set(valid ? 0x9fd6ff : 0xff7a66);
    this.marker.visible = valid;
    if (valid) this.marker.position.copy(this.teleportTarget);
  }

  teleport(target) {
    this.blink();
    this.shiftHeadTo(target.x, target.z);
    this.teleportCooldown = TELEPORT_COOLDOWN;
    this.stats.teleports++;
    this.audio.step();
    setTimeout(() => this.audio.step(), 190);
  }

  // Frame ------------------------------------------------------------------
  update(dt) {
    const xr = this.renderer.xr.isPresenting;
    if (xr) this.updateXR(dt);
    else this.updateDesktop(dt);
    this.shake = Math.max(0, this.shake - dt * 0.7);

    if (this.fade !== this.fadeTarget) {
      const d = this.fadeTarget - this.fade;
      const stepSize = dt * this.fadeSpeed;
      this.fade = Math.abs(d) <= stepSize ? this.fadeTarget : this.fade + Math.sign(d) * stepSize;
    }
    this.fadeMat.opacity = this.fade;
    this.fadeMesh.visible = this.fade > 0.001;

    this.vignettePulse = Math.max(0, this.vignettePulse - dt);
    const want = xr && this.comfort && (this.moving || this.vignettePulse > 0) ? 1 : 0;
    this.vignetteLevel += (want - this.vignetteLevel) * Math.min(1, dt * (want ? 8 : 3));
    this.vignetteMat.uniforms.strength.value = this.vignetteLevel;
    this.vignette.visible = this.vignetteLevel > 0.01;
  }
}
