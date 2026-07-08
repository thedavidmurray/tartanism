/*
 * native/loop-encoder.js — T13 native fallback bridge (Capacitor plugin `LoopEncoder`).
 *
 * The WebCodecs path (../ui/loop-export.js) is primary. On any iOS build old
 * enough to lack WebCodecs `VideoEncoder` in WKWebView (pre-Safari-16.4 engine,
 * or a config the WebView refuses), exportLoop() returns a native-fallback
 * descriptor and the app calls THIS bridge, which forwards frames to a native
 * `AVAssetWriter` H.264 encoder (hardware VideoToolbox, same silicon path).
 *
 * This file is the JS half + a WEB STUB. The native Swift half is specced/stubbed
 * in ios-native/LoopEncoderPlugin.swift and docs/NATIVE-LOOP-ENCODER-SPEC.md.
 * On web (no Capacitor / no native plugin) every call rejects with a clear,
 * catchable NOT_IMPLEMENTED error so callers fall through gracefully.
 *
 * Contract (mirrors AVAssetWriter's begin → append → finish lifecycle):
 *   begin({ width, height, fps, bitrate })      → { sessionId }
 *   appendFrame({ sessionId, index, pngBase64 }) → { accepted: index }
 *   finish({ sessionId })                        → { path, bytes }   // file:// MP4 in tmp
 *   abort({ sessionId })                         → {}
 *
 * The app drives it exactly like the WebCodecs loop: render frames 0..N-1 (frame
 * N == frame 0 → seamless), append each as a PNG, finish → a looping MP4 file the
 * @capacitor/share sheet / save-to-Photos (T21) can hand to TikTok/CapCut.
 */

const PLUGIN_NAME = 'LoopEncoder';

// resolve the Capacitor plugin proxy if we're inside a native shell; else null.
function nativePlugin() {
  const cap = (typeof window !== 'undefined' && window.Capacitor) || null;
  if (!cap) return null;
  const isNative = typeof cap.isNativePlatform === 'function'
    ? cap.isNativePlatform()
    : !!cap.isNative;
  if (!isNative) return null;
  const plugin = cap.Plugins && cap.Plugins[PLUGIN_NAME];
  return plugin || null;
}

export function isNativeLoopEncoderAvailable() {
  return !!nativePlugin();
}

const notImpl = (fn) => Promise.reject(
  Object.assign(new Error(`LoopEncoder.${fn}: NOT_IMPLEMENTED (web/no-native)`), { code: 'NOT_IMPLEMENTED' }),
);

export const LoopEncoder = {
  begin(opts) { const p = nativePlugin(); return p ? p.begin(opts) : notImpl('begin'); },
  appendFrame(opts) { const p = nativePlugin(); return p ? p.appendFrame(opts) : notImpl('appendFrame'); },
  finish(opts) { const p = nativePlugin(); return p ? p.finish(opts) : notImpl('finish'); },
  abort(opts) { const p = nativePlugin(); return p ? p.abort(opts) : notImpl('abort'); },
};

/*
 * encodeLoopNative — drive the native plugin frame-by-frame from a canvas.
 * Symmetric with encodeLoopMp4 (WebCodecs). `renderFrame(i)` must paint frame i
 * onto the shared canvas; `canvasToPngBase64(canvas)` extracts a PNG (base64, no
 * data: prefix). Encodes frames 0..totalFrames-1 for a perfect loop.
 *
 * Returns { ok, path, bytes, framesEncoded } | { ok:false, stage, reason }.
 */
export async function encodeLoopNative(spec, { canvas, renderFrame, canvasToPngBase64 } = {}) {
  const p = nativePlugin();
  if (!p) return { ok: false, stage: 'probe', reason: 'native LoopEncoder unavailable' };
  if (!canvas || typeof renderFrame !== 'function' || typeof canvasToPngBase64 !== 'function') {
    return { ok: false, stage: 'source', reason: 'canvas/renderFrame/canvasToPngBase64 required' };
  }
  const { width, height, fps, bitrate, totalFrames } = spec;
  let sessionId;
  try {
    ({ sessionId } = await p.begin({ width, height, fps, bitrate }));
    for (let i = 0; i < totalFrames; i++) {
      renderFrame(i);
      const pngBase64 = await canvasToPngBase64(canvas);
      await p.appendFrame({ sessionId, index: i, pngBase64 });
    }
    const { path, bytes } = await p.finish({ sessionId });
    return { ok: true, path, bytes, framesEncoded: totalFrames };
  } catch (e) {
    if (sessionId) { try { await p.abort({ sessionId }); } catch (_) { /* best effort */ } }
    return { ok: false, stage: 'encode', reason: String(e && e.message || e) };
  }
}

if (typeof window !== 'undefined') {
  window.TartanismLoopEncoderNative = { LoopEncoder, isNativeLoopEncoderAvailable, encodeLoopNative };
}
