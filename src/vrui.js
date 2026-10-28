import * as THREE from 'three';

const FONT = '"Segoe UI", Roboto, Arial, sans-serif';

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function wrapText(ctx, text, maxWidth) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    out.push(line);
  }
  return out;
}

export function drawHeart(ctx, x, y, size, filled) {
  const s = size / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, s * 0.9);
  ctx.bezierCurveTo(-s * 1.6, -s * 0.2, -s * 0.8, -s * 1.3, 0, -s * 0.45);
  ctx.bezierCurveTo(s * 0.8, -s * 1.3, s * 1.6, -s * 0.2, 0, s * 0.9);
  ctx.closePath();
  if (filled) {
    ctx.fillStyle = '#ff2d3d';
    ctx.shadowColor = 'rgba(255,40,60,0.8)';
    ctx.shadowBlur = size * 0.3;
    ctx.fill();
  } else {
    ctx.lineWidth = Math.max(2, size * 0.09);
    ctx.strokeStyle = 'rgba(255,90,100,0.55)';
    ctx.stroke();
  }
  ctx.restore();
}

export function drawKeyIcon(ctx, x, y, size, state) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = state === 'missing' ? 0.3 : state === 'used' ? 0.55 : 1;
  ctx.fillStyle = state === 'held' ? '#f2c14e' : state === 'used' ? '#7fd08a' : '#8a8a8a';
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = size * 0.12;
  ctx.beginPath();
  ctx.arc(-size * 0.22, 0, size * 0.2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillRect(-size * 0.04, -size * 0.06, size * 0.5, size * 0.12);
  ctx.fillRect(size * 0.3, 0, size * 0.08, size * 0.2);
  ctx.fillRect(size * 0.16, 0, size * 0.07, size * 0.15);
  ctx.restore();
}

// A floating canvas panel: title, a few lines of text, and buttons.
export class Panel {
  constructor({ width = 0.9, height = 0.56, px = 1024, name = 'panel' } = {}) {
    this.width = width;
    this.height = height;
    this.px = px;
    this.py = Math.round((px * height) / width);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.px;
    this.canvas.height = this.py;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({
        map: this.tex,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      }),
    );
    this.mesh.name = name;
    this.mesh.renderOrder = 9500;
    this.mesh.visible = false;
    this.mesh.userData.panel = this;
    this.content = { title: '', lines: [], buttons: [] };
    this.rects = [];
    this.hover = null;
  }

  get visible() {
    return this.mesh.visible;
  }

  show(content) {
    this.content = { layout: 'row', ...content };
    this.hover = null;
    this.draw();
    this.mesh.visible = true;
  }

  hide() {
    this.mesh.visible = false;
  }

  setHover(id) {
    if (id === this.hover) return;
    this.hover = id;
    this.draw();
  }

  draw() {
    const { ctx, px, py } = this;
    const c = this.content;
    const pad = 48;
    ctx.clearRect(0, 0, px, py);
    ctx.fillStyle = c.danger ? 'rgba(40,6,6,0.94)' : 'rgba(12,14,18,0.93)';
    roundRect(ctx, 6, 6, px - 12, py - 12, 40);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = c.accent ?? 'rgba(224,178,106,0.85)';
    ctx.stroke();

    let y = pad;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    if (c.badge) {
      ctx.font = `600 30px ${FONT}`;
      ctx.fillStyle = c.accent ?? '#e0b26a';
      ctx.fillText(c.badge.toUpperCase(), px / 2, y);
      y += 44;
    }
    if (c.title) {
      ctx.font = `bold ${c.titleSize ?? 64}px ${FONT}`;
      ctx.fillStyle = '#f4efe6';
      for (const line of wrapText(ctx, c.title, px - pad * 2)) {
        ctx.fillText(line, px / 2, y);
        y += (c.titleSize ?? 64) * 1.15;
      }
      y += 10;
    }
    ctx.font = `${c.textSize ?? 36}px ${FONT}`;
    ctx.fillStyle = '#cfc9bf';
    for (const para of c.lines ?? []) {
      for (const line of wrapText(ctx, para, px - pad * 2)) {
        ctx.fillText(line, px / 2, y);
        y += (c.textSize ?? 36) * 1.3;
      }
      y += 8;
    }
    if (c.status) {
      ctx.font = `600 38px ${FONT}`;
      ctx.fillStyle = c.statusColor ?? '#9fe39f';
      ctx.fillText(c.status, px / 2, y + 4);
    }

    this.rects = [];
    const buttons = c.buttons ?? [];
    if (buttons.length) {
      const column = c.layout === 'column';
      const bh = c.buttonHeight ?? (column ? 92 : 112);
      const gap = 22;
      const footer = c.footer ? 56 : 0;
      if (column) {
        const bw = px - pad * 2 - 120;
        let by = py - pad - footer - buttons.length * bh - (buttons.length - 1) * gap;
        for (const b of buttons) {
          this.rects.push({ id: b.id, x: (px - bw) / 2, y: by, w: bw, h: bh, b });
          by += bh + gap;
        }
      } else {
        const bw = (px - pad * 2 - gap * (buttons.length - 1)) / buttons.length;
        const by = py - pad - footer - bh;
        buttons.forEach((b, i) => this.rects.push({ id: b.id, x: pad + i * (bw + gap), y: by, w: bw, h: bh, b }));
      }
      for (const r of this.rects) {
        const hot = r.id === this.hover;
        ctx.fillStyle = hot ? (r.b.color ?? '#e0b26a') : 'rgba(255,255,255,0.08)';
        roundRect(ctx, r.x, r.y, r.w, r.h, 24);
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = r.b.color ?? 'rgba(224,178,106,0.9)';
        ctx.stroke();
        ctx.fillStyle = hot ? '#14110c' : '#f4efe6';
        ctx.font = `600 ${r.b.size ?? 42}px ${FONT}`;
        ctx.textBaseline = 'middle';
        ctx.fillText(r.b.label, r.x + r.w / 2, r.y + r.h / 2 + 2);
        ctx.textBaseline = 'top';
      }
    }
    if (c.footer) {
      ctx.font = `28px ${FONT}`;
      ctx.fillStyle = '#8f8a80';
      ctx.fillText(c.footer, px / 2, py - pad - 30);
    }
    this.tex.needsUpdate = true;
  }

  hitUV(uv) {
    const x = uv.x * this.px;
    const y = (1 - uv.y) * this.py;
    const r = this.rects.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    return r ? r.id : null;
  }

  // Panel-local point (metres, plane centred) to button id.
  hitLocal(p) {
    return this.hitUV({ x: p.x / this.width + 0.5, y: p.y / this.height + 0.5 });
  }

  placeInFront(head, yaw, dist = 1.25, dy = -0.08) {
    this.mesh.position.set(head.x - Math.sin(yaw) * dist, head.y + dy, head.z - Math.cos(yaw) * dist);
    this.mesh.rotation.set(0, yaw, 0);
    this.anchorYaw = yaw;
    this.dist = dist;
    this.dy = dy;
  }

  // Re-centre when the player has turned well away from it.
  follow(head, yaw, dt) {
    let diff = yaw - this.anchorYaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    if (Math.abs(diff) > 0.9) this.placeInFront(head, yaw, this.dist, this.dy);
    else {
      const want = new THREE.Vector3(
        head.x - Math.sin(this.anchorYaw) * this.dist,
        head.y + this.dy,
        head.z - Math.cos(this.anchorYaw) * this.dist,
      );
      this.mesh.position.lerp(want, Math.min(1, dt * 2));
    }
  }
}

