import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { generateTartan, generateVariations, DEFAULT_CONSTRAINTS, CONSTRAINT_PRESETS } from '../core/generator';
import { parseThreadcount, toThreadcountString, generateSignatures } from '../core/sett';
import { breedTartans, type BredResult } from '../core/breeding';
import { renderTartanToCanvas } from '../utils/renderTartan';
import type { GeneratorResult, GeneratorConstraints, WeaveType } from '../core/types';
import WeaveSelector from '../components/WeaveSelector';

const BATCH_SIZE = 9;

// ---------------------------------------------------------------------------
// Swatch card -- shadows not borders, scale-on-press, stagger-ready
// ---------------------------------------------------------------------------

function SwatchCard({
  result,
  size = 240,
  isActive = false,
  isSelected = false,
  onClick,
  label,
  className = '',
}: {
  result: GeneratorResult;
  size?: number;
  isActive?: boolean;
  isSelected?: boolean;
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);
  const tc = toThreadcountString(result.sett);

  useEffect(() => {
    if (canvasRef.current) {
      renderTartanToCanvas(canvasRef.current, tc, size);
      setRendered(true);
    }
  }, [tc, size]);

  return (
    <button
      onClick={onClick}
      className={`group relative ${className}`}
      style={{
        transitionProperty: 'transform',
        transitionDuration: '150ms',
        transitionTimingFunction: 'ease-out',
      }}
    >
      <div
        className="w-full aspect-square rounded-xl overflow-hidden relative"
        style={{
          boxShadow: isSelected
            ? 'var(--shadow-card-selected)'
            : isActive
              ? 'var(--shadow-card-active)'
              : 'var(--shadow-card)',
          transitionProperty: 'box-shadow, transform',
          transitionDuration: '200ms',
          transitionTimingFunction: 'ease-out',
          transform: isActive ? 'scale(1.02)' : isSelected ? 'scale(1.03)' : undefined,
          outline: '1px solid rgba(0,0,0,0.06)',
          outlineOffset: '-1px',
        }}
        onMouseEnter={(e) => {
          if (!isActive && !isSelected) {
            e.currentTarget.style.boxShadow = 'var(--shadow-card-hover)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive && !isSelected) {
            e.currentTarget.style.boxShadow = 'var(--shadow-card)';
            e.currentTarget.style.transform = '';
          }
        }}
      >
        {!rendered && <div className="w-full h-full animate-shimmer" />}
        <canvas
          ref={canvasRef}
          className={`w-full h-full ${rendered ? '' : 'opacity-0 absolute'}`}
          style={{ imageRendering: 'pixelated' }}
        />
        {/* Breed selection overlay */}
        {isSelected && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="bg-pink-500 text-white text-xs font-mono font-bold uppercase tracking-widest
                           px-3 py-1.5 rounded-full"
              style={{ boxShadow: '0 2px 8px rgba(236,72,153,0.3)' }}
            >
              {label || 'Parent'}
            </span>
          </div>
        )}
      </div>
      {label && !isSelected && (
        <span className="block mt-1.5 text-xs text-[var(--text-tertiary)] text-center font-mono truncate">
          {label}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Active tartan detail sidebar
// ---------------------------------------------------------------------------

function DetailSidebar({
  result,
  weave,
  onWeaveChange,
  onMutate,
  mutations,
  onPromoteMutation,
  mutationType,
  onMutationTypeChange,
  onSave,
  isSaved,
}: {
  result: GeneratorResult;
  weave: WeaveType;
  onWeaveChange: (w: WeaveType) => void;
  onMutate: () => void;
  mutations: GeneratorResult[];
  onPromoteMutation: (r: GeneratorResult) => void;
  mutationType: 'colors' | 'proportions' | 'both';
  onMutationTypeChange: (t: 'colors' | 'proportions' | 'both') => void;
  onSave: () => void;
  isSaved: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tc = toThreadcountString(result.sett);

  useEffect(() => {
    if (canvasRef.current) {
      renderTartanToCanvas(canvasRef.current, tc, 600, weave);
    }
  }, [tc, weave]);

  return (
    <div className="space-y-5 lg:sticky lg:top-20 lg:self-start">
      {/* Large preview -- shadow instead of border, concentric radius */}
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

      {/* Save + thread count */}
      <div className="flex items-start gap-3">
        <div
          className="flex-1 rounded-xl px-3 py-2 text-xs font-mono text-[var(--text-secondary)]
                     break-all leading-relaxed select-all min-h-[2.5rem]"
          style={{ boxShadow: 'inset 0 0 0 1px var(--border)', background: 'var(--bg-card)' }}
        >
          {tc}
        </div>
        <button
          onClick={onSave}
          className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-sm font-medium"
          style={{
            boxShadow: isSaved
              ? '0 0 0 2px var(--accent), 0 2px 8px rgba(26,86,50,0.15)'
              : 'inset 0 0 0 1px var(--border)',
            background: isSaved ? 'var(--accent)' : 'var(--bg-card)',
            color: isSaved ? 'white' : 'var(--text-secondary)',
            transitionProperty: 'box-shadow, background-color, color',
            transitionDuration: '200ms',
            transitionTimingFunction: 'ease-out',
          }}
          title={isSaved ? 'Saved' : 'Save this tartan'}
        >
          {isSaved ? '\u2605' : '\u2606'}
        </button>
      </div>

      {/* Weave selector */}
      <WeaveSelector threadcount={tc} activeWeave={weave} onChange={onWeaveChange} />

      {/* Explore variations section */}
      <div className="space-y-3 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
        <span className="text-xs font-mono uppercase tracking-widest text-[var(--text-tertiary)]">
          Explore Variations
        </span>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed" style={{ textWrap: 'pretty' } as React.CSSProperties}>
          Tweak the selected pattern&apos;s colors, proportions, or both to discover new designs.
        </p>
        <div className="flex gap-2 flex-wrap">
          {(['colors', 'proportions', 'both'] as const).map((mt) => (
            <button
              key={mt}
              onClick={() => onMutationTypeChange(mt)}
              className={`pill text-xs capitalize
                ${mutationType === mt ? 'pill-active' : 'pill-inactive'}`}
            >
              {mt}
            </button>
          ))}
          <button
            onClick={onMutate}
            className="pill text-xs pill-active ml-auto"
            style={{
              transitionProperty: 'transform',
              transitionDuration: '150ms',
              transitionTimingFunction: 'ease-out',
            }}
            onMouseDown={(e) => { (e.currentTarget.style.transform = 'scale(0.96)'); }}
            onMouseUp={(e) => { (e.currentTarget.style.transform = ''); }}
            onMouseLeave={(e) => { (e.currentTarget.style.transform = ''); }}
          >
            Generate 8
          </button>
        </div>

        {mutations.length > 0 && (
          <>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
              {mutations.map((r, i) => (
                <SwatchCard
                  key={`mut-${r.seed}-${i}`}
                  result={r}
                  size={160}
                  onClick={() => onPromoteMutation(r)}
                  className="flex-shrink-0 w-20 sm:w-24"
                />
              ))}
            </div>
            <p className="text-xs text-[var(--text-tertiary)]" style={{ textWrap: 'pretty' } as React.CSSProperties}>
              Tap a variation to replace the selected swatch.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function GeneratePage() {
  const [searchParams] = useSearchParams();

  // Core state
  const [batch, setBatch] = useState<GeneratorResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [weave, setWeave] = useState<WeaveType>('twill-2-2');
  const [batchKey, setBatchKey] = useState(0); // for re-triggering stagger animation

  // Constraints
  const [preset, setPreset] = useState<string>('classic');
  const [constraints, setConstraints] = useState<GeneratorConstraints>({
    ...DEFAULT_CONSTRAINTS,
    ...CONSTRAINT_PRESETS['classic'],
  });

  // Mutation
  const [mutations, setMutations] = useState<GeneratorResult[]>([]);
  const [mutationType, setMutationType] = useState<'colors' | 'proportions' | 'both'>('colors');

  // Breeding (two-parent crossover)
  const [breedMode, setBreedMode] = useState(false);
  const [breedParents, setBreedParents] = useState<[number | null, number | null]>([null, null]);
  const [offspring, setOffspring] = useState<BredResult[]>([]);

  // History + saved
  const [history, setHistory] = useState<GeneratorResult[]>([]);
  const [saved, setSaved] = useState<GeneratorResult[]>(() => {
    try {
      const raw = localStorage.getItem('tartanism-saved');
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  });
  const [activeTab, setActiveTab] = useState<'none' | 'history' | 'saved'>('none');

  // Persist saved to localStorage
  useEffect(() => {
    try { localStorage.setItem('tartanism-saved', JSON.stringify(saved)); } catch {}
  }, [saved]);

  const passedTc = searchParams.get('tc');

  // Auto-generate on mount
  useEffect(() => {
    if (passedTc) {
      try {
        const sett = parseThreadcount(passedTc);
        const signature = generateSignatures(sett);
        const result: GeneratorResult = { sett, seed: 0, constraints, signature };
        setBatch([result]);
        setActiveIndex(0);
      } catch { generateBatch(); }
    } else {
      generateBatch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeResult = batch[activeIndex] || null;

  function generateBatch() {
    const results: GeneratorResult[] = [];
    for (let i = 0; i < BATCH_SIZE; i++) {
      results.push(generateTartan(constraints));
    }
    setBatch(results);
    setActiveIndex(0);
    setMutations([]);
    setOffspring([]);
    setBreedMode(false);
    setBreedParents([null, null]);
    setBatchKey(prev => prev + 1); // trigger re-stagger
    // Add to history
    setHistory(prev => [...results, ...prev].slice(0, 100));
  }

  function mutateActive() {
    if (!activeResult) return;
    try {
      const results = generateVariations(
        activeResult.sett, 8, mutationType,
        Math.floor(Math.random() * 2147483647)
      );
      setMutations(results);
    } catch {}
  }

  function promoteMutation(result: GeneratorResult) {
    setBatch(prev => {
      const next = [...prev];
      next[activeIndex] = result;
      return next;
    });
    setMutations([]);
    setHistory(prev => [result, ...prev].slice(0, 100));
  }

  function toggleSave() {
    if (!activeResult) return;
    const tc = toThreadcountString(activeResult.sett);
    const idx = saved.findIndex(s => toThreadcountString(s.sett) === tc);
    if (idx >= 0) {
      setSaved(prev => prev.filter((_, i) => i !== idx));
    } else {
      setSaved(prev => [activeResult, ...prev]);
    }
  }

  const isSaved = activeResult
    ? saved.some(s => toThreadcountString(s.sett) === toThreadcountString(activeResult.sett))
    : false;

  // Breeding
  function toggleBreedMode() {
    if (breedMode) {
      setBreedMode(false);
      setBreedParents([null, null]);
      setOffspring([]);
    } else {
      setBreedMode(true);
      setBreedParents([activeIndex, null]);
      setOffspring([]);
    }
  }

  function handleBreedSelect(index: number) {
    if (!breedMode) return;
    if (breedParents[0] === null) {
      setBreedParents([index, null]);
    } else if (breedParents[0] === index) {
      // Deselect
      setBreedParents([null, null]);
    } else {
      // Second parent selected, breed
      setBreedParents([breedParents[0], index]);
      const p1 = batch[breedParents[0]];
      const p2 = batch[index];
      if (p1 && p2) {
        const results = breedTartans(p1.sett, p2.sett, 8);
        setOffspring(results);
        setHistory(prev => [...results, ...prev].slice(0, 100));
      }
    }
  }

  function promoteOffspring(result: GeneratorResult) {
    setBatch(prev => [...prev, result]);
    setHistory(prev => [result, ...prev].slice(0, 100));
  }

  function rebreed() {
    if (breedParents[0] !== null && breedParents[1] !== null) {
      const p1 = batch[breedParents[0]];
      const p2 = batch[breedParents[1]];
      if (p1 && p2) {
        const results = breedTartans(p1.sett, p2.sett, 8);
        setOffspring(results);
        setHistory(prev => [...results, ...prev].slice(0, 100));
      }
    }
  }

  const handlePresetChange = useCallback((newPreset: string) => {
    setPreset(newPreset);
    if (CONSTRAINT_PRESETS[newPreset]) {
      setConstraints({ ...DEFAULT_CONSTRAINTS, ...CONSTRAINT_PRESETS[newPreset] });
    }
  }, []);

  const handleRangeChange = useCallback((
    key: 'colorCount' | 'stripeCount' | 'threadCount' | 'totalThreads',
    bound: 'min' | 'max',
    value: number
  ) => {
    setConstraints((prev) => ({
      ...prev,
      [key]: { ...prev[key], [bound]: value },
    }));
    setPreset('custom');
  }, []);

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8">

        {/* Header row */}
        <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
          <div>
            <h1
              className="text-2xl sm:text-3xl font-serif font-normal text-[var(--text)]"
              style={{ textWrap: 'balance' } as React.CSSProperties}
            >
              Design Studio
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5" style={{ textWrap: 'pretty' } as React.CSSProperties}>
              Browse {BATCH_SIZE} swatches, refine your favorites, crossbreed new patterns.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={toggleBreedMode}
              className="px-4 py-2 rounded-xl text-sm font-medium min-h-[40px]"
              style={{
                boxShadow: breedMode
                  ? '0 0 0 2px #ec4899, 0 2px 8px rgba(236,72,153,0.2)'
                  : 'inset 0 0 0 1px var(--border)',
                background: breedMode ? '#ec4899' : 'transparent',
                color: breedMode ? 'white' : 'var(--text-secondary)',
                transitionProperty: 'box-shadow, background-color, color, transform',
                transitionDuration: '200ms',
                transitionTimingFunction: 'ease-out',
              }}
              onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
              onMouseUp={(e) => { e.currentTarget.style.transform = ''; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = ''; }}
            >
              {breedMode ? 'Cancel crossbreed' : 'Crossbreed'}
            </button>
            <button
              onClick={generateBatch}
              className="px-5 py-2 rounded-xl text-sm font-medium bg-[var(--accent)] text-white min-h-[40px]"
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
              New batch
            </button>
          </div>
        </div>

        {/* Crossbreed mode banner */}
        {breedMode && (
          <div
            className="rounded-xl px-4 py-3 mb-5 text-sm animate-fadeIn"
            style={{
              background: '#fdf2f8',
              boxShadow: 'inset 0 0 0 1px rgba(236,72,153,0.2)',
              color: '#9d174d',
            }}
          >
            {breedParents[1] !== null
              ? `Both parents selected. ${offspring.length} offspring below.`
              : breedParents[0] !== null
                ? 'First parent selected (pink). Tap a second swatch to crossbreed.'
                : 'Tap two swatches to select parents for crossover breeding.'
            }
          </div>
        )}

        {/* Style presets */}
        <div className="flex gap-2 flex-wrap items-center mb-4">
          <span className="text-xs font-mono uppercase tracking-widest text-[var(--text-tertiary)] mr-1">
            Style
          </span>
          {['simple', 'classic', 'complex', 'minimal', 'hunting', 'dress'].map((p) => (
            <button
              key={p}
              onClick={() => handlePresetChange(p)}
              className={`pill text-xs capitalize ${preset === p ? 'pill-active' : 'pill-inactive'}`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Advanced constraints -- collapsed */}
        <details className="mb-6">
          <summary className="text-xs text-[var(--text-secondary)] cursor-pointer mb-3 select-none">
            Advanced settings
          </summary>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <RangeControl label="Colors" min={constraints.colorCount.min} max={constraints.colorCount.max}
              absMin={2} absMax={8}
              onMinChange={(v) => handleRangeChange('colorCount', 'min', v)}
              onMaxChange={(v) => handleRangeChange('colorCount', 'max', v)} />
            <RangeControl label="Stripes" min={constraints.stripeCount.min} max={constraints.stripeCount.max}
              absMin={2} absMax={16}
              onMinChange={(v) => handleRangeChange('stripeCount', 'min', v)}
              onMaxChange={(v) => handleRangeChange('stripeCount', 'max', v)} />
            <RangeControl label="Per stripe" min={constraints.threadCount.min} max={constraints.threadCount.max}
              absMin={2} absMax={64}
              onMinChange={(v) => handleRangeChange('threadCount', 'min', v)}
              onMaxChange={(v) => handleRangeChange('threadCount', 'max', v)} />
            <RangeControl label="Total" min={constraints.totalThreads.min} max={constraints.totalThreads.max}
              absMin={20} absMax={400}
              onMinChange={(v) => handleRangeChange('totalThreads', 'min', v)}
              onMaxChange={(v) => handleRangeChange('totalThreads', 'max', v)} />
          </div>
        </details>

        {/* Main layout: grid + sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">

          {/* Batch grid -- staggered entrance */}
          <div className="space-y-6">
            <div key={batchKey} className="grid grid-cols-3 gap-2 sm:gap-3 stagger-grid">
              {batch.map((result, i) => (
                <SwatchCard
                  key={`batch-${result.seed}-${i}`}
                  result={result}
                  size={240}
                  isActive={!breedMode && i === activeIndex}
                  isSelected={breedMode && (breedParents[0] === i || breedParents[1] === i)}
                  label={
                    breedMode && breedParents[0] === i ? 'Parent 1'
                    : breedMode && breedParents[1] === i ? 'Parent 2'
                    : undefined
                  }
                  onClick={() => {
                    if (breedMode) {
                      handleBreedSelect(i);
                    } else {
                      setActiveIndex(i);
                      setMutations([]);
                    }
                  }}
                />
              ))}
            </div>

            {/* Offspring from crossbreeding */}
            {offspring.length > 0 && (
              <div className="space-y-3 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-widest text-[var(--text-tertiary)]">
                    Offspring <span className="tabular-nums">({offspring.length})</span>
                  </span>
                  <button
                    onClick={rebreed}
                    className="text-xs text-pink-500 font-medium"
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
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 stagger-grid">
                  {offspring.map((r, i) => (
                    <SwatchCard
                      key={`off-${r.seed}-${i}`}
                      result={r}
                      size={160}
                      onClick={() => promoteOffspring(r)}
                      label={r.strategy}
                    />
                  ))}
                </div>
                <p className="text-xs text-[var(--text-tertiary)]" style={{ textWrap: 'pretty' } as React.CSSProperties}>
                  Offspring inherit each parent&apos;s dominant and accent colors. Tap one to add it to the grid,
                  or breed again for a fresh litter from the same parents.
                </p>
              </div>
            )}

          </div>

          {/* Detail sidebar */}
          {activeResult && !breedMode && (
            <DetailSidebar
              result={activeResult}
              weave={weave}
              onWeaveChange={setWeave}
              onMutate={mutateActive}
              mutations={mutations}
              onPromoteMutation={promoteMutation}
              mutationType={mutationType}
              onMutationTypeChange={setMutationType}
              onSave={toggleSave}
              isSaved={isSaved}
            />
          )}
        </div>

        {/* History + Saved -- tab interface, full width below the workbench */}
        <div className="mt-8 pt-4" style={{ borderTop: '1px solid var(--border)' }} id="history-section">
          <div className="flex gap-1 mb-4" role="tablist">
            <button
              role="tab"
              aria-selected={activeTab === 'history'}
              onClick={() => setActiveTab(activeTab === 'history' ? 'none' : 'history')}
              className="px-4 py-2 rounded-xl text-xs font-medium min-h-[40px]"
              style={{
                background: activeTab === 'history' ? 'var(--accent)' : 'var(--bg-card)',
                color: activeTab === 'history' ? 'white' : 'var(--text-secondary)',
                boxShadow: activeTab === 'history' ? undefined : 'inset 0 0 0 1px var(--border)',
                transitionProperty: 'background-color, color, box-shadow',
                transitionDuration: '200ms',
                transitionTimingFunction: 'ease-out',
              }}
            >
              History <span className="tabular-nums">({history.length})</span>
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'saved'}
              onClick={() => setActiveTab(activeTab === 'saved' ? 'none' : 'saved')}
              className="px-4 py-2 rounded-xl text-xs font-medium min-h-[40px]"
              style={{
                background: activeTab === 'saved' ? 'var(--accent)' : 'var(--bg-card)',
                color: activeTab === 'saved' ? 'white' : 'var(--text-secondary)',
                boxShadow: activeTab === 'saved' ? undefined : 'inset 0 0 0 1px var(--border)',
                transitionProperty: 'background-color, color, box-shadow',
                transitionDuration: '200ms',
                transitionTimingFunction: 'ease-out',
              }}
            >
              Saved <span className="tabular-nums">({saved.length})</span>
            </button>
          </div>

          {/* History grid */}
          {activeTab === 'history' && (
            <div className="space-y-2 animate-fadeIn">
              {history.length === 0 ? (
                <p className="text-sm text-[var(--text-tertiary)] py-6 text-center">
                  Generate some tartans first.
                </p>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
                  {history.map((r, i) => (
                    <SwatchCard
                      key={`hist-${r.seed}-${i}`}
                      result={r}
                      size={160}
                      onClick={() => {
                        setBatch(prev => {
                          const next = [...prev];
                          next[activeIndex] = r;
                          return next;
                        });
                      }}
                      className="w-full"
                    />
                  ))}
                </div>
              )}
              <p className="text-xs text-[var(--text-tertiary)]">
                Tap any to load into the selected grid slot.
              </p>
            </div>
          )}

          {/* Saved grid */}
          {activeTab === 'saved' && (
            <div className="space-y-2 animate-fadeIn">
              {saved.length === 0 ? (
                <p className="text-sm text-[var(--text-tertiary)] py-6 text-center" style={{ textWrap: 'balance' } as React.CSSProperties}>
                  No saved tartans yet. Select a tartan and tap the star to save.
                </p>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
                  {saved.map((r, i) => (
                    <SwatchCard
                      key={`saved-${r.seed}-${i}`}
                      result={r}
                      size={160}
                      onClick={() => {
                        setBatch(prev => {
                          const next = [...prev];
                          next[activeIndex] = r;
                          return next;
                        });
                      }}
                      className="w-full"
                    />
                  ))}
                </div>
              )}
              <p className="text-xs text-[var(--text-tertiary)]">
                Saved tartans persist across sessions. Tap to load.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Range control with touch-friendly sizing (min 40px hit area)
// ---------------------------------------------------------------------------

function RangeControl({
  label, min, max, absMin, absMax, onMinChange, onMaxChange,
}: {
  label: string; min: number; max: number; absMin: number; absMax: number;
  onMinChange: (v: number) => void; onMaxChange: (v: number) => void;
}) {
  return (
    <div
      className="rounded-xl p-3"
      style={{ boxShadow: 'inset 0 0 0 1px var(--border)', background: 'var(--bg-card)' }}
    >
      <label className="text-xs font-mono uppercase tracking-widest text-[var(--text-tertiary)] block mb-1">
        {label}
      </label>
      <div className="text-xs text-[var(--text-secondary)] mb-2 tabular-nums">{min} {'\u2013'} {max}</div>
      <div className="space-y-3">
        <input type="range" min={absMin} max={absMax} value={min}
          onChange={(e) => onMinChange(Math.min(Number(e.target.value), max))}
          className="w-full h-2 bg-[var(--border)] rounded-full appearance-none cursor-pointer touch-pan-y
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                     [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent)]
                     [&::-webkit-slider-thumb]:cursor-pointer" />
        <input type="range" min={absMin} max={absMax} value={max}
          onChange={(e) => onMaxChange(Math.max(Number(e.target.value), min))}
          className="w-full h-2 bg-[var(--border)] rounded-full appearance-none cursor-pointer touch-pan-y
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                     [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent)]
                     [&::-webkit-slider-thumb]:cursor-pointer" />
      </div>
    </div>
  );
}
