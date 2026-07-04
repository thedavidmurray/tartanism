/*
 * BROAD-RANGE DEFAULT test (David's directive: HOT range, no accidental muting).
 * An unselected/random wild litter must span a real color gamut AND structural
 * diversity -- the gacha reroll should feel wide-open, never a muted family.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wildLitter, hsl } from '../../src/engine/game.js';
import { parseThreadcount } from '../../src/engine/tartanism.js';
import { structureSignature, proportionSignature } from '../../src/engine/breeding.js';

const stripesOf = (ind) => parseThreadcount(ind.threadcount).stripes;

test('a random wild litter spans a broad color gamut', () => {
  const litter = wildLitter({ seed: 20260703, size: 36 });
  const codes = [...new Set(litter.flatMap((i) => i.colors))];
  assert.ok(codes.length >= 12, `wild litter used only ${codes.length} distinct colors (want >=12)`);

  const sats = codes.map((c) => hsl(c).s);
  const satMin = Math.min(...sats), satMax = Math.max(...sats);
  assert.ok(satMax - satMin >= 0.5, `saturation range ${(satMax - satMin).toFixed(2)} < 0.5 (too flat)`);
  assert.ok(satMax >= 0.6, `no vivid color present (max sat ${satMax.toFixed(2)})`);
  const vivid = sats.filter((s) => s > 0.5).length;
  assert.ok(vivid >= 6, `only ${vivid} vivid colors in a wild litter`);

  // hue coverage: saturated colors cover most of the wheel
  const satHues = codes.filter((c) => hsl(c).s > 0.2).map((c) => hsl(c).h);
  const sextants = new Set(satHues.map((h) => Math.floor(h / 60) % 6));
  assert.ok(sextants.size >= 4, `wild litter hues cover only ${sextants.size}/6 sextants (narrow)`);
});

test('a random wild litter spans structural diversity (not one skeleton recolored)', () => {
  const litter = wildLitter({ seed: 424242, size: 36 });
  const N = litter.length;
  const structSigs = litter.map((i) => structureSignature(stripesOf(i)));
  const propSigs = litter.map((i) => proportionSignature(stripesOf(i)));
  const stripeCounts = litter.map((i) => stripesOf(i).length);
  const scales = litter.map((i) => i.expandedLength);

  assert.ok(new Set(structSigs).size / N >= 0.8,
    `structure diversity ${new Set(structSigs).size}/${N} < 0.8`);
  assert.ok(new Set(propSigs).size / N >= 0.8,
    `proportion diversity ${new Set(propSigs).size}/${N} < 0.8`);
  assert.ok(new Set(stripeCounts).size >= 4,
    `only ${new Set(stripeCounts).size} distinct stripe-count layouts`);
  assert.ok(new Set(scales).size >= 6,
    `only ${new Set(scales).size} distinct sett scales (expandedLength)`);
});
