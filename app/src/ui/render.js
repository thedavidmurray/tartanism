/*
 * ui/render.js — canvas rendering for a sett thumbnail, using the REAL engine
 * renderer (resolveSett → renderSupertile). One woven period tile, downscaled so
 * the whole sett reads in a thumbnail. Extracted from the prototype app.js.
 */
import { resolveSett, renderSupertile } from '../engine/tartanism.js';

const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const tileCache = new Map(); // id -> rendered period tile

export function renderInto(canvas, ind, cssW, cssH) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  let tile = tileCache.get(ind.id);
  if (!tile) {
    const cfg = resolveSett({ ...ind, name: ind.id });
    tile = renderSupertile(mkCanvas, cfg);
    tileCache.set(ind.id, tile);
  }
  const reps = 1.6;
  const scale = (Math.min(canvas.width, canvas.height) / reps) / tile.width;
  const pw = tile.width * scale, ph = tile.height * scale;
  for (let y = 0; y < canvas.height; y += ph)
    for (let x = 0; x < canvas.width; x += pw)
      ctx.drawImage(tile, x, y, pw, ph);
}

export function clearTileCache() { tileCache.clear(); }
