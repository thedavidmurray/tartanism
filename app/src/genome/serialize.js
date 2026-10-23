/*
 * genome/serialize.js — canonical records + the compact shareable codec.
 *
 * A litter is a PURE DETERMINISTIC FUNCTION of (kind, seed, size, wildness,
 * parentGenomes). So the shared/persisted unit is NOT nine rendered images — it
 * is a tiny version-tagged descriptor. The `threadcount` string is the canonical
 * compact genome; a parent is carried as its threadcount, nothing more.
 *
 *   Genome (a KEPT individual, persisted as-is by the store):
 *     { v, threadcount, seed, parents:[ids], strategy, gen, wildness, weave,
 *       threadPx, motion }        // produced by engine/game.js finalize()
 *
 *   LitterDescriptor (the shareable/replayable unit):
 *     { v:1, kind:'wild'|'bred', seed:uint32, size,
 *       wildness?:float, parents?:[threadcountString],
 *       pin?:{ gene, source:threadcountString } }   // active trait-pin (T16)
 *
 * encodeLitter(descriptor) -> base64url payload (no padding, URL-fragment safe)
 * decodeLitter(payload)    -> descriptor  (never throws on an unknown version)
 *
 * Zero dependencies; runs identically in Node (Buffer) and the browser (btoa).
 */

export const SCHEMA_VERSION = 1;

// ---- base64url (RFC 4648 §5), no padding, cross-environment --------------
function b64urlEncode(str) {
  const b64 = (typeof Buffer !== 'undefined')
    ? Buffer.from(str, 'utf8').toString('base64')
    : btoa(unescape(encodeURIComponent(str)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(payload) {
  const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  return (typeof Buffer !== 'undefined')
    ? Buffer.from(b64, 'base64').toString('utf8')
    : decodeURIComponent(escape(atob(b64)));
}

// ---- descriptor builders (the seed-CAPTURE point) ------------------------
// The concrete integer seed actually used at generation time MUST be threaded
// in here — never a date-derived value (see the app.js Math.random bug).
// The active trait-pin is part of the generation inputs too: a pin-active
// litter is a function of (kind, seed, size, wildness, parents, pin), so the
// pin must be captured or replay diverges. Stored compactly as the pinned
// gene + the source sett's threadcount (the canonical lossless genome).
function pinRecord(pin) {
  if (!pin || !pin.gene || !pin.source) return undefined;
  const source = typeof pin.source === 'string' ? pin.source : pin.source.threadcount;
  return source ? { gene: pin.gene, source } : undefined;
}

export function wildDescriptor(seed, size = 9, pin = null) {
  const d = { v: SCHEMA_VERSION, kind: 'wild', seed: seed >>> 0, size };
  const p = pinRecord(pin);
  if (p) d.pin = p;
  return d;
}

export function bredDescriptor(parentThreadcounts, { seed, size = 9, wildness, pin } = {}) {
  const d = {
    v: SCHEMA_VERSION,
    kind: 'bred',
    seed: seed >>> 0,
    size,
    parents: parentThreadcounts.slice(),
  };
  if (wildness !== undefined) d.wildness = wildness;
  const p = pinRecord(pin);
  if (p) d.pin = p;
  return d;
}

// ---- codec ---------------------------------------------------------------
export function encodeLitter(descriptor) {
  return b64urlEncode(JSON.stringify(descriptor));
}

export function decodeLitter(payload) {
  // Only a genuinely malformed payload (bad base64 / bad JSON) throws; an
  // unknown SCHEMA version is returned intact so callers can upgrade/reject.
  const descriptor = JSON.parse(b64urlDecode(payload));
  return descriptor;
}

export function isSupported(descriptor) {
  return !!descriptor && descriptor.v === SCHEMA_VERSION;
}
