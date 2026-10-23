# Roadmap

The goal-loop task graph as phased milestones. Each task carries its **goal**,
**acceptance criteria**, **owner**, **effort**, and **dependencies** verbatim from
the plan. Nothing here is invented beyond the task graph.

**Owners**

- `subagent-autonomous` — buildable now, in a browser, with no Xcode.
- `david+subagent` — needs a device / Xcode / Apple account; subagent preps, David
  runs the native half.
- `david-gated` — David decides when to start.

**Effort:** S / M / L.

---

## Phase 0 — Consolidation (foundation)

### T0 · Consolidate scattered spike/prototype code into `app/` · `ops` · M · owner: subagent-autonomous · depends: —
**Goal:** One real app project with the proven engine as canonical single source
of truth and the existing TDD suites running green under `node --test`.
**Acceptance:**
- `breeding-game/{tartanism,breeding,game}.js` moved to `app/src/engine/` and
  imported from there; the duplicate copies under `curated-loops/` deleted (no
  two-copy drift).
- The 5 breeding-game TDD suites moved to `app/tests/engine/` and all pass via
  `pnpm test` (`node --test`).
- Vite vanilla build produces a static bundle that runs the existing breeder in a
  browser.
- Root React studio moved to `legacy-studio/` and `spike-loop-export/` renamed
  `export-pipeline/` without breaking the WebCodecs path.
- pnpm configured with `minimumReleaseAge 1440`.

---

## Phase 1 — Genome foundation (web)

The spine. Get serialization, deterministic replay (and the seed-bug fix),
persistence, and deep-link decode landing on top of the engine.

### T1 · Genome + LitterDescriptor serialization model (versioned) · `web` · M · owner: subagent-autonomous · depends: T0
**Goal:** A canonical, tiny, deterministic serialization for a litter and a kept
individual that round-trips exactly.
**Acceptance:**
- `Genome` and `LitterDescriptor` record shapes defined per `GENOME-SPEC`.
- `encodeLitter` / `decodeLitter` round-trip deep-equal for wild + bred (1 and 2
  parents) descriptors.
- Payload is base64url (`/^[A-Za-z0-9_-]+$/`, no padding) and a 2-parent bred
  litter is **< 800 chars**.
- Version field `{v:1}` present; decoder handles unknown version without throwing.

### T2 · Deterministic replay-by-seed + fix seed-source bug · `web` · M · owner: subagent-autonomous · depends: T1
**Goal:** Regenerate a byte-identical litter from a descriptor, with the concrete
integer seed captured at generation (no `Math.random` leakage).
**Acceptance:**
- `reconstructLitter(descriptor).map(threadcount) === ` fresh
  `breedLitter`/`wildLitter` with the same inputs, for wild and bred.
- App generation path records the exact seed produced (not date-derived); replay
  with that seed reproduces the litter.
- Regression test proves no `Math.random` enters the replay path.

### T3 · Local persistence: IndexedDB collection + lineage + last-litter, KV shim · `web` · M · owner: subagent-autonomous · depends: T1
**Goal:** Kept setts, full lineage, and last litter survive a hard reload with no
backend.
**Acceptance:**
- `saveKept`/`loadCollection`, `saveLineageEdge`/`loadLineage`,
  `saveLastLitter`/`loadLastLitter` implemented over IndexedDB.
- Cold-start (new store instance) returns identical genomes and lineage order.
- KV shim (Capacitor Preferences → localStorage fallback) stores
  streak/settings/pro flag.
- Lineage integrity: deep gen 0→N chain reconstructs fully.

### T4 · Deep-link payload decode + one-tap breed-from web reconstruction · `web` · M · owner: subagent-autonomous · depends: T1, T2
**Goal:** Opening a `#g=` link reconstructs the exact litter so the viewer's first
tap is Breed-from — killing typed-seed friction.
**Acceptance:**
- `location.hash` `#g=<payload>` parses → decode → reconstruct → UI receives a
  ready litter.
- End-to-end: a shared payload opens to a litter whose threadcounts equal the
  sharer's exported litter.
- Works in mobile Safari as a web fallback with an install CTA.
- Invalid/oversized payloads fail gracefully to a fresh wild litter.

---

## Phase 2 — Daily loop (web)

The exogenous novelty clock + daily-return reward.

### T6 · Date-seeded daily aesthetic prompt (local, deterministic) · `web` · S · owner: subagent-autonomous · depends: T1
**Goal:** An exogenous novelty clock: everyone gets the same dated aesthetic
constraint for a given date, computed offline.
**Acceptance:**
- Given a date, a deterministic prompt is produced (e.g. `"dusk · 3 colors · thin
  rhythm"`) from a curated constraint vocabulary.
