/*
 * TRAIT-PINNING test (T16).
 * Tap-and-hold a sett to LOCK one gene — palette OR stripe-rhythm OR
 * proportions — so it carries into every future litter while everything else
 * keeps breeding wild. This resolves convergence-as-arc vs entropy-death: the
 * player fixes an axis of identity and lets the rest roam.
 *
 * Acceptance:
 *   • a pinned gene persists across breeds (ALL offspring carry it);
 *   • the OTHER (unpinned) genes still vary;
 *   • unpinning restores full variation;
 *   • pins honor both breed AND wild rerolls (a persistent population constraint).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  breedLitter, wildLitter, individualFromThreadcount, makePin, PIN_GENES,
} from '../../src/engine/game.js';
import { structureSignature, proportionSignature } from '../../src/engine/breeding.js';
import { parseThreadcount } from '../../src/engine/tartanism.js';

const stripesOf = (ind) => parseThreadcount(ind.threadcount).stripes;
const paletteKey = (ind) => [...ind.colors].sort().join(',');
const distinct = (xs) => new Set(xs).size;

// Two disjoint-palette parents so provenance is unambiguous.
const greens = individualFromThreadcount('FO/20 EM8 SG6 EM8 FO/20', 11); // {FO,EM,SG}
const blues = individualFromThreadcount('SA/22 CB8 TQ6 CB8 SA/22', 22);  // {SA,CB,TQ}
// A source sett whose gene we pin (distinct from both parents).
const source = individualFromThreadcount('GD/14 CR6 IN10 CR6 WH4 IN10 GD/14', 99);

test('PIN_GENES exposes exactly the three lockable genes', () => {
  assert.deepEqual([...PIN_GENES].sort(), ['palette', 'proportions', 'rhythm']);
});

// ---------------------------------------------------------------------------
// PALETTE pin — every offspring draws ONLY from the source palette; structure
// and proportions keep varying wild.
// ---------------------------------------------------------------------------
test('PALETTE pin: all offspring carry the source palette, structure still varies', () => {
  const pin = makePin('palette', source);
  const srcPal = new Set(source.colors);

  const bred = breedLitter([greens, blues], { seed: 3001, size: 12, wildness: 0.6, pin });
  for (const child of bred) {
    for (const c of child.colors) {
      assert.ok(srcPal.has(c), `bred child leaked non-pinned color ${c} (palette pin)`);
    }
  }
  // the unpinned genes (structure / proportions) still move
  assert.ok(distinct(bred.map((c) => structureSignature(stripesOf(c)))) > 1,
    'structure did not vary under a palette pin');

  // pins also govern WILD rerolls
  const wild = wildLitter({ seed: 3002, size: 12, pin });
  for (const child of wild) {
    for (const c of child.colors) {
      assert.ok(srcPal.has(c), `wild child leaked non-pinned color ${c} (palette pin)`);
    }
  }
  assert.ok(distinct(wild.map((c) => structureSignature(stripesOf(c)))) > 1,
    'wild structure did not vary under a palette pin');
});

// ---------------------------------------------------------------------------
// RHYTHM pin — every offspring carries the source's stripe-rhythm
// (structureSignature: counts + which stripes share a color); palette varies.
// ---------------------------------------------------------------------------
test('RHYTHM pin: all offspring carry the source stripe-rhythm, palette still varies', () => {
  const pin = makePin('rhythm', source);
  const srcRhythm = structureSignature(stripesOf(source));

  const bred = breedLitter([greens, blues], { seed: 4001, size: 12, wildness: 0.6, pin });
  for (const child of bred) {
    assert.equal(structureSignature(stripesOf(child)), srcRhythm,
      'bred child broke the pinned stripe-rhythm');
  }
  assert.ok(distinct(bred.map(paletteKey)) > 1, 'palette did not vary under a rhythm pin');

  const wild = wildLitter({ seed: 4002, size: 12, pin });
  for (const child of wild) {
    assert.equal(structureSignature(stripesOf(child)), srcRhythm,
      'wild child broke the pinned stripe-rhythm');
  }
  assert.ok(distinct(wild.map(paletteKey)) > 1, 'wild palette did not vary under a rhythm pin');
});

// ---------------------------------------------------------------------------
// PROPORTIONS pin — every offspring carries the source's relative widths
// (proportionSignature); palette AND rhythm vary.
// ---------------------------------------------------------------------------
test('PROPORTIONS pin: all offspring carry the source proportions, palette still varies', () => {
  const pin = makePin('proportions', source);
  const srcProp = proportionSignature(stripesOf(source));

  const bred = breedLitter([greens, blues], { seed: 5001, size: 12, wildness: 0.6, pin });
  for (const child of bred) {
    assert.equal(proportionSignature(stripesOf(child)), srcProp,
      'bred child broke the pinned proportions');
  }
  assert.ok(distinct(bred.map(paletteKey)) > 1, 'palette did not vary under a proportions pin');

  const wild = wildLitter({ seed: 5002, size: 12, pin });
  for (const child of wild) {
    assert.equal(proportionSignature(stripesOf(child)), srcProp,
      'wild child broke the pinned proportions');
  }
});

// ---------------------------------------------------------------------------
// UNPIN restores full variation on every gene.
// ---------------------------------------------------------------------------
test('unpinning restores full variation (no gene is forced)', () => {
  const opts = { seed: 6001, size: 16, wildness: 0.6 };
  const bred = breedLitter([greens, blues], { ...opts, pin: null });

  // structure varies again
  assert.ok(distinct(bred.map((c) => structureSignature(stripesOf(c)))) > 1,
    'structure frozen without a pin');
  // proportions vary again
  assert.ok(distinct(bred.map((c) => proportionSignature(stripesOf(c)))) > 1,
    'proportions frozen without a pin');
  // and offspring are NOT confined to the source palette (palette roams)
  const srcPal = new Set(source.colors);
  const anyEscape = bred.some((c) => c.colors.some((x) => !srcPal.has(x)));
  assert.ok(anyEscape, 'palette stayed confined to the source without a pin');
});

// ---------------------------------------------------------------------------
// Pins do not break determinism (same seed + same pin ⇒ identical litter).
// ---------------------------------------------------------------------------
test('pins are deterministic (same seed + pin reproduce byte-identical litters)', () => {
  const pin = makePin('rhythm', source);
  const sig = (l) => l.map((i) => `${i.threadcount}|${i.seed}`);
  const a = breedLitter([greens, blues], { seed: 7001, size: 9, wildness: 0.5, pin });
  const b = breedLitter([greens, blues], { seed: 7001, size: 9, wildness: 0.5, pin });
  assert.deepEqual(sig(a), sig(b), 'a pinned litter must reproduce from its seed');
});
