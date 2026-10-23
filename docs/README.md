# Tartanism

A generative-backgrounds **breeding toy**. You are the fitness function: tap the
setts you like, hit **Breed**, and the selection's genes recombine + mutate into
a fresh litter of nine that drifts toward your taste while still throwing new
randomness. **Wild** is a free gacha reroll. **Keep** saves an individual to your
collection. Every loved pattern can be exported as a looping, watermarked video
that doubles as a drop-in background for TikTok / Reels / CapCut — and the
watermark is a tappable link that opens straight to *breed-from-this*.

This repo ships the **proven vanilla-JS breeder** wrapped in Capacitor as a
WKWebView iOS app. It is **not** a React rebuild.

---

## Design thesis

- **The user is the selection pressure.** No fidelity score, no "correct" answer.
  Taste is the only judge. The daily aesthetic prompt is a *constraint to
  interpret*, never a target to hit.
- **Genome, not image.** A litter is a pure deterministic function of its inputs.
  The canonical record we persist and share is a tiny descriptor (tens of bytes),
  not nine rendered PNGs. Everything renders client-side from a `threadcount`
  string.
- **The share artifact is the product.** The looping MP4 with a baked-in,
  tappable App-Clip end-card is simultaneously the fun object and the sold object.
  Free exports carry the watermark (a breedable ad); Pro removes it.
- **Discovery is free forever.** Wild reroll never costs anything. Pro gates
  *output* (watermark removal, HD, full library) — never breeding or Wild.
- **Local-first.** No backend in v1. Genomes live in IndexedDB; streak/settings/Pro
  in a KV shim. The one thing that needs a server (a shared comparative gallery)
  is deferred to v1.5.

---

## Reuse, don't rebuild — the load-bearing rule

The engine is **already built, tested, and deployed**. It is the canonical single
source of truth. Everything new is a **thin layer over it**.

**Canonical engine lives at `app/src/engine/`** (three zero-dependency ES modules):

| Module | Owns |
|---|---|
| `tartanism.js` | The renderer: `resolveSett`, `renderSupertile`, `drawTartanFrame`, `parseThreadcount`, `expandSett`, `weaveRepeat`, the `PALETTE`. |
| `breeding.js` | `mulberry32` RNG, the mutate operators, `makeTileable`, structure/proportion signatures, seeded Fisher-Yates determinism. |
| `game.js` | The population genetics: `wildLitter({seed,size})`, `breedLitter(parents,{seed,size,wildness})`, `breedChild`, `randomIndividual`, `individualFromThreadcount`, trait extractors. |

> Before writing any new feature, read the engine. If a capability already exists
> there (it usually does), import it — do not reimplement it. The determinism
> contract (`same seed + same selection + same wildness + same size ⇒
> byte-identical litters`) is the foundation everything else stands on.

The engine is imported by **both** `app/` (the shipping app) and `export-pipeline/`
(the WebCodecs MP4 path) from the same `app/src/engine/` location. There is one
copy, not two.

---

## Build order (the spine)

The ranked build order, mapped to the task graph (full detail in
[ROADMAP.md](./ROADMAP.md)):

1. **Consolidate** the scattered spike code into a real `app/` project — engine
   moved to `app/src/engine/`, tests green under `node --test`, Vite vanilla
   build runs the breeder in a browser. *(T0)*
2. **Genome foundation** — versioned serialize/decode, deterministic replay-by-seed
   (and fix the `Math.random` seed bug), IndexedDB persistence, deep-link decode.
   *(T1–T4)*
3. **Daily loop** — date-seeded aesthetic prompt + local streak. *(T6, T7)*
4. **Birth event** — the `charge → impact → hatch` animation + WebAudio SFX,
   reused for Breed / Wild / idle. *(T9, T10)*
5. **Share** — before/after crown-card compositor, PNG export, baked watermark,
   WebCodecs MP4. *(T11–T13)*
6. **Feel & fairness** — Wild-free-forever, trait pinning, keep-ceremony. *(T15,
   T16, T17)*
7. **Native** — Capacitor iOS wrap, Universal Links, StoreKit Pro IAP,
   save-to-Photos/share, TestFlight → App Store. *(T5, T18–T22)*
8. **v1.5** — shared comparative gallery (lean Supabase), discovery-rarity,
   Cultivate/Wild dial split. *(T8, T23, T24)*

---

## Run it

The app is a **Vite vanilla** project. There is no framework, no transpiled JSX —
the engine modules are plain ES modules that run in a browser as-is.

```bash
cd app
pnpm install           # pnpm, minimumReleaseAge 1440 (24h) enforced
pnpm dev               # Vite dev server — the breeder runs in the browser
pnpm build             # static bundle → dist/  (this is what Capacitor wraps)
pnpm test              # node --test over tests/  (engine + genome suites)
```

The web build is **fully runnable in a plain browser** for dev/CI. Native-only
capabilities (share sheet, save-to-Photos, IAP) sit behind a capability shim in
`app/src/native/` and **no-op cleanly** in the browser, so nothing about the web
build depends on Xcode.

---

## Deploy target

- **Web:** the breeder is live today at
  [edgeless-tartan-breed.pages.dev](https://edgeless-tartan-breed.pages.dev)
  (Cloudflare Pages). The `#g=` deep-link web fallback works in mobile Safari now,
  with an install CTA — the App Clip is purely additive later.
- **Native iOS:** Capacitor WKWebView wrap on **Apple Team `9BKHLSZVGF`** (the
  same signing/TestFlight pipeline as photoMerge and The Clapper). Native work is
  documented as an explicit punch list, not blind-scaffolded — see
  `docs/NATIVE-CHECKLIST.md` (owner: David + Xcode).

---

## Repo map

```
Tartanism/
  app/               # THE SHIPPING APP (Vite vanilla + Capacitor)
    src/engine/      # canonical engine (single source of truth)
    src/genome/      # serialize · replay · deeplink
    src/store/       # IndexedDB persistence + KV shim
    src/daily/       # date-seeded prompt + streak
    src/birth/       # rAF birth-event state machine + WebAudio + particles
    src/share/       # crown-card compositor + watermark + PNG/MP4 export
    src/ui/          # app.js decomposed into grid / tray / dial / actions
    src/native/      # capability shim (web no-ops)
    tests/           # ported engine suites + new genome acceptance tests
    ios/             # Capacitor iOS (generated by the native task; David+Xcode)
  export-pipeline/   # WebCodecs MP4 path (library + CI seam-check gate)
  legacy-studio/     # the abandoned React plaid-studio (kept, not deleted)
  supabase/          # migrations; v1.5 adds a lean daily_entries table
  docs/              # you are here
```

> **Current state note:** as of writing, the code is still scattered across three
> unrelated trees (`src/` React studio at root, `spike-loop-export/`, and
> `spike-loop-export/curated-loops/breeding-game/`). Task **T0** performs the
> consolidation into the layout above. Until T0 lands, the playable breeder lives
> at `spike-loop-export/curated-loops/breeding-game/`.

---

## Docs index

- [ARCHITECTURE.md](./ARCHITECTURE.md) — the resolved technical architecture, the
  web/native boundary, and the five named risks.
- [ROADMAP.md](./ROADMAP.md) — the goal-loop task graph as phased milestones with
  acceptance criteria, owners, and web/native gating.
