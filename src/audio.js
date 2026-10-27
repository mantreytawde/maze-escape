import * as THREE from 'three';

function buffer(ctx, seconds, channels, fill) {
  const len = Math.floor(seconds * ctx.sampleRate);
  const buf = ctx.createBuffer(channels, len, ctx.sampleRate);
  for (let ch = 0; ch < channels; ch++) fill(buf.getChannelData(ch), ctx.sampleRate, ch);
  return buf;
}

function lowpass(data, cutoff, sr) {
  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / sr);
  let y = 0;
  for (let i = 0; i < data.length; i++) {
    y += a * (data[i] - y);
    data[i] = y;
  }
}

function highpass(data, cutoff, sr) {
  const copy = Float32Array.from(data);
  lowpass(copy, cutoff, sr);
  for (let i = 0; i < data.length; i++) data[i] -= copy[i];
}

function normalize(data, peak) {
  let m = 0;
  for (const v of data) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < data.length; i++) data[i] *= peak / m;
}

function impulse(ctx, seconds) {
  return buffer(ctx, seconds, 2, (d, sr) => {
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const early = t < 0.08 && Math.random() < 0.004 ? (Math.random() - 0.5) * 3 : 0;
      d[i] = ((Math.random() * 2 - 1) * Math.pow(1 - t / seconds, 2.4) + early) * Math.exp(-t * 2.2);
    }
    lowpass(d, 5200, sr);
  });
}

function footstep(ctx, seed) {
  return buffer(ctx, 0.28, 1, (d, sr) => {
    let s = seed * 9301 + 49297;
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280) * 2 - 1;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const heel = Math.exp(-t * 55) * r();
      const scuff = t > 0.05 ? Math.exp(-(t - 0.05) * 30) * r() * 0.35 : 0;
      const grit = Math.random() < 0.01 ? r() * Math.exp(-t * 18) * 0.8 : 0;
      const thump = Math.sin(2 * Math.PI * 85 * t) * Math.exp(-t * 40) * 0.6;
      d[i] = heel + scuff + grit + thump;
    }
    lowpass(d, 3200 + seed * 300, sr);
    normalize(d, 0.9);
  });
}

function jingle(ctx) {
  return buffer(ctx, 0.9, 1, (d, sr) => {
    const hits = [0, 0.06, 0.14, 0.23, 0.31];
    for (const h of hits) {
      const partials = [2900, 4300, 6100, 7900].map((f) => f * (0.9 + Math.random() * 0.25));
      for (let i = Math.floor(h * sr); i < d.length; i++) {
        const t = i / sr - h;
        let v = 0;
        partials.forEach((f, k) => (v += Math.sin(2 * Math.PI * f * t) * Math.exp(-t * (14 + k * 6)) / (k + 1)));
        d[i] += v * (1 - h);
      }
    }
    normalize(d, 0.7);
  });
}

function unlock(ctx) {
  return buffer(ctx, 0.7, 1, (d, sr) => {
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const click = t < 0.012 ? (Math.random() * 2 - 1) * (1 - t / 0.012) : 0;
      const t2 = t - 0.09;
      const clunk =
        t2 > 0
          ? Math.sin(2 * Math.PI * (150 - 60 * Math.min(1, t2 * 8)) * t2) * Math.exp(-t2 * 18) +
            (Math.random() * 2 - 1) * Math.exp(-t2 * 60) * 0.5
          : 0;
      const t3 = t - 0.16;
      const rattle = t3 > 0 ? Math.sin(2 * Math.PI * 3400 * t3) * Math.exp(-t3 * 25) * 0.25 : 0;
      d[i] = click * 0.8 + clunk + rattle;
    }
    normalize(d, 0.9);
  });
}

function grind(ctx) {
  return buffer(ctx, 4.2, 1, (d, sr) => {
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    lowpass(d, 700, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const env = Math.min(1, Math.max(0, (t - 0.55) * 4)) * Math.min(1, Math.max(0, (3.9 - t) * 3));
      const chatter = 0.6 + 0.4 * Math.sin(2 * Math.PI * 17 * t + Math.sin(t * 5) * 2);
      const squeal = Math.sin(2 * Math.PI * (980 + 40 * Math.sin(t * 3)) * t) * 0.05;
      const tc = t - 3.82;
      const clank =
        tc > 0
          ? (Math.sin(2 * Math.PI * 110 * tc) + (Math.random() * 2 - 1) * 0.6) * Math.exp(-tc * 14) * 1.8
          : 0;
      d[i] = (d[i] * 3 * chatter + squeal) * env + clank;
    }
    normalize(d, 0.85);
  });
}

function clank(ctx) {
  return buffer(ctx, 0.4, 1, (d, sr) => {
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] =
        (Math.sin(2 * Math.PI * 1800 * t) * 0.5 + Math.sin(2 * Math.PI * 2650 * t) * 0.3) * Math.exp(-t * 30) +
        (Math.random() * 2 - 1) * Math.exp(-t * 90) * 0.6;
    }
    normalize(d, 0.7);
  });
}

function drip(ctx) {
  return buffer(ctx, 0.25, 1, (d, sr) => {
    const f0 = 700 + Math.random() * 500;
    let phase = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const f = f0 + 900 * Math.min(1, t / 0.02);
      phase += (2 * Math.PI * f) / sr;
      d[i] = Math.sin(phase) * Math.exp(-t * 38);
    }
    normalize(d, 0.6);
  });
}

function paint(ctx) {
  return buffer(ctx, 0.9, 1, (d, sr) => {
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const env = Math.min(1, t * 20) * Math.min(1, (0.9 - t) * 6);
      d[i] = (Math.random() * 2 - 1) * env;
    }
    highpass(d, 2500, sr);
    normalize(d, 0.35);
  });
}

