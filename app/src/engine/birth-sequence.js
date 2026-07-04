/*
 * engine/birth-sequence.js — the BIRTH EVENT, as a PURE, DOM-free state machine.
 *
 * BREED (and WILD, and idle life) all trigger ONE sequence:
 *
 *   CHARGE  (~600ms) — selected parents lift/scale, rising-pitch hum.
 *   IMPACT           — one hard hit-pause freeze + short screenshake + bass thunk.
 *   HATCH            — the N offspring appear STAGGERED ~35ms apart with a
 *                      scale-overshoot + particle puff each; the child that
 *                      inherits most strongly from the top-picked parent GLOWS.
 *   DONE
 *
 * Everything here is deterministic and side-effect-free so it is unit-testable
 * under `node --test`:
 *   - planSequence()      builds the timeline (event list + total duration).
 *   - buildBirth()        the ONE trigger-agnostic entry BREED and WILD share.
 *   - topInheritorIndex() picks the glow target off the genome (not pixels).
 *   - createBirthDriver() a clock-injected RAF runner that is re-entrant-safe
 *                         (a new Breed mid-animation cancels the old one cleanly).
 *
 * `prefers-reduced-motion` collapses the whole thing to an INSTANT reveal with a
 * soft confirmation — no hit-pause, no shake, no staggered long timers.
 *
 * The DOM/particle/audio side-effects live in ui/birth-event.js + audio/sfx.js;
 * they consume the plan this module produces.
 */

import { hsl, circHueDist, meanHue, proportionSignature } from './game.js';

// ---------------------------------------------------------------------------
// Phase durations (ms). Tuned for weight, not spectacle — the juice is timing.
// ---------------------------------------------------------------------------
export const DUR = Object.freeze({
  charge: 600,        // anticipation: parents lift + rising hum
  impactHold: 120,    // the one hard hit-pause freeze
  hatchStagger: 35,   // gap between each offspring hatching
  hatchSettle: 220,   // per-cell scale-overshoot settle (tail of the sequence)
  shake: 150,         // screenshake decay window
  reducedConfirm: 0,  // reduced-motion soft confirm fires at t=0
});

export const PHASES = Object.freeze(['charge', 'impact', 'hatch', 'done']);

// ---------------------------------------------------------------------------
// planSequence — the timeline. Returns { reducedMotion, hitPause, shake,
// totalDuration, events[] }, events sorted ascending by `at` (ms from start).
// ---------------------------------------------------------------------------
export function planSequence({ reducedMotion = false, size = 9, hitPause = true, shake = true } = {}) {
  const n = Math.max(1, size | 0);

  if (reducedMotion) {
    // instant reveal + a single soft confirmation. NO hit-pause, NO shake, and
    // no long timers: every event lands at t=0 so the litter is visible now.
    const events = [
      { at: 0, phase: 'reveal', type: 'reveal-all' },
      { at: DUR.reducedConfirm, phase: 'confirm', type: 'confirm' },
    ];
    return { reducedMotion: true, hitPause: false, shake: false, size: n, totalDuration: 0, events };
  }

  const events = [];
  events.push({ at: 0, phase: 'charge', type: 'charge' });

  const impactAt = DUR.charge;
  events.push({ at: impactAt, phase: 'impact', type: 'impact', hitPause, shake });

  const hatchStart = impactAt + (hitPause ? DUR.impactHold : 0);
  for (let i = 0; i < n; i++) {
    events.push({ at: hatchStart + i * DUR.hatchStagger, phase: 'hatch', type: 'hatch', index: i });
  }

  const lastHatch = hatchStart + (n - 1) * DUR.hatchStagger;
  const totalDuration = lastHatch + DUR.hatchSettle;

  events.sort((a, b) => a.at - b.at);
  return { reducedMotion: false, hitPause, shake, size: n, totalDuration, events };
}

// ---------------------------------------------------------------------------
// INHERITANCE score — how strongly a child inherits from a given parent,
// computed off the GENOME (palette overlap + proportion rhythm + hue), never
// off rendered pixels. Deterministic.
// ---------------------------------------------------------------------------
function jaccard(aSet, bSet) {
  let inter = 0;
  for (const x of aSet) if (bSet.has(x)) inter++;
  const uni = aSet.size + bSet.size - inter;
  return uni === 0 ? 0 : inter / uni;
}

