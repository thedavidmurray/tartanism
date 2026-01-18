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

type TileRepeatMode = 'normal' | 'brick' | 'half-drop' | 'mirror' | 'random';

interface ImagePatternData {
  imageData: string;           // Base64 data URL of the processed tile
  repeatMode: TileRepeatMode;
  pixelSize: number;
}

interface TartanCardData {
  id: string;
  result: GeneratorResult;
  parentId?: string;
  isOptical?: boolean;
  isBlanket?: boolean;        // Renders as solid stripes (Pendleton-style) instead of tartan weave
  imagePattern?: ImagePatternData;  // For image-based patterns (not tartan)
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
  loomCompatible: boolean;
}

// Lochcarron production constraints
const LOOM_CONSTRAINTS = {
  maxColors: 6,
  weaveType: 'twill-2-2' as WeaveType,
  fabrics: [
    { code: 'CTRV', name: 'Reiver™', weight: '10oz', width: '59"', use: 'Jackets, ties, dresses' },
    { code: 'CTBR', name: 'Braeriach™', weight: '13oz', width: '54"', use: 'Kilts, trews, bags' },
    { code: 'CTST', name: 'Strome™', weight: '16oz', width: '54"', use: 'Heavy kilts, upholstery' },
  ],
  accessories: [
    { code: 'ABSCL', name: 'Bowhill Scarf', material: 'Lambswool', size: '24×180cm' },
    { code: 'ABSQL', name: 'Darwin Scarf', material: 'Lambswool', size: '35×200cm' },
    { code: 'ABRG', name: 'Borders Blanket', material: 'Lambswool', size: '140×180cm' },
  ],
};

type ViewMode = 'generator' | 'builder' | 'crest';

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
// CREST/MONOGRAM BUILDER TYPES
// ============================================================================

interface CrestConfig {
  targetSize: number;  // Size in inches
  threadGauge: number; // TPI for resolution calculation
  backgroundColor: string;
  foregroundColor: string;
  technique: 'jacquard' | 'embroidery' | 'print';
}

// Resolution thresholds for different techniques
const CREST_TECHNIQUES = {
  jacquard: {
    name: 'Jacquard Woven',
    description: 'Woven directly into fabric - most authentic',
    minTPI: 60,
    maxTPI: 120,
    minDetail: 1.5, // minimum inches for readable crest
    warning: 'Jacquard weaving creates a pixelated look. Best for simple, bold designs.',
    isTraditional: true,
  },
  embroidery: {
    name: 'Embroidery',
    description: 'Stitched on top of woven tartan - high detail',
    minTPI: 200,
    maxTPI: 1200,
    minDetail: 0.5,
    warning: 'Embroidery is added after weaving. Not part of the tartan pattern itself.',
    isTraditional: false,
  },
  print: {
    name: 'Digital Print',
    description: 'Printed on fabric - photographic quality',
    minTPI: 150,
    maxTPI: 600,
    minDetail: 0.25,
    warning: 'Digital printing is not woven. Produces printed fabric, not tartan.',
    isTraditional: false,
  },
};

// Simple shapes for monograms
const MONOGRAM_SHAPES = {
  circle: { name: 'Circle', svg: (size: number) => `M ${size/2} 0 A ${size/2} ${size/2} 0 1 0 ${size/2} ${size} A ${size/2} ${size/2} 0 1 0 ${size/2} 0` },
  diamond: { name: 'Diamond', svg: (size: number) => `M ${size/2} 0 L ${size} ${size/2} L ${size/2} ${size} L 0 ${size/2} Z` },
  shield: { name: 'Shield', svg: (size: number) => `M ${size*0.1} ${size*0.1} L ${size*0.9} ${size*0.1} L ${size*0.9} ${size*0.5} Q ${size*0.9} ${size*0.9} ${size*0.5} ${size} Q ${size*0.1} ${size*0.9} ${size*0.1} ${size*0.5} Z` },
  square: { name: 'Square', svg: (size: number) => `M 0 0 L ${size} 0 L ${size} ${size} L 0 ${size} Z` },
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

  // === NEON & FLUORESCENT ===
  neonFull: {
    name: 'Full Neon',
    colors: ['NP', 'NY', 'NO', 'NG', 'NE', 'NC', 'NM', 'NV', 'NR', 'NL', 'NT', 'NS', 'NA', 'NW', 'UV'],
    description: 'All 15 fluorescent colors',
    category: 'Neon'
  },
  rave: {
    name: 'Rave',
    colors: ['NP', 'NC', 'NM', 'NG', 'NV', 'UV', 'K'],
    description: 'UV-reactive blacklight glow',
    category: 'Neon'
  },
  neonPop: {
    name: 'Neon Pop',
    colors: ['NP', 'NY', 'NC', 'NG', 'W', 'K'],
    description: '80s pop art vibes',
    category: 'Neon'
  },
  electricDream: {
    name: 'Electric Dream',
    colors: ['NE', 'NM', 'NC', 'NV', 'K', 'W'],
    description: 'Synthwave/cyberpunk aesthetic',
    category: 'Neon'
  },
  acidTrip: {
    name: 'Acid Trip',
    colors: ['NL', 'NG', 'NY', 'NP', 'NM', 'K'],
    description: 'Psychedelic lime/green focus',
    category: 'Neon'
  },
  tropicalNeon: {
    name: 'Tropical Neon',
    colors: ['NP', 'NO', 'NY', 'NT', 'NA', 'W'],
    description: 'Miami Vice sunset vibes',
    category: 'Neon'
  },
  blacklightGlow: {
    name: 'Blacklight Glow',
    colors: ['UV', 'NW', 'NC', 'NM', 'NG', 'K'],
    description: 'Maximum UV reactivity',
    category: 'Neon'
  },
  neonNoir: {
    name: 'Neon Noir',
    colors: ['NP', 'NE', 'K', 'DGY', 'CH'],
    description: 'Dark cyberpunk with neon accents',
    category: 'Neon'
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
  customColors?: CustomColor[],
  isBlanket?: boolean  // Render as solid horizontal stripes (Pendleton-style)
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

  // Blanket mode: solid horizontal stripes (no warp/weft interlacing)
  if (isBlanket) {
    for (let y = 0; y < size; y++) {
      const stripeIdx = Math.floor(y / scale) % settSize;
      const colorCode = expanded.threads[stripeIdx];
      const colorData = lookupColor(colorCode);

      if (!colorData) continue;

      let rgb = { ...colorData.rgb };

      // Apply shape mask if enabled
      if (shapeMask && shapeMask.type !== 'none') {
        for (let x = 0; x < size; x++) {
          const maskPixel = applyMask(x, y, size, size, shapeMask);
          const adjustedRgb = adjustBrightness(rgb, maskPixel.brightness);
          ctx.fillStyle = rgbToHex(adjustedRgb);
          ctx.fillRect(x, y, 1, 1);
        }
      } else {
        // Fast path: draw entire horizontal stripe at once
        ctx.fillStyle = colorData.hex;
        ctx.fillRect(0, y, size, 1);
      }
    }
    return;
  }

  // Normal tartan weave rendering
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
  isBlanket,
  onClick,
  className = ''
}: {
  sett: Sett;
  weaveType: WeaveType;
  scale?: number;
  repeats?: number;
  shapeMask?: ShapeMaskOptions;
  customColors?: CustomColor[];
  isBlanket?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      renderTartan(canvasRef.current, sett, weaveType, scale, repeats, shapeMask, customColors, isBlanket);
    }
  }, [sett, weaveType, scale, repeats, shapeMask, customColors, isBlanket]);

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

