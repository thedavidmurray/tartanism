/*
 * FOUNDATION acceptance tests — serialize.js
 *   A. ROUND-TRIP   — decode(encode(d)) deep-equals d (wild + bred 1p/2p)
 *   E. URL-SAFE + BUDGET — base64url, no padding, bred-2p < 600 chars
 *   G. VERSION SAFETY — reads v:1; unknown version does not throw
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeLitter, decodeLitter, isSupported } from '../../src/genome/serialize.js';

const wildD = { v: 1, kind: 'wild', seed: 3735928559, size: 9 };
const bred1D = {
  v: 1, kind: 'bred', seed: 777, size: 9, wildness: 0.6,
  parents: ['SA/40 GD8 SA18 CR12 GD4 CR18 SA/40'],
};
const bred2D = {
  v: 1, kind: 'bred', seed: 424242, size: 9, wildness: 0.35,
  parents: [
    'SA/40 GD8 SA18 CR12 GD4 CR18 SA/40',
    'EM/16 IN4 EM6 IN6 GD2 EM4 IN/16',
  ],
};

test('A. round-trip identity — wild descriptor', () => {
  assert.deepEqual(decodeLitter(encodeLitter(wildD)), wildD);
});

test('A. round-trip identity — bred descriptor, 1 parent', () => {
  assert.deepEqual(decodeLitter(encodeLitter(bred1D)), bred1D);
});

test('A. round-trip identity — bred descriptor, 2 parents', () => {
  assert.deepEqual(decodeLitter(encodeLitter(bred2D)), bred2D);
});

test('E. payload is url-safe base64url with no padding', () => {
  for (const d of [wildD, bred1D, bred2D]) {
    const p = encodeLitter(d);
    assert.match(p, /^[A-Za-z0-9_-]+$/, 'payload must be base64url, no padding/space');
  }
});

test('E. bred-with-2-parents payload is under the 600-char link budget', () => {
  const p = encodeLitter(bred2D);
  assert.ok(p.length < 600, `payload too long: ${p.length}`);
});

test('G. version safety — v:1 reads correctly and is supported', () => {
  const d = decodeLitter(encodeLitter(wildD));
  assert.equal(d.v, 1);
  assert.equal(isSupported(d), true);
});

test('G. version safety — unknown version decodes without throwing and is unsupported', () => {
  const future = encodeLitter({ v: 999, kind: 'wild', seed: 1, size: 9 });
  let d;
  assert.doesNotThrow(() => { d = decodeLitter(future); });
  assert.equal(isSupported(d), false);
});
