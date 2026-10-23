/*
 * store/kv.js — small key/value shim for the flag/settings tier: streak
 * counters, today's daily-state, settings, the Pro entitlement flag.
 *
 * Backend, chosen automatically, same async API in all:
 *   • Browser dev / WKWebView → localStorage.
 *   • Native (later)          → swap in @capacitor/preferences here; the
 *                               capability shim keeps callers unchanged.
 *   • Node / CI               → an in-process registry keyed by namespace, so
 *                               a fresh createKV() reads the same values
 *                               (simulated reload for the test harness).
 *
 * Values are JSON-serialised, so numbers / booleans / objects round-trip.
 */

const _registry = new Map(); // namespace -> Map<key, serialized>

function memStore(ns) {
  let m = _registry.get(ns);
  if (!m) { m = new Map(); _registry.set(ns, m); }
  return m;
}

export function createKV({ namespace = 'tartanism' } = {}) {
  const hasLS = typeof localStorage !== 'undefined';
  const key = (k) => `${namespace}:${k}`;

  return {
    async set(k, value) {
      const s = JSON.stringify(value);
      if (hasLS) localStorage.setItem(key(k), s);
      else memStore(namespace).set(k, s);
    },
    async get(k, fallback = undefined) {
      const raw = hasLS ? localStorage.getItem(key(k)) : memStore(namespace).get(k);
      if (raw === null || raw === undefined) return fallback;
      try { return JSON.parse(raw); } catch { return fallback; }
    },
    async remove(k) {
      if (hasLS) localStorage.removeItem(key(k));
      else memStore(namespace).delete(k);
    },
  };
}

export const _internal = { _registry };