- Same date → same prompt across devices with no network.
- Prompt is interpreted by taste, **NOT** fidelity-scored (no correctness gate on
  the player's litter).
- Unit test pins several dates to expected prompts.

### T7 · Streak system (local, persisted) · `web` · S · owner: subagent-autonomous · depends: T3, T6
**Goal:** A daily-return reward loop that increments on consecutive days and resets
on a gap.
**Acceptance:**
- Streak increments once per local calendar day of engagement; consecutive days
  build the count.
- A missed day resets per the defined rule; state persists across reloads via KV.
- No backend; tests simulate a sequence of dates and assert streak values.

---

## Phase 3 — Birth event + audio (web)

The missing organ — the single screen-recordable animation, reused everywhere.

### T9 · Birth-event sequence (charge→impact→hatch), reusable for Breed/Wild/idle · `web` · L · owner: subagent-autonomous · depends: T0
**Goal:** The missing organ: a single screen-recordable birth animation reused
across all reveal triggers.
**Acceptance:**
- rAF state machine: ~600ms charge → hit-pause + shake + thunk → 9 offspring hatch
  staggered ~35ms with scale-overshoot + particle puff; top-inheritor glows.
- ONE sequence parameterized and reused for Breed, Wild, and idle life.
- `prefers-reduced-motion` → instant reveal fallback.
- Holds 60fps on the target WKWebView (verified on device in the T18 loop).

### T10 · WebAudio SFX (thunk + ascending arpeggio) + weave-breathes-under-touch · `web` · M · owner: subagent-autonomous · depends: T9
**Goal:** Synthesized game-feel audio and tactile weave response with zero audio
assets.
**Acceptance:**
- Thunk (filtered sine burst) fires on impact; ascending arpeggio schedules across
  the hatch stagger.
- Weave ripples/breathes under touch on the cells.
- Audio respects a mute toggle and does not block the 60fps visual path.
- No bundled audio files — all synthesized in WebAudio.

---

## Phase 4 — Share layer (web, with one native gate)

The fused fun/sold object: crown-card, watermark, PNG, MP4.

### T11 · Share-frame compositor (before/after crown card) + PNG export · `web` · L · owner: subagent-autonomous · depends: T1, T3
**Goal:** One signature, human-legible export template built around every share.
**Acceptance:**
- Canvas compositor reuses `renderSupertile`/`drawTartanFrame` to render a
  fixed-aspect crown card with a legible "wild ancestor → bred in N gens"
  before/after split.
- `canvas.toBlob` PNG export works and is saveable in-browser.
- The frame reads as human-legible (before/after), never a 9-cell swatch grid.
- Deterministic given the same genomes (snapshot test on pixel hash or structural
  equality).

### T12 · Watermark-as-growth-engine: tappable App-Clip end-card baked into every free export · `web` · M · owner: subagent-autonomous · depends: T11, T4
**Goal:** Every free share is a breedable, tappable ad; Pro removes it.
**Acceptance:**
- Watermark + "Tartanism" end-card carrying the replay short link composited
  per-frame into PNG and MP4 (attribution baked into pixels for green-screen
  re-uploads).
- Free tier = watermark always on; Pro flag = off.
- End-card link encodes the litter's deep-link payload (opens to breed-from).
- Test asserts free export contains the watermark region and Pro export omits it.

### T13 · Looping MP4 export via WebCodecs + on-device VideoToolbox verification (RISK) · `web` · L · owner: david+subagent · depends: T11, T18
**Goal:** Ship drop-in TikTok/CapCut looping backgrounds with attribution, and
prove the encode path works in iOS WKWebView.
**Acceptance:**
- export-pipeline WebCodecs H.264 path integrated into `app/share`; produces a
  seamless loop (seam RMS ~0 via seam_check).
- On-device test confirms `VideoEncoder`/VideoToolbox is available in WKWebView; if
  NOT, a native Capacitor `AVAssetWriter` fallback is specced and stubbed.
- Exported MP4 carries the baked watermark/end-card.
- Loop plays without a visible seam on device.

> **Risk gate.** This is Risk #1 (see ARCHITECTURE §9). It cannot fully close until
> T18 gives us a device to verify VideoToolbox availability.

---

## Phase 5 — Feel & fairness (web)

Wild-free-forever, directed exploration, and the felt save.

### T15 · Kill cost-on-Wild permanently (Wild free forever; Pro = output only) · `web` · S · owner: subagent-autonomous · depends: T0
**Goal:** Remove any friction/paywall on the Wild reroll — discovery is free
forever.
**Acceptance:**
- Wild reroll has no cost, cooldown-paywall, or gating in code or UX.
- Pro entitlement gates ONLY export (watermark removal + HD + full library), never
  breeding or Wild.
- Test asserts the Wild path never checks the pro/paywall flag.

### T16 · Trait pinning (tap-hold to lock ONE gene; rest breeds wild) · `web` · M · owner: subagent-autonomous · depends: T1
**Goal:** Directed exploration: lock a color/structure gene while everything else
recombines wildly.
**Acceptance:**
- Tap-hold on a sett locks one gene (color or stripe) via the GA lock flag the
  engine already supports.
- Bred litter preserves the locked gene across all 9 offspring while the rest
  varies.
- Unlock restores full-wild breeding.
- Test asserts the locked gene is invariant across a bred litter.

### T17 · Keep-ceremony + naming (heart-tap → pause + bloom + name field + lineage card) · `web` · M · owner: subagent-autonomous · depends: T9, T3, T11
**Goal:** Make saving a loved sett a felt moment that reuses the birth bloom and
produces a shareable lineage card.
**Acceptance:**
- Heart-tap triggers a pause + weave bloom (reuses T9 bloom) + a name field.
- Naming persists to the collection (T3) and appears on the before/after lineage
  card (T11).
- Ceremony respects reduced-motion.
- The saved sett + name survive reload.

---

## Phase 6 — Native (David + Xcode)

The native wrap and everything that needs a device. Full punch list in
`docs/NATIVE-CHECKLIST.md`.

### T18 · Capacitor iOS project init + WKWebView wrap on Team 9BKHLSZVGF · `native` · M · owner: david+subagent · depends: T0
**Goal:** A native iOS shell running the web build in WKWebView, buildable in Xcode
on David's existing pipeline.
**Acceptance:**
- `capacitor.config.ts` + `ios/` generated; `app/src` static build loads in the
  WKWebView and the breeder is fully playable.
- Bundle id + signing on Apple Team `9BKHLSZVGF` (photoMerge/Clapper pipeline).
- App launches on a device/simulator; 60fps birth event and audio verified on
  device.
- Native capability shim wired so web no-ops become real plugins.

> **Keystone.** Unblocks T5, T13, T19, T20, T21, T22 — nearly every native and
> risk-gated task waits on this.

### T5 · Universal Links / associated domains + AASA + appUrlOpen wiring · `native` · M · owner: david+subagent · depends: T4, T18
**Goal:** The installed iOS app resolves the same replay URL natively (App Clip
added later).
**Acceptance:**
- `apple-app-site-association` hosted on the registered domain (tartanism.app or
  chosen host).
- Associated Domains entitlement configured; `@capacitor/app` `appUrlOpen` routes
  the URL into `deeplink.parse`.
- Opening a share link on a device with the app installed reconstructs the litter
  in-app (verified on device).

### T19 · StoreKit 2 one-time IAP for Pro (removes watermark + HD + full library) · `native` · L · owner: david+subagent · depends: T12, T18
**Goal:** Monetize at the moment of reaching to save a loved sett — a one-time
purchase, not a subscription.
**Acceptance:**
- StoreKit 2 non-consumable product configured; purchase + restore flow works.
- Purchase sets the Pro entitlement flag (T3 KV) that T12/T13 read to drop the
  watermark and unlock HD + full library.
- Paywall surfaces at the save/export reach moment, never on breeding or Wild.
- Sandbox-tested purchase + restore on device.

### T21 · Save-to-Photos + native share sheet (Capacitor plugins) · `native` · M · owner: david+subagent · depends: T13, T18
**Goal:** Export lands in Photos and the OS share sheet for one-tap posting to
TikTok/Reels/CapCut.
**Acceptance:**
- PNG and MP4 save to Photos via a native plugin.
- `@capacitor/share` opens the OS share sheet with the exported file.
- Web build no-ops the native calls cleanly for browser dev.
- Verified on device.

### T20 · App Clip target resolving the same replay URL (additive to web fallback) · `native` · L · owner: david-gated · depends: T5, T18
**Goal:** Users without the app can open a share link into a one-tap breed-from App
Clip.
**Acceptance:**
- App Clip target added; resolves the same Universal Link replay URL as the full
  app.
- App Clip loads the litter and supports one Breed-from tap + install CTA.
- App Clip invocation URL stays within Apple size limits (T1 payload budget).
- Verified via TestFlight App Clip invocation.

---

## Phase 7 — Ship (design + ops)

### T14 · Define + produce the ONE App Store hero screenshot from the share frame · `design` · S · owner: david+subagent · depends: T11
**Goal:** A single human-legible hero image (before/after or daily-result card)
that sells the app.
**Acceptance:**
- Hero derived from the T11 crown-card before/after template.
- Reads as legible transformation at App Store thumbnail size (not an abstract
  plaid swatch).
- Design sign-off from David.
- Exported at required App Store dimensions.

### T22 · TestFlight + App Store submission on Team 9BKHLSZVGF · `ops` · M · owner: david+subagent · depends: T18, T19, T21, T14
**Goal:** Ship v1 to TestFlight then the App Store.
**Acceptance:**
- Archive builds and uploads to App Store Connect on Team `9BKHLSZVGF`.
- Hero screenshot (T14) + metadata + privacy nutrition label complete.
- TestFlight build installs and passes a smoke pass of the core loop + share.
- App Store review submitted.

---

## Phase 8 — v1.5 (retention & backend)

Deferred past v1. The shared gallery is the only backend commitment.

### T8 · Shared comparative gallery — revive Supabase with a lean anon `daily_entries` table · `backend` · M · owner: david+subagent · depends: T1, T6
**Goal:** Let players see what others bred for today's prompt, storing genomes (not
images) rendered client-side.
**Acceptance:**
- New migration adds `daily_entries(prompt_date, genome_json, anon_device_id,
  created_at)` — NOT the heavy patterns/image schema.
