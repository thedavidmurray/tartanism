/**
 * Tartan System - SVG Export Module
 * Generate vector SVG output at arbitrary resolution
 */

import { parseThreadcount, expandSett } from '../core/sett';
import { getColor } from '../core/colors';
import { WEAVE_PATTERNS, isWarpOnTop } from '../core/weaves';
import type { WeaveType, SVGExport } from '../core/types';

// ---------------------------------------------------------------------------
// SVG RENDERING
// ---------------------------------------------------------------------------

interface SVGRenderOptions {
  /** Output width (pixels by default) */
  width: number;
  /** Output height */
  height?: number;
  /** Number of sett repeats to tile */
  repeats?: number;
  /** Weave pattern */
  weave?: WeaveType;
  /** Unit type for viewBox */
  unit?: 'px' | 'mm' | 'in';
  /** Whether to generate pixel-perfect thread grid or batch runs */
  mode?: 'threads' | 'runs';
}

/**
 * Generate SVG from threadcount with proper weave simulation.
 * 
 * Two modes:
 * 1. "runs" (default) – merges consecutive same-color horizontal runs to
 *    minimize SVG output size. Good for patterns up to hundreds of threads.
 * 2. "threads" – one rect per intersection. True pixel-accurate but produces
 *    very large files for setts with >200 threads. Use only for small setts.
 */
export function renderSVG(
  threadcount: string,
  options: SVGRenderOptions = { width: 800 }
): SVGExport {
  const {
    width,
    height = width,
    repeats = 2,
    weave = 'twill-2-2',
    unit = 'px',
    mode = 'runs',
  } = options;

  const parsed = parseThreadcount(threadcount);
  if (!parsed || parsed.stripes.length === 0) {
    return { content: '<svg/>', width: 0, height: 0, unit };
  }

  const expanded = expandSett(parsed);
  if (expanded.length === 0) {
    return { content: '<svg/>', width: 0, height: 0, unit };
  }

  const weavePattern = WEAVE_PATTERNS[weave];
  const tileW = width / repeats;
  const tileH = height / repeats;
  const threadSizeX = tileW / expanded.length;
  const threadSizeY = tileH / expanded.length;

  const rects: string[] = [];

  if (mode === 'threads') {
    // One rect per intersection
    for (let tileY = 0; tileY < repeats; tileY++) {
      for (let tileX = 0; tileX < repeats; tileX++) {
        const offsetX = tileX * tileW;
        const offsetY = tileY * tileH;
        for (let y = 0; y < expanded.length; y++) {
          for (let x = 0; x < expanded.length; x++) {
            const warpCode = expanded.threads[x % expanded.length];
            const weftCode = expanded.threads[y % expanded.length];
            const warp = getColor(warpCode);
            const weft = getColor(weftCode);
            if (warp && weft) {
              const warpOnTop = isWarpOnTop(weavePattern, x, y);
              const c = warpOnTop ? warp : weft;
              rects.push(
                `<rect x="${px(offsetX + x * threadSizeX)}" y="${px(offsetY + y * threadSizeY)}"` +
                ` width="${px(threadSizeX)}" height="${px(threadSizeY)}"` +
                ` fill="rgb(${c.rgb.r},${c.rgb.g},${c.rgb.b})"/>`
              );
            }
          }
        }
      }
    }
  } else {
    // Runs mode: merge consecutive same-color horizontal threads
    for (let tileY = 0; tileY < repeats; tileY++) {
      for (let tileX = 0; tileX < repeats; tileX++) {
        const offsetX = tileX * tileW;
        const offsetY = tileY * tileH;
        for (let y = 0; y < expanded.length; y++) {
          let x = 0;
          while (x < expanded.length) {
            const warpStartCode = expanded.threads[x % expanded.length];
            const weftCode = expanded.threads[y % expanded.length];
            const weft = getColor(weftCode);
            let runLen = 1;

            // Extend run while same color and same weave result
            while (x + runLen < expanded.length) {
              const nextWarpCode = expanded.threads[(x + runLen) % expanded.length];
              const warpOnTop = isWarpOnTop(weavePattern, x, y);
              const weaveOnTop = isWarpOnTop(weavePattern, x + runLen, y);
              if (nextWarpCode === warpStartCode && weaveOnTop === warpOnTop) {
                runLen++;
              } else {
                break;
              }
            }

            const startX = x;
            let width;
            if (runLen >= expanded.length - x) {
              // Extend to full width with wrapping
              width = tileW;
            } else {
              width = runLen * threadSizeX;
            }

            const visibleWarpCode = expanded.threads[startX % expanded.length];
            const warp = getColor(visibleWarpCode);
            if (warp && weft) {
              const warpOnTop = isWarpOnTop(weavePattern, startX, y);
              const c = warpOnTop ? warp : weft;
              rects.push(
                `<rect x="${px(offsetX + startX * threadSizeX)}" y="${px(offsetY + y * threadSizeY)}"` +
                ` width="${px(Math.min(width, tileW + offsetX - offsetX - startX * threadSizeX))}"` +
                ` height="${px(threadSizeY)}"` +
                ` fill="rgb(${c.rgb.r},${c.rgb.g},${c.rgb.b})"/>`
              );
            }

            x += Math.max(1, Number.isFinite(runLen) ? runLen : 1);
          }
        }
      }
    }
  }

  const wrapped = wrapSVG(rects.join('\n'), width, height, unit);

  return wrapped;
}

