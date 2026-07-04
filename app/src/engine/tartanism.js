/*
 * curated-loops/tartanism.js
 *
 * The REAL Tartanism tartan-rendering logic, ported faithfully as a
 * standalone module for the animated 9:16 seamless-loop export.
 *
 * PROVENANCE / DECOUPLING
 * -----------------------
 *  - Ported from the Tartanism React app's own weave logic:
 *      src/core/sett.ts        (parseThreadcount / expandSett / getThreadAt)
 *      src/core/weaves.ts      (WEAVE_PATTERNS threading/tieUp/treadling, isWarpOnTop)
 *      src/utils/renderTartan.ts (the fast filled-rect renderer)
 *    This is the app's ACTUAL renderer (2/2-twill sett, real thread colors,
 *    guard lines), NOT the deliberately-plain per-pixel spike renderer.
 *  - DECOUPLED from TartanMilady: the seamless-loop *technique* (pan by exactly
 *    one full sett-repeat so frame[N] == frame[0]) is reimplemented fresh; no
 *    import of, dependency on, or brand link to TartanMilady.
 *
 * WHY THE LOOP IS SEAMLESS (fast-renderer version)
 * ------------------------------------------------
 *  A tartan is spatially PERIODIC with period = expandedThreads * threadPx in
 *  both axes. We render ONE period-sized "supertile" via filled rects + the
 *  real 2/2-twill intersection logic, then each frame BLITS that tile across
 *  the 1080x1920 frame at an integer pan offset (canvas translate/drawImage --
 *  GPU-friendly, no per-pixel loop). Panning by an integer number of full
 *  periods returns the pattern to itself, so frame[N] is bit-identical to
 *  frame[0]. Tile-seam continuity of the twill requires the expanded thread
 *  count to be a multiple of the weave repeat (4 for 2/2 twill) -- enforced by
 *  the integer-cycle precondition test.
 */

import { generateCollection } from './breeding.js';

// ============================================================================
// PALETTE  (getColor() equivalent: code -> rgb)
// David's directive #1: RANGE is the point. Muted anchors are kept, and a WIDE
// vivid gamut is added -- jewel tones, brights, high-contrast graphic accents --
// so the generative system can span from tonal-quiet to electric.
// ============================================================================
export const PALETTE = {
  // --- muted / tonal anchors (kept from the prior pass) ---
  IN: { r: 0x17, g: 0x18, b: 0x1c }, // ink (near-black)
  CH: { r: 0x2b, g: 0x2e, b: 0x33 }, // charcoal
  SL: { r: 0x47, g: 0x50, b: 0x5e }, // slate blue-grey
  FO: { r: 0x33, g: 0x40, b: 0x3a }, // forest
  TL: { r: 0x3a, g: 0x5a, b: 0x5f }, // muted teal
  SG: { r: 0x7e, g: 0x8a, b: 0x76 }, // sage
  OT: { r: 0xb7, g: 0xad, b: 0x98 }, // oatmeal
  ST: { r: 0xa8, g: 0xa1, b: 0x96 }, // stone
  CM: { r: 0xc8, g: 0xb9, b: 0xa0 }, // camel
  BN: { r: 0xe6, g: 0xe1, b: 0xd6 }, // bone (guard line)
  IC: { r: 0xd3, g: 0xd6, b: 0xd2 }, // ice grey (guard line)
  OX: { r: 0x6d, g: 0x2f, b: 0x2f }, // oxblood accent
  RU: { r: 0x9c, g: 0x5f, b: 0x3f }, // rust accent
  MU: { r: 0xb0, g: 0x8a, b: 0x3c }, // muted mustard accent
  LV: { r: 0x6a, g: 0x60, b: 0x70 }, // muted mauve
  // --- vivid jewel tones + brights (the range David asked for) ---
  EM: { r: 0x0f, g: 0x9d, b: 0x63 }, // emerald
  SA: { r: 0x21, g: 0x48, b: 0xc0 }, // sapphire / electric blue
  RB: { r: 0xc8, g: 0x1d, b: 0x5a }, // ruby
  AM: { r: 0x7c, g: 0x3a, b: 0xed }, // amethyst
  MG: { r: 0xf5, g: 0xa6, b: 0x23 }, // marigold
  CO: { r: 0xff, g: 0x5a, b: 0x4d }, // coral
  MA: { r: 0xd6, g: 0x24, b: 0x9f }, // magenta
  CT: { r: 0xa8, g: 0xc4, b: 0x00 }, // chartreuse
  TQ: { r: 0x10, g: 0xb6, b: 0xc6 }, // turquoise
  CB: { r: 0x1f, g: 0x3f, b: 0xb0 }, // cobalt
  CR: { r: 0xd1, g: 0x1a, b: 0x2a }, // crimson
  VT: { r: 0x6d, g: 0x3b, b: 0xd1 }, // violet
  LM: { r: 0x6f, g: 0xce, b: 0x1f }, // lime
  GD: { r: 0xe0, g: 0xb2, b: 0x1e }, // gold
  TG: { r: 0xf0, g: 0x78, b: 0x1e }, // tangerine
  PK: { r: 0xff, g: 0x3d, b: 0x81 }, // hot pink
};