- RLS: rate-limited public insert + public read; no auth required, no image
  storage/egress.
- Client submits its genome descriptor and renders others' entries locally from
  threadcounts.
- Falls back cleanly to local-only if the backend is unreachable.

### T23 · Discovery-rarity collection: flag rare gene clusters / first-to-breed / deep-lineage · `web` · M · owner: subagent-autonomous · depends: T3
**Goal:** Give a reason to breed past your favorite and fight entropy-death of the
collection.
**Acceptance:**
- Rarity signals computed locally from lineage + genome stats (rare gene clusters,
  deep-lineage depth, first-to-breed markers).
- Rare finds surface a distinct collection state/badge.
- No backend required for local rarity (shared first-to-breed can layer on T8
  later).
- Tests assert rarity flags fire on constructed rare/common cases.

### T24 · Dial split: CULTIVATE (calm) vs WILD (chaotic) — audio + pacing + copy · `web` · M · owner: subagent-autonomous · depends: T10, T15
**Goal:** Two felt modes over the existing wildness dial with distinct audio,
pacing, and copy.
**Acceptance:**
- Low dial = meditative pacing + calm audio + cultivate copy; high dial = faster,
  brighter, chaotic audio + wild copy.
- Reuses the T10 audio + T9 birth pacing parameterized by wildness.
- Mode transition is smooth and persists as a preference.
- No change to the underlying GA determinism.

