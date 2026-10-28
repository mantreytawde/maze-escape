import * as THREE from 'three';
import './style.css';
import { CELL, MAZE_SEED, DESKTOP_FOV, ARROW_SECONDS, LIVES } from './config.js';
import { buildLayout } from './maze.js';
import { buildWorld } from './world.js';
import { AudioSystem } from './audio.js';
import { Hints } from './hints.js';
import { Player } from './player.js';
import { Game, formatTime } from './game.js';
import { Interactions } from './interactions.js';
import { UI } from './ui.js';
import { Zombie } from './zombie.js';
import { Hazards } from './danger.js';
import { Quiz } from './quiz.js';
import { Voice, matchAnswer, requestMicrophone } from './speech.js';
import { Panel, PanelPointer } from './vrui.js';
import { Lobby } from './lobby.js';
import { Guide } from './guide.js';
import { Tutorial } from './tutorial.js';
import { Celebration } from './celebrate.js';

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
const canvas = renderer.domElement;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x08090b);
scene.fog = new THREE.FogExp2(0x08090b, 0.075);

const camera = new THREE.PerspectiveCamera(DESKTOP_FOV, window.innerWidth / window.innerHeight, 0.05, 80);

const layout = buildLayout(MAZE_SEED);
const maze = layout.maze;
const world = buildWorld(renderer, scene, layout);
const audio = new AudioSystem(camera, scene);
const hints = new Hints(scene, maze);
const hazards = new Hazards(layout);
const quiz = new Quiz();
const voice = new Voice();
const player = new Player({ renderer, camera, scene, collision: world.collision, audio });
const game = new Game({ world, hints, layout });
const interactions = new Interactions({ scene, camera, renderer, world, audio, game, player });
const ui = new UI({ camera });
const zombie = new Zombie({ scene, camera, maze, collision: world.collision, hints, audio, player, game, ui });
zombie.enabled = !params.has('calm');
const lobby = new Lobby(scene);
const guide = new Guide(scene);
const celebration = new Celebration(scene, audio);

const panel = new Panel({ width: 0.9, height: 0.62, name: 'menu' });
const tutorialPanel = new Panel({ width: 0.95, height: 0.68, name: 'tutorial' });
scene.add(panel.mesh, tutorialPanel.mesh);
const pointer = new PanelPointer(scene, player, audio);
const tutorial = new Tutorial({ panel: tutorialPanel, guide, player, audio });

const lampModes = (cell, base) => hazards.lampMode(cell, base);
const exitAir = new THREE.Vector3(world.exitZone.minx + 1.2, 1.2, (world.exitZone.minz + world.exitZone.maxz) / 2);
const xr = () => renderer.xr.isPresenting;

let mode = 'home';
let tutorialDone = false;
let lastWrong = false;
let xrSession = null;
let quizShown = '';
const deferred = [];
const later = (frames, fn) => deferred.push({ frames, fn });

const BEST_KEY = 'maze-escape-best';
const best = () => Number(localStorage.getItem(BEST_KEY)) || 0;

function placeInView(p, dist = 1.2, dy = -0.08) {
  later(3, () => p.placeInFront(player.head(), player.headYaw(), dist, dy));
}

function lockPointer() {
  if (xr()) return;
  try {
    const p = canvas.requestPointerLock();
    p?.catch?.(() => {});
  } catch {
    /* needs a click */
  }
}

// Run lifecycle ------------------------------------------------------------
function resetRun() {
  world.reset();
  hints.reset();
  interactions.reset();
  game.reset();
  zombie.reset();
  hazards.reset();
  quiz.reset();
  voice.stop();
  audio.setAlarm(false);
  hints.setDanger(null);
  game.refreshRoute();
  world.setLampModes(lampModes);
  lastWrong = false;
}

function leaveLobby() {
  lobby.group.visible = false;
  guide.show(false);
  celebration.stop();
  tutorial.stop();
  player.bounds = null;
}

function enterLobby() {
  lobby.group.visible = true;
  const s = lobby.spawn;
  player.spawn(s.x, s.z, s.yaw);
  player.bounds = lobby.bounds;
  player.blink();
  const g = lobby.point(-0.45, 0, -1.2);
  guide.place(g, Math.atan2(s.x - g.x, s.z - g.z));
  audio.setAmbient(0.1);
}

