import { useState, useCallback, useRef, useEffect } from 'react';
import { generateBatch, DEFAULT_CONSTRAINTS, generateTartan } from './core/generator';
import { TARTAN_COLORS, getColor, rgbToHex, adjustBrightness } from './core/colors';
import { expandSett, Sett, parseThreadcount } from './core/sett';
import { WEAVE_PATTERNS, getIntersectionColor, WeaveType } from './core/weaves';
import { applyMask, SHAPE_PRESETS, ShapeMaskType, ShapeMaskOptions, createDefaultMaskOptions } from './optical/shapes';
import { GeneratorResult, ThreadStripe, YarnWeight } from './core/types';
import { generateWIF } from './export/wif';
import { calculateForProduct, PRODUCT_TEMPLATES, YARN_PROFILES, formatMaterialsSummary, estimateCost } from './production/yarnCalculator';

// ============================================================================
// TYPES
// ============================================================================

interface TartanCardData {
  id: string;
  result: GeneratorResult;
  parentId?: string;
  isOptical?: boolean;
}

interface GeneratorConfig {
  batchSize: number;
  colorMin: number;
  colorMax: number;
  stripeMin: number;
  stripeMax: number;
  threadMin: number;
  threadMax: number;
  totalMin: number;
  totalMax: number;
  threadGauge: number;
  weaveType: WeaveType;
  symmetry: 'symmetric' | 'asymmetric' | 'either';
  opticalMode: boolean;
  shapeMask: ShapeMaskOptions;
  allowedColors: string[];
}

type ViewMode = 'generator' | 'builder';

type TileSize = 'swatch' | 'pocket' | 'tie' | 'scarf' | 'kilt' | 'blanket';

interface CustomColor {
  code: string;
  name: string;
  hex: string;
}

const TILE_SIZES: Record<TileSize, { repeats: number; name: string; inches: string }> = {
  swatch: { repeats: 1, name: 'Swatch', inches: '~6"' },
  pocket: { repeats: 2, name: 'Pocket Square', inches: '~10"' },
  tie: { repeats: 3, name: 'Tie', inches: '~3.5"' },
  scarf: { repeats: 4, name: 'Scarf', inches: '~12"' },
  kilt: { repeats: 6, name: 'Kilt Panel', inches: '~24"' },
  blanket: { repeats: 8, name: 'Blanket', inches: '~48"' },
};

// ============================================================================
// COLOR PRESETS
// ============================================================================

const COLOR_PRESETS: Record<string, { name: string; colors: string[]; description: string; category?: string }> = {
  // === FULL PALETTES ===
  all: {
    name: 'All Colors',
    colors: Object.keys(TARTAN_COLORS),
    description: 'Full 48-color palette',
    category: 'Full'
  },

  // === FAMOUS CLAN TARTANS ===
  royalStewart: {
    name: 'Royal Stewart',
    colors: ['R', 'CR', 'B', 'Y', 'K', 'W', 'G'],
    description: 'The official tartan of the Royal House of Stewart',
    category: 'Clan'
  },
  blackWatch: {
    name: 'Black Watch',
    colors: ['DB', 'NB', 'DG', 'HG', 'K', 'B', 'G'],
    description: 'Military regiment tartan (42nd Highland)',
    category: 'Clan'
  },
  campbell: {
    name: 'Campbell',
    colors: ['DG', 'B', 'K', 'Y', 'W', 'G', 'NB'],
    description: 'Clan Campbell of Argyll',
    category: 'Clan'
  },
  macleod: {
    name: 'MacLeod',
    colors: ['Y', 'K', 'R', 'GD', 'DR'],
    description: 'Clan MacLeod - distinctive yellow',
    category: 'Clan'
  },
  macdonald: {
    name: 'MacDonald',
    colors: ['R', 'DG', 'B', 'K', 'G', 'NB'],
    description: 'Clan Donald - Lords of the Isles',
    category: 'Clan'
  },
  gordon: {
    name: 'Gordon',
    colors: ['DG', 'NB', 'Y', 'K', 'W', 'G', 'B'],
    description: 'Clan Gordon of Aberdeenshire',
    category: 'Clan'
  },
  fraser: {
    name: 'Fraser',
    colors: ['R', 'DG', 'W', 'NB', 'G', 'K'],
    description: 'Clan Fraser of Lovat',
    category: 'Clan'
  },
  buchanan: {
    name: 'Buchanan',
    colors: ['Y', 'R', 'DG', 'W', 'K', 'GD'],
    description: 'Clan Buchanan - yellow and green',
    category: 'Clan'
  },
  cameron: {
    name: 'Cameron',
    colors: ['R', 'DG', 'Y', 'K', 'G'],
    description: 'Clan Cameron of Lochiel',
    category: 'Clan'
  },
  douglas: {
    name: 'Douglas',
    colors: ['DG', 'B', 'GY', 'K', 'W'],
    description: 'Clan Douglas - Grey Douglas',
    category: 'Clan'
  },

  // === FASHION & DESIGNER INSPIRED ===
  burberry: {
    name: 'Burberry Style',
    colors: ['TN', 'K', 'R', 'W', 'CB'],
    description: 'Classic British check inspired',
    category: 'Fashion'
  },
  gingham: {
    name: 'Gingham',
    colors: ['W', 'B', 'R', 'K'],
    description: 'Simple two-tone checks',
    category: 'Fashion'
  },
  madras: {
    name: 'Madras',
    colors: ['Y', 'O', 'PK', 'TL', 'LG', 'LB', 'LR'],
    description: 'Bright Indian-style plaids',
    category: 'Fashion'
  },
  preppy: {
    name: 'Preppy',
    colors: ['NB', 'R', 'GD', 'W', 'DG', 'K'],
    description: 'Classic Ivy League style',
    category: 'Fashion'
  },
  punk: {
    name: 'Punk Tartan',
    colors: ['R', 'K', 'W', 'Y', 'PK', 'P'],
    description: 'Vivienne Westwood inspired',
    category: 'Fashion'
  },
  nordic: {
    name: 'Nordic',
    colors: ['W', 'NB', 'R', 'GY', 'CW'],
    description: 'Scandinavian minimalism',
    category: 'Fashion'
  },

  // === REGIONAL & DISTRICT ===
  edinburgh: {
    name: 'Edinburgh',
    colors: ['RB', 'GD', 'K', 'W', 'R'],
    description: 'Scottish capital colors',
    category: 'Regional'
  },
  highland: {
    name: 'Highland',
    colors: ['B', 'DB', 'NB', 'R', 'DR', 'G', 'DG', 'HG', 'K', 'W', 'Y', 'GD'],
    description: 'Classic Scottish tartan colors',
    category: 'Regional'
  },
  irish: {
    name: 'Irish',
    colors: ['G', 'DG', 'HG', 'W', 'GD', 'O'],
    description: 'Irish green palettes',
    category: 'Regional'
  },
  welsh: {
    name: 'Welsh',
    colors: ['R', 'DG', 'W', 'K', 'G'],
    description: 'Welsh national colors',
    category: 'Regional'
  },

  // === MOOD & THEME ===
  earthTones: {
    name: 'Earth Tones',
    colors: ['BR', 'LBR', 'DBR', 'TN', 'RU', 'CB', 'OG', 'HG', 'CW', 'ST', 'GD'],
    description: 'Natural, warm colors',
    category: 'Theme'
  },
  jewels: {
    name: 'Jewel Tones',
    colors: ['DP', 'VI', 'DB', 'RB', 'DR', 'DG', 'GD', 'AM'],
    description: 'Rich, saturated colors',
    category: 'Theme'
  },
  muted: {
    name: 'Muted/Ancient',
    colors: ['LB', 'LG', 'LR', 'LY', 'GY', 'LGY', 'TN', 'CW', 'LV', 'LO'],
    description: 'Soft, faded weathered tones',
    category: 'Theme'
  },
  modern: {
    name: 'Modern Bright',
    colors: ['B', 'R', 'G', 'Y', 'O', 'P', 'PK', 'TL', 'W', 'K'],
    description: 'Vivid contemporary colors',
    category: 'Theme'
  },
  monochrome: {
    name: 'Monochrome',
    colors: ['K', 'DGY', 'GY', 'LGY', 'CH', 'W', 'CW'],
    description: 'Black, white, and grays',
    category: 'Theme'
  },
  warmth: {
    name: 'Warm Sunset',
    colors: ['R', 'LR', 'CR', 'O', 'LO', 'DO', 'Y', 'GD', 'AM', 'PK', 'RU'],
    description: 'Reds, oranges, yellows',
    category: 'Theme'
  },
  cool: {
    name: 'Cool Ocean',
    colors: ['B', 'LB', 'DB', 'AB', 'RB', 'NB', 'TL', 'G', 'LG', 'P', 'LV'],
    description: 'Blues, greens, purples',
    category: 'Theme'
  },
  forest: {
    name: 'Forest',
    colors: ['DG', 'HG', 'FG', 'OG', 'BR', 'DBR', 'K', 'TN'],
    description: 'Deep woodland colors',
    category: 'Theme'
  },
  autumn: {
    name: 'Autumn',
    colors: ['RU', 'O', 'GD', 'BR', 'DR', 'OG', 'AM', 'TN'],
    description: 'Fall foliage colors',
    category: 'Theme'
  },
  winter: {
    name: 'Winter',
    colors: ['W', 'LB', 'NB', 'GY', 'LGY', 'CW', 'DB'],
    description: 'Cold, icy tones',
    category: 'Theme'
  },
  spring: {
    name: 'Spring',
    colors: ['LG', 'PK', 'LY', 'LV', 'LB', 'W', 'LP'],
    description: 'Fresh pastel colors',
    category: 'Theme'
  },
  summer: {
    name: 'Summer',
    colors: ['Y', 'O', 'TL', 'LB', 'PK', 'G', 'W'],
    description: 'Bright sunny colors',
    category: 'Theme'
  },
  midnight: {
    name: 'Midnight',
    colors: ['NB', 'DP', 'K', 'DGY', 'DB', 'VI'],
    description: 'Deep night colors',
    category: 'Theme'
  },
  vintage: {
    name: 'Vintage',
    colors: ['TN', 'CW', 'RU', 'OG', 'GY', 'LBR', 'MR'],
    description: 'Nostalgic faded colors',
    category: 'Theme'
  },
};

