/*
 * BIRTH EVENT — WebAudio SFX test (headless).
 * Sound can't be unit-tested for how it sounds, so we test that the WebAudio
 * scheduler is CALLED with the right note count / timing / ascending pitch, and
 * that the module is a guarded no-op when AudioContext is unavailable.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSfx } from '../../src/audio/sfx.js';

// ---- a minimal mock AudioContext that records what was scheduled -----------
function mockAudioContext() {
  const oscillators = [];
  const ctx = {
    currentTime: 10, // arbitrary non-zero clock
    state: 'running',
    destination: { _node: 'dest' },
    resume() { this.state = 'running'; },
    createGain() {
      return { gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
    },
    createBiquadFilter() {
      return { type: '', frequency: { setValueAtTime() {} }, connect() {} };
    },
    createOscillator() {
      const rec = { type: '', starts: null, stops: null, freqAt: [], freqRamps: [] };
      const osc = {
        type: '',
        frequency: {
          setValueAtTime: (v, t) => rec.freqAt.push({ v, t }),
          exponentialRampToValueAtTime: (v, t) => rec.freqRamps.push({ v, t }),
        },
        connect() {},
        start: (t) => { rec.starts = t; rec.type = osc.type; },
        stop: (t) => { rec.stops = t; },
      };
      oscillators.push(rec);
      return osc;
    },
  };
  return { ctx, oscillators };
}

test('hatch() schedules N ascending ticks spaced by the stagger', () => {
  const { ctx, oscillators } = mockAudioContext();
  const sfx = createSfx({ AudioContextCtor: function () { return ctx; } });
  assert.equal(sfx.enabled, true);

  sfx.hatch(9, 35);
  assert.equal(oscillators.length, 9, 'nine ticks scheduled for nine offspring');

  const starts = oscillators.map((o) => o.starts);
  // spaced 35ms (0.035s) apart, ascending in time from currentTime
  for (let i = 0; i < 9; i++) {
    assert.ok(Math.abs(starts[i] - (10 + i * 0.035)) < 1e-9, `tick ${i} scheduled at +${i * 35}ms`);
  }
  // ascending pitch (arpeggio climbs)
  const freqs = oscillators.map((o) => o.freqAt[0].v);
  for (let i = 1; i < freqs.length; i++) {
    assert.ok(freqs[i] > freqs[i - 1], `tick ${i} is higher-pitched than ${i - 1}`);
  }
});

test('charge() sweeps pitch upward and thunk() is a filtered low burst', () => {
  const { ctx, oscillators } = mockAudioContext();
  const sfx = createSfx({ AudioContextCtor: function () { return ctx; } });

  sfx.charge(600);
  const chargeOsc = oscillators[oscillators.length - 1];
  const startFreq = chargeOsc.freqAt[0].v;
  const endFreq = chargeOsc.freqRamps[chargeOsc.freqRamps.length - 1].v;
  assert.ok(endFreq > startFreq, 'charge rises in pitch');

  const before = oscillators.length;
  sfx.thunk();
  assert.ok(oscillators.length > before, 'thunk scheduled an oscillator');
  const thunkOsc = oscillators[oscillators.length - 1];
  assert.equal(thunkOsc.type, 'sine', 'thunk is a sine burst');
});

test('createSfx() is a guarded no-op when no AudioContext exists', () => {
  const sfx = createSfx({ AudioContextCtor: null });
  assert.equal(sfx.enabled, false, 'disabled with no WebAudio');
  // every method is safe to call and throws nothing
  assert.doesNotThrow(() => { sfx.resume(); sfx.charge(600); sfx.thunk(); sfx.hatch(9, 35); sfx.confirm(); });
});