function startGame() {
  audio.init();
  audio.addExitAir(exitAir);
  resetRun();
  leaveLobby();
  panel.hide();
  ui.screen(null);
  player.spawn(world.spawn.x, world.spawn.z, world.spawn.yaw);
  player.uiLock = false;
  player.frozen = false;
  player.fadeTo(0, 2);
  player.blink();
  game.start();
  mode = 'play';
  audio.scares = true;
  audio.scareTimer = 18;
  audio.setAmbient(0.22);
  ui.showHud(!xr());
  ui.showVrHud(xr());
  if (xr()) {
    player.enabled = true;
    ui.toast(player.usingHands ? 'Menu: left palm to face + pinch' : 'Menu: press A, B, X or Y', '#e0b26a', 4);
  } else {
    lockPointer();
    ui.toast('Find key I. Esc opens the menu', '#e0b26a', 3);
  }
}

function startFromHome() {
  if (xr() && !tutorialDone) startTutorial();
  else startGame();
}

function goHome() {
  mode = 'home';
  resetRun();
  audio.scares = false;
  ui.showHud(false);
  ui.showVrHud(false);
  celebration.stop();
  player.fadeTo(0, 3);
  player.uiLock = false;
  enterLobby();
  if (xr()) {
    showVrHome();
  } else {
    panel.hide();
    player.enabled = false;
    if (document.pointerLockElement) document.exitPointerLock();
    showDesktopHome();
  }
}

function showDesktopHome() {
  ui.screen('home');
  guide.show(true);
  guide.play('wave');
  const b = best();
  document.getElementById('best').textContent = b ? `Best time: ${formatTime(b)}` : '';
}

function showVrHome() {
  guide.show(true);
  guide.play('wave');
  const b = best();
  panel.show({
    badge: 'Maze Escape',
    title: 'Ready to escape?',
    lines: [b ? `Best time ${formatTime(b)}` : 'Three keys, three gates, one way out.'],
    layout: 'column',
    buttons: [
      { id: 'start', label: 'Start game', color: '#7fe08a' },
      { id: 'tutorial', label: 'Tutorial' },
      { id: 'exitvr', label: 'Exit VR' },
    ],
  });
  placeInView(panel, 1.3, -0.12);
}

function startTutorial() {
  mode = 'tutorial';
  panel.hide();
  enterLobby();
  guide.show(true);
  later(3, () => updateStage(0, player.head(), true));
  tutorial.start(player.usingHands || !xr());
}

// The guide and the tutorial panel stay in front of you as you practise walking and turning: they
// settle back into place whenever you stop.
const stage = { yaw: 0, still: 0 };
function updateStage(dt, head, snap = false) {
  const yaw = player.headYaw();
  stage.still = player.moving || player.aiming ? 0 : stage.still + dt;
  let diff = yaw - stage.yaw;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  if (snap || (stage.still > 0.3 && Math.abs(diff) > 0.6)) stage.yaw = yaw;
  const f = { x: -Math.sin(stage.yaw), z: -Math.cos(stage.yaw) };
  const r = { x: -f.z, z: f.x };
  const g = new THREE.Vector3(head.x + f.x * 2.2 - r.x * 0.45, 0, head.z + f.z * 2.2 - r.z * 0.45);
  const p = new THREE.Vector3(head.x + f.x * 1.1 + r.x * 0.6, head.y - 0.12, head.z + f.z * 1.1 + r.z * 0.6);
  const off = Math.hypot(p.x - tutorialPanel.mesh.position.x, p.z - tutorialPanel.mesh.position.z);
  if (off > 0.45) stage.settling = true;
  if (off < 0.03) stage.settling = false;
  const k = snap ? 1 : stage.still > 0.35 && stage.settling ? Math.min(1, dt * 3) : 0;
  if (k > 0) {
    guide.root.position.lerp(g, k);
    tutorialPanel.mesh.position.lerp(p, k);
  }
  guide.root.rotation.y = Math.atan2(head.x - guide.root.position.x, head.z - guide.root.position.z);
  const m = tutorialPanel.mesh.position;
  tutorialPanel.mesh.rotation.set(0, Math.atan2(head.x - m.x, head.z - m.z), 0);
}

tutorial.onFinish = () => {
  tutorialDone = true;
  startGame();
};

