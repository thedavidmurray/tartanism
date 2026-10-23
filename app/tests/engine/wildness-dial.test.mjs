/*
 * WILDNESS-DIAL test.
 * Higher mutation/wildness param => measurably higher offspring variance, both
 * STRUCTURAL (proportion / stripe-count spread) and COLOR (hue spread), vs a low
 * setting bred from the SAME parents with the SAME seed. Proves the dial does
 * something real (low = subtle offspring, high = chaotic).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  breedLitter, individualFromThreadcount, structuralVariance, colorVariance,
} from '../../src/engine/game.js';

const p1 = individualFromThreadcount('AM/30 CT8 AM8 TQ16 CT2 AM/18', 31);
const p2 = individualFromThreadcount('CO/28 IN10 CO8 GD6 CO/28', 42);

test('high wildness yields higher STRUCTURAL variance than low', () => {
  const seed = 24680, size = 60;
  const low = breedLitter([p1, p2], { seed, size, wildness: 0.05 });
  const high = breedLitter([p1, p2], { seed, size, wildness: 0.95 });
  const vLow = structuralVariance(low);
  const vHigh = structuralVariance(high);
  assert.ok(vHigh > vLow,
    `structural variance did not increase with wildness (low ${vLow.toFixed(2)} >= high ${vHigh.toFixed(2)})`);
  // and meaningfully so, not a coin-flip
  assert.ok(vHigh > vLow * 1.5,
    `structural variance only ${(vHigh / vLow).toFixed(2)}x higher at max wildness (want >=1.5x)`);
});

test('high wildness yields higher COLOR variance than low', () => {
  const seed = 13579, size = 60;
  const low = breedLitter([p1, p2], { seed, size, wildness: 0.05 });
  const high = breedLitter([p1, p2], { seed, size, wildness: 0.95 });
  const cLow = colorVariance(low);
  const cHigh = colorVariance(high);
  assert.ok(cHigh > cLow,
    `color variance did not increase with wildness (low ${cLow.toFixed(3)} >= high ${cHigh.toFixed(3)})`);
});

test('wildness is monotone-ish across the dial range', () => {
  // sample the dial; structural variance should trend UP overall.
  const seed = 555, size = 48;
  const levels = [0.0, 0.25, 0.5, 0.75, 1.0];
  const vs = levels.map((w) => structuralVariance(breedLitter([p1, p2], { seed, size, wildness: w })));
  assert.ok(vs[vs.length - 1] > vs[0],
    `top of dial not more varied than bottom (${vs.map((v) => v.toFixed(1)).join(', ')})`);
  // Spearman-ish: majority of adjacent steps increase
  let ups = 0;
  for (let i = 1; i < vs.length; i++) if (vs[i] > vs[i - 1]) ups++;
  assert.ok(ups >= 3, `only ${ups}/4 dial steps increased variance (${vs.map((v) => v.toFixed(1)).join(', ')})`);
});
