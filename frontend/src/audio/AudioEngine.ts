// ─── AudioEngine — Singleton Web Audio API ─────────────────────────────
// Provides: AudioContext, master/BGM/SFX buses, lifecycle management.
// All sounds are procedural — no audio files loaded.

let _ctx: AudioContext | null = null;
let _masterGain: GainNode | null = null;
let _bgmGain: GainNode | null = null;
let _sfxGain: GainNode | null = null;
let _noiseBuffer: AudioBuffer | null = null;

// ─── Init / Lifecycle ─────────────────────────────────────────────────

export function initAudio(): void {
  if (_ctx) return;
  _ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

  _masterGain = _ctx.createGain();
  _masterGain.gain.value = 0.8;

  _bgmGain = _ctx.createGain();
  _bgmGain.gain.value = 0.05;

  _sfxGain = _ctx.createGain();
  _sfxGain.gain.value = 0.3;

  _bgmGain.connect(_masterGain);
  _sfxGain.connect(_masterGain);
  _masterGain.connect(_ctx.destination);

  // Pre-allocate noise buffer (20ms) for typing clicks
  const sampleRate = _ctx.sampleRate;
  const bufferSize = Math.floor(sampleRate * 0.02);
  _noiseBuffer = _ctx.createBuffer(1, bufferSize, sampleRate);
  const data = _noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
}

export function resumeAudio(): void {
  if (_ctx?.state === 'suspended') {
    _ctx.resume();
  }
}

export function cleanupAudio(): void {
  _bgmGain?.disconnect();
  _sfxGain?.disconnect();
  _masterGain?.disconnect();
  _ctx?.close();
  _ctx = null;
  _masterGain = null;
  _bgmGain = null;
  _sfxGain = null;
  _noiseBuffer = null;
}

export function setMuted(muted: boolean): void {
  if (_bgmGain) _bgmGain.gain.value = muted ? 0 : 0.05;
  if (_sfxGain) _sfxGain.gain.value = muted ? 0 : 0.3;
}

// ─── Getters (for sounds.ts) ──────────────────────────────────────────

export function getCtx(): AudioContext | null { return _ctx; }
export function getSfxBus(): GainNode | null { return _sfxGain; }
export function getBgmBus(): GainNode | null { return _bgmGain; }
export function getNoiseBuffer(): AudioBuffer | null { return _noiseBuffer; }