export function getColor(code) {
  return PALETTE[code];
}

// ============================================================================
// SETT / THREADCOUNT  (ported from src/core/sett.ts)
// ============================================================================
export function parseThreadcount(threadcount, name) {
  const normalized = threadcount.trim();
  const isAsymmetric = normalized.startsWith('...');
  const cleaned = normalized.replace(/\.\.\./g, '').trim();

  const stripeRegex = /([A-Z]+)\/?(\d+)/gi;
  const stripes = [];
  let match;
  while ((match = stripeRegex.exec(cleaned)) !== null) {
    stripes.push({
      color: match[1].toUpperCase(),
      count: parseInt(match[2], 10),
      isPivot: match[0].includes('/'),
    });
  }
  if (stripes.length === 0) throw new Error(`Invalid threadcount: ${threadcount}`);

  const totalThreads = stripes.reduce((s, st) => s + st.count, 0);
  const colors = [...new Set(stripes.map((s) => s.color))];
  return {
    name,
    threadcount: normalized,
    stripes,
    symmetry: isAsymmetric ? 'asymmetric' : 'symmetric',
    totalThreads,
    colors,
  };
}

export function expandSett(sett) {
  const threads = [];
  if (sett.symmetry === 'symmetric') {
    // forward pass
    for (const stripe of sett.stripes)
      for (let i = 0; i < stripe.count; i++) threads.push(stripe.color);
    // mirror pass (exclude pivots so the reflection axes are not doubled)
    for (let i = sett.stripes.length - 1; i >= 0; i--) {
      const stripe = sett.stripes[i];
      if (stripe.isPivot) continue;
      for (let j = 0; j < stripe.count; j++) threads.push(stripe.color);
    }
  } else {
    for (const stripe of sett.stripes)
      for (let i = 0; i < stripe.count; i++) threads.push(stripe.color);
  }
  return { threads, length: threads.length };
}

export function getThreadAt(expanded, index) {
  const i = ((index % expanded.length) + expanded.length) % expanded.length;
  return expanded.threads[i];
}

// ============================================================================
// WEAVE  (ported from src/core/weaves.ts)
// ============================================================================
export const WEAVE_PATTERNS = {
  plain: {
    type: 'plain',
    threading: [1, 2],
    tieUp: [
      [true, false],
      [false, true],
    ],
    treadling: [1, 2],
  },
  'twill-2-2': {
    type: 'twill-2-2',
    threading: [1, 2, 3, 4],
    tieUp: [
      [true, true, false, false],
      [false, true, true, false],
      [false, false, true, true],
      [true, false, false, true],
    ],
    treadling: [1, 2, 3, 4],
  },
};

export function isWarpOnTop(weave, warpIndex, weftIndex) {
  const shaftIndex = weave.threading[warpIndex % weave.threading.length] - 1;
  const treadleIndex = weave.treadling[weftIndex % weave.treadling.length] - 1;
  return weave.tieUp[treadleIndex][shaftIndex];
}

// Weave lattice repeat (threads). Tile-seam continuity requires the expanded
// thread count to be a multiple of this.
export function weaveRepeat(weave) {
  const a = weave.threading.length;
  const b = weave.treadling.length;
  const gcd = (x, y) => (y ? gcd(y, x % y) : x);
  return (a * b) / gcd(a, b);
}

