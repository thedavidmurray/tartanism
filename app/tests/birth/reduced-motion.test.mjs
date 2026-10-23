/*
 * BIRTH EVENT — reduced-motion test.
 * When prefers-reduced-motion is set, the sequence resolves to an INSTANT reveal:
 * offspring visible immediately, NO hit-pause, NO shake, NO staggered long timers,
 * but still a soft confirmation cue.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSequence, buildBirth, createBirthDriver } from '../../src/engine/birth-sequence.js';

test('reduced-motion plan is instant: reveal-all + confirm, all at t=0', () => {
  const plan = planSequence({ reducedMotion: true, size: 9 });
  assert.equal(plan.reducedMotion, true);
  assert.equal(plan.hitPause, false, 'no hit-pause under reduced motion');
  assert.equal(plan.shake, false, 'no screenshake under reduced motion');
  assert.equal(plan.totalDuration, 0, 'sequence resolves instantly');

  const types = plan.events.map((e) => e.type).sort();
  assert.deepEqual(types, ['confirm', 'reveal-all'], 'exactly a reveal + a soft confirm');

  // NO long timers: every event lands effectively at t=0
  for (const e of plan.events) {
    assert.ok(e.at <= 1, `event "${e.type}" must fire immediately, was ${e.at}ms`);
  }
  // no staggered per-child hatch events at all
  assert.equal(plan.events.filter((e) => e.type === 'hatch').length, 0, 'no staggered hatch timers');
});

test('reduced-motion sequence completes in a single tick (no scheduled frames)', () => {
  let t = 0;
  const frames = [];
  const clk = { now: () => t, raf: (cb) => { frames.push(cb); return frames.length; }, cancel: () => {} };
  const driver = createBirthDriver(clk);
  const plan = planSequence({ reducedMotion: true, size: 9 });

  const seen = [];
  let done = false;
  driver.play(plan, { onEvent: (e) => seen.push(e.type), onDone: () => { done = true; } });

  assert.ok(seen.includes('reveal-all'), 'litter revealed immediately');
  assert.ok(seen.includes('confirm'), 'soft confirmation played');
  assert.ok(done, 'done fired on the first tick — no waiting');
  assert.equal(frames.length, 0, 'NO animation frames were scheduled (nothing to animate)');
  assert.equal(driver.isPlaying, false);
});

test('buildBirth honors reduced motion regardless of trigger', () => {
  const litter = Array.from({ length: 9 }, (_, i) => ({ colors: ['IN'], stripes: [{ color: 'IN', count: 4 }], id: 's' + i }));
  const { plan } = buildBirth({ litter, reducedMotion: true });
  assert.equal(plan.reducedMotion, true);
  assert.equal(plan.totalDuration, 0);
});
