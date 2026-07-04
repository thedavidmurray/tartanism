/*
 * BIRTH EVENT — top-inheritor (glow target) selection test.
 * Given a known top-picked parent, the glow targets the offspring with the
 * highest inherited-trait overlap — computed deterministically off the GENOME
 * (palette + proportion rhythm + hue), never off rendered pixels.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { topInheritorIndex, inheritanceScore, buildBirth } from '../../src/engine/birth-sequence.js';
import { individualFromThreadcount, breedLitter } from '../../src/engine/game.js';

test('glow targets the offspring that most overlaps the top parent', () => {
  // top parent: a distinct green palette + rhythm
  const parent = individualFromThreadcount('FO/20 EM8 SG6 EM8 FO/20', 7); // {FO,EM,SG}

  // build a litter where ONE child is (near) the parent itself, the rest are
  // palette-disjoint setts.
  const twin = individualFromThreadcount('FO/20 EM8 SG6 EM8 FO/20', 7);       // identical genome
  const red = individualFromThreadcount('CR/20 MG8 CO6 MG8 CR/20', 8);        // warm, disjoint
  const blue = individualFromThreadcount('SA/22 CB8 TQ6 CB8 SA/22', 9);       // cool, disjoint
  const purple = individualFromThreadcount('AM/24 VT8 MA6 VT8 AM/24', 10);    // violet, disjoint

  const litter = [red, blue, twin, purple];
  const glow = topInheritorIndex(litter, parent);
  assert.equal(glow, 2, 'the twin (index 2) is the strongest inheritor');

  // it must strictly out-score every other child
  const twinScore = inheritanceScore(twin, parent);
  for (const other of [red, blue, purple]) {
    assert.ok(twinScore > inheritanceScore(other, parent), 'twin out-scores each disjoint sett');
  }
});

test('a real bred litter glows a child that actually inherited from the parent', () => {
  const top = individualFromThreadcount('FO/20 EM8 SG6 EM8 FO/20', 11);
  const mate = individualFromThreadcount('SA/22 CB8 TQ6 CB8 SA/22', 22);
  const litter = breedLitter([top, mate], { seed: 4242, size: 9, wildness: 0.2 });

  const glow = topInheritorIndex(litter, top);
  assert.ok(glow >= 0 && glow < 9, 'a valid glow index is chosen');

  // the glowing child inherits at least as much from `top` as the litter average
  const scores = litter.map((c) => inheritanceScore(c, top));
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  assert.ok(scores[glow] >= avg, 'the glow child is an above-average inheritor of the top pick');
  assert.equal(scores[glow], Math.max(...scores), 'the glow child is the single strongest inheritor');
});

test('WILD (no top parent) yields no glow target (index -1)', () => {
  const litter = [
    individualFromThreadcount('CR/20 MG8 CO6 MG8 CR/20', 1),
    individualFromThreadcount('SA/22 CB8 TQ6 CB8 SA/22', 2),
  ];
  assert.equal(topInheritorIndex(litter, null), -1);
  const { glowIndex } = buildBirth({ litter, topParent: null });
  assert.equal(glowIndex, -1, 'a wild reroll glows nothing');
});