// ============================================================================
// MOTION as a TUNABLE PARAMETER (David's directive #3)
// motion = { type: 'pan'|'breathe'|'drift', speed, direction:{dx,dy}, intensity }
//   pan     : diagonal integer pan of `speed` full sett-repeats over the loop.
//   breathe : sinusoidal drift of amplitude `intensity` px, returns to 0 at wrap.
//   drift   : independent axes -- pan on X (`speed` repeats), sinusoidal breathe
//             on Y (`intensity`). Both axes return to 0 at the wrap.
// ALL three preserve the exact-loop / integer-cycle seam guarantee.
// ============================================================================
const TOTAL_FRAMES = 120; // 4s @ 30fps
const FPS = 30;

// normalize a motion spec (object; legacy string 'pan'/'breathe' also accepted).
export function normalizeMotion(m, legacy = {}) {
  if (typeof m === 'string') {
    if (m === 'breathe') return { type: 'breathe', speed: 0, direction: { dx: 1, dy: 1 }, intensity: legacy.driftPx || 26 };
    return { type: 'pan', speed: legacy.settRepeatsPerLoop || 1, direction: { dx: 1, dy: 1 }, intensity: 0 };
  }
  return {
    type: m.type,
    speed: m.speed || 0,
    direction: m.direction || { dx: 1, dy: 1 },
    intensity: m.intensity || 0,
  };
}

// ---- 3 KEPT ANCHORS (continuity) -- Graphite, Flax, Mustard Mono ----
export const ANCHOR_SETTS = [
  {
    id: 'graphite',
    name: 'Graphite',
    threadcount: 'IN/24 CH12 IN8 CH12 BN2 CH12 IN8 CH12 IN/24',
    weave: 'twill-2-2',
    threadPx: 3,
    motion: { type: 'pan', speed: 1, direction: { dx: 1, dy: 1 }, intensity: 0 },
    anchor: true,
    note: 'ANCHOR. Tonal charcoal-on-ink; one bone guard line. Quietest of the set.',
  },
  {
    id: 'flax',
    name: 'Flax',
    threadcount: 'OT/28 ST10 OT6 CM10 BN2 CM10 OT6 ST10 OT/28',
    weave: 'twill-2-2',
    threadPx: 3,
    motion: { type: 'breathe', speed: 0, direction: { dx: 1, dy: 1 }, intensity: 26 },
    anchor: true,
    note: 'ANCHOR. Undyed-wool neutrals; JJJJound linen mood. Breathing drift.',
  },
  {
    id: 'mustard-mono',
    name: 'Mustard Mono',
    threadcount: 'IN/30 CH10 IN8 MU6 IC2 MU6 IN8 CH10 IN/30',
    weave: 'twill-2-2',
    threadPx: 3,
    motion: { type: 'pan', speed: 1, direction: { dx: 1, dy: -1 }, intensity: 0 },
    anchor: true,
    note: 'ANCHOR. Dark ground, one warm mustard accent. Confident restraint.',
  },
];

// ---- The parametric range: 3 anchors + ~9 engine-generated setts ----
// The generated setts come from the REAL breed/mutate engine (breeding.js),
// deterministically. This is what makes the collection a generative SYSTEM's
// range (varied proportions/asymmetry/scale x broad color) rather than a family
// of palette-swaps of one skeleton.
export const GENERATED_SETTS = generateCollection({ masterSeed: 20260703, take: 9 });

export const SETTS = [...ANCHOR_SETTS, ...GENERATED_SETTS];

// ============================================================================
// RESOLVE a sett spec into a full render cfg.
// ============================================================================
export function resolveSett(spec) {
  const parsed = parseThreadcount(spec.threadcount, spec.name);
  const expanded = expandSett(parsed);
  const weave = WEAVE_PATTERNS[spec.weave];
  const motion = normalizeMotion(spec.motion, spec);
  return {
    id: spec.id,
    name: spec.name,
    seed: spec.id, // rendering is fully deterministic; seed carried for identity
    width: 1080,
    height: 1920,
    threadPx: spec.threadPx,
    totalFrames: TOTAL_FRAMES,
    fps: FPS,
    motion, // normalized parameter object {type,speed,direction,intensity}
    // backward-compat scalars (the integer-cycle test + legacy callers read these)
    settRepeatsPerLoop: motion.type === 'breathe' ? 0 : motion.speed,
    driftPx: motion.intensity,
    sheenCycles: spec.sheenCycles || 0, // integer cycles if ever enabled
    weave,
    weaveRepeat: weaveRepeat(weave),
    expanded,
    anchor: !!spec.anchor,
    generated: !!spec.generated,
    note: spec.note,
  };
}

export function settPixels(cfg) {
  return cfg.expanded.length * cfg.threadPx;
}

