# DEEPLINK-SPEC — share → open equivalence

Decouples the **payload + web reconstruction** (works today, mobile Safari) from
the native App-Clip / Universal-Link **wrapper** (added later, David + Xcode).

## Wire format

```
https://tartanism.app/b#g=<base64url(LitterDescriptor)>
```

Payload lives in the URL **fragment** (`#g=`) — never sent to a server, and under
the invocation length budget. See `GENOME-SPEC.md` for the descriptor + codec.

## Web path (now) — `genome/deeplink.js`

- `parseHash(hash?)` — accepts `#g=...`, `g=...`, or a full URL's `.hash`; in the
  browser, defaults to `location.hash`. Returns `{ descriptor, litter }` or
  `null`. Robust to junk / missing / malformed / unknown-version payloads (never
  throws; returns `null`).
- `buildHash(descriptor)` → `#g=<payload>`.
- `consumeLocationHash({clear})` — reads the current deep link once and, with
  `clear:true`, strips the fragment via `history.replaceState` so a reload/keep
  doesn't re-import.

On boot the UI reconstructs the sharer's **exact** litter and lands the viewer
ready to **Breed-from** on the first tap — killing typed-seed friction.
Verified end-to-end in a real browser: a pasted `#g=` reproduces byte-identical
threadcounts + ids (`AM/23 EM3 … / s6pbsf`).

## Boot precedence (`ui/app.js`)

1. **Deep link** (`#g=`) wins → reconstruct + persist as last-litter.
2. else **persisted last-litter** descriptor → reconstruct.
3. else fresh **wild**.
The kept collection is always rehydrated from IndexedDB first.

## Native path (later — additive, not blocking)

- Universal Links: associated domains + `apple-app-site-association` → installed
  app resolves the same URL via `@capacitor/app` `appUrlOpen`.
- App Clip target resolves the **same** URL for users without the app. App Clips
  **require** a native target (cannot be pure web) — hence web fallback ships now;
  the App Clip is purely additive.
