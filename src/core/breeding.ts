/**
 * Tartan Breeding: genetic crossover of two parent setts.
 *
 * Offspring are designed to stay recognizable as children of their parents:
 *
 * - Colors are inherited by *role* (ground color, secondary blocks, accent
 *   lines, ranked by thread usage) instead of being shuffled at random, so a
 *   child keeps each parent's visual balance.
 * - Thread counts are quantized to even numbers and adjacent same-color
 *   stripes are merged, matching real threadcount conventions.
 * - Results are deduplicated by signature, so a brood of 8 is 8 distinct
 *   designs. Later attempts mutate harder to keep filling the brood.
 * - An optional seed makes a brood reproducible; "breed again" passes a new
 *   seed to get a genuinely fresh litter from the same parents.
 *
 * Strategies:
 * 1. blend:        P1's structure with a palette woven from both parents
 * 2. palette swap: P1's structure dressed in P2's colors (role-mapped)
 * 3. structure swap: P2's structure dressed in P1's colors (role-mapped)
 * 4. splice:       front half of P1 joined to back half of P2
 */

import { Sett, ThreadStripe, GeneratorResult } from './types';
import { parseThreadcount, generateSignatures } from './sett';
import { DEFAULT_CONSTRAINTS } from './generator';

export const BREED_STRATEGIES = ['blend', 'palette swap', 'structure swap', 'splice'] as const;
export type BreedStrategy = (typeof BREED_STRATEGIES)[number];

export interface BredResult extends GeneratorResult {
  strategy: BreedStrategy;
}

interface Gene {
  color: string;
  count: number;
}

function seededRng(seed: number) {
  // Mulberry32
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Colors ranked by total thread usage, most dominant first. */
function colorRoles(sett: Sett): string[] {
  const usage: Record<string, number> = {};
  for (const s of sett.stripes) usage[s.color] = (usage[s.color] || 0) + s.count;
  return Object.entries(usage)
    .sort((a, b) => b[1] - a[1])
    .map(([color]) => color);
}

/**
 * Map each of `structure`'s colors onto `palette` by dominance rank:
 * ground color -> ground color, first accent -> first accent, and so on.
 * Extra roles clamp to the palette's last (most accent-like) color.
 */
function roleMap(structure: Sett, palette: string[]): Record<string, string> {
  const roles = colorRoles(structure);
  const map: Record<string, string> = {};
  roles.forEach((color, i) => {
    map[color] = palette[Math.min(i, palette.length - 1)] ?? color;
  });
  return map;
}

const evenize = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Merge adjacent same-color stripes, quantize counts, cap stripe count. */
function cleanup(genes: Gene[]): Gene[] {
  const merged: Gene[] = [];
  for (const g of genes) {
    const prev = merged[merged.length - 1];
    if (prev && prev.color === g.color) {
      prev.count += g.count;
    } else {
      merged.push({ ...g });
    }
  }
  return merged
    .slice(0, 16)
    .map((g) => ({ color: g.color, count: evenize(g.count) }));
}

/** P1's structure with a palette interleaved from both parents' roles. */
function blend(p1: Sett, p2: Sett): Gene[] {
  const r1 = colorRoles(p1);
  const r2 = colorRoles(p2);
  const palette: string[] = [];
  for (let i = 0; i < Math.max(r1.length, r2.length); i++) {
    const pick = i % 2 === 0 ? r1[i] ?? r2[i] : r2[i] ?? r1[i];
    if (pick && !palette.includes(pick)) palette.push(pick);
  }
  const map = roleMap(p1, palette);
  return p1.stripes.map((s) => ({ color: map[s.color], count: s.count }));
}

/** `structure`'s stripes dressed in `palette` parent's colors, by role. */
function paletteSwap(structure: Sett, palette: Sett): Gene[] {
  const map = roleMap(structure, colorRoles(palette));
  return structure.stripes.map((s) => ({ color: map[s.color], count: s.count }));
}

/**
 * Front of P1 joined to back of P2 at randomized cut points, then scaled
 * toward the parents' average sett size so the child doesn't balloon.
 */
function splice(p1: Sett, p2: Sett, rng: () => number): Gene[] {
  const cut1 = 1 + Math.floor(rng() * Math.max(1, p1.stripes.length - 1));
  const cut2 = Math.floor(rng() * Math.max(1, p2.stripes.length - 1));
  const genes = [...p1.stripes.slice(0, cut1), ...p2.stripes.slice(cut2)].map(
    (s) => ({ color: s.color, count: s.count })
  );
  const total = genes.reduce((sum, g) => sum + g.count, 0);
  const target = (p1.totalThreads + p2.totalThreads) / 2;
  const scale = total > 0 ? target / total : 1;
  return genes.map((g) => ({ color: g.color, count: g.count * scale }));
}

/** Gentle mutation: occasional count jitter, rare accent recolor. */
function mutate(genes: Gene[], sharedPalette: string[], rng: () => number, strength: number): Gene[] {
  return genes.map((g, i) => {
    let { color, count } = g;
    if (rng() < strength) {
      count = count * (1 + (rng() - 0.5) * 0.5);
    }
    // Never recolor the opening (ground) stripe; keeps lineage readable
    if (i > 0 && rng() < strength * 0.4) {
      color = sharedPalette[Math.floor(rng() * sharedPalette.length)];
    }
    return { color, count };
  });
}

export function breedTartans(
  p1: Sett,
  p2: Sett,
  count: number = 8,
  seed?: number
): BredResult[] {
  const offspring: BredResult[] = [];
  const seen = new Set<string>();
  const sharedPalette = [...new Set([...p1.colors, ...p2.colors])];
  const baseSeed = seed ?? (Date.now() ^ Math.floor(Math.random() * 0xffffffff));

  const maxAttempts = count * 5;
  for (let attempt = 0; attempt < maxAttempts && offspring.length < count; attempt++) {
    const strategy = BREED_STRATEGIES[attempt % BREED_STRATEGIES.length];
    const rng = seededRng(baseSeed + attempt * 7919);
    // Later passes mutate harder so the brood isn't near-identical pairs
    const strength = 0.15 + 0.12 * Math.floor(attempt / BREED_STRATEGIES.length);

    let genes: Gene[];
    if (strategy === 'blend') genes = blend(p1, p2);
    else if (strategy === 'palette swap') genes = paletteSwap(p1, p2);
    else if (strategy === 'structure swap') genes = paletteSwap(p2, p1);
    else genes = splice(p1, p2, rng);

    genes = cleanup(mutate(genes, sharedPalette, rng, strength));

    if (genes.length < 2) continue;
    if (new Set(genes.map((g) => g.color)).size < 2) continue;

    const stripes: ThreadStripe[] = genes.map((g, i) => ({
      color: g.color,
      count: g.count,
      isPivot: i === 0 || i === genes.length - 1,
    }));

    const tc = stripes
      .map((s) => `${s.color}${s.isPivot ? '/' : ''}${s.count}`)
      .join(' ');

    try {
      const sett = parseThreadcount(tc);
      if (!sett || sett.stripes.length < 2) continue;
      const signature = generateSignatures(sett);
      if (seen.has(signature.signature)) continue;
      seen.add(signature.signature);
      offspring.push({
        sett,
        seed: baseSeed + attempt,
        constraints: DEFAULT_CONSTRAINTS,
        signature,
        strategy,
      });
    } catch {
      // Skip invalid offspring
    }
  }

  return offspring;
}
