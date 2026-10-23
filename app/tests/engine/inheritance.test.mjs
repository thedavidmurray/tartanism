/*
 * INHERITANCE-CORRECTNESS test.
 * Offspring traits derive from the SELECTED parents (palette + proportion
 * provenance), not from random-unrelated setts. Proves "breed" recombines the
 * user's picks rather than re-rolling.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  breedChild, breedLitter, randomIndividual, individualFromThreadcount,
  proportionSignature,
} from '../../src/engine/game.js';

// two parents with DISJOINT palettes so provenance is unambiguous
const greens = individualFromThreadcount('FO/20 EM8 SG6 EM8 FO/20', 11); // {FO,EM,SG}
const blues = individualFromThreadcount('SA/22 CB8 TQ6 CB8 SA/22', 22);  // {SA,CB,TQ}

test('at wildness 0 offspring colors are a strict subset of the parents union', () => {
  const union = new Set([...greens.colors, ...blues.colors]);
  for (let i = 0; i < 24; i++) {
    const child = breedChild(greens, blues, 1000 + i, 0); // pure inheritance
    for (const c of child.colors) {
      assert.ok(union.has(c), `child introduced non-inherited color ${c} at wildness 0`);
    }
  }
});

test('at wildness 0 offspring thread counts derive from the parents', () => {
  // raw (pre-tileable) counts must all appear in the parents count multiset
  const parentCounts = new Set([
    ...greens.rawStripes.map((s) => s.count),
    ...blues.rawStripes.map((s) => s.count),
  ]);
  for (let i = 0; i < 24; i++) {
    const child = breedChild(greens, blues, 5000 + i, 0);
    for (const s of child.rawStripes) {
      assert.ok(parentCounts.has(s.count), `child count ${s.count} not inherited from parents`);
    }
  }
});

test('offspring resemble the selected parents MORE than a random-unrelated sett', () => {
  // proportion-provenance: mean proportion distance of children to the closest
  // parent must be smaller than to a batch of random-unrelated setts.
  const parents = [greens, blues];
  const litter = breedLitter(parents, { seed: 4242, size: 24, wildness: 0.25 });
  const randoms = Array.from({ length: 24 }, (_, i) => randomIndividual(90000 + i));

  const propVec = (ind) => proportionSignature(ind.stripes).split(':').map(Number);
  const dist = (a, b) => {
    const va = propVec(a), vb = propVec(b);
    const n = Math.max(va.length, vb.length);
    let d = Math.abs(va.length - vb.length) / n;
    for (let i = 0; i < Math.min(va.length, vb.length); i++) d += Math.abs(va[i] - vb[i]);
    return d;
  };
  const nearest = (ind, pool) => Math.min(...pool.map((p) => dist(ind, p)));

  const toParents = litter.map((c) => nearest(c, parents)).reduce((a, b) => a + b, 0) / litter.length;
  const toRandom = litter.map((c) => nearest(c, randoms)).reduce((a, b) => a + b, 0) / litter.length;

  assert.ok(toParents < toRandom,
    `children not closer to parents (parents ${toParents.toFixed(3)} vs random ${toRandom.toFixed(3)})`);

  // and color provenance: >=70% of each child's palette is inherited even with
  // some wildness (selection dominates, mutation is a minority)
  const union = new Set([...greens.colors, ...blues.colors]);
  const inheritedFrac = litter.map((c) => c.colors.filter((x) => union.has(x)).length / c.colors.length);
  const meanInherited = inheritedFrac.reduce((a, b) => a + b, 0) / inheritedFrac.length;
  assert.ok(meanInherited >= 0.7,
    `only ${(meanInherited * 100).toFixed(0)}% of offspring palette inherited (<70%)`);
});
