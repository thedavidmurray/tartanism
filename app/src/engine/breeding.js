/*
 * curated-loops/breeding.js
 *
 * The REAL Tartanism breed/mutate engine, ported faithfully from the React app
 * (`src/core/breeding.ts` + the mutate operators in `src/OldApp.tsx` and the
 * sett-manipulation helpers in `src/core/sett.ts`) as a standalone, *deterministic*
 * module that drives the STRUCTURAL variety of the curated collection.
 *
 * WHY THIS EXISTS (David's directive #2)
 * --------------------------------------
 * The previous pass's flaw: every sett was a palette-swap of ONE proportional
 * skeleton (ground -> block -> guard -> block -> ground). This module fixes that
 * by using Tartanism's ACTUAL mutation/breeding operators to generate setts with
 * genuinely varied proportions, asymmetry, off-center accents, and different
 * thread-count rhythms -- so the collection reads as a generative SYSTEM's range,
 * not a family of recolors.
 *
 * PORTED OPERATORS (faithful to the app):
 *   - breedTartans: 4 crossover strategies (random-interleave, structure-swap x2,
 *     splice) with per-stripe count jitter -- straight from src/core/breeding.ts.
 *   - mutate ops: run-scale (scaleSett), stripe-insert, sett-transpose (rotate/
 *     reverse stripe order), stripe-width jitter -- from sett.ts + handleMutate.
 *
 * DETERMINISM: the app seeds breeding with `Date.now() + Math.random()`. Here we
 * take an explicit `baseSeed` so the whole collection is reproducible (the
 * structural-variety and color-range tests re-derive the SAME batch). The RNG
 * (mulberry32) and the strategy logic are otherwise identical to the app.
 *
 * TILEABILITY: the seamless-loop math requires the expanded thread count to be a
 * multiple of the weave repeat (4 for 2/2 twill). Raw breed offspring don't
 * satisfy that; `makeTileable` nudges a pivot count by the minimal amount to fix
 * it -- a proportion-preserving adjustment, not a re-skeleton.
 */

import { parseThreadcount, expandSett, weaveRepeat, WEAVE_PATTERNS, PALETTE } from './tartanism.js';

