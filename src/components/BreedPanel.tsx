import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { parseThreadcount, toThreadcountString } from '../core/sett';
import { generateVariations } from '../core/generator';
import { renderTartanToCanvas } from '../utils/renderTartan';
import type { GeneratorResult } from '../core/types';

interface BreedPanelProps {
  threadcount: string;
  tartanName: string;
}

type VariationType = 'colors' | 'proportions' | 'both';

function VariationThumb({ result, index }: { result: GeneratorResult; index: number }) {
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
      to={`/generate?tc=${encodeURIComponent(tc)}&name=${encodeURIComponent(`Variation ${index + 1}`)}`}
      className="flex-shrink-0 group"
    >
      <div
        className="w-28 h-28 sm:w-32 sm:h-32 rounded-xl overflow-hidden"
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
      <span className="block mt-1.5 text-xs text-[var(--text-secondary)] text-center font-serif">
        Variation <span className="tabular-nums">{index + 1}</span>
      </span>
    </Link>
  );
}

export default function BreedPanel({ threadcount, tartanName }: BreedPanelProps) {
  const [variations, setVariations] = useState<GeneratorResult[]>([]);
  const [variationType, setVariationType] = useState<VariationType>('colors');
  const [bred, setBred] = useState(false);

  const breed = useCallback(() => {
    try {
      const sett = parseThreadcount(threadcount);
      const results = generateVariations(sett, 8, variationType);
      setVariations(results);
      setBred(true);
    } catch (e) {
      console.error('Breeding failed:', e);
    }
  }, [threadcount, variationType]);

  const rebreed = useCallback(() => {
    try {
      const sett = parseThreadcount(threadcount);
      const results = generateVariations(sett, 8, variationType, Math.floor(Math.random() * 2147483647));
      setVariations(results);
    } catch (e) {
      console.error('Breeding failed:', e);
    }
  }, [threadcount, variationType]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-mono uppercase tracking-widest text-[var(--text-tertiary)]">
          Explore Variations
        </h2>
      </div>

      {!bred ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-secondary)]" style={{ textWrap: 'pretty' } as React.CSSProperties}>
            Generate variations of {tartanName} by adjusting its colors, proportions, or both.
          </p>

          {/* Variation type selector */}
          <div className="flex gap-2">
            {(['colors', 'proportions', 'both'] as VariationType[]).map((vt) => (
              <button
                key={vt}
                onClick={() => setVariationType(vt)}
                className={`pill text-xs capitalize
                  ${variationType === vt ? 'pill-active' : 'pill-inactive'}`}
              >
                {vt}
              </button>
            ))}
          </div>

          <button
            onClick={breed}
            className="px-6 py-2.5 rounded-xl text-sm font-medium bg-[var(--accent)] text-white min-h-[40px]"
            style={{
              transitionProperty: 'opacity, transform',
              transitionDuration: '200ms',
              transitionTimingFunction: 'ease-out',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = ''; }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = ''; }}
          >
            Generate 8 Variations
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Variation type + rebreed */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-2">
              {(['colors', 'proportions', 'both'] as VariationType[]).map((vt) => (
                <button
                  key={vt}
                  onClick={() => setVariationType(vt)}
                  className={`pill text-xs capitalize
                    ${variationType === vt ? 'pill-active' : 'pill-inactive'}`}
                >
                  {vt}
                </button>
              ))}
            </div>
            <button
              onClick={rebreed}
              className="text-xs text-[var(--accent)] font-medium"
              style={{
                transitionProperty: 'opacity',
                transitionDuration: '150ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.7'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
            >
              Regenerate
            </button>
          </div>

          {/* Horizontal scroll of variations */}
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1">
            {variations.map((result, i) => (
              <VariationThumb key={`${result.seed}-${i}`} result={result} index={i} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