// Per-axis integer pan offsets (px) at a given frame, and their wrapped tile
// offsets. This is the math the integer-cycle precondition test asserts against.
// Returns per-axis {offsetX,offsetY} PLUS the legacy diagonal scalars
// {raw,rawFloat,offset} (equal to the X axis for pan/breathe) for back-compat.
export function panOffsetForFrame(cfg, frame) {
  const period = settPixels(cfg);
  const TAU = Math.PI * 2;
  const m = cfg.motion;
  const t = frame / cfg.totalFrames;
  const wrap = (v) => ((Math.round(v) % period) + period) % period;

  let rawFloatX = 0;
  let rawFloatY = 0;
  if (m.type === 'pan') {
    // exactly `speed` full periods over the loop, along the direction vector
    rawFloatX = t * m.speed * period * m.direction.dx;
    rawFloatY = t * m.speed * period * m.direction.dy;
  } else if (m.type === 'breathe') {
    const s = m.intensity * Math.sin(TAU * t);
    rawFloatX = s * m.direction.dx;
    rawFloatY = s * m.direction.dy;
  } else if (m.type === 'drift') {
    // independent axes: integer pan on X, sinusoidal breathe on Y
    rawFloatX = t * m.speed * period * m.direction.dx;
    rawFloatY = m.intensity * Math.sin(TAU * t) * m.direction.dy;
  }

  // legacy diagonal scalar: pan magnitude, or the breathe sinusoid.
  const rawFloat =
    m.type === 'breathe' ? m.intensity * Math.sin(TAU * t) : t * m.speed * period;
  const raw = Math.round(rawFloat);
  const offset = ((raw % period) + period) % period;

  return {
    period,
    offsetX: wrap(rawFloatX),
    offsetY: wrap(rawFloatY),
    rawX: Math.round(rawFloatX),
    rawY: Math.round(rawFloatY),
    rawFloatX,
    rawFloatY,
    raw,
    rawFloat,
    offset,
  };
}

// ============================================================================
// RENDER  (fast filled-rect supertile + blit -- ported render approach)
// ============================================================================

// Render ONE period-sized tile of the woven tartan using filled rects and the
// real 2/2-twill intersection logic. Deterministic. `mkCanvas(w,h)` lets the
// caller supply a canvas factory (browser: document.createElement('canvas')).
export function renderSupertile(mkCanvas, cfg) {
  const L = cfg.expanded.length;
  const period = L * cfg.threadPx;
  const tile = mkCanvas(period, period);
  const tctx = tile.getContext('2d');
  const s = cfg.threadPx;
  for (let y = 0; y < L; y++) {
    const weftCode = cfg.expanded.threads[y];
    for (let x = 0; x < L; x++) {
      const warpCode = cfg.expanded.threads[x];
      const code = isWarpOnTop(cfg.weave, x, y) ? warpCode : weftCode;
      const c = PALETTE[code];
      tctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
      tctx.fillRect(x * s, y * s, s, s);
    }
  }
  return tile;
}

// Draw one animation frame by blitting the (cached) supertile across the frame
// at an integer diagonal pan offset. frame==totalFrames reproduces frame 0.
export function drawTartanFrame(ctx, cfg, frame, supertile, mkCanvas) {
  const tile = supertile || renderSupertile(mkCanvas, cfg);
  const { period, offsetX, offsetY } = panOffsetForFrame(cfg, frame);
  const { width, height } = cfg;
  // world pixel p shows tile pixel (p + pan); translate tile left by per-axis offset.
  const startX = -offsetX;
  const startY = -offsetY;
  for (let ty = startY; ty < height; ty += period) {
    for (let tx = startX; tx < width; tx += period) {
      ctx.drawImage(tile, tx, ty);
    }
  }
  return { width, height, totalFrames: cfg.totalFrames };
}

// ============================================================================
// Browser global (index.html loads this as a module and reads window.Tartanism)
// ============================================================================
if (typeof window !== 'undefined') {
  window.Tartanism = {
    PALETTE, SETTS, ANCHOR_SETTS, GENERATED_SETTS, parseThreadcount, expandSett, getThreadAt,
    WEAVE_PATTERNS, isWarpOnTop, weaveRepeat, resolveSett, settPixels, normalizeMotion,
    panOffsetForFrame, renderSupertile, drawTartanFrame,
    mkCanvas: (w, h) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h; return c;
    },
  };
}