/**
 * Simple thread-accurate SVG (no runs merging, one rect per cell).
 * Best for small setts (<100 threads) where file size is manageable.
 */
export function renderSVGSimple(
  threadcount: string,
  size: number = 600,
  weaveType: WeaveType = 'twill-2-2',
  repeats: number = 1
): SVGExport {
  const parsed = parseThreadcount(threadcount);
  if (!parsed) {
    return { content: '<svg/>', width: 0, height: 0, unit: 'px' };
  }

  const expanded = expandSett(parsed);
  if (expanded.length === 0) {
    return { content: '<svg/>', width: 0, height: 0, unit: 'px' };
  }

  const weave = WEAVE_PATTERNS[weaveType];
  const cellWidth = size / (repeats / repeats) / expanded.length;

  let svg = '';

  for (let tileY = 0; tileY < repeats; tileY++) {
    for (let tileX = 0; tileX < repeats; tileX++) {
      const offsetX = tileX * size / repeats;
      const offsetY = tileY * size / repeats;
      for (let y = 0; y < expanded.length; y++) {
        for (let x = 0; x < expanded.length; x++) {
          const warpCode = expanded.threads[x];
          const weftCode = expanded.threads[y];
          const warp = getColor(warpCode);
          const weftc = getColor(weftCode);
          if (warp && weftc) {
            const warpOnTop = isWarpOnTop(weave, x, y);
            const c = warpOnTop ? warp : weftc;
            svg += `<rect x="${(offsetX + x * cellWidth).toFixed(2)}" y="${(offsetY + y * cellWidth).toFixed(2)}" width="${cellWidth.toFixed(2)}" height="${cellWidth.toFixed(2)}" fill="rgb(${c.rgb.r},${c.rgb.g},${c.rgb.b})"/>`;
          }
        }
      }
    }
  }

  return wrapSVG(svg, size, size, 'px');
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function px(val: number): string {
  return Number.isInteger(val) ? String(val) : val.toFixed(1);
}

function wrapSVG(inner: string, w: number, h: number, unit: string): SVGExport {
  const content = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    inner,
    `</svg>`,
  ].join('\n');

  return { content, width: w, height: h, unit: unit as 'px' | 'mm' | 'in' };
}

/**
 * Download an SVG file in the browser
 */
export function downloadSVG(
  content: string,
  filename: string
): void {
  const blob = new Blob([content], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.svg') ? filename : `${filename}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generate downloadable SVG from threadcount with sensible defaults.
 */
export function generateAndDownloadSVG(
  threadcount: string,
  tartanName?: string,
  size: number = 800,
  weave: WeaveType = 'twill-2-2',
  repeats: number = 3
): void {
  const result = renderSVGSimple(threadcount, size, weave, repeats);
  const name = tartanName 
    ? tartanName.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-')
    : 'tartan';
  downloadSVG(result.content, `${name.toLowerCase()}`);
}

/**
 * Generate a downloadable SVG pattern fill
 * (one sett repeat that can be tiled infinitely)
 */
export function generateSVGPattern(
  threadcount: string,
  weave: WeaveType = 'twill-2-2'
): SVGExport {
  const parsed = parseThreadcount(threadcount);
  if (!parsed) {
    return { content: '<svg/>', width: 0, height: 0, unit: 'px' };
  }

  const expanded = expandSett(parsed);
  if (expanded.length === 0) {
    return { content: '<svg/>', width: 0, height: 0, unit: 'px' };
  }

  const wp = WEAVE_PATTERNS[weave];
  let svg = '';

  // One sett repeat (no tiling)
  for (let y = 0; y < expanded.length; y++) {
    for (let x = 0; x < expanded.length; x++) {
      const warpCode = expanded.threads[x];
      const weftCode = expanded.threads[y];
      const warp = getColor(warpCode);
      const weftc = getColor(weftCode);
      if (warp && weftc) {
        const warpOnTop = isWarpOnTop(wp, x, y);
        const c = warpOnTop ? warp : weftc;
        svg += `<rect x="${x}" y="${y}" width="1" height="1" fill="rgb(${c.rgb.r},${c.rgb.g},${c.rgb.b})"/>`;
      }
    }
  }

  return wrapSVG(
    svg, 
    expanded.length, 
    expanded.length, 
    'px'
  );
}
