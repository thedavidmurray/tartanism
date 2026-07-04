/*
 * FOUNDATION acceptance tests — trait-pin capture in the LitterDescriptor.
 *   B(pin). SHARE → OPEN EQUIVALENCE with an active pin: the descriptor built at
 *   generation time must carry the pin, and reconstructLitter must rehydrate it,
 *   so a pin-active litter replays byte-identically (DEEPLINK-SPEC contract).
 *
 * Reverse-classical: these tests FAIL on the pre-fix code (descriptor builders
 * dropped the pin, replay never passed one) — verified before the fix landed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wildLitter, breedLitter, individualFromThreadcount, makePin, PIN_GENES } from '../../src/engine/game.js';
import { wildDescriptor, bredDescriptor, encodeLitter, decodeLitter } from '../../src/genome/serialize.js';
import { reconstructLitter } from '../../src/genome/replay.js';

const tc = (arr) => arr.map((x) => x.threadcount);
const PIN_SOURCE = individualFromThreadcount('SA/40 GD8 SA18 CR12 GD4 CR18 SA/40');

for (const gene of PIN_GENES) {
  test(`B(pin). wild litter with an active ${gene} pin round-trips through the descriptor`, () => {
    const pin = makePin(gene, PIN_SOURCE);
    const seed = 0xBADCAFE >>> 0;

    // what the player sees on screen (app.js doWild with activePin)
    const onScreen = wildLitter({ seed, size: 9, pin });
    // what the app persists/shares (app.js builds this at the same moment)
    const descriptor = wildDescriptor(seed, 9, pin);

    // full share path: encode → decode → reconstruct
    const replayed = reconstructLitter(decodeLitter(encodeLitter(descriptor)));
    assert.deepEqual(tc(replayed), tc(onScreen),
      `${gene}-pinned wild litter must replay byte-identically from its descriptor`);
  });
}

test('B(pin). bred litter with an active pin round-trips through the descriptor', () => {
  const p1 = individualFromThreadcount('EM/16 IN4 EM6 IN6 GD2 EM4 IN/16');
  const p2 = individualFromThreadcount('MG/28 MA18 CB18 MA18 MG/28');
  const pin = makePin('palette', PIN_SOURCE);
  const opts = { seed: 424242, size: 9, wildness: 0.6 };

  const onScreen = breedLitter([p1, p2], { ...opts, pin });
  const descriptor = bredDescriptor([p1.threadcount, p2.threadcount], { ...opts, pin });

  const replayed = reconstructLitter(decodeLitter(encodeLitter(descriptor)));
  assert.deepEqual(tc(replayed), tc(onScreen),
    'pinned bred litter must replay byte-identically from its descriptor');
});

test('B(pin). pin-free descriptors are unchanged (no pin field, replay as before)', () => {
  const d = wildDescriptor(123, 9);
  assert.ok(!('pin' in d), 'no active pin → no pin field in the descriptor');
  assert.deepEqual(tc(reconstructLitter(d)), tc(wildLitter({ seed: 123, size: 9 })));
});
