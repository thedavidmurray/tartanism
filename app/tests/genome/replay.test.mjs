/*
 * FOUNDATION acceptance tests — replay.js
 *   B. DETERMINISTIC REPLAY — reconstruct == fresh generate, byte-identical
 *   C. SEED-CAPTURE (regression guard) — the concrete integer seed is captured
 *      at generation time and threaded through; NO Math.random leaks into replay.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wildLitter, breedLitter, individualFromThreadcount } from '../../src/engine/game.js';
import { reconstructLitter } from '../../src/genome/replay.js';
import { wildDescriptor, bredDescriptor } from '../../src/genome/serialize.js';

const tc = (arr) => arr.map((x) => x.threadcount);

test('B. deterministic replay — wild is byte-identical to a fresh wildLitter', () => {
  const seed = 0xC0FFEE >>> 0, size = 9;
  const replayed = reconstructLitter({ v: 1, kind: 'wild', seed, size });
  const fresh = wildLitter({ seed, size });
  assert.deepEqual(tc(replayed), tc(fresh));
});

test('B. deterministic replay — bred is byte-identical to a fresh breedLitter', () => {
  const p1 = individualFromThreadcount('SA/40 GD8 SA18 CR12 GD4 CR18 SA/40');
  const p2 = individualFromThreadcount('EM/16 IN4 EM6 IN6 GD2 EM4 IN/16');
  const opts = { seed: 777, size: 9, wildness: 0.6 };

  const descriptor = { v: 1, kind: 'bred', ...opts, parents: [p1.threadcount, p2.threadcount] };
  const replayed = reconstructLitter(descriptor);

  // (i) equals a fresh breed from parents rebuilt out of the SAME threadcounts
  const freshTc = breedLitter([p1.threadcount, p2.threadcount].map(individualFromThreadcount), opts);
  assert.deepEqual(tc(replayed), tc(freshTc));

  // (ii) equals a fresh breed from the ORIGINAL parent objects — proves the
  //      threadcount string is a lossless genome for the breeding path.
  const freshOrig = breedLitter([p1, p2], opts);
  assert.deepEqual(tc(replayed), tc(freshOrig));
});

test('B. deterministic replay — single-parent bred litter', () => {
  const p1 = individualFromThreadcount('SA/40 GD8 SA18 CR12 GD4 CR18 SA/40');
  const opts = { seed: 555, size: 9, wildness: 0.4 };
  const replayed = reconstructLitter({ v: 1, kind: 'bred', ...opts, parents: [p1.threadcount] });
  const fresh = breedLitter([p1], opts);
  assert.deepEqual(tc(replayed), tc(fresh));
});

test('C. seed-capture — the concrete integer seed (post-Math.random) is captured and replays exactly', () => {
  // Reproduce app.js's seed generator: a date base with Math.random() entropy
  // mixed in, then an LCG step. The CONCRETE integer nextSeed() returns is the
  // only thing that can reproduce the litter — never the date.
  const dateBase = (2026 * 372 + 7 * 31 + 3) * 1000;
  let seedCtr = dateBase + Math.floor(Math.random() * 1000);
  const nextSeed = () => (seedCtr = (seedCtr * 1103515245 + 12345) >>> 0);

  const captured = nextSeed();                 // the load-bearing integer
  const litter = wildLitter({ seed: captured, size: 9 });
  const descriptor = wildDescriptor(captured, 9);

  // the descriptor persists the EXACT integer, as a uint32
  assert.equal(descriptor.seed, captured);
  assert.ok(Number.isInteger(descriptor.seed) && descriptor.seed >>> 0 === descriptor.seed);

  // replay from the captured seed reproduces the litter byte-for-byte
  assert.deepEqual(tc(reconstructLitter(descriptor)), tc(litter));

  // regression: the date base ALONE cannot reproduce it (Math.random was mixed
  // in) — this is exactly the bug the captured seed fixes.
  const dateOnly = wildLitter({ seed: dateBase >>> 0, size: 9 });
  assert.notDeepEqual(tc(dateOnly), tc(litter));
});

test('C. seed-capture — bred descriptor captures seed + parents for exact replay', () => {
  const p1 = individualFromThreadcount('SA/40 GD8 SA18 CR12 GD4 CR18 SA/40');
  const p2 = individualFromThreadcount('EM/16 IN4 EM6 IN6 GD2 EM4 IN/16');
  let seedCtr = 987654321 + Math.floor(Math.random() * 1000);
  const nextSeed = () => (seedCtr = (seedCtr * 1103515245 + 12345) >>> 0);

  const captured = nextSeed();
  const opts = { seed: captured, size: 9, wildness: 0.7 };
  const litter = breedLitter([p1, p2], opts);
  const descriptor = bredDescriptor([p1.threadcount, p2.threadcount], opts);

  assert.equal(descriptor.seed, captured);
  assert.deepEqual(tc(reconstructLitter(descriptor)), tc(litter));
});
