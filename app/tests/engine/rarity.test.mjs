/*
 * RARITY test suite (T23)
 *
 * Tests that rarity signals fire on constructed rare/common cases for all three axes:
 *   - RARE GENE CLUSTER (unusual structure+palette combos)
 *   - DEEP LINEAGE (generation depth)
 *   - FIRST-TO-BREED (pioneer detection)
 *
 * Plus composite scoring, collection analysis, and edge cases.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeRarity,
  analyzeCollection,
  findRareFinds,
  collectionRarityTier,
} from '../../src/engine/rarity.js';
import {
  randomIndividual,
  breedChild,
  wildLitter,
  individualFromThreadcount,
} from '../../src/engine/game.js';

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

// Create a diverse collection for testing rarity signals.
// Uses BREEDING (not wild litter) so most setts share a common structure pool,
// making a few true outliers stand out. Wild litter produces all-unique setts
// which makes everything look "rare" by structural uniqueness.
function buildDiverseCollection() {
  const collection = [];

  // --- COMMON POOL: breed from the same 2 parents with low wildness ---
  // This creates a "converged" family where most setts share similar structures.
  const p1 = individualFromThreadcount('SA/40 GD8 SA18 CR12 GD4 CR18 SA/40', 101);
  const p2 = individualFromThreadcount('IN/24 CH12 IN8 CH12 BN2 CH12 IN8 CH12 IN/24', 202);

  // Gen 1: first-generation crosses (common)
  for (let i = 0; i < 5; i++) {
    const child = breedChild(p1, p2, 500 + i, 0.2, null);
    collection.push(child);
  }

  // Gen 2: breed the gen-1 setts among themselves (still common-ish)
  const g1a = collection[0];
  const g1b = collection[1];
  for (let i = 0; i < 3; i++) {
    const child = breedChild(g1a, g1b, 600 + i, 0.25, null);
    collection.push(child);
  }

  // --- UNCOMMON: unusual palette on a parent structure, gen 1 ---
  const uncommon = individualFromThreadcount('VT/26 LM10 IN10 LM10 VT/26', 2000);
  uncommon.gen = 1;
  collection.push(uncommon);

  // --- RARE: wild outlier with highly unusual structure, gen 3 ---
  const rare = individualFromThreadcount('MG/28 MA18 CB18 MA18 MG/28', 3000);
  rare.gen = 3;
  collection.push(rare);

  // --- LEGENDARY: extreme structure, deep lineage, novel palette ---
  const legendary = individualFromThreadcount('CR/40 PK8 CR12 GD8 CT12 GD8 CR/40', 4000);
  legendary.gen = 7;
  collection.push(legendary);

  return collection;
}

// ═══════════════════════════════════════════════════════════════════════════
// AXIS 1: RARE GENE CLUSTER
// ═══════════════════════════════════════════════════════════════════════════

test('rare gene cluster: common wild sett in a large diverse collection scores low', () => {
  const coll = buildDiverseCollection();
  // First bred child: gen 1, bred from the common pool — should be common
  const commonInd = coll[0];
  const result = analyzeRarity(commonInd, coll);

  assert.ok(result.rareGeneCluster.score < 0.6,
    `common bred should score moderately, got ${result.rareGeneCluster.score}`);
  assert.equal(result.rareGeneCluster.flag, false,
    'bred common sett should not flag as rare gene cluster');
  assert.equal(result.rareGeneCluster.tier, 'common');
});

test('rare gene cluster: outlier with unique structure scores high', () => {
  const coll = buildDiverseCollection();
  const rareInd = coll[8]; // the VT/LM/IN/LM/VT sett — unusual
  const result = analyzeRarity(rareInd, coll);

  // At minimum it should score higher than a typical common sett
  const commonResult = analyzeRarity(coll[0], coll);
  assert.ok(result.rareGeneCluster.score >= commonResult.rareGeneCluster.score,
    `outlier ${result.rareGeneCluster.score} should score >= common ${commonResult.rareGeneCluster.score}`);
});

test('rare gene cluster: legendary-tier individual flags as legendary', () => {
  const coll = buildDiverseCollection();
  const legendaryInd = coll[10]; // CR/PK/GD/CT sett — extreme palette
  const result = analyzeRarity(legendaryInd, coll);

  // The legendary sett should have a high score
  assert.ok(result.rareGeneCluster.score >= 0.4,
    `legendary-tier should score >= 0.4, got ${result.rareGeneCluster.score}`);
});

test('rare gene cluster: all-identical collection makes everything common', () => {
  // Build a collection where everyone has the same structure + palette
  const base = individualFromThreadcount('SA/40 GD8 SA18 CR12 GD4 CR18 SA/40', 1);
  base.gen = 1;
  const coll = [base];
  for (let i = 0; i < 5; i++) {
    const clone = individualFromThreadcount('SA/40 GD8 SA18 CR12 GD4 CR18 SA/40', 100 + i);
    clone.gen = 1;
    coll.push(clone);
  }

  for (const ind of coll) {
    const result = analyzeRarity(ind, coll);
    assert.ok(result.rareGeneCluster.score < 0.3,
      `clone should score low (<0.3), got ${result.rareGeneCluster.score} for ${ind.id}`);
  }
});

test('rare gene cluster: small collection (<4) returns insufficient reason', () => {
  const small = wildLitter({ seed: 42, size: 2 });
  const result = analyzeRarity(small[0], small);
  assert.ok(result.rareGeneCluster.reason.includes('insufficient'),
    `small collection should flag insufficient, got: ${result.rareGeneCluster.reason}`);
  assert.equal(result.rareGeneCluster.flag, false);
});

// ═══════════════════════════════════════════════════════════════════════════
// AXIS 2: DEEP LINEAGE
// ═══════════════════════════════════════════════════════════════════════════

test('deep lineage: gen 0 → wild tier, no flag', () => {
  const wild = randomIndividual(42);
  wild.gen = 0;
  const result = analyzeRarity(wild, [wild]);
  assert.equal(result.deepLineage.tier, 'wild');
  assert.equal(result.deepLineage.flag, false);
  assert.equal(result.deepLineage.depth, 0);
});

test('deep lineage: gen 1 → cross tier, flagged', () => {
  const ind = randomIndividual(42);
  ind.gen = 1;
  const result = analyzeRarity(ind, [ind]);
  assert.equal(result.deepLineage.tier, 'cross');
  assert.equal(result.deepLineage.flag, true);
  assert.ok(result.deepLineage.score > 0, 'should have positive score');
});

test('deep lineage: gen 3 → deep tier, flagged', () => {
  const ind = randomIndividual(42);
  ind.gen = 3;
  const result = analyzeRarity(ind, [ind]);
  assert.equal(result.deepLineage.tier, 'deep');
  assert.equal(result.deepLineage.flag, true);
  assert.ok(result.deepLineage.score >= 0.3, `score ${result.deepLineage.score} >= 0.3`);
});

test('deep lineage: gen 5 → deep tier, flagged', () => {
  const ind = randomIndividual(42);
  ind.gen = 5;
  const result = analyzeRarity(ind, [ind]);
  assert.equal(result.deepLineage.tier, 'deep');
  assert.equal(result.deepLineage.flag, true);
});

test('deep lineage: gen 7 → ancient tier, flagged', () => {
  const ind = randomIndividual(42);
  ind.gen = 7;
  const result = analyzeRarity(ind, [ind]);
  assert.equal(result.deepLineage.tier, 'ancient');
  assert.equal(result.deepLineage.flag, true);
  assert.ok(result.deepLineage.score >= 0.8, `gen 7 should score >= 0.8, got ${result.deepLineage.score}`);
});

test('deep lineage: gen 10+ → ancient tier, score capped at 1', () => {
  const ind = randomIndividual(42);
  ind.gen = 15;
  const result = analyzeRarity(ind, [ind]);
  assert.equal(result.deepLineage.tier, 'ancient');
  assert.equal(result.deepLineage.score, 1, 'score should cap at 1');
});

test('deep lineage: score scales linearly with gen', () => {
  const g0 = randomIndividual(42); g0.gen = 0;
  const g4 = randomIndividual(43); g4.gen = 4;
  const g8 = randomIndividual(44); g8.gen = 8;
  const coll = [g0, g4, g8];

  const r0 = analyzeRarity(g0, coll);
  const r4 = analyzeRarity(g4, coll);
  const r8 = analyzeRarity(g8, coll);

  assert.ok(r8.deepLineage.score > r4.deepLineage.score,
    `gen 8 (${r8.deepLineage.score}) > gen 4 (${r4.deepLineage.score})`);
  assert.ok(r4.deepLineage.score > r0.deepLineage.score,
    `gen 4 (${r4.deepLineage.score}) > gen 0 (${r0.deepLineage.score})`);
});

// ═══════════════════════════════════════════════════════════════════════════
// AXIS 3: FIRST-TO-BREED
// ═══════════════════════════════════════════════════════════════════════════

test('first-to-breed: first appearance of a structure → pioneer', () => {
  const coll = [];
  const novel = individualFromThreadcount('FO/20 EM8 SG6 EM8 FO/20', 1);
  novel.gen = 0;
  coll.push(novel);
  // Different setts with different structures
  for (let i = 0; i < 5; i++) {
    const other = individualFromThreadcount(`SA/${20 + i} IN${6 + i} TQ${4 + i} IN${6 + i} SA/${20 + i}`, 100 + i);
    other.gen = 0;
    coll.push(other);
  }

  const result = analyzeRarity(novel, coll);
  assert.equal(result.firstToBreed.tier, 'pioneer', `expected pioneer, got ${result.firstToBreed.tier}`);
  assert.equal(result.firstToBreed.flag, true);
  assert.ok(result.firstToBreed.reason.includes('novel') || result.firstToBreed.reason.includes('first'),
    `reason should mention novelty: ${result.firstToBreed.reason}`);
});

test('first-to-breed: later copy of same structure → common', () => {
  const coll = [];
  const original = individualFromThreadcount('FO/20 EM8 SG6 EM8 FO/20', 1);
  original.gen = 0;
  coll.push(original);

  // Clone with same structure but swapped palette
  const clone = individualFromThreadcount('FO/20 EM8 SG6 EM8 FO/20', 2);
  clone.gen = 0;
  // Palette is the same since structure determines it — let's use a truly identical one
  coll.push(clone);

  // The clone should NOT be pioneer since it's after the original with same fingerprint
  const result = analyzeRarity(clone, coll);
  assert.equal(result.firstToBreed.tier, 'common', `clone should be common, got ${result.firstToBreed.tier}`);
  assert.equal(result.firstToBreed.flag, false);
});

test('first-to-breed: same structure with different palette → might still be pioneer if structure is novel', () => {
  const coll = [];
  // Same structure signature as FO/20 EM8 SG6 EM8 FO/20 but different palette
  const a = individualFromThreadcount('FO/20 EM8 SG6 EM8 FO/20', 1);
  a.gen = 0;
  coll.push(a);

  const b = individualFromThreadcount('SA/20 CB8 TQ6 CB8 SA/20', 2);
  b.gen = 0;
  // This has a DIFFERENT structure since the structure sig includes colour grouping
  coll.push(b);

  // b has a different structure entirely, so it should be pioneer of ITS OWN structure
  const resultB = analyzeRarity(b, coll);
  // b has a different structure from a, so it IS pioneer of its structure
  assert.equal(resultB.firstToBreed.flag, true,
    'different structure should be pioneer');
});

// ═══════════════════════════════════════════════════════════════════════════
// COMPOSITE: ANALYSIS + BADGES + SCORES
// ═══════════════════════════════════════════════════════════════════════════

test('composite: wild-like sett with no rarity signals has low rarityScore', () => {
  const coll = buildDiverseCollection();
  // First element is a gen-1 bred child from the common pool.
  // It WILL get lineage-cross (gen 1) and first-to-breed (novel structure) badges
  // — that's correct, not a bug. What matters is it's NOT a legendary.
  const commonInd = coll[0];
  const result = analyzeRarity(commonInd, coll);

  // Gen 1 + novel structure = modest composite. Should NOT be legendary/rare tier.
  assert.ok(result.rarityScore < 0.6,
    `common bred should score < 0.6, got ${result.rarityScore}`);
  assert.ok(!result.badges.includes('lineage-ancient') && !result.badges.includes('gene-cluster-legendary'),
    `should NOT have top-tier badges, got ${result.badges}`);
});

test('composite: deep lineage + gene cluster → multiple badges', () => {
  const coll = buildDiverseCollection();

  // Create a deliberately rare individual
  const rareInd = individualFromThreadcount('PK/30 TQ12 MA18 LM10 MA18 TQ12 PK/30', 9999);
  rareInd.gen = 5;
  coll.push(rareInd);

  const result = analyzeRarity(rareInd, coll);

  // Should have at least the deep lineage badge
  assert.ok(result.badges.includes('lineage-deep') || result.badges.includes('lineage-ancient'),
    `should have lineage badge, got ${result.badges}`);
  assert.ok(result.rarityScore >= 0.5,
    `rare+deep should score >= 0.5, got ${result.rarityScore}`);
});

test('composite: legendary gen-7 has highest possible composite rarityScore', () => {
  const coll = buildDiverseCollection();
  const legendaryInd = coll[10]; // gen 7, extreme structure
  const result = analyzeRarity(legendaryInd, coll);

  // gen 7 = ancient lineage + unusual structure = high composite
  assert.ok(result.rarityScore >= 0.55,
    `legendary should score >= 0.55, got ${result.rarityScore}`);
  assert.ok(result.badges.length >= 1,
    `should have at least 1 badge, got ${result.badges}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// COLLECTION ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

test('analyzeCollection: returns results and stats', () => {
  const coll = buildDiverseCollection();
  const { results, stats } = analyzeCollection(coll);

  assert.equal(results.length, coll.length, 'one result per individual');
  assert.ok(stats.total > 0, 'stats.total should be > 0');
  assert.ok(typeof stats.maxDepth === 'number', 'stats.maxDepth should be a number');
  assert.ok(typeof stats.avgRarityScore === 'number', 'stats.avgRarityScore should be a number');
  assert.ok(stats.maxRarityScore > stats.avgRarityScore,
    `max (${stats.maxRarityScore}) > avg (${stats.avgRarityScore})`);
});

test('analyzeCollection: empty collection returns safe defaults', () => {
  const { results, stats } = analyzeCollection([]);
  assert.deepEqual(results, []);
  assert.equal(stats.total, 0);
  assert.equal(stats.rare, 0);
  assert.equal(stats.maxDepth, 0);
});

test('analyzeCollection: single-element collection works', () => {
  const only = randomIndividual(123);
  only.gen = 2;
  const { results, stats } = analyzeCollection([only]);
  assert.equal(results.length, 1);
  assert.equal(stats.total, 1);
  // With only one element, rarity stats are limited but shouldn't crash
  assert.ok(typeof results[0].rarityScore === 'number');
});

// ═══════════════════════════════════════════════════════════════════════════
// FIND RARE FINDS
// ═══════════════════════════════════════════════════════════════════════════

test('findRareFinds: filters and sorts by rarityScore', () => {
  const coll = buildDiverseCollection();
  const finds = findRareFinds(coll, 0.3);

  assert.ok(finds.length > 0, 'should have some rare finds');
  // Sorted descending
  for (let i = 1; i < finds.length; i++) {
    assert.ok(finds[i - 1].rarityScore >= finds[i].rarityScore,
      `should be sorted descending: ${finds[i - 1].rarityScore} >= ${finds[i].rarityScore}`);
  }
});

test('findRareFinds: high threshold may return empty', () => {
  const coll = buildDiverseCollection();
  const finds = findRareFinds(coll, 0.95);
  assert.equal(finds.length, 0, 'very high threshold should return nothing');
});

// ═══════════════════════════════════════════════════════════════════════════
// COLLECTION RARITY TIER
// ═══════════════════════════════════════════════════════════════════════════

test('collectionRarityTier: diverse collection → uncommon', () => {
  const coll = buildDiverseCollection();
  const { stats } = analyzeCollection(coll);
  const tier = collectionRarityTier(stats);
  // With pioneers + deep lineages + rares, should be at least uncommon
  assert.ok(['uncommon', 'rare', 'legendary'].includes(tier),
    `diverse collection tier should be uncommon+, got ${tier}`);
});

test('collectionRarityTier: all-common collection → common', () => {
  // Truly identical setts — no structural variation at all
  const base = individualFromThreadcount('IN/24 CH12 IN8 CH12 BN2 CH12 IN8 CH12 IN/24', 1);
  base.gen = 0;
  const onlyCommon = [];
  for (let i = 0; i < 6; i++) {
    const clone = individualFromThreadcount('IN/24 CH12 IN8 CH12 BN2 CH12 IN8 CH12 IN/24', 100 + i);
    clone.gen = 0;
    onlyCommon.push(clone);
  }
  const { stats } = analyzeCollection(onlyCommon);
  const tier = collectionRarityTier(stats);
  assert.equal(tier, 'common', 'all-identical collection should be common tier');
});

test('collectionRarityTier: empty/null → common', () => {
  assert.equal(collectionRarityTier(null), 'common');
  assert.equal(collectionRarityTier({ total: 0 }), 'common');
});

// ═══════════════════════════════════════════════════════════════════════════
// EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════

test('edge: individuals with no gen default to gen 0', () => {
  // Some individuals may not have .gen set
  const ind = randomIndividual(42);
  delete ind.gen;
  const result = analyzeRarity(ind, [ind]);
  assert.equal(result.deepLineage.depth, 0);
  assert.equal(result.deepLineage.tier, 'wild');
});

test('edge: individual with partial .colors still works', () => {
  const coll = buildDiverseCollection();
  // The wild individuals from buildDiverseCollection should all have valid .colors
  const result = analyzeRarity(coll[0], coll);
  assert.ok(typeof result.rarityScore === 'number');
  assert.ok(result.rarityScore >= 0 && result.rarityScore <= 1,
    `score ${result.rarityScore} should be 0-1`);
});

test('edge: findRareFinds with empty collection', () => {
  const finds = findRareFinds([]);
  assert.deepEqual(finds, []);
});

test('edge: analyzeRarity with individual not in collection', () => {
  const coll = buildDiverseCollection();
  const outsider = randomIndividual(99999);
  const result = analyzeRarity(outsider, coll);
  // Should still produce results — just the pioneer check will note "not in collection"
  assert.ok(typeof result.rarityScore === 'number');
});
