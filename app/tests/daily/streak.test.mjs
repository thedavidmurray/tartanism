/*
 * T7 acceptance tests — daily/streak.js (over the real KV shim)
 *   • increments once per local calendar day of engagement
 *   • consecutive days build the count
 *   • idempotent within a day (double-tap ≠ double-count)
 *   • a missed day breaks the streak (resets to 1 on next engagement)
 *   • current() reports 0 once broken, without recording
 *   • state persists across a simulated reload (fresh KV, same namespace)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKV } from '../../src/store/kv.js';
import { createStreak } from '../../src/daily/streak.js';

let n = 0;
const freshNs = () => `streak-test-${Date.now()}-${n++}`;

test('increments once per day; consecutive days build the count', async () => {
  const s = createStreak(createKV({ namespace: freshNs() }));
  assert.equal(await s.record('2026-07-01'), 1);
  assert.equal(await s.record('2026-07-02'), 2);
  assert.equal(await s.record('2026-07-03'), 3);
});

test('idempotent within a calendar day (double-tap does not double-count)', async () => {
  const s = createStreak(createKV({ namespace: freshNs() }));
  assert.equal(await s.record('2026-07-01'), 1);
  assert.equal(await s.record('2026-07-01'), 1);
  assert.equal(await s.record('2026-07-01'), 1);
  assert.equal(await s.record('2026-07-02'), 2);
});

test('a missed day breaks the streak (next engagement resets to 1)', async () => {
  const s = createStreak(createKV({ namespace: freshNs() }));
  await s.record('2026-07-01');
  await s.record('2026-07-02');
  await s.record('2026-07-03'); // count 3
  // skip 07-04 entirely, engage 07-05
  assert.equal(await s.record('2026-07-05'), 1);
  // and it builds again from there
  assert.equal(await s.record('2026-07-06'), 2);
});

test('current() reports the live streak, and 0 once broken — without recording', async () => {
  const s = createStreak(createKV({ namespace: freshNs() }));
  await s.record('2026-07-01');
  await s.record('2026-07-02'); // count 2, lastDay 07-02

  // same day → shows 2
  assert.equal(await s.current('2026-07-02'), 2);
  // next consecutive day, not yet engaged → still alive, shows 2
  assert.equal(await s.current('2026-07-03'), 2);
  // a gap → broken, shows 0
  assert.equal(await s.current('2026-07-05'), 0);
  // current() must not have mutated stored state
  assert.deepEqual(await s.raw(), { count: 2, lastDay: '2026-07-02' });
});

test('month boundary is treated as consecutive', async () => {
  const s = createStreak(createKV({ namespace: freshNs() }));
  assert.equal(await s.record('2026-01-31'), 1);
  assert.equal(await s.record('2026-02-01'), 2);
});

test('persists across a simulated reload (fresh KV, same namespace)', async () => {
  const ns = freshNs();
  const s1 = createStreak(createKV({ namespace: ns }));
  await s1.record('2026-07-01');
  await s1.record('2026-07-02'); // count 2

  // COLD START: brand-new KV + streak over the same namespace
  const s2 = createStreak(createKV({ namespace: ns }));
  assert.deepEqual(await s2.raw(), { count: 2, lastDay: '2026-07-02' });
  assert.equal(await s2.current('2026-07-03'), 2);
  assert.equal(await s2.record('2026-07-03'), 3); // continues from persisted state
});

test('empty state: current() is 0 before any engagement', async () => {
  const s = createStreak(createKV({ namespace: freshNs() }));
  assert.equal(await s.current('2026-07-01'), 0);
  assert.deepEqual(await s.raw(), { count: 0, lastDay: null });
});
