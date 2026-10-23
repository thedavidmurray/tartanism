/*
 * ui/share-frame.js — the SIGNATURE SHARE ARTIFACT (T11).
 *
 * One fixed-aspect card that reads as a human story, NOT a 9-cell swatch grid:
 *
 *     WILD ANCESTOR   →   BRED · GEN N  (crowned)
 *     ────────────────────────────────
 *              [ Tartanism · tap to breed ]     ← always-on growth watermark
 *
 * Split into a PURE spec (buildShareSpec, DOM-free, unit-testable) and a canvas
 * COMPOSITOR (composeShareFrame) that reuses the real engine renderer
 * (resolveSett → renderSupertile), plus a PNG export (exportSharePng → toBlob).
 *
 * The before/after carries REAL genomes: the `before` is the litter's wild
 * ancestor, the `after` is what the player bred from it. The watermark is a
 * free-growth feature (always on here); Pro-to-remove is DEFERRED (T12/T19).
 * The looping-MP4 / on-device WebCodecs export is a SEPARATE, David-gated task
 * (T13) — this module ships the still-image half only.
 *
 * Zero deps; the compositor takes a canvas factory so it runs in the browser and
 * under a fake-canvas test harness identically.
 */
import { resolveSett, renderSupertile } from '../engine/tartanism.js';

export const SHARE_W = 1080;
export const SHARE_H = 1350;               // 4:5 portrait — social + App Store hero
export const SHARE_SPEC_VERSION = 1;

// which render fields the compositor needs off a genome individual.
function genomeFace(ind) {
  return {
    id: ind.id,
    threadcount: ind.threadcount,
    weave: ind.weave || 'twill-2-2',
    threadPx: ind.threadPx || 3,
    motion: ind.motion || { type: 'pan', speed: 1, direction: { dx: 1, dy: 1 }, intensity: 0 },
    gen: ind.gen || 0,
  };
}

// ---------------------------------------------------------------------------
// PURE SPEC — the semantic content of the card. Deterministic given genomes.
// ---------------------------------------------------------------------------
export function buildShareSpec({ ancestor, result, gens, link, wordmark = 'Tartanism', name = null } = {}) {
  if (!ancestor || !ancestor.threadcount) throw new Error('buildShareSpec: ancestor genome required');
  if (!result || !result.threadcount) throw new Error('buildShareSpec: result genome required');
  const N = (gens !== undefined ? gens : (result.gen || 0)) | 0;
  return {
    v: SHARE_SPEC_VERSION,
    width: SHARE_W,
    height: SHARE_H,
    gens: N,
    title: N > 0 ? `wild ancestor → bred in ${N} gen${N === 1 ? '' : 's'}` : 'a wild sett',
    name: name || result.name || null,
    before: { role: 'ancestor', label: 'WILD ANCESTOR', crown: false, genome: genomeFace(ancestor) },
    after: { role: 'result', label: N > 0 ? `BRED · GEN ${N}` : 'WILD · GEN 0', crown: true, genome: genomeFace(result) },
    watermark: {
      present: true,
      wordmark,
      // short link / App-Clip URL placeholder — encodes the breedable litter (T12
      // hardens this into a real App-Clip end-card). Always present on free exports.
      link: link || 'https://tartanism.app',
      tappable: true,
    },
  };
}

// ---------------------------------------------------------------------------
// COMPOSITOR — draws the spec onto a fixed-dimension canvas via the real engine.
// mkCanvas(w,h) is the canvas factory (browser: document.createElement('canvas')).
// ---------------------------------------------------------------------------
const INK = '#14151a', PANEL_BG = '#1c1e24', HAIR = '#2b2e35';
const TEXT = '#e6e1d6', DIM = '#8a8f99', GOLD = '#e0b21e';

// tile a genome's woven supertile to fill a rect (clipped, downscaled to read).
function drawSettInto(ctx, mkCanvas, genome, x, y, w, h) {
  const cfg = resolveSett({ ...genome, name: genome.id, id: genome.id });
  const tile = renderSupertile(mkCanvas, cfg);
  ctx.save();
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, 20); else ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  const reps = 2.2;                                   // sett repeats across the panel
  const scale = Math.max(1, (Math.min(w, h) / reps) / tile.width);
  const pw = tile.width * scale, ph = tile.height * scale;
  for (let ty = y; ty < y + h; ty += ph)
    for (let tx = x; tx < x + w; tx += pw)
      ctx.drawImage(tile, tx, ty, pw, ph);
  ctx.restore();
  // panel hairline
  ctx.save();
  ctx.strokeStyle = HAIR; ctx.lineWidth = 2;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x + 1, y + 1, w - 2, h - 2, 20); else ctx.rect(x, y, w, h);
  ctx.stroke();
  ctx.restore();
}

