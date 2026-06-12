/**
 * Estimated custom-fabric pricing for shop display.
 *
 * Anchored to the production tiers in FABRIC-PRODUCTION-PLAN.md, with a
 * complexity premium for color count and sett size. Woven is the price
 * the shop displays (printed tartan is not a product we want to offer);
 * the printed figure is retained as the cost-model baseline the woven
 * multiplier is derived from. Deterministic per threadcount so prices
 * are stable across renders and sessions.
 */

import { parseThreadcount } from '../core/sett';

export interface PriceEstimate {
  /** Cost-model baseline (print-on-demand tier), USD per yard. Not shown in the shop. */
  printedPerYard: number;
  /** Custom woven/knit fabric, USD per yard. The displayed shop price. */
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
