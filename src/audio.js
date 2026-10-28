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

function bandpass(input, f0, q, sr) {
  const w0 = (2 * Math.PI * f0) / sr;
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = alpha / a0;
  const b2 = -alpha / a0;
  const a1 = (-2 * Math.cos(w0)) / a0;
  const a2 = (1 - alpha) / a0;
  const out = new Float32Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
  }
  return out;
}

// A distorted, formant-shaped shriek. `lift` raises the pitch for the jumpscare.
function scream(ctx, seconds, lift) {
  return buffer(ctx, seconds, 1, (d, sr) => {
    const detune = [1, 1.013, 0.988, 2.004, 1.497];
    const phase = new Float32Array(detune.length);
    const src = new Float32Array(d.length);
    let jitter = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      jitter += (Math.random() - 0.5) * 6;
      jitter *= 0.995;
      const f =
        (380 + 560 * Math.min(1, t / 0.16)) * lift -
        160 * Math.max(0, t - seconds * 0.6) +
        40 * Math.sin(2 * Math.PI * 6.8 * t) +
        jitter;
      let s = 0;
      for (let v = 0; v < detune.length; v++) {
        phase[v] = (phase[v] + (f * detune[v]) / sr) % 1;
        s += 2 * phase[v] - 1;
      }
      s /= detune.length;
      src[i] = Math.tanh((s + (Math.random() * 2 - 1) * 0.4) * 4);
    }
    const f1 = bandpass(src, 850 * lift, 4, sr);
    const f2 = bandpass(src, 1300 * lift, 5, sr);
    const f3 = bandpass(src, 3100, 6, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const env = Math.min(1, t / 0.02) * Math.min(1, (seconds - t) / 0.35);
      const rough = 1 + 0.3 * Math.sin(2 * Math.PI * 33 * t);
      d[i] = (f1[i] + f2[i] * 0.8 + f3[i] * 0.5 + src[i] * 0.12) * env * rough;
    }
    normalize(d, 0.95);
  });
}

function growl(ctx) {
  return loopable(ctx, 4, (d, sr) => {
    let phase = 0;
    let drift = 0;
    const src = new Float32Array(d.length);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      drift += (Math.random() - 0.5) * 0.8;
      drift *= 0.999;
      const f = 66 + drift + 6 * Math.sin(2 * Math.PI * 0.9 * t);
      phase = (phase + f / sr) % 1;
      const pulse = Math.tanh((2 * phase - 1) * 3) + (Math.random() * 2 - 1) * 0.5;
      const breath = Math.pow(Math.max(0, Math.sin(2 * Math.PI * 0.55 * t)), 0.6);
      const rattle = 0.6 + 0.4 * Math.sin(2 * Math.PI * 23 * t + Math.sin(t * 7) * 3);
      src[i] = pulse * (0.25 + 0.75 * breath) * rattle;
    }
    const a = bandpass(src, 420, 2.5, sr);
    const b = bandpass(src, 950, 4, sr);
    for (let i = 0; i < d.length; i++) d[i] = a[i] + b[i] * 0.5 + src[i] * 0.08;
    lowpass(d, 2400, sr);
    normalize(d, 0.8);
  });
}

function stinger(ctx) {
  return buffer(ctx, 2.6, 1, (d, sr) => {
    const notes = [233, 247, 262, 277, 466, 494, 523];
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const env = Math.min(1, t / 0.06) * Math.exp(-t * 1.6);
      let s = 0;
      notes.forEach((f, k) => {
        const vib = 1 + 0.012 * Math.sin(2 * Math.PI * (5 + k) * t);
        s += Math.sin(2 * Math.PI * f * vib * t) + 0.4 * Math.sin(4 * Math.PI * f * vib * t);
      });
      const boom = Math.sin(2 * Math.PI * (42 - 10 * t) * t) * Math.exp(-t * 2.5) * 3;
      const hiss = (Math.random() * 2 - 1) * Math.exp(-t * 5) * 0.8;
      d[i] = (s / notes.length) * env * 1.4 + boom + hiss;
    }
    normalize(d, 0.95);
  });
}

function heartbeat(ctx) {
  return buffer(ctx, 0.78, 1, (d, sr) => {
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      let s = 0;
      for (const [at, amp] of [
        [0, 1],
        [0.2, 0.7],
      ]) {
        const u = t - at;
        if (u > 0) s += (Math.sin(2 * Math.PI * 48 * u) + 0.5 * Math.sin(2 * Math.PI * 85 * u)) * Math.exp(-u * 20) * amp;
      }
      d[i] = s;
    }
    lowpass(d, 300, sr);
    normalize(d, 0.95);
  });
}

function boom(ctx) {
  return buffer(ctx, 1.6, 1, (d, sr) => {
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] =
        Math.sin(2 * Math.PI * (55 - 25 * t) * t) * Math.exp(-t * 2.2) +
        (Math.random() * 2 - 1) * Math.exp(-t * 9) * 0.7;
    }
    lowpass(d, 1500, sr);
    normalize(d, 1);
  });
}

