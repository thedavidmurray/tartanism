/**
 * Estimated custom-fabric pricing for shop display.
 *
 * Anchored to the print-on-demand tiers in FABRIC-PRODUCTION-PLAN.md
 * ($10-28/yard printed; traditionally woven runs roughly 2-3x that),
 * with a complexity premium for color count and sett size. Deterministic
 * per threadcount so prices are stable across renders and sessions.
 */

import { parseThreadcount } from '../core/sett';

export interface PriceEstimate {
  /** Printed fabric, USD per yard */
  printedPerYard: number;
  /** Traditionally woven, USD per yard */
  wovenPerYard: number;
}

export function estimatePrice(threadcount: string): PriceEstimate | null {
  try {
    const sett = parseThreadcount(threadcount);
    if (!sett || sett.stripes.length === 0) return null;

    const base = 12;
    const colorPremium = sett.colors.length * 1.5;
    const settPremium = Math.min(sett.totalThreads / 40, 8);
    const printed = Math.round(base + colorPremium + settPremium);

    return {
      printedPerYard: printed,
      wovenPerYard: Math.round(printed * 2.5),
    };
  } catch {
    return null;
  }
}
