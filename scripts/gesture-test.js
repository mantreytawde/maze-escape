// Checks the hand-gesture classifier against hand-made joint poses (metres, fingers pointing -z).
import * as THREE from 'three';
import { newGesture, readGesture, classifyLocomotion } from '../src/gestures.js';

function hand(joints) {
  const root = new THREE.Group();
  root.joints = {};
  for (const [name, p] of Object.entries(joints)) {
    const j = new THREE.Object3D();
    j.position.set(...p);
    root.add(j);
    root.joints[name] = j;
  }
  root.updateMatrixWorld(true);
  return root;
}

// Right hand, palm down. Mirror x for the left hand; flip y and x to turn the palm up.
const OPEN = {
  wrist: [0, 0, 0],
  'thumb-tip': [-0.08, 0, -0.1],
  'index-finger-tip': [-0.03, 0, -0.17],
  'middle-finger-tip': [-0.005, 0, -0.18],
  'ring-finger-tip': [0.015, 0, -0.17],
  'index-finger-phalanx-proximal': [-0.025, 0, -0.09],
  'pinky-finger-phalanx-proximal': [0.035, 0, -0.08],
};
const PINCH = { ...OPEN, 'thumb-tip': [-0.05, -0.02, -0.13], 'index-finger-tip': [-0.052, -0.022, -0.132] };
const FIST = {
  ...OPEN,
  'thumb-tip': [-0.04, -0.03, -0.07],
  'index-finger-tip': [-0.03, -0.03, -0.07],
  'middle-finger-tip': [-0.005, -0.035, -0.07],
  'ring-finger-tip': [0.015, -0.03, -0.065],
};
const map = (pose, f) => Object.fromEntries(Object.entries(pose).map(([k, p]) => [k, f(p)]));
const mirror = (pose) => map(pose, ([x, y, z]) => [-x, y, z]);
const palmUp = (pose) => map(pose, ([x, y, z]) => [-x, -y, z]);
const head = new THREE.Vector3(0, 0.35, 0.25);

let failures = 0;
function check(label, side, poses, expect) {
  const g = newGesture();
  for (const p of poses) readGesture(hand(p), side, head, g);
  const got = Object.fromEntries(Object.keys(expect).map((k) => [k, g[k]]));
  const ok = Object.keys(expect).every((k) => got[k] === expect[k]);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`, ok ? '' : JSON.stringify(got));
}

check('open right hand', 'right', [OPEN], { tracked: true, pinch: false, fist: false });
check('right pinch starts', 'right', [OPEN, PINCH], { pinch: true, pinchStart: true, fist: false });
check('right pinch ends', 'right', [OPEN, PINCH, OPEN], { pinch: false, pinchEnd: true });
check('right fist', 'right', [OPEN, FIST], { fist: true, fistStart: true, pinch: false });
check('fist opens', 'right', [OPEN, FIST, OPEN], { fist: false, fistEnd: true });
check('left palm down is away from face', 'left', [mirror(OPEN)], { palmToFace: false });
check('left palm up toward face', 'left', [palmUp(mirror(OPEN))], { palmToFace: true });
check('left palm-up pinch', 'left', [palmUp(mirror(OPEN)), palmUp(mirror(PINCH))], { pinchStart: true, palmToFace: true });
check('right palm down is away from face', 'right', [OPEN], { palmToFace: false });
check('right palm up toward face', 'right', [palmUp(OPEN)], { palmToFace: true });
check('lost tracking', 'right', [OPEN, { wrist: [0, 0, 0] }], { tracked: false, pinch: false });

// Arm positions: wrist relative to the head, in metres (fwd along the gaze, side to the right, up).
const loco = [
  ['arm straight ahead', { fwd: 0.5, side: 0.15, up: -0.25 }, true, 'forward'],
  ['arm ahead, other side', { fwd: 0.48, side: -0.18, up: -0.3 }, true, 'forward'],
  ['hand back by the shoulder', { fwd: -0.02, side: 0.2, up: -0.22 }, true, 'back'],
  ['arm out to the right', { fwd: 0.1, side: 0.62, up: -0.28 }, true, 'right'],
  ['arm out to the left', { fwd: 0.05, side: -0.6, up: -0.3 }, true, 'left'],
  ['hand resting at your side', { fwd: 0.05, side: 0.22, up: -0.8 }, true, null],
  ['hands held near the chest', { fwd: 0.3, side: 0.1, up: -0.4 }, true, null],
  ['touching the headset', { fwd: 0.12, side: 0.05, up: 0.02 }, true, null],
  ['fist held forward', { fwd: 0.5, side: 0.1, up: -0.25 }, false, null],
];
for (const [label, rel, open, want] of loco) {
  const got = classifyLocomotion(rel, open);
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`, ok ? '' : `got ${got}, wanted ${want}`);
}

console.log(failures ? `${failures} failed` : 'all gestures ok');
process.exit(failures ? 1 : 0);