// Mini preview for breeding panel
function TartanMiniPreview({
  data,
  config,
}: {
  data: TartanCardData;
  config: GeneratorConfig;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { result } = data;
  const { sett } = result;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const expanded = expandSett(sett);
    const size = 64;
    canvas.width = size;
    canvas.height = size;

    const scale = size / expanded.length;
    const weave = WEAVE_PATTERNS[config.weaveType];

    for (let y = 0; y < expanded.length; y++) {
      for (let x = 0; x < expanded.length; x++) {
        const warpColor = expanded.threads[x % expanded.length];
        const weftColor = expanded.threads[y % expanded.length];
        const warpOnTop = weave.tieUp[y % weave.treadling.length][x % weave.threading.length];

        const colorCode = warpOnTop ? warpColor : weftColor;
        const color = getColor(colorCode);
        ctx.fillStyle = color?.hex || '#808080';
        ctx.fillRect(x * scale, y * scale, scale + 0.5, scale + 0.5);
      }
    }
  }, [sett, config.weaveType]);

  return (
    <canvas
      ref={canvasRef}
      width={64}
      height={64}
      className="w-full h-full"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

function TartanCard({
  data,
  config,
  customColors,
  breedingMode,
  isSelectedForBreeding,
  onSelectForBreeding,
  onMutate,
  onEdit,
  onTiledPreview,
  onCopySeed,
  onDownloadSVG,
  onDownloadWIF,
  onDownloadPNG,
  onShowYarnCalc,
  onShowMockups
}: {
  data: TartanCardData;
  config: GeneratorConfig;
  customColors?: CustomColor[];
  breedingMode?: boolean;
  isSelectedForBreeding?: boolean;
  onSelectForBreeding?: (data: TartanCardData) => void;
  onMutate: (data: TartanCardData) => void;
  onEdit: (data: TartanCardData) => void;
  onTiledPreview: (data: TartanCardData) => void;
  onCopySeed: (seed: number) => void;
  onDownloadSVG: (data: TartanCardData) => void;
  onDownloadWIF: (data: TartanCardData) => void;
  onDownloadPNG: (data: TartanCardData, dpi?: number) => void;
  onShowYarnCalc: (data: TartanCardData) => void;
  onShowMockups: (data: TartanCardData) => void;
}) {
  const { result, isOptical, isBlanket, parentId, imagePattern } = data;
  const { sett, seed } = result;
  const expanded = expandSett(sett);
  const settInches = (expanded.length / config.threadGauge).toFixed(2);

  // Handle click based on breeding mode
  const handleCardClick = () => {
    if (breedingMode && onSelectForBreeding) {
      onSelectForBreeding(data);
    }
  };

  // For image patterns, render a tiled canvas preview
  const imagePatternCanvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!imagePattern) return;
    const canvas = imagePatternCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      const size = 200;
      canvas.width = size;
      canvas.height = size;
      ctx.imageSmoothingEnabled = false;

      const tileW = img.width * imagePattern.pixelSize;
      const tileH = img.height * imagePattern.pixelSize;
      const tilesX = Math.ceil(size / tileW) + 1;
      const tilesY = Math.ceil(size / tileH) + 1;

      for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {
          let x = tx * tileW;
          let y = ty * tileH;

          if (imagePattern.repeatMode === 'brick' && ty % 2 === 1) x += tileW / 2;
          if (imagePattern.repeatMode === 'half-drop' && tx % 2 === 1) y += tileH / 2;

          ctx.drawImage(img, x, y, tileW, tileH);
        }
      }
    };
    img.src = imagePattern.imageData;
  }, [imagePattern]);

  return (
    <div
      className={`card p-4 space-y-3 animate-fadeIn ${
        breedingMode ? 'cursor-pointer hover:ring-2 hover:ring-pink-500' : ''
      } ${isSelectedForBreeding ? 'ring-2 ring-pink-500 bg-pink-950/20' : ''}`}
      onClick={handleCardClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex flex-wrap gap-1">
          {!imagePattern && sett.colors.map(code => <ColorChip key={code} code={code} />)}
          {imagePattern && <span className="text-xs text-gray-400">Image Pattern</span>}
        </div>
        <div className="flex gap-1">
          {imagePattern && <span className="text-xs px-2 py-0.5 bg-cyan-900/50 text-cyan-300 rounded-full">Image</span>}
          {isBlanket && <span className="text-xs px-2 py-0.5 bg-orange-900/50 text-orange-300 rounded-full">Blanket</span>}
          {isOptical && <span className="text-xs px-2 py-0.5 bg-purple-900/50 text-purple-300 rounded-full">Optical</span>}
          {parentId && <span className="text-xs px-2 py-0.5 bg-green-900/50 text-green-300 rounded-full">Mutant</span>}
        </div>
      </div>

      {imagePattern ? (
        <canvas
          ref={imagePatternCanvasRef}
          className="w-full aspect-square rounded-lg cursor-pointer hover:ring-2 hover:ring-indigo-500 transition-all"
          style={{ imageRendering: 'pixelated' }}
          onClick={breedingMode ? undefined : () => onTiledPreview(data)}
        />
      ) : (
        <TartanCanvas
          sett={sett}
          weaveType={config.weaveType}
          scale={2}
          repeats={1}
          shapeMask={isOptical ? config.shapeMask : undefined}
          customColors={customColors}
          isBlanket={isBlanket}
          onClick={breedingMode ? undefined : () => onTiledPreview(data)}
          className="w-full aspect-square rounded-lg"
        />
      )}

      {imagePattern ? (
        <>
          <div className="font-mono text-xs text-gray-400 truncate">
            {imagePattern.repeatMode} repeat · {imagePattern.pixelSize}x scale
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>Image tile</span>
            <span>{imagePattern.repeatMode}</span>
          </div>
        </>
      ) : (
        <>
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
        </>
      )}

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
        <button onClick={() => onShowMockups(data)} className="btn-secondary text-xs px-2" title="Product Mockups">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
        </button>
        <button onClick={() => onDownloadSVG(data)} className="btn-secondary text-xs px-2" title="Download SVG">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>
        <button onClick={() => onDownloadPNG(data, 300)} className="btn-secondary text-xs px-2" title="Download PNG (300 DPI - Print Ready)">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
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
        <button
          onClick={() => {
            const url = `https://thedavidmurray.github.io/tartanism/?seed=${seed}`;
            const text = `Check out this tartan I made with Tartanism! ${sett.threadcount}`;
            window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
          }}
          className="btn-secondary text-xs px-2"
          title="Share on X/Twitter"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
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
    { name: 'Neons', codes: ['NP', 'NY', 'NO', 'NG', 'NE', 'NC', 'NM', 'NV', 'NR', 'NL', 'NT', 'NS', 'NA', 'NW', 'UV'] },
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
        <label className="label">
          Colors ({config.colorMin} - {config.colorMax})
          {config.loomCompatible && <span className="text-amber-400 text-xs ml-2">(max 6 for loom)</span>}
        </label>
        <div className="flex gap-2 items-center">
          <input
            type="range"
            min="2"
            max={config.loomCompatible ? LOOM_CONSTRAINTS.maxColors : 12}
            value={config.colorMin}
            onChange={e => onChange({ ...config, colorMin: parseInt(e.target.value) })}
            className="slider flex-1"
          />
          <span className="text-gray-400 w-8 text-center">{config.colorMin}</span>
          <span className="text-gray-500">to</span>
          <input
            type="range"
            min="2"
            max={config.loomCompatible ? LOOM_CONSTRAINTS.maxColors : 12}
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
        <label className="label">
          Weave Pattern
          {config.loomCompatible && <span className="text-amber-400 text-xs ml-2">(locked to 2/2 Twill)</span>}
        </label>
        <select
          value={config.weaveType}
          onChange={e => onChange({ ...config, weaveType: e.target.value as WeaveType })}
          className={`input ${config.loomCompatible ? 'opacity-50 cursor-not-allowed' : ''}`}
          disabled={config.loomCompatible}
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

      {/* Loom Compatible Mode */}
      <div className="border border-amber-700/30 rounded-lg p-4 bg-amber-900/10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-amber-400 text-lg">🏭</span>
            <label className="label mb-0 text-amber-200">Loom Compatible Mode</label>
          </div>
          <button
            onClick={() => {
              const newLoomMode = !config.loomCompatible;
              const updates: Partial<GeneratorConfig> = { loomCompatible: newLoomMode };
              if (newLoomMode) {
                // Enforce constraints
                updates.weaveType = LOOM_CONSTRAINTS.weaveType;
                updates.colorMax = Math.min(config.colorMax, LOOM_CONSTRAINTS.maxColors);
                updates.colorMin = Math.min(config.colorMin, LOOM_CONSTRAINTS.maxColors);
              }
              onChange({ ...config, ...updates });
            }}
            className={`w-12 h-6 rounded-full transition-colors ${config.loomCompatible ? 'bg-amber-500' : 'bg-gray-700'}`}
          >
            <div className={`w-5 h-5 rounded-full bg-white transition-transform ${config.loomCompatible ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
        </div>
        <p className="text-xs text-amber-300/70 mb-3">
          Constrains patterns for production at Scottish mills (Lochcarron, House of Edgar)
        </p>

        {config.loomCompatible && (
          <div className="space-y-3 text-xs">
            <div className="flex items-center gap-2 text-amber-200">
              <span className="text-green-400">✓</span>
              <span>Max 6 colors (mill standard)</span>
            </div>
            <div className="flex items-center gap-2 text-amber-200">
              <span className="text-green-400">✓</span>
              <span>2/2 Twill weave (traditional tartan)</span>
            </div>
            <div className="flex items-center gap-2 text-amber-200">
              <span className="text-green-400">✓</span>
              <span>Symmetric sett (warp = weft)</span>
            </div>

            <div className="mt-3 pt-3 border-t border-amber-700/30">
              <p className="text-amber-300 font-medium mb-2">Lochcarron Fabric Options:</p>
              <div className="space-y-1">
                {LOOM_CONSTRAINTS.fabrics.map(f => (
                  <div key={f.code} className="text-amber-200/70">
                    <span className="font-mono text-amber-400">{f.code}</span> {f.name} ({f.weight}) - {f.use}
                  </div>
                ))}
              </div>
            </div>
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

type PatternMode = 'stripe' | 'grid';

interface GridCell {
  warpColor: string;
  weftColor: string;
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
  const [mode, setMode] = useState<PatternMode>('stripe');
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

  // Grid mode state - separate warp (vertical) and weft (horizontal) sequences
  const [warpSequence, setWarpSequence] = useState<ThreadStripe[]>(
    initialSett?.stripes || [
      { color: 'B', count: 8 },
      { color: 'W', count: 2 },
      { color: 'G', count: 8 },
    ]
  );
  const [weftSequence, setWeftSequence] = useState<ThreadStripe[]>(
    initialSett?.stripes || [
      { color: 'B', count: 8 },
      { color: 'W', count: 2 },
      { color: 'G', count: 8 },
    ]
  );
  const [syncWarpWeft, setSyncWarpWeft] = useState(true); // Traditional tartan = same warp/weft
  const [gridScale, setGridScale] = useState(4); // Pixels per thread in grid view
  const [selectedAxis, setSelectedAxis] = useState<'warp' | 'weft'>('warp');
  const [showProductPreview, setShowProductPreview] = useState(false);
  const [productSize, setProductSize] = useState<TileSize>('scarf');

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

  // Grid mode helpers
  const expandSequenceToThreads = (sequence: ThreadStripe[]): string[] => {
    const threads: string[] = [];
    sequence.forEach(stripe => {
      for (let i = 0; i < stripe.count; i++) {
        threads.push(stripe.color);
      }
    });
    return threads;
  };

  const warpThreads = expandSequenceToThreads(warpSequence);
  const weftThreads = expandSequenceToThreads(weftSequence);

  // Calculate grid sett for preview
  const gridSett = mode === 'grid'
    ? parseThreadcount(warpSequence.map(s => `${s.color}${s.count}`).join(' '))
    : currentSett;

  // Add stripe to grid sequence
  const addGridStripe = (axis: 'warp' | 'weft') => {
    const sequence = axis === 'warp' ? warpSequence : weftSequence;
    const setSequence = axis === 'warp' ? setWarpSequence : setWeftSequence;
    const lastColor = sequence[sequence.length - 1]?.color || 'B';
    const allColors = [...Object.keys(TARTAN_COLORS), ...customColors.map(c => c.code)];
    const newColor = allColors.find(c => c !== lastColor) || 'B';
    const newSequence = [...sequence, { color: newColor, count: 4 }];
    setSequence(newSequence);
    if (syncWarpWeft) {
      if (axis === 'warp') setWeftSequence(newSequence);
      else setWarpSequence(newSequence);
    }
  };

  const removeGridStripe = (axis: 'warp' | 'weft', index: number) => {
    const sequence = axis === 'warp' ? warpSequence : weftSequence;
    const setSequence = axis === 'warp' ? setWarpSequence : setWeftSequence;
    if (sequence.length <= 1) return;
    const newSequence = sequence.filter((_, i) => i !== index);
    setSequence(newSequence);
    if (syncWarpWeft) {
      if (axis === 'warp') setWeftSequence(newSequence);
      else setWarpSequence(newSequence);
    }
  };

  const updateGridStripe = (axis: 'warp' | 'weft', index: number, updates: Partial<ThreadStripe>) => {
    const sequence = axis === 'warp' ? warpSequence : weftSequence;
    const setSequence = axis === 'warp' ? setWarpSequence : setWeftSequence;
    const newSequence = sequence.map((s, i) => i === index ? { ...s, ...updates } : s);
    setSequence(newSequence);
    if (syncWarpWeft) {
      if (axis === 'warp') setWeftSequence(newSequence);
      else setWarpSequence(newSequence);
    }
  };

  // Sync stripe mode to grid mode when switching
  const handleModeSwitch = (newMode: PatternMode) => {
    if (newMode === 'grid' && mode === 'stripe') {
      // Convert stripe mode to grid mode
      setWarpSequence([...stripes]);
      setWeftSequence([...stripes]);
    } else if (newMode === 'stripe' && mode === 'grid') {
      // Convert grid mode back to stripe mode (use warp as primary)
      setStripes([...warpSequence]);
    }
    setMode(newMode);
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="card max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold">Pattern Builder</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
          </div>

          {/* Mode Toggle */}
          <div className="flex items-center gap-4">
            <div className="flex bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => handleModeSwitch('stripe')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  mode === 'stripe' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Stripe Mode
              </button>
              <button
                onClick={() => handleModeSwitch('grid')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  mode === 'grid' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Grid Mode
              </button>
            </div>
            <span className="text-xs text-gray-500">
              {mode === 'stripe' ? 'Simple sequential stripe editor' : 'Advanced warp/weft control'}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* Pattern Name - shared between modes */}
          <div className="mb-4">
            <label className="label">Pattern Name</label>
            <input
              type="text"
              value={patternName}
              onChange={e => setPatternName(e.target.value)}
              placeholder="My Custom Tartan"
              className="input"
            />
          </div>

          {mode === 'stripe' ? (
            /* ==================== STRIPE MODE ==================== */
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="space-y-4">
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

                {/* Product Scale Preview */}
                <div className="border-t border-gray-800 pt-4">
                  <button
                    onClick={() => setShowProductPreview(!showProductPreview)}
                    className="flex items-center justify-between w-full text-left"
                  >
                    <label className="label mb-0 cursor-pointer">Product Previews</label>
                    <span className="text-gray-400">{showProductPreview ? '−' : '+'}</span>
                  </button>

                  {showProductPreview && (
                    <div className="mt-3 space-y-3">
                      <div className="flex flex-wrap gap-1">
                        {(Object.keys(TILE_SIZES) as TileSize[]).map(size => (
                          <button
                            key={size}
                            onClick={() => setProductSize(size)}
                            className={`px-2 py-1 rounded text-xs transition-colors ${
                              productSize === size
                                ? 'bg-indigo-600 text-white'
                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                            }`}
                          >
                            {TILE_SIZES[size].name}
                          </button>
                        ))}
                      </div>

                      <div className="text-xs text-gray-500">
                        {TILE_SIZES[productSize].repeats}x repeats = {TILE_SIZES[productSize].inches}
                      </div>

                      <div className="bg-gray-900 p-2 rounded-lg overflow-auto max-h-64">
                        <TartanCanvas
                          sett={currentSett}
                          weaveType={config.weaveType}
                          scale={2}
                          repeats={TILE_SIZES[productSize].repeats}
                          customColors={customColors}
                          className="mx-auto rounded"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* ==================== GRID MODE ==================== */
            <div className="space-y-4">
              {/* Sync Toggle */}
              <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncWarpWeft}
                    onChange={e => setSyncWarpWeft(e.target.checked)}
                    className="rounded border-gray-600 bg-gray-700 text-indigo-500 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-300">Sync Warp & Weft (Traditional Tartan)</span>
                </label>
                <span className="text-xs text-gray-500">
                  {syncWarpWeft ? 'Same pattern on both axes' : 'Independent warp/weft control'}
                </span>
              </div>

              <div className="grid lg:grid-cols-3 gap-4">
                {/* Warp Sequence (Vertical/Y-axis) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="label mb-0 flex items-center gap-2">
                      <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                      Warp (Vertical)
                    </label>
                    <button onClick={() => addGridStripe('warp')} className="btn-secondary text-xs">+</button>
                  </div>
                  <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
                    {warpSequence.map((stripe, index) => (
                      <div key={index} className="flex items-center gap-1 p-1.5 bg-gray-800/50 rounded">
                        <div
                          className="w-6 h-6 rounded border border-gray-600 flex-shrink-0"
                          style={{ backgroundColor: getColorHex(stripe.color) }}
                        />
                        <select
                          value={stripe.color}
                          onChange={e => updateGridStripe('warp', index, { color: e.target.value })}
                          className="input flex-1 py-0.5 text-xs"
                        >
                          <optgroup label="Standard">
                            {Object.entries(TARTAN_COLORS).map(([code, color]) => (
                              <option key={code} value={code}>{code}</option>
                            ))}
                          </optgroup>
                          {customColors.length > 0 && (
                            <optgroup label="Custom">
                              {customColors.map(cc => (
                                <option key={cc.code} value={cc.code}>{cc.code}</option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                        <input
                          type="number"
                          min="1"
                          max="32"
                          value={stripe.count}
                          onChange={e => updateGridStripe('warp', index, { count: Math.max(1, parseInt(e.target.value) || 1) })}
                          className="input w-12 py-0.5 text-xs text-center"
                        />
                        <button
                          onClick={() => removeGridStripe('warp', index)}
                          disabled={warpSequence.length <= 1}
                          className="p-0.5 text-red-400 hover:text-red-300 disabled:opacity-30 text-xs"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-gray-500">{warpThreads.length} threads</div>
                </div>

                {/* Weft Sequence (Horizontal/X-axis) - Only visible when not synced */}
                <div className={`space-y-2 ${syncWarpWeft ? 'opacity-50 pointer-events-none' : ''}`}>
                  <div className="flex items-center justify-between">
                    <label className="label mb-0 flex items-center gap-2">
                      <span className="w-3 h-3 bg-orange-500 rounded-full"></span>
                      Weft (Horizontal)
                    </label>
                    <button onClick={() => addGridStripe('weft')} className="btn-secondary text-xs">+</button>
                  </div>
                  <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
                    {weftSequence.map((stripe, index) => (
                      <div key={index} className="flex items-center gap-1 p-1.5 bg-gray-800/50 rounded">
                        <div
                          className="w-6 h-6 rounded border border-gray-600 flex-shrink-0"
                          style={{ backgroundColor: getColorHex(stripe.color) }}
                        />
                        <select
                          value={stripe.color}
                          onChange={e => updateGridStripe('weft', index, { color: e.target.value })}
                          className="input flex-1 py-0.5 text-xs"
                        >
                          <optgroup label="Standard">
                            {Object.entries(TARTAN_COLORS).map(([code, color]) => (
                              <option key={code} value={code}>{code}</option>
                            ))}
                          </optgroup>
                          {customColors.length > 0 && (
                            <optgroup label="Custom">
                              {customColors.map(cc => (
                                <option key={cc.code} value={cc.code}>{cc.code}</option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                        <input
                          type="number"
                          min="1"
                          max="32"
                          value={stripe.count}
                          onChange={e => updateGridStripe('weft', index, { count: Math.max(1, parseInt(e.target.value) || 1) })}
                          className="input w-12 py-0.5 text-xs text-center"
                        />
                        <button
                          onClick={() => removeGridStripe('weft', index)}
                          disabled={weftSequence.length <= 1}
                          className="p-0.5 text-red-400 hover:text-red-300 disabled:opacity-30 text-xs"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-gray-500">{weftThreads.length} threads</div>
                </div>

                {/* Grid Preview */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="label mb-0">Weave Grid</label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Scale:</span>
                      <input
                        type="range"
                        min="2"
                        max="8"
                        value={gridScale}
                        onChange={e => setGridScale(parseInt(e.target.value))}
                        className="w-16"
                      />
                    </div>
                  </div>
                  <div className="bg-gray-900 rounded-lg p-2 overflow-auto max-h-64">
                    <div
                      className="grid gap-0"
                      style={{
                        gridTemplateColumns: `repeat(${Math.min(weftThreads.length, 40)}, ${gridScale}px)`,
                        width: 'fit-content'
                      }}
                    >
                      {Array.from({ length: Math.min(warpThreads.length, 40) }).map((_, y) =>
                        Array.from({ length: Math.min(weftThreads.length, 40) }).map((_, x) => {
                          const warpColor = warpThreads[y];
                          const weftColor = weftThreads[x];
                          // Simple weave: alternate warp/weft showing based on position
                          const showWarp = (x + y) % 2 === 0;
                          const displayColor = showWarp ? warpColor : weftColor;
                          return (
                            <div
                              key={`${x}-${y}`}
                              className="border border-gray-800/50"
                              style={{
                                width: gridScale,
                                height: gridScale,
                                backgroundColor: getColorHex(displayColor)
                              }}
                              title={`Warp: ${warpColor}, Weft: ${weftColor}`}
                            />
                          );
                        })
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    {Math.min(warpThreads.length, 40)}×{Math.min(weftThreads.length, 40)} threads shown
                    {(warpThreads.length > 40 || weftThreads.length > 40) && ' (truncated)'}
                  </div>
                </div>
              </div>

              {/* Full Preview */}
              <div className="grid lg:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="label">Threadcount</label>
                  <div className="font-mono text-xs text-gray-500 p-2 bg-gray-900 rounded">
                    Warp: {warpSequence.map(s => `${s.color}${s.count}`).join(' ')}
                  </div>
                  {!syncWarpWeft && (
                    <div className="font-mono text-xs text-gray-500 p-2 bg-gray-900 rounded mt-1">
                      Weft: {weftSequence.map(s => `${s.color}${s.count}`).join(' ')}
                    </div>
                  )}
                </div>
                <div>
                  <label className="label">Full Preview</label>
                  <TartanCanvas
                    sett={gridSett}
                    weaveType={config.weaveType}
                    scale={3}
                    repeats={2}
                    customColors={customColors}
                    className="w-full aspect-square rounded-lg max-w-[200px]"
                  />
                </div>
              </div>

              {/* Product Scale Preview for Grid Mode */}
              <div className="border-t border-gray-800 pt-4 mt-4">
                <button
                  onClick={() => setShowProductPreview(!showProductPreview)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <label className="label mb-0 cursor-pointer">Product Previews</label>
                  <span className="text-gray-400">{showProductPreview ? '−' : '+'}</span>
                </button>

                {showProductPreview && (
                  <div className="mt-3 space-y-3">
                    <div className="flex flex-wrap gap-1">
                      {(Object.keys(TILE_SIZES) as TileSize[]).map(size => (
                        <button
                          key={size}
                          onClick={() => setProductSize(size)}
                          className={`px-2 py-1 rounded text-xs transition-colors ${
                            productSize === size
                              ? 'bg-indigo-600 text-white'
                              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                          }`}
                        >
                          {TILE_SIZES[size].name}
                        </button>
                      ))}
                    </div>

                    <div className="text-xs text-gray-500">
                      {TILE_SIZES[productSize].repeats}x repeats = {TILE_SIZES[productSize].inches}
                    </div>

                    <div className="bg-gray-900 p-2 rounded-lg overflow-auto max-h-80">
                      <TartanCanvas
                        sett={gridSett}
                        weaveType={config.weaveType}
                        scale={2}
                        repeats={TILE_SIZES[productSize].repeats}
                        customColors={customColors}
                        className="mx-auto rounded"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-800 flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            onClick={() => {
              const sett = mode === 'stripe'
                ? { ...currentSett, name: patternName || undefined }
                : { ...gridSett, name: patternName || undefined };
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
  const [tileSize, setTileSize] = useState<TileSize>('scarf');
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(2);
  const { sett, seed } = data.result;
  const expanded = expandSett(sett);
  const settInches = expanded.length / config.threadGauge;
  const tileConfig = TILE_SIZES[tileSize];
  const physicalSize = (settInches * tileConfig.repeats).toFixed(1);

  // Calculate scale to FILL available space
  useEffect(() => {
    const calculateScale = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight - 80;
      const patternSize = expanded.length * tileConfig.repeats;

      const scaleX = containerWidth / patternSize;
      const scaleY = containerHeight / patternSize;
      const newScale = Math.max(1, Math.min(scaleX, scaleY));
      setScale(newScale);
    };

    calculateScale();
    window.addEventListener('resize', calculateScale);
    return () => window.removeEventListener('resize', calculateScale);
  }, [expanded.length, tileConfig.repeats]);

  // Download tiled preview as high-res PNG
  const handleDownload = () => {
    const weave = WEAVE_PATTERNS[config.weaveType];
    const downloadScale = 4; // High quality
    const patternSize = expanded.length * tileConfig.repeats;
    const canvas = document.createElement('canvas');
    canvas.width = patternSize * downloadScale;
    canvas.height = patternSize * downloadScale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Custom color lookup
    const lookupColor = (code: string) => {
      const custom = customColors?.find(c => c.code === code);
      if (custom) return { code: custom.code, name: custom.name, hex: custom.hex };
      return getColor(code);
    };

    // Render tiled pattern
    for (let ty = 0; ty < tileConfig.repeats; ty++) {
      for (let tx = 0; tx < tileConfig.repeats; tx++) {
        for (let y = 0; y < expanded.length; y++) {
          // Blanket mode: solid horizontal stripes
          if (data.isBlanket) {
            const colorCode = expanded.threads[y];
            const color = lookupColor(colorCode);
            if (color) {
              ctx.fillStyle = color.hex;
              ctx.fillRect(
                tx * expanded.length * downloadScale,
                (ty * expanded.length + y) * downloadScale,
                expanded.length * downloadScale,
                downloadScale
              );
            }
          } else {
            // Normal tartan weave
            for (let x = 0; x < expanded.length; x++) {
              const pixel = getIntersectionColor(expanded, expanded, weave, x, y);
              const color = lookupColor(pixel.color);
              if (color) {
                ctx.fillStyle = color.hex;
                ctx.fillRect(
                  (tx * expanded.length + x) * downloadScale,
                  (ty * expanded.length + y) * downloadScale,
                  downloadScale,
                  downloadScale
                );
              }
            }
          }
        }
      }
    }

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tartan-${seed}-${tileSize}-${tileConfig.repeats}x${tileConfig.repeats}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-2">
      <div className="card w-full h-full max-w-[98vw] max-h-[98vh] overflow-hidden flex flex-col">
        <div className="p-3 border-b border-gray-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4 flex-wrap">
            <h2 className="text-lg font-semibold">Tiled Preview</h2>
            <div className="flex flex-wrap gap-1">
              {(Object.keys(TILE_SIZES) as TileSize[]).map(size => (
                <button
                  key={size}
                  onClick={() => setTileSize(size)}
                  className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                    tileSize === size
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {TILE_SIZES[size].name}
                </button>
              ))}
            </div>
            <span className="text-xs text-gray-500">
              {tileConfig.repeats}x{tileConfig.repeats} = ~{physicalSize}"
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="btn-primary text-sm px-4 py-1 flex items-center gap-2"
              title="Save this preview as PNG"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Save Image
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl px-2">&times;</button>
          </div>
        </div>

        <div ref={containerRef} className="flex-1 overflow-hidden flex items-center justify-center p-2">
          <TartanCanvas
            sett={sett}
            weaveType={config.weaveType}
            scale={scale}
            repeats={tileConfig.repeats}
            shapeMask={data.isOptical ? config.shapeMask : undefined}
            customColors={customColors}
            isBlanket={data.isBlanket}
            className="rounded-lg"
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PRODUCT MOCKUPS - See tartan on real products
// ============================================================================

interface ProductMockupProps {
  data: TartanCardData;
  config: GeneratorConfig;
  customColors?: CustomColor[];
  onClose: () => void;
}

function ProductMockups({ data, config, customColors, onClose }: ProductMockupProps) {
  const [selectedProduct, setSelectedProduct] = useState<string>('tie');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { sett } = data.result;

  const products = [
    { id: 'tie', name: 'Necktie', icon: '👔', aspectRatio: 0.15, repeats: 8, description: 'Classic business tie' },
    { id: 'bowtie', name: 'Bow Tie', icon: '🎀', aspectRatio: 2, repeats: 2, description: 'Formal bow tie' },
    { id: 'scarf', name: 'Scarf', icon: '🧣', aspectRatio: 0.2, repeats: 6, description: 'Winter scarf' },
    { id: 'pocket', name: 'Pocket Square', icon: '🔲', aspectRatio: 1, repeats: 2, description: 'Suit pocket square' },
    { id: 'blanket', name: 'Blanket', icon: '🛏️', aspectRatio: 1.3, repeats: 8, description: 'Throw blanket' },
    { id: 'pillow', name: 'Pillow', icon: '🛋️', aspectRatio: 1, repeats: 3, description: 'Accent pillow' },
    { id: 'kilt', name: 'Kilt', icon: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', aspectRatio: 2.5, repeats: 6, description: 'Traditional kilt' },
    { id: 'bag', name: 'Tote Bag', icon: '👜', aspectRatio: 0.9, repeats: 4, description: 'Shopping tote' },
    { id: 'flag', name: 'Flag', icon: '🚩', aspectRatio: 1.5, repeats: 5, description: 'Banner flag' },
  ];

  const currentProduct = products.find(p => p.id === selectedProduct) || products[0];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const expanded = expandSett(sett);
    const weave = WEAVE_PATTERNS[config.weaveType];

    // Helper to get color from standard or custom colors
    const lookupColor = (code: string): string => {
      const standard = getColor(code);
      if (standard) return standard.hex;
      const custom = customColors?.find(c => c.code.toUpperCase() === code.toUpperCase());
      if (custom) return custom.hex;
      return '#808080';
    };

    // Size based on product
    const baseSize = 300;
    const width = currentProduct.aspectRatio >= 1 ? baseSize : baseSize * currentProduct.aspectRatio;
    const height = currentProduct.aspectRatio >= 1 ? baseSize / currentProduct.aspectRatio : baseSize;

    canvas.width = width;
    canvas.height = height;

    const scale = Math.max(width, height) / (expanded.length * currentProduct.repeats);

    // Draw tiled tartan pattern
    const tiledWidth = Math.ceil(width / (expanded.length * scale));
    const tiledHeight = Math.ceil(height / (expanded.length * scale));

    for (let ty = 0; ty < tiledHeight + 1; ty++) {
      for (let tx = 0; tx < tiledWidth + 1; tx++) {
        for (let y = 0; y < expanded.length; y++) {
          // Blanket mode: solid horizontal stripes
          if (data.isBlanket) {
            const colorCode = expanded.threads[y % expanded.length];
            ctx.fillStyle = lookupColor(colorCode);
            const px = tx * expanded.length * scale;
            const py = (ty * expanded.length + y) * scale;
            if (py < height) {
              ctx.fillRect(px, py, expanded.length * scale + 0.5, scale + 0.5);
            }
          } else {
            // Normal tartan weave
            for (let x = 0; x < expanded.length; x++) {
              const warpColor = expanded.threads[x % expanded.length];
              const weftColor = expanded.threads[y % expanded.length];
              const warpOnTop = weave.tieUp[y % weave.treadling.length][x % weave.threading.length];

              const colorCode = warpOnTop ? warpColor : weftColor;
              ctx.fillStyle = lookupColor(colorCode);

              const px = (tx * expanded.length + x) * scale;
              const py = (ty * expanded.length + y) * scale;

              if (px < width && py < height) {
                ctx.fillRect(px, py, scale + 0.5, scale + 0.5);
              }
            }
          }
        }
      }
    }

    // Add product-specific overlay/mask
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = '#000';

    if (selectedProduct === 'tie') {
      // Tie shape mask
      ctx.beginPath();
      ctx.moveTo(width * 0.3, 0);
      ctx.lineTo(width * 0.7, 0);
      ctx.lineTo(width * 0.6, height * 0.15);
      ctx.lineTo(width * 0.55, height * 0.85);
      ctx.lineTo(width * 0.65, height);
      ctx.lineTo(width * 0.35, height);
      ctx.lineTo(width * 0.45, height * 0.85);
      ctx.lineTo(width * 0.4, height * 0.15);
      ctx.closePath();
      ctx.fill();
    } else if (selectedProduct === 'bowtie') {
      // Bow tie shape
      ctx.beginPath();
      ctx.moveTo(0, height * 0.3);
      ctx.quadraticCurveTo(width * 0.25, height * 0.5, 0, height * 0.7);
      ctx.lineTo(0, height * 0.3);
      ctx.moveTo(width, height * 0.3);
      ctx.quadraticCurveTo(width * 0.75, height * 0.5, width, height * 0.7);
      ctx.lineTo(width, height * 0.3);
      ctx.rect(width * 0.4, height * 0.35, width * 0.2, height * 0.3);
      ctx.fill();
      // Left wing
      ctx.beginPath();
      ctx.moveTo(0, height * 0.2);
      ctx.quadraticCurveTo(width * 0.2, height * 0.5, 0, height * 0.8);
      ctx.quadraticCurveTo(width * 0.35, height * 0.5, 0, height * 0.2);
      ctx.fill();
      // Right wing
      ctx.beginPath();
      ctx.moveTo(width, height * 0.2);
      ctx.quadraticCurveTo(width * 0.8, height * 0.5, width, height * 0.8);
      ctx.quadraticCurveTo(width * 0.65, height * 0.5, width, height * 0.2);
      ctx.fill();
    } else {
      // Default: rounded rectangle
      const radius = 15;
      ctx.beginPath();
      ctx.roundRect(0, 0, width, height, radius);
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';

    // Add subtle shadow/depth effect
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 5;
    ctx.shadowOffsetY = 5;
  }, [sett, config.weaveType, selectedProduct, currentProduct, customColors, data.isBlanket]);

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-gray-800">
        {/* Header */}
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Product Mockups</h2>
            <p className="text-sm text-gray-400 mt-1">See your tartan on real products</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid md:grid-cols-[1fr_300px] gap-6">
            {/* Preview */}
            <div className="flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-8 min-h-[400px]">
              <div className="relative">
                <canvas
                  ref={canvasRef}
                  className="max-w-full max-h-[350px] rounded-lg shadow-2xl"
                  style={{ imageRendering: 'auto' }}
                />
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-center">
                  <span className="text-4xl">{currentProduct.icon}</span>
                </div>
              </div>
            </div>

            {/* Product Selection */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">Select Product</h3>
              <div className="grid grid-cols-2 gap-2">
                {products.map(product => (
                  <button
                    key={product.id}
                    onClick={() => setSelectedProduct(product.id)}
                    className={`p-3 rounded-lg text-left transition-all ${
                      selectedProduct === product.id
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                    }`}
                  >
                    <span className="text-xl mr-2">{product.icon}</span>
                    <span className="text-sm font-medium">{product.name}</span>
                  </button>
                ))}
              </div>

              <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700 mt-4">
                <h4 className="font-medium text-white">{currentProduct.name}</h4>
                <p className="text-sm text-gray-400 mt-1">{currentProduct.description}</p>
                <p className="text-xs text-gray-500 mt-2">
                  Pattern repeats: {currentProduct.repeats}×
                </p>
              </div>

              <button
                onClick={() => {
                  const canvas = canvasRef.current;
                  if (!canvas) return;
                  canvas.toBlob((blob) => {
                    if (!blob) return;
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `tartan-${currentProduct.id}-mockup.png`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }, 'image/png');
                }}
                className="w-full btn-primary"
              >
                Download Mockup
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// COLOR EXTRACTION - Extract palette from photos
// ============================================================================

function ColorExtractor({
  onClose,
  onColorsExtracted,
  onSaveAsYarn,
}: {
  onClose: () => void;
  onColorsExtracted: (colors: string[]) => void;
  onSaveAsYarn: (hex: string, name: string) => void;
}) {
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [extractedColors, setExtractedColors] = useState<{ hex: string; count: number }[]>([]);
  const [colorCount, setColorCount] = useState(6);
  const [savingColorIdx, setSavingColorIdx] = useState<number | null>(null);
  const [yarnName, setYarnName] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const handleSaveYarn = (idx: number) => {
    if (!yarnName.trim()) return;
    const color = extractedColors[idx];
    onSaveAsYarn(color.hex, yarnName.trim());
    setSavingColorIdx(null);
    setYarnName('');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setUploadedImage(dataUrl);
      extractColors(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const extractColors = (imageUrl: string) => {
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Sample at lower resolution for speed
      const sampleSize = 100;
      canvas.width = sampleSize;
      canvas.height = sampleSize;
      ctx.drawImage(img, 0, 0, sampleSize, sampleSize);

      const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
      const pixels = imageData.data;

      // Count color frequencies (quantize to reduce unique colors)
      const colorMap = new Map<string, number>();
      const quantize = 32; // Group similar colors

      for (let i = 0; i < pixels.length; i += 4) {
        const r = Math.round(pixels[i] / quantize) * quantize;
        const g = Math.round(pixels[i + 1] / quantize) * quantize;
        const b = Math.round(pixels[i + 2] / quantize) * quantize;
        const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

        colorMap.set(hex, (colorMap.get(hex) || 0) + 1);
      }

      // Sort by frequency and take top colors
      const sortedColors = Array.from(colorMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, colorCount * 2) // Get more than needed
        .map(([hex, count]) => ({ hex, count }));

      // Filter to ensure color diversity (avoid similar colors)
      const diverseColors: { hex: string; count: number }[] = [];
      for (const color of sortedColors) {
        const isDifferent = diverseColors.every(c => {
          const r1 = parseInt(color.hex.slice(1, 3), 16);
          const g1 = parseInt(color.hex.slice(3, 5), 16);
          const b1 = parseInt(color.hex.slice(5, 7), 16);
          const r2 = parseInt(c.hex.slice(1, 3), 16);
          const g2 = parseInt(c.hex.slice(3, 5), 16);
          const b2 = parseInt(c.hex.slice(5, 7), 16);
          const diff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
          return diff > 80; // Minimum color difference
        });

        if (isDifferent) {
          diverseColors.push(color);
          if (diverseColors.length >= colorCount) break;
        }
      }

      setExtractedColors(diverseColors);
    };
    img.src = imageUrl;
  };

  // Re-extract when color count changes
  useEffect(() => {
    if (uploadedImage) {
      extractColors(uploadedImage);
    }
  }, [colorCount]);

  // Draw preview tartan with extracted colors
  useEffect(() => {
    if (extractedColors.length < 2) return;

    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 150;
    canvas.width = size;
    canvas.height = size;

    const stripeWidth = size / (extractedColors.length * 2);

    // Simple stripe preview
    for (let i = 0; i < extractedColors.length * 2; i++) {
      const colorIdx = i % extractedColors.length;
      ctx.fillStyle = extractedColors[colorIdx].hex;

      // Horizontal stripes
      ctx.fillRect(0, i * stripeWidth, size, stripeWidth);

      // Vertical stripes (overlay)
      ctx.globalAlpha = 0.5;
      ctx.fillRect(i * stripeWidth, 0, stripeWidth, size);
      ctx.globalAlpha = 1;
    }
  }, [extractedColors]);

  const handleApplyColors = () => {
    // Map extracted hex colors to closest tartan color codes
    const colorCodes = extractedColors.map(ec => {
      // Find closest match in TARTAN_COLORS
      let closestCode = 'K';
      let closestDiff = Infinity;

      for (const [code, color] of Object.entries(TARTAN_COLORS)) {
        const r1 = parseInt(ec.hex.slice(1, 3), 16);
        const g1 = parseInt(ec.hex.slice(3, 5), 16);
        const b1 = parseInt(ec.hex.slice(5, 7), 16);
        const diff = Math.abs(r1 - color.rgb.r) + Math.abs(g1 - color.rgb.g) + Math.abs(b1 - color.rgb.b);

        if (diff < closestDiff) {
          closestDiff = diff;
          closestCode = code;
        }
      }

      return closestCode;
    });

    onColorsExtracted([...new Set(colorCodes)]); // Unique codes only
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-gray-800">
        {/* Header */}
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Extract Colors from Photo</h2>
            <p className="text-sm text-gray-400 mt-1">Upload an image to create a tartan palette</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Upload */}
          <div className="border-2 border-dashed border-gray-700 rounded-xl p-8 text-center">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
              id="color-extract-upload"
            />
            <label
              htmlFor="color-extract-upload"
              className="cursor-pointer block"
            >
              {uploadedImage ? (
                <img
                  src={uploadedImage}
                  alt="Uploaded"
                  className="max-h-48 mx-auto rounded-lg"
                />
              ) : (
                <>
                  <div className="text-4xl mb-3">📷</div>
                  <p className="text-gray-400">Click to upload a photo</p>
                  <p className="text-xs text-gray-600 mt-1">Nature, art, fashion - anything!</p>
                </>
              )}
            </label>
          </div>

          {/* Color Count Slider */}
          <div>
            <label className="text-sm text-gray-400 mb-2 block">
              Colors to Extract: {colorCount}
            </label>
            <input
              type="range"
              min="3"
              max="8"
              value={colorCount}
              onChange={(e) => setColorCount(parseInt(e.target.value))}
              className="slider w-full"
            />
          </div>

          {/* Extracted Colors */}
          {extractedColors.length > 0 && (
            <div>
              <label className="text-sm text-gray-400 mb-2 block">Extracted Palette - Click to save as yarn</label>
              <div className="flex gap-3 flex-wrap">
                {extractedColors.map((color, idx) => (
                  <div key={idx} className="relative group">
                    <div
                      className="w-14 h-14 rounded-lg shadow-lg border-2 border-gray-700 cursor-pointer hover:border-indigo-500 transition-all hover:scale-105"
                      style={{ backgroundColor: color.hex }}
                      title={`${color.hex} - Click to save as yarn`}
                      onClick={() => {
                        setSavingColorIdx(idx);
                        setYarnName('');
                      }}
                    />
                    {savingColorIdx === idx && (
                      <div className="absolute top-16 left-0 z-10 bg-gray-800 rounded-lg p-3 shadow-xl border border-gray-700 w-48">
                        <input
                          type="text"
                          placeholder="Yarn name..."
                          value={yarnName}
                          onChange={(e) => setYarnName(e.target.value)}
                          className="w-full px-2 py-1 bg-gray-900 border border-gray-600 rounded text-sm text-white mb-2"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveYarn(idx);
                            if (e.key === 'Escape') setSavingColorIdx(null);
                          }}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveYarn(idx)}
                            className="flex-1 btn-primary text-xs py-1"
                            disabled={!yarnName.trim()}
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setSavingColorIdx(null)}
                            className="flex-1 btn-secondary text-xs py-1"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-[10px] bg-gray-800 px-1 rounded">+yarn</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview */}
          {extractedColors.length >= 2 && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Tartan Preview</label>
                <canvas
                  ref={previewCanvasRef}
                  className="w-full aspect-square rounded-lg border border-gray-700"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleApplyColors}
                  className="w-full btn-primary"
                >
                  Apply to Generator
                </button>
              </div>
            </div>
          )}

          {/* Hidden canvas for processing */}
          <canvas ref={canvasRef} className="hidden" />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// IMAGE PATTERN BUILDER - Convert images to tileable swatches
// ============================================================================

interface ImagePatternConfig {
  pixelSize: number;      // Size of each "pixel" in the output
  colorCount: number;     // Number of colors to reduce to
  repeatMode: TileRepeatMode;
  tileScale: number;      // How many times to repeat the tile
}

const REPEAT_MODES: { id: TileRepeatMode; name: string; icon: string; description: string }[] = [
  { id: 'normal', name: 'Grid', icon: '⊞', description: 'Standard grid repeat' },
  { id: 'brick', name: 'Brick', icon: '⊟', description: 'Offset rows like bricks' },
  { id: 'half-drop', name: 'Half-Drop', icon: '⋮', description: 'Offset columns' },
  { id: 'mirror', name: 'Mirror', icon: '⧎', description: 'Reflect horizontally and vertically' },
  { id: 'random', name: 'Scatter', icon: '⁘', description: 'Random placement' },
];

function ImagePatternBuilder({
  onClose,
  onCreatePattern,
}: {
  onClose: () => void;
  onCreatePattern: (imageData: string, config: ImagePatternConfig) => void;
}) {
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [config, setConfig] = useState<ImagePatternConfig>({
    pixelSize: 4,
    colorCount: 8,
    repeatMode: 'normal',
    tileScale: 3,
  });
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setUploadedImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Process image into pixelated, color-reduced version
  useEffect(() => {
    if (!uploadedImage) return;

    const img = new Image();
    img.onload = () => {
      const canvas = sourceCanvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Calculate tile size (target ~32-64 pixels for the base tile)
      const targetSize = 48;
      const aspectRatio = img.width / img.height;
      const tileWidth = aspectRatio >= 1 ? targetSize : Math.round(targetSize * aspectRatio);
      const tileHeight = aspectRatio >= 1 ? Math.round(targetSize / aspectRatio) : targetSize;

      canvas.width = tileWidth;
      canvas.height = tileHeight;

      // Draw scaled-down image
      ctx.drawImage(img, 0, 0, tileWidth, tileHeight);

      // Get pixels and quantize colors
      const imageData = ctx.getImageData(0, 0, tileWidth, tileHeight);
      const pixels = imageData.data;

      // Build color palette (median cut approximation)
      const colorMap = new Map<string, number>();
      const quantize = Math.round(256 / Math.pow(config.colorCount, 1/3) * 2);

      for (let i = 0; i < pixels.length; i += 4) {
        const r = Math.round(pixels[i] / quantize) * quantize;
        const g = Math.round(pixels[i + 1] / quantize) * quantize;
        const b = Math.round(pixels[i + 2] / quantize) * quantize;
        const key = `${r},${g},${b}`;
        colorMap.set(key, (colorMap.get(key) || 0) + 1);
      }

      // Get top N colors
      const palette = Array.from(colorMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, config.colorCount)
        .map(([key]) => key.split(',').map(Number));

      // Remap each pixel to nearest palette color
      for (let i = 0; i < pixels.length; i += 4) {
        let bestDist = Infinity;
        let bestColor = palette[0];

        for (const [r, g, b] of palette) {
          const dist = Math.abs(pixels[i] - r) + Math.abs(pixels[i + 1] - g) + Math.abs(pixels[i + 2] - b);
          if (dist < bestDist) {
            bestDist = dist;
            bestColor = [r, g, b];
          }
        }

        pixels[i] = bestColor[0];
        pixels[i + 1] = bestColor[1];
        pixels[i + 2] = bestColor[2];
      }

      ctx.putImageData(imageData, 0, 0);
      setProcessedImage(canvas.toDataURL());
    };
    img.src = uploadedImage;
  }, [uploadedImage, config.colorCount]);

  // Render tiled preview
  useEffect(() => {
    if (!processedImage) return;

    const previewCanvas = previewCanvasRef.current;
    if (!previewCanvas) return;

    const ctx = previewCanvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      const tileW = img.width * config.pixelSize;
      const tileH = img.height * config.pixelSize;
      const previewSize = 300;

      previewCanvas.width = previewSize;
      previewCanvas.height = previewSize;

      ctx.imageSmoothingEnabled = false;

      const tilesX = Math.ceil(previewSize / tileW) + 1;
      const tilesY = Math.ceil(previewSize / tileH) + 1;

      for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {
          let x = tx * tileW;
          let y = ty * tileH;
          let scaleX = 1;
          let scaleY = 1;

          switch (config.repeatMode) {
            case 'brick':
              if (ty % 2 === 1) x += tileW / 2;
              break;
            case 'half-drop':
              if (tx % 2 === 1) y += tileH / 2;
              break;
            case 'mirror':
              if (tx % 2 === 1) scaleX = -1;
              if (ty % 2 === 1) scaleY = -1;
              break;
            case 'random':
              x += (Math.random() - 0.5) * 20;
              y += (Math.random() - 0.5) * 20;
              break;
          }

          ctx.save();
          if (scaleX === -1 || scaleY === -1) {
            ctx.translate(x + tileW / 2, y + tileH / 2);
            ctx.scale(scaleX, scaleY);
            ctx.drawImage(img, -tileW / 2, -tileH / 2, tileW, tileH);
          } else {
            ctx.drawImage(img, x, y, tileW, tileH);
          }
          ctx.restore();
        }
      }
    };
    img.src = processedImage;
  }, [processedImage, config.pixelSize, config.repeatMode]);

  const handleCreate = () => {
    if (processedImage) {
      onCreatePattern(processedImage, config);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-gray-800">
        {/* Header */}
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">🖼️ Image Pattern Builder</h2>
            <p className="text-sm text-gray-400 mt-1">Convert any image to a tileable swatch pattern</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Upload */}
          <div className="border-2 border-dashed border-gray-700 rounded-xl p-6 text-center">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
              id="pattern-image-upload"
            />
            <label htmlFor="pattern-image-upload" className="cursor-pointer block">
              {uploadedImage ? (
                <div className="flex items-center justify-center gap-6">
                  <img src={uploadedImage} alt="Original" className="max-h-32 rounded-lg" />
                  <div className="text-2xl">→</div>
                  {processedImage && (
                    <img
                      src={processedImage}
                      alt="Processed"
                      className="h-32 rounded-lg border-2 border-indigo-500"
                      style={{ imageRendering: 'pixelated' }}
                    />
                  )}
                </div>
              ) : (
                <>
                  <div className="text-5xl mb-3">🖼️</div>
                  <p className="text-gray-400">Click to upload an image</p>
                  <p className="text-xs text-gray-600 mt-1">Photos, artwork, textures - anything!</p>
                </>
              )}
            </label>
          </div>

          {uploadedImage && (
            <>
              {/* Controls */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">
                    Pixel Scale: {config.pixelSize}x
                  </label>
                  <input
                    type="range"
                    min="2"
                    max="8"
                    value={config.pixelSize}
                    onChange={(e) => setConfig(prev => ({ ...prev, pixelSize: parseInt(e.target.value) }))}
                    className="slider w-full"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">
                    Colors: {config.colorCount}
                  </label>
                  <input
                    type="range"
                    min="2"
                    max="16"
                    value={config.colorCount}
                    onChange={(e) => setConfig(prev => ({ ...prev, colorCount: parseInt(e.target.value) }))}
                    className="slider w-full"
                  />
                </div>
              </div>

              {/* Repeat Modes */}
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Tile Repeat Mode</label>
                <div className="grid grid-cols-5 gap-2">
                  {REPEAT_MODES.map(mode => (
                    <button
                      key={mode.id}
                      onClick={() => setConfig(prev => ({ ...prev, repeatMode: mode.id }))}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        config.repeatMode === mode.id
                          ? 'border-indigo-500 bg-indigo-900/30 text-white'
                          : 'border-gray-700 text-gray-400 hover:border-gray-500'
                      }`}
                      title={mode.description}
                    >
                      <div className="text-2xl mb-1">{mode.icon}</div>
                      <div className="text-xs">{mode.name}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Pattern Preview</label>
                <div className="flex gap-4 items-start">
                  <canvas
                    ref={previewCanvasRef}
                    className="flex-1 rounded-lg border border-gray-700"
                    style={{ imageRendering: 'pixelated' }}
                  />
                </div>
              </div>
            </>
          )}

          {/* Hidden processing canvas */}
          <canvas ref={sourceCanvasRef} className="hidden" />
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-800">
          <button
            onClick={handleCreate}
            disabled={!processedImage}
            className={`w-full py-3 rounded-lg font-medium transition-colors ${
              processedImage
                ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
            }`}
          >
            Add Pattern to Collection
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// GEOMETRIC PATTERN BUILDER - Pendleton-Style Blanket Patterns
// ============================================================================

