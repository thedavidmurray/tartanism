/*
 * SEAM / TILEABILITY invariant — the engine's central visual guarantee.
 * Every finalized individual's expandedLength must be a multiple of the weave
 * repeat (twill-2-2 → 4), or supertile blitting shows a visible seam. Ported
 * from spike-loop-export/curated-loops/test/integer-cycle.test.mjs, which was
 * never carried into the app suite.
 *
 * Reverse-classical: with the pivot-count nudge in breeding.js makeTileable
 * disabled, these tests fail (verified) — the 118-test suite did not.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  wildLitter, breedLitter, individualFromThreadcount, makePin, PIN_GENES, REPEAT,
  parseThreadcount, expandSett,
} from '../../src/engine/game.js';
import { makeTileable } from '../../src/engine/breeding.js';

const SEEDS = [1, 42, 0xC0FFEE, 20260704, 987654321];

function assertTileable(ind, label) {
  assert.equal(ind.expandedLength % REPEAT, 0,
    `${label}: expandedLength ${ind.expandedLength} not a multiple of weave repeat ${REPEAT} (tc: ${ind.threadcount})`);
  // the threadcount string must re-parse to the SAME expanded length — the
  // persisted genome and the rendered weave cannot disagree.
  const reparsed = expandSett(parseThreadcount(ind.threadcount)).length;
  assert.equal(reparsed, ind.expandedLength,
    `${label}: threadcount re-parses to ${reparsed}, individual says ${ind.expandedLength}`);
}

test('seam invariant — every wild individual is weave-tileable', () => {
  for (const seed of SEEDS) {
    for (const ind of wildLitter({ seed, size: 9 })) assertTileable(ind, `wild seed=${seed}`);
  }
});

test('seam invariant — every bred individual is weave-tileable across wildness', () => {
  const p1 = individualFromThreadcount('SA/40 GD8 SA18 CR12 GD4 CR18 SA/40');
  const p2 = individualFromThreadcount('EM/16 IN4 EM6 IN6 GD2 EM4 IN/16');
  for (const seed of SEEDS) {
    for (const wildness of [0, 0.3, 0.7, 1]) {
      for (const ind of breedLitter([p1, p2], { seed, size: 9, wildness })) {
        assertTileable(ind, `bred seed=${seed} w=${wildness}`);
      }
    }
  }
});

test('seam invariant — pin-active litters stay weave-tileable', () => {
  const source = individualFromThreadcount('MG/28 MA18 CB18 MA18 MG/28');
  const p1 = individualFromThreadcount('CO/30 TQ12 IN8 TQ12 CO/30');
  for (const gene of PIN_GENES) {
    const pin = makePin(gene, source);
    for (const seed of SEEDS) {
      for (const ind of wildLitter({ seed, size: 9, pin })) assertTileable(ind, `wild pin=${gene} seed=${seed}`);
      for (const ind of breedLitter([p1, source], { seed, size: 9, wildness: 0.6, pin })) {
        assertTileable(ind, `bred pin=${gene} seed=${seed}`);
      }
    }
  }
});

test('makeTileable — output threadcount re-parses to the reported (repeat-aligned) length', () => {
  // raw stripe arrays that are deliberately NOT repeat-aligned pre-nudge
  const raws = [
    [{ color: 'SA', count: 3 }, { color: 'GD', count: 4 }],
    [{ color: 'IN', count: 5 }, { color: 'EM', count: 7 }, { color: 'GD', count: 2 }],
    [{ color: 'MG', count: 9 }, { color: 'MA', count: 6 }, { color: 'CB', count: 11 }, { color: 'MA', count: 2 }],
  ];
  for (const raw of raws) {
    const t = makeTileable(raw.map((s) => ({ ...s })), REPEAT);
    assert.equal(t.expandedLength % REPEAT, 0, `nudged length ${t.expandedLength} not repeat-aligned`);
    assert.equal(expandSett(parseThreadcount(t.threadcount)).length, t.expandedLength,
      'makeTileable threadcount must re-parse to its own expandedLength');
  }
});