// ---------------------------------------------------------------------------
// Seeded RNG (mulberry32) -- identical to src/core/breeding.ts.
// ---------------------------------------------------------------------------
export function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Vivid + neutral palette codes the insert-operator may draw from (David's #1:
// broad color range -- jewel tones, brights, plus muted anchors).
const INSERT_ACCENTS = ['GD', 'BN', 'IC', 'CT', 'PK', 'TQ', 'CO', 'MA', 'LM', 'ST'];

// Deterministic Fisher-Yates shuffle. (The app used `arr.sort(() => rng()-0.5)`,
// but `Array.sort` with a random comparator is ENGINE-DEPENDENT -- Node's V8 and
// Chromium's V8 make different comparison sequences, so the same seed produced
// different collections in-browser vs in-node. Fisher-Yates is a proper seeded
// shuffle that is identical across engines, preserving cross-platform determinism.)
function shuffled(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// SIGNATURES  (ported from src/core/sett.ts generateSignatures) -- the diversity
// metrics the structural-variety test asserts against.
// ---------------------------------------------------------------------------
export function structureSignature(stripes) {
  // color-agnostic rhythm: relabel colors A,B,C.. then join count pattern
  const map = new Map();
  let next = 65;
  return stripes
    .map((s) => {
      if (!map.has(s.color)) map.set(s.color, String.fromCharCode(next++));
      return `${map.get(s.color)}${s.count}`;
    })
    .join('-');
}

export function proportionSignature(stripes) {
  const total = stripes.reduce((a, s) => a + s.count, 0);
  return stripes.map((s) => Math.round((s.count / total) * 100) / 100).join(':');
}

// ---------------------------------------------------------------------------
// MUTATE OPERATORS (ported from sett.ts + handleMutate) -- operate on a plain
// stripe array [{color,count,isPivot?}] and return a new stripe array.
// ---------------------------------------------------------------------------

// run-scale: multiply all counts by a factor (scaleSett).
export function opRunScale(stripes, factor) {
  return stripes.map((s) => ({ ...s, count: Math.max(2, Math.round(s.count * factor)) }));
}

// sett-transpose: rotate the stripe order by k (off-center the accents).
export function opTranspose(stripes, k) {
  const n = stripes.length;
  const kk = ((k % n) + n) % n;
  return stripes.map((_, i) => ({ ...stripes[(i + kk) % n] }));
}

// reverse stripe order (reverseSett).
export function opReverse(stripes) {
  return [...stripes].reverse().map((s) => ({ ...s }));
}

// stripe-insert: splice a thin accent stripe into a random interior slot.
export function opStripeInsert(stripes, rng, allColors) {
  const out = stripes.map((s) => ({ ...s }));
  const pool = [...new Set([...allColors, ...INSERT_ACCENTS])].filter((c) => PALETTE[c]);
  const color = pool[Math.floor(rng() * pool.length)];
  const count = 2 + Math.floor(rng() * 5) * 2; // 2..10, even-ish thin band
  const pos = 1 + Math.floor(rng() * Math.max(1, out.length - 1));
  out.splice(pos, 0, { color, count });
  return out;
}

// stripe-width jitter (per-stripe count perturbation) -- the breed engine's jitter
// exposed as a standalone mutate op.
export function opWidthJitter(stripes, rng, amp = 8) {
  return stripes.map((s) => {
    const j = Math.round((rng() - 0.5) * amp);
    return { ...s, count: Math.max(2, s.count + j) };
  });
}

function applyMutations(stripes, rng, allColors) {
  let s = stripes;
  const ops = 1 + Math.floor(rng() * 3); // 1..3 stacked operators
  for (let i = 0; i < ops; i++) {
    const pick = Math.floor(rng() * 5);
    if (pick === 0) s = opRunScale(s, 0.6 + rng() * 1.1); // 0.6x..1.7x
    else if (pick === 1) s = opTranspose(s, 1 + Math.floor(rng() * (s.length - 1 || 1)));
    else if (pick === 2) s = opReverse(s);
    else if (pick === 3) s = opStripeInsert(s, rng, allColors);
    else s = opWidthJitter(s, rng, 6);
  }
  return s;
}

// ---------------------------------------------------------------------------
// BREED (ported from src/core/breeding.ts breedTartans) -- deterministic.
// Returns arrays of stripe specs {color,count}. Symmetry pivots set by caller.
// ---------------------------------------------------------------------------
export function breedStripes(p1, p2, count, baseSeed) {
  const allColors = [...new Set([...p1.colors, ...p2.colors])];
  const litter = [];
  for (let i = 0; i < count; i++) {
    const seed = baseSeed + i * 7919; // prime spacing (as in the app)
    const rng = mulberry32(seed);
    let childStripes = [];
    const strategy = i % 4;

    if (strategy === 0) {
      // random interleave
      const len = Math.max(p1.stripes.length, p2.stripes.length);
      for (let j = 0; j < len; j++) {
        const useP1 = rng() > 0.5;
        const parent = useP1 ? p1 : p2;
        const other = useP1 ? p2 : p1;
        if (j < parent.stripes.length) {
          const st = parent.stripes[j];
          const color =
            rng() > 0.7 && other.colors.length > 0
              ? other.colors[Math.floor(rng() * other.colors.length)]
              : st.color;
          const countJitter = Math.round((rng() - 0.5) * 8);
          childStripes.push({ color, count: Math.max(2, st.count + countJitter) });
        }
      }
    } else if (strategy === 1) {
      // P1 structure, P2 colors, shuffled + jitter
      const sh = shuffled(p2.colors, rng);
      p1.stripes.forEach((st, idx) => {
        const color = sh[idx % sh.length];
        const j = Math.round((rng() - 0.5) * 6);
        childStripes.push({ color, count: Math.max(2, st.count + j) });
      });
    } else if (strategy === 2) {
      // P2 structure, P1 colors, shuffled + jitter
      const sh = shuffled(p1.colors, rng);
      p2.stripes.forEach((st, idx) => {
        const color = sh[idx % sh.length];
        const j = Math.round((rng() - 0.5) * 6);
        childStripes.push({ color, count: Math.max(2, st.count + j) });
      });
    } else {
      // splice: random cut, P1 left, P2 right, mutated
      const cutP1 = Math.floor(rng() * p1.stripes.length);
      const cutP2 = Math.floor(rng() * p2.stripes.length);
      const left = p1.stripes.slice(0, cutP1 + 1);
      const right = p2.stripes.slice(cutP2);
      [...left, ...right].forEach((st) => {
        const color = rng() > 0.6 ? allColors[Math.floor(rng() * allColors.length)] : st.color;
        const j = Math.round((rng() - 0.5) * 4);
        childStripes.push({ color, count: Math.max(2, st.count + j) });
      });
    }

    // stack a mutate pass on ~half the litter for extra proportional variety
    if (rng() > 0.5) childStripes = applyMutations(childStripes, rng, allColors);

    if (childStripes.length >= 2) litter.push({ stripes: childStripes, seed, strategy });
  }
  return litter;
}

// ---------------------------------------------------------------------------
// TILEABILITY: nudge a pivot count so the expanded thread count is a multiple of
// the weave repeat (proportion-preserving; keeps the seam-loop guarantee).
// ---------------------------------------------------------------------------
function toThreadcount(stripes) {
  return stripes.map((s) => `${s.color}${s.isPivot ? '/' : ''}${s.count}`).join(' ');
}

export function makeTileable(stripes, repeat) {
  // mark symmetric pivots (first + last) as the app's breeding does
  const s = stripes.map((x) => ({ ...x }));
  s[0].isPivot = true;
  s[s.length - 1].isPivot = true;
  let sett = parseThreadcount(toThreadcount(s));
  let L = expandSett(sett).length;
  const r = L % repeat;
  if (r !== 0) {
    // bumping a pivot count by d changes expandedLength by exactly d
    s[0].count += (repeat - r) % repeat;
    sett = parseThreadcount(toThreadcount(s));
    L = expandSett(sett).length;
  }
  return { stripes: s, sett, expandedLength: L, threadcount: toThreadcount(s) };
}

// ---------------------------------------------------------------------------
// GENERATE COLLECTION -- run the real engine across curated parent pairs, filter
// to valid/tileable/in-range candidates, de-dup by structure, then greedily pick
// a maximally-diverse spread (structure x color). Fully deterministic.
// ---------------------------------------------------------------------------

// Parent setts spanning the color gamut AND different structural skeletons
// (broad blocks, fine pinstripe, off-center accent, high-contrast graphic).
const PARENTS = [
  { name: 'Cobalt Marigold', tc: 'SA/40 GD8 SA18 CR12 GD4 CR18 SA/40' }, // broad high-contrast blocks
  { name: 'Emerald Pinstripe', tc: 'IN/16 EM4 IN6 EM4 IN6 GD2 IN6 EM4 IN/16' }, // fine dense rhythm
  { name: 'Amethyst Off-Axis', tc: 'AM/34 CT8 AM8 TQ16 CT2 AM/18' }, // asymmetric / off-center
  { name: 'Bright Graphic', tc: 'MG/28 MA18 CB18 MA18 MG/28' }, // bold three-color graphic
  { name: 'Coral Teal', tc: 'CO/30 TQ12 IN8 TQ12 CO/30' }, // warm/cool jewel pair
  { name: 'Ruby Ink', tc: 'IN/24 RB14 IN8 GD4 IN8 RB14 IN/24' }, // dark ground, ruby blocks
  { name: 'Flax Neutral', tc: 'OT/28 ST10 OT6 CM10 BN2 CM10 OT6 ST10 OT/28' }, // muted anchor genes
  { name: 'Violet Lime', tc: 'VT/26 LM10 IN10 LM10 VT/26' }, // unexpected complementary
];

const PAIRS = [
  [0, 3], [1, 4], [2, 5], [3, 6], [4, 7], [0, 2], [5, 1], [7, 3], [6, 4],
];

function paletteHSL(code) {
  const c = PALETTE[code];
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: h * 360, s, l };
}

// mean saturation of the colors actually used, weighted by thread share
function settSaturation(stripes) {
  const total = stripes.reduce((a, s) => a + s.count, 0);
  let acc = 0;
  for (const st of stripes) acc += paletteHSL(st.color).s * (st.count / total);
  return acc;
}

// dominant hues present (for the spread metric)
function settHues(stripes) {
  return stripes.map((s) => paletteHSL(s.color).h);
}

function circHueDist(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function candidateColorVec(stripes) {
  // color "position": mean hue (circular) + mean saturation, for diversity spread
  const total = stripes.reduce((a, s) => a + s.count, 0);
  let x = 0, y = 0, sat = 0;
  for (const st of stripes) {
    const { h, s } = paletteHSL(st.color);
    const rad = (h * Math.PI) / 180;
    x += Math.cos(rad) * (st.count / total) * s;
    y += Math.sin(rad) * (st.count / total) * s;
    sat += s * (st.count / total);
  }
  return { hueAng: (Math.atan2(y, x) * 180) / Math.PI, sat, mag: Math.hypot(x, y) };
}

export function generateCollection({ masterSeed = 20260703, take = 9 } = {}) {
  const parents = PARENTS.map((p) => parseThreadcount(p.tc, p.name));
  const repeat = weaveRepeat(WEAVE_PATTERNS['twill-2-2']);

  // 1. build a large candidate pool from the real breed engine
  const pool = [];
  PAIRS.forEach(([a, b], pi) => {
    const litter = breedStripes(parents[a], parents[b], 8, masterSeed + pi * 104729);
    for (const child of litter) pool.push(child);
  });

  // 2. filter -> tileable, valid, in useful range, de-dup by structure
  const seen = new Set();
  const cands = [];
  for (const child of pool) {
    let t;
    try {
      t = makeTileable(child.stripes, repeat);
    } catch {
      continue;
    }
    const stripes = t.stripes;
    const colors = [...new Set(stripes.map((s) => s.color))].filter((c) => PALETTE[c]);
    if (colors.length !== new Set(stripes.map((s) => s.color)).size) continue; // unknown code
    if (colors.length < 2 || colors.length > 6) continue;
    if (stripes.length < 3 || stripes.length > 13) continue;
    if (t.expandedLength < 96 || t.expandedLength > 224) continue;
    // reject adjacent-identical-color runs collapsing the pattern
    let degenerate = false;
    for (let i = 0; i < stripes.length - 1; i++) if (stripes[i].color === stripes[i + 1].color) degenerate = true;
    if (degenerate) continue;

    const structSig = structureSignature(stripes);
    if (seen.has(structSig)) continue;
    seen.add(structSig);

    cands.push({
      stripes,
      threadcount: t.threadcount,
      expandedLength: t.expandedLength,
      colors,
      structSig,
      propSig: proportionSignature(stripes),
      sat: settSaturation(stripes),
      hues: settHues(stripes),
      cvec: candidateColorVec(stripes),
      seed: child.seed,
      strategy: child.strategy,
    });
  }

  // 3. greedy max-diversity selection (structure distance + color distance)
  if (cands.length === 0) return [];
  const structDist = (A, B) => {
    // proportion signature Levenshtein-ish: fraction of differing rounded ratios
    const pa = A.propSig.split(':').map(Number);
    const pb = B.propSig.split(':').map(Number);
    const n = Math.max(pa.length, pb.length);
    let diff = Math.abs(pa.length - pb.length) / n;
    for (let i = 0; i < Math.min(pa.length, pb.length); i++) diff += Math.abs(pa[i] - pb[i]);
    const lenDiff = Math.abs(A.expandedLength - B.expandedLength) / 224;
    return diff + lenDiff;
  };
  const colorDist = (A, B) => circHueDist(A.cvec.hueAng, B.cvec.hueAng) / 180 + Math.abs(A.sat - B.sat);
  const dist = (A, B) => structDist(A, B) * 1.0 + colorDist(A, B) * 1.2;

  // seed the pick with the most-saturated candidate (guarantees vivid presence)
  const picked = [];
  let start = 0;
  for (let i = 1; i < cands.length; i++) if (cands[i].sat > cands[start].sat) start = i;
  picked.push(cands[start]);
  const remaining = cands.filter((_, i) => i !== start);
  while (picked.length < take && remaining.length) {
    // pick the remaining candidate whose MIN distance to the picked set is largest
    let best = 0, bestScore = -1;
    for (let i = 0; i < remaining.length; i++) {
      let minD = Infinity;
      for (const p of picked) minD = Math.min(minD, dist(remaining[i], p));
      if (minD > bestScore) {
        bestScore = minD;
        best = i;
      }
    }
    picked.push(remaining[best]);
    remaining.splice(best, 1);
  }

  // 4. name + assign motion params (round-robin varied) + threadPx scale knob
  const MOTIONS = [
    { type: 'pan', speed: 1, direction: { dx: 1, dy: 1 }, intensity: 0 },
    { type: 'breathe', speed: 0, direction: { dx: 1, dy: 1 }, intensity: 28 },
    { type: 'drift', speed: 1, direction: { dx: 1, dy: -1 }, intensity: 22 },
    { type: 'pan', speed: 2, direction: { dx: 1, dy: -1 }, intensity: 0 },
    { type: 'drift', speed: 1, direction: { dx: -1, dy: 1 }, intensity: 30 },
    { type: 'breathe', speed: 0, direction: { dx: 1, dy: -1 }, intensity: 34 },
  ];
  const usedNames = new Set(['graphite', 'flax', 'mustard-mono']);
  return picked.map((c, idx) => {
    const threadPx = c.expandedLength <= 140 ? 4 : c.expandedLength <= 190 ? 3 : 2;
    const name = nameFor(c, usedNames);
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return {
      id,
      name,
      threadcount: c.threadcount,
      weave: 'twill-2-2',
      threadPx,
      motion: MOTIONS[idx % MOTIONS.length],
      generated: true,
      seed: c.seed,
      strategy: c.strategy,
      palette: c.colors,
      expandedLength: c.expandedLength,
      note: describe(c),
    };
  });
}

// ---- naming / describing generated setts (from dominant colors + structure) --
const COLOR_WORD = {
  IN: 'Ink', CH: 'Charcoal', SL: 'Slate', FO: 'Forest', TL: 'Teal', SG: 'Sage',
  OT: 'Oat', ST: 'Stone', CM: 'Camel', BN: 'Bone', IC: 'Ice', OX: 'Oxblood',
  RU: 'Rust', MU: 'Mustard', LV: 'Mauve', EM: 'Emerald', SA: 'Sapphire',
  RB: 'Ruby', AM: 'Amethyst', MG: 'Marigold', CO: 'Coral', MA: 'Magenta',
  CT: 'Chartreuse', TQ: 'Turquoise', CB: 'Cobalt', CR: 'Crimson', VT: 'Violet',
  LM: 'Lime', GD: 'Gold', TG: 'Tangerine', PK: 'Pink',
};

function dominantColors(stripes) {
  const tally = {};
  for (const s of stripes) tally[s.color] = (tally[s.color] || 0) + s.count;
  return Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([c]) => c);
}

function nameFor(c, used) {
  const dom = dominantColors(c.stripes);
  const w1 = COLOR_WORD[dom[0]] || dom[0];
  const w2 = COLOR_WORD[dom[1]] || dom[1] || '';
  let base = w2 ? `${w1} ${w2}` : w1;
  let name = base;
  let n = 2;
  while (used.has(name.toLowerCase())) name = `${base} ${n++}`;
  used.add(name.toLowerCase());
  return name;
}

function describe(c) {
  const dom = dominantColors(c.stripes).slice(0, 3).map((x) => COLOR_WORD[x] || x);
  const rhythm = c.stripes.length <= 4 ? 'broad graphic blocks' : c.stripes.length >= 8 ? 'fine multi-band rhythm' : 'mid-scale sett';
  const sat = c.sat > 0.45 ? 'vivid' : c.sat > 0.2 ? 'saturated' : 'muted';
  return `Bred (strategy ${c.strategy}): ${sat} ${dom.join('/')}, ${rhythm}.`;
}