function propVec(ind) {
  return proportionSignature(ind.stripes).split(':').map(Number);
}

function propSimilarity(a, b) {
  const va = propVec(a), vb = propVec(b);
  const n = Math.max(va.length, vb.length);
  let d = Math.abs(va.length - vb.length) / n;
  for (let i = 0; i < Math.min(va.length, vb.length); i++) d += Math.abs(va[i] - vb[i]);
  return 1 / (1 + d); // 1 == identical rhythm, →0 as it diverges
}

export function inheritanceScore(child, parent) {
  if (!child || !parent) return 0;
  const colorOverlap = jaccard(new Set(child.colors), new Set(parent.colors));
  const rhythm = propSimilarity(child, parent);
  const hue = 1 - circHueDist(meanHue(child.stripes), meanHue(parent.stripes)) / 180;
  // palette provenance dominates (it is the loudest inherited trait), rhythm and
  // hue break ties.
  return colorOverlap * 0.6 + rhythm * 0.28 + hue * 0.12;
}

// index of the offspring that inherits MOST strongly from the top-picked parent.
// -1 when there is no top parent (e.g. a WILD reroll — nothing to glow toward).
export function topInheritorIndex(litter, topParent) {
  if (!topParent || !litter || litter.length === 0) return -1;
  let best = -1, bestScore = -Infinity;
  for (let i = 0; i < litter.length; i++) {
    const s = inheritanceScore(litter[i], topParent);
    if (s > bestScore) { bestScore = s; best = i; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// buildBirth — the ONE trigger-agnostic entry. BREED passes its top-picked
// parent; WILD passes null. Both get the same plan; only the glow target differs.
// This is the "one code path" both actions share.
// ---------------------------------------------------------------------------
export function buildBirth({ litter, topParent = null, reducedMotion = false } = {}) {
  const size = litter ? litter.length : 9;
  const plan = planSequence({ reducedMotion, size });
  const glowIndex = topInheritorIndex(litter || [], topParent);
  return { plan, glowIndex };
}

// ---------------------------------------------------------------------------
// createBirthDriver — a clock-injected RAF runner. Drives a plan by comparing
// elapsed time against each event's `at`, firing each exactly once. It is
// RE-ENTRANT-SAFE: play() cancels any in-flight run cleanly (a new Breed mid-
// animation supersedes the old sequence — no orphaned callbacks fire).
//
// No setTimeout anywhere: pure elapsed-time diffing off an injected clock, so
// reduced-motion schedules zero long timers and tests run deterministically.
// ---------------------------------------------------------------------------
function defaultNow() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}
function defaultRaf(cb) {
  return (typeof requestAnimationFrame !== 'undefined') ? requestAnimationFrame(cb) : setTimeout(() => cb(defaultNow()), 16);
}
function defaultCancel(id) {
  if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(id);
  else clearTimeout(id);
}

export function createBirthDriver({ now = defaultNow, raf = defaultRaf, cancel = defaultCancel } = {}) {
  let active = null; // the current run's private state object (identity = token)

  function stop() {
    if (active) {
      if (active.rafId != null) cancel(active.rafId);
      active = null;
    }
  }

  function play(plan, { onEvent, onDone } = {}) {
    stop(); // re-entrancy: supersede any running sequence cleanly
    const state = { start: now(), fired: new Set(), rafId: null };
    active = state;

    const tick = () => {
      if (active !== state) return; // superseded → this run is dead, emit nothing
      const t = now() - state.start;
      for (let i = 0; i < plan.events.length; i++) {
        if (!state.fired.has(i) && t >= plan.events[i].at) {
          state.fired.add(i);
          if (onEvent) onEvent(plan.events[i]);
        }
      }
      if (t >= plan.totalDuration) {
        active = null;
        if (onDone) onDone();
        return;
      }
      state.rafId = raf(tick);
    };

    tick();
    return state;
  }

  return {
    play,
    stop,
    get isPlaying() { return active !== null; },
  };
}
