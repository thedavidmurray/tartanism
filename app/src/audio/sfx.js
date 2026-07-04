/*
 * audio/sfx.js — WebAudio SFX for the birth event, SYNTHESIZED IN CODE.
 * Zero audio asset files. Everything is oscillators + envelopes:
 *
 *   charge(ms)   — a rising oscillator (the anticipation hum), pitch sweeps up.
 *   thunk()      — a filtered sine burst through a lowpass (the bass impact).
 *   hatch(n, dt) — a scheduled ASCENDING arpeggio of `n` short ticks, dt apart.
 *   confirm()    — a soft single tone (the reduced-motion fallback confirmation).
 *
 * GUARDED + HEADLESS-SAFE: createSfx() takes an AudioContext constructor. If none
 * is available (Node, no WebAudio) it returns an ENABLED:false no-op object whose
 * methods are safe to call and do nothing. Tests inject a mock constructor and
 * assert on the scheduled note count / timing / frequencies.
 *
 * All scheduling is done against ctx.currentTime so a whole arpeggio is queued in
 * one call and plays sample-accurately off the audio clock (not RAF), which keeps
 * it in time even if the main thread is busy rendering hatches.
 */

const A_PENTATONIC = [220.0, 246.94, 293.66, 329.63, 392.0, 440.0, 493.88, 587.33, 659.25, 783.99];

function resolveCtor(explicit) {
  if (explicit) return explicit;
  if (typeof window !== 'undefined') return window.AudioContext || window.webkitAudioContext || null;
  if (typeof AudioContext !== 'undefined') return AudioContext;
  return null;
}

function nullSfx() {
  const noop = () => {};
  return { enabled: false, resume: noop, charge: noop, thunk: noop, hatch: noop, confirm: noop };
}

export function createSfx({ AudioContextCtor } = {}) {
  const Ctor = resolveCtor(AudioContextCtor);
  if (!Ctor) return nullSfx();

  let ctx = null;
  let master = null;

  function ensure() {
    if (!ctx) {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
    }
    return ctx;
  }

  // iOS requires a resume() inside a user gesture before any sound plays.
  function resume() {
    try {
      ensure();
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    } catch { /* audio unavailable — stay silent */ }
  }

  function tone(freq, t0, dur, { type = 'sine', peak = 0.3, attack = 0.006 } = {}) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    return osc;
  }

  // CHARGE: one oscillator sweeping up in pitch under a swelling gain — the hum
  // that says "something is winding up."
  function charge(ms = 600) {
    try {
      ensure();
      const t0 = ctx.currentTime;
      const dur = ms / 1000;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(110, t0);
      osc.frequency.exponentialRampToValueAtTime(440, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.16, t0 + dur * 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.05);
      osc.connect(g); g.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.08);
    } catch { /* no-op */ }
  }

  // IMPACT: a low sine burst pushed through a lowpass — a short, weighty thunk.
  function thunk() {
    try {
      ensure();
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(420, t0);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, t0);
      osc.frequency.exponentialRampToValueAtTime(52, t0 + 0.18);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.6, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
      osc.connect(lp); lp.connect(g); g.connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.36);
    } catch { /* no-op */ }
  }

  // HATCH: schedule `count` ascending ticks, `stepMs` apart, sample-accurately.
  function hatch(count = 9, stepMs = 35) {
    try {
      ensure();
      const t0 = ctx.currentTime;
      const step = stepMs / 1000;
      for (let i = 0; i < count; i++) {
        const freq = A_PENTATONIC[i % A_PENTATONIC.length] * (1 + Math.floor(i / A_PENTATONIC.length) * 0.5);
        tone(freq, t0 + i * step, 0.12, { type: 'triangle', peak: 0.22, attack: 0.004 });
      }
    } catch { /* no-op */ }
  }

  // CONFIRM: a single soft tone — the reduced-motion "it happened" cue.
  function confirm() {
    try {
      ensure();
      const t0 = ctx.currentTime;
      tone(392.0, t0, 0.16, { type: 'sine', peak: 0.16, attack: 0.01 });
    } catch { /* no-op */ }
  }

  return { enabled: true, resume, charge, thunk, hatch, confirm };
}