// Menus ----------------------------------------------------------------------
function openMenu() {
  if (mode === 'tutorial') {
    tutorial.menuOpened();
    return;
  }
  if (mode === 'menu') {
    closeMenu();
    return;
  }
  if (mode !== 'play' || zombie.state === 'caught') return;
  mode = 'menu';
  player.uiLock = true;
  if (xr()) {
    panel.show({
      title: 'Paused',
      titleSize: 56,
      layout: 'column',
      buttonHeight: 74,
      buttons: [
        { id: 'resume', label: 'Resume', color: '#7fe08a' },
        { id: 'restart', label: 'Restart' },
        { id: 'home', label: 'Exit to home' },
        { id: 'comfort', label: `Comfort tunnel: ${player.comfort ? 'on' : 'off'}` },
        { id: 'exitvr', label: 'Exit VR' },
      ],
    });
    placeInView(panel, 1.2, -0.05);
  } else {
    ui.screen('pause');
  }
}

function closeMenu() {
  mode = 'play';
  player.uiLock = false;
  panel.hide();
  ui.screen(null);
  lockPointer();
}

player.onMenu = openMenu;
player.onUse = () => interactions.desktopUse();
player.onAnswerKey = (i) => {
  if (mode === 'quiz' && !xr()) answerQuiz(i);
};

function onPanelPress({ panel: p, id }) {
  if (p === tutorialPanel) {
    tutorial.press(id);
    return;
  }
  if (id.startsWith('opt')) answerQuiz(Number(id.slice(3)));
  else if (id === 'start') startFromHome();
  else if (id === 'tutorial') startTutorial();
  else if (id === 'exitvr') xrSession?.end();
  else if (id === 'resume') closeMenu();
  else if (id === 'restart' || id === 'again') startGame();
  else if (id === 'home') goHome();
  else if (id === 'comfort') {
    player.comfort = !player.comfort;
    mode = 'play';
    openMenu();
  }
}

// Questions ------------------------------------------------------------------
function renderQuizPanel(footer) {
  const q = quiz.current;
  if (!q) return;
  panel.show({
    badge: 'Quick question',
    title: q.text,
    titleSize: 110,
    lines: [],
    status: `${Math.ceil(q.timeLeft)} s`,
    statusColor: q.timeLeft < 6 ? '#ff6a5a' : '#ffd27a',
    buttons: q.options.map((o, i) => ({ id: `opt${i}`, label: String(o), size: 72 })),
    buttonHeight: 140,
    footer,
  });
}

function askQuestion(q) {
  mode = 'quiz';
  player.uiLock = true;
  audio.play('tick', 0.8, 0.7);
  if (xr()) {
    quizShown = voice.supported ? 'Say the answer, or point and pinch' : 'Point and pinch your answer';
    renderQuizPanel(quizShown);
    placeInView(panel, 1.15, -0.02);
    voice.start(
      (heard) => {
        const i = matchAnswer(heard, q.options);
        if (i >= 0) answerQuiz(i);
      },
      (state) => {
        quizShown =
          state === 'listening'
            ? 'Listening… say the answer, or point and pinch'
            : state === 'denied'
              ? 'Microphone blocked: point and pinch your answer'
              : 'Voice not available: point and pinch your answer';
        renderQuizPanel(quizShown);
      },
    );
  } else {
    if (document.pointerLockElement) document.exitPointerLock();
    document.getElementById('quiz-text').textContent = q.text;
    const box = document.getElementById('quiz-options');
    box.innerHTML = '';
    q.options.forEach((o, i) => {
      const b = document.createElement('button');
      b.textContent = `${i + 1}.  ${o}`;
      b.addEventListener('click', () => answerQuiz(i));
      box.appendChild(b);
    });
    ui.screen('quiz');
  }
}

function answerQuiz(i) {
  if (mode !== 'quiz' || !quiz.current) return;
  const q = quiz.current;
  const ok = quiz.answer(i);
  voice.stop();
  lastWrong = !ok;
  const buttons = document.querySelectorAll('#quiz-options button');
  buttons.forEach((b, k) => b.classList.toggle('right', k === q.correct));
  if (i >= 0 && !ok) buttons[i]?.classList.add('wrong');
  if (ok) {
    hints.showArrows(ARROW_SECONDS);
    audio.play('correct', 0.8);
    ui.toast(`Correct! Arrows show the way for ${ARROW_SECONDS} s`, '#8ef08e', 3);
  } else {
    hints.hideArrows();
    audio.play('wrong', 0.8);
    ui.toast(`${i < 0 ? 'Too slow' : 'Wrong'}: it was ${q.answer}. No arrows this time`, '#ff6a5a', 3.2);
  }
  const timedOut = i < 0;
  setTimeout(
    () => {
      if (mode !== 'quiz') return;
      panel.hide();
      if (!xr() && timedOut) {
        mode = 'menu';
        ui.screen('pause');
        return;
      }
      mode = 'play';
      player.uiLock = false;
      ui.screen(null);
      lockPointer();
    },
    xr() ? 350 : 450,
  );
}

