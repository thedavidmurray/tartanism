import { useRef, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { SORTED_TARTANS } from '../data/tartanLibrary';
import { getColor, rgbToHex } from '../core/colors';
import { parseThreadcount, expandSett, getThreadAt } from '../core/sett';
import { WEAVE_PATTERNS, isWarpOnTop } from '../core/weaves';

// ---------------------------------------------------------------------------
// Canvas renderer -- identical logic to LibraryPage but larger
// ---------------------------------------------------------------------------

function renderTartanToCanvas(
  canvas: HTMLCanvasElement,
  threadcount: string,
  size: number = 480
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = size;
  canvas.height = size;

  try {
    const parsed = parseThreadcount(threadcount);
    if (!parsed || parsed.stripes.length === 0) {
      ctx.fillStyle = '#2b2320';
      ctx.fillRect(0, 0, size, size);
      return;
    }

    const expanded = expandSett(parsed);
    if (expanded.length === 0) return;

    const scale = size / expanded.length;
    const weave = WEAVE_PATTERNS['twill-2-2'];

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
            x * scale,
            y * scale,
            Math.ceil(scale),
            Math.ceil(scale)
          );
        }
      }
    }
  } catch {
    ctx.fillStyle = '#2b2320';
    ctx.fillRect(0, 0, size, size);
  }
}

// ---------------------------------------------------------------------------
// Color palette strip
// ---------------------------------------------------------------------------

interface ColorEntry {
  code: string;
  hex: string;
  rgb: { r: number; g: number; b: number };
  count: number;
}

function usePaletteColors(threadcount: string): ColorEntry[] {
  return useMemo(() => {
    try {
      const parsed = parseThreadcount(threadcount);
      if (!parsed) return [];

      // Accumulate thread usage per color code
      const usage: Record<string, number> = {};
      for (const stripe of parsed.stripes) {
        usage[stripe.color] = (usage[stripe.color] || 0) + stripe.count;
      }

      return Object.entries(usage)
        .sort((a, b) => b[1] - a[1])
        .map(([code, count]) => {
          const c = getColor(code);
          if (!c) return null;
          return {
            code,
            hex: rgbToHex(c.rgb),
            rgb: c.rgb,
            count,
          };
        })
        .filter((e): e is ColorEntry => e !== null);
    } catch {
      return [];
    }
  }, [threadcount]);
}

function ColorPaletteStrip({ threadcount }: { threadcount: string }) {
  const colors = usePaletteColors(threadcount);

  if (colors.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--t-cream-dim)]">
        Color Palette
      </h2>
      <div className="flex flex-wrap gap-2">
        {colors.map((entry) => (
          <div key={entry.code} className="flex items-center gap-2 group">
            <span
              className="w-6 h-6 rounded-md ring-1 ring-white/10 flex-shrink-0"
              style={{ backgroundColor: entry.hex }}
            />
            <div className="text-left">
              <div className="text-xs font-mono text-[var(--t-cream)] leading-none">
                {entry.hex.toUpperCase()}
              </div>
              <div className="text-[10px] text-[var(--t-cream-dim)] leading-none mt-0.5">
                {entry.code} &middot; {entry.count}t
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PatternDetail() {
  const { id } = useParams<{ id: string }>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);

  const tartan = SORTED_TARTANS.find(
    (t) => t.name === decodeURIComponent(id || '')
  );

  useEffect(() => {
    if (canvasRef.current && tartan && !rendered) {
      renderTartanToCanvas(canvasRef.current, tartan.threadcount, 480);
      setRendered(true);
    }
  }, [tartan, rendered]);

  // Reset render flag when tartan changes
  useEffect(() => {
    setRendered(false);
  }, [id]);

  if (!tartan) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-12">
        <div className="text-center space-y-4">
          <h1 className="text-xl font-semibold text-[var(--t-cream)]">
            Pattern not found
          </h1>
          <Link
            to="/library"
            className="text-sm text-[var(--t-parchment)] hover:underline"
          >
            Back to Library
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-14">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs text-[var(--t-cream-dim)]">
          <Link
            to="/library"
            className="hover:text-[var(--t-cream)] transition-colors"
          >
            Library
          </Link>
          <span>/</span>
          <span className="text-[var(--t-cream)]">{tartan.name}</span>
        </nav>

        {/* Full-width canvas preview */}
        <div className="bg-[var(--t-parchment)] rounded-2xl p-3 shadow-lg shadow-black/30">
          {!rendered && (
            <div
              className="w-full aspect-square rounded-xl bg-[var(--t-wool)] animate-shimmer"
            />
          )}
          <canvas
            ref={canvasRef}
            className={`w-full aspect-square rounded-xl transition-opacity duration-300 ${
              rendered ? 'opacity-100' : 'opacity-0 absolute'
            }`}
            style={{ imageRendering: 'pixelated' }}
          />
        </div>

        {/* Name + category */}
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-3xl font-bold text-[var(--t-cream)] leading-tight">
              {tartan.name}
            </h1>
            <span
              className="mt-1 flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium
                         bg-[var(--t-wool)] text-[var(--t-cream-muted)]
                         border border-[var(--t-wool-border)]"
            >
              {tartan.category}
            </span>
          </div>
          {tartan.description && (
            <p className="text-sm text-[var(--t-cream-muted)] leading-relaxed">
              {tartan.description}
            </p>
          )}
        </div>

        {/* Color palette */}
        <ColorPaletteStrip threadcount={tartan.threadcount} />

        {/* Threadcount / sett string */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--t-cream-dim)]">
            Threadcount
          </h2>
          <div
            className="bg-[var(--t-wool)] border border-[var(--t-wool-border)] rounded-xl
                       px-4 py-3 text-xs font-mono text-[var(--t-cream-dim)]
                       break-all leading-relaxed select-all"
          >
            {tartan.threadcount}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Link
            to="/library"
            className="px-6 py-2.5 rounded-xl text-sm font-medium
                       border border-[var(--t-wool-border)] text-[var(--t-cream)]
                       hover:bg-[var(--t-wool)] transition-all"
          >
            Back to Library
          </Link>
          <Link
            to="/studio"
            className="px-6 py-2.5 rounded-xl text-sm font-medium
                       bg-[var(--t-parchment)] text-[var(--t-charcoal)]
                       hover:bg-[var(--t-cream)] transition-all"
          >
            Open in Studio
          </Link>
        </div>
      </div>
    </div>
  );
}
