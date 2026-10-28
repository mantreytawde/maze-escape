import * as THREE from 'three';

const UPPER = 0.28;
const FORE = 0.26;
const SHOULDER_Y = 1.48;
const SHOULDER_X = 0.2;
const DOWN = new THREE.Vector3(0, -1, 0);

function rimMaterial(color, base = 0.16) {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: 1 }, base: { value: base }, time: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      varying float vY;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        vY = (modelMatrix * vec4(position, 1.0)).y;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform float opacity;
      uniform float base;
      uniform float time;
      varying vec3 vN;
      varying vec3 vV;
      varying float vY;
      void main() {
        float rim = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float scan = 0.8 + 0.2 * sin(vY * 90.0 - time * 5.0);
        float a = (base + pow(rim, 2.2) * 0.95) * scan * opacity;
        gl_FragColor = vec4(color * a, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

function capsule(radius, length, mat) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 10), mat);
  return m;
}

const POSES = {
  open: { fingers: [0.05, 0.05, 0.05, 0.08], thumb: 0.1 },
  fist: { fingers: [1.45, 1.5, 1.5, 1.45], thumb: 1.1 },
  pinch: { fingers: [0.85, 0.35, 0.5, 0.6], thumb: 0.95 },
  point: { fingers: [0, 1.5, 1.5, 1.45], thumb: 1.0 },
};

function buildHand(mat, side) {
  const hand = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.095, 0.028), mat);
  palm.position.y = -0.05;
  hand.add(palm);
  const fingers = [];
  [-0.03, -0.01, 0.01, 0.03].forEach((x, i) => {
    const base = new THREE.Group();
    base.position.set(x * side, -0.098, 0);
    const len = i === 0 || i === 2 ? 0.05 : i === 1 ? 0.055 : 0.04;
    const p = capsule(0.009, len, mat);
    p.position.y = -len / 2;
    base.add(p);
    const tip = new THREE.Group();
    tip.position.y = -len - 0.006;
    const d = capsule(0.008, len * 0.75, mat);
    d.position.y = (-len * 0.75) / 2;
    tip.add(d);
    base.add(tip);
    hand.add(base);
    fingers.push({ base, tip });
  });
  const thumb = new THREE.Group();
  thumb.position.set(-0.045 * side, -0.03, 0.008);
  thumb.rotation.z = -0.6 * side;
  const t1 = capsule(0.01, 0.045, mat);
  t1.position.y = -0.03;
  thumb.add(t1);
  hand.add(thumb);
  return { hand, fingers, thumb };
}

// Speech bubble / label sprite.
function bubble(text, w = 0.7) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 192;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  s.scale.set(w, (w * 192) / 512, 1);
  s.userData.draw = (t, color = '#9fe7ff') => {
    const g = c.getContext('2d');
    g.clearRect(0, 0, 512, 192);
    g.fillStyle = 'rgba(8,24,32,0.85)';
    g.strokeStyle = color;
    g.lineWidth = 6;
    g.beginPath();
    g.roundRect(8, 8, 496, 150, 40);
    g.fill();
    g.stroke();
    g.font = 'bold 72px "Segoe UI", Roboto, Arial, sans-serif';
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(t, 256, 86);
    tex.needsUpdate = true;
  };
  s.userData.draw(text);
  return s;
}

const smooth = (t) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

// A hologram that demonstrates every move, facing you like a mirror: the arm on your right shows
// what your right hand should do.
export class Guide {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.visible = false;
    scene.add(this.root);
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.mat = rimMaterial(0x58d8ff);
    this.handMat = rimMaterial(0xffb347, 0.35);
    this.mats = [this.mat, this.handMat];