function cancelQuiz() {
  voice.stop();
  quiz.current = null;
  quiz.timer = 4;
  panel.hide();
}

// Outcomes -------------------------------------------------------------------
zombie.onCaught = (respawnCell) => {
  game.catches++;
  const left = game.loseLife();
  if (left > 0) {
    zombie.respawnPlayer(respawnCell);
    ui.toast(`${left} ${left === 1 ? 'heart' : 'hearts'} left`, '#ff4d5a', 3);
  } else {
    gameOver();
  }
};

function stats() {
  return [
    `Time ${formatTime(game.time)}`,
    `Hearts left ${game.lives} of ${LIVES}`,
    `Questions right ${quiz.right} of ${quiz.asked}`,
    `Danger zones escaped ${game.zonesCleared}`,
  ];
}

function gameOver() {
  mode = 'over';
  game.running = false;
  audio.scares = false;
  audio.setAlarm(false);
  audio.play('lose', 0.9);
  zombie.reset();
  hints.setDanger(null);
  player.uiLock = true;
  player.fadeTo(0.82, 2, 0x1a0000);
  ui.showVrHud(false);
  ui.showHud(false);
  if (xr()) {
    panel.show({
      badge: 'Game over',
      accent: '#ff4d4d',
      danger: true,
      title: 'It got you',
      lines: [stats().join('  ·  ')],
      buttons: [
        { id: 'again', label: 'Try again', color: '#ff8a7a' },
        { id: 'home', label: 'Home' },
      ],
    });
    placeInView(panel, 1.2, -0.05);
  } else {
    if (document.pointerLockElement) document.exitPointerLock();
    document.getElementById('over-stats').textContent = stats().join(' · ');
    ui.screen('over');
  }
}

game.onFinish = () => {
  mode = 'won';
  audio.scares = false;
  audio.setAlarm(false);
  zombie.reset();
  hints.setDanger(null);
  player.uiLock = true;
  ui.showVrHud(false);
  ui.showHud(false);
  const time = game.time;
  const prev = best();
  const record = !prev || time < prev;
  if (record) localStorage.setItem(BEST_KEY, String(time));
  const stars = '★'.repeat(game.lives) + '☆'.repeat(LIVES - game.lives);
  player.fadeTo(1, 2.5, 0xffffff);
  if (!xr() && document.pointerLockElement) document.exitPointerLock();

  setTimeout(() => {
    if (mode !== 'won') return;
    enterLobby();
    player.uiLock = false;
    player.pitch = 0.32;
    player.fadeTo(0, 1.2, 0xffffff);
    guide.show(true);
    guide.play('cheer');
    celebration.start(lobby.point(0, 0, -1.5));
    const lines = [stats().join('  ·  ')];
    if (record) lines.push('New best time!');
    if (xr()) {
      panel.show({
        badge: 'Victory',
        accent: '#7fe08a',
        title: `You escaped!  ${stars}`,
        lines,
        buttons: [
          { id: 'again', label: 'Play again', color: '#7fe08a' },
          { id: 'home', label: 'Home' },
        ],
      });
      placeInView(panel, 1.4, -0.3);
    } else {
      document.getElementById('end-stars').textContent = stars;
      document.getElementById('end-stats').textContent = `${stats().join(' · ')}${record ? ' · New best time!' : ''}`;
      ui.screen('end');
    }
  }, 900);
};

// Desktop wiring -------------------------------------------------------------
const $ = (id) => document.getElementById(id);
$('start-game').addEventListener('click', () => {
  audio.init();
  startGame();
});
$('show-howto').addEventListener('click', () => ui.screen('howto'));
$('howto-back').addEventListener('click', () => ui.screen('home'));
$('resume').addEventListener('click', closeMenu);
$('restart').addEventListener('click', startGame);
$('exit-home').addEventListener('click', goHome);
$('again').addEventListener('click', startGame);
$('end-home').addEventListener('click', goHome);
$('over-again').addEventListener('click', startGame);
$('over-home').addEventListener('click', goHome);
$('enable-voice').addEventListener('click', async () => {
  const status = $('voice-status');
  if (!voice.supported) {
    status.textContent = 'This browser has no speech recognition. In VR you can point and pinch instead.';
    return;
  }
  const ok = await requestMicrophone();
  status.textContent = ok ? 'Microphone ready: say answers out loud in VR.' : 'Microphone blocked. You can still point and pinch.';
});

