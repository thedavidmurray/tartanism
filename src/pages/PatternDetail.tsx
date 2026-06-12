import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { SORTED_TARTANS } from '../data/tartanLibrary';
import { getColor, rgbToHex } from '../core/colors';
import { parseThreadcount, expandSett, getThreadAt } from '../core/sett';
import { WEAVE_PATTERNS, isWarpOnTop } from '../core/weaves';
import { generateWIF, downloadWIF } from '../export/wif';
import { estimatePrice } from '../production/pricing';
import type { WeaveType } from '../core/types';
import WeaveSelector from '../components/WeaveSelector';
import BreedPanel from '../components/BreedPanel';
import CrossbreedPanel from '../components/CrossbreedPanel';
import TartanCard from '../components/TartanCard';

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
// Gallery view thumbnail
// ---------------------------------------------------------------------------

function ViewThumb({
  threadcount,
  weave,
  repeats,
  label,
  isActive,
  onClick,
}: {
  threadcount: string;
  weave: WeaveType;
  repeats: number;
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (ref.current) {
      renderDetail(ref.current, threadcount, 120, weave, repeats);
    }
  }, [threadcount, weave, repeats]);

  return (
    <button
      onClick={onClick}
      className="text-center flex-shrink-0"
      aria-pressed={isActive}
    >
      <div
        className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden"
        style={{
          boxShadow: isActive
            ? '0 0 0 2px var(--accent), 0 1px 3px rgba(0,0,0,0.08)'
            : 'var(--shadow-card)',
          transitionProperty: 'box-shadow',
          transitionDuration: '200ms',
          transitionTimingFunction: 'ease-out',
        }}
      >
        <canvas ref={ref} className="w-full h-full" style={{ imageRendering: 'pixelated' }} />
      </div>
      <span
        className="block mt-1 text-[11px] font-mono"
        style={{ color: isActive ? 'var(--text)' : 'var(--text-tertiary)' }}
      >
        {label}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Secondary action button (shared styles for export row)
// ---------------------------------------------------------------------------

function ActionButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 sm:flex-none px-4 py-2 rounded-xl text-sm font-medium text-[var(--text-secondary)] min-h-[40px] whitespace-nowrap"
      style={{
        boxShadow: 'inset 0 0 0 1px var(--border)',
        background: 'var(--bg-card)',
        transitionProperty: 'box-shadow, color, transform',
        transitionDuration: '200ms',
        transitionTimingFunction: 'ease-out',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'inset 0 0 0 1px var(--border-hover)'; e.currentTarget.style.color = 'var(--text)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'inset 0 0 0 1px var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.transform = ''; }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = ''; }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main page -- ecommerce product detail layout
// ---------------------------------------------------------------------------

type GalleryView = 'pattern' | 'fabric';

export default function PatternDetail() {
  const { id } = useParams<{ id: string }>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [weave, setWeave] = useState<WeaveType>('twill-2-2');
  const [view, setView] = useState<GalleryView>('pattern');
  const [copied, setCopied] = useState(false);

  const tartan = SORTED_TARTANS.find(
    (t) => t.name === decodeURIComponent(id || '')
  );

  const colors = usePaletteColors(tartan?.threadcount ?? '');
  const price = useMemo(
    () => (tartan ? estimatePrice(tartan.threadcount) : null),
    [tartan]
  );
  const settInfo = useMemo(() => {
    if (!tartan) return null;
    try {
      const parsed = parseThreadcount(tartan.threadcount);
      return parsed ? { stripes: parsed.stripes.length, threads: parsed.totalThreads } : null;
    } catch {
      return null;
    }
  }, [tartan]);

  const related = useMemo(() => {
    if (!tartan) return [];
    return SORTED_TARTANS
      .filter((t) => t.category === tartan.category && t.name !== tartan.name)
      .slice(0, 4);
  }, [tartan]);

  // Render main canvas for the active gallery view
  useEffect(() => {
    if (canvasRef.current && tartan) {
      renderDetail(
        canvasRef.current,
        tartan.threadcount,
        700,
        weave,
        view === 'fabric' ? 3 : 1
      );
    }
  }, [tartan, weave, view, id]);

  const handleCopy = useCallback(() => {
    if (tartan) {
      copyThreadcount(tartan.threadcount);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [tartan]);

  const handleDownloadPNG = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !tartan) return;
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

  const studioLink = `/generate?tc=${encodeURIComponent(tartan.threadcount)}&name=${encodeURIComponent(tartan.name)}`;

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] mb-4 sm:mb-6">
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
          <Link
            to="/library"
            style={{
              transitionProperty: 'color',
              transitionDuration: '200ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = ''; }}
          >
            {tartan.category}
          </Link>
          <span style={{ color: 'var(--border)' }}>/</span>
          <span className="text-[var(--text-secondary)]">{tartan.name}</span>
        </nav>

        {/* PDP layout: gallery left, buy box right */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">

          {/* Gallery */}
          <div className="lg:sticky lg:top-20 lg:self-start space-y-3">
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

            {/* View thumbnails */}
            <div className="flex gap-3">
              <ViewThumb
                threadcount={tartan.threadcount}
                weave={weave}
                repeats={1}
                label="Pattern"
                isActive={view === 'pattern'}
                onClick={() => setView('pattern')}
              />
              <ViewThumb
                threadcount={tartan.threadcount}
                weave={weave}
                repeats={3}
                label="Fabric"
                isActive={view === 'fabric'}
                onClick={() => setView('fabric')}
              />
            </div>
          </div>

          {/* Product info / buy box */}
          <div className="space-y-6">
            <div>
              <span
                className="inline-block px-3 py-1 rounded-full text-xs font-mono uppercase tracking-wider
                           text-[var(--text-tertiary)] mb-3"
                style={{ boxShadow: 'inset 0 0 0 1px var(--border)' }}
              >
                {tartan.category}
              </span>
              <h1
                className="text-3xl sm:text-4xl font-serif font-normal text-[var(--text)]"
                style={{ textWrap: 'balance' } as React.CSSProperties}
              >
                {tartan.name}
              </h1>
              {tartan.description && (
                <p className="text-sm sm:text-base text-[var(--text-secondary)] mt-2" style={{ textWrap: 'pretty' } as React.CSSProperties}>
                  {tartan.description}
                </p>
              )}
            </div>

            {/* Price block */}
            {price && (
              <div className="pb-6" style={{ borderBottom: '1px solid var(--border)' }}>
                <p className="text-2xl font-serif text-[var(--text)]">
                  <span className="tabular-nums">${price.wovenPerYard}</span>
                  <span className="text-base text-[var(--text-secondary)]"> / yard</span>
                </p>
                <p className="text-xs text-[var(--text-tertiary)] mt-1">
                  Custom woven to order, estimated.
                </p>
              </div>
            )}

            {/* Weave option selector */}
            <WeaveSelector
              threadcount={tartan.threadcount}
              activeWeave={weave}
              onChange={setWeave}
            />

            {/* Color palette */}
            {colors.length > 0 && (
              <div>
                <h2 className="text-xs font-mono uppercase tracking-widest text-[var(--text-tertiary)] mb-3">
                  Colorway
                </h2>
                <div className="flex flex-wrap gap-x-5 gap-y-3">
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
                          <span className="tabular-nums">{entry.count}</span> threads
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Primary CTA + downloads */}
            <div className="space-y-3 pt-2">
              <Link
                to={studioLink}
                className="block w-full text-center px-6 py-3.5 rounded-xl text-sm font-medium
                           bg-[var(--accent)] text-white"
                style={{
                  transitionProperty: 'opacity, transform',
                  transitionDuration: '200ms',
                  transitionTimingFunction: 'ease-out',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = ''; }}
                onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = ''; }}
              >
                Customize in Studio
              </Link>
              <div className="flex flex-wrap gap-2">
                <ActionButton onClick={handleDownloadPNG}>PNG</ActionButton>
                <ActionButton onClick={() => downloadSVG(tartan.threadcount, 800, 3)}>SVG</ActionButton>
                <ActionButton onClick={() => downloadWIFFile(tartan.threadcount, tartan.name, weave)}>WIF (Loom)</ActionButton>
                <ActionButton onClick={handleCopy}>{copied ? 'Copied' : 'Copy Threadcount'}</ActionButton>
              </div>
            </div>

            {/* Detail accordions */}
            <div className="pt-2">
              <details
                className="group py-4"
                style={{ borderTop: '1px solid var(--border)' }}
              >
                <summary className="flex items-center justify-between cursor-pointer select-none text-sm font-medium text-[var(--text)] list-none">
                  Thread Count
                  <span className="text-[var(--text-tertiary)] group-open:rotate-45 transition-transform duration-200">+</span>
                </summary>
                <div
                  className="mt-3 rounded-xl px-4 py-3 text-sm font-mono text-[var(--text-secondary)]
                             break-all leading-relaxed select-all"
                  style={{
                    background: 'var(--bg-card)',
                    boxShadow: 'inset 0 0 0 1px var(--border)',
                  }}
                >
                  {tartan.threadcount}
                </div>
              </details>

              <details
                className="group py-4"
                style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}
              >
                <summary className="flex items-center justify-between cursor-pointer select-none text-sm font-medium text-[var(--text)] list-none">
                  Specifications
                  <span className="text-[var(--text-tertiary)] group-open:rotate-45 transition-transform duration-200">+</span>
                </summary>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--text-tertiary)]">Weave</dt>
                    <dd className="text-[var(--text-secondary)]">{WEAVE_PATTERNS[weave].name}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--text-tertiary)]">Colors</dt>
                    <dd className="text-[var(--text-secondary)] tabular-nums">{colors.length}</dd>
                  </div>
                  {settInfo && (
                    <>
                      <div className="flex justify-between gap-4">
                        <dt className="text-[var(--text-tertiary)]">Stripes per half-sett</dt>
                        <dd className="text-[var(--text-secondary)] tabular-nums">{settInfo.stripes}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-[var(--text-tertiary)]">Threads per half-sett</dt>
                        <dd className="text-[var(--text-secondary)] tabular-nums">{settInfo.threads}</dd>
                      </div>
                    </>
                  )}
                </dl>
              </details>
            </div>
          </div>
        </div>

        {/* Variations -- "more like this" */}
        <div className="mt-12 sm:mt-16">
          <BreedPanel threadcount={tartan.threadcount} tartanName={tartan.name} />
        </div>

        {/* Crossbreed with another library tartan */}
        <div className="mt-12 sm:mt-16">
          <CrossbreedPanel threadcount={tartan.threadcount} tartanName={tartan.name} />
        </div>

        {/* Related products */}
        {related.length > 0 && (
          <div className="mt-12 sm:mt-16">
            <div className="flex items-baseline justify-between mb-5">
              <h2 className="text-lg sm:text-xl font-serif text-[var(--text)]">
                More from {tartan.category}
              </h2>
              <Link
                to="/library"
                className="text-xs text-[var(--accent)] font-medium"
                style={{
                  transitionProperty: 'opacity',
                  transitionDuration: '150ms',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.7'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
              >
                View all
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
              {related.map((t) => (
                <TartanCard key={t.name} tartan={t} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