function loopable(ctx, seconds, gen) {
  const fade = 0.5;
  return buffer(ctx, seconds, 2, (d, sr, ch) => {
    const extra = Math.floor(fade * sr);
    const raw = new Float32Array(d.length + extra);
    gen(raw, sr, ch);
    for (let i = 0; i < d.length; i++) {
      if (i < extra) {
        const w = i / extra;
        d[i] = raw[i] * w + raw[d.length + i] * (1 - w);
      } else {
        d[i] = raw[i];
      }
    }
  });
}

function ambience(ctx) {
  return loopable(ctx, 8, (d, sr) => {
    let brown = 0;
    for (let i = 0; i < d.length; i++) {
      brown = (brown + (Math.random() * 2 - 1) * 0.02) * 0.998;
      const t = i / sr;
      const hum =
        Math.sin(2 * Math.PI * 50 * t) * 0.05 +
        Math.sin(2 * Math.PI * 100 * t) * 0.025 +
        Math.sin(2 * Math.PI * 150 * t) * 0.01;
      d[i] = brown * 3 + hum;
    }
    lowpass(d, 900, sr);
    normalize(d, 0.5);
  });
}

function air(ctx) {
  return loopable(ctx, 6, (d, sr) => {
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    lowpass(d, 1800, sr);
    highpass(d, 200, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] *= 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.35 * t) * Math.sin(2 * Math.PI * 0.13 * t + 1);
    }
    normalize(d, 0.6);
  });
}

export class AudioSystem {
  constructor(camera, scene) {
    this.camera = camera;
    this.scene = scene;
    this.ready = false;
    this.dripTimer = 4;
  }

  init() {
    if (this.ready) {
      this.listener.context.resume();
      return;
    }
    const listener = new THREE.AudioListener();
    this.camera.add(listener);
    this.listener = listener;
    const ctx = listener.context;

    const bus = ctx.createGain();
    const convolver = ctx.createConvolver();
    convolver.buffer = impulse(ctx, 2.4);
    const wet = ctx.createGain();
    wet.gain.value = 0.32;
    bus.connect(convolver);
    convolver.connect(wet);
    wet.connect(ctx.destination);
    listener.setFilter(bus);

    this.buffers = {
      steps: [0, 1, 2, 3].map((i) => footstep(ctx, i + 1)),
      jingle: jingle(ctx),
      unlock: unlock(ctx),
      grind: grind(ctx),
      clank: clank(ctx),
      drips: [0, 1, 2].map(() => drip(ctx)),
      paint: paint(ctx),
    };

    this.ambient = new THREE.Audio(listener);
    this.ambient.setBuffer(ambience(ctx));
    this.ambient.setLoop(true);
    this.ambient.setVolume(0.22);
    this.ambient.play();

    this.emitters = Array.from({ length: 10 }, () => {
      const holder = new THREE.Object3D();
      const sound = new THREE.PositionalAudio(listener);
      sound.setRefDistance(1.4);
      sound.setRolloffFactor(1.3);
      holder.add(sound);
      this.scene.add(holder);
      return { holder, sound };
    });
    this.next = 0;
    this.flat = Array.from({ length: 4 }, () => new THREE.Audio(listener));
    this.nextFlat = 0;
    this.stepIndex = 0;
    this.ready = true;
  }

  addExitAir(position) {
    if (!this.ready || this.exitAir) return;
    const holder = new THREE.Object3D();
    holder.position.copy(position);
    const sound = new THREE.PositionalAudio(this.listener);
    sound.setBuffer(air(this.listener.context));
    sound.setLoop(true);
    sound.setRefDistance(1.5);
    sound.setRolloffFactor(1.6);
    sound.setVolume(0.9);
    holder.add(sound);
    this.scene.add(holder);
    sound.play();
    this.exitAir = sound;
  }

  at(name, position, volume = 1, rate = 1) {
    if (!this.ready) return;
    const buf = Array.isArray(this.buffers[name])
      ? this.buffers[name][Math.floor(Math.random() * this.buffers[name].length)]
      : this.buffers[name];
    const e = this.emitters[this.next];
    this.next = (this.next + 1) % this.emitters.length;
    if (e.sound.isPlaying) e.sound.stop();
    e.holder.position.copy(position);
    e.holder.updateMatrixWorld();
    e.sound.setBuffer(buf);
    e.sound.setVolume(volume);
    e.sound.setPlaybackRate(rate);
    e.sound.play();
  }

  play(name, volume = 1, rate = 1) {
    if (!this.ready) return;
    const list = this.buffers[name];
    const buf = Array.isArray(list) ? list[this.stepIndex++ % list.length] : list;
    const s = this.flat[this.nextFlat];
    this.nextFlat = (this.nextFlat + 1) % this.flat.length;
    if (s.isPlaying) s.stop();
    s.setBuffer(buf);
    s.setVolume(volume);
    s.setPlaybackRate(rate);
    s.play();
  }

  step() {
    this.play('steps', 0.32 + Math.random() * 0.08, 0.92 + Math.random() * 0.16);
  }

  update(dt, head) {
    if (!this.ready) return;
    this.dripTimer -= dt;
    if (this.dripTimer <= 0) {
      this.dripTimer = 3 + Math.random() * 7;
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * 6;
      const p = new THREE.Vector3(head.x + Math.cos(a) * r, 2.6, head.z + Math.sin(a) * r);
      this.at('drips', p, 0.35 + Math.random() * 0.3, 0.9 + Math.random() * 0.3);
    }
  }
}