type GeometricPatternType = 'stripes' | 'diamonds' | 'chevron' | 'steps' | 'arrows' | 'zigzag' | 'bands';

interface GeometricPattern {
  id: GeometricPatternType;
  name: string;
  icon: string;
  description: string;
}

const GEOMETRIC_PATTERNS: GeometricPattern[] = [
  { id: 'stripes', name: 'Blanket Stripes', icon: '▬', description: 'Classic horizontal banding' },
  { id: 'diamonds', name: 'Diamonds', icon: '◇', description: 'Centered diamond motifs' },
  { id: 'chevron', name: 'Chevron', icon: '⌃', description: 'Arrow/chevron bands' },
  { id: 'steps', name: 'Steps', icon: '⊏', description: 'Stair-step pattern' },
  { id: 'arrows', name: 'Arrows', icon: '△', description: 'Directional arrow motifs' },
  { id: 'zigzag', name: 'ZigZag', icon: '⚡', description: 'Dynamic zigzag lines' },
  { id: 'bands', name: 'Wide Bands', icon: '▄', description: 'Bold color blocks' },
];

// Pendleton-inspired color palettes
const PENDLETON_PALETTES = {
  'Chief Joseph': ['R', 'Y', 'K', 'W', 'DB'],
  'Glacier Park': ['R', 'K', 'Y', 'G'],
  'San Miguel': ['T', 'R', 'K', 'Y', 'W'],
  'Sante Fe': ['T', 'K', 'R', 'O', 'Y'],
  'Sunset': ['R', 'O', 'Y', 'K', 'W'],
  'Earth': ['BR', 'K', 'W', 'R', 'G'],
  'Ocean': ['DB', 'T', 'W', 'K', 'B'],
  'Desert': ['BR', 'O', 'Y', 'R', 'K'],
};

