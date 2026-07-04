/*
 * BIRTH EVENT — state-machine test.
 * The sequence advances charge → impact → hatch → done with the right phase
 * durations and ordering, and is RE-ENTRANT-SAFE: a new Breed mid-animation
 * cancels the old sequence cleanly (no orphaned callbacks fire).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSequence, createBirthDriver, DUR } from '../../src/engine/birth-sequence.js';

// ---- a deterministic fake clock + manual RAF pump -------------------------
function fakeClock() {
  let t = 0;
  const queue = [];
  return {
    now: () => t,
    raf: (cb) => { queue.push(cb); return queue.length; },
    cancel: () => {},
    // advance virtual time to `ms` and flush all pending frames at that time
    advanceTo(ms) {
      t = ms;
      // drain: each frame may schedule the next; cap iterations to avoid runaway
      for (let guard = 0; guard < 100000 && queue.length; guard++) {
        const cb = queue.shift();
        cb(t);
      }
    },
  };
}

test('plan orders phases charge(0) → impact(600) → hatch(720+) with correct durations', () => {
  const plan = planSequence({ size: 9 });
  assert.equal(plan.reducedMotion, false);

  const charge = plan.events.find((e) => e.phase === 'charge');
  const impact = plan.events.find((e) => e.phase === 'impact');
  const hatches = plan.events.filter((e) => e.phase === 'hatch');

  assert.equal(charge.at, 0, 'charge starts at t=0');
  assert.equal(impact.at, DUR.charge, 'impact fires exactly after the ~600ms charge');
  assert.equal(hatches.length, 9, 'nine offspring hatch');

  // hatch begins AFTER the hit-pause freeze
  const hatchStart = DUR.charge + DUR.impactHold;
  assert.equal(hatches[0].at, hatchStart, 'first hatch begins after the impact hit-pause');
  // staggered ~35ms apart, ascending index
  for (let i = 0; i < hatches.length; i++) {
    assert.equal(hatches[i].index, i, 'hatch indices are 0..8 in order');
    assert.equal(hatches[i].at, hatchStart + i * DUR.hatchStagger, `hatch ${i} staggered by ${DUR.hatchStagger}ms`);
  }

  // events are globally ordered by time
  for (let i = 1; i < plan.events.length; i++) {
    assert.ok(plan.events[i].at >= plan.events[i - 1].at, 'events sorted ascending by time');
  }

  // total duration extends past the last hatch by the settle tail
  const lastHatch = hatchStart + 8 * DUR.hatchStagger;
  assert.equal(plan.totalDuration, lastHatch + DUR.hatchSettle);
});

test('driver fires each phase exactly once, in order, then done', () => {
  const clk = fakeClock();
  const driver = createBirthDriver(clk);
  const plan = planSequence({ size: 9 });

  const seen = [];
  let done = false;
  driver.play(plan, { onEvent: (e) => seen.push({ phase: e.phase, at: clk.now() }), onDone: () => { done = true; } });

  // nothing past charge yet
  clk.advanceTo(0);
  assert.deepEqual(seen.map((s) => s.phase), ['charge']);

  clk.advanceTo(DUR.charge);           // impact
  assert.ok(seen.some((s) => s.phase === 'impact'));

  clk.advanceTo(DUR.charge + DUR.impactHold); // first hatch
  assert.ok(seen.some((s) => s.phase === 'hatch'));

  clk.advanceTo(plan.totalDuration);   // run to completion
  const hatchCount = seen.filter((s) => s.phase === 'hatch').length;
  assert.equal(hatchCount, 9, 'all nine hatches fired exactly once');
  assert.ok(done, 'onDone fired at total duration');
  assert.equal(driver.isPlaying, false, 'driver idle after completion');

  // idempotent firing: advancing further fires nothing new
  const n = seen.length;
  clk.advanceTo(plan.totalDuration + 500);
  assert.equal(seen.length, n, 'no event fires twice');
});

test('re-entrancy: a new Breed mid-animation cancels the old sequence cleanly', () => {
  const clk = fakeClock();
  const driver = createBirthDriver(clk);
  const plan = planSequence({ size: 9 });

  const runA = [];
  let doneA = false;
  driver.play(plan, { onEvent: (e) => runA.push(e.phase), onDone: () => { doneA = true; } });
  clk.advanceTo(DUR.charge); // A has fired charge + impact

  const aAtInterrupt = runA.length;

  // interrupt with a fresh sequence (a second Breed)
  const runB = [];
  let doneB = false;
  driver.play(plan, { onEvent: (e) => runB.push(e.phase), onDone: () => { doneB = true; } });

  clk.advanceTo(DUR.charge * 2 + plan.totalDuration); // let B finish

  assert.equal(runA.length, aAtInterrupt, 'old sequence emitted NOTHING after being superseded');
  assert.equal(doneA, false, 'old sequence never reports done (it was cancelled)');
  assert.ok(doneB, 'new sequence runs to completion');
  assert.equal(runB.filter((p) => p === 'hatch').length, 9, 'new sequence hatched all nine');
});

test('stop() halts a running sequence with no further callbacks', () => {
  const clk = fakeClock();
  const driver = createBirthDriver(clk);
  const plan = planSequence({ size: 9 });
  const seen = [];
  driver.play(plan, { onEvent: (e) => seen.push(e.phase), onDone: () => seen.push('done') });
  clk.advanceTo(DUR.charge);
  const n = seen.length;
  driver.stop();
  clk.advanceTo(plan.totalDuration + 100);
  assert.equal(seen.length, n, 'no callbacks after stop()');
  assert.equal(driver.isPlaying, false);
});
