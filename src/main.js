import * as THREE from 'three';
import './style.css';
import { CELL, MAZE_SEED } from './config.js';
import { buildLayout } from './maze.js';
import { buildWorld } from './world.js';
import { AudioSystem } from './audio.js';
import { Hints } from './hints.js';
import { Player } from './player.js';
import { Game } from './game.js';
import { Interactions } from './interactions.js';
import { UI } from './ui.js';

const params = new URLSearchParams(location.search);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x08090b);
scene.fog = new THREE.FogExp2(0x08090b, 0.075);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.03, 120);

const layout = buildLayout(MAZE_SEED);
const world = buildWorld(renderer, scene, layout);
const audio = new AudioSystem(camera, scene);
const hints = new Hints(scene, layout.maze);
const player = new Player({ renderer, camera, scene, collision: world.collision, audio });
const game = new Game({ world, hints, layout });
const interactions = new Interactions({ scene, camera, renderer, world, audio, game });
const ui = new UI({ scene, player });

const maze = layout.maze;
const exitAir = new THREE.Vector3(world.exitZone.minx + 1.2, 1.2, (world.exitZone.minz + world.exitZone.maxz) / 2);

function spawnAtStart() {
  player.spawn(world.spawn.x, world.spawn.z, world.spawn.yaw);
}
spawnAtStart();

// Debug starting points for checking a scene quickly: ?at=key1, ?at=gate2, ?at=exit
const at = params.get('at');
if (at) {
  const n = Number(at.slice(-1)) - 1;
  let from = -1;
  let toward = -1;
  if (at.startsWith('key')) {
    toward = layout.keys[n];
    from = maze.links(toward)[0];
  } else if (at.startsWith('gate')) {
    toward = layout.gates[n].b;
    from = layout.gates[n].a;
  } else if (at === 'exit') {
    from = layout.exit;
  } else if (at === 'junction') {
    const route = maze.path(layout.start, layout.keys[0]);
    from = route.find((c, i) => i > 0 && maze.degree(c) >= 3) ?? -1;
    toward = from >= 0 ? route[route.indexOf(from) + 1] : -1;
  }
  if (from >= 0) {
    const p = maze.center(from);
    const q = toward >= 0 ? maze.center(toward) : { x: p.x + CELL, z: p.z };
    player.spawn(p.x, p.z, Math.atan2(-(q.x - p.x), -(q.z - p.z)));
    if (at === 'exit') game.stage = 3;
  }
}
if (params.has('pitch')) player.pitch = Number(params.get('pitch'));
if (params.has('turn')) player.yaw += (Number(params.get('turn')) * Math.PI) / 180;

player.onUse = () => interactions.desktopUse();
player.onHint = () => askTrail();
player.onSqueeze = (c) => interactions.squeeze(c);
player.onPrimary = () => (game.finished ? restart() : askTrail());

function askTrail() {
  const h = player.head();
  if (hints.requestTrail(maze.cellAt(h.x, h.z))) audio.play('paint', 0.6);
}

game.onFinish = () => {
  const xr = renderer.xr.isPresenting;
  player.fadeTo(xr ? 0.55 : 0.9, 1.2, 0xf4efe6);
  ui.showEnd({ time: game.time, trails: hints.used, xr, head: player.head(), yaw: player.headYaw() });
  if (!xr) {
    player.enabled = false;
    document.exitPointerLock();
  }
};

function restart() {
  world.reset();
  hints.reset();
  interactions.reset();
  game.reset();
  ui.hideEnd();
  player.fadeTo(0, 3);
  spawnAtStart();
  game.start();
  player.enabled = true;
  if (!renderer.xr.isPresenting) renderer.domElement.requestPointerLock();
}

// Starting -----------------------------------------------------------------
let started = false;
const enterVR = document.getElementById('enter-vr');
const playScreen = document.getElementById('play-screen');
const vrStatus = document.getElementById('vr-status');

function begin() {
  audio.init();
  audio.addExitAir(exitAir);
  if (!started) {
    started = true;
    game.start();
    game.onKeyChanged();
  }
  player.enabled = true;
  ui.showIntro(false);
}

playScreen.addEventListener('click', () => {
  begin();
  ui.showHud(true);
  renderer.domElement.requestPointerLock();
});

renderer.domElement.addEventListener('click', () => {
  if (started && !game.finished && !renderer.xr.isPresenting && document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock();
  }
});
document.getElementById('pause').addEventListener('click', () => renderer.domElement.requestPointerLock());
document.getElementById('again').addEventListener('click', restart);

document.addEventListener('pointerlockchange', () => {
  if (renderer.xr.isPresenting || !started || game.finished) return;
  const locked = document.pointerLockElement === renderer.domElement;
  player.enabled = locked;
  ui.showPause(!locked && ui.el.intro.hidden);
});

let xrSession = null;
enterVR.addEventListener('click', async () => {
  if (xrSession) return;
  try {
    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor'],
    });
    xrSession = session;
    session.addEventListener('end', () => {
      xrSession = null;
      player.enabled = false;
      ui.showHud(false);
      ui.showIntro(true);
      enterVR.textContent = 'Back into VR';
      playScreen.textContent = 'Keep going on this screen';
    });
    begin();
    ui.showHud(false);
    ui.showPause(false);
    await renderer.xr.setSession(session);
  } catch (err) {
    vrStatus.textContent = `Could not start VR: ${err.message}`;
  }
});

if (!window.isSecureContext) {
  vrStatus.textContent = 'VR needs this page on HTTPS. Use the https:// address from the dev server.';
} else if (!navigator.xr) {
  vrStatus.textContent = 'No WebXR here. On a Quest, open this page in the Meta Quest Browser.';
} else {
  navigator.xr
    .isSessionSupported('immersive-vr')
    .then((ok) => {
      enterVR.disabled = !ok;
      vrStatus.textContent = ok ? 'Headset ready.' : 'No headset found. You can still play on this screen.';
    })
    .catch(() => {
      vrStatus.textContent = 'No headset found. You can still play on this screen.';
    });
}

if (params.has('shot')) {
  started = true;
  game.start();
  game.onKeyChanged();
  ui.showIntro(false);
  ui.showHud(true);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Frame --------------------------------------------------------------------
let last = performance.now();
let elapsed = 0;
const onLockLanded = (p, speed) => audio.at('clank', p, Math.min(1, speed / 3), 0.9);

renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  elapsed += dt;

  player.update(dt);
  const head = player.head();
  interactions.update(dt);
  game.update(dt, head);
  hints.update(dt, maze.cellAt(head.x, head.z));
  world.update(dt, elapsed, head, onLockLanded);
  audio.update(dt, head);
  ui.update({
    time: game.time,
    objective: game.objective(),
    hintReady: hints.ready,
    hintCooldown: hints.cooldown,
    prompt: interactions.prompt,
    xr: renderer.xr.isPresenting,
  });

  renderer.render(scene, camera);
});

window.__maze = { layout, world, player, game, hints, interactions };