// ============================================================================
// CANVAS RENDERER
// ============================================================================

function renderTartan(
  canvas: HTMLCanvasElement,
  sett: Sett,
  weaveType: WeaveType,
  scale: number = 2,
  repeats: number = 1,
  shapeMask?: ShapeMaskOptions,
  customColors?: CustomColor[]
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Helper to get color from standard or custom colors
  const lookupColor = (code: string): { hex: string; rgb: { r: number; g: number; b: number } } | null => {
    const standard = getColor(code);
    if (standard) return { hex: standard.hex, rgb: standard.rgb };
    const custom = customColors?.find(c => c.code.toUpperCase() === code.toUpperCase());
    if (custom) {
      // Parse hex to RGB
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(custom.hex);
      if (result) {
        return {
          hex: custom.hex,
          rgb: {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
          }
        };
      }
    }
    return null;
  };

  const expanded = expandSett(sett);
  const weave = WEAVE_PATTERNS[weaveType];
  const settSize = expanded.length;
  const size = settSize * repeats * scale;

  canvas.width = size;
  canvas.height = size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const warpIdx = Math.floor(x / scale) % settSize;
      const weftIdx = Math.floor(y / scale) % settSize;

      const pixel = getIntersectionColor(expanded, expanded, weave, warpIdx, weftIdx);
      const colorData = lookupColor(pixel.color);

      if (!colorData) continue;

      let rgb = { ...colorData.rgb };

      // Apply shape mask if enabled
      if (shapeMask && shapeMask.type !== 'none') {
        const maskPixel = applyMask(x, y, size, size, shapeMask);
        rgb = adjustBrightness(rgb, maskPixel.brightness);
      }

      ctx.fillStyle = rgbToHex(rgb);
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

// ============================================================================
// COMPONENTS
// ============================================================================

function TartanCanvas({
  sett,
  weaveType,
  scale = 2,
  repeats = 1,
  shapeMask,
  customColors,
  onClick,
  className = ''
}: {
  sett: Sett;
  weaveType: WeaveType;
  scale?: number;
  repeats?: number;
  shapeMask?: ShapeMaskOptions;
  customColors?: CustomColor[];
  onClick?: () => void;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      renderTartan(canvasRef.current, sett, weaveType, scale, repeats, shapeMask, customColors);
    }
  }, [sett, weaveType, scale, repeats, shapeMask, customColors]);

  return (
    <canvas
      ref={canvasRef}
      className={`${className} ${onClick ? 'cursor-pointer hover:ring-2 hover:ring-indigo-500 transition-all' : ''}`}
      onClick={onClick}
    />
  );
}

function ColorChip({ code, small = false }: { code: string; small?: boolean }) {
  const color = getColor(code);
  if (!color) return null;

  return (
    <div
      className={`${small ? 'w-4 h-4' : 'w-6 h-6'} rounded border border-gray-600 flex-shrink-0`}
      style={{ backgroundColor: color.hex }}
      title={`${color.name} (${code})`}
    />
  );
}

