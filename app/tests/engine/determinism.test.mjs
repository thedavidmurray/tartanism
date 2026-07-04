/*
 * DETERMINISM test.
 * Same seed + same selection + same wildness + same size => byte-identical
 * litters. Carries over the engine's seeded-Fisher-Yates parity discipline so
 * shareable seeds reproduce exactly (the creator/TikTok discovery hook).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wildLitter, breedLitter, individualFromThreadcount } from '../../src/engine/game.js';

const sig = (litter) => litter.map((i) => `${i.threadcount}|${i.seed}|${i.parents.join(',')}`);

test('wildLitter is reproducible from its seed', () => {
  const a = wildLitter({ seed: 12345, size: 9 });
  const b = wildLitter({ seed: 12345, size: 9 });
  assert.deepEqual(sig(a), sig(b), 'same seed must reproduce the same wild litter');
  const c = wildLitter({ seed: 99999, size: 9 });
  assert.notDeepEqual(sig(a), sig(c), 'a different seed must produce a different litter');
});

test('breedLitter is reproducible from seed + selection + wildness', () => {
  const p1 = individualFromThreadcount('SA/40 GD8 SA18 CR12 GD4 CR18 SA/40', 101);
  const p2 = individualFromThreadcount('EM/16 IN4 EM6 IN6 GD2 EM4 IN/16', 202);
  const opts = { seed: 777, size: 9, wildness: 0.6 };
  const a = breedLitter([p1, p2], opts);
  const b = breedLitter([p1, p2], opts);
  assert.deepEqual(sig(a), sig(b), 'same seed+selection+wildness must reproduce the litter');

  // changing ONLY the wildness must change the output (param is live)
  const c = breedLitter([p1, p2], { ...opts, wildness: 0.05 });
  assert.notDeepEqual(sig(a), sig(c), 'wildness must actually affect the litter');

  // changing ONLY the seed must change the output
  const d = breedLitter([p1, p2], { ...opts, seed: 778 });
  assert.notDeepEqual(sig(a), sig(d), 'seed must actually affect the litter');
});
