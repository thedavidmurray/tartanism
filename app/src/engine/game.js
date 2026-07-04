/*
 * breeding-game/game.js
 *
 * The GENETIC-ALGORITHM layer for the Tartanism breeding game, where the USER is
 * the fitness function. Builds directly on the REAL ported engine:
 *   - tartanism.js : palette, threadcount parse/expand, weave, renderer
 *   - breeding.js  : mulberry32 RNG, the mutate operators, makeTileable,
 *                    structure/proportion signatures, seeded-Fisher-Yates
 *                    determinism discipline.
 *
 * This module adds the game's population genetics on top of that engine:
 *   - randomIndividual / wildLitter : the "wild" (gacha) fully-random batch that
 *     spans a broad color gamut + varied structure (David's directive: HOT range).
 *   - breedChild / breedLitter      : recombine + mutate the user's SELECTED
 *     parents into a fresh litter that inherits from the selection while still
 *     throwing new randomness.
 *   - a WILDNESS dial (0..1) that scales mutation amplitude, count jitter, and
 *     foreign-color injection -> measurably higher offspring variance when hot.
 *   - trait extractors used both by the convergence/variance TESTS and the UI.
 *
 * DETERMINISM CONTRACT: every stochastic choice flows from mulberry32 seeded by
 * an explicit integer. Same seed + same selection + same wildness + same size
 * => byte-identical litters (carried over from the engine's Fisher-Yates fix).
 *
 * DECOUPLING: no import of / dependency on / brand link to TartanMilady. The
 * loop technique is reused only via the already-decoupled tartanism.js.
 */

import { PALETTE, parseThreadcount, expandSett, weaveRepeat, WEAVE_PATTERNS } from './tartanism.js';
import {
  mulberry32,
  makeTileable,
  structureSignature,
  proportionSignature,
  opRunScale,
  opTranspose,
  opReverse,
  opStripeInsert,
  opWidthJitter,
} from './breeding.js';

const REPEAT = weaveRepeat(WEAVE_PATTERNS['twill-2-2']); // 4

// Full palette codes, split into pools. David's directive: broad range HOT by
// default -- the wild pool draws from the ENTIRE gamut (jewel tones + brights +
// muted anchors), no "tasteful" clamp.
export const ALL_CODES = Object.keys(PALETTE);
const VIVID_POOL = ALL_CODES.filter((c) => hsl(c).s > 0.45);
const MUTED_POOL = ALL_CODES.filter((c) => hsl(c).s <= 0.45);

// ---------------------------------------------------------------------------
// COLOR HELPERS (HSL from the palette rgb) -- the trait math for hue targeting.
// ---------------------------------------------------------------------------
export function hsl(code) {
  const c = PALETTE[code];
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: h * 360, s, l };
}

