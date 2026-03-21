import { useState, useRef, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { SORTED_TARTANS, TARTAN_CATEGORIES } from '../data/tartanLibrary';
import type { TartanRecord } from '../data/tartanLibrary';
import { getColor } from '../core/colors';
import { parseThreadcount, expandSett, getThreadAt } from '../core/sett';
import { WEAVE_PATTERNS, isWarpOnTop } from '../core/weaves';

// ---------------------------------------------------------------------------
// Mini tartan renderer -- draws a single sett tile onto a canvas
// ---------------------------------------------------------------------------

function renderTartanToCanvas(
  canvas: HTMLCanvasElement,
  threadcount: string,
  size: number = 160
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
          ctx.fillRect(x * scale, y * scale, Math.ceil(scale), Math.ceil(scale));
        }
      }
    }
  } catch {
    ctx.fillStyle = '#2b2320';
    ctx.fillRect(0, 0, size, size);
  }
}

// ---------------------------------------------------------------------------
// Color dot component -- shows the dominant colors from a threadcount
// ---------------------------------------------------------------------------

function ColorDots({ threadcount }: { threadcount: string }) {
  const colors = useMemo(() => {
    try {
      const parsed = parseThreadcount(threadcount);
      if (!parsed) return [];

      // Count thread usage per color code
      const usage: Record<string, number> = {};
      for (const stripe of parsed.stripes) {
        usage[stripe.color] = (usage[stripe.color] || 0) + stripe.count;
      }

      // Get unique colors sorted by usage, take top 5
      return Object.entries(usage)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([code]) => {
          const c = getColor(code);
          return c ? `rgb(${c.rgb.r},${c.rgb.g},${c.rgb.b})` : '#666';
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
          className="w-2.5 h-2.5 rounded-full ring-1 ring-white/10"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tartan Card -- renders one tartan in the grid
// ---------------------------------------------------------------------------

function TartanCard({ tartan, locationRef }: { tartan: TartanRecord; locationRef: ReturnType<typeof useLocation> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);

  // IntersectionObserver: only render canvas when card scrolls into view
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
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (visible && canvasRef.current && !rendered) {
      renderTartanToCanvas(canvasRef.current, tartan.threadcount, 200);
      setRendered(true);
    }
  }, [visible, tartan.threadcount, rendered]);

  return (
    <Link
      to={`/pattern/${encodeURIComponent(tartan.name)}`}
      state={{ background: locationRef }}
      className="group block"
    >
      {/* Parchment mat frame */}
      <div
        ref={containerRef}
        className="bg-[var(--t-parchment)] rounded-xl p-2 transition-all duration-300
                   group-hover:ring-2 group-hover:ring-[var(--t-cream-muted)]/30
                   group-hover:shadow-lg group-hover:shadow-black/20"
      >
        {/* Skeleton while canvas isn't rendered yet */}
        {!rendered && (
          <div className="w-full aspect-square rounded-lg bg-[var(--t-wool)] animate-shimmer" />
        )}
        <canvas
          ref={canvasRef}
          className={`w-full aspect-square rounded-lg transition-opacity duration-300 ${
            rendered ? 'opacity-100' : 'opacity-0 absolute'
          }`}
          style={{ imageRendering: 'pixelated' }}
        />
      </div>

      {/* Metadata below the mat */}
      <div className="mt-2.5 px-0.5 space-y-1">
        <h3 className="text-sm font-semibold text-[var(--t-cream)] truncate
                       group-hover:text-[var(--t-parchment)] transition-colors">
          {tartan.name}
        </h3>
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--t-cream-dim)]">
            {tartan.category}
          </span>
          <ColorDots threadcount={tartan.threadcount} />
        </div>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Category Filter Chips
// ---------------------------------------------------------------------------

function CategoryChips({
  active,
  onChange,
}: {
  active: string;
  onChange: (cat: string) => void;
}) {
  const categories = ['all', ...TARTAN_CATEGORIES];

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => onChange(cat)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap
                     transition-all duration-200
                     ${
                       active === cat
                         ? 'bg-[var(--t-parchment)] text-[var(--t-charcoal)]'
                         : 'bg-[var(--t-wool)] text-[var(--t-cream-muted)] hover:bg-[var(--t-wool-hover)] hover:text-[var(--t-cream)]'
                     }`}
        >
          {cat === 'all' ? 'All Tartans' : cat}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Library Page
// ---------------------------------------------------------------------------

export default function LibraryPage() {
  const location = useLocation();
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return SORTED_TARTANS.filter((t) => {
      const matchesCat = category === 'all' || t.category === category;
      const matchesSearch =
        search === '' ||
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        (t.description && t.description.toLowerCase().includes(search.toLowerCase()));
      return matchesCat && matchesSearch;
    });
  }, [category, search]);

  return (
    <div className="min-h-screen">
      {/* Sticky Header */}
      <header className="sticky top-0 z-30 bg-[var(--t-charcoal)]/95 backdrop-blur-md
                         border-b border-[var(--t-wool-border)]">
        <div className="max-w-3xl mx-auto px-4 py-3 space-y-3">
          {/* Top row: back + title + count */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                to="/"
                className="text-[var(--t-cream-dim)] hover:text-[var(--t-cream)] transition-colors text-sm"
              >
                Tartanism
              </Link>
              <span className="text-[var(--t-wool-border)]">/</span>
              <h1 className="text-sm font-semibold text-[var(--t-cream)]">Library</h1>
            </div>
            <span className="text-xs text-[var(--t-cream-dim)]">
              {filtered.length < SORTED_TARTANS.length
                ? `Showing ${filtered.length} of ${SORTED_TARTANS.length}`
                : `${SORTED_TARTANS.length} tartans`}
            </span>
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder="Search tartans..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 bg-[var(--t-wool)] border border-[var(--t-wool-border)]
                       rounded-lg text-sm text-[var(--t-cream)] placeholder-[var(--t-cream-dim)]
                       focus:border-[var(--t-parchment)]/40 focus:ring-1 focus:ring-[var(--t-parchment)]/20
                       outline-none transition-all"
          />

          {/* Category chips */}
          <CategoryChips active={category} onChange={setCategory} />
        </div>
      </header>

      {/* Grid */}
      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((tartan) => (
            <TartanCard key={tartan.name} tartan={tartan} locationRef={location} />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16 text-[var(--t-cream-dim)] text-sm">
            No tartans match your search.
          </div>
        )}
      </main>
    </div>
  );
}
