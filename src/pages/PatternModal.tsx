import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { SORTED_TARTANS } from '../data/tartanLibrary';
import { getColor, rgbToHex } from '../core/colors';
import { parseThreadcount, expandSett, getThreadAt } from '../core/sett';
import { WEAVE_PATTERNS, isWarpOnTop } from '../core/weaves';

// ---------------------------------------------------------------------------
// Canvas renderer (same as PatternDetail)
// ---------------------------------------------------------------------------

function renderTartanToCanvas(
  canvas: HTMLCanvasElement,
  threadcount: string,
  size: number = 400
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
  count: number;
}

function usePaletteColors(threadcount: string): ColorEntry[] {
  return useMemo(() => {
    try {
      const parsed = parseThreadcount(threadcount);
      if (!parsed) return [];

      const usage: Record<string, number> = {};
      for (const stripe of parsed.stripes) {
        usage[stripe.color] = (usage[stripe.color] || 0) + stripe.count;
      }

      return Object.entries(usage)
        .sort((a, b) => b[1] - a[1])
        .map(([code, count]) => {
          const c = getColor(code);
          if (!c) return null;
          return { code, hex: rgbToHex(c.rgb), count };
        })
        .filter((e): e is ColorEntry => e !== null);
    } catch {
      return [];
    }
  }, [threadcount]);
}

// ---------------------------------------------------------------------------
// Modal overlay
// ---------------------------------------------------------------------------

export default function PatternModal() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);

  const tartan = SORTED_TARTANS.find(
    (t) => t.name === decodeURIComponent(id || '')
  );

  const colors = usePaletteColors(tartan?.threadcount ?? '');

  const close = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  useEffect(() => {
    if (canvasRef.current && tartan && !rendered) {
      renderTartanToCanvas(canvasRef.current, tartan.threadcount, 400);
      setRendered(true);
    }
  }, [tartan, rendered]);

  useEffect(() => {
    setRendered(false);
  }, [id]);

  if (!tartan) return null;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4
                 bg-black/70 backdrop-blur-sm animate-fadeIn"
      onClick={close}
    >
      {/* Panel -- stop propagation so clicks inside don't close */}
      <div
        className="relative w-full max-w-lg bg-[var(--t-charcoal)]
                   border border-[var(--t-wool-border)] rounded-2xl
                   shadow-2xl shadow-black/50 overflow-hidden
                   animate-scaleIn max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={close}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full
                     bg-[var(--t-wool)] hover:bg-[var(--t-wool-hover)]
                     text-[var(--t-cream-dim)] hover:text-[var(--t-cream)]
                     flex items-center justify-center transition-all"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>

        {/* Preview */}
        <div className="bg-[var(--t-parchment)] p-3">
          {!rendered && (
            <div className="w-full aspect-square rounded-xl bg-[var(--t-wool)] animate-shimmer" />
          )}
          <canvas
            ref={canvasRef}
            className={`w-full aspect-square rounded-xl transition-opacity duration-300 ${
              rendered ? 'opacity-100' : 'opacity-0 absolute'
            }`}
            style={{ imageRendering: 'pixelated' }}
          />
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {/* Name + category */}
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-2xl font-bold text-[var(--t-cream)] leading-tight">
              {tartan.name}
            </h2>
            <span
              className="mt-1 flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium
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

          {/* Color palette */}
          {colors.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {colors.map((entry) => (
                <div key={entry.code} className="flex items-center gap-1.5">
                  <span
                    className="w-5 h-5 rounded ring-1 ring-white/10 flex-shrink-0"
                    style={{ backgroundColor: entry.hex }}
                  />
                  <span className="text-[10px] font-mono text-[var(--t-cream-dim)]">
                    {entry.hex.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Threadcount */}
          <div
            className="bg-[var(--t-wool)] border border-[var(--t-wool-border)] rounded-xl
                       px-3 py-2.5 text-xs font-mono text-[var(--t-cream-dim)]
                       break-all leading-relaxed select-all"
          >
            {tartan.threadcount}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={close}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium
                         border border-[var(--t-wool-border)] text-[var(--t-cream)]
                         hover:bg-[var(--t-wool)] transition-all"
            >
              Close
            </button>
            <Link
              to={`/pattern/${encodeURIComponent(tartan.name)}`}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-center
                         bg-[var(--t-parchment)] text-[var(--t-charcoal)]
                         hover:bg-[var(--t-cream)] transition-all"
            >
              Full Page
            </Link>
            <Link
              to="/studio"
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-center
                         border border-[var(--t-wool-border)] text-[var(--t-cream)]
                         hover:bg-[var(--t-wool)] transition-all"
            >
              Studio
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
