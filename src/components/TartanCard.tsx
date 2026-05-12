import { useState, useRef, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { TartanRecord } from '../data/tartanLibrary';
import { getColor } from '../core/colors';
import { parseThreadcount } from '../core/sett';
import { renderTartanToCanvas } from '../utils/renderTartan';

interface TartanCardProps {
  tartan: TartanRecord;
  /** If provided, will be used as the threadcount for rendering (for generated tartans) */
  threadcount?: string;
  /** Link target. Defaults to /pattern/:name */
  to?: string;
}

function ColorDots({ threadcount }: { threadcount: string }) {
  const colors = useMemo(() => {
    try {
      const parsed = parseThreadcount(threadcount);
      if (!parsed) return [];

      const usage: Record<string, number> = {};
      for (const stripe of parsed.stripes) {
        usage[stripe.color] = (usage[stripe.color] || 0) + stripe.count;
      }

      return Object.entries(usage)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([code]) => {
          const c = getColor(code);
          return c ? `rgb(${c.rgb.r},${c.rgb.g},${c.rgb.b})` : '#ccc';
        });
    } catch {
      return [];
    }
  }, [threadcount]);

  if (colors.length === 0) return null;

  return (
    <div className="flex gap-1">
      {colors.map((color, i) => (
        <span
          key={i}
          className="w-2.5 h-2.5 rounded-full"
          style={{
            backgroundColor: color,
            outline: '1px solid rgba(0,0,0,0.08)',
            outlineOffset: '-1px',
          }}
        />
      ))}
    </div>
  );
}

export default function TartanCard({ tartan, threadcount, to }: TartanCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);
  const tc = threadcount || tartan.threadcount;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (visible && canvasRef.current && !rendered) {
      renderTartanToCanvas(canvasRef.current, tc, 200);
      setRendered(true);
    }
  }, [visible, tc, rendered]);

  const linkTo = to || `/pattern/${encodeURIComponent(tartan.name)}`;

  return (
    <Link
      to={linkTo}
      className="group block"
    >
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-xl bg-[var(--bg-card)]"
        style={{
          boxShadow: 'var(--shadow-card)',
          outline: '1px solid rgba(0,0,0,0.06)',
          outlineOffset: '-1px',
          transitionProperty: 'box-shadow, transform',
          transitionDuration: '300ms',
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
        {/* Swatch */}
        <div className="aspect-square overflow-hidden">
          {!rendered && (
            <div className="w-full h-full animate-shimmer" />
          )}
          <canvas
            ref={canvasRef}
            className={`w-full h-full ${rendered ? 'opacity-100' : 'opacity-0 absolute'}`}
            style={{
              imageRendering: 'pixelated',
              transitionProperty: 'transform',
              transitionDuration: '500ms',
              transitionTimingFunction: 'ease-out',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.03)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = ''; }}
          />
        </div>

        {/* Hover overlay with weave info */}
        <div
          className="absolute inset-0 flex items-end p-3 pointer-events-none opacity-0 group-hover:opacity-100"
          style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.4), transparent)',
            transitionProperty: 'opacity',
            transitionDuration: '300ms',
          }}
        >
          <span className="text-white/90 text-xs font-mono">2/2 Twill</span>
        </div>
      </div>

      {/* Metadata -- concentric radius: outer 12px, padding 8px, inner content flush */}
      <div className="mt-2.5 px-0.5 space-y-0.5">
        <h3 className="text-sm font-medium text-[var(--text)] truncate font-serif">
          {tartan.name}
        </h3>
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
            {tartan.category}
          </span>
          <ColorDots threadcount={tc} />
        </div>
      </div>
    </Link>
  );
}
