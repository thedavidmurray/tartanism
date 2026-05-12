/**
 * Shared tartan canvas renderer.
 * Extracted so LibraryPage, PatternDetail, GeneratePage, etc. can all use it.
 */

import { getColor } from '../core/colors';
import { parseThreadcount, expandSett, getThreadAt } from '../core/sett';
import { WEAVE_PATTERNS, isWarpOnTop } from '../core/weaves';
import type { WeaveType } from '../core/types';

export function renderTartanToCanvas(
  canvas: HTMLCanvasElement,
  threadcount: string,
  size: number = 200,
  weaveType: WeaveType = 'twill-2-2',
  repeats: number = 1
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = size;
  canvas.height = size;

  try {
    const parsed = parseThreadcount(threadcount);
    if (!parsed || parsed.stripes.length === 0) {
      ctx.fillStyle = '#e8e4df';
      ctx.fillRect(0, 0, size, size);
      return;
    }

    const expanded = expandSett(parsed);
    if (expanded.length === 0) return;

    const tileSize = size / repeats;
    const scale = tileSize / expanded.length;
    const weave = WEAVE_PATTERNS[weaveType];

    for (let ty = 0; ty < repeats; ty++) {
      for (let tx = 0; tx < repeats; tx++) {
        const offsetX = tx * tileSize;
        const offsetY = ty * tileSize;

        for (let y = 0; y < expanded.length; y++) {
          for (let x = 0; x < expanded.length; x++) {
            const warpCode = getThreadAt(expanded, x);
            const weftCode = getThreadAt(expanded, y);
            const warpColor = getColor(warpCode);
            const weftColor = getColor(weftCode);

            if (warpColor && weftColor) {
              const warpOnTop = isWarpOnTop(weave, x, y);
              const c = warpOnTop ? warpColor : weftColor;
              ctx.fillStyle = `rgb(${c.rgb.r},${c.rgb.g},${c.rgb.b})`;
              ctx.fillRect(
                offsetX + x * scale,
                offsetY + y * scale,
                Math.ceil(scale),
                Math.ceil(scale)
              );
            }
          }
        }
      }
    }
  } catch {
    ctx.fillStyle = '#e8e4df';
    ctx.fillRect(0, 0, size, size);
  }
}
