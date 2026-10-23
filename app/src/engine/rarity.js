/*
 * rarity.js — Discovery-rarity collection (T23)
 *
 * Three rarity axes computed locally from lineage + genome stats:
 *   1. RARE GENE CLUSTER  — unusual colour/structure combinations in the collection
 *   2. DEEP LINEAGE        — high generation depth (entropy-death fighter)
 *   3. FIRST-TO-BREED      — pioneer: first occurrence of a structure±colour fingerprint
 *
 * No backend required. Purely local computation over the kept collection.
 *
 * DETERMINISM: every result is deterministic given the same collection state.
 * Scores are functions of (individual, collection) only — no randomness.
 */

import { structureSignature, proportionSignature, hsl, circHueDist, meanHue, meanSat } from './game.js';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES (documented — JS runtime only; TS consumers should mirror)
// ═══════════════════════════════════════════════════════════════════════════

// RarityTier: 'common' | 'uncommon' | 'rare' | 'legendary'
// LineageTier: 'wild' | 'cross' | 'deep' | 'ancient'
// PioneerTier: 'common' | 'pioneer'

// RaritySignal = { flag: boolean, tier: string, score: number, reason: string, ...axisSpecific }
// RarityResult = {
//   individualId: string,
//   rareGeneCluster: RaritySignal & { zScore?: number },
//   deepLineage: RaritySignal & { depth: number },
//   firstToBreed: RaritySignal & { fingerprint: string },
//   badges: string[],
//   rarityScore: number,       // 0–1 composite
// }

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map a colour code to a broad hue category for palette-rareness analysis.
 * Categories: warm-red, warm-orange, warm-yellow, warm-pink,
 *             cool-blue, cool-teal, cool-purple, cool-green,
 *             neutral-dark, neutral-light
 */
export const CATEGORY_MAP = {
  // warm
  RB: 'warm-red', CR: 'warm-red', OX: 'warm-red',
  TG: 'warm-orange', CO: 'warm-orange', RU: 'warm-orange',
  MG: 'warm-yellow', GD: 'warm-yellow', MU: 'warm-yellow',
  PK: 'warm-pink', MA: 'warm-pink',
  // cool
  SA: 'cool-blue', CB: 'cool-blue', IN: 'cool-blue',
  TQ: 'cool-teal', CT: 'cool-teal', TL: 'cool-teal',
  AM: 'cool-purple', VT: 'cool-purple', LV: 'cool-purple',
  EM: 'cool-green', FO: 'cool-green', SG: 'cool-green', LM: 'cool-green',
  // neutral
  CH: 'neutral-dark', IN: 'neutral-dark',
  IC: 'neutral-light', BN: 'neutral-light', ST: 'neutral-light',
  OT: 'neutral-light', CM: 'neutral-light', SL: 'neutral-light',
};

function catForCode(code) {
  return CATEGORY_MAP[code] || 'other';
}

/**
 * Fingerprint a rare gene cluster: a composite key of
 * (dominant-hue-category × structural-profile × palette-size).
 */
function geneClusterFingerprint(individual) {
  const hues = new Set(individual.colors.map(catForCode));
  const sortedHues = [...hues].sort().join('+');
  const struct = structureSignature(individual.stripes);
  return `${sortedHues}|${individual.colors.length}c|${struct}`;
}

/**
 * Fingerprint for first-to-breed: same structure on a new palette.
 * Coarser than geneClusterFingerprint so that swapping ONE colour still counts
 * as "bred from this structure" — but a truly novel colour+structure combination
 * is a first-to-breed.
 */
