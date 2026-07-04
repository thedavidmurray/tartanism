/*
 * daily/streak.js — T7: the daily-return reward loop.
 *
 * A visible streak counter persisted via the foundation's KV shim
 * (store/kv.js). Engagement with today's prompt increments the streak once per
 * local calendar day; consecutive days build the count; a missed day breaks it.
 *
 * State shape (stored under one KV key): { count, lastDay } where lastDay is a
 * "YYYY-MM-DD" key. No backend — survives reload because createKV reads the
 * same namespace back (localStorage / Capacitor Preferences / CI registry).
 *
 * Break rule: the streak is alive if the last engaged day is today or
 * yesterday. Engaging on a consecutive day increments; engaging after a gap
 * (or for the first time) resets the count to 1. `current()` reports the
 * effective streak WITHOUT recording — 0 once broken — so the UI can show the
 * live number before the player taps in.
 */

import { dateKey } from './prompt.js';

const KEY = 'streak';
const EMPTY = { count: 0, lastDay: null };

// The calendar day immediately before a "YYYY-MM-DD" key. Parsed as UTC noon so
// the ±hour never crosses a day boundary regardless of host timezone.
function previousDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d, 12) - 24 * 3600 * 1000;
  const p = new Date(t);
  const py = p.getUTCFullYear();
  const pm = String(p.getUTCMonth() + 1).padStart(2, '0');
  const pd = String(p.getUTCDate()).padStart(2, '0');
  return `${py}-${pm}-${pd}`;
}

/**
 * Bind a streak controller to a KV instance.
 * @param {{get:Function,set:Function}} kv — from createKV()
 */
export function createStreak(kv) {
  async function load() {
    return await kv.get(KEY, EMPTY);
  }

  return {
    /** Raw persisted state: { count, lastDay }. */
    async raw() {
      return await load();
    },

    /**
     * Effective streak as of `date` WITHOUT recording engagement.
     * Alive (last day is today or yesterday) → stored count; else 0 (broken).
     */
    async current(date = new Date()) {
      const today = dateKey(date);
      const { count, lastDay } = await load();
      if (!lastDay) return 0;
      if (lastDay === today || lastDay === previousDayKey(today)) return count;
      return 0;
    },

    /**
     * Record engagement with today's prompt. Idempotent within a calendar day.
     * @returns {Promise<number>} the streak count after recording.
     */
    async record(date = new Date()) {
      const today = dateKey(date);
      const { count, lastDay } = await load();

      let next;
      if (lastDay === today) {
        next = count;                     // already counted today — no-op
      } else if (lastDay === previousDayKey(today)) {
        next = count + 1;                 // consecutive day — extend
      } else {
        next = 1;                         // first ever, or a gap — (re)start
      }

      await kv.set(KEY, { count: next, lastDay: today });
      return next;
    },
  };
}
