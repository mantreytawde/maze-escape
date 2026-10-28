import * as THREE from 'three';
import { formatTime } from './game.js';
import { roundRect, drawHeart, drawKeyIcon } from './vrui.js';

const FONT = '"Segoe UI", Roboto, Arial, sans-serif';
const SCREENS = ['home', 'howto', 'pause', 'quiz', 'end', 'over'];

function cameraPanel(width, height, pxW, pxH) {
  const canvas = document.createElement('canvas');
  canvas.width = pxW;
  canvas.height = pxH;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }),
  );
  mesh.renderOrder = 9400;
  mesh.frustumCulled = false;
  mesh.visible = false;
  return { canvas, ctx: canvas.getContext('2d'), tex, mesh, sig: '' };
}

export class UI {
  constructor({ camera }) {
    const $ = (id) => document.getElementById(id);
    this.el = {
      hud: $('hud'),
      hearts: $('hud-hearts'),
      keys: $('hud-keys'),
      time: $('hud-time'),
      objective: $('hud-objective'),
      status: $('hud-status'),
      danger: $('danger'),
      dangerTime: $('danger-time'),
      toast: $('toast'),
      prompt: $('prompt'),
      scare: $('scare'),
    };
    this.screens = Object.fromEntries(SCREENS.map((s) => [s, $(s)]));

    // Head-up display in the headset: low in view, tilted toward the eyes, drawn over everything.
    this.vrHud = cameraPanel(0.48, 0.157, 1024, 334);
    this.vrHud.mesh.position.set(0, -0.27, -0.88);
    this.vrHud.mesh.rotation.x = 0.3;
    camera.add(this.vrHud.mesh);

    this.vrToast = cameraPanel(0.52, 0.085, 1024, 168);
    this.vrToast.mesh.position.set(0, 0.13, -0.95);
    camera.add(this.vrToast.mesh);
    this.toastTime = 0;
    this.toastText = '';
  }

  screen(name) {
    for (const [k, el] of Object.entries(this.screens)) el.hidden = k !== name;
  }

  showHud(show) {
    this.el.hud.hidden = !show;
  }

  showVrHud(show) {
    this.vrHud.mesh.visible = show;
  }

  toast(text, color = '#f4efe6', seconds = 2.6) {
    this.toastText = text;
    this.toastColor = color;
    this.toastTime = seconds;
    this.el.toast.textContent = text;
    this.el.toast.style.color = color;
    this.el.toast.hidden = false;
    this.el.toast.classList.remove('pop');
    void this.el.toast.offsetWidth;
    this.el.toast.classList.add('pop');
    this.drawToast();
  }

  drawToast() {
    const { ctx, tex } = this.vrToast;
    ctx.clearRect(0, 0, 1024, 168);
    ctx.fillStyle = 'rgba(10,11,14,0.86)';
    roundRect(ctx, 6, 6, 1012, 156, 40);
    ctx.fill();
    ctx.fillStyle = this.toastColor;
    ctx.font = `bold 58px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.toastText, 512, 86, 960);
    tex.needsUpdate = true;
  }

  renderHearts(lives, total = 3) {
    const sig = `${lives}`;
    if (this.el.hearts.dataset.sig === sig) return;
    this.el.hearts.dataset.sig = sig;
    this.el.hearts.innerHTML = Array.from({ length: total }, (_, i) => `<span class="heart ${i < lives ? 'full' : 'empty'}">♥</span>`).join('');
  }

  renderKeys(slots) {
    const sig = slots.join();
    if (this.el.keys.dataset.sig === sig) return;
    this.el.keys.dataset.sig = sig;
    this.el.keys.innerHTML = slots.map((s, i) => `<span class="key ${s}" title="Key ${i + 1}">🗝</span>`).join('');
  }

  drawVrHud(s) {
    const t = formatTime(s.time);
    const sig = `${t}|${s.lives}|${s.keys.join()}|${s.objective}|${s.status}|${s.danger}|${s.prompt}`;
    const p = this.vrHud;
    if (sig === p.sig) return;
    p.sig = sig;
    const { ctx, tex } = p;
    const W = 1024;
    const H = 334;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = s.danger != null ? 'rgba(48,6,6,0.88)' : 'rgba(10,11,14,0.82)';
    roundRect(ctx, 6, 6, W - 12, H - 12, 44);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = s.danger != null ? '#ff4030' : 'rgba(224,178,106,0.6)';
    ctx.stroke();

    for (let i = 0; i < 3; i++) drawHeart(ctx, 70 + i * 82, 74, 64, i < s.lives);
    s.keys.forEach((k, i) => drawKeyIcon(ctx, 370 + i * 92, 74, 76, k));
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.font = `bold 66px ${FONT}`;
    ctx.fillStyle = '#f4efe6';
    ctx.fillText(t, W - 48, 76);

    ctx.textAlign = 'left';
    ctx.font = `600 46px ${FONT}`;
    ctx.fillStyle = '#e0b26a';
    ctx.fillText(s.prompt || s.objective, 48, 172, W - 96);
    if (s.danger != null) {
      ctx.font = `bold 52px ${FONT}`;
      ctx.fillStyle = '#ff5a48';
      ctx.fillText(`DANGER! Get out: ${Math.ceil(s.danger)} s`, 48, 262, W - 96);
    } else {
      ctx.font = `42px ${FONT}`;
      ctx.fillStyle = s.statusColor ?? '#b9b3a8';
      ctx.fillText(s.status, 48, 262, W - 96);
    }
    tex.needsUpdate = true;
  }

  update(dt, s) {
    this.toastTime = Math.max(0, this.toastTime - dt);
    this.vrToast.mesh.visible = s.xr && this.toastTime > 0;
    if (this.toastTime <= 0) this.el.toast.hidden = true;

    if (s.xr) {
      if (this.vrHud.mesh.visible) this.drawVrHud(s);
      return;
    }
    if (this.el.hud.hidden) return;
    this.el.time.textContent = formatTime(s.time);
    this.renderHearts(s.lives);
    this.renderKeys(s.keys);
    this.el.objective.textContent = s.objective;
    this.el.status.textContent = s.status;
    this.el.status.style.color = s.statusColor ?? '';
    this.el.danger.hidden = s.danger == null;
    if (s.danger != null) this.el.dangerTime.textContent = Math.ceil(s.danger);
    this.el.prompt.textContent = s.prompt;
    this.el.prompt.hidden = !s.prompt;
  }

  scareFlash() {
    const el = this.el.scare;
    el.hidden = false;
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    clearTimeout(this.scareTimer);
    this.scareTimer = setTimeout(() => (el.hidden = true), 1600);
  }
}