canvas.addEventListener('click', () => {
  if (!xr() && mode === 'play' && document.pointerLockElement !== canvas) lockPointer();
});
document.addEventListener('pointerlockchange', () => {
  if (xr()) return;
  const locked = document.pointerLockElement === canvas;
  player.enabled = locked && mode === 'play';
  if (!locked && mode === 'play') openMenu();
});
document.addEventListener('pointerlockerror', () => {
  if (mode === 'play') ui.toast('Click the screen to keep going', '#e0b26a', 3);
});

// Headset --------------------------------------------------------------------
const enterVR = $('enter-vr');
const vrStatus = $('vr-status');
enterVR.addEventListener('click', async () => {
  if (xrSession) return;
  try {
    audio.init();
    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
    });
    xrSession = session;
    session.addEventListener('end', onSessionEnd);
    ui.screen(null);
    ui.showHud(false);
    await renderer.xr.setSession(session);
    player.enabled = true;
    audio.addExitAir(exitAir);
    // Hands or controllers are only known a moment after the session starts.
    setTimeout(() => {
      if (!xr()) return;
      if (tutorialDone) goHome();
      else startTutorial();
    }, 600);
    mode = 'home';
    enterLobby();
    guide.show(true);
  } catch (err) {
    vrStatus.textContent = `Could not start VR: ${err.message}`;
  }
});

function onSessionEnd() {
  xrSession = null;
  pointer.hideAll();
  panel.hide();
  tutorial.stop();
  ui.showVrHud(false);
  enterVR.textContent = 'Back into VR';
  if (mode === 'quiz') cancelQuiz();
  if (mode === 'play' || mode === 'quiz' || mode === 'menu') {
    mode = 'menu';
    player.uiLock = true;
    player.enabled = false;
    ui.showHud(true);
    ui.screen('pause');
  } else {
    goHome();
  }
}

if (!window.isSecureContext) {
  vrStatus.textContent = 'VR needs this page on HTTPS.';
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

// Debug entry points: ?shot (straight into the maze), ?at=key1|gate2|exit|junction|approach,
// ?tut=N (tutorial step N), ?won, ?over, ?quiz, ?danger=N, ?arrows
function debugStart() {
  if (params.has('tut')) {
    startTutorial();
    tutorial.go(Number(params.get('tut')) || 0);
    ui.screen(null);
    return;
  }
  if (!params.has('shot')) return;
  startGame();
  ui.screen(null);
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
      for (let k = 0; k <= n; k++) {
        if (k < n) {
          world.keys[k].state = 'used';
          world.keys[k].mesh.visible = false;
          world.unlockGate(world.gates[k]);
          game.stage++;
        } else {
          world.keys[k].state = 'collected';
          world.keys[k].mesh.visible = false;
        }
      }
      game.refreshRoute();
    } else if (at === 'exit') {
      from = layout.exit;
    } else if (at === 'junction' || at === 'approach') {
      const route = maze.path(layout.start, layout.keys[0]);
      const j = route.findIndex((c, i) => i > 0 && maze.degree(c) >= 3);
      if (j > 0) {
        from = at === 'junction' ? route[j] : route[j - 1];
        toward = at === 'junction' ? route[j + 1] : route[j];
      }
    }
    if (from >= 0) {
      const p = maze.center(from);
      const q = toward >= 0 ? maze.center(toward) : { x: p.x + CELL, z: p.z };
      player.spawn(p.x, p.z, Math.atan2(-(q.x - p.x), -(q.z - p.z)));
      if (at === 'exit') game.stage = 3;
    }
  }
  if (params.has('danger')) {
    const z = hazards.zones[Number(params.get('danger')) || 0];
    const index = (c) => layout.path.indexOf(c);
    for (const g of world.gates) {
      if (index(g.edge.b) > index(z.cells[0])) break;
      world.keys[g.number].state = 'used';
      world.keys[g.number].mesh.visible = false;
      world.unlockGate(g);
      g.box.enabled = false;
      g.panel.position.y = 2.78;
      game.stage++;
    }
    game.refreshRoute();
    const a = maze.center(z.respawn);
    const b = maze.center(z.cells[0]);
    player.spawn(a.x, a.z, Math.atan2(-(b.x - a.x), -(b.z - a.z)));
  }
  if (params.has('pitch')) player.pitch = Number(params.get('pitch'));
  if (params.has('turn')) player.yaw += (Number(params.get('turn')) * Math.PI) / 180;
  if (params.has('arrows')) hints.showArrows(999);
  if (params.has('quiz')) quiz.timer = 0.3;
  if (params.has('won')) {
    game.stage = 3;
    game.finished = true;
    game.onFinish();
  }
  if (params.has('over')) {
    game.lives = 0;
    gameOver();
  }
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

