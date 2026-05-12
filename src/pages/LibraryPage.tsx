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
      {/* Header area */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
          <div>
            <h1
              className="text-2xl sm:text-3xl font-serif font-normal text-[var(--text)]"
              style={{ textWrap: 'balance' } as React.CSSProperties}
            >
              Tartan Library
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              <span className="tabular-nums">{filtered.length}</span> {filtered.length === 1 ? 'tartan' : 'tartans'}
              {category !== 'all' && ` in ${category}`}
            </p>
          </div>

          {/* Search */}
          <div className="w-full sm:w-72">
            <input
              type="text"
              placeholder="Search tartans..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-4 py-2 rounded-xl text-sm text-[var(--text)] placeholder-[var(--text-tertiary)]"
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
        </div>

        {/* Filter bar */}
        <div className="flex items-center justify-between gap-4 mb-2">
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
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

          {/* Sort */}
          <div className="flex-shrink-0 flex items-center gap-1.5">
            <span className="text-xs text-[var(--text-tertiary)] hidden sm:inline">Sort:</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              className="text-xs bg-transparent rounded-lg px-2 py-1.5 min-h-[32px]
                         text-[var(--text-secondary)] cursor-pointer"
              style={{
                boxShadow: 'inset 0 0 0 1px var(--border)',
                outline: 'none',
              }}
            >
              <option value="popularity">Popular</option>
              <option value="name">A to Z</option>
            </select>
          </div>
        </div>
      </div>

      {/* Divider -- shadow line instead of border */}
      <div style={{ boxShadow: '0 1px 0 0 var(--border)' }} />

      {/* Grid */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 stagger-grid">
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