export function circHueDist(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// thread-weighted circular-mean hue of a stripe array (the color "trait").
export function meanHue(stripes) {
  const total = stripes.reduce((a, s) => a + s.count, 0) || 1;
  let x = 0, y = 0;
  for (const st of stripes) {
    const { h, s } = hsl(st.color);
    const w = (st.count / total) * (0.15 + s); // weight vivid stripes more
    const rad = (h * Math.PI) / 180;
    x += Math.cos(rad) * w;
    y += Math.sin(rad) * w;
  }
  let ang = (Math.atan2(y, x) * 180) / Math.PI;
  if (ang < 0) ang += 360;
  return ang;
}

// thread-weighted mean saturation (the "vividness" trait).
export function meanSat(stripes) {
  const total = stripes.reduce((a, s) => a + s.count, 0) || 1;
  return stripes.reduce((acc, s) => acc + hsl(s.color).s * (s.count / total), 0);
}

// ---------------------------------------------------------------------------
// TRAIT / VARIANCE metrics (used by the wildness-dial + broad-range tests).
// ---------------------------------------------------------------------------
function variance(xs) {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length;
}

// circular variance of hues (0..1; higher = more spread around the wheel).
export function colorVariance(litter) {
  const hues = litter.map((ind) => meanHue(ind.stripes));
  let x = 0, y = 0;
  for (const h of hues) {
    x += Math.cos((h * Math.PI) / 180);
    y += Math.sin((h * Math.PI) / 180);
  }
  const R = Math.hypot(x, y) / hues.length;
  return 1 - R;
}

// structural variance: spread of proportion vectors + stripe-count + scale.
export function structuralVariance(litter) {
  const stripeCounts = litter.map((ind) => ind.stripes.length);
  const totals = litter.map((ind) => ind.stripes.reduce((a, s) => a + s.count, 0));
  // dispersion of the largest-stripe share (a proportion-shape trait)
  const topShare = litter.map((ind) => {
    const t = ind.stripes.reduce((a, s) => a + s.count, 0) || 1;
    return Math.max(...ind.stripes.map((s) => s.count)) / t;
  });
  return variance(stripeCounts) + variance(totals) / 400 + variance(topShare) * 100;
}

// ---------------------------------------------------------------------------
// INDIVIDUAL construction / tidy.
// ---------------------------------------------------------------------------
function idFromSeed(seed) {
  return `s${(seed >>> 0).toString(36)}`;
}

// collapse adjacent identical-color stripes (keeps palette; avoids degenerate
// invisible seams) -- proportion-preserving.
function collapse(stripes) {
  const out = [];
  for (const s of stripes) {
    const last = out[out.length - 1];
    if (last && last.color === s.color) last.count += s.count;
    else out.push({ color: s.color, count: s.count });
  }
  return out;
}

// finalize a raw stripe array into a full renderable individual (tileable).
function finalize(rawStripes, { seed, parents = [], strategy = -1, gen = 0 }) {
  let stripes = collapse(rawStripes.map((s) => ({ color: s.color, count: Math.max(2, s.count | 0) })));
  // guarantee at least 2 colors + at least 2 stripes
  if (stripes.length < 2 || new Set(stripes.map((s) => s.color)).size < 2) {
    // inject a contrasting stripe deterministically
    const rng = mulberry32(seed ^ 0x5bd1e995);
    const alt = ALL_CODES[Math.floor(rng() * ALL_CODES.length)];
    stripes.push({ color: alt === stripes[0]?.color ? ALL_CODES[(ALL_CODES.indexOf(alt) + 7) % ALL_CODES.length] : alt, count: 6 });
    stripes = collapse(stripes);
  }
  const t = makeTileable(stripes, REPEAT);
  const finalStripes = collapse(t.stripes.map((s) => ({ color: s.color, count: s.count })));
  const colors = [...new Set(finalStripes.map((s) => s.color))];
  return {
    id: idFromSeed(seed),
    seed,
    stripes: finalStripes,
    rawStripes: rawStripes.map((s) => ({ color: s.color, count: Math.max(2, s.count | 0) })),
    threadcount: t.threadcount,
    expandedLength: t.expandedLength,
    colors,
    parents,
    strategy,
    gen,
    weave: 'twill-2-2',
    threadPx: t.expandedLength <= 120 ? 4 : t.expandedLength <= 190 ? 3 : 2,
    motion: { type: 'pan', speed: 1, direction: { dx: 1, dy: 1 }, intensity: 0 },
  };
}

// ---------------------------------------------------------------------------
// TRAIT PINNING (T16) — lock ONE gene from a chosen sett so it carries into
// every future litter while everything else keeps breeding wild.
//
// A pin is { gene, source } where gene ∈ {'palette','rhythm','proportions'} and
// source is a finalized individual (already tileable). We apply the pin to a
// child's RAW stripe array BEFORE finalize; because the source is tileable
// (expandedLength % REPEAT === 0) and we keep adjacent stripes distinct, finalize
// neither bumps counts nor collapses stripes — so the pinned gene survives the
// tileability pass exactly.
//
//   • palette      → recolor the freely-bred child using ONLY the source's
//                    colors (structure + proportions still vary wild).
//   • rhythm       → impose the source's structureSignature (counts + which
//                    stripes share a color) but paint it with the child's own
//                    wild colors (palette varies wild).
//   • proportions  → impose the source's exact relative widths (proportion
//                    signature) with the child's wild colors and free grouping
//                    (palette + rhythm vary wild).
//
// The GA honors `pin` on both wild rerolls and breeds, so a pin is a persistent
// constraint on the population, not a one-shot.
// ---------------------------------------------------------------------------
export const PIN_GENES = ['palette', 'rhythm', 'proportions'];

// Build a pin descriptor from a chosen sett (the UI's tap-and-hold target).
export function makePin(gene, source) {
  if (!PIN_GENES.includes(gene)) throw new Error(`unknown pin gene: ${gene}`);
  if (!source || !Array.isArray(source.stripes)) throw new Error('pin needs a source sett');
  return { gene, source };
}

const isValidCode = (c) => Object.prototype.hasOwnProperty.call(PALETTE, c);
function firstDifferent(pool, prev) {
  for (const c of pool) if (c !== prev && isValidCode(c)) return c;
  return pool.find(isValidCode) || ALL_CODES[0];
}
// distinct colors, valid, padded from the full gamut so we never run short.
function colorPool(wildColors) {
  const seen = new Set();
  const pool = [];
  for (const c of [...(wildColors || []), ...ALL_CODES]) {
    if (isValidCode(c) && !seen.has(c)) { seen.add(c); pool.push(c); }
  }
  return pool;
}

// PALETTE pin: keep the bred child's counts (its wild structure/proportions),
// repaint using only the source palette, adjacent stripes kept distinct.
function imposePalette(childStripes, palette) {
  const pal = palette.filter(isValidCode);
  const usable = pal.length >= 2 ? pal : colorPool(pal).slice(0, 2);
  const out = [];
  let k = 0;
  for (const s of childStripes) {
    let c = usable[k % usable.length];
    if (out.length && out[out.length - 1].color === c) { k++; c = usable[k % usable.length]; }
    out.push({ color: c, count: Math.max(2, s.count | 0) });
    k++;
  }
  // guarantee ≥2 stripes / ≥2 colors so finalize never injects a foreign color
  if (out.length < 2 || new Set(out.map((o) => o.color)).size < 2) {
    out.push({ color: firstDifferent(usable, out[out.length - 1]?.color), count: 6 });
  }
  return out;
}

// RHYTHM pin: copy the source's counts AND color-grouping (structureSignature),
// but paint each colour-group with a colour from the child's wild palette.
// Injective label→colour mapping in first-appearance order ⇒ identical signature.
function imposeRhythm(sourceStripes, wildColors) {
  const pool = colorPool(wildColors);
  const labelColor = new Map();
  let idx = 0;
  return sourceStripes.map((s) => {
    if (!labelColor.has(s.color)) { labelColor.set(s.color, pool[idx % pool.length]); idx++; }
    return { color: labelColor.get(s.color), count: Math.max(2, s.count | 0) };
  });
}

// PROPORTIONS pin: copy the source's exact counts (relative widths), paint with
// the child's wild colours and FREE grouping (adjacent kept distinct). Rhythm +
// palette vary; proportionSignature is preserved exactly.
function imposeProportions(sourceStripes, childStripes, wildColors) {
  const pool = colorPool(wildColors);
  const out = [];
  for (let i = 0; i < sourceStripes.length; i++) {
    let c = childStripes[i % childStripes.length]?.color;
    if (!isValidCode(c)) c = pool[i % pool.length];
    if (out.length && out[out.length - 1].color === c) c = firstDifferent(pool, out[out.length - 1].color);
    out.push({ color: c, count: Math.max(2, sourceStripes[i].count | 0) });
  }
  return out;
}

// Dispatch: transform a child's raw stripes to honor the active pin (if any).
function applyPin(childStripes, pin) {
  if (!pin || !pin.gene || !pin.source) return childStripes;
  const wildColors = [...new Set(childStripes.map((s) => s.color))];
  if (pin.gene === 'palette') return imposePalette(childStripes, pin.source.colors || []);
  if (pin.gene === 'rhythm') return imposeRhythm(pin.source.stripes, wildColors);
  if (pin.gene === 'proportions') return imposeProportions(pin.source.stripes, childStripes, wildColors);
  return childStripes;
}

// ---------------------------------------------------------------------------
// WILD (gacha) random individual -- broad gamut, varied structure.
// ---------------------------------------------------------------------------
export function randomIndividual(seed, pin = null) {
  const rng = mulberry32(seed >>> 0);
  const nStripes = 3 + Math.floor(rng() * 6); // 3..8
  // draw a palette of 2..5 colors, biased to include at least one vivid (HOT
  // default) but allowed to mix muted anchors -> broad range.
  const nColors = 2 + Math.floor(rng() * 4); // 2..5
  const colors = [];
  colors.push(VIVID_POOL[Math.floor(rng() * VIVID_POOL.length)]); // guarantee a bright
  while (colors.length < nColors) {
    const pool = rng() > 0.35 ? VIVID_POOL : MUTED_POOL; // HOT: mostly vivid
    const c = pool[Math.floor(rng() * pool.length)];
    if (!colors.includes(c)) colors.push(c);
  }
  const stripes = [];
  for (let i = 0; i < nStripes; i++) {
    let color = colors[Math.floor(rng() * colors.length)];
    if (stripes.length && stripes[stripes.length - 1].color === color) {
      color = colors[(colors.indexOf(color) + 1) % colors.length];
    }
    // wide count range -> varied structural rhythm (broad blocks .. fine bands)
    const count = 2 + Math.floor(rng() * 22); // 2..24
    stripes.push({ color, count });
  }
  return finalize(applyPin(stripes, pin), { seed, parents: [], strategy: -1, gen: 0 });
}

export function wildLitter({ seed, size = 9, pin = null } = {}) {
  const out = [];
  for (let i = 0; i < size; i++) out.push(randomIndividual((seed + i * 7919) >>> 0, pin));
  return out;
}

// ---------------------------------------------------------------------------
// BREED one child from two parents, scaled by the WILDNESS dial (0..1).
//   wildness = 0  -> PURE inheritance: colors strictly from parents' union,
//                    counts strictly from parents (no jitter / injection).
//   wildness up   -> more count jitter, more cross-parent color swap, foreign-
//                    color injection, and heavier stacked structural mutation.
// ---------------------------------------------------------------------------
export function breedChild(p1, p2, seed, wildness = 0.5, pin = null) {
  const rng = mulberry32(seed >>> 0);
  const w = Math.max(0, Math.min(1, wildness));
  const allColors = [...new Set([...p1.colors, ...p2.colors])];

  const jitterAmp = Math.round(w * 14);                // 0..14 thread jitter
  const swapProb = w * 0.55;                            // pull color from other parent
  const injectProb = w * w * 0.4;                       // foreign (off-parent) color
  const jit = () => (jitterAmp ? Math.round((rng() - 0.5) * jitterAmp) : 0);
  const colorFor = (base) => {
    const r = rng();
    if (r < injectProb) return ALL_CODES[Math.floor(rng() * ALL_CODES.length)]; // foreign
    if (r < injectProb + swapProb) return allColors[Math.floor(rng() * allColors.length)]; // inherited swap
    return base; // inherited as-is
  };

  const strategy = Math.floor(rng() * 4);
  let child = [];

  if (strategy === 0) {
    // random interleave of the two parents' stripe tracks
    const len = Math.max(p1.stripes.length, p2.stripes.length);
    for (let j = 0; j < len; j++) {
      const useP1 = rng() > 0.5;
      const parent = useP1 ? p1 : p2;
      if (j < parent.stripes.length) {
        const st = parent.stripes[j];
        child.push({ color: colorFor(st.color), count: Math.max(2, st.count + jit()) });
      }
    }
  } else if (strategy === 1) {
    // P1 structure wears P2 colors (inherited recombination)
    p1.stripes.forEach((st, idx) => {
      const donor = p2.colors[idx % p2.colors.length];
      child.push({ color: colorFor(donor), count: Math.max(2, st.count + jit()) });
    });
  } else if (strategy === 2) {
    // P2 structure wears P1 colors
    p2.stripes.forEach((st, idx) => {
      const donor = p1.colors[idx % p1.colors.length];
      child.push({ color: colorFor(donor), count: Math.max(2, st.count + jit()) });
    });
  } else {
    // splice: P1 left half + P2 right half
    const cutA = Math.floor(rng() * p1.stripes.length);
    const cutB = Math.floor(rng() * p2.stripes.length);
    const left = p1.stripes.slice(0, cutA + 1);
    const right = p2.stripes.slice(cutB);
    [...left, ...right].forEach((st) => {
      child.push({ color: colorFor(st.color), count: Math.max(2, st.count + jit()) });
    });
  }

  // structural mutation pass, probability + intensity scale with wildness.
  if (rng() < w) {
    const ops = 1 + Math.floor(rng() * (1 + Math.round(w * 2))); // 1..3 as wildness rises
    for (let i = 0; i < ops; i++) {
      const pick = Math.floor(rng() * 5);
      if (pick === 0) child = opRunScale(child, 1 - w * 0.4 + rng() * (0.3 + w * 1.1));
      else if (pick === 1) child = opTranspose(child, 1 + Math.floor(rng() * (child.length - 1 || 1)));
      else if (pick === 2) child = opReverse(child);
      else if (pick === 3 && w > 0.25) child = opStripeInsert(child, rng, allColors);
      else child = opWidthJitter(child, rng, Math.max(2, Math.round(w * 12)));
    }
  }

  return finalize(applyPin(child, pin), { seed, parents: [p1.id, p2.id], strategy, gen: (Math.max(p1.gen || 0, p2.gen || 0) + 1) });
}

// ---------------------------------------------------------------------------
// BREED a full litter from the user's SELECTED parents (1..N).
// A single selected parent breeds with itself (mutation-driven variety).
// ---------------------------------------------------------------------------
export function breedLitter(parents, { seed, size = 9, wildness = 0.5, pin = null } = {}) {
  if (!parents || parents.length === 0) throw new Error('breedLitter needs >=1 parent');
  const out = [];
  for (let i = 0; i < size; i++) {
    const childSeed = (seed + i * 7919) >>> 0;
    const pick = mulberry32((childSeed ^ 0x9e3779b9) >>> 0);
    let a = parents[Math.floor(pick() * parents.length)];
    let b = parents[Math.floor(pick() * parents.length)];
    if (parents.length > 1 && a === b) b = parents[(parents.indexOf(a) + 1) % parents.length];
    out.push(breedChild(a, b, childSeed, wildness, pin));
  }
  return out;
}

// convenience: build an individual from an explicit threadcount (for fixed
// test parents / shared-seed setts).
export function individualFromThreadcount(tc, seed = 1) {
  const stripes = parseThreadcount(tc).stripes.map((s) => ({ color: s.color, count: s.count }));
  return finalize(stripes, { seed, parents: [], strategy: -1, gen: 0 });
}

export { structureSignature, proportionSignature, expandSett, parseThreadcount, REPEAT };
