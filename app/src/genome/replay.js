/*
 * genome/replay.js — deterministic REPLAY-BY-SEED.
 *
 * reconstructLitter(descriptor) regenerates a byte-identical litter by calling
 * the engine's PURE generators with the EXACT persisted integer seed — never a
 * date-derived one. This is the fix for the app.js Math.random() seed-source
 * bug: the concrete seed must be captured at generation time (serialize.js
 * descriptor builders) and threaded through here.
 *
 * Parents are carried as their `threadcount` strings — the canonical lossless
 * genome for the breeding path — and rehydrated via individualFromThreadcount.
 * An active trait-pin (T16) is generation input too: it is carried as
 * { gene, source:threadcount } and rehydrated the same way, or replay diverges
 * on every pin-active litter.
 */
import { wildLitter, breedLitter, individualFromThreadcount, makePin } from '../engine/game.js';
import { isSupported } from './serialize.js';

export function reconstructLitter(descriptor) {
  if (!isSupported(descriptor)) {
    throw new Error(`unsupported litter descriptor version: ${descriptor && descriptor.v}`);
  }
  const { kind, seed, size = 9, wildness, parents } = descriptor;
  const pin = descriptor.pin
    ? makePin(descriptor.pin.gene, individualFromThreadcount(descriptor.pin.source))
    : null;

  if (kind === 'wild') {
    return wildLitter({ seed: seed >>> 0, size, pin });
  }
  if (kind === 'bred') {
    if (!parents || parents.length === 0) {
      throw new Error('bred descriptor needs >=1 parent threadcount');
    }
    const parentInds = parents.map((tc) => individualFromThreadcount(tc));
    return breedLitter(parentInds, { seed: seed >>> 0, size, wildness, pin });
  }
  throw new Error(`unknown litter kind: ${kind}`);
}
