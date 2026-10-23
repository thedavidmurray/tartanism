/*
 * GA-CONVERGENCE test -- the core "breed-toward-taste" proof.
 * When selection is seeded toward a TARGET trait (a palette hue, and separately a
 * structural proportion), the population's MEAN trait measurably moves toward the
 * target across N generations. This is the whole game: the user's taps are the
 * fitness function; repeated selection drifts the population toward what's picked.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  wildLitter, breedLitter, meanHue, circHueDist,
} from '../../src/engine/game.js';

// simulate a user who consistently prefers a target hue. Each generation: keep
// the fittest half (closest to target), breed them into the next generation.
function evolveTowardHue(targetHue, { seed = 1, gens = 8, pop = 24, wildness = 0.3 } = {}) {
  let population = wildLitter({ seed, size: pop });
  const meanDistTrace = [];
  const measure = (p) => p.reduce((a, ind) => a + circHueDist(meanHue(ind.stripes), targetHue), 0) / p.length;
  meanDistTrace.push(measure(population));

  for (let g = 0; g < gens; g++) {
    const ranked = [...population].sort(
      (a, b) => circHueDist(meanHue(a.stripes), targetHue) - circHueDist(meanHue(b.stripes), targetHue)
    );
    const parents = ranked.slice(0, Math.max(2, Math.floor(pop / 2))); // fittest half survive
    population = breedLitter(parents, { seed: seed + (g + 1) * 3301, size: pop, wildness });
    meanDistTrace.push(measure(population));
  }
  return meanDistTrace;
}

test('selecting toward a target HUE drifts the population mean toward it', () => {
  const targets = [30, 140, 260]; // orange-ish, green-ish, blue/violet-ish
  for (const target of targets) {
    const trace = evolveTowardHue(target, { seed: 7000 + target, gens: 8, pop: 28, wildness: 0.3 });
    const start = trace[0];
    const end = trace[trace.length - 1];
    assert.ok(end < start,
      `hue ${target}: population did not converge (start ${start.toFixed(1)}deg -> end ${end.toFixed(1)}deg)`);
    // meaningful movement: at least a 35% reduction in mean hue distance
    assert.ok(end < start * 0.65,
      `hue ${target}: weak convergence (start ${start.toFixed(1)} -> end ${end.toFixed(1)}, want end < 65%)`);
  }
});

test('convergence is progressive, not a single lucky jump', () => {
  const trace = evolveTowardHue(140, { seed: 4242, gens: 10, pop: 30, wildness: 0.3 });
  // the second half of the run should sit below the first-generation distance
  const firstGen = trace[1];
  const tail = trace.slice(Math.ceil(trace.length / 2));
  const tailMean = tail.reduce((a, b) => a + b, 0) / tail.length;
  assert.ok(tailMean < firstGen,
    `no sustained drift (gen1 ${firstGen.toFixed(1)} vs tail mean ${tailMean.toFixed(1)})`);
});

// structural convergence: select toward a target "few broad blocks" shape
test('selecting toward a target STRUCTURE (coarse blocks) drifts stripe-count down', () => {
  const targetStripes = 3; // prefer coarse, few-stripe setts
  let pop = wildLitter({ seed: 8888, size: 30 });
  const meanStripes = (p) => p.reduce((a, i) => a + i.stripes.length, 0) / p.length;
  const start = meanStripes(pop);
  for (let g = 0; g < 8; g++) {
    const ranked = [...pop].sort(
      (a, b) => Math.abs(a.stripes.length - targetStripes) - Math.abs(b.stripes.length - targetStripes)
    );
    const parents = ranked.slice(0, 15);
    pop = breedLitter(parents, { seed: 8888 + (g + 1) * 97, size: 30, wildness: 0.25 });
  }
  const end = meanStripes(pop);
  assert.ok(end < start,
    `structural selection failed to reduce stripe count (start ${start.toFixed(2)} -> end ${end.toFixed(2)})`);
});
