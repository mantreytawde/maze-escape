import * as THREE from 'three';

export const LOBBY = { x: -30, z: 20, r: 4.5 };

function floorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(512, 512, 40, 512, 512, 512);
  grad.addColorStop(0, '#2a2218');
  grad.addColorStop(0.6, '#15120e');
  grad.addColorStop(1, 'rgba(8,9,11,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 1024);
  g.strokeStyle = 'rgba(224,178,106,0.35)';
  for (let r = 80; r < 500; r += 80) {
    g.lineWidth = r % 160 === 0 ? 4 : 2;
    g.beginPath();
    g.arc(512, 512, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.strokeStyle = 'rgba(224,178,106,0.18)';
  g.lineWidth = 2;
  for (let a = 0; a < 16; a++) {
    const t = (a / 16) * Math.PI * 2;
    g.beginPath();
    g.moveTo(512 + Math.cos(t) * 80, 512 + Math.sin(t) * 80);
    g.lineTo(512 + Math.cos(t) * 480, 512 + Math.sin(t) * 480);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function titleTexture() {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 512;
  const g = c.getContext('2d');
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = 'bold 260px Georgia, "Times New Roman", serif';
  g.shadowColor = 'rgba(255,120,40,0.9)';
  g.shadowBlur = 60;
  g.fillStyle = '#f6e2bf';
  g.fillText('MAZE ESCAPE', 1024, 220);
  g.shadowBlur = 0;
  g.font = '64px "Segoe UI", Roboto, Arial, sans-serif';
  g.fillStyle = 'rgba(230,200,160,0.8)';
  g.fillText('three keys · three gates · one way out', 1024, 420);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A quiet round platform far from the maze: home screen, tutorial and victory all happen here.
export class Lobby {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.position.set(LOBBY.x, 0, LOBBY.z);
    this.group.visible = false;
    scene.add(this.group);
    const basic = (opts) => new THREE.MeshBasicMaterial({ fog: false, toneMapped: false, ...opts });

    const floor = new THREE.Mesh(new THREE.CircleGeometry(7, 64), basic({ map: floorTexture(), transparent: true, depthWrite: false }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.005;
    floor.renderOrder = -1;
    this.group.add(floor);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(LOBBY.r + 0.15, LOBBY.r + 0.25, 96),
      basic({ color: 0xe0a050, transparent: true, opacity: 0.6, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    this.group.add(ring);

    const pillarMat = basic({ color: 0xffb060, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    const capMat = basic({ color: 0xffd9a0 });
    this.pillars = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 3.6, 8, 1, true), pillarMat);
      p.position.set(Math.cos(a) * 6.2, 1.8, Math.sin(a) * 6.2);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), capMat);
      cap.position.set(p.position.x, 3.65, p.position.z);
      this.group.add(p, cap);
      this.pillars.push(cap);
    }

    const title = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), basic({ map: titleTexture(), transparent: true, depthWrite: false }));
    title.position.set(0, 3.1, -5.6);
    this.group.add(title);

    // A dark doorway under the title, the way into the maze.
    const frameMat = basic({ color: 0x2a1c10 });
    const glowMat = basic({ color: 0xff8a3a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    const door = new THREE.Group();
    door.position.set(0, 0, -5.4);
    const postGeo = new THREE.BoxGeometry(0.25, 2.4, 0.25);
    for (const sx of [-0.85, 0.85]) {
      const post = new THREE.Mesh(postGeo, frameMat);
      post.position.set(sx, 1.2, 0);
      door.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.25, 0.25), frameMat);
    lintel.position.y = 2.45;
    door.add(lintel);
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 2.3), basic({ color: 0x020203 }));
    inner.position.set(0, 1.15, 0.01);
    door.add(inner);
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 2.4), glowMat);
    edge.position.set(0, 1.2, 0.005);
    door.add(edge);
    this.group.add(door);
    this.doorGlow = glowMat;

    const count = 260;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1 + Math.random() * 7;
      pos.set([Math.cos(a) * r, Math.random() * 4, Math.sin(a) * r], i * 3);
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({ color: 0xffc890, size: 0.03, transparent: true, opacity: 0.6, fog: false, depthWrite: false }),
    );
    this.group.add(this.dust);
  }

  get center() {
    return new THREE.Vector3(LOBBY.x, 0, LOBBY.z);
  }

  // Where the player stands, facing the doorway.
  get spawn() {
    return { x: LOBBY.x, z: LOBBY.z + 1.2, yaw: 0 };
  }

  get bounds() {
    return { x: LOBBY.x, z: LOBBY.z, r: LOBBY.r };
  }

  // A world point relative to the lobby centre.
  point(x, y, z) {
    return new THREE.Vector3(LOBBY.x + x, y, LOBBY.z + z);
  }

  update(dt, time) {
    if (!this.group.visible) return;
    this.dust.rotation.y += dt * 0.02;
    this.doorGlow.opacity = 0.5 + Math.sin(time * 1.3) * 0.25;
    this.pillars.forEach((p, i) => p.scale.setScalar(0.8 + Math.sin(time * 2 + i) * 0.25));
  }
}
