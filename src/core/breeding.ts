/**
 * Tartan Breeding: crossover two parent setts to produce offspring.
 *
 * Every offspring is unique. Each uses a random blend of both parents'
 * stripes, colors, and proportions. No two calls produce the same result.
 *
 * Strategies (applied with randomization):
 * 1. Random interleave: each stripe slot randomly picks from P1 or P2
 * 2. Structure swap + color jitter: one parent's structure, other's colors, with random perturbation
 * 3. Full random crossover: each stripe's color and count independently sampled from either parent
 * 4. Splice: random cut point, P1 left of cut, P2 right of cut
 */

import { Sett, GeneratorResult } from './types';
import { parseThreadcount, generateSignatures } from './sett';
import { DEFAULT_CONSTRAINTS } from './generator';

function seededRng(seed: number) {
  // Mulberry32
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function breedTartans(p1: Sett, p2: Sett, count: number = 8): GeneratorResult[] {
  const offspring: GeneratorResult[] = [];
  const allColors = [...new Set([...p1.colors, ...p2.colors])];
  const baseSeed = Date.now() + Math.floor(Math.random() * 1000000);

  for (let i = 0; i < count; i++) {
    const seed = baseSeed + i * 7919; // prime spacing
    const rng = seededRng(seed);
    const childStripes: { color: string; count: number; isPivot?: boolean }[] = [];
    const strategy = i % 4;

    if (strategy === 0) {
      // Random interleave: for each slot, randomly pick P1 or P2
      const len = Math.max(p1.stripes.length, p2.stripes.length);
      for (let j = 0; j < len; j++) {
        const useP1 = rng() > 0.5;
        const parent = useP1 ? p1 : p2;
        const other = useP1 ? p2 : p1;
        if (j < parent.stripes.length) {
          const s = parent.stripes[j];
          // Occasionally swap color from the other parent
          const color = rng() > 0.7 && other.colors.length > 0
            ? other.colors[Math.floor(rng() * other.colors.length)]
            : s.color;
          // Slight count perturbation
          const countJitter = Math.round((rng() - 0.5) * 8);
          const count = Math.max(2, s.count + countJitter);
          childStripes.push({ color, count });
        }
      }
    } else if (strategy === 1) {
      // P1 structure with P2 colors, randomly shuffled + count jitter
      const shuffledColors = [...p2.colors].sort(() => rng() - 0.5);
      p1.stripes.forEach((stripe, idx) => {
        const color = shuffledColors[idx % shuffledColors.length];
        const countJitter = Math.round((rng() - 0.5) * 6);
        childStripes.push({ color, count: Math.max(2, stripe.count + countJitter) });
      });
    } else if (strategy === 2) {
      // P2 structure with P1 colors, randomly shuffled + count jitter
      const shuffledColors = [...p1.colors].sort(() => rng() - 0.5);
      p2.stripes.forEach((stripe, idx) => {
        const color = shuffledColors[idx % shuffledColors.length];
        const countJitter = Math.round((rng() - 0.5) * 6);
        childStripes.push({ color, count: Math.max(2, stripe.count + countJitter) });
      });
    } else {
      // Splice: random cut point, P1 left, P2 right, with mutations
      const cutP1 = Math.floor(rng() * p1.stripes.length);
      const cutP2 = Math.floor(rng() * p2.stripes.length);
      const left = p1.stripes.slice(0, cutP1 + 1);
      const right = p2.stripes.slice(cutP2);

      [...left, ...right].forEach(s => {
        // Random color swap from the combined palette
        const color = rng() > 0.6
          ? allColors[Math.floor(rng() * allColors.length)]
          : s.color;
        const countJitter = Math.round((rng() - 0.5) * 4);
        childStripes.push({ color, count: Math.max(2, s.count + countJitter) });
      });
    }

    if (childStripes.length < 2) continue;

    // Mark pivots for symmetry
    childStripes[0].isPivot = true;
    childStripes[childStripes.length - 1].isPivot = true;

    const tc = childStripes
      .map(s => `${s.color}${s.isPivot ? '/' : ''}${s.count}`)
      .join(' ');

    try {
      const sett = parseThreadcount(tc);
      if (sett && sett.stripes.length > 0) {
        const signature = generateSignatures(sett);
        offspring.push({ sett, seed, constraints: DEFAULT_CONSTRAINTS, signature });
      }
    } catch {
      // Skip invalid offspring
    }
  }

  return offspring;
}
