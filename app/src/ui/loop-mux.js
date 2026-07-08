/*
 * ui/loop-mux.js — browser muxer adapter for the T13 loop export.
 *
 * encodeLoopMp4() (loop-export.js) takes a muxerFactory({width,height,mux}) that
 * returns { addVideoChunk(chunk, meta), finalize() → Uint8Array }. This adapts the
 * real MP4 muxer to that shape. The spike (spike-loop-export/) proved the pipeline
 * with `mp4-muxer`; production prefers **Mediabunny** (ESM, Vite-bundled). We try,
 * in order: an ESM `mp4-muxer` import, then a `window.Mp4Muxer` UMD global.
 *
 * REMAINING WIRING STEP (documented, David/build-gated): the muxer package isn't
 * a dependency yet — `pnpm add mp4-muxer` (or mediabunny) in app/, respecting the
 * project's minimumReleaseAge:1440. Until then browserMuxerFactory() throws a
 * clear, catchable error and the UI toasts the one-line fix. The WebCodecs encode
 * logic itself is complete and unit-tested with a fake muxer.
 */

// returns a muxerFactory bound to whichever muxer implementation is available,
// or throws MUXER_UNAVAILABLE (caught by the UI → actionable toast).
export async function resolveBrowserMuxerFactory() {
  // 1) ESM mp4-muxer (present once added to app/ deps). Specifier kept non-literal
  //    so the bundler leaves it opaque until the package actually exists.
  try {
    const pkg = ['mp4', 'muxer'].join('-');
    const mod = await import(/* @vite-ignore */ pkg);
    const Muxer = mod.Muxer || (mod.default && mod.default.Muxer);
    const ArrayBufferTarget = mod.ArrayBufferTarget || (mod.default && mod.default.ArrayBufferTarget);
    if (Muxer && ArrayBufferTarget) return mp4MuxerFactory(Muxer, ArrayBufferTarget);
  } catch (_) { /* not installed — try the UMD global */ }

  // 2) window.Mp4Muxer UMD global (script-tag injected — the spike's path)
  if (typeof window !== 'undefined' && window.Mp4Muxer && window.Mp4Muxer.Muxer) {
    return mp4MuxerFactory(window.Mp4Muxer.Muxer, window.Mp4Muxer.ArrayBufferTarget);
  }

  throw Object.assign(
    new Error('MUXER_UNAVAILABLE: add mp4-muxer (or mediabunny) to app/ deps to enable MP4 export'),
    { code: 'MUXER_UNAVAILABLE' },
  );
}

function mp4MuxerFactory(Muxer, ArrayBufferTarget) {
  return ({ width, height, mux }) => {
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: { codec: mux, width, height },
      fastStart: 'in-memory',           // moov up front → streamable / social-import friendly
    });
    return {
      addVideoChunk: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      finalize: () => { muxer.finalize(); return new Uint8Array(target.buffer); },
    };
  };
}
