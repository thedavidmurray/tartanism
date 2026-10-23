// Regression gate for the *shipping* renderer, not the July prototype.
import { wildLitter, breedLitter } from './src/engine/game.js';
import { buildLoopSpec, seamOffsets } from './src/ui/loop-export.js';

let checked = 0;
for (let seed = 1; seed <= 64; seed++) {
  const parents = wildLitter({ seed, size: 9 });
  const children = breedLitter(parents.slice(0, 2), { seed: seed + 4096, size: 9, wildness: 0.7 });
  for (const genome of [...parents, ...children]) {
    const { seamless, offset0, offsetN } = seamOffsets(buildLoopSpec({ genome }).cfg);
    if (!seamless) throw new Error(`seam mismatch seed ${seed}: ${JSON.stringify({ offset0, offsetN })}`);
    checked++;
  }
}
console.log(`PASS: ${checked} generated shipping setts close their motion seam (frame 0 === frame N).`);