---

## Dependency graph (at a glance)

```
T0 ─┬─ T1 ─┬─ T2 ─┬─ T4 ── T12 ── T19
    │      │      │         │      (native)
    │      │      └──────── (with T2)
    │      ├─ T3 ─┬─ T7 (with T6)
    │      │      ├─ T11 ─┬─ T12
    │      │      │       ├─ T13 (with T18)  ← Risk #1
    │      │      │       ├─ T14
    │      │      │       └─ T17 (with T9)
    │      │      └─ T23
    │      ├─ T6 ─┬─ T7
    │      │      └─ T8 (native/backend)
    │      └─ T16
    ├─ T9 ─┬─ T10 ── T24 (with T15)
    │      └─ T17 (with T3, T11)
    ├─ T15 ── T24
    └─ T18 ─┬─ T5 (with T4) ── T20 (with T18)
            ├─ T13 · T19 · T21
            └─ T22 (with T19, T21, T14)
```

## Web / native gating summary

- **Buildable now, no Xcode (subagent-autonomous):** T0, T1, T2, T3, T4, T6, T7,
  T9, T10, T11, T12, T15, T16, T17, T23, T24.
- **Native (David + Xcode):** T5, T13*, T18, T19, T20, T21, T22, T8 (backend).
- **Design:** T14.

`*` T13's web-side encode logic is autonomous; only the on-device VideoToolbox
verification is native — and that verification is the gate on the whole
MP4/green-screen thesis (Risk #1).