function tones(ctx, seconds, notes, { decay = 6, harmonics = [1, 0.5, 0.25], peak = 0.8 } = {}) {
  return buffer(ctx, seconds, 1, (d, sr) => {
    for (const [at, f, amp = 1] of notes) {
      for (let i = Math.floor(at * sr); i < d.length; i++) {
        const t = i / sr - at;
        const env = Math.min(1, t / 0.01) * Math.exp(-t * decay);
        let v = 0;
        harmonics.forEach((h, k) => (v += Math.sin(2 * Math.PI * f * (k + 1) * t) * h));
        d[i] += v * env * amp;
      }
    }
    normalize(d, peak);
  });
}

function correct(ctx) {
  return tones(ctx, 0.9, [
    [0, 784],
    [0.09, 988],
    [0.18, 1319, 1.2],
  ]);
}

function wrong(ctx) {
  return buffer(ctx, 0.6, 1, (d, sr) => {
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const f = 180 - t * 90;
      const saw = ((t * f) % 1) * 2 - 1;
      d[i] = saw * Math.min(1, t / 0.01) * Math.exp(-t * 3.5) * (t < 0.22 || t > 0.28 ? 1 : 0.1);
    }
    lowpass(d, 1400, sr);
    normalize(d, 0.75);
  });
}

function tick(ctx) {
  return buffer(ctx, 0.08, 1, (d, sr) => {
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] = (Math.sin(2 * Math.PI * 2100 * t) + (Math.random() - 0.5) * 0.6) * Math.exp(-t * 70);
    }
    normalize(d, 0.7);
  });
}

function click(ctx) {
  return buffer(ctx, 0.06, 1, (d, sr) => {
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] = Math.sin(2 * Math.PI * 1300 * t) * Math.exp(-t * 90);
    }
    normalize(d, 0.6);
  });
}

function alarm(ctx) {
  return loopable(ctx, 2, (d, sr) => {
    let phase = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      phase += (t % 1 < 0.5 ? 620 : 465) / sr;
      const s = Math.sin(2 * Math.PI * phase);
      d[i] = Math.sign(s) * Math.min(1, Math.abs(s) * 3) * 0.5;
    }
    lowpass(d, 2500, sr);
  });
}

function fanfare(ctx) {
  const n = (at, f, a = 1) => [at, f, a];
  return tones(
    ctx,
    3.2,
    [n(0, 523), n(0.16, 659), n(0.32, 784), n(0.5, 1047, 1.3), n(0.5, 784, 0.6), n(0.5, 659, 0.5), n(1.1, 988), n(1.25, 1047, 1.4), n(1.25, 784, 0.7), n(1.25, 523, 0.7)],
    { decay: 2.2, harmonics: [1, 0.7, 0.45, 0.3, 0.2], peak: 0.85 },
  );
}

function pop(ctx) {
  return buffer(ctx, 1.4, 1, (d, sr) => {
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const bang = (Math.random() * 2 - 1) * Math.exp(-t * 30);
      const crackle = t > 0.15 && Math.random() < 0.004 * Math.exp(-t * 2) ? (Math.random() - 0.5) * 3 : 0;
      d[i] = bang + crackle + Math.sin(2 * Math.PI * 70 * t) * Math.exp(-t * 18) * 0.8;
    }
    lowpass(d, 4200, sr);
    normalize(d, 0.8);
  });
}

function whisper(ctx) {
  return buffer(ctx, 2.2, 1, (d, sr) => {
    const noise = Float32Array.from({ length: d.length }, () => Math.random() * 2 - 1);
    const a = bandpass(noise, 1800, 3, sr);
    const b = bandpass(noise, 3400, 4, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const syll = Math.max(0, Math.sin(2 * Math.PI * 3.1 * t) * Math.sin(2 * Math.PI * 0.45 * t + 0.4));
      const mix = 0.5 + 0.5 * Math.sin(2 * Math.PI * 1.7 * t);
      d[i] = (a[i] * mix + b[i] * (1 - mix)) * syll * Math.min(1, t * 3) * Math.min(1, (2.2 - t) * 3);
    }
    normalize(d, 0.6);
  });
}

function creak(ctx) {
  return buffer(ctx, 1.8, 1, (d, sr) => {
    let phase = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const f = 70 + 40 * Math.sin(2 * Math.PI * 0.6 * t) + Math.random() * 25;
      phase += f / sr;
      const pulse = phase % 1 < 0.08 ? 1 : 0;
      d[i] = pulse * Math.sin(Math.PI * Math.min(1, t / 1.8)) * (0.6 + Math.random() * 0.4);
    }
    const out = bandpass(d, 900, 2, sr);
    d.set(out);
    normalize(d, 0.7);
  });
}

