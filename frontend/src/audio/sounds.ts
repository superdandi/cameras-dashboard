// ─── Procedural Sound Synthesis ────────────────────────────────────────
// All sounds generated via Web Audio API oscillators — no audio files.
// Each function creates fresh nodes (oscillators can't be reused after stop).

import { getCtx, getSfxBus, getBgmBus, getNoiseBuffer } from './AudioEngine';

// ─── Typing click ──────────────────────────────────────────────────────
// White noise burst → bandpass 3kHz → 20ms decay.
// Called when each HUD line appears.

export function playClick(): void {
  const ctx = getCtx();
  const bus = getSfxBus();
  const noiseBuf = getNoiseBuffer();
  if (!ctx || !bus || !noiseBuf) return;

  const source = ctx.createBufferSource();
  source.buffer = noiseBuf;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 3000;
  filter.Q.value = 2;

  const gain = ctx.createGain();
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0.32, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(bus);
  source.start(now);
  source.stop(now + 0.02);
}

// ─── Ambient hum ───────────────────────────────────────────────────────
// Triangle wave @60Hz + filtered noise (server room texture).
// Runs continuously during boot. Returns stop function to clean up.

export function startHum(): () => void {
  const ctx = getCtx();
  const bus = getBgmBus();
  if (!ctx || !bus) return () => {};

  // Triangle oscillator — richer harmonics than sine
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = 60;

  // Filtered noise layer (server room texture)
  const noiseBuf = getNoiseBuffer();
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = noiseBuf;
  noiseSource.loop = true;

  const lpf = ctx.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = 150;

  const oscGain = ctx.createGain();
  oscGain.gain.value = 0.36;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.096;

  osc.connect(oscGain);
  oscGain.connect(bus);
  noiseSource.connect(lpf);
  lpf.connect(noiseGain);
  noiseGain.connect(bus);

  osc.start();
  noiseSource.start();

  return () => {
    osc.stop();
    noiseSource.stop();
    osc.disconnect();
    noiseSource.disconnect();
    oscGain.disconnect();
    noiseGain.disconnect();
    lpf.disconnect();
  };
}

// ─── Whoosh / sweep ────────────────────────────────────────────────────
// Noise BPF sweep rising 200→3000Hz + sub-bass @80Hz swell.
// Called at bloom burst (t=7.5s). Duration: 0.8s.

export function playWhoosh(): void {
  const ctx = getCtx();
  const bus = getSfxBus();
  if (!ctx || !bus) return;

  const now = ctx.currentTime;

  // Noise buffer — 0.8s
  const bufferSize = Math.floor(ctx.sampleRate * 0.8);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const bpf = ctx.createBiquadFilter();
  bpf.type = 'bandpass';
  bpf.frequency.setValueAtTime(200, now);
  bpf.frequency.exponentialRampToValueAtTime(3000, now + 0.8);
  bpf.Q.value = 1;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0, now);
  noiseGain.gain.linearRampToValueAtTime(0.28, now + 0.1);
  noiseGain.gain.linearRampToValueAtTime(0, now + 0.8);

  // Sub-bass swell
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = 80;
  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0, now);
  subGain.gain.linearRampToValueAtTime(0.21, now + 0.2);
  subGain.gain.linearRampToValueAtTime(0, now + 0.8);

  source.connect(bpf);
  bpf.connect(noiseGain);
  noiseGain.connect(bus);
  sub.connect(subGain);
  subGain.connect(bus);

  source.start(now);
  source.stop(now + 0.8);
  sub.start(now);
  sub.stop(now + 0.8);
}

// ─── Power-up chime ────────────────────────────────────────────────────
// 3-layer "system activation": noise hit + sine sweep + triangle sustain.
// Called at onDone (t=8s, corte to cyberpunk mode). Duration: ~0.5s.

export function playChime(): void {
  const ctx = getCtx();
  const bus = getSfxBus();
  if (!ctx || !bus) return;

  const now = ctx.currentTime;

  // Layer 1: Noise hit — sharp attack, HPF
  const hit = ctx.createBufferSource();
  hit.buffer = getNoiseBuffer();
  const hpf = ctx.createBiquadFilter();
  hpf.type = 'highpass';
  hpf.frequency.value = 2000;
  const hitGain = ctx.createGain();
  hitGain.gain.setValueAtTime(0.3, now);
  hitGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
  hit.connect(hpf);
  hpf.connect(hitGain);
  hitGain.connect(bus);
  hit.start(now);
  hit.stop(now + 0.05);

  // Layer 2: Sine sweep 200→2000Hz — energy flow
  const sweep = ctx.createOscillator();
  sweep.type = 'sine';
  sweep.frequency.setValueAtTime(200, now + 0.05);
  sweep.frequency.exponentialRampToValueAtTime(2000, now + 0.3);
  const sweepGain = ctx.createGain();
  sweepGain.gain.setValueAtTime(0, now);
  sweepGain.gain.linearRampToValueAtTime(0.2, now + 0.1);
  sweepGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  sweep.connect(sweepGain);
  sweepGain.connect(bus);
  sweep.start(now);
  sweep.stop(now + 0.5);

  // Layer 3: Triangle @440Hz — sustained "system active" tone
  const tone = ctx.createOscillator();
  tone.type = 'triangle';
  tone.frequency.value = 440;
  const toneGain = ctx.createGain();
  toneGain.gain.setValueAtTime(0, now);
  toneGain.gain.linearRampToValueAtTime(0.1, now + 0.1);
  toneGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  tone.connect(toneGain);
  toneGain.connect(bus);
  tone.start(now);
  tone.stop(now + 0.5);
}
