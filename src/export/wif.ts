/**
 * Tartan System - WIF Export Module
 * Generate Weaving Information File format for loom software
 */

import { Sett, WIFExport, WeavePattern } from '../core/types';
import { expandSett } from '../core/sett';
import { generateThreading, generateTreadling } from '../core/weaves';
import { getColor } from '../core/colors';

// ============================================================================
// WIF FILE GENERATION
// ============================================================================

export interface WIFOptions {
  /** Title for the pattern */
  title?: string;
  /** Author name */
  author?: string;
  /** Notes/description */
  notes?: string;
  /** Units (centimeters or inches) */
  units?: 'centimeters' | 'inches';
  /** Threads per unit */
  density?: number;
  /** Number of sett repeats in warp */
  warpRepeats?: number;
  /** Number of sett repeats in weft */
  weftRepeats?: number;
}

/**
 * Generate a complete WIF file from a sett
 */
export function generateWIF(
  sett: Sett,
  weave: WeavePattern,
  options: WIFOptions = {}
): WIFExport {
  const {
    title = sett.name || 'Untitled Tartan',
    author = 'Tartan System',
    notes = `Generated from threadcount: ${sett.threadcount}`,
    units = 'centimeters',
    density = 10,
    warpRepeats = 2,
    weftRepeats = 2,
  } = options;

  const expanded = expandSett(sett);
  const warpThreads = expanded.length * warpRepeats;
  const weftThreads = expanded.length * weftRepeats;

  // Build color table
  const colorTable = buildColorTable(sett.colors);
  
  // Build the WIF sections
  const sections: string[] = [];
  
  // WIF header
  sections.push('[WIF]');
  sections.push('Version=1.1');
  sections.push('Date=' + new Date().toISOString().split('T')[0]);
  sections.push('Developers=Tartan System');
  sections.push('Source Program=Tartan System');
  sections.push('Source Version=1.0');
  sections.push('');
  
  // Contents section
  sections.push('[CONTENTS]');
  sections.push('COLOR PALETTE=yes');
  sections.push('WEAVING=yes');
  sections.push('WARP=yes');
  sections.push('WEFT=yes');
  sections.push('COLOR TABLE=yes');
  sections.push('THREADING=yes');
  sections.push('TIEUP=yes');
  sections.push('TREADLING=yes');
  sections.push('WARP COLORS=yes');
  sections.push('WEFT COLORS=yes');
  sections.push('');
  
  // Color palette
  sections.push('[COLOR PALETTE]');
  sections.push('Entries=' + colorTable.length);
  sections.push('Form=RGB');
  sections.push('Range=0,255');
  sections.push('');
  
  // Color table
  sections.push('[COLOR TABLE]');
  colorTable.forEach((color, index) => {
    sections.push(`${index + 1}=${color.r},${color.g},${color.b}`);
  });
  sections.push('');
  
  // Weaving section
  sections.push('[WEAVING]');
  sections.push('Shafts=' + weave.shafts);
  sections.push('Treadles=' + weave.treadles);
  sections.push('Rising Shed=yes');
  sections.push('');
  
  // Warp section
  sections.push('[WARP]');
  sections.push('Threads=' + warpThreads);
  sections.push('Units=' + units);
  sections.push('Spacing=' + (1 / density).toFixed(4));
  sections.push('Thickness=' + (0.8 / density).toFixed(4));
  sections.push('');
  
  // Weft section
  sections.push('[WEFT]');
  sections.push('Threads=' + weftThreads);
  sections.push('Units=' + units);
  sections.push('Spacing=' + (1 / density).toFixed(4));
  sections.push('Thickness=' + (0.8 / density).toFixed(4));
  sections.push('');
  
  // Notes
  sections.push('[NOTES]');
  sections.push('1=' + title);
  sections.push('2=' + notes);
  if (author) sections.push('3=Author: ' + author);
  sections.push('');
  
  // Threading
  sections.push('[THREADING]');
  const threading = generateThreading(weave, warpThreads);
  threading.forEach((shaft, index) => {
    sections.push(`${index + 1}=${shaft}`);
  });
  sections.push('');
  
  // Tie-up
  sections.push('[TIEUP]');
  for (let t = 0; t < weave.treadles; t++) {
    const liftedShafts = weave.tieUp[t]
      .map((lifted, s) => lifted ? (s + 1) : null)
      .filter(s => s !== null)
      .join(',');
    sections.push(`${t + 1}=${liftedShafts}`);
  }
  sections.push('');
  
  // Treadling
  sections.push('[TREADLING]');
  const treadling = generateTreadling(weave, weftThreads);
  treadling.forEach((treadle, index) => {
    sections.push(`${index + 1}=${treadle}`);
  });
  sections.push('');
  
  // Warp colors
  sections.push('[WARP COLORS]');
  for (let i = 0; i < warpThreads; i++) {
    const threadColor = expanded.threads[i % expanded.length];
    const colorIndex = getColorIndex(colorTable, threadColor, sett.colors);
    sections.push(`${i + 1}=${colorIndex}`);
  }
  sections.push('');
  
  // Weft colors
  sections.push('[WEFT COLORS]');
  for (let i = 0; i < weftThreads; i++) {
    const threadColor = expanded.threads[i % expanded.length];
    const colorIndex = getColorIndex(colorTable, threadColor, sett.colors);
    sections.push(`${i + 1}=${colorIndex}`);
  }
  
  const content = sections.join('\n');
  const filename = `${title.replace(/[^a-zA-Z0-9]/g, '_')}.wif`;
  
  return { content, filename };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

interface RGBSimple {
  r: number;
  g: number;
  b: number;
}

function buildColorTable(colorCodes: string[]): RGBSimple[] {
  return colorCodes.map(code => {
    const color = getColor(code);
    if (color) {
      return { r: color.rgb.r, g: color.rgb.g, b: color.rgb.b };
    }
    // Fallback to grey if color not found
    return { r: 128, g: 128, b: 128 };
  });
}

function getColorIndex(colorTable: RGBSimple[], colorCode: string, colorCodes: string[]): number {
  const index = colorCodes.indexOf(colorCode);
  return index >= 0 ? index + 1 : 1;
}

// ============================================================================
// WIF PARSING (for import)
// ============================================================================

/**
 * Download a WIF file in the browser
 */
export function downloadWIF(
  content: string,
  filename: string
): void {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.wif') ? filename : `${filename}.wif`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================================
// WIF PARSING (for import)
// ============================================================================

export interface ParsedWIF {
  title?: string;
  colors: RGBSimple[];
  warpColors: number[];
  weftColors: number[];
  threading: number[];
  treadling: number[];
  tieUp: boolean[][];
  shafts: number;
  treadles: number;
}

/**
 * Parse a WIF file string
 */
export function parseWIF(content: string): ParsedWIF {
  const lines = content.split('\n').map(l => l.trim());
  const sections: Record<string, Record<string, string>> = {};
  let currentSection = '';
  
  for (const line of lines) {
    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.slice(1, -1).toUpperCase();
      sections[currentSection] = {};
    } else if (line.includes('=') && currentSection) {
      const [key, value] = line.split('=').map(s => s.trim());
      sections[currentSection][key] = value;
    }
  }
  
  // Parse color table
  const colors: RGBSimple[] = [];
  const colorSection = sections['COLOR TABLE'] || {};
  const numColors = parseInt(sections['COLOR PALETTE']?.['Entries'] || '0', 10);
  
  for (let i = 1; i <= numColors; i++) {
    const colorStr = colorSection[String(i)];
    if (colorStr) {
      const [r, g, b] = colorStr.split(',').map(n => parseInt(n.trim(), 10));
      colors.push({ r, g, b });
    }
  }
  
  // Parse weaving info
  const shafts = parseInt(sections['WEAVING']?.['Shafts'] || '4', 10);
  const treadles = parseInt(sections['WEAVING']?.['Treadles'] || '4', 10);
  
  // Parse threading
  const threading: number[] = [];
  const threadingSection = sections['THREADING'] || {};
  const numWarpThreads = parseInt(sections['WARP']?.['Threads'] || '0', 10);
  
  for (let i = 1; i <= numWarpThreads; i++) {
    const shaft = parseInt(threadingSection[String(i)] || '1', 10);
    threading.push(shaft);
  }
  
  // Parse treadling
  const treadling: number[] = [];
  const treadlingSection = sections['TREADLING'] || {};
  const numWeftThreads = parseInt(sections['WEFT']?.['Threads'] || '0', 10);
  
  for (let i = 1; i <= numWeftThreads; i++) {
    const treadle = parseInt(treadlingSection[String(i)] || '1', 10);
    treadling.push(treadle);
  }
  
  // Parse tie-up
  const tieUp: boolean[][] = [];
  const tieUpSection = sections['TIEUP'] || {};
  
  for (let t = 1; t <= treadles; t++) {
    const row: boolean[] = new Array(shafts).fill(false);
    const shaftStr = tieUpSection[String(t)] || '';
    const liftedShafts = shaftStr.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
    
    for (const shaft of liftedShafts) {
      if (shaft >= 1 && shaft <= shafts) {
        row[shaft - 1] = true;
      }
    }
    tieUp.push(row);
  }
  
  // Parse warp/weft colors
  const warpColors: number[] = [];
  const warpColorSection = sections['WARP COLORS'] || {};
  for (let i = 1; i <= numWarpThreads; i++) {
    warpColors.push(parseInt(warpColorSection[String(i)] || '1', 10));
  }
  
  const weftColors: number[] = [];
  const weftColorSection = sections['WEFT COLORS'] || {};
  for (let i = 1; i <= numWeftThreads; i++) {
    weftColors.push(parseInt(weftColorSection[String(i)] || '1', 10));
  }
  
  // Get title from notes
  const title = sections['NOTES']?.['1'];
  
  return {
    title,
    colors,
    warpColors,
    weftColors,
    threading,
    treadling,
    tieUp,
    shafts,
    treadles,
  };
}