// a compact vector crown (no emoji/font dependency), gold, centered at (cx, top).
function drawCrown(ctx, cx, top, s) {
  ctx.save();
  ctx.fillStyle = GOLD;
  ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, s * 0.05);
  const w = s, h = s * 0.72, x = cx - w / 2, y = top;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + h * 0.28);
  ctx.lineTo(x + w * 0.25, y + h * 0.62);
  ctx.lineTo(x + w * 0.5, y);
  ctx.lineTo(x + w * 0.75, y + h * 0.62);
  ctx.lineTo(x + w, y + h * 0.28);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // base band
  ctx.fillStyle = GOLD;
  ctx.fillRect(x, y + h, w, h * 0.16);
  ctx.restore();
}

export function composeShareFrame(mkCanvas, spec) {
  const canvas = mkCanvas(spec.width, spec.height);
  canvas.width = spec.width; canvas.height = spec.height;   // FIXED dimensions
  const ctx = canvas.getContext('2d');

  // background
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, spec.width, spec.height);

  const P = 56;
  // ---- title ----
  ctx.fillStyle = TEXT;
  ctx.textBaseline = 'alphabetic';
  ctx.font = '600 46px -apple-system, "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(spec.title, P, 96);

  // ---- name (if kept + named) ----
  if (spec.name) {
    ctx.fillStyle = GOLD;
    ctx.font = '500 38px -apple-system, "Helvetica Neue", Arial, sans-serif';
    ctx.fillText('"'+ spec.name +'"', P, 140);
  }

  // ---- two panels side-by-side with an arrow between ----
  const gap = 72;
  const panelY = spec.name ? 190 : 150;
  const panelH = spec.name ? 820 : 860;
  const panelW = (spec.width - P * 2 - gap) / 2;
  const leftX = P, rightX = P + panelW + gap;

  ctx.fillStyle = PANEL_BG;
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(leftX, panelY, panelW, panelH, 20); ctx.fill(); }
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(rightX, panelY, panelW, panelH, 20); ctx.fill(); }

  drawSettInto(ctx, mkCanvas, spec.before.genome, leftX, panelY, panelW, panelH);
  drawSettInto(ctx, mkCanvas, spec.after.genome, rightX, panelY, panelW, panelH);

  // arrow in the gap
  const ay = panelY + panelH / 2, ax = leftX + panelW + gap / 2;
  ctx.save();
  ctx.strokeStyle = TEXT; ctx.fillStyle = TEXT; ctx.lineWidth = 8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(ax - 20, ay); ctx.lineTo(ax + 14, ay); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ax + 4, ay - 14); ctx.lineTo(ax + 20, ay); ctx.lineTo(ax + 4, ay + 14); ctx.closePath(); ctx.fill();
  ctx.restore();

  // crown on the AFTER panel
  if (spec.after.crown) drawCrown(ctx, rightX + panelW - 46, panelY + 22, 56);

  // ---- panel labels ----
  ctx.font = '600 30px -apple-system, "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = DIM;
  ctx.fillText(spec.before.label, leftX + panelW / 2, panelY + panelH + 52);
  ctx.fillStyle = GOLD;
  ctx.fillText(spec.after.label, rightX + panelW / 2, panelY + panelH + 52);

  // ---- watermark / end-card band (always on: free-growth feature) ----
  const wm = spec.watermark;
  const bandY = spec.height - 112;
  ctx.save();
  ctx.fillStyle = PANEL_BG;
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(P, bandY, spec.width - P * 2, 76, 38); ctx.fill(); }
  else ctx.fillRect(P, bandY, spec.width - P * 2, 76);
  // wordmark
  ctx.fillStyle = TEXT;
  ctx.textAlign = 'left';
  ctx.font = '700 34px -apple-system, "Helvetica Neue", Arial, sans-serif';
  ctx.fillText(wm.wordmark, P + 40, bandY + 50);
  // tappable link chip
  ctx.fillStyle = DIM;
  ctx.textAlign = 'right';
  ctx.font = '500 26px -apple-system, "Helvetica Neue", Arial, sans-serif';
  ctx.fillText('tap to breed →', spec.width - P - 40, bandY + 49);
  ctx.restore();

  // record the semantic content on the canvas for the export path / debugging.
  canvas.__shareSpec = spec;
  return canvas;
}

// ---------------------------------------------------------------------------
// EXPORT — canvas.toBlob PNG (saveable in-browser). Promise-wrapped.
// ---------------------------------------------------------------------------
export function exportSharePng(canvas) {
  return new Promise((resolve, reject) => {
    if (!canvas || typeof canvas.toBlob !== 'function') {
      reject(new Error('exportSharePng: canvas.toBlob unavailable'));
      return;
    }
    canvas.toBlob((blob) => {
      if (blob) resolve(blob); else reject(new Error('exportSharePng: toBlob returned null'));
    }, 'image/png');
  });
}

// convenience: spec → canvas → PNG blob in one call.
export async function renderSharePng(mkCanvas, opts) {
  const spec = buildShareSpec(opts);
  const canvas = composeShareFrame(mkCanvas, spec);
  const blob = await exportSharePng(canvas);
  return { spec, canvas, blob };
}
