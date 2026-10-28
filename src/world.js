import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CELL, WALL_T, WALL_H, LIGHT_POOL } from './config.js';
import { DIRS, N, E, S, W, makeRng } from './maze.js';
import { Collision } from './collision.js';
import {
  makeWallTextures,
  makeFloorTextures,
  makeCeilingTextures,
  makeHaloTexture,
  makePuddleTexture,
  makeFadeStripTexture,
  makeNoteTexture,
  makeGateSignTexture,
  makeTagTexture,
} from './textures.js';

const HALF = WALL_T / 2;
const NUMERALS = ['I', 'II', 'III'];
const WARM = new THREE.Color(0xffe0bd);
const COOL = new THREE.Color(0xdde8ff);
const LIGHT_INTENSITY = 9;
const LIGHT_RANGE = 7;

const RED = new THREE.Color(0xff2a18);

const NOTE_TEXT = [
  'The door behind you locked when it shut. The way out is past three padlocked gates. Walk up to a key to take it, then walk up to its gate.',
  'Answer the questions right and orange arrows light up for a while. Get one wrong and you are on your own until the next.',
  'Take a wrong turn and it wakes up. Run back the way you came. It has taken two people already. You get three chances.',
  'When the alarm sounds, run. You will not survive the red corridors when the timer runs out.',
];
const NOTE_FOOTER = [
  'HANDS    hand forward: walk, hand by shoulder: back',
  '         hand out to the side: turn',
  '         left palm to face + pinch: menu',
  'PADS     sticks move and turn, B or Y: menu',
  'KEYBOARD WASD, mouse, Esc menu, click answers',
];

function worldBox(list, cx, cy, cz, sx, sy, sz) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  g.translate(cx, cy, cz);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (Math.abs(nor.getY(i)) > 0.5) uv.setXY(i, x / CELL, z / CELL);
    else if (Math.abs(nor.getX(i)) > 0.5) uv.setXY(i, z / CELL, y / WALL_H);
    else uv.setXY(i, x / CELL, y / WALL_H);
  }
  list.push(g);
}

class QuadBatch {
  constructor() {
    this.pos = [];
    this.uv = [];
    this.index = [];
  }

  // Corners in order: a, b, c, d with UVs (0,0) (1,0) (1,1) (0,1).
  add(a, b, c, d) {
    const base = this.pos.length / 3;
    for (const p of [a, b, c, d]) this.pos.push(p[0], p[1], p[2]);
    this.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    this.index.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.index);
    g.computeVertexNormals();
    return g;
  }
}

function floorPlane(minx, maxx, minz, maxz, y, facingUp) {
  const g = new THREE.PlaneGeometry(maxx - minx, maxz - minz);
  g.rotateX(facingUp ? -Math.PI / 2 : Math.PI / 2);
  g.translate((minx + maxx) / 2, y, (minz + maxz) / 2);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / CELL, pos.getZ(i) / CELL);
  return g;
}

function createKeyMesh(number, brass, tagTex) {
  const parts = [];
  const ring = new THREE.TorusGeometry(0.011, 0.0013, 6, 20);
  ring.rotateY(Math.PI / 2);
  ring.translate(0, -0.002, 0);
  parts.push(ring);
  const bow = new THREE.TorusGeometry(0.016, 0.0045, 10, 28);
  bow.translate(0, -0.026, 0);
  parts.push(bow);
  const collar = new THREE.CylinderGeometry(0.0056, 0.0056, 0.006, 12);
  collar.translate(0, -0.045, 0);
  parts.push(collar);
  const shaft = new THREE.CylinderGeometry(0.0034, 0.0034, 0.068, 10);
  shaft.translate(0, -0.081, 0);
  parts.push(shaft);
  for (const [y, w] of [
    [-0.104, 0.016],
    [-0.092, 0.011],
  ]) {
    const tooth = new THREE.BoxGeometry(w, 0.006, 0.0032);
    tooth.translate(w / 2, y, 0);
    parts.push(tooth);
  }
  const key = new THREE.Group();
  const body = new THREE.Mesh(mergeGeometries(parts), brass);
  key.add(body);

  const tag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.03, 0.045),
    new THREE.MeshStandardMaterial({ map: tagTex, roughness: 0.85, side: THREE.DoubleSide }),
  );
  tag.position.set(-0.016, -0.028, 0.004);
  tag.rotation.z = 0.35;
  key.add(tag);

  key.scale.setScalar(1.3);
  key.userData.number = number;
  return key;
}

