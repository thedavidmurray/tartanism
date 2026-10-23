/*
 * BIRTH EVENT — reuse test.
 * WILD triggers the SAME sequence module as BREED: one code path (buildBirth),
 * one plan shape. The only difference is the glow target (breed has one, wild
 * does not).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBirth } from '../../src/engine/birth-sequence.js';
import { individualFromThreadcount, wildLitter, breedLitter } from '../../src/engine/game.js';

test('BREED and WILD produce the identical sequence plan (one code path)', () => {
  const p1 = individualFromThreadcount('FO/20 EM8 SG6 EM8 FO/20', 1);
  const p2 = individualFromThreadcount('SA/22 CB8 TQ6 CB8 SA/22', 2);

  const bred = breedLitter([p1, p2], { seed: 100, size: 9, wildness: 0.5 });
  const wild = wildLitter({ seed: 200, size: 9 });

  const breedBirth = buildBirth({ litter: bred, topParent: p1 });
  const wildBirth = buildBirth({ litter: wild, topParent: null });

  // same module, same timeline — the sequence itself is trigger-agnostic
  assert.deepEqual(breedBirth.plan.events, wildBirth.plan.events, 'BREED and WILD share the exact plan');
  assert.equal(breedBirth.plan.totalDuration, wildBirth.plan.totalDuration);
});

test('the only trigger difference is the glow target', () => {
  const p1 = individualFromThreadcount('FO/20 EM8 SG6 EM8 FO/20', 1);
  const p2 = individualFromThreadcount('SA/22 CB8 TQ6 CB8 SA/22', 2);
  const bred = breedLitter([p1, p2], { seed: 100, size: 9, wildness: 0.4 });
  const wild = wildLitter({ seed: 200, size: 9 });

  assert.ok(buildBirth({ litter: bred, topParent: p1 }).glowIndex >= 0, 'BREED glows an inheritor');
  assert.equal(buildBirth({ litter: wild, topParent: null }).glowIndex, -1, 'WILD glows nothing');
});