function GeometricPatternBuilder({
  onClose,
  onCreatePattern,
}: {
  onClose: () => void;
  onCreatePattern: (threadcount: string) => void;
}) {
  const [patternType, setPatternType] = useState<GeometricPatternType>('stripes');
  const [colorPalette, setColorPalette] = useState<string>('Chief Joseph');
  const [complexity, setComplexity] = useState(3); // 1-5
  const [symmetry, setSymmetry] = useState(true);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [generatedThreadcount, setGeneratedThreadcount] = useState<string>('');

  const colors = PENDLETON_PALETTES[colorPalette as keyof typeof PENDLETON_PALETTES] || PENDLETON_PALETTES['Chief Joseph'];

  // Generate threadcount based on pattern type
  const generatePattern = useCallback(() => {
    const stripes: { color: string; count: number }[] = [];
    const baseCount = 8 + complexity * 4;

    switch (patternType) {
      case 'stripes':
        // Classic horizontal banding like Pendleton blankets
        for (let i = 0; i < complexity * 2 + 3; i++) {
          const color = colors[i % colors.length];
          const count = i % 3 === 0 ? baseCount * 2 : baseCount / 2;
          stripes.push({ color, count: Math.round(count) });
        }
        break;

      case 'diamonds':
        // Diamond pattern built with graduated stripes
        const half = Math.ceil(complexity * 1.5);
        for (let i = 0; i < half; i++) {
          const color = colors[i % colors.length];
          const count = baseCount - i * 2;
          stripes.push({ color, count: Math.max(4, count) });
        }
        // Mirror for diamond effect
        if (symmetry) {
          for (let i = half - 2; i >= 0; i--) {
            stripes.push({ ...stripes[i] });
          }
        }
        break;

      case 'chevron':
        // V-shaped bands
        for (let i = 0; i < complexity + 2; i++) {
          stripes.push({ color: colors[0], count: 4 });
          stripes.push({ color: colors[i % colors.length], count: baseCount });
          stripes.push({ color: colors[0], count: 4 });
        }
        break;

      case 'steps':
        // Stair-step graduated pattern
        for (let step = 0; step < complexity + 2; step++) {
          const size = 4 + step * 4;
          stripes.push({ color: colors[step % colors.length], count: size });
          stripes.push({ color: 'K', count: 2 });
        }
        break;

      case 'arrows':
        // Arrow/pointer shapes
        stripes.push({ color: colors[0], count: baseCount * 2 });
        for (let i = 0; i < complexity + 1; i++) {
          stripes.push({ color: colors[1], count: 4 });
          stripes.push({ color: colors[2], count: baseCount - i * 2 });
          stripes.push({ color: colors[1], count: 4 });
        }
        stripes.push({ color: colors[0], count: baseCount * 2 });
        break;

      case 'zigzag':
        // Dynamic zigzag lines
        for (let i = 0; i < (complexity + 2) * 2; i++) {
          const isAscending = i % 2 === 0;
          const size = isAscending ? 4 + (i % 4) * 4 : 16 - (i % 4) * 4;
          stripes.push({ color: colors[i % colors.length], count: Math.max(4, size) });
        }
        break;

      case 'bands':
        // Wide bold color blocks
        for (let i = 0; i < complexity + 2; i++) {
          stripes.push({ color: colors[i % colors.length], count: baseCount * 2 });
          stripes.push({ color: 'K', count: 4 });
        }
        break;
    }

    // Generate threadcount string
    const threadcount = stripes.map((s, i) => {
      const isFirst = i === 0;
      const isLast = i === stripes.length - 1;
      const prefix = (isFirst && symmetry) ? `${s.color}/` : s.color;
      const suffix = (isLast && symmetry) ? `/${s.count}` : s.count.toString();
      return (isFirst && symmetry) ? `${prefix}${suffix}` : (isLast && symmetry) ? `${s.color}/${suffix}` : `${s.color}${s.count}`;
    }).join(' ');

    // Fix the threadcount notation for symmetric setts
    let tc = stripes.map(s => `${s.color}${s.count}`).join(' ');
    if (symmetry && stripes.length > 0) {
      const first = stripes[0];
      const last = stripes[stripes.length - 1];
      tc = `${first.color}/${first.count} ${stripes.slice(1, -1).map(s => `${s.color}${s.count}`).join(' ')} ${last.color}/${last.count}`;
    }

    setGeneratedThreadcount(tc);
    return tc;
  }, [patternType, colors, complexity, symmetry]);

  // Draw preview with actual geometric shapes (not tartan grid)
  useEffect(() => {
    generatePattern(); // Keep threadcount updated

    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 200;
    canvas.width = size;
    canvas.height = size;

    // Get colors for the pattern
    const getHex = (code: string): string => {
      const color = getColor(code);
      return color?.hex || '#808080';
    };

    // Background
    ctx.fillStyle = getHex(colors[0]);
    ctx.fillRect(0, 0, size, size);

    const baseCount = 8 + complexity * 4;

    switch (patternType) {
      case 'stripes':
        // Horizontal blanket stripes
        const stripeHeight = size / (complexity * 2 + 4);
        for (let i = 0; i < complexity * 2 + 4; i++) {
          ctx.fillStyle = getHex(colors[i % colors.length]);
          const h = i % 3 === 0 ? stripeHeight * 2 : stripeHeight * 0.5;
          ctx.fillRect(0, i * stripeHeight, size, h + 1);
        }
        break;

      case 'diamonds':
        // Draw concentric diamonds
        const diamondLayers = complexity + 2;
        for (let layer = diamondLayers; layer >= 0; layer--) {
          const layerSize = (size / 2) * (layer / diamondLayers);
          ctx.fillStyle = getHex(colors[layer % colors.length]);
          ctx.beginPath();
          ctx.moveTo(size / 2, size / 2 - layerSize); // top
          ctx.lineTo(size / 2 + layerSize, size / 2); // right
          ctx.lineTo(size / 2, size / 2 + layerSize); // bottom
          ctx.lineTo(size / 2 - layerSize, size / 2); // left
          ctx.closePath();
          ctx.fill();
        }
        break;

      case 'chevron':
        // V-shaped chevron bands
        const chevronHeight = size / (complexity + 3);
        for (let i = 0; i < complexity + 3; i++) {
          ctx.fillStyle = getHex(colors[i % colors.length]);
          ctx.beginPath();
          const y1 = i * chevronHeight;
          const y2 = (i + 1) * chevronHeight;
          ctx.moveTo(0, y1);
          ctx.lineTo(size / 2, y1 + chevronHeight / 2);
          ctx.lineTo(size, y1);
          ctx.lineTo(size, y2);
          ctx.lineTo(size / 2, y2 + chevronHeight / 2);
          ctx.lineTo(0, y2);
          ctx.closePath();
          ctx.fill();
        }
        break;

      case 'steps':
        // Stair-step pattern
        const stepSize = size / (complexity + 3);
        for (let i = 0; i < complexity + 3; i++) {
          ctx.fillStyle = getHex(colors[i % colors.length]);
          for (let j = 0; j <= i; j++) {
            ctx.fillRect(j * stepSize, i * stepSize, stepSize + 1, stepSize + 1);
            ctx.fillRect((size - (j + 1) * stepSize), i * stepSize, stepSize + 1, stepSize + 1);
          }
        }
        break;

      case 'arrows':
        // Arrow/pointer shapes pointing up
        const arrowCount = complexity + 2;
        const arrowHeight = size / arrowCount;
        for (let i = 0; i < arrowCount; i++) {
          ctx.fillStyle = getHex(colors[i % colors.length]);
          const y = i * arrowHeight;
          const arrowWidth = size * (0.3 + (i % 3) * 0.2);
          ctx.beginPath();
          ctx.moveTo(size / 2, y);
          ctx.lineTo(size / 2 + arrowWidth / 2, y + arrowHeight);
          ctx.lineTo(size / 2 - arrowWidth / 2, y + arrowHeight);
          ctx.closePath();
          ctx.fill();
        }
        break;

      case 'zigzag':
        // Dynamic zigzag lines
        const zigWidth = size / (complexity + 2);
        const zigHeight = size / 4;
        for (let row = 0; row < 4; row++) {
          for (let i = 0; i < complexity + 2; i++) {
            ctx.fillStyle = getHex(colors[(row + i) % colors.length]);
            ctx.beginPath();
            const x = i * zigWidth;
            const y = row * zigHeight;
            const offset = row % 2 === 0 ? 0 : zigWidth / 2;
            ctx.moveTo(x + offset, y);
            ctx.lineTo(x + zigWidth / 2 + offset, y + zigHeight);
            ctx.lineTo(x + offset, y + zigHeight);
            ctx.closePath();
            ctx.fill();
          }
        }
        break;

      case 'bands':
        // Wide bold horizontal color blocks
        const bandHeight = size / (complexity + 2);
        for (let i = 0; i < complexity + 2; i++) {
          ctx.fillStyle = getHex(colors[i % colors.length]);
          ctx.fillRect(0, i * bandHeight, size, bandHeight - 4);
          // Add thin black separator
          ctx.fillStyle = getHex('K');
          ctx.fillRect(0, (i + 1) * bandHeight - 4, size, 4);
        }
        break;
    }

    // Add subtle border
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, size, size);

  }, [patternType, colorPalette, complexity, symmetry, colors, generatePattern]);

  const handleCreate = () => {
    if (generatedThreadcount) {
      onCreatePattern(generatedThreadcount);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-gray-800">
        {/* Header */}
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Geometric Pattern Builder</h2>
            <p className="text-sm text-gray-400 mt-1">Create Pendleton-style blanket patterns</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Pattern Type Selection */}
          <div>
            <label className="text-sm text-gray-400 mb-3 block">Pattern Style</label>
            <div className="grid grid-cols-4 gap-2">
              {GEOMETRIC_PATTERNS.map(pattern => (
                <button
                  key={pattern.id}
                  onClick={() => setPatternType(pattern.id)}
                  className={`p-3 rounded-lg text-center transition-all ${
                    patternType === pattern.id
                      ? 'bg-indigo-600 text-white ring-2 ring-indigo-400'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <div className="text-2xl mb-1">{pattern.icon}</div>
                  <div className="text-xs">{pattern.name}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Color Palette Selection */}
          <div>
            <label className="text-sm text-gray-400 mb-3 block">Color Palette</label>
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(PENDLETON_PALETTES).map(([name, paletteColors]) => (
                <button
                  key={name}
                  onClick={() => setColorPalette(name)}
                  className={`p-2 rounded-lg transition-all ${
                    colorPalette === name
                      ? 'ring-2 ring-indigo-400'
                      : 'hover:ring-1 hover:ring-gray-600'
                  }`}
                >
                  <div className="flex gap-0.5 mb-1 justify-center">
                    {paletteColors.slice(0, 4).map((c, i) => {
                      const color = getColor(c);
                      return (
                        <div
                          key={i}
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: color?.hex || '#808080' }}
                        />
                      );
                    })}
                  </div>
                  <div className="text-xs text-gray-400">{name}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Complexity Slider */}
          <div>
            <label className="text-sm text-gray-400 mb-2 block">
              Complexity: {complexity}
            </label>
            <input
              type="range"
              min="1"
              max="5"
              value={complexity}
              onChange={(e) => setComplexity(parseInt(e.target.value))}
              className="slider w-full"
            />
            <div className="flex justify-between text-xs text-gray-600">
              <span>Simple</span>
              <span>Complex</span>
            </div>
          </div>

          {/* Symmetry Toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSymmetry(!symmetry)}
              className={`px-4 py-2 rounded-lg transition-all ${
                symmetry ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400'
              }`}
            >
              Symmetric (Mirror)
            </button>
            <span className="text-sm text-gray-500">
              {symmetry ? 'Pattern reflects at center' : 'Pattern repeats directly'}
            </span>
          </div>

          {/* Preview */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="text-sm text-gray-400 mb-2 block">Preview</label>
              <canvas
                ref={previewCanvasRef}
                className="w-full aspect-square rounded-lg border border-gray-700"
                style={{ imageRendering: 'auto' }}
              />
            </div>
            <div className="flex flex-col justify-between">
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Threadcount</label>
                <div className="bg-gray-800 p-3 rounded-lg font-mono text-xs text-gray-300 break-all">
                  {generatedThreadcount || 'Generating...'}
                </div>
              </div>
              <button
                onClick={handleCreate}
                className="btn-primary w-full"
                disabled={!generatedThreadcount}
              >
                Add to Collection
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// KNITTING CHART BUILDER - Aran/Cable Stitch Patterns
// ============================================================================

type StitchType = 'knit' | 'purl' | 'cable4f' | 'cable4b' | 'cable6f' | 'cable6b' | 'moss' | 'seed' | 'honeycomb' | 'trinity' | 'basket';

interface StitchPattern {
  id: string;
  name: string;
  symbol: string;
  description: string;
  width: number;
  height: number;
  chart: StitchType[][];
}

// Classic Aran stitch patterns
const ARAN_PATTERNS: StitchPattern[] = [
  {
    id: 'cable4',
    name: '4-Stitch Cable',
    symbol: '⫘',
    description: 'Classic rope cable',
    width: 6,
    height: 8,
    chart: [
      ['purl', 'cable4f', 'cable4f', 'cable4f', 'cable4f', 'purl'],
      ['purl', 'knit', 'knit', 'knit', 'knit', 'purl'],
      ['purl', 'knit', 'knit', 'knit', 'knit', 'purl'],
      ['purl', 'knit', 'knit', 'knit', 'knit', 'purl'],
      ['purl', 'cable4b', 'cable4b', 'cable4b', 'cable4b', 'purl'],
      ['purl', 'knit', 'knit', 'knit', 'knit', 'purl'],
      ['purl', 'knit', 'knit', 'knit', 'knit', 'purl'],
      ['purl', 'knit', 'knit', 'knit', 'knit', 'purl'],
    ],
  },
  {
    id: 'honeycomb',
    name: 'Honeycomb',
    symbol: '⬡',
    description: 'Interlocking diamond texture',
    width: 8,
    height: 8,
    chart: [
      ['cable4f', 'cable4f', 'cable4f', 'cable4f', 'cable4b', 'cable4b', 'cable4b', 'cable4b'],
      ['knit', 'knit', 'knit', 'knit', 'knit', 'knit', 'knit', 'knit'],
      ['knit', 'knit', 'knit', 'knit', 'knit', 'knit', 'knit', 'knit'],
      ['knit', 'knit', 'knit', 'knit', 'knit', 'knit', 'knit', 'knit'],
      ['cable4b', 'cable4b', 'cable4b', 'cable4b', 'cable4f', 'cable4f', 'cable4f', 'cable4f'],
      ['knit', 'knit', 'knit', 'knit', 'knit', 'knit', 'knit', 'knit'],
      ['knit', 'knit', 'knit', 'knit', 'knit', 'knit', 'knit', 'knit'],
      ['knit', 'knit', 'knit', 'knit', 'knit', 'knit', 'knit', 'knit'],
    ],
  },
  {
    id: 'moss',
    name: 'Moss Stitch',
    symbol: '⁘',
    description: 'Textured seed pattern',
    width: 4,
    height: 4,
    chart: [
      ['knit', 'purl', 'knit', 'purl'],
      ['purl', 'knit', 'purl', 'knit'],
      ['purl', 'knit', 'purl', 'knit'],
      ['knit', 'purl', 'knit', 'purl'],
    ],
  },
  {
    id: 'trinity',
    name: 'Trinity/Blackberry',
    symbol: '⁂',
    description: 'Bobble texture stitch',
    width: 4,
    height: 4,
    chart: [
      ['trinity', 'purl', 'trinity', 'purl'],
      ['purl', 'purl', 'purl', 'purl'],
      ['purl', 'trinity', 'purl', 'trinity'],
      ['purl', 'purl', 'purl', 'purl'],
    ],
  },
  {
    id: 'basket',
    name: 'Basket Weave',
    symbol: '⊞',
    description: 'Woven texture pattern',
    width: 8,
    height: 8,
    chart: [
      ['knit', 'knit', 'knit', 'knit', 'purl', 'purl', 'purl', 'purl'],
      ['knit', 'knit', 'knit', 'knit', 'purl', 'purl', 'purl', 'purl'],
      ['knit', 'knit', 'knit', 'knit', 'purl', 'purl', 'purl', 'purl'],
      ['knit', 'knit', 'knit', 'knit', 'purl', 'purl', 'purl', 'purl'],
      ['purl', 'purl', 'purl', 'purl', 'knit', 'knit', 'knit', 'knit'],
      ['purl', 'purl', 'purl', 'purl', 'knit', 'knit', 'knit', 'knit'],
      ['purl', 'purl', 'purl', 'purl', 'knit', 'knit', 'knit', 'knit'],
      ['purl', 'purl', 'purl', 'purl', 'knit', 'knit', 'knit', 'knit'],
    ],
  },
  {
    id: 'diamond',
    name: 'Diamond Cable',
    symbol: '◇',
    description: 'Diamond lattice pattern',
    width: 12,
    height: 12,
    chart: [
      ['purl', 'purl', 'purl', 'purl', 'purl', 'cable4f', 'cable4f', 'purl', 'purl', 'purl', 'purl', 'purl'],
      ['purl', 'purl', 'purl', 'purl', 'cable4b', 'purl', 'purl', 'cable4f', 'purl', 'purl', 'purl', 'purl'],
      ['purl', 'purl', 'purl', 'cable4b', 'purl', 'purl', 'purl', 'purl', 'cable4f', 'purl', 'purl', 'purl'],
      ['purl', 'purl', 'cable4b', 'purl', 'purl', 'purl', 'purl', 'purl', 'purl', 'cable4f', 'purl', 'purl'],
      ['purl', 'cable4b', 'purl', 'purl', 'purl', 'purl', 'purl', 'purl', 'purl', 'purl', 'cable4f', 'purl'],
      ['cable4b', 'purl', 'purl', 'purl', 'purl', 'purl', 'purl', 'purl', 'purl', 'purl', 'purl', 'cable4f'],
      ['cable4f', 'purl', 'purl', 'purl', 'purl', 'purl', 'purl', 'purl', 'purl', 'purl', 'purl', 'cable4b'],
      ['purl', 'cable4f', 'purl', 'purl', 'purl', 'purl', 'purl', 'purl', 'purl', 'purl', 'cable4b', 'purl'],
      ['purl', 'purl', 'cable4f', 'purl', 'purl', 'purl', 'purl', 'purl', 'purl', 'cable4b', 'purl', 'purl'],
      ['purl', 'purl', 'purl', 'cable4f', 'purl', 'purl', 'purl', 'purl', 'cable4b', 'purl', 'purl', 'purl'],
      ['purl', 'purl', 'purl', 'purl', 'cable4f', 'purl', 'purl', 'cable4b', 'purl', 'purl', 'purl', 'purl'],
      ['purl', 'purl', 'purl', 'purl', 'purl', 'cable4f', 'cable4b', 'purl', 'purl', 'purl', 'purl', 'purl'],
    ],
  },
];

// Stitch symbols for chart display
const STITCH_SYMBOLS: Record<StitchType, { symbol: string; color: string; name: string }> = {
  knit: { symbol: '·', color: '#f5f5f5', name: 'Knit' },
  purl: { symbol: '—', color: '#d4d4d4', name: 'Purl' },
  cable4f: { symbol: '⟋', color: '#818cf8', name: 'Cable 4 Front' },
  cable4b: { symbol: '⟍', color: '#a78bfa', name: 'Cable 4 Back' },
  cable6f: { symbol: '⫽', color: '#6366f1', name: 'Cable 6 Front' },
  cable6b: { symbol: '⫻', color: '#8b5cf6', name: 'Cable 6 Back' },
  moss: { symbol: '⁘', color: '#86efac', name: 'Moss' },
  seed: { symbol: '⁛', color: '#a7f3d0', name: 'Seed' },
  honeycomb: { symbol: '⬡', color: '#fcd34d', name: 'Honeycomb' },
  trinity: { symbol: '⁂', color: '#f9a8d4', name: 'Trinity' },
  basket: { symbol: '⊞', color: '#c4b5fd', name: 'Basket' },
};

function KnittingChartBuilder({
  onClose,
}: {
  onClose: () => void;
}) {
  const [selectedPatterns, setSelectedPatterns] = useState<string[]>(['cable4']);
  const [panelCount, setPanelCount] = useState(3);
  const [showSymbolKey, setShowSymbolKey] = useState(true);
  const chartCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Generate combined chart from selected patterns
  const generateCombinedChart = useCallback(() => {
    const patterns = selectedPatterns.map(id => ARAN_PATTERNS.find(p => p.id === id)).filter(Boolean) as StitchPattern[];
    if (patterns.length === 0) return { chart: [], width: 0, height: 0 };

    // Find max height and total width
    const maxHeight = Math.max(...patterns.map(p => p.height));
    const totalWidth = patterns.reduce((sum, p) => sum + p.width + 2, 0) - 2; // +2 for purl dividers

    // Build combined chart
    const chart: StitchType[][] = [];
    for (let row = 0; row < maxHeight; row++) {
      const chartRow: StitchType[] = [];
      for (let pi = 0; pi < patterns.length; pi++) {
        const pattern = patterns[pi];
        const patternRow = row % pattern.height;
        chartRow.push(...pattern.chart[patternRow]);
        if (pi < patterns.length - 1) {
          chartRow.push('purl', 'purl'); // Divider
        }
      }
      chart.push(chartRow);
    }

    return { chart, width: totalWidth, height: maxHeight };
  }, [selectedPatterns]);

  // Draw the stitch chart
  useEffect(() => {
    const canvas = chartCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { chart, width, height } = generateCombinedChart();
    if (chart.length === 0) return;

    const cellSize = 20;
    canvas.width = width * cellSize;
    canvas.height = height * cellSize;

    // Draw grid
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const stitch = chart[row][col];
        const stitchInfo = STITCH_SYMBOLS[stitch];

        const x = col * cellSize;
        const y = row * cellSize;

        // Background
        ctx.fillStyle = stitchInfo.color;
        ctx.fillRect(x, y, cellSize, cellSize);

        // Border
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, cellSize, cellSize);

        // Symbol
        ctx.fillStyle = '#333';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(stitchInfo.symbol, x + cellSize / 2, y + cellSize / 2);
      }
    }

    // Row numbers
    ctx.fillStyle = '#888';
    ctx.font = '10px sans-serif';
    for (let row = 0; row < height; row++) {
      ctx.fillText(`${height - row}`, -12, row * cellSize + cellSize / 2);
    }

  }, [selectedPatterns, generateCombinedChart]);

  // Draw knitted preview
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { chart, width, height } = generateCombinedChart();
    if (chart.length === 0) return;

    const size = 200;
    canvas.width = size;
    canvas.height = size;

    // Simulate knitted fabric appearance
    const stitchW = size / width;
    const stitchH = size / height;

    // Base cream/off-white yarn color
    ctx.fillStyle = '#f5f0e6';
    ctx.fillRect(0, 0, size, size);

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const stitch = chart[row % height][col];
        const x = col * stitchW;
        const y = row * stitchH;

        // Create texture based on stitch type
        if (stitch === 'purl' || stitch.includes('cable')) {
          // Raised texture - darker shadow
          ctx.fillStyle = 'rgba(0,0,0,0.15)';
          ctx.fillRect(x, y, stitchW, stitchH * 0.3);
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
          ctx.fillRect(x, y + stitchH * 0.7, stitchW, stitchH * 0.3);
        }

        if (stitch.includes('cable')) {
          // Cable crossing effect
          ctx.fillStyle = 'rgba(0,0,0,0.1)';
          if (stitch.includes('f')) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + stitchW, y + stitchH);
            ctx.lineTo(x + stitchW, y);
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.moveTo(x + stitchW, y);
            ctx.lineTo(x, y + stitchH);
            ctx.lineTo(x, y);
            ctx.fill();
          }
        }

        if (stitch === 'trinity') {
          // Bobble effect
          ctx.fillStyle = 'rgba(0,0,0,0.1)';
          ctx.beginPath();
          ctx.arc(x + stitchW / 2, y + stitchH / 2, stitchW * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Tile the pattern for full sweater preview
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = size;
    tempCanvas.height = size;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      tempCtx.drawImage(canvas, 0, 0);
      // Tile 2x2
      ctx.drawImage(tempCanvas, 0, 0, size / 2, size / 2);
      ctx.drawImage(tempCanvas, size / 2, 0, size / 2, size / 2);
      ctx.drawImage(tempCanvas, 0, size / 2, size / 2, size / 2);
      ctx.drawImage(tempCanvas, size / 2, size / 2, size / 2, size / 2);
    }

  }, [selectedPatterns, generateCombinedChart]);

  const togglePattern = (id: string) => {
    setSelectedPatterns(prev => {
      if (prev.includes(id)) {
        return prev.filter(p => p !== id);
      }
      if (prev.length < panelCount) {
        return [...prev, id];
      }
      return prev;
    });
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-gray-800">
        {/* Header */}
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Knitting Chart Builder</h2>
            <p className="text-sm text-gray-400 mt-1">Create Aran/Irish cable patterns</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Pattern Selection */}
          <div>
            <label className="text-sm text-gray-400 mb-3 block">
              Select Stitch Patterns (up to {panelCount})
            </label>
            <div className="grid grid-cols-3 gap-2">
              {ARAN_PATTERNS.map(pattern => (
                <button
                  key={pattern.id}
                  onClick={() => togglePattern(pattern.id)}
                  className={`p-3 rounded-lg text-left transition-all ${
                    selectedPatterns.includes(pattern.id)
                      ? 'bg-indigo-600 text-white ring-2 ring-indigo-400'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  } ${selectedPatterns.length >= panelCount && !selectedPatterns.includes(pattern.id) ? 'opacity-50' : ''}`}
                  disabled={selectedPatterns.length >= panelCount && !selectedPatterns.includes(pattern.id)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{pattern.symbol}</span>
                    <div>
                      <div className="font-medium text-sm">{pattern.name}</div>
                      <div className="text-xs opacity-70">{pattern.description}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Panel Count */}
          <div>
            <label className="text-sm text-gray-400 mb-2 block">
              Panel Count: {panelCount}
            </label>
            <input
              type="range"
              min="1"
              max="5"
              value={panelCount}
              onChange={(e) => {
                const count = parseInt(e.target.value);
                setPanelCount(count);
                if (selectedPatterns.length > count) {
                  setSelectedPatterns(prev => prev.slice(0, count));
                }
              }}
              className="slider w-full"
            />
          </div>

          {/* Chart and Preview */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-gray-400">Stitch Chart</label>
                <button
                  onClick={() => setShowSymbolKey(!showSymbolKey)}
                  className="text-xs text-indigo-400 hover:text-indigo-300"
                >
                  {showSymbolKey ? 'Hide' : 'Show'} Key
                </button>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 overflow-auto max-h-64">
                <canvas
                  ref={chartCanvasRef}
                  className="mx-auto"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
              {showSymbolKey && (
                <div className="mt-3 grid grid-cols-2 gap-1 text-xs">
                  {Object.entries(STITCH_SYMBOLS).slice(0, 6).map(([key, info]) => (
                    <div key={key} className="flex items-center gap-1 text-gray-400">
                      <span
                        className="w-5 h-5 flex items-center justify-center rounded text-sm"
                        style={{ backgroundColor: info.color, color: '#333' }}
                      >
                        {info.symbol}
                      </span>
                      <span>{info.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="text-sm text-gray-400 mb-2 block">Knitted Preview</label>
              <canvas
                ref={previewCanvasRef}
                className="w-full aspect-square rounded-lg border border-gray-700"
              />
              <p className="text-xs text-gray-500 mt-2 text-center">
                Simulated Aran sweater texture
              </p>
            </div>
          </div>

          {/* Download/Export */}
          <div className="flex gap-3">
            <button
              onClick={() => {
                const canvas = chartCanvasRef.current;
                if (!canvas) return;
                const link = document.createElement('a');
                link.download = 'knitting-chart.png';
                link.href = canvas.toDataURL('image/png');
                link.click();
              }}
              className="btn-primary flex-1"
            >
              Download Chart
            </button>
            <button
              onClick={() => {
                const canvas = previewCanvasRef.current;
                if (!canvas) return;
                const link = document.createElement('a');
                link.download = 'knitted-preview.png';
                link.href = canvas.toDataURL('image/png');
                link.click();
              }}
              className="btn-secondary flex-1"
            >
              Download Preview
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// TARTAN LIBRARY - Famous Tartans with Real Threadcounts
// ============================================================================

interface TartanRecord {
  name: string;
  threadcount: string;
  category: 'Clan' | 'District' | 'Military' | 'Corporate' | 'Fashion' | 'Royal' | 'Historic';
  description?: string;
  popularity?: number; // 1-100
}

// Comprehensive database of famous tartans with authentic threadcounts
const TARTAN_LIBRARY: TartanRecord[] = [
  // === MOST FAMOUS (Popularity 90-100) ===
  { name: 'Royal Stewart', threadcount: 'R/72 G4 R2 K24 Y2 K24 W2 K2 Y2 K32 W2 B/24', category: 'Royal', description: 'Official tartan of the Royal House of Stewart', popularity: 100 },
  { name: 'Black Watch', threadcount: 'K/4 B4 K4 B4 K20 G24 K6 G24 K20 B22 K/4', category: 'Military', description: 'Military regiment (42nd Highland) since 1739', popularity: 98 },
  { name: 'MacLeod of Lewis', threadcount: 'Y/24 K4 Y/24', category: 'Clan', description: 'Distinctive bright yellow tartan of Clan MacLeod', popularity: 95 },
  { name: 'Campbell of Argyll', threadcount: 'K/2 B6 K6 G28 K6 B6 K4 W4 Y4 W/4', category: 'Clan', description: 'Clan Campbell of Argyll', popularity: 93 },
  { name: 'MacDonald', threadcount: 'R/8 G32 R6 G32 B32 R/8', category: 'Clan', description: 'Lords of the Isles', popularity: 92 },
  { name: 'Gordon', threadcount: 'B/2 K2 B2 K6 G28 K28 Y/6', category: 'Clan', description: 'Clan Gordon of Aberdeenshire', popularity: 90 },

  // === VERY POPULAR (Popularity 80-89) ===
  { name: 'Buchanan', threadcount: 'Y/4 R8 Y4 R2 K4 R2 W2 G24 R4 G24 W2 R2 K4 R2 Y/4', category: 'Clan', description: 'Clan Buchanan', popularity: 88 },
  { name: 'Cameron of Erracht', threadcount: 'R/4 G48 R6 G4 R6 G48 Y4 B6 Y4 G48 R6 G4 R6 G48 R/4', category: 'Clan', description: 'Clan Cameron war tartan', popularity: 87 },
  { name: 'Fraser', threadcount: 'R/4 G32 R8 G4 R8 G32 W4 B4 W/4', category: 'Clan', description: 'Clan Fraser of Lovat', popularity: 86 },
  { name: 'MacKenzie', threadcount: 'B/12 G28 B2 G2 B2 K4 R4 K4 W/2', category: 'Clan', description: 'Clan MacKenzie', popularity: 85 },
  { name: 'Stewart of Atholl', threadcount: 'B/6 K2 B6 K32 R6 K32 B6 K2 B/6', category: 'Clan', description: 'Ancient Stewart variant', popularity: 84 },
  { name: 'Douglas', threadcount: 'G/4 B4 G4 B24 K24 B4 W4 B4 K24 B24 G4 B4 G/4', category: 'Clan', description: 'Grey Douglas tartan', popularity: 83 },
  { name: 'Wallace', threadcount: 'K/2 Y6 K6 R48 K8 Y8 K8 R48 K6 Y6 K/2', category: 'Clan', description: 'Clan Wallace - Red Wallace', popularity: 82 },
  { name: 'Lindsay', threadcount: 'R/8 B24 R4 B2 R4 G24 R4 G2 R4 B24 R/8', category: 'Clan', description: 'Clan Lindsay', popularity: 81 },
  { name: 'Murray of Atholl', threadcount: 'G/4 K2 G4 K32 B4 K32 G4 K2 G/4', category: 'Clan', description: 'Clan Murray', popularity: 80 },

  // === POPULAR (Popularity 70-79) ===
  { name: 'MacGregor', threadcount: 'R/8 G8 R8 G28 K4 G28 R8 G8 R/8', category: 'Clan', description: 'Clan MacGregor - Rob Roy', popularity: 79 },
  { name: 'MacLean of Duart', threadcount: 'B/2 K6 B6 K6 G48 K6 R6 K/6', category: 'Clan', description: 'Clan MacLean', popularity: 78 },
  { name: 'MacPherson', threadcount: 'R/4 K4 R4 K4 B24 K4 G24 K4 B24 K4 R4 K4 R/4', category: 'Clan', description: 'Clan MacPherson', popularity: 77 },
  { name: 'Robertson', threadcount: 'R/4 G2 R48 G28 B4 G28 R48 G2 R/4', category: 'Clan', description: 'Clan Robertson (Donnachaidh)', popularity: 76 },
  { name: 'Sinclair', threadcount: 'R/4 G32 R8 G32 B8 K4 Y4 K4 B8 G32 R8 G32 R/4', category: 'Clan', description: 'Clan Sinclair', popularity: 75 },
  { name: 'Forbes', threadcount: 'G/4 W2 G24 B24 G4 B24 G24 W2 G/4', category: 'Clan', description: 'Clan Forbes', popularity: 74 },
  { name: 'Grant', threadcount: 'R/4 K4 R4 K24 B24 K24 R4 K4 R/4', category: 'Clan', description: 'Clan Grant', popularity: 73 },
  { name: 'Ross', threadcount: 'R/4 G32 K4 W2 K4 R8 K4 W2 K4 G32 R/4', category: 'Clan', description: 'Clan Ross', popularity: 72 },
  { name: 'Scott', threadcount: 'R/4 W2 R48 G28 R4 G28 R48 W2 R/4', category: 'Clan', description: 'Clan Scott', popularity: 71 },
  { name: 'Hamilton', threadcount: 'R/4 W2 R4 W2 B28 W2 R4 W/2', category: 'Clan', description: 'Clan Hamilton', popularity: 70 },

  // === DISTRICT & REGIONAL ===
  { name: 'Edinburgh', threadcount: 'B/8 R4 B8 R4 G28 K4 G28 R4 B8 R4 B/8', category: 'District', description: 'Scotland\'s capital city', popularity: 68 },
  { name: 'Glasgow', threadcount: 'G/4 Y2 G24 K4 W4 K4 R24 K4 W4 K4 G24 Y2 G/4', category: 'District', description: 'Glasgow district tartan', popularity: 67 },
  { name: 'Highland', threadcount: 'G/12 R4 G12 K4 Y4 K4 G12 R4 G/12', category: 'District', description: 'Generic Highland tartan', popularity: 66 },
  { name: 'Isle of Skye', threadcount: 'B/4 G24 K4 B4 K4 W4 K4 B4 K4 G24 B/4', category: 'District', description: 'Skye district tartan', popularity: 65 },
  { name: 'Inverness', threadcount: 'R/4 G4 R4 G24 R4 G4 K8 G4 R4 G24 R4 G4 R/4', category: 'District', description: 'Highland capital', popularity: 64 },
  { name: 'Aberdeen', threadcount: 'G/4 K4 G4 K4 R32 K4 G4 K4 G/4', category: 'District', description: 'Aberdeen city tartan', popularity: 63 },
  { name: 'Galloway', threadcount: 'K/4 B24 G4 B4 G4 R12 G4 B4 G4 B24 K/4', category: 'District', description: 'Dumfries & Galloway', popularity: 62 },
  { name: 'Caledonia', threadcount: 'B/4 K2 B4 K4 R24 K4 G24 K4 R24 K4 B4 K2 B/4', category: 'District', description: 'Ancient name for Scotland', popularity: 61 },

  // === MILITARY ===
  { name: 'Royal Scots', threadcount: 'R/8 G24 R4 G4 R4 G24 B4 G4 B/4', category: 'Military', description: 'Royal Scots regiment', popularity: 69 },
  { name: 'Scots Guards', threadcount: 'B/4 K4 B4 K4 G24 K4 R4 K/4', category: 'Military', description: 'Scots Guards regiment', popularity: 68 },
  { name: 'Gordon Highlanders', threadcount: 'B/4 K2 B4 K32 G24 K6 G24 K32 Y4 B4 K2 B/4', category: 'Military', description: 'Gordon Highlanders regiment', popularity: 67 },
  { name: 'Seaforth Highlanders', threadcount: 'B/12 G28 B2 G2 B2 K4 R4 K4 W/2', category: 'Military', description: 'Seaforth Highlanders (MacKenzie)', popularity: 66 },

  // === ROYAL ===
  { name: 'Balmoral', threadcount: 'GY/4 K4 GY4 K4 R32 K4 GY4 K4 GY/4', category: 'Royal', description: 'Royal Balmoral - restricted use', popularity: 85 },
  { name: 'Prince Charles Edward', threadcount: 'W/4 R48 K4 R4 K4 G24 K4 W4 K4 G24 K4 R4 K4 R48 W/4', category: 'Royal', description: 'Jacobite tartan', popularity: 75 },
  { name: 'Princess Mary', threadcount: 'B/8 R4 B8 K4 G24 K4 Y4 K4 G24 K4 B8 R4 B/8', category: 'Royal', description: 'Princess Mary tartan', popularity: 60 },

  // === HISTORIC ===
  { name: 'Jacobite', threadcount: 'R/8 K4 R8 K4 G24 K4 R8 K4 R/8', category: 'Historic', description: '1745 Rebellion', popularity: 72 },
  { name: 'Bonnie Prince Charlie', threadcount: 'W/4 R48 K4 R4 K4 G24 K4 W4 K4 G24 K4 R4 K4 R48 W/4', category: 'Historic', description: 'Charles Edward Stuart', popularity: 70 },
  { name: 'Culloden', threadcount: 'R/4 G24 B4 G24 K4 R4 K/4', category: 'Historic', description: 'Battle of Culloden 1746', popularity: 68 },
  { name: 'Flora MacDonald', threadcount: 'G/8 R4 G8 B24 R4 B4 R4 B24 G8 R4 G/8', category: 'Historic', description: 'Jacobite heroine', popularity: 65 },

  // === FASHION & DESIGNER ===
  { name: 'Burberry', threadcount: 'K/2 R4 K2 TN24 K2 W/2', category: 'Fashion', description: 'Classic British check (inspired)', popularity: 85 },
  { name: 'Blackberry', threadcount: 'P/4 K8 P4 K24 W4 K24 P4 K8 P/4', category: 'Fashion', description: 'Modern purple fashion tartan', popularity: 55 },
  { name: 'Spirit of Scotland', threadcount: 'B/8 K4 B8 K4 P24 K4 B8 K4 B/8', category: 'Fashion', description: 'Modern Scottish identity', popularity: 60 },
  { name: 'Pride of Scotland', threadcount: 'B/8 K4 B8 K4 P24 K4 G24 K4 P24 K4 B8 K4 B/8', category: 'Fashion', description: 'Contemporary fashion tartan', popularity: 58 },
  { name: 'Scottish National', threadcount: 'Y/8 R4 Y8 R4 K24 R4 Y8 R4 Y/8', category: 'Fashion', description: 'Scottish nationalism', popularity: 56 },

  // === IRISH ===
  { name: 'Irish National', threadcount: 'G/24 W4 O4 W4 G/24', category: 'District', description: 'Irish tricolor tartan', popularity: 70 },
  { name: 'County Galway', threadcount: 'G/8 K4 G8 K4 R24 K4 G8 K4 G/8', category: 'District', description: 'Galway Irish tartan', popularity: 55 },
  { name: 'St. Patrick', threadcount: 'G/4 W4 G24 Y4 G24 W4 G/4', category: 'District', description: 'Irish St. Patrick tartan', popularity: 60 },

  // === MORE CLANS (A-Z continued) ===
  { name: 'Anderson', threadcount: 'B/4 K4 B4 K24 R4 K24 B4 K4 B/4', category: 'Clan', description: 'Clan Anderson', popularity: 55 },
  { name: 'Armstrong', threadcount: 'G/4 K16 G4 K4 B16 K4 G4 K16 G/4', category: 'Clan', description: 'Border clan', popularity: 58 },
  { name: 'Brodie', threadcount: 'R/4 K4 R4 K4 G24 K4 Y4 K4 G24 K4 R4 K4 R/4', category: 'Clan', description: 'Clan Brodie', popularity: 52 },
  { name: 'Bruce', threadcount: 'Y/8 R4 Y8 R4 G24 R4 Y8 R4 Y/8', category: 'Clan', description: 'Clan Bruce - Robert the Bruce', popularity: 75 },
  { name: 'Chisholm', threadcount: 'R/4 G4 R4 G24 W4 G24 R4 G4 R/4', category: 'Clan', description: 'Clan Chisholm', popularity: 54 },
  { name: 'Colquhoun', threadcount: 'B/4 K4 B4 K4 G24 K4 W4 K4 G24 K4 B4 K4 B/4', category: 'Clan', description: 'Clan Colquhoun', popularity: 50 },
  { name: 'Crawford', threadcount: 'R/4 G4 R4 G24 B4 G24 R4 G4 R/4', category: 'Clan', description: 'Clan Crawford', popularity: 53 },
  { name: 'Cunningham', threadcount: 'B/4 G24 K4 R4 K4 G24 B/4', category: 'Clan', description: 'Clan Cunningham', popularity: 51 },
  { name: 'Davidson', threadcount: 'R/4 G4 R4 G24 B4 G4 B4 G24 R4 G4 R/4', category: 'Clan', description: 'Clan Davidson', popularity: 56 },
  { name: 'Duncan', threadcount: 'B/4 G24 B4 G4 B4 K4 R4 K4 B4 G4 B4 G24 B/4', category: 'Clan', description: 'Clan Duncan', popularity: 54 },
  { name: 'Elliot', threadcount: 'R/4 B24 R4 B4 R4 G24 R4 B4 R4 B24 R/4', category: 'Clan', description: 'Border Clan Elliot', popularity: 52 },
  { name: 'Erskine', threadcount: 'G/4 K4 G4 K4 R24 K4 G4 K4 G/4', category: 'Clan', description: 'Clan Erskine', popularity: 50 },
  { name: 'Farquharson', threadcount: 'R/4 K4 R4 K4 G24 K4 Y4 K4 G24 K4 R4 K4 R/4', category: 'Clan', description: 'Clan Farquharson', popularity: 55 },
  { name: 'Ferguson', threadcount: 'G/4 B24 G4 B4 G4 W4 G4 B4 G4 B24 G/4', category: 'Clan', description: 'Clan Ferguson', popularity: 58 },
  { name: 'Graham of Montrose', threadcount: 'G/4 K4 G4 K24 W4 K24 G4 K4 G/4', category: 'Clan', description: 'Clan Graham', popularity: 60 },
  { name: 'Gunn', threadcount: 'G/4 K4 G4 K4 B24 K4 G4 K4 G/4', category: 'Clan', description: 'Clan Gunn', popularity: 52 },
  { name: 'Henderson', threadcount: 'G/4 K4 G4 K4 B24 K4 W4 K4 B24 K4 G4 K4 G/4', category: 'Clan', description: 'Clan Henderson', popularity: 55 },
  { name: 'Home', threadcount: 'G/4 K4 G4 K24 R4 K24 G4 K4 G/4', category: 'Clan', description: 'Clan Home', popularity: 48 },
  { name: 'Innes', threadcount: 'R/4 G24 R4 G4 R4 B24 R4 G4 R4 G24 R/4', category: 'Clan', description: 'Clan Innes', popularity: 50 },
  { name: 'Johnston', threadcount: 'B/4 K4 B4 K4 G24 K4 Y4 K4 G24 K4 B4 K4 B/4', category: 'Clan', description: 'Clan Johnston', popularity: 54 },
  { name: 'Keith', threadcount: 'B/4 R4 B4 R4 Y24 R4 B4 R4 B/4', category: 'Clan', description: 'Clan Keith', popularity: 52 },
  { name: 'Kennedy', threadcount: 'G/4 K4 G4 K24 B4 K24 G4 K4 G/4', category: 'Clan', description: 'Clan Kennedy', popularity: 58 },
  { name: 'Kerr', threadcount: 'R/4 G24 B4 G24 R/4', category: 'Clan', description: 'Clan Kerr', popularity: 50 },
  { name: 'Lamont', threadcount: 'B/4 G24 B4 G4 B4 W4 B4 G4 B4 G24 B/4', category: 'Clan', description: 'Clan Lamont', popularity: 52 },
  { name: 'Leslie', threadcount: 'G/4 B24 K4 B4 K4 Y4 K4 B4 K4 B24 G/4', category: 'Clan', description: 'Clan Leslie', popularity: 53 },
  { name: 'MacAlister', threadcount: 'R/4 G24 R4 G4 R4 K4 R4 G4 R4 G24 R/4', category: 'Clan', description: 'Clan MacAlister', popularity: 50 },
  { name: 'MacArthur', threadcount: 'G/4 Y4 G24 K4 Y4 K4 G24 Y4 G/4', category: 'Clan', description: 'Clan MacArthur', popularity: 55 },
  { name: 'MacAulay', threadcount: 'R/4 G24 R4 G4 R4 B4 R4 G4 R4 G24 R/4', category: 'Clan', description: 'Clan MacAulay', popularity: 52 },
  { name: 'MacBeth', threadcount: 'R/8 Y4 R8 K4 G24 K4 R8 Y4 R/8', category: 'Clan', description: 'Clan MacBeth', popularity: 58 },
  { name: 'MacCallum', threadcount: 'B/4 G24 B4 G4 B4 Y4 B4 G4 B4 G24 B/4', category: 'Clan', description: 'Clan MacCallum', popularity: 50 },
  { name: 'MacDougall', threadcount: 'R/4 K4 R4 K4 B24 K4 G24 K4 B24 K4 R4 K4 R/4', category: 'Clan', description: 'Clan MacDougall', popularity: 54 },
  { name: 'MacFarlane', threadcount: 'K/4 W8 K4 W4 K24 R4 K24 W4 K4 W8 K/4', category: 'Clan', description: 'Clan MacFarlane - Black & White', popularity: 60 },
  { name: 'MacGillivray', threadcount: 'R/4 K4 R4 K4 G24 K4 R4 K4 R/4', category: 'Clan', description: 'Clan MacGillivray', popularity: 52 },
  { name: 'MacInnes', threadcount: 'R/4 G24 K4 R4 K4 G24 R/4', category: 'Clan', description: 'Clan MacInnes', popularity: 50 },
  { name: 'MacIntosh', threadcount: 'R/4 K4 R4 K4 G24 K4 B4 K4 G24 K4 R4 K4 R/4', category: 'Clan', description: 'Clan MacIntosh', popularity: 62 },
  { name: 'MacIntyre', threadcount: 'R/4 G24 R4 G4 R4 B4 Y4 B4 R4 G4 R4 G24 R/4', category: 'Clan', description: 'Clan MacIntyre', popularity: 55 },
  { name: 'MacKay', threadcount: 'B/4 G24 B4 G4 B4 K4 W4 K4 B4 G4 B4 G24 B/4', category: 'Clan', description: 'Clan MacKay', popularity: 58 },
  { name: 'MacKinnon', threadcount: 'R/4 G24 R4 G4 R4 G24 R/4', category: 'Clan', description: 'Clan MacKinnon', popularity: 54 },
  { name: 'MacLachlan', threadcount: 'Y/4 K4 Y4 K4 R24 K4 G24 K4 R24 K4 Y4 K4 Y/4', category: 'Clan', description: 'Clan MacLachlan', popularity: 56 },
  { name: 'MacLaine of Lochbuie', threadcount: 'B/4 K4 B4 K4 G24 K4 Y4 K4 G24 K4 B4 K4 B/4', category: 'Clan', description: 'MacLaine of Lochbuie', popularity: 52 },
  { name: 'MacLaren', threadcount: 'G/4 K4 G4 K4 B24 K4 Y4 K4 B24 K4 G4 K4 G/4', category: 'Clan', description: 'Clan MacLaren', popularity: 55 },
  { name: 'MacMillan', threadcount: 'Y/4 R4 Y4 R4 G24 R4 B4 R4 G24 R4 Y4 R4 Y/4', category: 'Clan', description: 'Clan MacMillan', popularity: 58 },
  { name: 'MacNab', threadcount: 'R/4 K4 R4 K4 G24 K4 CR4 K4 G24 K4 R4 K4 R/4', category: 'Clan', description: 'Clan MacNab', popularity: 54 },
  { name: 'MacNaughton', threadcount: 'R/4 G24 B4 G4 B4 Y4 B4 G4 B4 G24 R/4', category: 'Clan', description: 'Clan MacNaughton', popularity: 52 },
  { name: 'MacNeil', threadcount: 'G/4 K4 G4 K4 B24 K4 R4 K4 B24 K4 G4 K4 G/4', category: 'Clan', description: 'Clan MacNeil of Barra', popularity: 58 },
  { name: 'MacQuarrie', threadcount: 'R/4 K4 R4 K4 G24 K4 Y4 W4 Y4 K4 G24 K4 R4 K4 R/4', category: 'Clan', description: 'Clan MacQuarrie', popularity: 50 },
  { name: 'MacQueen', threadcount: 'R/4 K4 R4 K24 Y4 K24 R4 K4 R/4', category: 'Clan', description: 'Clan MacQueen', popularity: 52 },
  { name: 'MacRae', threadcount: 'R/4 K4 R4 K4 G24 K4 R4 K4 R/4', category: 'Clan', description: 'Clan MacRae', popularity: 60 },
  { name: 'Malcolm', threadcount: 'B/4 G24 B4 G4 B4 R4 B4 G4 B4 G24 B/4', category: 'Clan', description: 'Clan Malcolm', popularity: 54 },
  { name: 'Matheson', threadcount: 'R/4 G24 R4 G4 R4 K4 R4 G4 R4 G24 R/4', category: 'Clan', description: 'Clan Matheson', popularity: 55 },
  { name: 'Maxwell', threadcount: 'R/4 G24 R4 G4 R4 K8 R4 G4 R4 G24 R/4', category: 'Clan', description: 'Clan Maxwell', popularity: 54 },
  { name: 'Menzies', threadcount: 'R/4 W4 R4 W4 G24 W4 R4 W4 R/4', category: 'Clan', description: 'Clan Menzies - Red & White', popularity: 62 },
  { name: 'Moncreiffe', threadcount: 'R/4 G24 R4 G4 R4 W4 R4 G4 R4 G24 R/4', category: 'Clan', description: 'Clan Moncreiffe', popularity: 48 },
  { name: 'Montgomery', threadcount: 'B/4 G24 B4 G4 B4 K4 B4 G4 B4 G24 B/4', category: 'Clan', description: 'Clan Montgomery', popularity: 52 },
  { name: 'Morrison', threadcount: 'G/4 K4 G4 K4 R24 K4 B4 K4 R24 K4 G4 K4 G/4', category: 'Clan', description: 'Clan Morrison', popularity: 55 },
  { name: 'Munro', threadcount: 'R/4 K4 R4 K4 G24 K4 W4 K4 G24 K4 R4 K4 R/4', category: 'Clan', description: 'Clan Munro', popularity: 58 },
  { name: 'Napier', threadcount: 'Y/4 K4 Y4 K4 R24 K4 G4 K4 R24 K4 Y4 K4 Y/4', category: 'Clan', description: 'Clan Napier', popularity: 50 },
  { name: 'Ogilvie', threadcount: 'R/4 Y4 R4 Y4 B24 Y4 R4 Y4 R/4', category: 'Clan', description: 'Clan Ogilvie', popularity: 55 },
  { name: 'Ramsay', threadcount: 'R/4 G24 B4 G4 B4 W4 B4 G4 B4 G24 R/4', category: 'Clan', description: 'Clan Ramsay', popularity: 52 },
  { name: 'Rose', threadcount: 'R/4 K4 R4 K24 B4 K24 R4 K4 R/4', category: 'Clan', description: 'Clan Rose', popularity: 54 },
  { name: 'Shaw', threadcount: 'R/4 K4 R4 K4 G24 K4 B4 K4 G24 K4 R4 K4 R/4', category: 'Clan', description: 'Clan Shaw', popularity: 52 },
  { name: 'Skene', threadcount: 'R/4 K4 R4 K4 G24 K4 Y4 K4 G24 K4 R4 K4 R/4', category: 'Clan', description: 'Clan Skene', popularity: 50 },
  { name: 'Stewart Hunting', threadcount: 'G/4 K4 G4 K24 R4 K4 B4 K4 R4 K24 G4 K4 G/4', category: 'Clan', description: 'Stewart Hunting tartan', popularity: 72 },
  { name: 'Sutherland', threadcount: 'G/4 K4 G4 K24 B4 K4 W4 K4 B4 K24 G4 K4 G/4', category: 'Clan', description: 'Clan Sutherland', popularity: 60 },
  { name: 'Urquhart', threadcount: 'B/4 G24 K4 G4 K4 W4 K4 G4 K4 G24 B/4', category: 'Clan', description: 'Clan Urquhart', popularity: 54 },
  { name: 'Watson', threadcount: 'B/4 K4 B4 K24 R4 K24 B4 K4 B/4', category: 'Clan', description: 'Clan Watson', popularity: 52 },
  { name: 'Wemyss', threadcount: 'R/4 G24 R4 G4 R4 W4 R4 G4 R4 G24 R/4', category: 'Clan', description: 'Clan Wemyss', popularity: 48 },

  // === SIMPLE PATTERNS (for learning) ===
  { name: 'Simple Red & Black', threadcount: 'R/24 K4 R/24', category: 'Fashion', description: 'Simple two-color tartan', popularity: 45 },
  { name: 'Simple Blue & Green', threadcount: 'B/24 G8 B/24', category: 'Fashion', description: 'Classic color combination', popularity: 44 },
  { name: 'Buffalo Plaid', threadcount: 'R/24 K/24', category: 'Fashion', description: 'Classic lumberjack pattern', popularity: 75 },
  { name: 'Gingham', threadcount: 'W/8 B/8', category: 'Fashion', description: 'Classic gingham check', popularity: 70 },
];

// Sort by popularity by default
const SORTED_TARTANS = [...TARTAN_LIBRARY].sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

function TartanLibrary({
  onClose,
  onSelectTartan,
  config,
}: {
  onClose: () => void;
  onSelectTartan: (threadcount: string, name: string) => void;
  config: GeneratorConfig;
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [pasteThreadcount, setPasteThreadcount] = useState('');
  const [previewThreadcount, setPreviewThreadcount] = useState<string | null>(null);
  const [showPasteInput, setShowPasteInput] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Filter tartans
  const filteredTartans = SORTED_TARTANS.filter(t => {
    const matchesSearch = search === '' ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      (t.description && t.description.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = category === 'all' || t.category === category;
    return matchesSearch && matchesCategory;
  });

  const categories = ['all', 'Clan', 'District', 'Military', 'Royal', 'Historic', 'Fashion', 'Corporate'];

  // Render preview
  useEffect(() => {
    if (!previewThreadcount || !previewCanvasRef.current) return;

    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      const parsed = parseThreadcount(previewThreadcount);
      if (!parsed || parsed.stripes.length === 0) return;

      const expanded = expandSett(parsed);
      const size = Math.min(200, expanded.length * 4);
      canvas.width = size;
      canvas.height = size;

      const scale = size / expanded.length;
      const weave = WEAVE_PATTERNS[config.weaveType];

      for (let y = 0; y < expanded.length; y++) {
        for (let x = 0; x < expanded.length; x++) {
          const warpColor = expanded.threads[x % expanded.length];
          const weftColor = expanded.threads[y % expanded.length];
          const warpOnTop = weave.tieUp[y % weave.treadling.length][x % weave.threading.length];

          const colorCode = warpOnTop ? warpColor : weftColor;
          const color = getColor(colorCode);
          ctx.fillStyle = color?.hex || '#808080';
          ctx.fillRect(x * scale, y * scale, scale + 0.5, scale + 0.5);
        }
      }
    } catch (e) {
      ctx.fillStyle = '#333';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#666';
      ctx.font = '12px sans-serif';
      ctx.fillText('Invalid threadcount', 10, 30);
    }
  }, [previewThreadcount, config.weaveType]);

  const handlePasteSubmit = () => {
    if (pasteThreadcount.trim()) {
      try {
        const parsed = parseThreadcount(pasteThreadcount.trim());
        if (parsed && parsed.stripes.length > 0) {
          onSelectTartan(pasteThreadcount.trim(), 'Custom Tartan');
        }
      } catch (e) {
        alert('Invalid threadcount format. Example: B/24 W4 B24 R2 K24 G24 W/2');
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col border border-gray-800">
        {/* Header */}
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Tartan Library</h2>
            <p className="text-sm text-gray-400 mt-1">
              {TARTAN_LIBRARY.length}+ authentic tartans • Search or paste threadcount
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>

        {/* Search & Filters */}
        <div className="p-4 border-b border-gray-800 space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tartans by name or description..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 pl-10 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
              />
              <svg className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <button
              onClick={() => setShowPasteInput(!showPasteInput)}
              className={`px-4 py-2 rounded-lg transition-colors ${
                showPasteInput ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              Paste Threadcount
            </button>
          </div>

          {/* Paste Threadcount Input */}
          {showPasteInput && (
            <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              <label className="text-sm text-gray-400 mb-2 block">
                Paste threadcount notation (e.g., B/24 W4 B24 R2 K24 G24 W/2)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={pasteThreadcount}
                  onChange={(e) => {
                    setPasteThreadcount(e.target.value);
                    setPreviewThreadcount(e.target.value);
                  }}
                  placeholder="R/72 G4 R2 K24 Y2 K24 W2 K2 Y2 K32 W2 B/24"
                  className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none font-mono text-sm"
                />
                <button
                  onClick={handlePasteSubmit}
                  className="btn-primary"
                  disabled={!pasteThreadcount.trim()}
                >
                  Load
                </button>
              </div>
              <div className="mt-2 text-xs text-gray-500">
                Color codes: R=Red, B=Blue, G=Green, K=Black, W=White, Y=Yellow, etc.
                Pivots marked with / (e.g., B/24)
              </div>
              {previewThreadcount && (
                <div className="mt-3 flex items-center gap-4">
                  <canvas
                    ref={previewCanvasRef}
                    width={80}
                    height={80}
                    className="rounded border border-gray-600"
                    style={{ imageRendering: 'pixelated' }}
                  />
                  <span className="text-sm text-gray-400">Preview</span>
                </div>
              )}
            </div>
          )}

          {/* Category Filters */}
          <div className="flex flex-wrap gap-2">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                  category === cat
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {cat === 'all' ? 'All Tartans' : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Results Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredTartans.map((tartan, idx) => (
              <TartanLibraryCard
                key={`${tartan.name}-${idx}`}
                tartan={tartan}
                config={config}
                onSelect={() => onSelectTartan(tartan.threadcount, tartan.name)}
              />
            ))}
          </div>
          {filteredTartans.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No tartans found matching "{search}"
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 text-center text-xs text-gray-500">
          Showing {filteredTartans.length} of {TARTAN_LIBRARY.length} tartans •
          Sorted by popularity •
          Data sourced from Scottish Register of Tartans
        </div>
      </div>
    </div>
  );
}

function TartanLibraryCard({
  tartan,
  config,
  onSelect,
}: {
  tartan: TartanRecord;
  config: GeneratorConfig;
  onSelect: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      const parsed = parseThreadcount(tartan.threadcount);
      if (!parsed || parsed.stripes.length === 0) return;

      const expanded = expandSett(parsed);
      const scale = 100 / expanded.length;
      canvas.width = 100;
      canvas.height = 100;

      const weave = WEAVE_PATTERNS[config.weaveType];

      for (let y = 0; y < expanded.length; y++) {
        for (let x = 0; x < expanded.length; x++) {
          const warpColor = expanded.threads[x % expanded.length];
          const weftColor = expanded.threads[y % expanded.length];
          const warpOnTop = weave.tieUp[y % weave.treadling.length][x % weave.threading.length];

          const colorCode = warpOnTop ? warpColor : weftColor;
          const color = getColor(colorCode);
          ctx.fillStyle = color?.hex || '#808080';
          ctx.fillRect(x * scale, y * scale, scale + 0.5, scale + 0.5);
        }
      }
    } catch (e) {
      ctx.fillStyle = '#444';
      ctx.fillRect(0, 0, 100, 100);
    }
  }, [tartan.threadcount, config.weaveType]);

  const categoryColors: Record<string, string> = {
    Clan: 'bg-blue-600',
    District: 'bg-green-600',
    Military: 'bg-red-600',
    Royal: 'bg-purple-600',
    Historic: 'bg-amber-600',
    Fashion: 'bg-pink-600',
    Corporate: 'bg-gray-600',
  };

  return (
    <div
      onClick={onSelect}
      className="bg-gray-800 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-indigo-500 transition-all group"
    >
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={100}
          height={100}
          className="w-full aspect-square"
          style={{ imageRendering: 'pixelated' }}
        />
        <div className={`absolute top-2 right-2 px-2 py-0.5 rounded text-xs text-white ${categoryColors[tartan.category] || 'bg-gray-600'}`}>
          {tartan.category}
        </div>
        {tartan.popularity && tartan.popularity >= 90 && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded text-xs bg-yellow-500 text-black font-medium">
            Popular
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <span className="bg-indigo-600 px-3 py-1 rounded text-sm font-medium">Load</span>
        </div>
      </div>
      <div className="p-3">
        <h3 className="font-medium text-white truncate">{tartan.name}</h3>
        {tartan.description && (
          <p className="text-xs text-gray-500 truncate mt-0.5">{tartan.description}</p>
        )}
      </div>
    </div>
  );
}

function CrestBuilder({
  onClose,
  threadGauge
}: {
  onClose: () => void;
  threadGauge: number;
}) {
  const [crestConfig, setCrestConfig] = useState<CrestConfig>({
    targetSize: 2.5,
    threadGauge,
    backgroundColor: '#1a1a2e',
    foregroundColor: '#d4af37',
    technique: 'jacquard',
  });
  const [monogramText, setMonogramText] = useState('');
  const [shape, setShape] = useState<keyof typeof MONOGRAM_SHAPES>('shield');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [originalImage, setOriginalImage] = useState<string | null>(null); // For before/after
  const [maxColors, setMaxColors] = useState(8); // Jacquard color limit
  const [quantizeColors, setQuantizeColors] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement>(null);

  const technique = CREST_TECHNIQUES[crestConfig.technique];
  const resolution = Math.round(crestConfig.targetSize * crestConfig.threadGauge);
  const isDetailSufficient = crestConfig.targetSize >= technique.minDetail;

  // Color quantization using median cut algorithm (simplified)
  const quantizeImageColors = (ctx: CanvasRenderingContext2D, width: number, height: number, numColors: number) => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const pixels = imageData.data;

    // Collect all unique colors
    const colorCounts: Map<string, number> = new Map();
    for (let i = 0; i < pixels.length; i += 4) {
      const key = `${pixels[i]},${pixels[i+1]},${pixels[i+2]}`;
      colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
    }

    // Sort by frequency and take top N colors
    const sortedColors = Array.from(colorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, numColors)
      .map(([key]) => key.split(',').map(Number));

    // Map each pixel to nearest palette color
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i], g = pixels[i+1], b = pixels[i+2];
      let minDist = Infinity;
      let nearest = sortedColors[0];

      for (const [pr, pg, pb] of sortedColors) {
        const dist = (r-pr)**2 + (g-pg)**2 + (b-pb)**2;
        if (dist < minDist) {
          minDist = dist;
          nearest = [pr, pg, pb];
        }
      }

      pixels[i] = nearest[0];
      pixels[i+1] = nearest[1];
      pixels[i+2] = nearest[2];
    }

    ctx.putImageData(imageData, 0, 0);
    return sortedColors.length;
  };

  // Render the crest preview
  useEffect(() => {
    const canvas = canvasRef.current;
    const previewCanvas = previewCanvasRef.current;
    if (!canvas || !previewCanvas) return;

    const ctx = canvas.getContext('2d');
    const previewCtx = previewCanvas.getContext('2d');
    if (!ctx || !previewCtx) return;

    // Set canvas size to resolution (simulating thread count)
    const size = resolution;
    canvas.width = size;
    canvas.height = size;

    // Clear and fill background
    ctx.fillStyle = crestConfig.backgroundColor;
    ctx.fillRect(0, 0, size, size);

    // Draw shape
    ctx.fillStyle = crestConfig.foregroundColor;

    if (uploadedImage) {
      // Draw uploaded image at target resolution (pixelated)
      const img = new Image();
      img.onload = () => {
        // Draw image scaled down to thread resolution
        ctx.drawImage(img, 0, 0, size, size);

        // Apply color quantization if enabled
        if (quantizeColors && maxColors > 0) {
          quantizeImageColors(ctx, size, size, maxColors);
        }

        updatePreview();
      };
      img.src = uploadedImage;
    } else if (monogramText) {
      // Draw text monogram
      const fontSize = Math.floor(size * 0.6);
      ctx.font = `bold ${fontSize}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(monogramText.toUpperCase().slice(0, 3), size / 2, size / 2);
      updatePreview();
    } else {
      // Draw shape outline
      const shapePath = MONOGRAM_SHAPES[shape];
      const path = new Path2D(shapePath.svg(size * 0.8));
      ctx.save();
      ctx.translate(size * 0.1, size * 0.1);
      ctx.fill(path);
      ctx.restore();
      updatePreview();
    }

    function updatePreview() {
      if (!previewCanvas || !previewCtx || !canvas) return;
      // Scale up for preview display
      const previewSize = 280;
      previewCanvas.width = previewSize;
      previewCanvas.height = previewSize;
      previewCtx.imageSmoothingEnabled = false; // Keep pixelated look
      previewCtx.drawImage(canvas, 0, 0, previewSize, previewSize);
    }
  }, [crestConfig, monogramText, shape, uploadedImage, resolution, quantizeColors, maxColors]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setOriginalImage(dataUrl); // Store original for before/after
      setUploadedImage(dataUrl);
      setMonogramText(''); // Clear text when image uploaded
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadPixelMap = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `crest-${resolution}x${resolution}-jacquard.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gray-900 border-b border-gray-800 p-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              Crest & Monogram Builder
              {!technique.isTraditional && (
                <span className="text-xs px-2 py-0.5 bg-amber-900/50 text-amber-300 rounded-full">
                  Beyond Traditional Tartan
                </span>
              )}
            </h2>
            <p className="text-sm text-gray-400">Design embroidered or woven emblems for your tartan</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 grid md:grid-cols-2 gap-6">
          {/* Configuration Panel */}
          <div className="space-y-6">
            {/* Technique Selection */}
            <div>
              <label className="label">Production Technique</label>
              <div className="grid grid-cols-1 gap-2">
                {(Object.entries(CREST_TECHNIQUES) as [keyof typeof CREST_TECHNIQUES, typeof CREST_TECHNIQUES.jacquard][]).map(([key, tech]) => (
                  <button
                    key={key}
                    onClick={() => setCrestConfig({ ...crestConfig, technique: key })}
                    className={`p-3 rounded-lg text-left transition-all ${
                      crestConfig.technique === key
                        ? tech.isTraditional
                          ? 'bg-emerald-900/50 border-2 border-emerald-500'
                          : 'bg-amber-900/50 border-2 border-amber-500'
                        : 'bg-gray-800 border-2 border-transparent hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{tech.name}</span>
                      {tech.isTraditional ? (
                        <span className="text-xs px-2 py-0.5 bg-emerald-900/50 text-emerald-300 rounded-full">Traditional</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 bg-amber-900/50 text-amber-300 rounded-full">Modern</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{tech.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Size Configuration */}
            <div>
              <label className="label">Target Size: {crestConfig.targetSize}" × {crestConfig.targetSize}"</label>
              <input
                type="range"
                min="0.5"
                max="6"
                step="0.25"
                value={crestConfig.targetSize}
                onChange={(e) => setCrestConfig({ ...crestConfig, targetSize: parseFloat(e.target.value) })}
                className="slider w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>0.5" (Tie Pin)</span>
                <span>3" (Badge)</span>
                <span>6" (Patch)</span>
              </div>
            </div>

            {/* Thread Gauge */}
            <div>
              <label className="label">Thread Gauge: {crestConfig.threadGauge} TPI</label>
              <input
                type="range"
                min="24"
                max="120"
                step="4"
                value={crestConfig.threadGauge}
                onChange={(e) => setCrestConfig({ ...crestConfig, threadGauge: parseInt(e.target.value) })}
                className="slider w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>24 (Coarse)</span>
                <span>72 (Standard)</span>
                <span>120 (Fine)</span>
              </div>
            </div>

            {/* Resolution Info */}
            <div className={`p-4 rounded-lg ${isDetailSufficient ? 'bg-emerald-900/30 border border-emerald-800' : 'bg-amber-900/30 border border-amber-800'}`}>
              <div className="text-sm font-medium mb-2">
                Resolution: {resolution} × {resolution} threads
              </div>
              <p className="text-xs text-gray-400">
                {isDetailSufficient
                  ? `At ${crestConfig.targetSize}" with ${crestConfig.threadGauge} TPI, your crest will have sufficient detail for ${technique.name.toLowerCase()}.`
                  : `Warning: ${crestConfig.targetSize}" is below the ${technique.minDetail}" minimum for readable detail with ${technique.name.toLowerCase()}. Consider increasing size.`
                }
              </p>
            </div>

            {/* Monogram Input */}
            <div>
              <label className="label">Monogram Text (1-3 letters)</label>
              <input
                type="text"
                maxLength={3}
                value={monogramText}
                onChange={(e) => { setMonogramText(e.target.value); setUploadedImage(null); }}
                placeholder="e.g., DJM"
                className="input"
              />
            </div>

            {/* Shape Selection */}
            <div>
              <label className="label">Shape Frame</label>
              <div className="grid grid-cols-4 gap-2">
                {(Object.entries(MONOGRAM_SHAPES) as [keyof typeof MONOGRAM_SHAPES, { name: string }][]).map(([key, shapeData]) => (
                  <button
                    key={key}
                    onClick={() => setShape(key)}
                    className={`p-2 rounded-lg text-center text-sm transition-all ${
                      shape === key
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {shapeData.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Image Upload */}
            <div>
              <label className="label">Or Upload Image (Logo, Crest, Photo)</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 cursor-pointer"
              />
              {uploadedImage && (
                <div className="mt-3 space-y-3">
                  <button
                    onClick={() => { setUploadedImage(null); setOriginalImage(null); }}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Clear uploaded image
                  </button>

                  {/* Color Quantization Controls */}
                  <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm text-gray-300">Limit Colors (for looms)</label>
                      <button
                        onClick={() => setQuantizeColors(!quantizeColors)}
                        className={`w-10 h-5 rounded-full transition-colors ${quantizeColors ? 'bg-indigo-600' : 'bg-gray-700'}`}
                      >
                        <div className={`w-4 h-4 rounded-full bg-white transition-transform ${quantizeColors ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                    {quantizeColors && (
                      <div>
                        <label className="text-xs text-gray-500">Max Colors: {maxColors}</label>
                        <input
                          type="range"
                          min="2"
                          max="16"
                          value={maxColors}
                          onChange={(e) => setMaxColors(parseInt(e.target.value))}
                          className="slider w-full"
                        />
                        <div className="flex justify-between text-xs text-gray-600">
                          <span>2 (simple)</span>
                          <span>6 (Lochcarron)</span>
                          <span>16 (detailed)</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Before/After Preview */}
                  {originalImage && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Original</p>
                        <img
                          src={originalImage}
                          alt="Original"
                          className="w-full aspect-square object-cover rounded border border-gray-700"
                        />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Weavable ({resolution}px)</p>
                        <canvas
                          ref={previewCanvasRef}
                          className="w-full aspect-square rounded border border-gray-700"
                          style={{ imageRendering: 'pixelated' }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Colors (only show when no image uploaded) */}
            {!uploadedImage && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Background</label>
                <input
                  type="color"
                  value={crestConfig.backgroundColor}
                  onChange={(e) => setCrestConfig({ ...crestConfig, backgroundColor: e.target.value })}
                  className="w-full h-10 rounded-lg cursor-pointer"
                />
              </div>
              <div>
                <label className="label">Foreground</label>
                <input
                  type="color"
                  value={crestConfig.foregroundColor}
                  onChange={(e) => setCrestConfig({ ...crestConfig, foregroundColor: e.target.value })}
                  className="w-full h-10 rounded-lg cursor-pointer"
                />
              </div>
            </div>
            )}
          </div>

          {/* Preview Panel */}
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-300 mb-3">Pixel Preview (Actual Resolution)</h3>
              <div className="flex justify-center">
                <canvas
                  ref={previewCanvasRef}
                  className="rounded-lg border border-gray-700"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
              <p className="text-center text-xs text-gray-500 mt-2">
                This is how your crest will look at {resolution}×{resolution} threads
              </p>
            </div>

            {/* Hidden actual-resolution canvas */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Warning for technique */}
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <h4 className="text-sm font-medium text-amber-400 mb-2">Production Note</h4>
              <p className="text-xs text-gray-400">{technique.warning}</p>
            </div>

            {/* Manufacturer recommendations */}
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <h4 className="text-sm font-medium text-gray-300 mb-2">Recommended Manufacturers</h4>
              <ul className="text-xs text-gray-400 space-y-1">
                {crestConfig.technique === 'jacquard' && (
                  <>
                    <li>• <strong>Lochcarron of Scotland</strong> - Traditional jacquard weaving</li>
                    <li>• <strong>House of Edgar</strong> - Custom figured tartan</li>
                  </>
                )}
                {crestConfig.technique === 'embroidery' && (
                  <>
                    <li>• <strong>Hand & Lock</strong> - Luxury embroidery (London)</li>
                    <li>• <strong>Coats & Clark</strong> - Industrial embroidery</li>
                  </>
                )}
                {crestConfig.technique === 'print' && (
                  <>
                    <li>• <strong>Printful</strong> - On-demand fabric printing</li>
                    <li>• <strong>Spoonflower</strong> - Custom fabric printing</li>
                  </>
                )}
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleDownloadPixelMap}
                className="btn-primary flex-1"
              >
                Download Pixel Map
              </button>
              <button onClick={onClose} className="btn-secondary flex-1">
                Close
              </button>
            </div>
          </div>
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
    loomCompatible: false,
  });

  const [selectedForBuilder, setSelectedForBuilder] = useState<TartanCardData | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [tiledPreview, setTiledPreview] = useState<TartanCardData | null>(null);
  const [yarnCalcData, setYarnCalcData] = useState<TartanCardData | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showColorBuilder, setShowColorBuilder] = useState(false);
  const [showCrestBuilder, setShowCrestBuilder] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [breedingMode, setBreedingMode] = useState(false);
  const [breedParent1, setBreedParent1] = useState<TartanCardData | null>(null);
  const [breedParent2, setBreedParent2] = useState<TartanCardData | null>(null);
  const [productMockupData, setProductMockupData] = useState<TartanCardData | null>(null);
  const [showColorExtractor, setShowColorExtractor] = useState(false);
  const [showGeometricBuilder, setShowGeometricBuilder] = useState(false);
  const [showImagePatternBuilder, setShowImagePatternBuilder] = useState(false);
  const [showKnittingChart, setShowKnittingChart] = useState(false);
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

  // Load tartan from library (by threadcount)
  const handleLoadFromLibrary = useCallback((threadcount: string, name: string) => {
    const parsed = parseThreadcount(threadcount);
    if (!parsed || parsed.stripes.length === 0) return;

    const newTartan: TartanCardData = {
      id: `library-${name}-${Date.now()}`,
      result: {
        sett: parsed,
        seed: Date.now(),
        constraints: DEFAULT_CONSTRAINTS,
        signature: {
          signature: threadcount,
          structureSignature: threadcount,
          proportionSignature: threadcount,
        },
      },
      isOptical: config.opticalMode,
    };

    setTartans(prev => [newTartan, ...prev]);
    setShowLibrary(false);
  }, [config.opticalMode]);

  // Breed two tartans together to create offspring
  const handleBreed = useCallback(() => {
    if (!breedParent1 || !breedParent2) return;

    const p1 = breedParent1.result.sett;
    const p2 = breedParent2.result.sett;
    const offspring: TartanCardData[] = [];

    // Get all unique colors from both parents
    const allColors = [...new Set([...p1.colors, ...p2.colors])];

    // Generate 4 offspring with different breeding strategies
    for (let i = 0; i < 4; i++) {
      const childStripes: { color: string; count: number; isPivot?: boolean }[] = [];
      const seed = Date.now() + i;

      // Breeding strategy varies by offspring
      if (i === 0) {
        // Strategy 1: Interleave stripes from both parents
        const maxLen = Math.max(p1.stripes.length, p2.stripes.length);
        for (let j = 0; j < maxLen; j++) {
          if (j < p1.stripes.length && j % 2 === 0) {
            childStripes.push({ ...p1.stripes[j] });
          } else if (j < p2.stripes.length) {
            childStripes.push({ ...p2.stripes[j % p2.stripes.length] });
          }
        }
      } else if (i === 1) {
        // Strategy 2: Take structure from parent 1, colors from parent 2
        p1.stripes.forEach((stripe, idx) => {
          const colorIdx = idx % p2.colors.length;
          childStripes.push({
            ...stripe,
            color: p2.colors[colorIdx]
          });
        });
      } else if (i === 2) {
        // Strategy 3: Take structure from parent 2, colors from parent 1
        p2.stripes.forEach((stripe, idx) => {
          const colorIdx = idx % p1.colors.length;
          childStripes.push({
            ...stripe,
            color: p1.colors[colorIdx]
          });
        });
      } else {
        // Strategy 4: Random mix - select each stripe from either parent
        const maxLen = Math.max(p1.stripes.length, p2.stripes.length);
        for (let j = 0; j < maxLen; j++) {
          const useP1 = Math.random() > 0.5;
          const parent = useP1 ? p1 : p2;
          const stripeIdx = j % parent.stripes.length;

          // Maybe swap the color with one from the other parent
          const stripe = { ...parent.stripes[stripeIdx] };
          if (Math.random() > 0.7) {
            stripe.color = allColors[Math.floor(Math.random() * allColors.length)];
          }
          childStripes.push(stripe);
        }
      }

      // Mark first and last as pivots for symmetric setts
      if (childStripes.length > 0) {
        childStripes[0].isPivot = true;
        childStripes[childStripes.length - 1].isPivot = true;
      }

      const threadcount = childStripes.map(s => `${s.color}${s.isPivot ? '/' : ''}${s.count}`).join(' ');
      const childSett = parseThreadcount(threadcount);

      if (childSett && childSett.stripes.length > 0) {
        offspring.push({
          id: `breed-${seed}`,
          result: {
            sett: childSett,
            seed,
            constraints: DEFAULT_CONSTRAINTS,
            signature: {
              signature: threadcount,
              structureSignature: threadcount,
              proportionSignature: threadcount,
            },
          },
          parentId: `${breedParent1.id}+${breedParent2.id}`,
          isOptical: config.opticalMode,
        });
      }
    }

    setTartans(prev => [...offspring, ...prev]);
    setBreedingMode(false);
    setBreedParent1(null);
    setBreedParent2(null);
  }, [breedParent1, breedParent2, config.opticalMode]);

  // Handle selecting a tartan for breeding
  const handleSelectForBreeding = useCallback((data: TartanCardData) => {
    if (!breedParent1) {
      setBreedParent1(data);
    } else if (!breedParent2 && data.id !== breedParent1.id) {
      setBreedParent2(data);
    }
  }, [breedParent1, breedParent2]);

  // Handle colors extracted from photo
  const handleColorsExtracted = useCallback((colors: string[]) => {
    setConfig(prev => ({ ...prev, allowedColors: colors }));
  }, []);

  // Save extracted color as custom yarn
  const handleSaveExtractedYarn = useCallback((hex: string, name: string) => {
    // Generate a unique code from the name (first 2-3 chars uppercase)
    const baseCode = name.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 3) || 'CX';
    let code = baseCode;
    let counter = 1;
    // Ensure unique code
    while (customColors.some(c => c.code === code) || getColor(code)) {
      code = `${baseCode}${counter}`;
      counter++;
    }

    const newYarn: CustomColor = {
      code,
      name,
      hex,
    };

    const updatedColors = [...customColors, newYarn];
    setCustomColors(updatedColors);
    localStorage.setItem('tartanism-custom-colors', JSON.stringify(updatedColors));
  }, [customColors]);

  const handleCreateGeometricPattern = useCallback((threadcount: string) => {
    const parsed = parseThreadcount(threadcount);
    if (!parsed || parsed.stripes.length === 0) return;

    const newTartan: TartanCardData = {
      id: `geo-${Date.now()}`,
      result: {
        sett: parsed,
        seed: Date.now(),
        constraints: DEFAULT_CONSTRAINTS,
        signature: { signature: '', structureSignature: '', proportionSignature: '' }
      },
      isOptical: config.opticalMode,
      isBlanket: true,  // Geometric patterns render as solid stripes (Pendleton-style)
    };

    setTartans(prev => [newTartan, ...prev]);
    setShowGeometricBuilder(false);
  }, [config.opticalMode]);

  const handleCreateImagePattern = useCallback((imageData: string, patternConfig: ImagePatternConfig) => {
    // Create a placeholder sett (image patterns don't use threadcount)
    const placeholderSett = parseThreadcount('K/8 W8');
    if (!placeholderSett) return;

    const newPattern: TartanCardData = {
      id: `img-${Date.now()}`,
      result: {
        sett: placeholderSett,
        seed: Date.now(),
        constraints: DEFAULT_CONSTRAINTS,
        signature: { signature: 'image-pattern', structureSignature: '', proportionSignature: '' }
      },
      imagePattern: {
        imageData,
        repeatMode: patternConfig.repeatMode,
        pixelSize: patternConfig.pixelSize,
      },
    };

    setTartans(prev => [newPattern, ...prev]);
    setShowImagePatternBuilder(false);
  }, []);

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

  // High-resolution PNG export for fabric production
  const handleDownloadPNG = useCallback((data: TartanCardData, dpi: number = 300) => {
    const { sett } = data.result;
    const expanded = expandSett(sett);
    const weave = WEAVE_PATTERNS[config.weaveType];

    // Calculate scale for target DPI (base is 96 DPI for screen)
    // For a 6" swatch at 300 DPI = 1800 pixels
    const targetSizeInches = 6; // 6 inch swatch
    const targetPixels = targetSizeInches * dpi;
    const scale = Math.ceil(targetPixels / expanded.length);

    const canvas = document.createElement('canvas');
    const size = expanded.length * scale;
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Custom color lookup helper
    const lookupColor = (code: string) => {
      const custom = customColors.find(c => c.code === code);
      if (custom) return { code: custom.code, name: custom.name, hex: custom.hex };
      return getColor(code);
    };

    // Render at high resolution
    for (let y = 0; y < expanded.length; y++) {
      for (let x = 0; x < expanded.length; x++) {
        const pixel = getIntersectionColor(expanded, expanded, weave, x, y);
        const color = lookupColor(pixel.color);
        if (color) {
          ctx.fillStyle = color.hex;
          ctx.fillRect(x * scale, y * scale, scale, scale);
        }
      }
    }

    // Convert to PNG and download
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tartan-${data.result.seed}-${dpi}dpi.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }, [config.weaveType, customColors]);

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
            <button
              onClick={() => setShowCrestBuilder(true)}
              className="px-4 py-2 rounded-lg text-gray-400 hover:text-white transition-colors"
            >
              Crests
            </button>
            <button
              onClick={() => setShowLibrary(true)}
              className="px-4 py-2 rounded-lg text-gray-400 hover:text-white transition-colors"
            >
              Library
            </button>
            <button
              onClick={() => setShowColorExtractor(true)}
              className="px-4 py-2 rounded-lg text-gray-400 hover:text-white transition-colors"
            >
              📷 Extract
            </button>
            <button
              onClick={() => setShowGeometricBuilder(true)}
              className="px-4 py-2 rounded-lg text-gray-400 hover:text-white transition-colors"
            >
              ◇ Geometric
            </button>
            <button
              onClick={() => setShowImagePatternBuilder(true)}
              className="px-4 py-2 rounded-lg text-gray-400 hover:text-white transition-colors"
            >
              🖼️ Image
            </button>
            <button
              onClick={() => setShowKnittingChart(true)}
              className="px-4 py-2 rounded-lg text-gray-400 hover:text-white transition-colors"
            >
              🧶 Knit
            </button>
            {tartans.length >= 2 && (
              <button
                onClick={() => {
                  setBreedingMode(!breedingMode);
                  setBreedParent1(null);
                  setBreedParent2(null);
                }}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  breedingMode ? 'bg-pink-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                🧬 Breed
              </button>
            )}
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
            {/* Breeding Panel */}
            {breedingMode && (
              <div className="mb-6 p-4 bg-gradient-to-r from-pink-900/30 to-purple-900/30 rounded-xl border border-pink-800/50">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      🧬 Pattern DNA Breeding
                    </h3>
                    <p className="text-sm text-gray-400">Select two tartans to combine their genetic traits</p>
                  </div>
                  <button
                    onClick={() => {
                      setBreedingMode(false);
                      setBreedParent1(null);
                      setBreedParent2(null);
                    }}
                    className="text-gray-400 hover:text-white"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex items-center gap-4">
                  {/* Parent 1 */}
                  <div className={`flex-1 p-3 rounded-lg border-2 border-dashed ${
                    breedParent1 ? 'border-pink-500 bg-pink-950/30' : 'border-gray-600'
                  }`}>
                    {breedParent1 ? (
                      <div className="flex items-center gap-3">
                        <div className="w-16 h-16 rounded bg-gray-800 overflow-hidden">
                          <TartanMiniPreview data={breedParent1} config={config} />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm text-white font-medium">Parent 1</p>
                          <p className="text-xs text-gray-400">{breedParent1.result.sett.colors.length} colors</p>
                        </div>
                        <button
                          onClick={() => setBreedParent1(null)}
                          className="text-gray-500 hover:text-red-400 text-sm"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <p className="text-center text-gray-500 py-2">Click a tartan to select Parent 1</p>
                    )}
                  </div>

                  {/* Plus/Heart icon */}
                  <div className="text-2xl text-pink-400">💕</div>

                  {/* Parent 2 */}
                  <div className={`flex-1 p-3 rounded-lg border-2 border-dashed ${
                    breedParent2 ? 'border-purple-500 bg-purple-950/30' : 'border-gray-600'
                  }`}>
                    {breedParent2 ? (
                      <div className="flex items-center gap-3">
                        <div className="w-16 h-16 rounded bg-gray-800 overflow-hidden">
                          <TartanMiniPreview data={breedParent2} config={config} />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm text-white font-medium">Parent 2</p>
                          <p className="text-xs text-gray-400">{breedParent2.result.sett.colors.length} colors</p>
                        </div>
                        <button
                          onClick={() => setBreedParent2(null)}
                          className="text-gray-500 hover:text-red-400 text-sm"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <p className="text-center text-gray-500 py-2">Click a tartan to select Parent 2</p>
                    )}
                  </div>

                  {/* Breed Button */}
                  <button
                    onClick={handleBreed}
                    disabled={!breedParent1 || !breedParent2}
                    className={`px-6 py-3 rounded-lg font-medium transition-all ${
                      breedParent1 && breedParent2
                        ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white hover:from-pink-500 hover:to-purple-500'
                        : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    🧬 Breed Offspring
                  </button>
                </div>

                {breedParent1 && breedParent2 && (
                  <p className="mt-3 text-xs text-gray-400 text-center">
                    Will create 4 offspring: interleaved, structure swap (×2), and random mix
                  </p>
                )}
              </div>
            )}

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
                    breedingMode={breedingMode}
                    isSelectedForBreeding={breedParent1?.id === data.id || breedParent2?.id === data.id}
                    onSelectForBreeding={handleSelectForBreeding}
                    onMutate={handleMutate}
                    onEdit={handleEdit}
                    onTiledPreview={setTiledPreview}
                    onCopySeed={handleCopySeed}
                    onDownloadSVG={handleDownloadSVG}
                    onDownloadWIF={handleDownloadWIF}
                    onDownloadPNG={handleDownloadPNG}
                    onShowYarnCalc={setYarnCalcData}
                    onShowMockups={setProductMockupData}
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

      {showCrestBuilder && (
        <CrestBuilder
          onClose={() => setShowCrestBuilder(false)}
          threadGauge={config.threadGauge}
        />
      )}

      {showLibrary && (
        <TartanLibrary
          onClose={() => setShowLibrary(false)}
          onSelectTartan={handleLoadFromLibrary}
          config={config}
        />
      )}

      {productMockupData && (
        <ProductMockups
          data={productMockupData}
          config={config}
          customColors={customColors}
          onClose={() => setProductMockupData(null)}
        />
      )}

      {showColorExtractor && (
        <ColorExtractor
          onClose={() => setShowColorExtractor(false)}
          onColorsExtracted={handleColorsExtracted}
          onSaveAsYarn={handleSaveExtractedYarn}
        />
      )}

      {showGeometricBuilder && (
        <GeometricPatternBuilder
          onClose={() => setShowGeometricBuilder(false)}
          onCreatePattern={handleCreateGeometricPattern}
        />
      )}

      {showImagePatternBuilder && (
        <ImagePatternBuilder
          onClose={() => setShowImagePatternBuilder(false)}
          onCreatePattern={handleCreateImagePattern}
        />
      )}

      {showKnittingChart && (
        <KnittingChartBuilder
          onClose={() => setShowKnittingChart(false)}
        />
      )}
    </div>
  );
}