function knock(ctx) {
  return buffer(ctx, 1.3, 1, (d, sr) => {
    for (const at of [0, 0.32, 0.64]) {
      for (let i = Math.floor(at * sr); i < d.length; i++) {
        const t = i / sr - at;
        d[i] += (Math.sin(2 * Math.PI * 140 * t) + (Math.random() - 0.5) * 0.8) * Math.exp(-t * 28);
      }
    }
    lowpass(d, 1200, sr);
    normalize(d, 0.9);
  });
}

function lose(ctx) {
  return tones(ctx, 3.4, [
    [0, 392],
    [0.45, 370],
    [0.9, 349],
    [1.35, 330, 1.2],
    [1.35, 165, 1],
  ], { decay: 1.2, harmonics: [1, 0.6, 0.4, 0.3], peak: 0.8 });
}

export class AudioSystem {
  constructor(camera, scene) {
    this.camera = camera;
    this.scene = scene;
    this.ready = false;
    this.dripTimer = 4;
    this.scareTimer = 16;
    this.scares = false;
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
      scream: scream(ctx, 1.7, 1),
      jumpscare: scream(ctx, 1.4, 1.35),
      stinger: stinger(ctx),
      boom: boom(ctx),
      correct: correct(ctx),
      wrong: wrong(ctx),
      tick: tick(ctx),
      click: click(ctx),
      fanfare: fanfare(ctx),
      pop: pop(ctx),
      whisper: whisper(ctx),
      creak: creak(ctx),
      knock: knock(ctx),
      lose: lose(ctx),
    };
    this.growlBuffer = growl(ctx);

    this.alarm = new THREE.Audio(listener);
    this.alarm.setBuffer(alarm(ctx));
    this.alarm.setLoop(true);
    this.alarm.setVolume(0.16);

    this.heart = new THREE.Audio(listener);
    this.heart.setBuffer(heartbeat(ctx));
    this.heart.setLoop(true);
    this.heart.setVolume(0);

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

  attachGrowl(object) {
    if (!this.ready || this.growl) return;
    this.growl = new THREE.PositionalAudio(this.listener);
    this.growl.setBuffer(this.growlBuffer);
    this.growl.setLoop(true);
    this.growl.setRefDistance(1.6);
    this.growl.setRolloffFactor(1.1);
    this.growl.position.y = 1.6;
    object.add(this.growl);
  }

  setGrowl(on, rate = 1) {
    if (!this.growl) return;
    this.growl.setPlaybackRate(rate);
    if (on && !this.growl.isPlaying) this.growl.play();
    if (!on && this.growl.isPlaying) this.growl.stop();
  }

  // Heartbeat speeds up and gets louder as `fear` goes from 0 to 1.
  setHeartbeat(fear) {
    if (!this.ready) return;
    if (fear <= 0.01) {
      if (this.heart.isPlaying) this.heart.stop();
      return;
    }
    if (!this.heart.isPlaying) this.heart.play();
    this.heart.setVolume(0.35 + fear * 0.6);
    this.heart.setPlaybackRate(1 + fear * 0.9);
  }

  setAlarm(on) {
    if (!this.ready) return;
    if (on && !this.alarm.isPlaying) this.alarm.play();
    if (!on && this.alarm.isPlaying) this.alarm.stop();
  }

  setAmbient(volume) {
    if (this.ready) this.ambient.setVolume(volume);
  }

  // Something out of sight, never quite where you look: a whisper behind you, a door, knocking,
  // or footsteps that stop when you do.
  randomScare(head, yaw) {
    const behind = (dist, side = (Math.random() - 0.5) * 2) =>
      new THREE.Vector3(
        head.x + Math.sin(yaw) * dist + Math.cos(yaw) * side,
        1.5,
        head.z + Math.cos(yaw) * dist - Math.sin(yaw) * side,
      );
    const pick = Math.floor(Math.random() * 5);
    if (pick === 0) this.at('whisper', behind(0.9, Math.random() < 0.5 ? -0.5 : 0.5), 0.8, 0.9 + Math.random() * 0.2);
    else if (pick === 1) this.at('boom', behind(9 + Math.random() * 6, (Math.random() - 0.5) * 12), 0.55, 0.8);
    else if (pick === 2) this.at('creak', behind(4 + Math.random() * 3, (Math.random() - 0.5) * 6), 0.8, 0.8 + Math.random() * 0.3);
    else if (pick === 3) this.at('knock', behind(2.5, (Math.random() - 0.5) * 3), 0.9, 0.85 + Math.random() * 0.2);
    else {
      for (let i = 0; i < 4; i++) {
        setTimeout(() => this.at('steps', behind(3.2 - i * 0.35).setY(0.2), 0.75, 0.6), i * 520);
      }
    }
  }

  update(dt, head, yaw = 0) {
    if (!this.ready) return;
    if (this.scares) {
      this.scareTimer -= dt;
      if (this.scareTimer <= 0) {
        this.scareTimer = 14 + Math.random() * 16;
        this.randomScare(head, yaw);
      }
    }
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
