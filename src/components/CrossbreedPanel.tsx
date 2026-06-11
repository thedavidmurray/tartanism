import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { SORTED_TARTANS } from '../data/tartanLibrary';
import { parseThreadcount, toThreadcountString } from '../core/sett';
import { breedTartans, type BredResult } from '../core/breeding';
import { renderTartanToCanvas } from '../utils/renderTartan';

interface CrossbreedPanelProps {
  threadcount: string;
  tartanName: string;
}

// How many partner suggestions to show before the user searches
const RAIL_SIZE = 12;

function PartnerThumb({
  name,
  threadcount,
  isActive,
  onClick,
}: {
  name: string;
  threadcount: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      renderTartanToCanvas(canvasRef.current, threadcount, 120);
    }
  }, [threadcount]);

  return (
    <button onClick={onClick} className="flex-shrink-0 w-20 sm:w-24 text-center" aria-pressed={isActive}>
      <div
        className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden"
        style={{
          boxShadow: isActive
            ? '0 0 0 2px var(--accent), 0 1px 3px rgba(0,0,0,0.08)'
            : 'var(--shadow-card)',
          transitionProperty: 'box-shadow',
          transitionDuration: '200ms',
          transitionTimingFunction: 'ease-out',
        }}
      >
        <canvas ref={canvasRef} className="w-full h-full" style={{ imageRendering: 'pixelated' }} />
      </div>
      <span
        className="block mt-1.5 text-[11px] leading-tight truncate font-serif"
        style={{ color: isActive ? 'var(--text)' : 'var(--text-tertiary)' }}
      >
        {name}
      </span>
    </button>
  );
}

function OffspringThumb({ result }: { result: BredResult }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);
  const tc = toThreadcountString(result.sett);

  useEffect(() => {
    if (canvasRef.current) {
      renderTartanToCanvas(canvasRef.current, tc, 160);
      setRendered(true);
    }
  }, [tc]);

  return (
    <Link
      to={`/generate?tc=${encodeURIComponent(tc)}&name=${encodeURIComponent('Crossbreed')}`}
      className="block group"
    >
      <div
        className="w-full aspect-square rounded-xl overflow-hidden"
        style={{
          boxShadow: 'var(--shadow-card)',
          outline: '1px solid rgba(0,0,0,0.06)',
          outlineOffset: '-1px',
          transitionProperty: 'box-shadow, transform',
          transitionDuration: '200ms',
          transitionTimingFunction: 'ease-out',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = 'var(--shadow-card-hover)';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = 'var(--shadow-card)';
          e.currentTarget.style.transform = '';
        }}
      >
        {!rendered && <div className="w-full h-full animate-shimmer" />}
        <canvas
          ref={canvasRef}
          className={`w-full h-full ${rendered ? '' : 'opacity-0 absolute'}`}
          style={{ imageRendering: 'pixelated' }}
        />
      </div>
      <span className="block mt-1.5 text-[11px] text-[var(--text-tertiary)] text-center font-mono">
        {result.strategy}
      </span>
    </Link>
  );
}

export default function CrossbreedPanel({ threadcount, tartanName }: CrossbreedPanelProps) {
  const [search, setSearch] = useState('');
  const [partnerName, setPartnerName] = useState<string | null>(null);
  const [offspring, setOffspring] = useState<BredResult[]>([]);

  const partners = useMemo(() => {
    const q = search.toLowerCase();
    return SORTED_TARTANS
      .filter((t) => t.name !== tartanName)
      .filter((t) => q === '' || t.name.toLowerCase().includes(q))
      .slice(0, RAIL_SIZE);
  }, [search, tartanName]);

  const partner = partnerName
    ? SORTED_TARTANS.find((t) => t.name === partnerName) ?? null
    : null;

  const breed = useCallback((partnerTc: string) => {
    try {
      const p1 = parseThreadcount(threadcount);
      const p2 = parseThreadcount(partnerTc);
      setOffspring(breedTartans(p1, p2, 8));
    } catch (e) {
      console.error('Crossbreeding failed:', e);
      setOffspring([]);
    }
  }, [threadcount]);

  const selectPartner = useCallback((name: string, partnerTc: string) => {
    if (name === partnerName) {
      setPartnerName(null);
      setOffspring([]);
      return;
    }
    setPartnerName(name);
    breed(partnerTc);
  }, [partnerName, breed]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-serif text-[var(--text)]">
            Crossbreed
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1" style={{ textWrap: 'pretty' } as React.CSSProperties}>
            Cross {tartanName} with another tartan from the library. Offspring inherit
            each parent&apos;s dominant and accent colors.
          </p>
        </div>
        <input
          type="text"
          placeholder="Search for a partner..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-64 px-4 py-2 rounded-xl text-sm text-[var(--text)] placeholder-[var(--text-tertiary)] min-h-[40px]"
          style={{
            background: 'var(--bg-card)',
            boxShadow: 'inset 0 0 0 1px var(--border)',
            outline: 'none',
            transitionProperty: 'box-shadow',
            transitionDuration: '200ms',
            transitionTimingFunction: 'ease-out',
          }}
          onFocus={(e) => { e.currentTarget.style.boxShadow = 'inset 0 0 0 1px var(--border-hover), 0 0 0 3px rgba(26,86,50,0.1)'; }}
          onBlur={(e) => { e.currentTarget.style.boxShadow = 'inset 0 0 0 1px var(--border)'; }}
        />
      </div>

      {/* Partner rail */}
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1">
        {partners.map((t) => (
          <PartnerThumb
            key={t.name}
            name={t.name}
            threadcount={t.threadcount}
            isActive={t.name === partnerName}
            onClick={() => selectPartner(t.name, t.threadcount)}
          />
        ))}
        {partners.length === 0 && (
          <p className="text-sm text-[var(--text-tertiary)] py-6">
            No tartans match that search.
          </p>
        )}
      </div>

      {/* Offspring */}
      {partner && offspring.length > 0 && (
        <div className="space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-widest text-[var(--text-tertiary)]">
              {tartanName} {'×'} {partner.name}
            </span>
            <button
              onClick={() => breed(partner.threadcount)}
              className="text-xs text-[var(--accent)] font-medium min-h-[32px] px-2"
              style={{
                transitionProperty: 'opacity',
                transitionDuration: '150ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.7'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
            >
              Breed again
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 stagger-grid">
            {offspring.map((r, i) => (
              <OffspringThumb key={`x-${r.seed}-${i}`} result={r} />
            ))}
          </div>
          <p className="text-xs text-[var(--text-tertiary)]" style={{ textWrap: 'pretty' } as React.CSSProperties}>
            Tap an offspring to refine it in the Studio, or breed again for a fresh litter.
          </p>
        </div>
      )}
    </div>
  );
}
