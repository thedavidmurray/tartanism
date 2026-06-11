import { useState, useMemo } from 'react';
import { SORTED_TARTANS, TARTAN_CATEGORIES } from '../data/tartanLibrary';
import TartanCard from '../components/TartanCard';

type SortMode = 'popularity' | 'name';

export default function LibraryPage() {
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('popularity');

  const filtered = useMemo(() => {
    let result = SORTED_TARTANS.filter((t) => {
      const matchesCat = category === 'all' || t.category === category;
      const matchesSearch =
        search === '' ||
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        (t.description && t.description.toLowerCase().includes(search.toLowerCase()));
      return matchesCat && matchesSearch;
    });

    if (sort === 'name') {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    }
    // popularity is the default sort from SORTED_TARTANS

    return result;
  }, [category, search, sort]);

  const categories = ['all', ...TARTAN_CATEGORIES];

  return (
    <div className="min-h-screen">
      {/* Hero band -- storefront opener */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-6 sm:pb-8 text-center">
        <p className="text-xs font-mono uppercase tracking-widest text-[var(--text-tertiary)] mb-2">
          The Collection
        </p>
        <h1
          className="text-3xl sm:text-4xl lg:text-5xl font-serif font-normal text-[var(--text)]"
          style={{ textWrap: 'balance' } as React.CSSProperties}
        >
          Authentic Scottish Tartans
        </h1>
        <p
          className="text-sm sm:text-base text-[var(--text-secondary)] mt-3 max-w-xl mx-auto"
          style={{ textWrap: 'pretty' } as React.CSSProperties}
        >
          {SORTED_TARTANS.length}+ clan, district, and historic patterns — explore each
          weave, then customize it or order custom fabric.
        </p>
      </div>

      {/* Sticky shop toolbar: search, categories, sort */}
      <div
        className="sticky top-14 z-40 bg-[var(--bg)]/95 backdrop-blur-md"
        style={{ boxShadow: '0 1px 0 0 var(--border)' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Category pills */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`pill whitespace-nowrap text-xs
                  ${category === cat ? 'pill-active' : 'pill-inactive'}`}
              >
                {cat === 'all' ? 'All' : cat}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <input
              type="text"
              placeholder="Search tartans..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 sm:flex-none sm:w-56 px-4 py-2 rounded-xl text-sm text-[var(--text)] placeholder-[var(--text-tertiary)] min-h-[40px]"
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

            {/* Sort */}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              className="text-xs bg-[var(--bg-card)] rounded-xl px-3 py-2 min-h-[40px]
                         text-[var(--text-secondary)] cursor-pointer flex-shrink-0"
              style={{
                boxShadow: 'inset 0 0 0 1px var(--border)',
                outline: 'none',
              }}
              aria-label="Sort tartans"
            >
              <option value="popularity">Popular</option>
              <option value="name">A to Z</option>
            </select>
          </div>
        </div>
      </div>

      {/* Product grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <p className="text-xs text-[var(--text-tertiary)] mb-4">
          <span className="tabular-nums">{filtered.length}</span>{' '}
          {filtered.length === 1 ? 'pattern' : 'patterns'}
          {category !== 'all' && ` in ${category}`}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-7 sm:gap-x-6 sm:gap-y-9 stagger-grid">
          {filtered.map((tartan) => (
            <TartanCard key={tartan.name} tartan={tartan} />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-20 text-[var(--text-tertiary)] text-sm" style={{ textWrap: 'balance' } as React.CSSProperties}>
            No tartans match your search.
          </div>
        )}
      </main>
    </div>
  );
}