function createPadlock(brass, darkMetal) {
  const lock = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.066, 0.028), brass);
  body.position.y = -0.033;
  lock.add(body);
  const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0055, 8, 20, Math.PI), darkMetal);
  shackle.position.y = 0.006;
  lock.add(shackle);
  for (const x of [-0.02, 0.02]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.012, 8), darkMetal);
    leg.position.set(x, 0.0, 0);
    lock.add(leg);
  }
  const hole = new THREE.Mesh(
    new THREE.BoxGeometry(0.004, 0.014, 0.002),
    new THREE.MeshBasicMaterial({ color: 0x050505 }),
  );
  hole.position.set(0, -0.045, 0.0145);
  lock.add(hole);
  lock.userData.shackle = shackle;
  return lock;
}

export function buildWorld(renderer, scene, layout) {
  const { maze, start, exit } = layout;
  const MW = maze.width;
  const MH = maze.height;
  const rand = makeRng(layout.seed * 7 + 1);
  const collision = new Collision(MW, MH);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const wallTex = makeWallTextures();
  const floorTex = makeFloorTextures();
  const ceilTex = makeCeilingTextures();

  const wallMat = new THREE.MeshStandardMaterial({
    ...wallTex,
    normalScale: new THREE.Vector2(0.35, 0.35),
  });
  const floorMat = new THREE.MeshStandardMaterial({
    ...floorTex,
    normalScale: new THREE.Vector2(0.55, 0.55),
    envMap,
    envMapIntensity: 0.06,
  });
  const ceilMat = new THREE.MeshStandardMaterial({ ...ceilTex });
  const steel = new THREE.MeshStandardMaterial({
    color: 0x3c4043,
    metalness: 0.75,
    roughness: 0.42,
    envMap,
    envMapIntensity: 0.35,
  });
  const darkMetal = new THREE.MeshStandardMaterial({
    color: 0x2a2c2e,
    metalness: 0.8,
    roughness: 0.35,
    envMap,
    envMapIntensity: 0.45,
  });
  const brass = new THREE.MeshStandardMaterial({
    color: 0xc19a55,
    metalness: 1,
    roughness: 0.28,
    envMap,
    envMapIntensity: 1.1,
  });
  const pipeMat = new THREE.MeshStandardMaterial({
    color: 0x5b605c,
    metalness: 0.45,
    roughness: 0.55,
    envMap,
    envMapIntensity: 0.25,
  });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x5b4331, roughness: 0.8 });
  const doorMat = new THREE.MeshStandardMaterial({
    color: 0x4a5552,
    metalness: 0.35,
    roughness: 0.6,
    envMap,
    envMapIntensity: 0.2,
  });

  // Walls and pillars ------------------------------------------------------
  const wallGeoms = [];
  const ao = new QuadBatch();
  const nodeUsed = new Uint8Array((MW + 2) * (MH + 1));
  const markNode = (i, j) => (nodeUsed[j * (MW + 2) + i] = 1);
  const AO_W = 0.5;
  const AO_Y = 0.004;

  const aoAlongX = (x0, x1, zFace, dir) => {
    const z1 = zFace + dir * AO_W;
    ao.add([x0, AO_Y, zFace], [x1, AO_Y, zFace], [x1, AO_Y, z1], [x0, AO_Y, z1]);
  };
  const aoAlongZ = (z0, z1, xFace, dir) => {
    const x1 = xFace + dir * AO_W;
    ao.add([xFace, AO_Y, z0], [xFace, AO_Y, z1], [x1, AO_Y, z1], [x1, AO_Y, z0]);
  };

  const hWall = (x0, zLine, faces = [-1, 1]) => {
    const cz = zLine * CELL;
    worldBox(wallGeoms, (x0 + 0.5) * CELL, WALL_H / 2, cz, CELL - WALL_T, WALL_H, WALL_T);
    collision.addBox(x0 * CELL + HALF, (x0 + 1) * CELL - HALF, cz - HALF, cz + HALF);
    markNode(x0, zLine);
    markNode(x0 + 1, zLine);
    for (const f of faces) aoAlongX(x0 * CELL - HALF, (x0 + 1) * CELL + HALF, cz + f * HALF, f);
  };
  const vWall = (xLine, z0, faces = [-1, 1]) => {
    const cx = xLine * CELL;
    worldBox(wallGeoms, cx, WALL_H / 2, (z0 + 0.5) * CELL, WALL_T, WALL_H, CELL - WALL_T);
    collision.addBox(cx - HALF, cx + HALF, z0 * CELL + HALF, (z0 + 1) * CELL - HALF);
    markNode(xLine, z0);
    markNode(xLine, z0 + 1);
    for (const f of faces) aoAlongZ(z0 * CELL - HALF, (z0 + 1) * CELL + HALF, cx + f * HALF, f);
  };

  for (let z = 0; z < MH; z++) {
    for (let x = 0; x < MW; x++) {
      const c = maze.idx(x, z);
      const o = maze.open[c];
      if (!(o & N)) hWall(x, z, z === 0 ? [1] : [-1, 1]);
      if (!(o & W)) vWall(x, z, x === 0 ? [1] : [-1, 1]);
      if (z === MH - 1) hWall(x, MH, [-1]);
      if (x === MW - 1 && c !== exit) vWall(MW, z, [-1]);
    }
  }

  // Exit vestibule: one cell past the east boundary, ending in an open door.
  const exitZ = maze.cz(exit);
  const vx0 = MW * CELL;
  const vx1 = vx0 + CELL;
  markNode(MW, exitZ);
  markNode(MW, exitZ + 1);
  {
    const z0 = exitZ * CELL;
    const z1 = z0 + CELL;
    const len = CELL - WALL_T;
    for (const [zc, face] of [
      [z0, 1],
      [z1, -1],
    ]) {
      worldBox(wallGeoms, vx0 + CELL / 2, WALL_H / 2, zc, len, WALL_H, WALL_T);
      collision.addBox(vx0 + HALF, vx1 - HALF, zc - HALF, zc + HALF);
      aoAlongX(vx0 - HALF, vx1 + HALF, zc + face * HALF, face);
    }
    const doorW = 1.0;
    const doorH = 2.1;
    const mid = z0 + CELL / 2;
    const sideLen = (CELL - WALL_T - doorW) / 2;
    worldBox(wallGeoms, vx1, WALL_H / 2, z0 + HALF + sideLen / 2, WALL_T, WALL_H, sideLen);
    worldBox(wallGeoms, vx1, WALL_H / 2, z1 - HALF - sideLen / 2, WALL_T, WALL_H, sideLen);
    worldBox(wallGeoms, vx1, (doorH + WALL_H) / 2, mid, WALL_T, WALL_H - doorH, doorW);
    collision.addBox(vx1 - HALF, vx1 + HALF, z0, mid - doorW / 2);
    collision.addBox(vx1 - HALF, vx1 + HALF, mid + doorW / 2, z1);
    collision.addBox(vx1 - HALF, vx1 + HALF, mid - doorW / 2, mid + doorW / 2);
    aoAlongZ(z0, z1, vx1 - HALF, -1);
    for (const zc of [z0, z1]) {
      worldBox(wallGeoms, vx1, WALL_H / 2, zc, WALL_T, WALL_H, WALL_T);
    }
  }

  const gateEdgeNodes = (a, b) => {
    const ax = maze.cx(a);
    const az = maze.cz(a);
    const bx = maze.cx(b);
    const bz = maze.cz(b);
    if (az === bz) {
      const xl = Math.max(ax, bx);
      return [
        [xl, az],
        [xl, az + 1],
      ];
    }
    const zl = Math.max(az, bz);
    return [
      [ax, zl],
      [ax + 1, zl],
    ];
  };
  for (const g of layout.gates) for (const [i, j] of gateEdgeNodes(g.a, g.b)) markNode(i, j);

  for (let j = 0; j <= MH; j++) {
    for (let i = 0; i <= MW; i++) {
      if (!nodeUsed[j * (MW + 2) + i]) continue;
      worldBox(wallGeoms, i * CELL, WALL_H / 2, j * CELL, WALL_T, WALL_H, WALL_T);
      collision.addBox(i * CELL - HALF, i * CELL + HALF, j * CELL - HALF, j * CELL + HALF);
    }
  }

  const walls = new THREE.Mesh(mergeGeometries(wallGeoms), wallMat);
  wallGeoms.forEach((g) => g.dispose());
  scene.add(walls);

  const aoMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    alphaMap: makeFadeStripTexture(),
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const aoMesh = new THREE.Mesh(ao.geometry(), aoMat);
  aoMesh.renderOrder = 1;
  scene.add(aoMesh);

  // Floor and ceiling ------------------------------------------------------
  const floor = new THREE.Mesh(floorPlane(-1, vx1 + 2, -1, MH * CELL + 1, 0, true), floorMat);
  scene.add(floor);
  const ceiling = new THREE.Mesh(floorPlane(-1, vx1 + 2, -1, MH * CELL + 1, WALL_H, false), ceilMat);
  scene.add(ceiling);

  // Lamps ------------------------------------------------------------------
  // Every cell has a lamp. Lighting does not follow the route: some bulbs are dying or dead anywhere,
  // except that the main path never goes fully dark.
  const gateCells = new Set(layout.gates.map((g) => g.a));
  const mainPath = new Set(layout.path);
  const fixtures = [];
  const fixturesByCell = new Map();
  for (let c = 0; c < maze.size; c++) {
    const p = maze.center(c);
    const cool = gateCells.has(c);
    const roll = rand();
    let base = 'on';
    if (!cool && c !== start) {
      if (roll < 0.22) base = 'dying';
      else if (roll < 0.34 && !mainPath.has(c)) base = 'off';
    }
    const f = {
      cell: c,
      pos: new THREE.Vector3(p.x, WALL_H - 0.17, p.z),
      color: cool ? COOL : WARM,
      base,
      mode: base,
      phase: rand() * 100,
      index: fixtures.length,
    };
    fixtures.push(f);
    fixturesByCell.set(c, f);
  }

  const housingGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.05, 18);
  const globeGeo = new THREE.SphereGeometry(0.07, 16, 12);
  const guardGeo = new THREE.TorusGeometry(0.075, 0.004, 6, 24);
  guardGeo.rotateX(Math.PI / 2);
  const housing = new THREE.InstancedMesh(housingGeo, darkMetal, fixtures.length);
  const globe = new THREE.InstancedMesh(
    globeGeo,
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    fixtures.length,
  );
  const guard = new THREE.InstancedMesh(guardGeo, darkMetal, fixtures.length);
  const m = new THREE.Matrix4();
  fixtures.forEach((f, i) => {
    m.makeTranslation(f.pos.x, WALL_H - 0.025, f.pos.z);
    housing.setMatrixAt(i, m);
    m.makeTranslation(f.pos.x, WALL_H - 0.1, f.pos.z);
    globe.setMatrixAt(i, m);
    guard.setMatrixAt(i, m);
    globe.setColorAt(i, f.color.clone().multiplyScalar(1.4));
  });
  scene.add(housing, globe, guard);

  const haloTex = makeHaloTexture();
  const pool = [];
  for (let i = 0; i < LIGHT_POOL; i++) {
    const light = new THREE.PointLight(0xffffff, 0, LIGHT_RANGE, 2);
    scene.add(light);
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: haloTex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
      }),
    );
    halo.scale.setScalar(0.75);
    scene.add(halo);
    pool.push({ light, halo, fixture: null, level: 0 });
  }

  const hemi = new THREE.HemisphereLight(0x8a93a0, 0x2a2620, 0.09);
  scene.add(hemi);

  // Pipes ------------------------------------------------------------------
  const pipeGeoms = [];
  const PIPE_Y = WALL_H - 0.3;
  const pipeR = 0.045;
  const straightNS = (c) => c >= 0 && maze.open[c] === (N | S);
  const straightEW = (c) => c >= 0 && maze.open[c] === (E | W);
  const pipeColumn = (x) => (x * 7 + 3) % 4 === 0;
  const pipeRow = (z) => (z * 5 + 1) % 4 === 0;
  const elbow = (x, z) => {
    const g = new THREE.CylinderGeometry(pipeR, pipeR, WALL_H - PIPE_Y, 10);
    g.translate(x, (WALL_H + PIPE_Y) / 2, z);
    pipeGeoms.push(g);
  };
  for (let c = 0; c < maze.size; c++) {
    const x = maze.cx(c);
    const z = maze.cz(c);
    const p = maze.center(c);
    if (straightNS(c) && pipeColumn(x)) {
      const px = p.x + CELL / 2 - HALF - 0.12;
      const g = new THREE.CylinderGeometry(pipeR, pipeR, CELL, 10);
      g.rotateX(Math.PI / 2);
      g.translate(px, PIPE_Y, p.z);
      pipeGeoms.push(g);
      const b = new THREE.BoxGeometry(0.14, 0.03, 0.04);
      b.translate(px + 0.05, PIPE_Y, p.z);
      pipeGeoms.push(b);
      if (!straightNS(maze.neighbor(c, DIRS[0]))) elbow(px, p.z - CELL / 2);
      if (!straightNS(maze.neighbor(c, DIRS[2]))) elbow(px, p.z + CELL / 2);
    } else if (straightEW(c) && pipeRow(z)) {
      const pz = p.z + CELL / 2 - HALF - 0.12;
      const g = new THREE.CylinderGeometry(pipeR, pipeR, CELL, 10);
      g.rotateZ(Math.PI / 2);
      g.translate(p.x, PIPE_Y, pz);
      pipeGeoms.push(g);
      const b = new THREE.BoxGeometry(0.04, 0.03, 0.14);
      b.translate(p.x, PIPE_Y, pz + 0.05);
      pipeGeoms.push(b);
      if (!straightEW(maze.neighbor(c, DIRS[3]))) elbow(p.x - CELL / 2, pz);
      if (!straightEW(maze.neighbor(c, DIRS[1]))) elbow(p.x + CELL / 2, pz);
    }
  }
  if (pipeGeoms.length) {
    const nonIndexed = pipeGeoms.map((g) => g.toNonIndexed());
    for (const g of nonIndexed) g.deleteAttribute('uv');
    scene.add(new THREE.Mesh(mergeGeometries(nonIndexed), pipeMat));
  }

  // Puddles ----------------------------------------------------------------
  const puddles = new QuadBatch();
  for (let c = 0; c < maze.size; c++) {
    if (c === start || maze.degree(c) !== 2 || rand() > 0.08) continue;
    const p = maze.center(c);
    const cx = p.x + (rand() - 0.5) * 1.2;
    const cz = p.z + (rand() - 0.5) * 1.2;
    const sx = 0.5 + rand() * 0.7;
    const sz = 0.35 + rand() * 0.5;
    const a = rand() * Math.PI;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const pt = (u, v) => [cx + u * ca - v * sa, 0.006, cz + u * sa + v * ca];
    puddles.add(pt(-sx, sz), pt(sx, sz), pt(sx, -sz), pt(-sx, -sz));
  }
  if (puddles.pos.length) {
    const puddleMat = new THREE.MeshStandardMaterial({
      color: 0x0c0e10,
      roughness: 0.05,
      metalness: 0,
      alphaMap: makePuddleTexture(),
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      envMap,
      envMapIntensity: 0.18,
    });
    const puddleMesh = new THREE.Mesh(puddles.geometry(), puddleMat);
    puddleMesh.renderOrder = 2;
    scene.add(puddleMesh);
  }

  // Gates ------------------------------------------------------------------
  const gates = layout.gates.map((edge, n) => {
    const ca = maze.center(edge.a);
    const cb = maze.center(edge.b);
    const dx = Math.sign(cb.x - ca.x);
    const dz = Math.sign(cb.z - ca.z);
    const mx = (ca.x + cb.x) / 2;
    const mz = (ca.z + cb.z) / 2;
    const span = CELL - WALL_T;

    const group = new THREE.Group();
    group.position.set(mx, 0, mz);
    group.rotation.y = Math.atan2(-dx, -dz);
    scene.add(group);

    const frameParts = [];
    for (const s of [-1, 1]) {
      const post = new THREE.BoxGeometry(0.07, WALL_H, 0.14);
      post.translate(s * (span / 2 - 0.035), WALL_H / 2, 0);
      frameParts.push(post);
    }
    const header = new THREE.BoxGeometry(span, 0.12, 0.16);
    header.translate(0, WALL_H - 0.06, 0);
    frameParts.push(header);
    group.add(new THREE.Mesh(mergeGeometries(frameParts), darkMetal));

    const panel = new THREE.Group();
    group.add(panel);
    const barParts = [];
    const inner = span - 0.18;
    const bars = 19;
    for (let i = 0; i < bars; i++) {
      const bar = new THREE.CylinderGeometry(0.014, 0.014, 2.84, 8);
      bar.translate(-inner / 2 + (inner * i) / (bars - 1), 1.46, 0);
      barParts.push(bar.toNonIndexed());
    }
    for (const y of [0.12, 1.0, 2.0, 2.82]) {
      const flat = new THREE.BoxGeometry(inner + 0.04, 0.05, 0.016);
      flat.translate(0, y, 0);
      barParts.push(flat.toNonIndexed());
    }
    for (const g of barParts) g.deleteAttribute('uv');
    panel.add(new THREE.Mesh(mergeGeometries(barParts), steel));

    const hasp = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.01), darkMetal);
    hasp.position.set(0, 1.04, 0.013);
    panel.add(hasp);

    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.21),
      new THREE.MeshStandardMaterial({
        map: makeGateSignTexture(NUMERALS[n], 3 + n),
        roughness: 0.7,
        metalness: 0.3,
      }),
    );
    sign.position.set(0, 1.62, 0.022);
    panel.add(sign);
    const signBack = sign.clone();
    signBack.rotation.y = Math.PI;
    signBack.position.z = -0.022;
    panel.add(signBack);

    const padlock = createPadlock(brass, darkMetal);
    const lockHome = new THREE.Vector3(0, 1.0, 0.034);
    padlock.position.copy(lockHome);
    panel.add(padlock);

    const box =
      dx !== 0
        ? collision.addBox(mx - 0.06, mx + 0.06, mz - span / 2, mz + span / 2)
        : collision.addBox(mx - span / 2, mx + span / 2, mz - 0.06, mz + 0.06);

    return {
      number: n,
      edge,
      group,
      panel,
      padlock,
      lockHome,
      box,
      state: 'locked',
      t: 0,
      lockVel: new THREE.Vector3(),
      lockSpin: new THREE.Vector3(),
      lockLanded: false,
      lockWorld() {
        return padlock.localToWorld(new THREE.Vector3(0, -0.04, 0.015));
      },
    };
  });

  // Keys -------------------------------------------------------------------
  const keys = layout.keys.map((cell, n) => {
    const [link] = maze.links(cell);
    const d = maze.dirBetween(cell, link);
    const p = maze.center(cell);
    const wx = p.x - d.dx * (CELL / 2 - HALF);
    const wz = p.z - d.dz * (CELL / 2 - HALF);
    const yaw = Math.atan2(d.dx, d.dz);

    const board = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.024), woodMat);
    board.position.set(wx + d.dx * 0.012, 1.38, wz + d.dz * 0.012);
    board.rotation.y = yaw;
    scene.add(board);
    for (const sx of [-0.1, 0.1]) {
      for (const sy of [-0.14, 0.14]) {
        const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.004, 8), steel);
        screw.rotation.x = Math.PI / 2;
        screw.position.set(sx, sy, 0.013);
        board.add(screw);
      }
    }
    const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.05, 8), steel);
    hook.rotation.x = Math.PI / 2;
    hook.position.set(0, 0.07, 0.035);
    board.add(hook);

    const mesh = createKeyMesh(n, brass, makeTagTexture(NUMERALS[n]));
    const home = new THREE.Vector3(wx + d.dx * 0.058, 1.45, wz + d.dz * 0.058);
    mesh.position.copy(home);
    mesh.rotation.set(0, yaw, 0);
    scene.add(mesh);

    return {
      number: n,
      cell,
      mesh,
      home,
      homeQuat: mesh.quaternion.clone(),
      state: 'hanging',
      holder: null,
      tipLocal: new THREE.Vector3(0, -0.105, 0),
      tip() {
        return mesh.localToWorld(this.tipLocal.clone());
      },
    };
  });

  // Start room: note and the door you came in through ---------------------
  const startCenter = maze.center(start);
  const firstStep = maze.dirBetween(start, layout.path[1]);
  const closedSides = DIRS.filter((d) => !(maze.open[start] & d.bit));
  const back = DIRS.find((d) => d.dx === -firstStep.dx && d.dz === -firstStep.dz);
  const noteSide = closedSides.includes(back) ? back : closedSides[0];
  const doorSide = closedSides.find((d) => d !== noteSide) ?? noteSide;

  const noteMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.84),
    new THREE.MeshStandardMaterial({ map: makeNoteTexture(NOTE_TEXT, NOTE_FOOTER), roughness: 0.92 }),
  );
  const faceOffset = CELL / 2 - HALF - 0.006;
  noteMesh.position.set(
    startCenter.x + noteSide.dx * faceOffset,
    1.5,
    startCenter.z + noteSide.dz * faceOffset,
  );
  noteMesh.rotation.y = Math.atan2(-noteSide.dx, -noteSide.dz);
  scene.add(noteMesh);

  if (doorSide !== noteSide) {
    const door = new THREE.Group();
    door.position.set(
      startCenter.x + doorSide.dx * (CELL / 2 - HALF),
      0,
      startCenter.z + doorSide.dz * (CELL / 2 - HALF),
    );
    door.rotation.y = Math.atan2(-doorSide.dx, -doorSide.dz);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.96, 2.06, 0.05), doorMat);
    leaf.position.set(0, 1.04, 0.02);
    door.add(leaf);
    const frameParts = [];
    for (const s of [-1, 1]) {
      const jamb = new THREE.BoxGeometry(0.06, 2.12, 0.07);
      jamb.translate(s * 0.51, 1.06, 0.02);
      frameParts.push(jamb);
    }
    const head = new THREE.BoxGeometry(1.08, 0.06, 0.07);
    head.translate(0, 2.12, 0.02);
    frameParts.push(head);
    door.add(new THREE.Mesh(mergeGeometries(frameParts), darkMetal));
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.022, 0.03), steel);
    handle.position.set(0.34, 1.02, 0.065);
    door.add(handle);
    scene.add(door);
  }

  // Exit door, daylight and sign ------------------------------------------
  {
    const mid = exitZ * CELL + CELL / 2;
    const hingeZ = mid - 0.5;
    const leafPivot = new THREE.Group();
    leafPivot.position.set(vx1 + HALF, 0, hingeZ);
    leafPivot.rotation.y = 1.25;
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.045, 2.06, 0.96), doorMat);
    leaf.position.set(0, 1.04, 0.48);
    leafPivot.add(leaf);
    scene.add(leafPivot);

    const daylight = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 5),
      new THREE.MeshBasicMaterial({ color: 0xf4f1ea, fog: false, toneMapped: false }),
    );
    daylight.position.set(vx1 + 1.6, 1.5, mid);
    daylight.rotation.y = -Math.PI / 2;
    scene.add(daylight);

    const spill = new THREE.PointLight(0xe8efff, 7, 9, 2);
    spill.position.set(vx1 - 0.5, 1.9, mid);
    scene.add(spill);

    const signCanvas = document.createElement('canvas');
    signCanvas.width = 256;
    signCanvas.height = 96;
    const sctx = signCanvas.getContext('2d');
    sctx.fillStyle = '#0d3b22';
    sctx.fillRect(0, 0, 256, 96);
    sctx.fillStyle = '#7dffb2';
    sctx.font = 'bold 64px "Arial Narrow", Arial, sans-serif';
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.fillText('EXIT', 128, 52);
    const signTex = new THREE.CanvasTexture(signCanvas);
    signTex.colorSpace = THREE.SRGBColorSpace;
    const exitSign = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.16, 0.42),
      [
        new THREE.MeshBasicMaterial({ color: 0x1a1d1c }),
        new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false }),
        new THREE.MeshBasicMaterial({ color: 0x1a1d1c }),
        new THREE.MeshBasicMaterial({ color: 0x1a1d1c }),
        new THREE.MeshBasicMaterial({ color: 0x1a1d1c }),
        new THREE.MeshBasicMaterial({ color: 0x1a1d1c }),
      ],
    );
    exitSign.position.set(vx1 - HALF - 0.03, 2.42, mid);
    scene.add(exitSign);
  }

  const exitZone = {
    minx: vx1 - 1.2,
    minz: exitZ * CELL,
    maxz: exitZ * CELL + CELL,
  };

  const spawn = {
    x: startCenter.x + noteSide.dx * 0.4,
    z: startCenter.z + noteSide.dz * 0.4,
    yaw: Math.atan2(-noteSide.dx, -noteSide.dz),
  };

  // Runtime ----------------------------------------------------------------
  let lightTimer = 0;
  let desired = [];
  const globeColor = new THREE.Color();

  function chooseLights(headCell, head) {
    if (headCell < 0) {
      desired = [fixturesByCell.get(exit)];
      return;
    }
    const seen = new Map([[headCell, 0]]);
    const queue = [headCell];
    for (let h = 0; h < queue.length; h++) {
      const c = queue[h];
      const d = seen.get(c);
      if (d >= 3) continue;
      for (const n of maze.links(c)) {
        if (!seen.has(n)) {
          seen.set(n, d + 1);
          queue.push(n);
        }
      }
    }
    const found = [];
    for (const [c, d] of seen) {
      const f = fixturesByCell.get(c);
      if (f.mode === 'on' || f.mode === 'alarm') found.push([f, d + f.pos.distanceTo(head) * 0.05]);
      else if (f.mode === 'flicker') found.push([f, d + 0.3]);
      else if (f.mode === 'dying' && d <= 2) found.push([f, d + 1.2]);
    }
    found.sort((a, b) => a[1] - b[1]);
    desired = found.slice(0, LIGHT_POOL).map(([f]) => f);
  }

  // A dead bulb that sputters back on in short bursts.
  function dyingLevel(f, time) {
    const t = time + f.phase;
    const burst = Math.sin(t * 0.7) * Math.sin(t * 1.9 + 1.3);
    if (burst < 0.5) return 0;
    return (Math.sin(t * 47) > 0 ? 1 : 0.15) * (0.55 + 0.45 * Math.sin(t * 13));
  }

  // Failing strip of corridor: mostly dark, with harsh irregular strobes.
  function strobeLevel(f, time) {
    const t = time + f.phase;
    const gate = Math.sin(t * 1.1) * Math.sin(t * 2.9 + 0.7) + Math.sin(t * 0.37) * 0.4;
    if (gate < 0.15) return 0.04;
    return Math.sin(t * 61) > 0.1 ? 1 : 0.05;
  }

  function lampLevel(f, time) {
    switch (f.mode) {
      case 'on':
        return 1;
      case 'dying':
        return 0.45 * dyingLevel(f, time);
      case 'flicker':
        return strobeLevel(f, time);
      case 'alarm':
        return 0.25 + 0.75 * Math.pow(Math.max(0, Math.sin(time * 5.5 + f.phase * 0.2)), 2);
      default:
        return 0;
    }
  }

  const lampColor = (f) => (f.mode === 'alarm' ? RED : f.color);

  const DEAD_BULB = new THREE.Color(0x141414);
  function paintGlobe(f, level) {
    if (level <= 0.02) globe.setColorAt(f.index, DEAD_BULB);
    else globe.setColorAt(f.index, globeColor.copy(lampColor(f)).multiplyScalar(1.4 * level));
  }

  // `modeOf(cell, base)` returns 'on', 'dying', 'off', 'flicker' or 'alarm'.
  function setLampModes(modeOf) {
    for (const f of fixtures) {
      f.mode = modeOf(f.cell, f.base);
      paintGlobe(f, lampLevel(f, 0));
    }
    globe.instanceColor.needsUpdate = true;
    lightTimer = 0;
  }

  function updateLights(dt, time, head) {
    lightTimer -= dt;
    if (lightTimer <= 0) {
      lightTimer = 0.2;
      chooseLights(maze.cellAt(head.x, head.z), head);
    }
    const want = new Set(desired);
    for (const slot of pool) {
      if (slot.fixture && !want.has(slot.fixture)) {
        slot.level -= dt * 2.5;
        if (slot.level <= 0) {
          slot.level = 0;
          slot.fixture = null;
        }
      } else if (slot.fixture) {
        slot.level = Math.min(1, slot.level + dt * 2.5);
      }
    }
    const assigned = new Set(pool.map((s) => s.fixture).filter(Boolean));
    for (const f of desired) {
      if (assigned.has(f)) continue;
      const free = pool.find((s) => !s.fixture);
      if (!free) break;
      free.fixture = f;
      free.level = 0;
      free.light.position.copy(f.pos);
      free.light.color.copy(f.color);
      free.halo.position.set(f.pos.x, WALL_H - 0.1, f.pos.z);
      free.halo.material.color.copy(f.color);
    }
    for (const slot of pool) {
      const f = slot.fixture;
      const fl = f ? lampLevel(f, time) : 0;
      if (f) {
        slot.light.color.copy(lampColor(f));
        slot.halo.material.color.copy(lampColor(f));
      }
      slot.light.intensity = LIGHT_INTENSITY * slot.level * fl;
      slot.halo.material.opacity = 0.55 * slot.level * fl;
    }
    let repaint = false;
    for (const f of fixtures) {
      if (f.mode === 'on' || f.mode === 'off') continue;
      paintGlobe(f, lampLevel(f, time));
      repaint = true;
    }
    if (repaint) globe.instanceColor.needsUpdate = true;
  }

  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function updateGates(dt, onLanded) {
    for (const g of gates) {
      if (g.state !== 'opening') continue;
      g.t += dt;
      const lift = ease(Math.min(1, Math.max(0, (g.t - 0.6) / 3.2)));
      g.panel.position.y = lift * 2.78;
      if (g.panel.position.y > 2.0) g.box.enabled = false;

      if (!g.lockLanded) {
        g.lockVel.y -= 9.8 * dt;
        g.padlock.position.addScaledVector(g.lockVel, dt);
        g.padlock.rotation.x += g.lockSpin.x * dt;
        g.padlock.rotation.z += g.lockSpin.z * dt;
        if (g.padlock.position.y < 0.016) {
          g.padlock.position.y = 0.016;
          if (Math.abs(g.lockVel.y) > 0.8) {
            onLanded?.(g.padlock.position, Math.abs(g.lockVel.y));
            g.lockVel.y *= -0.28;
            g.lockVel.x *= 0.5;
            g.lockVel.z *= 0.5;
          } else {
            g.lockLanded = true;
            g.padlock.rotation.set(Math.PI / 2, g.padlock.rotation.y, 0);
          }
        }
      }
      if (g.t > 4) g.state = 'open';
    }
  }

  function unlockGate(g) {
    if (g.state !== 'locked') return;
    g.state = 'opening';
    g.t = 0;
    scene.attach(g.padlock);
    g.padlock.userData.shackle.position.y = 0.018;
    const away = new THREE.Vector3(0, 0, 1).applyQuaternion(g.group.quaternion);
    g.lockVel.set(away.x * 0.6, 0.6, away.z * 0.6);
    g.lockSpin.set(4 + Math.random() * 3, 0, (Math.random() - 0.5) * 6);
    g.lockLanded = false;
  }

  function reset() {
    for (const g of gates) {
      g.state = 'locked';
      g.t = 0;
      g.panel.position.y = 0;
      g.box.enabled = true;
      g.panel.add(g.padlock);
      g.padlock.position.copy(g.lockHome);
      g.padlock.rotation.set(0, 0, 0);
      g.padlock.userData.shackle.position.y = 0.006;
    }
    for (const k of keys) {
      scene.add(k.mesh);
      k.mesh.position.copy(k.home);
      k.mesh.quaternion.copy(k.homeQuat);
      k.mesh.scale.setScalar(1.3);
      k.mesh.visible = true;
      k.state = 'hanging';
      k.holder = null;
    }
  }

  return {
    maze,
    collision,
    gates,
    keys,
    spawn,
    exitZone,
    fixtures,
    unlockGate,
    setLampModes,
    reset,
    update(dt, time, head, onLockLanded) {
      updateLights(dt, time, head);
      updateGates(dt, onLockLanded);
    },
  };
}
