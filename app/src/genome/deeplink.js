/*
 * genome/deeplink.js — #g=<payload> → ready-to-breed litter.
 *
 * Decouples the PAYLOAD + web reconstruction (works today in mobile Safari)
 * from the native App-Clip / Universal-Link wrapper (added later). On load the
 * web app decodes the fragment, reconstructs the EXACT litter deterministically,
 * and hands the UI a litter whose first tap is Breed-from — killing typed-seed
 * friction for a shared link.
 */
import { decodeLitter, encodeLitter, isSupported } from './serialize.js';
import { reconstructLitter } from './replay.js';

// Accepts a raw hash ("#g=..." / "g=..."), a full URL's hash, or (in browser)
// nothing → reads location.hash.
export function parseHash(hash) {
  const h = hash !== undefined
    ? hash
    : (typeof location !== 'undefined' ? location.hash : '');
  if (!h) return null;

  const m = /[#&?]?g=([A-Za-z0-9_-]+)/.exec(h);
  if (!m) return null;

  let descriptor;
  try {
    descriptor = decodeLitter(m[1]);
  } catch {
    return null;                 // malformed payload → treat as no deep link
  }
  if (!isSupported(descriptor)) return null;   // version safety

  let litter;
  try {
    litter = reconstructLitter(descriptor);
  } catch {
    return null;
  }
  return { descriptor, litter };
}

export function buildHash(descriptor) {
  return '#g=' + encodeLitter(descriptor);
}

// Consume the current location's deep link once (browser convenience). Returns
// { descriptor, litter } or null; optionally clears the hash so a reload/keep
// doesn't re-trigger the import.
export function consumeLocationHash({ clear = false } = {}) {
  const res = parseHash();
  if (res && clear && typeof history !== 'undefined' && typeof location !== 'undefined') {
    history.replaceState(null, '', location.pathname + location.search);
  }
  return res;
}
