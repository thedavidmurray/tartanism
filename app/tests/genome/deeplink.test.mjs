/*
 * FOUNDATION acceptance tests — genome/deeplink.js
 *   F. DEEP-LINK RECONSTRUCTION — given a #g= payload, parse() yields a litter
 *      whose threadcounts equal the litter the sharer exported (share == open).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wildLitter, breedLitter, individualFromThreadcount } from '../../src/engine/game.js';
import { wildDescriptor, bredDescriptor, encodeLitter } from '../../src/genome/serialize.js';
import { buildHash, parseHash } from '../../src/genome/deeplink.js';

const tc = (arr) => arr.map((x) => x.threadcount);

test('F. share → open equivalence for a WILD litter', () => {
  // sharer side
  const seed = 0xABCDEF >>> 0;
  const shared = wildLitter({ seed, size: 9 });
  const hash = buildHash(wildDescriptor(seed, 9));   // "#g=..."

  // viewer side: only the URL fragment crosses the wire
  const opened = parseHash(hash);
  assert.ok(opened, 'a valid #g= must parse');
  assert.equal(opened.descriptor.kind, 'wild');
  assert.deepEqual(tc(opened.litter), tc(shared));
});

test('F. share → open equivalence for a BRED (2-parent) litter', () => {
  const p1 = individualFromThreadcount('SA/40 GD8 SA18 CR12 GD4 CR18 SA/40');
  const p2 = individualFromThreadcount('EM/16 IN4 EM6 IN6 GD2 EM4 IN/16');
  const opts = { seed: 918273, size: 9, wildness: 0.55 };
  const shared = breedLitter([p1, p2], opts);

  const payload = encodeLitter(bredDescriptor([p1.threadcount, p2.threadcount], opts));
  const url = `https://tartanism.app/b#g=${payload}`;   // realistic universal-link shape

  const opened = parseHash(new URL(url).hash);
  assert.ok(opened, 'a valid #g= must parse from a full URL hash');
  assert.equal(opened.descriptor.kind, 'bred');
  assert.deepEqual(tc(opened.litter), tc(shared));
});

test('F. deep-link is robust to junk / absent payloads', () => {
  assert.equal(parseHash('#nothing-here'), null);
  assert.equal(parseHash(''), null);
  assert.equal(parseHash('#g='), null);
});

test('F. unknown-version deep link is rejected safely (no throw, null)', () => {
  const future = encodeLitter({ v: 999, kind: 'wild', seed: 1, size: 9 });
  let out;
  assert.doesNotThrow(() => { out = parseHash('#g=' + future); });
  assert.equal(out, null);
});