// Aim-and-pinch / trigger / fingertip-poke input for panels in the headset.
export class PanelPointer {
  constructor(scene, player, audio) {
    this.player = player;
    this.audio = audio;
    this.ray = new THREE.Raycaster();
    this.rays = player.controllers.map(() => {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
        new THREE.LineBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.7, depthTest: false, fog: false }),
      );
      line.renderOrder = 9600;
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);
      const dot = new THREE.Mesh(
        new THREE.CircleGeometry(0.008, 16),
        new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, fog: false, transparent: true }),
      );
      dot.renderOrder = 9601;
      dot.visible = false;
      scene.add(dot);
      return { line, dot, pokeLatched: false };
    });
  }

  hideAll() {
    for (const r of this.rays) {
      r.line.visible = false;
      r.dot.visible = false;
    }
    for (const c of this.player.controllers) c.overPanel = false;
  }

  // Returns the pressed { panel, id } this frame, or null.
  update(panels) {
    const live = panels.filter((p) => p.visible);
    if (!live.length || !this.player.renderer.xr.isPresenting) {
      this.hideAll();
      for (const p of panels) p.setHover?.(null);
      return null;
    }
    const meshes = live.map((p) => p.mesh);
    const hovered = new Map();
    let pressed = null;
    const origin = new THREE.Vector3();
    const quat = new THREE.Quaternion();

    this.player.controllers.forEach((c, i) => {
      const vis = this.rays[i];
      vis.line.visible = false;
      vis.dot.visible = false;
      c.overPanel = false;
      if (!c.source) return;

      if (c.source.hand && c.gesture?.tracked) {
        for (const p of live) {
          const local = p.mesh.worldToLocal(c.gesture.tip.clone());
          const inside = Math.abs(local.x) < p.width / 2 && Math.abs(local.y) < p.height / 2;
          if (inside && local.z < 0.012 && local.z > -0.08) {
            const id = p.hitLocal(local);
            if (id && !vis.pokeLatched) {
              vis.pokeLatched = true;
              pressed = { panel: p, id };
            }
          } else if (!inside || local.z > 0.035) {
            vis.pokeLatched = false;
          }
        }
      }

      c.ctrl.getWorldPosition(origin);
      c.ctrl.getWorldQuaternion(quat);
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
      this.ray.set(origin, dir);
      const hit = this.ray.intersectObjects(meshes, false)[0];
      const len = hit ? hit.distance : 0.6;
      vis.line.position.copy(origin);
      vis.line.quaternion.copy(quat);
      vis.line.scale.set(1, 1, len);
      vis.line.visible = true;
      if (!hit) return;
      c.overPanel = true;
      vis.dot.position.copy(hit.point).addScaledVector(dir, -0.003);
      vis.dot.quaternion.copy(hit.object.quaternion);
      vis.dot.visible = true;
      const panel = hit.object.userData.panel;
      const id = panel.hitUV(hit.uv);
      if (id) hovered.set(panel, id);
      if (id && c.select) pressed = { panel, id };
    });

    for (const p of live) p.setHover(hovered.get(p) ?? null);
    if (pressed) this.audio.play('click', 0.6);
    return pressed;
  }
}
