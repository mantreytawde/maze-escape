import * as THREE from 'three';

const CONFETTI = 260;
const BURSTS = 5;
const SPARKS = 110;
const COLORS = [0xff4d4d, 0xffd24d, 0x4dd2ff, 0x7dff6a, 0xff7ae6, 0xffffff];

// Confetti and fireworks over the lobby when you get out.
export class Celebration {
  constructor(scene, audio) {
    this.audio = audio;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this.confetti = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.05, 0.03),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: false, toneMapped: false }),
      CONFETTI,
    );
    this.confetti.frustumCulled = false;
    const color = new THREE.Color();
    this.flakes = Array.from({ length: CONFETTI }, (_, i) => {
      this.confetti.setColorAt(i, color.set(COLORS[i % COLORS.length]));
      return { p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), s: new THREE.Vector3() };
    });
    this.group.add(this.confetti);

    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BURSTS * SPARKS * 3), 3));
    sparkGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(BURSTS * SPARKS * 3), 3));
    this.sparks = new THREE.Points(
      sparkGeo,
      new THREE.PointsMaterial({
        size: 0.14,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      }),
    );
    this.sparks.frustumCulled = false;
    this.group.add(this.sparks);
    this.bursts = Array.from({ length: BURSTS }, () => ({ t: 99, v: [], color: new THREE.Color(), origin: new THREE.Vector3() }));
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
  }

  start(center) {
    this.center = center.clone();
    this.group.visible = true;
    this.time = 0;
    this.nextBurst = 0.4;
    this.flakes.forEach((f) => this.resetFlake(f, true));
    this.bursts.forEach((b) => (b.t = 99));
    this.audio.play('fanfare', 0.9);
  }

  stop() {
    this.group.visible = false;
  }

  resetFlake(f, initial) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 3.5;
    f.p.set(this.center.x + Math.cos(a) * r, initial ? 2 + Math.random() * 4 : 4.5 + Math.random(), this.center.z + Math.sin(a) * r);
    f.v.set((Math.random() - 0.5) * 0.4, -0.5 - Math.random() * 0.5, (Math.random() - 0.5) * 0.4);
    f.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    f.s.set(2 + Math.random() * 4, 1 + Math.random() * 3, 0);
  }

  fire(b) {
    b.t = 0;
    const a = Math.random() * Math.PI * 2;
    const r = 3 + Math.random() * 3;
    b.origin.set(this.center.x + Math.cos(a) * r, 5 + Math.random() * 2.5, this.center.z - 3 + Math.sin(a) * r * 0.5);
    b.color.set(COLORS[Math.floor(Math.random() * (COLORS.length - 1))]);
    b.v = Array.from({ length: SPARKS }, () => {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      return v.multiplyScalar(2.2 + Math.random() * 1.2);
    });
    this.audio.at('pop', b.origin, 0.9, 0.85 + Math.random() * 0.3);
  }

  update(dt) {
    if (!this.group.visible) return;
    this.time += dt;
    this.flakes.forEach((f, i) => {
      f.p.addScaledVector(f.v, dt);
      f.p.x += Math.sin(this.time * 2 + i) * dt * 0.2;
      f.r.x += f.s.x * dt;
      f.r.y += f.s.y * dt;
      if (f.p.y < 0) this.resetFlake(f, false);
      this.m.compose(f.p, this.q.setFromEuler(f.r), new THREE.Vector3(1, 1, 1));
      this.confetti.setMatrixAt(i, this.m);
    });
    this.confetti.instanceMatrix.needsUpdate = true;

    this.nextBurst -= dt;
    if (this.nextBurst <= 0) {
      this.nextBurst = 0.7 + Math.random() * 0.9;
      const idle = this.bursts.find((b) => b.t > 2.2);
      if (idle) this.fire(idle);
    }
    const pos = this.sparks.geometry.attributes.position;
    const col = this.sparks.geometry.attributes.color;
    this.bursts.forEach((b, bi) => {
      b.t += dt;
      const fade = Math.max(0, 1 - b.t / 2);
      for (let i = 0; i < SPARKS; i++) {
        const idx = bi * SPARKS + i;
        const v = b.v[i];
        if (!v || fade <= 0) {
          pos.setXYZ(idx, 0, -100, 0);
          continue;
        }
        const t = b.t;
        pos.setXYZ(idx, b.origin.x + v.x * t, b.origin.y + v.y * t - 1.2 * t * t, b.origin.z + v.z * t);
        const tw = fade * (0.6 + Math.random() * 0.4);
        col.setXYZ(idx, b.color.r * tw, b.color.g * tw, b.color.b * tw);
      }
    });
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }
}
