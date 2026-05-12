import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { SORTED_TARTANS } from '../data/tartanLibrary';
import { getColor, rgbToHex } from '../core/colors';
import { parseThreadcount, expandSett, getThreadAt } from '../core/sett';
import { WEAVE_PATTERNS, isWarpOnTop } from '../core/weaves';
import { generateWIF, downloadWIF } from '../export/wif';
import type { WeaveType } from '../core/types';
import WeaveSelector from '../components/WeaveSelector';
import BreedPanel from '../components/BreedPanel';

// ---------------------------------------------------------------------------
// Canvas renderer with weave + repeat support
// ---------------------------------------------------------------------------

function renderDetail(
  canvas: HTMLCanvasElement,
  threadcount: string,
  size: number,
  weaveType: WeaveType,
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

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------

interface ColorEntry {
  code: string;
  name: string;
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
          return {
            code,
            name: c.name,
            hex: rgbToHex(c.rgb),
            count,
          };
        })
        .filter((e): e is ColorEntry => e !== null);
    } catch {
      return [];
    }
  }, [threadcount]);
}

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------

function downloadSVG(threadcount: string, size: number = 800, repeats: number = 3) {
  try {
    const parsed = parseThreadcount(threadcount);
    if (!parsed) return;

    const expanded = expandSett(parsed);
    const weave = WEAVE_PATTERNS['twill-2-2'];
    const tileSize = size / repeats;
    const scale = tileSize / expanded.length;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;
    
    // Render tiles
    for (let tileY = 0; tileY < repeats; tileY++) {
      for (let tileX = 0; tileX < repeats; tileX++) {
        const offsetX = tileX * tileSize;
        const offsetY = tileY * tileSize;
        
        for (let y = 0; y < expanded.length; y++) {
          for (let x = 0; x < expanded.length; x++) {
            const warpCode = getThreadAt(expanded, x);
            const weftCode = getThreadAt(expanded, y);
            const warpColor = getColor(warpCode);
            const weftColor = getColor(weftCode);
            if (warpColor && weftColor) {
              const warpOnTop = isWarpOnTop(weave, x, y);
              const c = warpOnTop ? warpColor : weftColor;
              const px = (offsetX + x * scale).toFixed(1);
              const py = (offsetY + y * scale).toFixed(1);
              const sw = Math.ceil(scale);
              svg += `<rect x="${px}" y="${py}" width="${sw}" height="${sw}" fill="rgb(${c.rgb.r},${c.rgb.g},${c.rgb.b})"/>`;
            }
          }
        }
      }
    }

    svg += `</svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tartanism-${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('SVG export failed:', e);
  }
}

function downloadWIFFile(threadcount: string, name: string, weaveType: WeaveType) {
  try {
    const parsed = parseThreadcount(threadcount);
    if (!parsed) return;
    
    const weave = WEAVE_PATTERNS[weaveType];
    const wif = generateWIF(parsed, weave, {
      title: name || 'Tartanism Export',
      author: 'Tartanism - Edgeless Lab',
      notes: `Generated from threadcount: ${threadcount}`,
    });
    
    downloadWIF(wif.content, wif.filename);
  } catch (e) {
    console.error('WIF export failed:', e);
  }
}

function copyThreadcount(threadcount: string) {
  navigator.clipboard.writeText(threadcount).catch(() => {});
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PatternDetail() {
  const { id } = useParams<{ id: string }>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tilingCanvasRef = useRef<HTMLCanvasElement>(null);
  const [weave, setWeave] = useState<WeaveType>('twill-2-2');
  const [copied, setCopied] = useState(false);

  const tartan = SORTED_TARTANS.find(
    (t) => t.name === decodeURIComponent(id || '')
  );

  const colors = usePaletteColors(tartan?.threadcount ?? '');

  // Render main canvas
  useEffect(() => {
    if (canvasRef.current && tartan) {
      renderDetail(canvasRef.current, tartan.threadcount, 600, weave);
    }
  }, [tartan, weave, id]);

  // Render tiling preview
  useEffect(() => {
    if (tilingCanvasRef.current && tartan) {
      renderDetail(tilingCanvasRef.current, tartan.threadcount, 600, weave, 3);
    }
  }, [tartan, weave, id]);

  const handleCopy = useCallback(() => {
    if (tartan) {
      copyThreadcount(tartan.threadcount);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [tartan]);

  if (!tartan) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-xl font-serif text-[var(--text)]">
            Pattern not found
          </h1>
          <Link
            to="/library"
            className="text-sm text-[var(--accent)]"
            style={{
              transitionProperty: 'opacity',
              transitionDuration: '150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.7'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            Back to Library
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-10">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
          <Link
            to="/library"
            style={{
              transitionProperty: 'color',
              transitionDuration: '200ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = ''; }}
          >
            Library
          </Link>
          <span style={{ color: 'var(--border)' }}>/</span>
          <span className="text-[var(--text-secondary)]">{tartan.name}</span>
        </nav>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1
              className="text-3xl sm:text-4xl font-serif font-normal text-[var(--text)]"
              style={{ textWrap: 'balance' } as React.CSSProperties}
            >
              {tartan.name}
            </h1>
            {tartan.description && (
              <p className="text-sm text-[var(--text-secondary)] mt-1.5 max-w-lg" style={{ textWrap: 'pretty' } as React.CSSProperties}>
                {tartan.description}
              </p>
            )}
          </div>
          <span
            className="self-start sm:self-auto px-3 py-1 rounded-full text-xs font-mono uppercase tracking-wider
                       text-[var(--text-tertiary)]"
            style={{ boxShadow: 'inset 0 0 0 1px var(--border)' }}
          >
            {tartan.category}
          </span>
        </div>

        {/* Main swatch -- shadow not border */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            boxShadow: 'var(--shadow-card)',
            outline: '1px solid rgba(0,0,0,0.06)',
            outlineOffset: '-1px',
          }}
        >
          <canvas
            ref={canvasRef}
            className="w-full aspect-square"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>

        {/* Weave selector */}
        <WeaveSelector
          threadcount={tartan.threadcount}
          activeWeave={weave}
          onChange={setWeave}
        />

        {/* Color palette */}
        {colors.length > 0 && (
          <div>
            <h2 className="text-xs font-mono uppercase tracking-widest text-[var(--text-tertiary)] mb-3">
              Color Palette
            </h2>
            <div className="flex flex-wrap gap-3">
              {colors.map((entry) => (
                <div key={entry.code} className="flex items-center gap-2.5">
                  <span
                    className="w-8 h-8 rounded-lg flex-shrink-0"
                    style={{
                      backgroundColor: entry.hex,
                      outline: '1px solid rgba(0,0,0,0.1)',
                      outlineOffset: '-1px',
                    }}
                  />
                  <div>
                    <div className="text-sm text-[var(--text)]">
                      {entry.name}
                    </div>
                    <div className="text-xs font-mono text-[var(--text-tertiary)]">
                      {entry.hex.toUpperCase()} / <span className="tabular-nums">{entry.count}</span> threads
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Threadcount */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-mono uppercase tracking-widest text-[var(--text-tertiary)]">
              Thread Count
            </h2>
            <button
              onClick={handleCopy}
              className="text-xs text-[var(--accent)] font-medium min-h-[32px] px-2"
              style={{
                transitionProperty: 'opacity',
                transitionDuration: '150ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.7'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div
            className="rounded-xl px-4 py-3 text-sm font-mono text-[var(--text-secondary)]
                       break-all leading-relaxed select-all"
            style={{
              background: 'var(--bg-card)',
              boxShadow: 'inset 0 0 0 1px var(--border)',
            }}
          >
            {tartan.threadcount}
          </div>
        </div>

        {/* Tiling preview -- sells the fabric */}
        <div>
          <h2 className="text-xs font-mono uppercase tracking-widest text-[var(--text-tertiary)] mb-3">
            Fabric Preview (3x3 Tile)
          </h2>
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              boxShadow: 'var(--shadow-card)',
              outline: '1px solid rgba(0,0,0,0.06)',
              outlineOffset: '-1px',
            }}
          >
            <canvas
              ref={tilingCanvasRef}
              className="w-full aspect-square"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>
        </div>

        {/* Breed panel */}
        <BreedPanel threadcount={tartan.threadcount} tartanName={tartan.name} />

        {/* Export section */}
        <div>
          <h2 className="text-xs font-mono uppercase tracking-widest text-[var(--text-tertiary)] mb-3">
            Export
          </h2>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => downloadSVG(tartan.threadcount, 800, 3)}
              className="px-4 py-2 rounded-xl text-sm font-medium text-[var(--text-secondary)] min-h-[40px]"
              style={{
                boxShadow: 'inset 0 0 0 1px var(--border)',
                transitionProperty: 'box-shadow, color, transform',
                transitionDuration: '200ms',
                transitionTimingFunction: 'ease-out',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'inset 0 0 0 1px var(--border-hover)'; e.currentTarget.style.color = 'var(--text)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'inset 0 0 0 1px var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.transform = ''; }}
              onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
              onMouseUp={(e) => { e.currentTarget.style.transform = ''; }}
            >
              SVG (800px)
            </button>
            <button
              onClick={() => downloadWIFFile(tartan.threadcount, tartan.name, weave)}
              className="px-4 py-2 rounded-xl text-sm font-medium text-[var(--text-secondary)] min-h-[40px]"
              style={{
                boxShadow: 'inset 0 0 0 1px var(--border)',
                transitionProperty: 'box-shadow, color, transform',
                transitionDuration: '200ms',
                transitionTimingFunction: 'ease-out',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'inset 0 0 0 1px var(--border-hover)'; e.currentTarget.style.color = 'var(--text)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'inset 0 0 0 1px var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.transform = ''; }}
              onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
              onMouseUp={(e) => { e.currentTarget.style.transform = ''; }}
            >
              WIF (Loom)
            </button>
            <button
              onClick={() => {
                const canvas = canvasRef.current;
                if (canvas) {
                  canvas.toBlob((blob) => {
                    if (!blob) return;
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${tartan.name.toLowerCase().replace(/\s+/g, '-')}.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  });
                }
              }}
              className="px-4 py-2 rounded-xl text-sm font-medium text-[var(--text-secondary)] min-h-[40px]"
              style={{
                boxShadow: 'inset 0 0 0 1px var(--border)',
                transitionProperty: 'box-shadow, color, transform',
                transitionDuration: '200ms',
                transitionTimingFunction: 'ease-out',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'inset 0 0 0 1px var(--border-hover)'; e.currentTarget.style.color = 'var(--text)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'inset 0 0 0 1px var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.transform = ''; }}
              onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
              onMouseUp={(e) => { e.currentTarget.style.transform = ''; }}
            >
              PNG
            </button>
            <button
              onClick={handleCopy}
              className="px-4 py-2 rounded-xl text-sm font-medium text-[var(--text-secondary)] min-h-[40px]"
              style={{
                boxShadow: 'inset 0 0 0 1px var(--border)',
                transitionProperty: 'box-shadow, color, transform',
                transitionDuration: '200ms',
                transitionTimingFunction: 'ease-out',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'inset 0 0 0 1px var(--border-hover)'; e.currentTarget.style.color = 'var(--text)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'inset 0 0 0 1px var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.transform = ''; }}
              onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
              onMouseUp={(e) => { e.currentTarget.style.transform = ''; }}
            >
              {copied ? 'Copied' : 'Thread Count'}
            </button>
          </div>
        </div>

        {/* Back */}
        <div className="pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <Link
            to="/library"
            className="text-sm text-[var(--accent)]"
            style={{
              transitionProperty: 'opacity',
              transitionDuration: '150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.7'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            Back to Library
          </Link>
        </div>
      </div>
    </div>
  );
}
