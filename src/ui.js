import * as THREE from 'three';
import { formatTime } from './game.js';

function panel(width, height, pxW, pxH, overlay) {
  const canvas = document.createElement('canvas');
  canvas.width = pxW;
  canvas.height = pxH;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    toneMapped: false,
    fog: false,
    depthTest: !overlay,
    depthWrite: !overlay,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  if (overlay) mesh.renderOrder = 9100;
  return { canvas, ctx: canvas.getContext('2d'), tex, mesh };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class UI {
  constructor({ scene, player }) {
    this.scene = scene;
    this.player = player;
    this.el = {
      intro: document.getElementById('intro'),
      hud: document.getElementById('hud'),
      time: document.getElementById('hud-time'),
      objective: document.getElementById('hud-objective'),
      hint: document.getElementById('hud-hint'),
      prompt: document.getElementById('prompt'),
      pause: document.getElementById('pause'),
      end: document.getElementById('end'),
      endStats: document.getElementById('end-stats'),
    };

    this.wrist = panel(0.12, 0.06, 512, 256, false);
    this.wrist.mesh.position.set(0, 0.035, 0.11);
    this.wrist.mesh.rotation.x = -0.95;
    this.wristText = '';

    this.endPanel = panel(1.0, 0.5, 1024, 512, true);
    this.endPanel.mesh.visible = false;
    scene.add(this.endPanel.mesh);
  }

  showIntro(show) {
    this.el.intro.hidden = !show;
  }

  showHud(show) {
    this.el.hud.hidden = !show;
  }

  showPause(show) {
    this.el.pause.hidden = !show;
  }

  attachWrist() {
    const hand = this.player.hand('left') ?? this.player.controllers.find((c) => c.source);
    const grip = hand?.grip;
    if (grip && this.wrist.mesh.parent !== grip) grip.add(this.wrist.mesh);
  }

  drawWrist(time, objective, hintText) {
    const key = `${time}|${objective}|${hintText}`;
    if (key === this.wristText) return;
    this.wristText = key;
    const { ctx, tex } = this.wrist;
    ctx.clearRect(0, 0, 512, 256);
    ctx.fillStyle = 'rgba(14,16,18,0.88)';
    roundRect(ctx, 6, 6, 500, 244, 34);
    ctx.fill();
    ctx.strokeStyle = 'rgba(214,148,48,0.7)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = '#f1ece2';
    ctx.font = 'bold 92px "Segoe UI", Roboto, Arial, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(time, 34, 24);
    ctx.font = '600 36px "Segoe UI", Roboto, Arial, sans-serif';
    ctx.fillStyle = '#e0b26a';
    ctx.fillText(objective, 34, 132);
    ctx.font = '30px "Segoe UI", Roboto, Arial, sans-serif';
    ctx.fillStyle = '#a7a39b';
    ctx.fillText(hintText, 34, 186);
    tex.needsUpdate = true;
  }

  update({ time, objective, hintReady, hintCooldown, prompt, xr }) {
    const t = formatTime(time);
    const hintText = hintReady ? 'Trail ready' : `Trail in ${Math.ceil(hintCooldown)} s`;
    if (xr) {
      this.attachWrist();
      this.drawWrist(t, objective, `${hintText}  ·  A / X`);
    } else {
      this.el.time.textContent = t;
      this.el.objective.textContent = objective;
      this.el.hint.textContent = `${hintText} (H)`;
      this.el.hint.classList.toggle('ready', hintReady);
      this.el.prompt.textContent = prompt;
      this.el.prompt.hidden = !prompt;
    }
  }

  showEnd({ time, trails, xr, head, yaw }) {
    const trailsText = trails === 0 ? 'No trails asked for.' : trails === 1 ? '1 trail asked for.' : `${trails} trails asked for.`;
    this.el.endStats.textContent = `Time ${formatTime(time)}. ${trailsText}`;
    if (!xr) {
      this.el.end.hidden = false;
      return;
    }
    const { ctx, tex, mesh } = this.endPanel;
    ctx.clearRect(0, 0, 1024, 512);
    ctx.fillStyle = 'rgba(16,15,13,0.9)';
    roundRect(ctx, 8, 8, 1008, 496, 48);
    ctx.fill();
    ctx.fillStyle = '#f4efe5';
    ctx.textAlign = 'center';
    ctx.font = 'bold 110px Georgia, "Times New Roman", serif';
    ctx.fillText("You're out", 512, 170);
    ctx.font = '48px "Segoe UI", Roboto, Arial, sans-serif';
    ctx.fillStyle = '#e0b26a';
    ctx.fillText(`Time ${formatTime(time)}`, 512, 270);
    ctx.fillStyle = '#b9b3a8';
    ctx.font = '38px "Segoe UI", Roboto, Arial, sans-serif';
    ctx.fillText(trailsText, 512, 335);
    ctx.fillText('Press A or X to walk it again', 512, 430);
    tex.needsUpdate = true;
    mesh.position.set(head.x - Math.sin(yaw) * 1.4, head.y, head.z - Math.cos(yaw) * 1.4);
    mesh.rotation.set(0, yaw, 0);
    mesh.visible = true;
  }

  hideEnd() {
    this.el.end.hidden = true;
    this.endPanel.mesh.visible = false;
  }
}