function updatePlay(dt, head, cell) {
  game.update(dt, head);
  if (mode !== 'play') return;
  game.refreshRoute();
  interactions.update(dt, head, elapsed);
  zombie.update(dt, head, cell);

  const ev = hazards.update(dt, cell, !zombie.active && zombie.state !== 'caught');
  if (ev === 'start') {
    hints.setDanger(hazards.active.set);
    world.setLampModes(lampModes);
    audio.setAlarm(true);
    audio.play('stinger', 0.5, 1.3);
    ui.toast('DANGER ZONE! Follow the arrows out', '#ff5a48', 3.5);
  } else if (ev === 'tick') {
    audio.play('tick', 0.9);
  } else if (ev === 'clear') {
    game.zonesCleared++;
    hints.setDanger(null);
    world.setLampModes(lampModes);
    audio.setAlarm(false);
    audio.play('correct', 0.7);
    ui.toast('You made it out!', '#8ef08e', 2.5);
  } else if (ev === 'fail') {
    game.zonesFailed++;
    const z = hazards.failed();
    hints.setDanger(null);
    world.setLampModes(lampModes);
    audio.setAlarm(false);
    zombie.ambush(z ? z.respawn : -1);
  }

  const canAsk = !zombie.active && !hazards.active && !interactions.inserting && game.stage < 3 && zombie.state !== 'caught';
  const q = quiz.update(dt, canAsk);
  if (q) askQuestion(q);
}

function updateQuiz(dt) {
  const q = quiz.current;
  if (!q) return;
  const before = Math.ceil(q.timeLeft);
  q.timeLeft -= dt;
  const bar = document.getElementById('quiz-timer');
  bar.style.width = `${Math.max(0, (q.timeLeft / 20) * 100)}%`;
  if (Math.ceil(q.timeLeft) !== before) {
    if (q.timeLeft < 5) audio.play('tick', 0.5);
    if (xr()) renderQuizPanel(quizShown);
  }
  if (q.timeLeft <= 0) answerQuiz(-1);
}

function hudState() {
  let status;
  let statusColor;
  if (hints.arrowsOn) {
    status = `Arrows showing: ${Math.ceil(hints.arrowTime)} s`;
    statusColor = '#8ef08e';
  } else if (quiz.current) {
    status = 'Question!';
  } else {
    status = `${lastWrong ? 'No arrows. ' : ''}Next question in ${Math.ceil(quiz.nextIn)} s`;
    statusColor = lastWrong ? '#ff8a7a' : undefined;
  }
  return {
    xr: xr(),
    time: game.time,
    lives: game.lives,
    keys: game.keySlots(),
    objective: game.objective(),
    status,
    statusColor,
    danger: hazards.active ? hazards.active.time : null,
    prompt: interactions.prompt,
  };
}

renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  elapsed += dt;

  player.update(dt);
  const head = player.head();
  const cell = maze.cellAt(head.x, head.z);

  for (const d of deferred) if (--d.frames <= 0) d.fn();
  for (let i = deferred.length - 1; i >= 0; i--) if (deferred[i].frames <= 0) deferred.splice(i, 1);

  if (xr()) {
    const press = pointer.update([panel, tutorialPanel]);
    if (press) onPanelPress(press);
  }

  if (mode === 'play') updatePlay(dt, head, cell);
  else if (mode === 'quiz') updateQuiz(dt);
  else if (mode === 'tutorial') {
    tutorial.update(dt);
    updateStage(dt, head);
  }

  hints.update(mode === 'play' ? dt : 0);
  world.update(dt, elapsed, head, onLockLanded);
  lobby.update(dt, elapsed);
  guide.update(dt);
  celebration.update(dt);
  audio.update(dt, head, player.headYaw());
  ui.update(dt, hudState());

  renderer.render(scene, camera);
});

goHome();
debugStart();

window.__maze = { layout, world, player, game, hints, interactions, zombie, audio, hazards, quiz, tutorial, guide, panel, lobby, ui, get mode() { return mode; } };
