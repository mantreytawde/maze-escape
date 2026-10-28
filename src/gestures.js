import * as THREE from 'three';

// Distances in metres between tracked hand joints, with a gap between "on" and "off" so gestures don't flicker.
const PINCH_ON = 0.018;
const PINCH_OFF = 0.035;
const PINCH_INDEX_OPEN = 0.105;
const FIST_ON = 0.095;
const FIST_OFF = 0.125;
const PALM_TO_FACE = 0.55;

const v = () => new THREE.Vector3();
const tmp = { wrist: v(), thumb: v(), index: v(), middle: v(), ring: v(), knuckleI: v(), knuckleP: v() };

export function newGesture() {
  return {
    tracked: false,
    pinch: false,
    fist: false,
    pinchStart: false,
    pinchEnd: false,
    fistStart: false,
    fistEnd: false,
    palmToFace: false,
    point: new THREE.Vector3(),
    wrist: new THREE.Vector3(),
    tip: new THREE.Vector3(),
  };
}

// Where an open hand is held, relative to the head (metres): fwd along the gaze, side to the right, up.
// Hands resting by your sides are ignored. Arm straight ahead walks forward, hand pulled back beside
// the shoulder walks back, and an arm held out to one side turns that way.
export function classifyLocomotion(rel, open) {
  if (!open || rel.up < -0.58) return null;
  if (Math.abs(rel.side) > 0.45 && rel.fwd > -0.2 && rel.fwd < 0.38) return rel.side > 0 ? 'right' : 'left';
  if (rel.fwd > 0.4 && Math.abs(rel.side) < 0.4) return 'forward';
  if (rel.fwd < 0.06 && rel.up > -0.4 && Math.abs(rel.side) < 0.38) return 'back';
  return null;
}

function joint(hand, name, out) {
  const j = hand.joints?.[name];
  if (!j || !j.visible) return null;
  return j.getWorldPosition(out);
}

// Updates `g` in place from the hand's joints this frame.
export function readGesture(hand, handedness, head, g) {
  const wrist = joint(hand, 'wrist', tmp.wrist);
  const thumb = joint(hand, 'thumb-tip', tmp.thumb);
  const index = joint(hand, 'index-finger-tip', tmp.index);
  const middle = joint(hand, 'middle-finger-tip', tmp.middle);
  const ring = joint(hand, 'ring-finger-tip', tmp.ring);
  const kI = joint(hand, 'index-finger-phalanx-proximal', tmp.knuckleI);
  const kP = joint(hand, 'pinky-finger-phalanx-proximal', tmp.knuckleP);

  const wasPinch = g.pinch;
  const wasFist = g.fist;
  g.tracked = !!(wrist && thumb && index && middle && ring && kI && kP);

  if (!g.tracked) {
    g.pinch = false;
    g.fist = false;
  } else {
    const curl = (index.distanceTo(wrist) + middle.distanceTo(wrist) + ring.distanceTo(wrist)) / 3;
    g.fist = g.fist ? curl < FIST_OFF : curl < FIST_ON;

    const gap = thumb.distanceTo(index);
    const indexOpen = index.distanceTo(wrist) > PINCH_INDEX_OPEN;
    g.pinch = !g.fist && indexOpen && (g.pinch ? gap < PINCH_OFF : gap < PINCH_ON);
    g.point.copy(index).add(thumb).multiplyScalar(0.5);
    g.wrist.copy(wrist);
    g.tip.copy(index);

    const a = kI.clone().sub(wrist);
    const b = kP.clone().sub(wrist);
    const normal = handedness === 'left' ? b.cross(a) : a.cross(b);
    const toFace = head.clone().sub(wrist).normalize();
    g.palmToFace = normal.normalize().dot(toFace) > PALM_TO_FACE;
  }

  g.pinchStart = g.pinch && !wasPinch;
  g.pinchEnd = !g.pinch && wasPinch;
  g.fistStart = g.fist && !wasFist;
  g.fistEnd = !g.fist && wasFist;
  return g;
}
