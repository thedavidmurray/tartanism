# Architecture

The resolved technical architecture for Tartanism: what the app is made of, where
the web/native line falls, and the load-bearing decisions on persistence,
deep-linking, and export.

---

## 1. App shape

Ship the **proven vanilla-JS breeder** wrapped in **Capacitor** as a WKWebView
app. **Not** a React rebuild.

```
Vite (vanilla)  →  static bundle  →  Capacitor iOS (WKWebView)  →  Team 9BKHLSZVGF
```

- The engine modules (`tartanism.js` renderer, `breeding.js` mutate/breed engine,
  `game.js` population-GA) are **zero-dependency ES modules** and are the
  **canonical source of truth**. Everything new is a thin layer over them.
- Build: Vite vanilla → static bundle. Wrap: Capacitor iOS. Rides David's Apple
  Team `9BKHLSZVGF` (photoMerge / Clapper) signing + TestFlight pipeline.
- The web build runs **fully in a plain browser** for dev/CI. Native plugins are
  quarantined behind a capability shim (`app/src/native/`) that no-ops in the
  browser.

---

## 2. Genome / serialization — the spine

This is the single most important decision in the system.

**A litter is a pure deterministic function of its inputs.**

```
wildLitter({ seed, size })                          → Individual[size]
breedLitter(parents, { seed, size, wildness })      → Individual[size]
```

Both are **byte-identical given identical inputs** — the seeded Fisher-Yates
determinism fix has already landed in `breeding.js`. Every stochastic choice flows
from `mulberry32` seeded by an explicit integer.

Because of this, **the canonical persisted/shared record is NOT nine rendered
images** — it is a tiny descriptor:

```jsonc
{ "v": 1, "kind": "wild" | "bred", "seed": <uint32>, "size": 9,
  "wildness": <float?>, "parents": [<threadcountString>...]?, "gen": <int> }
```

The **`threadcount` string** (e.g. `"SA/40 GD8 SA18 CR12 GD4 CR18 SA/40"`) is the
**canonical compact genome** — deterministically renderable via
`resolveSett → renderSupertile`. A **kept individual** persists the richer record
the engine already produces:

```jsonc
{ "threadcount": "...", "seed": <uint32>, "parents": [<id>...],
  "strategy": <int>, "gen": <int>, "wildness": <float>,
  "weave": "twill-2-2", "threadPx": <2|3|4>,
  "motion": { "type": "pan", "speed": 1, "direction": {...}, "intensity": 0 } }
```

> Full record shapes, the base64url payload schema, and the version-field contract
> live in `docs/GENOME-SPEC.md`.

### The single load-bearing correctness fact

`app.js` currently mixes `Math.random()` into the session seed:

```js
// spike-loop-export/curated-loops/breeding-game/app.js
let seedCtr = (today.getFullYear()*372 + (today.getMonth()+1)*31 + today.getDate())*1000
  + Math.floor(Math.random() * 1000);          // ← nondeterministic entropy
const nextSeed = () => (seedCtr = (seedCtr*1103515245 + 12345) >>> 0);
```

Therefore **replay MUST persist the concrete integer seed actually produced by
`nextSeed()`** at generation time — it can **never** be re-derived from the date.
This is the single load-bearing correctness fact of the whole foundation, and
fixing it is part of the first genome feature (**T2**). A regression test proves
no `Math.random()` enters the replay path.

---

## 3. Persistence store — local-first, two tiers

No backend in v1.

| Tier | Store | Holds | Why |
|---|---|---|---|
| **Structured / growing** | **IndexedDB** (thin promise wrapper, no native dep) | kept collection, full lineage graph, last-litter snapshot | Genomes are ~40–120 bytes of text; IndexedDB is the platform-native structured store that behaves **identically** in the browser (dev/CI) and the WKWebView (prod). Zero native plugin needed for v1. |
| **Small KV** | **Capacitor Preferences** (→ `localStorage` fallback in browser dev) | streak counters, today's daily-state, settings, **Pro entitlement flag** | Tiny, flat, key-value; the Preferences API maps to `localStorage` cleanly so the same code runs both places. |