function firstToBreedFingerprint(individual) {
  const struct = structureSignature(individual.stripes);
  const paletteKey = [...individual.colors].sort().join(',');
  return `s:${struct}|p:${paletteKey}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATISTICS OVER THE COLLECTION
// ═══════════════════════════════════════════════════════════════════════════

function mean(xs) {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stddev(xs, m) {
  if (xs.length < 2) return 1; // avoid division by zero
  const avg = m ?? mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - avg) * (b - avg), 0) / xs.length);
}

/**
 * Z-score: how many standard deviations `value` is from the collection mean.
 */
function zScore(value, xs) {
  const m = mean(xs);
  const s = stddev(xs, m);
  if (s < 1e-10) return 0;
  return Math.abs(value - m) / s;
}

/**
 * Percentile rank of `value` within `xs` (higher = rarer).
 * Returns 0–1 where 1 = the most extreme value.
 */
function rarityPercentile(value, xs) {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  // For "rarity", we want high values of zScore to map to high rarity.
  // We compute the proportion of values that are LESS extreme.
  const m = mean(xs);
  const s = stddev(xs, m);
  if (s < 1e-10) return 0;
  const z = Math.abs(value - m) / s;
  // Count how many elements have z-score <= this one
  const zs = xs.map(v => Math.abs(v - m) / s);
  zs.sort((a, b) => a - b);
  // Find insertion point
  let lo = 0, hi = zs.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (zs[mid] < z) lo = mid + 1;
    else hi = mid;
  }
  return lo / zs.length;
}

// ═══════════════════════════════════════════════════════════════════════════
// AXIS 1: RARE GENE CLUSTER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute gene-cluster rarity for one individual relative to the collection.
 *
 * Uses structural PROXIMITY rather than exact-match uniqueness because breeding
 * always produces unique exact signatures. Instead we measure how many setts in
 * the collection are "structurally similar" to this one — a sett is rare if it
 * has few close neighbors.
 *
 * Three signals:
 *   1. STRUCTURAL ISOLATION  — proportion-distance to nearest neighbor
 *   2. PALETTE ISOLATION     — colour-category uniqueness
 *   3. TRAIT EXTREMITY       — saturation / stripe-count / category-count outliers
 */
function proportionDistance(a, b) {
  const pa = proportionSignature(a.stripes).split(':').map(Number);
  const pb = proportionSignature(b.stripes).split(':').map(Number);
  const n = Math.max(pa.length, pb.length);
  let d = Math.abs(pa.length - pb.length) / n;
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    d += Math.abs(pa[i] - pb[i]);
  }
  return d;
}

function computeGeneClusterRarity(individual, collection) {
  const others = collection.filter(c => c.id !== individual.id);
  if (others.length < 3) {
    return { flag: false, tier: 'common', score: 0, zScore: 0, reason: 'insufficient collection for rarity analysis' };
  }

  // 1. STRUCTURAL ISOLATION: average proportion distance to closest 3 neighbors
  const dists = others.map(o => proportionDistance(individual, o)).sort((a, b) => a - b);
  const k = Math.min(3, dists.length);
  const nearestDist = dists.slice(0, k).reduce((a, b) => a + b, 0) / k;

  // Compute baseline: average nearest-neighbour distance across the whole
  // collection. A sett whose nearest neighbours are farther than average is
  // structurally isolated.
  const allDists = [];
  for (const ind of others) {
    const indDists = others
      .filter(o => o.id !== ind.id)
      .map(o => proportionDistance(ind, o))
      .sort((a, b) => a - b);
    allDists.push(indDists.slice(0, k).reduce((a, b) => a + b, 0) / k);
  }
  const avgNearestDist = mean(allDists);
  const stdNearestDist = stddev(allDists, avgNearestDist);
  const structIsolation = stdNearestDist < 0.05 ? 0 : Math.min(1, (nearestDist - avgNearestDist) / (stdNearestDist * 2) + 0.5);

  // 2. PALETTE CATEGORY UNIQUENESS
  const myCats = [...new Set(individual.colors.map(catForCode))].sort().join('+');
  const catCounts = {};
  for (const o of others) {
    const key = [...new Set(o.colors.map(catForCode))].sort().join('+');
    catCounts[key] = (catCounts[key] || 0) + 1;
  }
  const catFreq = (catCounts[myCats] || 0) / others.length;
  const catUniqueness = 1 - catFreq;

  // 3. TRAIT EXTREMITY (saturation, stripe count, category count)
  const mySat = meanSat(individual.stripes);
  const saturations = others.map(o => meanSat(o.stripes));
  const satPct = rarityPercentile(mySat, saturations);

  const catCount = new Set(individual.colors.map(catForCode)).size;
  const catCountsArr = others.map(o => new Set(o.colors.map(catForCode)).size);
  const catCountPct = rarityPercentile(catCount, catCountsArr);

  const myStripes = individual.stripes.length;
  const stripeCounts = others.map(o => o.stripes.length);
  const stripePct = rarityPercentile(myStripes, stripeCounts);

  // Composite (0–1, higher = rarer)
  const compositeZ =
    structIsolation * 0.35 +
    catUniqueness * 0.25 +
    satPct * 0.15 +
    catCountPct * 0.10 +
    stripePct * 0.15;

  // Tier logic
  let tier, flag;
  if (compositeZ >= 0.80) { tier = 'legendary'; flag = true; }
  else if (compositeZ >= 0.60) { tier = 'rare'; flag = true; }
  else if (compositeZ >= 0.35) { tier = 'uncommon'; flag = true; }
  else { tier = 'common'; flag = false; }

  const parts = [];
  if (structIsolation > 0.65) parts.push('structurally distinct from the rest');
  if (catUniqueness > 0.6) parts.push('unusual colour-category mix');
  if (satPct > 0.75) parts.push(mySat > 0.4 ? 'exceptionally vivid' : 'unusually muted');
  if (stripePct > 0.75) parts.push(myStripes > mean(stripeCounts) ? 'unusually many bands' : 'unusually few bands');
  const reason = parts.length > 0 ? parts.join('; ') : 'common gene cluster';

  return {
    flag,
    tier,
    score: Math.round(compositeZ * 100) / 100,
    zScore: Math.round(compositeZ * 100) / 100,
    reason,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// AXIS 2: DEEP LINEAGE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Deep-lineage rarity is purely generation-depth.
 *
 * gen 0 = wild-caught (common)
 * gen 1-2 = cross-bred (uncommon)
 * gen 3-5 = deep-rooted (rare)
 * gen 6+ = ancient lineage (legendary)
 *
 * This is the structural pull against entropy-death: the player is incentivized
 * to keep breeding past their favorite to reach deeper generations.
 */
function computeLineageRarity(individual) {
  const gen = individual.gen || 0;

  let tier, flag;
  if (gen >= 6) { tier = 'ancient'; flag = true; }
  else if (gen >= 3) { tier = 'deep'; flag = true; }
  else if (gen >= 1) { tier = 'cross'; flag = true; }
  else { tier = 'wild'; flag = false; }

  // Score: linear from gen 0 → gen 10+, capped at 1
  const score = Math.min(1, gen / 8);

  const reasons = {
    wild: 'wild-caught sett',
    cross: `cross-bred at generation ${gen}`,
    deep: `deep lineage: generation ${gen}`,
    ancient: `ancient lineage: generation ${gen}`,
  };

  return {
    flag,
    tier,
    depth: gen,
    score: Math.round(score * 100) / 100,
    reason: reasons[tier] || `bred at generation ${gen}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// AXIS 3: FIRST-TO-BREED
// ═══════════════════════════════════════════════════════════════════════════

/**
 * First-to-breed marks the pioneer: the FIRST occurrence of a particular
 * structure+palette combination in the collection.
 *
 * A "fingerprint" is the combination of (structure signature, sorted palette).
 * If no earlier individual (by some ordering — we use the collection array
 * order as the chronological order) has the same fingerprint, this individual
 * is a pioneer.
 *
 * Additionally, even if not the first, a "novel structure" (first occurrence
 * of this structure signature, regardless of palette) also counts as a pioneer.
 */
function computeFirstToBreed(individual, collection) {
  const idx = collection.findIndex(c => c.id === individual.id);
  if (idx < 0) {
    return { flag: false, tier: 'common', score: 0, fingerprint: '', reason: 'not in collection' };
  }

  const fp = firstToBreedFingerprint(individual);
  const structSig = structureSignature(individual.stripes);

  // Check earlier individuals for this fingerprint
  const earlier = collection.slice(0, idx);
  const hasEarlierFp = earlier.some(o => firstToBreedFingerprint(o) === fp);
  const hasEarlierStruct = earlier.some(o => structureSignature(o.stripes) === structSig);

  let tier, flag, reason;

  if (!hasEarlierFp) {
    tier = 'pioneer';
    flag = true;
    reason = 'first to breed this structure+palette combination';
  } else if (!hasEarlierStruct) {
    tier = 'pioneer';
    flag = true;
    reason = 'pioneer of a novel structural rhythm';
  } else {
    tier = 'common';
    flag = false;
    reason = 'descendant of an earlier-bred lineage';
  }

  return {
    flag,
    tier,
    score: flag ? 1 : 0,
    fingerprint: fp,
    reason,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPOSITE ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Analyse rarity for a single individual against the full collection.
 * Returns a RarityResult with all three axes plus badges and composite score.
 */
export function analyzeRarity(individual, collection) {
  const geneCluster = computeGeneClusterRarity(individual, collection);
  const lineage = computeLineageRarity(individual);
  const pioneer = computeFirstToBreed(individual, collection);

  // BADGES: one badge per active signal
  const badges = [];
  if (geneCluster.flag) badges.push(`gene-cluster-${geneCluster.tier}`);
  if (lineage.flag) badges.push(`lineage-${lineage.tier}`);
  if (pioneer.flag) badges.push('first-to-breed');

  // Composite rarity score: weighted average
  // lineage is most "earned" (player effort), gene cluster is "discovered", pioneer is "exploration"
  const rarityScore = Math.round(
    (geneCluster.score * 0.35 + lineage.score * 0.35 + pioneer.score * 0.30) * 100
  ) / 100;

  return {
    individualId: individual.id,
    rareGeneCluster: geneCluster,
    deepLineage: lineage,
    firstToBreed: pioneer,
    badges,
    rarityScore,
  };
}

/**
 * Analyse rarity for every individual in the collection.
 * Returns an array of RarityResult + aggregate collection stats.
 */
export function analyzeCollection(collection) {
  if (!collection || collection.length === 0) {
    return { results: [], stats: { total: 0, rare: 0, pioneers: 0, maxDepth: 0, maxRarityScore: 0 } };
  }

  const results = collection.map(ind => analyzeRarity(ind, collection));

  const stats = {
    total: results.length,
    rare: results.filter(r => r.rarityScore >= 0.5).length,
    legendary: results.filter(r => r.rareGeneCluster.tier === 'legendary').length,
    pioneers: results.filter(r => r.firstToBreed.flag).length,
    ancientLineages: results.filter(r => r.deepLineage.tier === 'ancient').length,
    maxDepth: Math.max(...results.map(r => r.deepLineage.depth)),
    avgRarityScore: Math.round(mean(results.map(r => r.rarityScore)) * 100) / 100,
    maxRarityScore: Math.max(...results.map(r => r.rarityScore)),
  };

  return { results, stats };
}

/**
 * Find notable ("rare find") individuals in the collection.
 * Returns those with rarityScore >= threshold, sorted most-rare first.
 */
export function findRareFinds(collection, threshold = 0.4) {
  const { results } = analyzeCollection(collection);
  return results
    .filter(r => r.rarityScore >= threshold)
    .sort((a, b) => b.rarityScore - a.rarityScore);
}

/**
 * Static "display tier" for a collection — the overall rarity badge level.
 * Computed from the collection stats: number of rares/pioneers/deep-lineages.
 */
export function collectionRarityTier(stats) {
  if (!stats) return 'common';

  // Only count "rare" gene clusters (not pioneers or lineage — those drive
  // individual rarity but the collection tier is about GENETIC DIVERSITY).
  const rareGeneRate = Math.min(stats.rare / Math.max(1, stats.total), 1);
  const legendaryRate = Math.min((stats.legendary || 0) / Math.max(1, stats.total), 1);

  const score =
    rareGeneRate * 3 +
    legendaryRate * 5;

  if (score >= 4.0 && stats.rare >= 2) return 'legendary';
  if (score >= 2.5) return 'rare';
  if (score >= 1.0) return 'uncommon';
  return 'common';
}

// Re-export for test access
export { geneClusterFingerprint, firstToBreedFingerprint };