    const m = this.mat;
    const torso = capsule(0.15, 0.36, m);
    torso.position.y = 1.25;
    torso.scale.z = 0.7;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 20, 14), m);
    head.position.y = 1.68;
    this.head = head;
    const neck = capsule(0.045, 0.06, m);
    neck.position.y = 1.55;
    const hips = capsule(0.13, 0.08, m);
    hips.position.y = 0.95;
    hips.rotation.z = Math.PI / 2;
    this.body.add(torso, head, neck, hips);
    this.legs = [-1, 1].map((s) => {
      const hip = new THREE.Group();
      hip.position.set(0.1 * s, 0.93, 0);
      const leg = capsule(0.065, 0.78, m);
      leg.position.y = -0.46;
      hip.add(leg);
      this.body.add(hip);
      return hip;
    });

    // side +1 is the arm on the player's right (the guide's own left, as it faces you).
    this.arms = {};
    for (const [name, side] of [
      ['R', 1],
      ['L', -1],
    ]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(SHOULDER_X * side, SHOULDER_Y, 0);
      const upper = capsule(0.05, UPPER - 0.05, m);
      upper.position.y = -UPPER / 2;
      shoulder.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -UPPER;
      const fore = capsule(0.042, FORE - 0.05, m);
      fore.position.y = -FORE / 2;
      elbow.add(fore);
      const wrist = new THREE.Group();
      wrist.position.y = -FORE;
      const h = buildHand(this.handMat, side);
      wrist.add(h.hand);
      elbow.add(wrist);
      shoulder.add(elbow);
      this.body.add(shoulder);
      this.arms[name] = { side, shoulder, elbow, wrist, ...h, pose: { ...POSES.open, fingers: [...POSES.open.fingers] } };
    }

    // Props used by the demonstrations.
    const arcGeo = new THREE.BufferGeometry();
    arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(40 * 3), 3));
    this.arc = new THREE.Line(arcGeo, new THREE.LineBasicMaterial({ color: 0x9fd6ff, fog: false, transparent: true }));
    this.arc.frustumCulled = false;
    this.arcMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.21, 32),
      new THREE.MeshBasicMaterial({ color: 0x9fd6ff, fog: false, transparent: true, depthWrite: false }),
    );
    this.arcMarker.rotation.x = -Math.PI / 2;
    this.root.add(this.arc, this.arcMarker);

    const keyMat = rimMaterial(0xffd27a, 0.5);
    this.mats.push(keyMat);
    this.key = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 8, 20), keyMat);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.13, 0.018), keyMat);
    shaft.position.y = -0.11;
    const bit = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.018), keyMat);
    bit.position.set(0.02, -0.16, 0);
    this.key.add(ring, shaft, bit);
    this.root.add(this.key);

    this.bubble = bubble('7 + 5 = ?');
    this.answer = bubble('"Twelve!"', 0.55);
    this.root.add(this.bubble, this.answer);

    const arrowCanvas = document.createElement('canvas');
    arrowCanvas.width = arrowCanvas.height = 256;
    const g = arrowCanvas.getContext('2d');
    g.fillStyle = '#ff4030';
    g.beginPath();
    g.moveTo(128, 20);
    g.lineTo(220, 120);
    g.lineTo(160, 120);
    g.lineTo(160, 236);
    g.lineTo(96, 236);
    g.lineTo(96, 120);
    g.lineTo(36, 120);
    g.closePath();
    g.fill();
    const arrowTex = new THREE.CanvasTexture(arrowCanvas);
    arrowTex.colorSpace = THREE.SRGBColorSpace;
    this.floorArrow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.6),
      new THREE.MeshBasicMaterial({ map: arrowTex, transparent: true, fog: false, depthWrite: false }),
    );
    this.floorArrow.rotation.x = -Math.PI / 2;
    this.floorArrow.position.set(0.9, 0.02, 0.4);
    this.dangerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.62, 40),
      new THREE.MeshBasicMaterial({ color: 0xff2a18, fog: false, transparent: true, depthWrite: false }),
    );
    this.dangerRing.rotation.x = -Math.PI / 2;
    this.dangerRing.position.y = 0.015;
    this.root.add(this.floorArrow, this.dangerRing);

    this.demo = 'wave';
    this.t = 0;
    this.time = 0;
  }

  place(pos, yaw) {
    this.root.position.copy(pos);
    this.root.rotation.y = yaw;
  }

  show(on) {
    this.root.visible = on;
  }

  play(demo) {
    if (demo === this.demo) return;
    this.demo = demo;
    this.t = 0;
  }

  // Two-bone arm reaching for `target` (guide-local), elbow bending toward `pole`.
  reach(arm, target, twist = 0) {
    const s = arm.shoulder.position;
    const v = target.clone().sub(s);
    const d = THREE.MathUtils.clamp(v.length(), 0.08, UPPER + FORE - 0.004);
    const dir = v.normalize();
    const pole = new THREE.Vector3(arm.side * 0.45, -0.7, -1).normalize();
    let axis = new THREE.Vector3().crossVectors(dir, pole);
    if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
    axis.normalize();
    const alpha = Math.acos(THREE.MathUtils.clamp((UPPER * UPPER + d * d - FORE * FORE) / (2 * UPPER * d), -1, 1));
    const beta = Math.acos(THREE.MathUtils.clamp((UPPER * UPPER + FORE * FORE - d * d) / (2 * UPPER * FORE), -1, 1));
    const aim = new THREE.Quaternion().setFromUnitVectors(DOWN, dir);
    const q = new THREE.Quaternion().setFromAxisAngle(axis, alpha).multiply(aim);
    arm.shoulder.quaternion.copy(q);
    const local = axis.clone().applyQuaternion(q.clone().invert());
    arm.elbow.quaternion.setFromAxisAngle(local, -(Math.PI - beta));
    arm.wrist.rotation.set(0, twist, 0);
  }

  setPose(arm, name, k = 0.25) {
    const want = POSES[name];
    arm.pose.fingers = arm.pose.fingers.map((f, i) => f + (want.fingers[i] - f) * k);
    arm.pose.thumb += (want.thumb - arm.pose.thumb) * k;
    arm.fingers.forEach((f, i) => {
      f.base.rotation.x = -arm.pose.fingers[i];
      f.tip.rotation.x = -arm.pose.fingers[i] * 0.9;
    });
    arm.thumb.rotation.x = -arm.pose.thumb * 0.8;
  }

  rest(side, t) {
    return new THREE.Vector3(side * 0.26, 0.98 + Math.sin(t * 1.5) * 0.01, 0.05);
  }

  hideProps() {
    this.arc.visible = false;
    this.arcMarker.visible = false;
    this.key.visible = false;
    this.bubble.visible = false;
    this.answer.visible = false;
    this.floorArrow.visible = false;
    this.dangerRing.visible = false;
  }

  drawArc(from, to) {
    const pos = this.arc.geometry.attributes.position;
    for (let i = 0; i < 40; i++) {
      const u = i / 39;
      const p = from.clone().lerp(to, u);
      p.y += Math.sin(u * Math.PI) * 0.45;
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    pos.needsUpdate = true;
    this.arc.visible = true;
    this.arcMarker.position.set(to.x, 0.02, to.z);
    this.arcMarker.visible = true;
  }

  update(dt) {
    if (!this.root.visible) return;
    this.t += dt;
    this.time += dt;
    for (const m of this.mats) m.uniforms.time.value = this.time;
    const t = this.t;
    const { R, L } = this.arms;
    let rT = this.rest(1, t);
    let lT = this.rest(-1, t);
    let rPose = 'open';
    let lPose = 'open';
    let rTwist = 0;
    let lTwist = 0;
    let bodyZ = 0;
    let bodyX = 0;
    let yaw = 0;
    let fade = 1;
    let walk = 0;
    this.hideProps();

    switch (this.demo) {
      case 'wave': {
        rT = new THREE.Vector3(0.36, 1.78, 0.12);
        rTwist = Math.sin(t * 7) * 0.5;
        rT.x += Math.sin(t * 7) * 0.05;
        break;
      }
      case 'forward': {
        const c = t % 4.2;
        const up = smooth(c / 0.5) * (1 - smooth((c - 3.4) / 0.5));
        rT = this.rest(1, t).lerp(new THREE.Vector3(0.16, 1.44, 0.56), up);
        rTwist = -Math.PI / 2 * up;
        bodyZ = smooth((c - 0.7) / 2.7) * 0.9;
        walk = c > 0.7 && c < 3.4 ? 1 : 0;
        fade = c > 3.9 ? 1 - smooth((c - 3.9) / 0.3) : c < 0.2 ? smooth(c / 0.2) : 1;
        break;
      }
      case 'back': {
        const c = t % 4.2;
        const up = smooth(c / 0.5) * (1 - smooth((c - 3.4) / 0.5));
        rT = this.rest(1, t).lerp(new THREE.Vector3(0.26, 1.42, 0.0), up);
        rTwist = -Math.PI / 2 * up;
        bodyZ = -smooth((c - 0.7) / 2.7) * 0.6;
        walk = c > 0.7 && c < 3.4 ? 1 : 0;
        fade = c > 3.9 ? 1 - smooth((c - 3.9) / 0.3) : c < 0.2 ? smooth(c / 0.2) : 1;
        break;
      }
      case 'turn': {
        const c = t % 5;
        const out = smooth(c / 0.5) * (1 - smooth((c - 1.6) / 0.4));
        const out2 = smooth((c - 2.6) / 0.4) * (1 - smooth((c - 3.8) / 0.4));
        rT = this.rest(1, t).lerp(new THREE.Vector3(0.78, 1.42, 0.08), Math.max(out, out2));
        yaw = (c > 0.9 ? 0.5 : 0) + (c > 3.1 ? 0.5 : 0);
        if (c > 4.6) yaw = 1 - smooth((c - 4.6) / 0.4);
        break;
      }
      case 'teleport': {
        const c = t % 4.5;
        const aim = smooth(c / 0.5);
        const target = new THREE.Vector3(1.1, 0, 0.7);
        rT = this.rest(1, t).lerp(new THREE.Vector3(0.24, 1.32, 0.42), c < 2.4 ? aim : 1 - smooth((c - 2.4) / 0.4));
        rPose = c > 0.5 && c < 2.2 ? 'pinch' : 'open';
        if (c > 0.6 && c < 2.2) {
          this.root.updateMatrixWorld(true);
          const hand = this.root.worldToLocal(R.wrist.getWorldPosition(new THREE.Vector3()));
          this.drawArc(hand, target);
        }
        if (c > 2.2 && c < 3.8) {
          bodyX = target.x;
          bodyZ = target.z;
        }
        fade = Math.abs(c - 2.2) < 0.12 || Math.abs(c - 3.8) < 0.12 ? 0.1 : 1;
        break;
      }
      case 'collect': {
        const c = t % 4;
        bodyZ = smooth(c / 1.5) * 0.6;
        walk = c < 1.5 ? 1 : 0;
        const k = smooth((c - 1.5) / 0.6);
        this.key.visible = c < 2.2;
        this.key.position.set(0, 1.35 + Math.sin(this.time * 3) * 0.03, 1.1).lerp(new THREE.Vector3(0.26, 1.0, 0.65), k);
        this.key.rotation.y = this.time * 2;
        this.key.scale.setScalar(1 - k * 0.7);
        rT = this.rest(1, t);
        if (c > 2.4) {
          rT = new THREE.Vector3(0.36, 1.7, 0.15);
          rPose = 'fist';
        }
        break;
      }
      case 'quiz': {
        const c = t % 5;
        this.bubble.visible = true;
        this.bubble.position.set(-0.55, 2.05, 0.2);
        rT = new THREE.Vector3(0.05, 1.62, 0.28);
        rPose = 'open';
        lT = new THREE.Vector3(-0.45, 1.65, 0.3);
        lPose = 'point';
        if (c > 1.6) {
          this.answer.visible = true;
          this.answer.position.set(0.45, 1.85, 0.3);
          this.answer.userData.draw('"Twelve!"', c > 3 ? '#8ef08e' : '#9fe7ff');
        }
        break;
      }
      case 'danger': {
        this.dangerRing.visible = true;
        this.dangerRing.material.opacity = 0.4 + Math.abs(Math.sin(this.time * 4)) * 0.5;
        this.floorArrow.visible = true;
        this.floorArrow.rotation.z = -Math.PI / 2 + 0.6;
        rT = new THREE.Vector3(0.6, 1.35, 0.4);
        rPose = 'point';
        this.head.rotation.y = Math.sin(this.time * 2.5) * 0.6;
        break;
      }
      case 'menu': {
        const c = t % 3.5;
        const up = smooth(c / 0.5) * (1 - smooth((c - 2.8) / 0.5));
        lT = this.rest(-1, t).lerp(new THREE.Vector3(-0.06, 1.6, 0.27), up);
        lTwist = Math.PI * 0.5 * up;
        lPose = c > 1.0 && c < 1.6 ? 'pinch' : 'open';
        break;
      }
      case 'cheer': {
        const b = Math.abs(Math.sin(t * 5));
        rT = new THREE.Vector3(0.3, 1.95 + b * 0.05, 0.05);
        lT = new THREE.Vector3(-0.3, 1.95 + b * 0.05, 0.05);
        rPose = lPose = 'fist';
        bodyZ = 0;
        this.body.position.y = b * 0.08;
        break;
      }
      default:
        break;
    }
    if (this.demo !== 'cheer') this.body.position.y = Math.sin(this.time * 1.5) * 0.008;
    if (this.demo !== 'danger') this.head.rotation.y *= 0.9;

    this.body.position.x = bodyX;
    this.body.position.z = bodyZ;
    this.body.rotation.y += (yaw - this.body.rotation.y) * Math.min(1, dt * 14);
    const swing = walk ? Math.sin(this.time * 7) * 0.35 : 0;
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    this.reach(R, rT, rTwist);
    this.reach(L, lT, lTwist);
    this.setPose(R, rPose);
    this.setPose(L, lPose);
    for (const m of this.mats) m.uniforms.opacity.value = fade;
  }
}