Cold-start (a fresh store instance) must return identical genomes and lineage
order — persistence integrity is an acceptance criterion, not a hope.

---

## 4. Deep-link / App-Clip — decouple payload from wrapper

The **payload + reconstruction (web, now)** is decoupled from the **App-Clip
wrapper (native, later)**.

**Payload** = `base64url(JSON)` of the litter descriptor from §2, carried as a
**URL fragment** (`#g=…`) on a registered path:

```
https://tartanism.app/b#g=<base64url payload>
```

**Flow:**

1. **Today (web, no Xcode):** on load the web app decodes `#g=`, reconstructs the
   **exact** litter deterministically, and the viewer's **first tap is
   Breed-from**. This works in mobile Safari now as a web fallback with an install
   CTA. Invalid/oversized payloads fail gracefully to a fresh wild litter.
2. **Later (native, David + Xcode):** Universal Links (Associated Domains +
   `apple-app-site-association`) let the installed app resolve the same URL via
   `@capacitor/app` `appUrlOpen`, routing it into `deeplink.parse`.
3. **Later still (App Clip):** an App Clip target resolves the **same** URL for
   users without the app.

> **App Clips require a native target — they cannot be pure web.** That is exactly
> why the link is engineered to work on the web *now*; the App Clip is purely
> additive. See `docs/DEEPLINK-SPEC.md`.

**Payload budget:** a bred litter with up to 2 parent threadcounts encodes to
~300–600 chars base64url (target: **< 800 chars**), well under Universal Link /
App Clip invocation limits.

---

## 5. Daily comparative gallery — local now, Supabase at v1.5

**v1 is FULLY LOCAL.**

- The daily aesthetic prompt is **date-seeded and deterministic** — the same
  prompt for everyone on a given date, computed **offline** from the date, no
  network. It is interpreted by **taste**, never fidelity-scored.
- The **streak** is local + persisted (KV tier).

The **shared comparative gallery** (see what others bred for today's prompt) is the
**only** thing that needs a backend, and it is **deferred to v1.5**.

When built, **revive the existing Supabase project** (ref
`psugfpgljtmwbngqwcze`) but **do NOT reuse its current heavy patterns / image-storage
schema** — that was for the abandoned React plaid-studio and stores PNGs. Instead
add **one lean anonymous table**:

```sql
create table daily_entries (
  prompt_date    date        not null,
  genome_json    jsonb       not null,   -- the descriptor, NOT an image
  anon_device_id text        not null,
  created_at     timestamptz not null default now()
);
-- RLS: rate-limited public insert + public read. No auth.
```

Store the **genome descriptor only** and **render client-side** — zero image
storage, zero egress cost. The client falls back cleanly to local-only if the
backend is unreachable.

---

## 6. Share-frame + watermark renderer — the fused object

A **canvas compositor** that reuses `renderSupertile` + `drawTartanFrame`.

- **Signature template (the crown card):** a fixed-aspect frame whose canonical
  artifact is a **legible BEFORE/AFTER split** — *"wild ancestor → what I bred in
  N gens"* — **never** a nine-cell swatch grid. This is what reads at App Store
  thumbnail size and what sells the transformation.
- **Still export:** `canvas.toBlob` PNG.
- **Looping MP4:** the already-verified **WebCodecs H.264** path
  (`export-pipeline/run_webcodecs.mjs`, integer-cycle seamless-loop math, seam RMS
  `0.0`), targeting **VideoToolbox H.264** on iOS.
- **Watermark + tappable "Tartanism" App-Clip end-card** are composited
  **per-frame** — attribution is baked **into the MP4 pixels** so creator
  green-screen re-uploads carry the install hook. **Free tier = always on; Pro =
  off.** The end-card link encodes the litter's `#g=` payload (opens to
  breed-from).

This is the fun object and the sold object **fused into one artifact**.

---

## 7. Birth-event layer — the missing organ

A `requestAnimationFrame` state machine, built **once** and re-triggered for
**Breed, Wild, and idle life**:

```
charge  (~600ms — parents lift / hum)
  → impact  (one hit-pause freeze + short shake + bass thunk)
    → hatch  (9 offspring staggered ~35ms — scale-overshoot + particle puff
              + ascending arpeggio; the top-inheritor glows)
```

