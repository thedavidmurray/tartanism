/*
 * daily/prompt.js — T6: the exogenous-novelty clock.
 *
 * A date-seeded, deterministic daily AESTHETIC prompt. Everyone on a given
 * local calendar date gets the SAME prompt, computed offline from the date
 * with zero network. It is a taste constraint ("dusk · 3 colors · thin
 * rhythm"), browsable and interpreted by eye — it is NOT fidelity-scored and
 * imposes no correctness gate on the player's litter.
 *
 * Three independent axes, each drawn from a curated word pool grounded in the
 * engine's palette moods and tartan structure vocabulary:
 *   • LIGHT   — the light/mood of the day
 *   • COLORS  — how many colours the sett may spend
 *   • RHYTHM  — the stripe cadence of the weave
 *
 * Determinism: an FNV-1a hash of the date key seeds three decorrelated indices
 * (one per axis via distinct salts), so the axes vary independently across
 * dates while a given date always maps to exactly one prompt.
 */

// Curated pools (David-approved aesthetic vocabulary; matches the brief's
// "dusk · 3 colors · thin rhythm" shape). Order is load-bearing for
// determinism — appending is safe, reordering changes historical prompts.
export const POOLS = {
  light: [
    'dawn', 'dusk', 'midnight', 'overcast', 'high noon', 'gloaming',
    'first light', 'storm light', 'candlelit', 'frostbitten', 'low sun',
    'moonwash', 'harvest light', 'blue hour', 'ember glow', 'sea fog',
  ],
  colors: [
    'monochrome', '2 colors', '3 colors', '4 colors', '5 colors',
  ],
  rhythm: [
    'thin rhythm', 'thick rhythm', 'even rhythm', 'syncopated rhythm',
    'dense rhythm', 'sparse rhythm', 'wide rhythm', 'restless rhythm',
    'slow rhythm', 'staccato rhythm',
  ],
};

const AXES = ['light', 'colors', 'rhythm'];

// FNV-1a (32-bit), unsigned. Deterministic, dependency-free.
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // h *= 16777619, kept in 32-bit unsigned space
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/**
 * Local calendar-date key "YYYY-MM-DD". Accepts a Date, a "YYYY-MM-DD" string
 * (returned as-is after validation), or nothing (→ today, local time).
 */
export function dateKey(dateOrString = new Date()) {
  if (typeof dateOrString === 'string') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOrString)) {
      throw new Error(`dateKey: expected "YYYY-MM-DD", got "${dateOrString}"`);
    }
    return dateOrString;
  }
  const d = dateOrString;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * The deterministic daily prompt for a date.
 * @returns {{date:string, text:string, seed:number, parts:{light:string,colors:string,rhythm:string}}}
 */
export function dailyPrompt(dateOrString = new Date()) {
  const date = dateKey(dateOrString);
  const seed = fnv1a(date);

  const parts = {};
  for (const axis of AXES) {
    // Decorrelate axes with a per-axis salt so they move independently.
    const h = fnv1a(`${axis}:${date}`);
    const pool = POOLS[axis];
    parts[axis] = pool[h % pool.length];
  }

  const text = AXES.map((a) => parts[a]).join(' · ');
  return { date, text, seed, parts };
}
