# GENOME-SPEC — Tartanism breeder

The persisted/shared unit is **not** rendered images. A litter is a pure
deterministic function of `(kind, seed, size, wildness, parentGenomes)`, so the
canonical record is a tiny version-tagged descriptor.

## Canonical compact genome — the `threadcount` string

e.g. `SA/40 GD8 SA18 CR12 GD4 CR18 SA/40`. Deterministically renderable via
`resolveSett → renderSupertile`. It is a **lossless** genome for the breeding
path: `individualFromThreadcount(ind.threadcount)` reproduces byte-identical
children (verified — see `tests/genome/replay.test.mjs` B(ii)).

## Genome (a kept individual, persisted as-is by the store)

```
{ v, threadcount, seed, parents:[ids], strategy, gen, wildness, weave, threadPx, motion, ... }
```
Produced by `engine/game.js` `finalize()`. Stored verbatim in IndexedDB.

## LitterDescriptor (the shareable / replayable unit)

```
{ v:1, kind:'wild'|'bred', seed:uint32, size, wildness?:float, parents?:[threadcountString],
  pin?:{ gene:'palette'|'rhythm'|'proportions', source:threadcountString } }
```

- `seed` — the **concrete integer** produced by `nextSeed()` at generation time.
  Never date-derived. This is the single load-bearing correctness fact: `app.js`
  mixes `Math.random()` into the session seed, so replay must persist the exact
  integer, not re-derive it. (Regression guard: `replay.test.mjs` C.)
- `parents` — carried as `threadcount` strings only.
- `pin` — the active trait-pin (T16), if any. A pin-active litter is a function
  of the pin too, so it is captured at generation time as the pinned gene + the
  source sett's threadcount, and rehydrated on replay via
  `makePin(gene, individualFromThreadcount(source))`. Optional under v1:
  pin-free descriptors are byte-identical to pre-pin ones.
  (Round-trip guard: `tests/genome/pin-replay.test.mjs`.)

## Codec — `genome/serialize.js`

- `encodeLitter(descriptor)` → base64url payload, **no padding**, matches
  `/^[A-Za-z0-9_-]+$/`. `bred` with 2 parents encodes to ~120–180 chars
  (budget < 800 for Universal Link / App Clip headroom).
- `decodeLitter(payload)` → descriptor. Throws only on a malformed payload; an
  **unknown version decodes without throwing** (`isSupported()` gates use).
- Cross-env: `Buffer` in Node, `btoa/atob` in the browser.
- Builders `wildDescriptor(seed,size)` / `bredDescriptor(parentTcs,{seed,size,wildness})`
  are the **seed-capture** point.

## Replay — `genome/replay.js`

`reconstructLitter(descriptor)` calls `wildLitter`/`breedLitter` with the exact
persisted seed → byte-identical litter. Bred parents rehydrate via
`individualFromThreadcount`.