- The **weave breathes / ripples under touch**.
- **SFX are synthesized in WebAudio — no audio assets.** Thunk = filtered sine
  burst; arpeggio = scheduled oscillators.
- **Particles** = a lightweight canvas overlay.
- Respects `prefers-reduced-motion` (instant-reveal fallback).
- **Must hold 60fps in WKWebView** — the sequence is inherently
  screen-recordable, which is the point. Verified on-device in the T18 loop.

---

## 8. Web-vs-native boundary

| Concern | WEB (autonomous, buildable now, no Xcode) | NATIVE (David + Xcode — documented as tasks, not blind-scaffolded) |
|---|---|---|
| Engine + renderer | ✅ exists | — |
| Genome serialization | ✅ | — |
| Replay-by-seed (+ seed-bug fix) | ✅ | — |
| IndexedDB persistence + KV shim | ✅ | Preferences plugin swaps in behind the shim |
| Deep-link decode + web reconstruction | ✅ | — |
| Universal Links / Associated Domains / AASA | — | ✅ |
| App Clip target | — | ✅ (native target required) |
| Daily prompt + streak (local) | ✅ | — |
| Birth event + WebAudio | ✅ | on-device 60fps verification |
| Share-frame compositor + watermark | ✅ | — |
| PNG export | ✅ | save-to-Photos plugin |
| WebCodecs MP4 export | ✅ (encode logic) | on-device VideoToolbox verification |
| Trait pinning | ✅ | — |
| Wild-free enforcement | ✅ | — |
| Keep-ceremony | ✅ | — |
| Capacitor iOS wrap (WKWebView) | — | ✅ |
| StoreKit 2 one-time IAP (Pro) | — | ✅ |
| Save-to-Photos / share sheet | web no-ops | ✅ real plugins |
| TestFlight / App Store submission | — | ✅ |

**The rule:** everything on the WEB side is buildable and testable *right now* by
an autonomous agent in a browser. Everything on the NATIVE side is written up as an
explicit task with acceptance criteria (`docs/NATIVE-CHECKLIST.md`) — never blindly
scaffolded — because it requires Xcode, a device, and David's Apple account.

---

## 9. Key risks

Five named risks, in priority order:

1. **WebCodecs `VideoEncoder` in iOS WKWebView is UNVERIFIED.** The spike proved
   encode in Node/Chromium, **not** WKWebView. If WKWebView lacks
   `VideoEncoder` / VideoToolbox binding, MP4 export needs a **native Capacitor
   encode bridge** (`AVAssetWriter` over exported frames). This gates the entire
   MP4 / green-screen thesis and **must be verified on-device early** (T13, gated
   by T18).
2. **App Clips cannot be pure web** (native target required). **Mitigated** by
   shipping the web-fallback reconstruction as the v1 path — the link always works
   on the web; the App Clip is additive (T20).
3. **Seed nondeterminism** (`Math.random` in `app.js`, §2). **Mitigated** by
   persisting the concrete integer seed in the very first genome feature (T2).
4. **60fps birth event on older devices in WKWebView.** A perf budget that needs
   on-device testing (T9 verified in the T18 loop).
5. **Save-to-Photos / share sheet / IAP all require native plugins.**
   **Mitigated** by the capability shim — the web build runs fully in a browser for
   dev/CI, and native calls become real plugins only inside the wrap.

---

## 10. Test harness

Ported and extended `.mjs` suites run under `node --test`:

- `tests/engine/` — the existing breeding-game suites, moved verbatim:
  `determinism`, `convergence`, `inheritance`, `wildness-dial`, `broad-range`.
- `tests/genome/` — **new** acceptance suites: serialize round-trip, replay-by-seed
  (with the no-`Math.random` regression), persistence cold-start, deep-link
  reconstruction.
- `export-pipeline/` retains its own CI gate: `seam_check.mjs` (seam RMS ≈ 0),
  `probe_codecs.mjs`, `mp4-valid` — the WebCodecs loop math stays under test as a
  library used by the share layer.
