/**
 * Tartan System
 * A complete tartan design-to-production platform
 */

// Core types
export * from './core/types';

// Color system
export {
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  rgbToLab,
  deltaE2000,
  hasMinimumContrast,
  adjustBrightness,
  adjustSaturation,
  shiftHue,
  blendColors,
  TARTAN_COLORS,
  DEFAULT_PALETTE,
  getColor,
  getColorsByCategory,
  findClosestColor,
  getContrastingColors,
} from './core/colors';

// Sett/threadcount handling
export {
  parseThreadcount,
  toThreadcountString,
  expandSett,
  getThreadAt,
  generateSignatures,
  compareSettSignatures,
  scaleSett,
  normalizeSett,
  shiftColors,
  reverseSett,
  validateSett,
  EXAMPLE_SETTS,
  getExampleSett,
} from './core/sett';

// Weave patterns
export {
  WEAVE_PATTERNS,
  getWeavePattern,
  isWarpOnTop,
  getIntersectionColor,
  analyzeWeave,
  generateThreading,
  generateTreadling,
  formatTieUp,
} from './core/weaves';

// Generator
export {
  generateTartan,
  generateBatch,
  generateVariations,
  DEFAULT_CONSTRAINTS,
  CONSTRAINT_PRESETS,
  createRandom,
} from './core/generator';

// Breeding
export {
  breedTartans,
  BREED_STRATEGIES,
} from './core/breeding';
export type { BredResult, BreedStrategy } from './core/breeding';

// Optical illusion shapes
export {
  getMaskFunction,
  applyMask,
  SHAPE_PRESETS,
  getShapePreset,
  createDefaultMaskOptions,
} from './optical/shapes';

// WIF export
export {
  generateWIF,
  parseWIF,
} from './export/wif';

// Production/yarn calculator
export {
  YARN_PROFILES,
  getYarnProfile,
  PRODUCT_TEMPLATES,
  getProductTemplate,
  listProductTemplates,
  calculateYarnRequirements,
  calculateForProduct,
  formatMaterialsSummary,
  exportMaterialsCSV,
  exportMaterialsJSON,
  estimateCost,
} from './production/yarnCalculator';