function TartanCard({
  data,
  config,
  customColors,
  onMutate,
  onEdit,
  onTiledPreview,
  onCopySeed,
  onDownloadSVG,
  onDownloadWIF,
  onShowYarnCalc
}: {
  data: TartanCardData;
  config: GeneratorConfig;
  customColors?: CustomColor[];
  onMutate: (data: TartanCardData) => void;
  onEdit: (data: TartanCardData) => void;
  onTiledPreview: (data: TartanCardData) => void;
  onCopySeed: (seed: number) => void;
  onDownloadSVG: (data: TartanCardData) => void;
  onDownloadWIF: (data: TartanCardData) => void;
  onShowYarnCalc: (data: TartanCardData) => void;
}) {
  const { result, isOptical, parentId } = data;
  const { sett, seed } = result;
  const expanded = expandSett(sett);
  const settInches = (expanded.length / config.threadGauge).toFixed(2);

  return (
    <div className="card p-4 space-y-3 animate-fadeIn">
      <div className="flex items-start justify-between">
        <div className="flex flex-wrap gap-1">
          {sett.colors.map(code => <ColorChip key={code} code={code} />)}
        </div>
        <div className="flex gap-1">
          {isOptical && <span className="text-xs px-2 py-0.5 bg-purple-900/50 text-purple-300 rounded-full">Optical</span>}
          {parentId && <span className="text-xs px-2 py-0.5 bg-green-900/50 text-green-300 rounded-full">Mutant</span>}
        </div>
      </div>

      <TartanCanvas
        sett={sett}
        weaveType={config.weaveType}
        scale={2}
        repeats={1}
        shapeMask={isOptical ? config.shapeMask : undefined}
        customColors={customColors}
        onClick={() => onTiledPreview(data)}
        className="w-full aspect-square rounded-lg"
      />

      <div
        className="font-mono text-xs text-gray-400 truncate cursor-pointer hover:text-gray-200 transition-colors"
        onClick={() => navigator.clipboard.writeText(sett.threadcount)}
        title="Click to copy threadcount"
      >
        {sett.threadcount}
      </div>

      <div className="flex justify-between text-xs text-gray-500">
        <span>{expanded.length} threads</span>
        <span>{settInches}" sett</span>
        <span>{sett.colors.length} colors</span>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button onClick={() => onMutate(data)} className="btn-secondary text-xs flex-1 min-w-[60px]" title="Generate variations">
          Mutate
        </button>
        <button onClick={() => onEdit(data)} className="btn-secondary text-xs flex-1 min-w-[60px]" title="Edit pattern">
          Edit
        </button>
        <button onClick={() => onShowYarnCalc(data)} className="btn-secondary text-xs px-2" title="Yarn Calculator">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </button>
        <button onClick={() => onDownloadSVG(data)} className="btn-secondary text-xs px-2" title="Download SVG">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>
        <button onClick={() => onDownloadWIF(data)} className="btn-secondary text-xs px-2" title="Download WIF (Loom Draft)">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </button>
        <button onClick={() => onCopySeed(seed)} className="btn-secondary text-xs px-2" title="Copy seed">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function ConfigPanel({
  config,
  onChange,
  onGenerate,
  onOpenColorBuilder,
  customColors
}: {
  config: GeneratorConfig;
  onChange: (config: GeneratorConfig) => void;
  onGenerate: () => void;
  onOpenColorBuilder: () => void;
  customColors: CustomColor[];
}) {
  const colorCategories = [
    { name: 'Blues', codes: ['B', 'LB', 'DB', 'AB', 'RB', 'NB'] },
    { name: 'Reds', codes: ['R', 'LR', 'DR', 'CR', 'SC', 'MR'] },
    { name: 'Greens', codes: ['G', 'LG', 'DG', 'HG', 'OG', 'FG', 'TL'] },
    { name: 'Yellows', codes: ['Y', 'LY', 'GD', 'AM', 'ST'] },
    { name: 'Neutrals', codes: ['K', 'W', 'GY', 'LGY', 'DGY', 'CH', 'CW', 'IW'] },
    { name: 'Browns', codes: ['BR', 'LBR', 'DBR', 'TN', 'RU', 'CB'] },
    { name: 'Purples', codes: ['P', 'LP', 'DP', 'VI', 'LV'] },
    { name: 'Oranges', codes: ['O', 'LO', 'DO'] },
    { name: 'Pinks', codes: ['PK', 'LP2', 'DP2'] },
  ];

  const toggleColor = (code: string) => {
    const newColors = config.allowedColors.includes(code)
      ? config.allowedColors.filter(c => c !== code)
      : [...config.allowedColors, code];
    onChange({ ...config, allowedColors: newColors });
  };

  const toggleCategory = (codes: string[]) => {
    const allSelected = codes.every(c => config.allowedColors.includes(c));
    const newColors = allSelected
      ? config.allowedColors.filter(c => !codes.includes(c))
      : [...new Set([...config.allowedColors, ...codes])];
    onChange({ ...config, allowedColors: newColors });
  };

  return (
    <div className="card p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-100 mb-4">Generator Settings</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Batch Size</label>
            <input
              type="number"
              min="1"
              max="50"
              value={config.batchSize}
              onChange={e => onChange({ ...config, batchSize: Math.min(50, Math.max(1, parseInt(e.target.value) || 1)) })}
              className="input"
            />
          </div>

          <div>
            <label className="label">Thread Gauge (TPI)</label>
            <input
              type="number"
              min="12"
              max="96"
              value={config.threadGauge}
              onChange={e => onChange({ ...config, threadGauge: parseInt(e.target.value) || 24 })}
              className="input"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="label">Colors ({config.colorMin} - {config.colorMax})</label>
        <div className="flex gap-2 items-center">
          <input
            type="range"
            min="2"
            max="12"
            value={config.colorMin}
            onChange={e => onChange({ ...config, colorMin: parseInt(e.target.value) })}
            className="slider flex-1"
          />
          <span className="text-gray-400 w-8 text-center">{config.colorMin}</span>
          <span className="text-gray-500">to</span>
          <input
            type="range"
            min="2"
            max="12"
            value={config.colorMax}
            onChange={e => onChange({ ...config, colorMax: parseInt(e.target.value) })}
            className="slider flex-1"
          />
          <span className="text-gray-400 w-8 text-center">{config.colorMax}</span>
        </div>
      </div>

      <div>
        <label className="label">Stripes ({config.stripeMin} - {config.stripeMax})</label>
        <div className="flex gap-2 items-center">
          <input
            type="range"
            min="2"
            max="24"
            value={config.stripeMin}
            onChange={e => onChange({ ...config, stripeMin: parseInt(e.target.value) })}
            className="slider flex-1"
          />
          <span className="text-gray-400 w-8 text-center">{config.stripeMin}</span>
          <span className="text-gray-500">to</span>
          <input
            type="range"
            min="2"
            max="24"
            value={config.stripeMax}
            onChange={e => onChange({ ...config, stripeMax: parseInt(e.target.value) })}
            className="slider flex-1"
          />
          <span className="text-gray-400 w-8 text-center">{config.stripeMax}</span>
        </div>
      </div>

      <div>
        <label className="label">Thread Width ({config.threadMin} - {config.threadMax})</label>
        <div className="flex gap-2 items-center">
          <input
            type="range"
            min="2"
            max="96"
            step="2"
            value={config.threadMin}
            onChange={e => onChange({ ...config, threadMin: parseInt(e.target.value) })}
            className="slider flex-1"
          />
          <span className="text-gray-400 w-8 text-center">{config.threadMin}</span>
          <span className="text-gray-500">to</span>
          <input
            type="range"
            min="2"
            max="96"
            step="2"
            value={config.threadMax}
            onChange={e => onChange({ ...config, threadMax: parseInt(e.target.value) })}
            className="slider flex-1"
          />
          <span className="text-gray-400 w-8 text-center">{config.threadMax}</span>
        </div>
      </div>

      <div>
        <label className="label">Total Threads ({config.totalMin} - {config.totalMax})</label>
        <div className="flex gap-2 items-center">
          <input
            type="range"
            min="20"
            max="600"
            step="10"
            value={config.totalMin}
            onChange={e => onChange({ ...config, totalMin: parseInt(e.target.value) })}
            className="slider flex-1"
          />
          <span className="text-gray-400 w-12 text-center">{config.totalMin}</span>
          <span className="text-gray-500">to</span>
          <input
            type="range"
            min="20"
            max="600"
            step="10"
            value={config.totalMax}
            onChange={e => onChange({ ...config, totalMax: parseInt(e.target.value) })}
            className="slider flex-1"
          />
          <span className="text-gray-400 w-12 text-center">{config.totalMax}</span>
        </div>
      </div>

      <div>
        <label className="label">Weave Pattern</label>
        <select
          value={config.weaveType}
          onChange={e => onChange({ ...config, weaveType: e.target.value as WeaveType })}
          className="input"
        >
          {Object.entries(WEAVE_PATTERNS).map(([key, pattern]) => (
            <option key={key} value={key}>{pattern.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">Symmetry</label>
        <div className="flex gap-2">
          {(['symmetric', 'asymmetric', 'either'] as const).map(sym => (
            <button
              key={sym}
              onClick={() => onChange({ ...config, symmetry: sym })}
              className={`flex-1 py-2 px-3 rounded-lg text-sm transition-all ${
                config.symmetry === sym
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {sym.charAt(0).toUpperCase() + sym.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="label mb-0">Optical Illusion Mode</label>
          <button
            onClick={() => onChange({ ...config, opticalMode: !config.opticalMode })}
            className={`w-12 h-6 rounded-full transition-colors ${config.opticalMode ? 'bg-purple-600' : 'bg-gray-700'}`}
          >
            <div className={`w-5 h-5 rounded-full bg-white transition-transform ${config.opticalMode ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
        </div>

        {config.opticalMode && (
          <div className="mt-3 space-y-3 p-3 bg-purple-900/20 rounded-lg border border-purple-800/30">
            <div>
              <label className="label text-purple-300">Shape Preset</label>
              <select
                value={config.shapeMask.type}
                onChange={e => {
                  const preset = SHAPE_PRESETS[e.target.value as keyof typeof SHAPE_PRESETS];
                  if (preset) {
                    onChange({ ...config, shapeMask: preset });
                  } else {
                    onChange({ ...config, shapeMask: { ...config.shapeMask, type: e.target.value as ShapeMaskType } });
                  }
                }}
                className="input bg-purple-900/30 border-purple-700"
              >
                <option value="none">None</option>
                <option value="cube">Cubes</option>
                <option value="hexagon">Hexagons</option>
                <option value="sphere">Spheres</option>
                <option value="wave">Waves</option>
                <option value="diamond">Diamonds</option>
                <option value="penrose">Penrose</option>
                <option value="escher">Escher Stairs</option>
              </select>
            </div>

            {config.shapeMask.type !== 'none' && (
              <>
                <div>
                  <label className="label text-purple-300">Element Size ({config.shapeMask.elementSize})</label>
                  <input
                    type="range"
                    min="20"
                    max="100"
                    value={config.shapeMask.elementSize}
                    onChange={e => onChange({
                      ...config,
                      shapeMask: { ...config.shapeMask, elementSize: parseInt(e.target.value) }
                    })}
                    className="slider"
                  />
                </div>
                <div>
                  <label className="label text-purple-300">Depth ({(config.shapeMask.depth * 100).toFixed(0)}%)</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={config.shapeMask.depth * 100}
                    onChange={e => onChange({
                      ...config,
                      shapeMask: { ...config.shapeMask, depth: parseInt(e.target.value) / 100 }
                    })}
                    className="slider"
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div>
        <label className="label">Color Palette</label>

        {/* Preset Selector */}
        <div className="flex gap-2 mb-3">
          <select
            onChange={e => {
              const preset = COLOR_PRESETS[e.target.value];
              if (preset) {
                onChange({ ...config, allowedColors: [...preset.colors] });
              }
            }}
            className="input flex-1 text-sm"
            defaultValue=""
          >
            <option value="" disabled>Load Preset...</option>
            {Object.entries(COLOR_PRESETS).map(([key, preset]) => (
              <option key={key} value={key}>{preset.name}</option>
            ))}
          </select>
          <button
            onClick={() => {
              // Random palette: pick 5-8 random colors
              const allColors = Object.keys(TARTAN_COLORS);
              const count = 5 + Math.floor(Math.random() * 4);
              const shuffled = [...allColors].sort(() => Math.random() - 0.5);
              onChange({ ...config, allowedColors: shuffled.slice(0, count) });
            }}
            className="btn-secondary text-sm px-3"
            title="Generate random palette"
          >
            🎲
          </button>
        </div>

        {/* Save/Load Custom Palette */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => {
              const name = prompt('Name your palette:');
              if (name) {
                const saved = JSON.parse(localStorage.getItem('tartanism-palettes') || '{}');
                saved[name] = config.allowedColors;
                localStorage.setItem('tartanism-palettes', JSON.stringify(saved));
                alert(`Palette "${name}" saved!`);
              }
            }}
            className="btn-secondary text-xs flex-1"
          >
            💾 Save Custom
          </button>
          <button
            onClick={() => {
              const saved = JSON.parse(localStorage.getItem('tartanism-palettes') || '{}');
              const names = Object.keys(saved);
              if (names.length === 0) {
                alert('No saved palettes yet!');
                return;
              }
              const choice = prompt(`Load palette:\n${names.map((n, i) => `${i + 1}. ${n}`).join('\n')}\n\nEnter name:`);
              if (choice && saved[choice]) {
                onChange({ ...config, allowedColors: saved[choice] });
              }
            }}
            className="btn-secondary text-xs flex-1"
          >
            📂 Load Custom
          </button>
        </div>

        {/* Yarn Color Builder */}
        <button
          onClick={onOpenColorBuilder}
          className="w-full btn-secondary text-sm mb-3 flex items-center justify-center gap-2"
        >
          <span>🎨</span>
          <span>Yarn Color Builder</span>
          {customColors.length > 0 && (
            <span className="bg-indigo-600 text-white text-xs px-2 py-0.5 rounded-full">{customColors.length}</span>
          )}
        </button>

        {/* Color Selection */}
        <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
          {colorCategories.map(cat => (
            <div key={cat.name}>
              <button
                onClick={() => toggleCategory(cat.codes)}
                className="text-xs text-gray-400 hover:text-gray-200 mb-1"
              >
                {cat.name}
              </button>
              <div className="flex flex-wrap gap-1">
                {cat.codes.map(code => {
                  const color = getColor(code);
                  if (!color) return null;
                  return (
                    <button
                      key={code}
                      onClick={() => toggleColor(code)}
                      className={`w-6 h-6 rounded border-2 transition-all ${
                        config.allowedColors.includes(code)
                          ? 'border-white scale-110'
                          : 'border-transparent opacity-40'
                      }`}
                      style={{ backgroundColor: color.hex }}
                      title={color.name}
                    />
                  );
                })}
              </div>
            </div>
          ))}

          {/* Custom Colors */}
          {customColors.length > 0 && (
            <div>
              <span className="text-xs text-indigo-400">Custom</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {customColors.map((cc) => (
                  <div
                    key={cc.code}
                    className="w-6 h-6 rounded border-2 border-indigo-400 opacity-60 cursor-help"
                    style={{ backgroundColor: cc.hex }}
                    title={`${cc.name} (${cc.code}) - Use in Pattern Builder`}
                  />
                ))}
              </div>
              <p className="text-[10px] text-gray-500 mt-1">Use in Pattern Builder</p>
            </div>
          )}
        </div>
        <div className="text-xs text-gray-500 mt-2">
          {config.allowedColors.length} colors selected
        </div>
      </div>

      <button onClick={onGenerate} className="btn-primary w-full text-lg">
        Roll {config.batchSize} Tartan{config.batchSize > 1 ? 's' : ''}
      </button>
    </div>
  );
}

function PatternBuilder({
  initialSett,
  config,
  customColors,
  onSave,
  onClose
}: {
  initialSett?: Sett;
  config: GeneratorConfig;
  customColors: CustomColor[];
  onSave: (sett: Sett) => void;
  onClose: () => void;
}) {
  const [stripes, setStripes] = useState<ThreadStripe[]>(
    initialSett?.stripes || [
      { color: 'B', count: 24, isPivot: true },
      { color: 'W', count: 4 },
      { color: 'B', count: 24 },
      { color: 'R', count: 4 },
      { color: 'G', count: 24, isPivot: true },
    ]
  );
  const [selectedStripe, setSelectedStripe] = useState<number | null>(null);
  const [patternName, setPatternName] = useState(initialSett?.name || '');

  const currentSett = parseThreadcount(stripes.map(s => `${s.color}${s.isPivot ? '/' : ''}${s.count}`).join(' '));

  const addStripe = () => {
    const colors = Object.keys(TARTAN_COLORS);
    const lastColor = stripes[stripes.length - 1]?.color;
    const newColor = colors.find(c => c !== lastColor) || 'B';
    setStripes([...stripes, { color: newColor, count: 8 }]);
  };

  const removeStripe = (index: number) => {
    if (stripes.length <= 2) return;
    setStripes(stripes.filter((_, i) => i !== index));
    setSelectedStripe(null);
  };

  const updateStripe = (index: number, updates: Partial<ThreadStripe>) => {
    setStripes(stripes.map((s, i) => i === index ? { ...s, ...updates } : s));
  };

  const moveStripe = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= stripes.length) return;
    const newStripes = [...stripes];
    [newStripes[index], newStripes[newIndex]] = [newStripes[newIndex], newStripes[index]];
    setStripes(newStripes);
    setSelectedStripe(newIndex);
  };

  const duplicateStripe = (index: number) => {
    const newStripes = [...stripes];
    newStripes.splice(index + 1, 0, { ...stripes[index], isPivot: false });
    setStripes(newStripes);
  };

  // Helper to get color hex from either standard or custom colors
  const getColorHex = (code: string): string => {
    const standardColor = getColor(code);
    if (standardColor) return standardColor.hex;
    const customColor = customColors.find(c => c.code.toUpperCase() === code.toUpperCase());
    return customColor?.hex || '#808080';
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="card max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Pattern Builder</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 grid lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="label">Pattern Name</label>
              <input
                type="text"
                value={patternName}
                onChange={e => setPatternName(e.target.value)}
                placeholder="My Custom Tartan"
                className="input"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Stripes</label>
                <button onClick={addStripe} className="btn-secondary text-xs">+ Add Stripe</button>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
                {stripes.map((stripe, index) => (
                  <div
                    key={index}
                    className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
                      selectedStripe === index ? 'bg-indigo-900/30 ring-1 ring-indigo-500' : 'bg-gray-800/50'
                    }`}
                    onClick={() => setSelectedStripe(index)}
                  >
                    <div
                      className="w-8 h-8 rounded border border-gray-600 flex-shrink-0"
                      style={{ backgroundColor: getColorHex(stripe.color) }}
                    />

                    <select
                      value={stripe.color}
                      onChange={e => updateStripe(index, { color: e.target.value })}
                      className="input flex-1 py-1 text-sm"
                      onClick={e => e.stopPropagation()}
                    >
                      <optgroup label="Standard Colors">
                        {Object.entries(TARTAN_COLORS).map(([code, color]) => (
                          <option key={code} value={code}>{color.name} ({code})</option>
                        ))}
                      </optgroup>
                      {customColors.length > 0 && (
                        <optgroup label="Custom Colors">
                          {customColors.map(cc => (
                            <option key={cc.code} value={cc.code}>{cc.name} ({cc.code})</option>
                          ))}
                        </optgroup>
                      )}
                    </select>

                    <input
                      type="number"
                      min="2"
                      max="48"
                      step="2"
                      value={stripe.count}
                      onChange={e => updateStripe(index, { count: Math.max(2, parseInt(e.target.value) || 2) })}
                      className="input w-16 py-1 text-sm text-center"
                      onClick={e => e.stopPropagation()}
                    />

                    <button
                      onClick={e => { e.stopPropagation(); moveStripe(index, -1); }}
                      disabled={index === 0}
                      className="p-1 text-gray-400 hover:text-white disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); moveStripe(index, 1); }}
                      disabled={index === stripes.length - 1}
                      className="p-1 text-gray-400 hover:text-white disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); duplicateStripe(index); }}
                      className="p-1 text-gray-400 hover:text-white"
                    >
                      ⧉
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); removeStripe(index); }}
                      disabled={stripes.length <= 2}
                      className="p-1 text-red-400 hover:text-red-300 disabled:opacity-30"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-sm text-gray-400 space-y-1">
              <div>Total: {currentSett.totalThreads} threads</div>
              <div>Sett size: {(expandSett(currentSett).length / config.threadGauge).toFixed(2)}"</div>
              <div>Colors: {currentSett.colors.length}</div>
            </div>

            <div className="font-mono text-xs text-gray-500 p-2 bg-gray-900 rounded">
              {currentSett.threadcount}
            </div>
          </div>

          <div className="space-y-4">
            <label className="label">Preview</label>
            <TartanCanvas
              sett={currentSett}
              weaveType={config.weaveType}
              scale={3}
              repeats={2}
              customColors={customColors}
              className="w-full aspect-square rounded-lg"
            />
          </div>
        </div>

        <div className="p-4 border-t border-gray-800 flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            onClick={() => {
              const sett = { ...currentSett, name: patternName || undefined };
              onSave(sett);
            }}
            className="btn-primary"
          >
            Save to Collection
          </button>
        </div>
      </div>
    </div>
  );
}

function TiledPreviewModal({
  data,
  config,
  customColors,
  onClose
}: {
  data: TartanCardData;
  config: GeneratorConfig;
  customColors?: CustomColor[];
  onClose: () => void;
}) {
  const [tileSize, setTileSize] = useState<TileSize>('pocket');
  const { sett } = data.result;
  const expanded = expandSett(sett);
  const settInches = expanded.length / config.threadGauge;
  const tileConfig = TILE_SIZES[tileSize];
  const physicalSize = (settInches * tileConfig.repeats).toFixed(1);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="card max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Tiled Preview</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(TILE_SIZES) as TileSize[]).map(size => (
              <button
                key={size}
                onClick={() => setTileSize(size)}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  tileSize === size
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {TILE_SIZES[size].name}
              </button>
            ))}
          </div>

          <div className="text-sm text-gray-400">
            {tileConfig.repeats}x{tileConfig.repeats} repeats = ~{physicalSize}" x {physicalSize}"
          </div>

          <div className="overflow-auto">
            <TartanCanvas
              sett={sett}
              weaveType={config.weaveType}
              scale={2}
              repeats={tileConfig.repeats}
              shapeMask={data.isOptical ? config.shapeMask : undefined}
              customColors={customColors}
              className="mx-auto rounded-lg"
            />
          </div>
        </div>

        <div className="p-4 border-t border-gray-800 flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary">Close</button>
        </div>
      </div>
    </div>
  );
}

function YarnCalculatorModal({
  data,
  config,
  onClose
}: {
  data: TartanCardData;
  config: GeneratorConfig;
  onClose: () => void;
}) {
  const [selectedProduct, setSelectedProduct] = useState('scarf-wide');
  const [customGauge, setCustomGauge] = useState(config.threadGauge);
  const [costPerSkein, setCostPerSkein] = useState(12);
  const { sett } = data.result;

  const calculation = calculateForProduct(sett, selectedProduct, { gauge: customGauge });
  const costEstimate = estimateCost(calculation, costPerSkein);
  const template = PRODUCT_TEMPLATES[selectedProduct];

  const handleDownloadSpec = () => {
    const summary = formatMaterialsSummary(calculation);
    const fullSpec = `
TARTAN PRODUCTION SPECIFICATION
================================
Pattern: ${sett.name || 'Unnamed Tartan'}
Threadcount: ${sett.threadcount}

Product: ${template.name}
${template.description}

${summary}

COST ESTIMATE
-------------
Cost per skein: $${costPerSkein.toFixed(2)}
${costEstimate.colorCosts.map(c => `  ${c.color}: $${c.cost.toFixed(2)}`).join('\n')}

Total Yarn Cost: $${costEstimate.totalYarnCost.toFixed(2)}

Generated by Tartanism - https://thedavidmurray.github.io/Tartanism
    `.trim();

    const blob = new Blob([fullSpec], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tartan-spec-${data.result.seed}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="card max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Yarn Calculator & Production Spec</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Product Selection */}
          <div>
            <label className="label">Product Template</label>
            <select
              value={selectedProduct}
              onChange={e => setSelectedProduct(e.target.value)}
              className="input"
            >
              {Object.entries(PRODUCT_TEMPLATES).map(([key, tmpl]) => (
                <option key={key} value={key}>
                  {tmpl.name} ({tmpl.dimensions.width}" × {tmpl.dimensions.length}")
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">{template.description}</p>
          </div>

          {/* Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Gauge (TPI)</label>
              <input
                type="number"
                min="8"
                max="96"
                value={customGauge}
                onChange={e => setCustomGauge(parseInt(e.target.value) || 24)}
                className="input"
              />
            </div>
            <div>
              <label className="label">Cost per Skein ($)</label>
              <input
                type="number"
                min="1"
                max="100"
                step="0.5"
                value={costPerSkein}
                onChange={e => setCostPerSkein(parseFloat(e.target.value) || 12)}
                className="input"
              />
            </div>
          </div>

          {/* Yarn Profile Info */}
          <div className="p-3 bg-gray-800/50 rounded-lg">
            <div className="text-sm font-medium text-gray-300 mb-2">Yarn Weight: {calculation.yarnProfile.weightClass}</div>
            <div className="text-xs text-gray-500 grid grid-cols-3 gap-2">
              <span>WPI: {calculation.yarnProfile.wpi}</span>
              <span>Yards/100g: {calculation.yarnProfile.yardsPer100g}</span>
              <span>Waste: {((calculation.wasteMultiplier - 1) * 100).toFixed(0)}%</span>
            </div>
          </div>

          {/* Color Requirements */}
          <div>
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Yarn Requirements by Color</h3>
            <div className="space-y-2">
              {calculation.requirements.map(req => (
                <div key={req.color} className="flex items-center gap-3 p-2 bg-gray-800/30 rounded-lg">
                  <div
                    className="w-8 h-8 rounded border border-gray-600"
                    style={{ backgroundColor: req.hex }}
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{req.colorName} ({req.color})</div>
                    <div className="text-xs text-gray-500">
                      Warp: {req.warpYards} yd | Weft: {req.weftYards} yd
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{req.totalYards} yards</div>
                    <div className="text-xs text-gray-500">{req.skeins} skeins ({req.weightGrams}g)</div>
                  </div>
                  <div className="text-right text-green-400 font-medium w-16">
                    ${(req.skeins * costPerSkein).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="grid grid-cols-4 gap-4 p-4 bg-indigo-900/20 rounded-lg border border-indigo-800/30">
            <div className="text-center">
              <div className="text-2xl font-bold text-indigo-300">{calculation.totalYards}</div>
              <div className="text-xs text-gray-500">Total Yards</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-indigo-300">{calculation.totalSkeins}</div>
              <div className="text-xs text-gray-500">Total Skeins</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-indigo-300">{calculation.totalWeight}g</div>
              <div className="text-xs text-gray-500">Total Weight</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">${costEstimate.totalYarnCost.toFixed(2)}</div>
              <div className="text-xs text-gray-500">Est. Yarn Cost</div>
            </div>
          </div>

          {/* Threadcount */}
          <div className="p-3 bg-gray-900 rounded-lg">
            <div className="text-xs text-gray-500 mb-1">Threadcount</div>
            <div className="font-mono text-sm text-gray-300">{sett.threadcount}</div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-800 flex gap-3 justify-end">
          <button onClick={handleDownloadSpec} className="btn-secondary">
            Download Spec
          </button>
          <button onClick={onClose} className="btn-primary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// YARN COLOR BUILDER
// ============================================================================

function YarnColorBuilder({
  onClose,
  onColorsChange
}: {
  onClose: () => void;
  onColorsChange: (colors: CustomColor[]) => void;
}) {
  const [customColors, setCustomColors] = useState<CustomColor[]>(() => {
    const saved = localStorage.getItem('tartanism-custom-colors');
    return saved ? JSON.parse(saved) : [];
  });

  const [newColor, setNewColor] = useState<CustomColor>({
    code: '',
    name: '',
    hex: '#808080'
  });

  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const saveColors = (colors: CustomColor[]) => {
    setCustomColors(colors);
    localStorage.setItem('tartanism-custom-colors', JSON.stringify(colors));
    onColorsChange(colors);
  };

  const addColor = () => {
    if (!newColor.code || !newColor.name) {
      alert('Please enter both a code and name for the color.');
      return;
    }
    if (newColor.code.length > 4) {
      alert('Color code should be 1-4 characters.');
      return;
    }
    if (customColors.some(c => c.code.toUpperCase() === newColor.code.toUpperCase())) {
      alert('A color with this code already exists.');
      return;
    }
    if (TARTAN_COLORS[newColor.code.toUpperCase()]) {
      alert('This code conflicts with a built-in color. Choose a different code.');
      return;
    }

    const updatedColors = [...customColors, { ...newColor, code: newColor.code.toUpperCase() }];
    saveColors(updatedColors);
    setNewColor({ code: '', name: '', hex: '#808080' });
  };

  const updateColor = (index: number) => {
    const updated = [...customColors];
    updated[index] = { ...newColor, code: newColor.code.toUpperCase() };
    saveColors(updated);
    setEditingIndex(null);
    setNewColor({ code: '', name: '', hex: '#808080' });
  };

  const deleteColor = (index: number) => {
    if (confirm('Delete this custom color?')) {
      const updated = customColors.filter((_, i) => i !== index);
      saveColors(updated);
    }
  };

  const startEdit = (index: number) => {
    setNewColor(customColors[index]);
    setEditingIndex(index);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setNewColor({ code: '', name: '', hex: '#808080' });
  };

  const exportColors = () => {
    const data = JSON.stringify(customColors, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tartanism-custom-colors.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importColors = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const imported = JSON.parse(e.target?.result as string);
            if (Array.isArray(imported) && imported.every(c => c.code && c.name && c.hex)) {
              saveColors([...customColors, ...imported]);
              alert(`Imported ${imported.length} colors!`);
            } else {
              alert('Invalid color file format.');
            }
          } catch {
            alert('Error reading file.');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="card max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Yarn Color Builder</h2>
            <p className="text-sm text-gray-400">Create custom colors for your tartans</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Add/Edit Color Form */}
          <div className="bg-gray-800/50 p-4 rounded-lg space-y-4">
            <h3 className="font-medium text-gray-200">
              {editingIndex !== null ? 'Edit Color' : 'Add New Color'}
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Color Code (1-4 chars)</label>
                <input
                  type="text"
                  value={newColor.code}
                  onChange={e => setNewColor({ ...newColor, code: e.target.value.slice(0, 4) })}
                  placeholder="e.g. MY, CUS"
                  className="input"
                  maxLength={4}
                />
              </div>
              <div>
                <label className="label">Color Name</label>
                <input
                  type="text"
                  value={newColor.name}
                  onChange={e => setNewColor({ ...newColor, name: e.target.value })}
                  placeholder="e.g. My Custom Blue"
                  className="input"
                />
              </div>
            </div>

            <div>
              <label className="label">Color Value</label>
              <div className="flex gap-3 items-center">
                <input
                  type="color"
                  value={newColor.hex}
                  onChange={e => setNewColor({ ...newColor, hex: e.target.value })}
                  className="w-16 h-10 rounded cursor-pointer border-0"
                />
                <input
                  type="text"
                  value={newColor.hex}
                  onChange={e => setNewColor({ ...newColor, hex: e.target.value })}
                  placeholder="#RRGGBB"
                  className="input flex-1 font-mono"
                  pattern="^#[0-9A-Fa-f]{6}$"
                />
                <div
                  className="w-20 h-10 rounded border border-gray-600"
                  style={{ backgroundColor: newColor.hex }}
                />
              </div>
            </div>

            <div className="flex gap-2">
              {editingIndex !== null ? (
                <>
                  <button onClick={() => updateColor(editingIndex)} className="btn-primary flex-1">
                    Update Color
                  </button>
                  <button onClick={cancelEdit} className="btn-secondary">
                    Cancel
                  </button>
                </>
              ) : (
                <button onClick={addColor} className="btn-primary flex-1">
                  + Add Color
                </button>
              )}
            </div>
          </div>

          {/* Custom Colors List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-200">Your Custom Colors ({customColors.length})</h3>
              <div className="flex gap-2">
                <button onClick={importColors} className="btn-secondary text-xs">
                  📥 Import
                </button>
                {customColors.length > 0 && (
                  <button onClick={exportColors} className="btn-secondary text-xs">
                    📤 Export
                  </button>
                )}
              </div>
            </div>

            {customColors.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No custom colors yet.</p>
                <p className="text-sm mt-1">Add colors above to build your yarn palette!</p>
              </div>
            ) : (
              <div className="grid gap-2">
                {customColors.map((color, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 bg-gray-800/30 rounded-lg"
                  >
                    <div
                      className="w-10 h-10 rounded-lg border border-gray-600 flex-shrink-0"
                      style={{ backgroundColor: color.hex }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-200">{color.name}</div>
                      <div className="text-sm text-gray-400 font-mono">
                        {color.code} • {color.hex}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => startEdit(index)}
                        className="p-2 text-gray-400 hover:text-white rounded transition-colors"
                        title="Edit"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => deleteColor(index)}
                        className="p-2 text-gray-400 hover:text-red-400 rounded transition-colors"
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tips */}
          <div className="bg-indigo-900/20 p-4 rounded-lg border border-indigo-800/30">
            <h4 className="font-medium text-indigo-300 mb-2">Tips</h4>
            <ul className="text-sm text-gray-400 space-y-1">
              <li>• Use short codes (1-4 chars) that don't conflict with existing colors</li>
              <li>• Custom colors will appear in your color palette selection</li>
              <li>• Export your colors to share them or back them up</li>
              <li>• Match colors to real yarn you have for accurate production planning</li>
            </ul>
          </div>
        </div>

        <div className="p-4 border-t border-gray-800 flex justify-end">
          <button onClick={onClose} className="btn-primary">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// HELP MODAL
// ============================================================================

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="card max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-xl font-semibold">How to Use Tartanism</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* What is a Tartan */}
          <section>
            <h3 className="text-lg font-semibold text-indigo-400 mb-3">What is a Tartan?</h3>
            <p className="text-gray-300 leading-relaxed">
              A tartan is a patterned cloth consisting of criss-crossed horizontal and vertical bands in multiple colors.
              Originating in Scotland, tartans are defined by their <strong>sett</strong> — a sequence of colored threads
              that repeats in both the warp (vertical) and weft (horizontal) directions. This creates the distinctive
              checkered pattern where colors blend at intersections.
            </p>
          </section>

          {/* Threadcount Notation */}
          <section>
            <h3 className="text-lg font-semibold text-indigo-400 mb-3">Understanding Threadcount Notation</h3>
            <p className="text-gray-300 mb-3">
              Tartans are recorded using threadcount notation, like: <code className="bg-gray-800 px-2 py-1 rounded">B/24 W4 B24 R2 K24 G24 W/2</code>
            </p>
            <ul className="text-gray-300 space-y-2 list-disc list-inside">
              <li><strong>Letters</strong> = Color codes (B=Blue, W=White, R=Red, K=Black, G=Green, etc.)</li>
              <li><strong>Numbers</strong> = Thread count for that color stripe</li>
              <li><strong>Slash (/)</strong> = Pivot point where the pattern mirrors (symmetric setts)</li>
              <li>Example: "B/24" means 24 blue threads at the pivot, pattern mirrors here</li>
            </ul>
          </section>

          {/* Generator Settings */}
          <section>
            <h3 className="text-lg font-semibold text-indigo-400 mb-3">Generator Settings</h3>
            <div className="space-y-4">
              <div className="bg-gray-800/50 p-4 rounded-lg">
                <h4 className="font-medium text-white mb-2">Batch Size</h4>
                <p className="text-gray-400 text-sm">How many unique tartans to generate at once. Range: 1-50.</p>
              </div>

              <div className="bg-gray-800/50 p-4 rounded-lg">
                <h4 className="font-medium text-white mb-2">Thread Gauge (TPI)</h4>
                <p className="text-gray-400 text-sm">Threads Per Inch — determines the fabric density. Higher = finer weave.
                  Traditional kilt cloth uses 48 TPI. Typical range: 12-48.</p>
              </div>

              <div className="bg-gray-800/50 p-4 rounded-lg">
                <h4 className="font-medium text-white mb-2">Colors (3-6)</h4>
                <p className="text-gray-400 text-sm">Min and max number of distinct colors in the tartan.
                  Most traditional tartans use 3-6 colors. More colors = more complex patterns.</p>
              </div>

              <div className="bg-gray-800/50 p-4 rounded-lg">
                <h4 className="font-medium text-white mb-2">Stripes (4-12)</h4>
                <p className="text-gray-400 text-sm">Number of color bands in the sett before it repeats/mirrors.
                  More stripes = more intricate design. Range: 2-20.</p>
              </div>

              <div className="bg-gray-800/50 p-4 rounded-lg">
                <h4 className="font-medium text-white mb-2">Thread Width (4-48)</h4>
                <p className="text-gray-400 text-sm">Min and max threads per individual stripe. Wider stripes = bolder bands.
                  Narrower = more detailed. Even numbers are standard for weaving.</p>
              </div>

              <div className="bg-gray-800/50 p-4 rounded-lg">
                <h4 className="font-medium text-white mb-2">Total Threads (60-180)</h4>
                <p className="text-gray-400 text-sm">Total thread count for the full sett. Traditional kilt-scale tartans
                  typically have 200-280 threads. This controls overall pattern size.</p>
              </div>
            </div>
          </section>

          {/* Weave Patterns */}
          <section>
            <h3 className="text-lg font-semibold text-indigo-400 mb-3">Weave Patterns</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="bg-gray-800/50 p-3 rounded-lg">
                <h4 className="font-medium text-white">Plain Weave (1/1)</h4>
                <p className="text-gray-400 text-sm">Simple over-under pattern. Creates sharp color definition.</p>
              </div>
              <div className="bg-gray-800/50 p-3 rounded-lg">
                <h4 className="font-medium text-white">2/2 Twill ⭐</h4>
                <p className="text-gray-400 text-sm">Traditional tartan weave. Creates diagonal lines and color blending.</p>
              </div>
              <div className="bg-gray-800/50 p-3 rounded-lg">
                <h4 className="font-medium text-white">3/1 Twill</h4>
                <p className="text-gray-400 text-sm">Steeper diagonal. More warp color visible on face.</p>
              </div>
              <div className="bg-gray-800/50 p-3 rounded-lg">
                <h4 className="font-medium text-white">Herringbone</h4>
                <p className="text-gray-400 text-sm">V-shaped zigzag pattern created by reversing twill direction.</p>
              </div>
              <div className="bg-gray-800/50 p-3 rounded-lg">
                <h4 className="font-medium text-white">Houndstooth</h4>
                <p className="text-gray-400 text-sm">Classic broken check pattern with pointed shapes.</p>
              </div>
              <div className="bg-gray-800/50 p-3 rounded-lg">
                <h4 className="font-medium text-white">Basket Weave</h4>
                <p className="text-gray-400 text-sm">Groups of threads woven together for textured appearance.</p>
              </div>
            </div>
          </section>

          {/* Symmetry */}
          <section>
            <h3 className="text-lg font-semibold text-indigo-400 mb-3">Symmetry Options</h3>
            <div className="space-y-3">
              <div className="bg-gray-800/50 p-3 rounded-lg">
                <h4 className="font-medium text-white">Symmetric</h4>
                <p className="text-gray-400 text-sm">Pattern mirrors at pivot points (most common). The sett reads the same forwards and backwards.</p>
              </div>
              <div className="bg-gray-800/50 p-3 rounded-lg">
                <h4 className="font-medium text-white">Asymmetric</h4>
                <p className="text-gray-400 text-sm">Pattern repeats without mirroring. Less common but creates unique directional designs.</p>
              </div>
              <div className="bg-gray-800/50 p-3 rounded-lg">
                <h4 className="font-medium text-white">Either</h4>
                <p className="text-gray-400 text-sm">Generator randomly chooses symmetric or asymmetric for variety.</p>
              </div>
            </div>
          </section>

          {/* Optical Illusion Mode */}
          <section>
            <h3 className="text-lg font-semibold text-indigo-400 mb-3">Optical Illusion Mode</h3>
            <p className="text-gray-300 mb-3">
              Applies 3D shape masks to create embedded geometry effects. The tartan pattern is modified
              with brightness variations to simulate depth and dimensionality.
            </p>
            <div className="grid sm:grid-cols-2 gap-2 text-sm">
              <div className="text-gray-400">• <strong>Cubes</strong> — Isometric 3D cube illusion</div>
              <div className="text-gray-400">• <strong>Hexagons</strong> — Honeycomb pattern</div>
              <div className="text-gray-400">• <strong>Spheres</strong> — Floating bubble effect</div>
              <div className="text-gray-400">• <strong>Waves</strong> — Rippling water surface</div>
              <div className="text-gray-400">• <strong>Diamonds</strong> — Faceted gem pattern</div>
              <div className="text-gray-400">• <strong>Penrose</strong> — Aperiodic tiling</div>
              <div className="text-gray-400">• <strong>Escher</strong> — Impossible staircase</div>
            </div>
          </section>

          {/* Color Palette */}
          <section>
            <h3 className="text-lg font-semibold text-indigo-400 mb-3">Color Palette</h3>
            <p className="text-gray-300 mb-3">
              48 traditional tartan colors organized by family. Click colors to enable/disable them in generation.
              Colors use official Scottish Register codes and are perceptually balanced.
            </p>
            <div className="text-gray-400 text-sm">
              Color families: Blues, Reds, Greens, Yellows, Browns, Grays, Purples, and accent colors.
            </div>
          </section>

          {/* Export Options */}
          <section>
            <h3 className="text-lg font-semibold text-indigo-400 mb-3">Export & Production Tools</h3>
            <div className="space-y-3">
              <div className="bg-gray-800/50 p-3 rounded-lg">
                <h4 className="font-medium text-white">📄 WIF Export (Loom Draft)</h4>
                <p className="text-gray-400 text-sm">Weaving Information File format. Import into loom software
                  (WeavePoint, Fiberworks, etc.) to weave the pattern on a floor loom or dobby loom.</p>
              </div>
              <div className="bg-gray-800/50 p-3 rounded-lg">
                <h4 className="font-medium text-white">🧮 Yarn Calculator</h4>
                <p className="text-gray-400 text-sm">Calculate yarn requirements for production. Select product type
                  (scarf, blanket, kilt, etc.) to get yardage, weight, and cost estimates per color.</p>
              </div>
              <div className="bg-gray-800/50 p-3 rounded-lg">
                <h4 className="font-medium text-white">⬇️ SVG Download</h4>
                <p className="text-gray-400 text-sm">Vector graphic export. Perfect for printing, further editing,
                  or sharing at any resolution.</p>
              </div>
              <div className="bg-gray-800/50 p-3 rounded-lg">
                <h4 className="font-medium text-white">📋 Copy Seed</h4>
                <p className="text-gray-400 text-sm">Copy the generation seed to recreate the exact same pattern later.</p>
              </div>
              <div className="bg-gray-800/50 p-3 rounded-lg">
                <h4 className="font-medium text-white">📊 Export CSV</h4>
                <p className="text-gray-400 text-sm">Export all generated tartans as a spreadsheet with full metadata.</p>
              </div>
            </div>
          </section>

          {/* Card Actions */}
          <section>
            <h3 className="text-lg font-semibold text-indigo-400 mb-3">Tartan Card Actions</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="bg-gray-700 px-3 py-1 rounded text-sm">Mutate</span>
                <span className="text-gray-400 text-sm">Generate variations of this tartan with slight modifications</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="bg-gray-700 px-3 py-1 rounded text-sm">Edit</span>
                <span className="text-gray-400 text-sm">Open in Builder to manually adjust colors and stripe widths</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-gray-400 text-sm">Click the tartan image to see a tiled preview at different scales</span>
              </div>
            </div>
          </section>
        </div>

        <div className="p-4 border-t border-gray-800 flex justify-end">
          <button onClick={onClose} className="btn-primary">
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN APP
// ============================================================================

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('generator');
  const [tartans, setTartans] = useState<TartanCardData[]>([]);
  const [config, setConfig] = useState<GeneratorConfig>({
    batchSize: 6,
    colorMin: 3,
    colorMax: 6,
    stripeMin: 4,
    stripeMax: 12,
    threadMin: 4,
    threadMax: 48,
    totalMin: 60,
    totalMax: 180,
    threadGauge: 24,
    weaveType: 'twill-2-2',
    symmetry: 'symmetric',
    opticalMode: false,
    shapeMask: createDefaultMaskOptions(),
    allowedColors: Object.keys(TARTAN_COLORS),
  });

  const [selectedForBuilder, setSelectedForBuilder] = useState<TartanCardData | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [tiledPreview, setTiledPreview] = useState<TartanCardData | null>(null);
  const [yarnCalcData, setYarnCalcData] = useState<TartanCardData | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showColorBuilder, setShowColorBuilder] = useState(false);
  const [customColors, setCustomColors] = useState<CustomColor[]>(() => {
    const saved = localStorage.getItem('tartanism-custom-colors');
    return saved ? JSON.parse(saved) : [];
  });

  const handleGenerate = useCallback(() => {
    const results = generateBatch(config.batchSize, {
      colorCount: { min: config.colorMin, max: config.colorMax },
      stripeCount: { min: config.stripeMin, max: config.stripeMax },
      threadCount: { min: config.threadMin, max: config.threadMax },
      totalThreads: { min: config.totalMin, max: config.totalMax },
      symmetry: config.symmetry,
      allowedColors: config.allowedColors.length > 0 ? config.allowedColors : undefined,
    });

    const newTartans: TartanCardData[] = results.map(result => ({
      id: `${result.seed}-${Date.now()}`,
      result,
      isOptical: config.opticalMode,
    }));

    setTartans(prev => [...newTartans, ...prev]);
  }, [config]);

  const handleMutate = useCallback((data: TartanCardData) => {
    const { sett, seed } = data.result;
    const mutations: TartanCardData[] = [];

    for (let i = 0; i < 4; i++) {
      const mutationSeed = seed + i + 1000;
      const result = generateTartan({
        ...DEFAULT_CONSTRAINTS,
        allowedColors: config.allowedColors.length > 0 ? config.allowedColors : undefined,
      }, mutationSeed);

      // Mix in some of the original structure
      const mixedStripes = result.sett.stripes.map((stripe, idx) => {
        if (idx < sett.stripes.length && Math.random() > 0.5) {
          return { ...stripe, color: sett.stripes[idx].color };
        }
        return stripe;
      });

      const mutatedSett = parseThreadcount(mixedStripes.map(s => `${s.color}${s.isPivot ? '/' : ''}${s.count}`).join(' '));

      mutations.push({
        id: `${mutationSeed}-${Date.now()}`,
        result: { ...result, sett: mutatedSett },
        parentId: data.id,
        isOptical: data.isOptical,
      });
    }

    setTartans(prev => [...mutations, ...prev]);
  }, [config.allowedColors]);

  const handleEdit = useCallback((data: TartanCardData) => {
    setSelectedForBuilder(data);
    setShowBuilder(true);
  }, []);

  const handleSavePattern = useCallback((sett: Sett) => {
    const result = generateTartan({}, Date.now());
    const newCard: TartanCardData = {
      id: `custom-${Date.now()}`,
      result: { ...result, sett },
      isOptical: config.opticalMode,
    };
    setTartans(prev => [newCard, ...prev]);
    setShowBuilder(false);
    setSelectedForBuilder(null);
  }, [config.opticalMode]);

  const handleDownloadSVG = useCallback((data: TartanCardData) => {
    const { sett } = data.result;
    const expanded = expandSett(sett);
    const weave = WEAVE_PATTERNS[config.weaveType];
    const scale = 4;
    const size = expanded.length * scale;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;

    for (let y = 0; y < expanded.length; y++) {
      for (let x = 0; x < expanded.length; x++) {
        const pixel = getIntersectionColor(expanded, expanded, weave, x, y);
        const color = getColor(pixel.color);
        if (color) {
          svg += `<rect x="${x * scale}" y="${y * scale}" width="${scale}" height="${scale}" fill="${color.hex}"/>`;
        }
      }
    }

    svg += '</svg>';

    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tartan-${data.result.seed}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [config.weaveType]);

  const handleDownloadWIF = useCallback((data: TartanCardData) => {
    const { sett } = data.result;
    const weave = WEAVE_PATTERNS[config.weaveType];
    const wif = generateWIF(sett, weave, {
      title: sett.name || `Tartan ${data.result.seed}`,
      author: 'Tartanism',
      warpRepeats: 2,
      weftRepeats: 2,
    });

    const blob = new Blob([wif.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = wif.filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [config.weaveType]);

  const handleCopySeed = useCallback((seed: number) => {
    navigator.clipboard.writeText(seed.toString());
  }, []);

  const handleExportCSV = useCallback(() => {
    const headers = ['id', 'seed', 'threadcount', 'colors', 'totalThreads', 'colorCount', 'isOptical'];
    const rows = tartans.map(t => [
      t.id,
      t.result.seed,
      `"${t.result.sett.threadcount}"`,
      `"${t.result.sett.colors.join(',')}"`,
      t.result.sett.totalThreads,
      t.result.sett.colors.length,
      t.isOptical ? 'true' : 'false',
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tartans-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [tartans]);

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
              <span className="text-xl font-bold">T</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gradient">Tartanism</h1>
              <p className="text-xs text-gray-500">The best plaid maker</p>
            </div>
          </div>

          <nav className="flex items-center gap-4">
            <button
              onClick={() => setViewMode('generator')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                viewMode === 'generator' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Generator
            </button>
            <button
              onClick={() => { setShowBuilder(true); setSelectedForBuilder(null); }}
              className="px-4 py-2 rounded-lg text-gray-400 hover:text-white transition-colors"
            >
              Builder
            </button>
            {tartans.length > 0 && (
              <button onClick={handleExportCSV} className="btn-secondary text-sm">
                Export CSV
              </button>
            )}
            <button
              onClick={() => setShowHelp(true)}
              className="px-3 py-2 rounded-lg text-gray-400 hover:text-white transition-colors"
              title="Help & FAQ"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-[320px_1fr] gap-8">
          {/* Config Panel */}
          <aside className="lg:sticky lg:top-24 lg:h-fit">
            <ConfigPanel
              config={config}
              onChange={setConfig}
              onGenerate={handleGenerate}
              onOpenColorBuilder={() => setShowColorBuilder(true)}
              customColors={customColors}
            />
          </aside>

          {/* Results Grid */}
          <section>
            {tartans.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-6xl mb-4">🏴󠁧󠁢󠁳󠁣󠁴󠁿</div>
                <h2 className="text-2xl font-semibold text-gray-300 mb-2">Ready to design tartans?</h2>
                <p className="text-gray-500 mb-6">Configure your constraints and roll to generate mathematically valid patterns.</p>
                <button onClick={handleGenerate} className="btn-primary">
                  Roll Your First Tartan
                </button>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {tartans.map(data => (
                  <TartanCard
                    key={data.id}
                    data={data}
                    config={config}
                    customColors={customColors}
                    onMutate={handleMutate}
                    onEdit={handleEdit}
                    onTiledPreview={setTiledPreview}
                    onCopySeed={handleCopySeed}
                    onDownloadSVG={handleDownloadSVG}
                    onDownloadWIF={handleDownloadWIF}
                    onShowYarnCalc={setYarnCalcData}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8 mt-16">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-500 text-sm">
          <p>Create mathematically valid tartans following Scottish Register conventions.</p>
          <p className="mt-2">Built for the love of plaid.</p>
        </div>
      </footer>

      {/* Modals */}
      {showBuilder && (
        <PatternBuilder
          initialSett={selectedForBuilder?.result.sett}
          config={config}
          customColors={customColors}
          onSave={handleSavePattern}
          onClose={() => { setShowBuilder(false); setSelectedForBuilder(null); }}
        />
      )}

      {tiledPreview && (
        <TiledPreviewModal
          data={tiledPreview}
          config={config}
          customColors={customColors}
          onClose={() => setTiledPreview(null)}
        />
      )}

      {yarnCalcData && (
        <YarnCalculatorModal
          data={yarnCalcData}
          config={config}
          onClose={() => setYarnCalcData(null)}
        />
      )}

      {showHelp && (
        <HelpModal onClose={() => setShowHelp(false)} />
      )}

      {showColorBuilder && (
        <YarnColorBuilder
          onClose={() => setShowColorBuilder(false)}
          onColorsChange={(colors) => setCustomColors(colors)}
        />
      )}
    </div>
  );
}
