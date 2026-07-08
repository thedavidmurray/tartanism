/*
 * ui/loop-export.js — T13: looping MP4 export via WebCodecs (H.264 / VideoToolbox).
 *
 * The hero share artifact's MOVING half: a drop-in, seamlessly-looping 9:16 MP4
 * (TikTok / Reels / CapCut background) with a baked-in watermark/end-card, encoded
 * on-device through the browser's `VideoEncoder`. On iOS/WKWebView that encoder is
 * backed by hardware **VideoToolbox** H.264 — the codec iOS is strongest at.
 *
 * Design mirrors share-frame.js: a PURE, DOM-free spec (buildLoopSpec) + a frame
 * COMPOSITOR (renderLoopFrame) that reuses the real engine renderer
 * (resolveSett → renderSupertile → drawTartanFrame), + a capability PROBE
 * (probeVideoEncoder) + an ENCODE orchestrator (encodeLoopMp4) + a top-level
 * exportLoop that either encodes on the web path or emits a NATIVE-FALLBACK
 * descriptor pointing at the Capacitor AVAssetWriter plugin (see
 * ../native/loop-encoder.js + docs/NATIVE-LOOP-ENCODER-SPEC.md).
 *
 * SEAM GUARANTEE. The loop is seamless *by construction*: the engine's motion
 * params (pan/breathe/drift) all return each axis's pan offset to its frame-0
 * value at the wrap (see panOffsetForFrame). The watermark band is drawn
 * IDENTICALLY on every frame, so it never breaks the seam. We encode frames
 * 0..N-1 (frame N would reproduce frame 0) → a perfect loop with no duplicate.
 *
 * External encoder/muxer are DEPENDENCY-INJECTED (deps) so this module is unit-
 * testable in node with fakes and swaps cleanly between mp4-muxer and Mediabunny
 * in the browser. The production browser wiring lives in app.js.
 *
 * Zero hard deps. Only touches globals through the injected deps object.
 */
import { resolveSett, renderSupertile, drawTartanFrame, panOffsetForFrame, settPixels } from '../engine/tartanism.js';

// 9:16, 4s @ 30fps — the engine's own loop dimensions.
export const LOOP_W = 1080;
export const LOOP_H = 1920;
export const LOOP_TOTAL_FRAMES = 120;
export const LOOP_FPS = 30;
export const LOOP_BITRATE = 8_000_000;         // 8 Mbps — clean 1080×1920 H.264
export const LOOP_SPEC_VERSION = 1;

// H.264 FIRST (this is what iOS/VideoToolbox accelerates), then non-Apple codecs
// so the SAME code path still produces a valid MP4 on a headless desktop probe.
// `mux` is the codec family string the muxer wants.
export const CODEC_CANDIDATES = [
  { codec: 'avc1.42E01F', mux: 'avc', h264: true },  // H.264 Constrained Baseline L3.1 — most compatible
  { codec: 'avc1.42001F', mux: 'avc', h264: true },  // H.264 Baseline L3.1
  { codec: 'avc1.4D401F', mux: 'avc', h264: true },  // H.264 Main L3.1
  { codec: 'vp09.00.10.08', mux: 'vp9', h264: false }, // VP9 (desktop-only fallback)
  { codec: 'av01.0.04M.08', mux: 'av1', h264: false }, // AV1 (desktop-only fallback)
  { codec: 'vp8', mux: 'vp8', h264: false },           // VP8 (last resort)
];

// ---------------------------------------------------------------------------
// PROBE — is a real `VideoEncoder` available, and is it H.264/VideoToolbox?
//
// ACCEPTANCE #2: "On-device test confirms VideoEncoder/VideoToolbox is available
// in WKWebView." On WebKit/iOS a supported `avc1.*` config IS hardware
// VideoToolbox H.264 — WebKit has no software H.264 encoder, so an accepted
// avc1 config on an Apple-WebKit UA is a positive VideoToolbox signal.
//
// Injectable: pass { VideoEncoderImpl, userAgent } for tests / non-browser.
// Returns: { supported, codec, mux, h264, videoToolbox, isAppleWebKit, reason,
//            candidates: [{codec, supported}] }
// ---------------------------------------------------------------------------
export function isAppleWebKitUA(ua) {
  if (!ua) return false;
  // Safari / WKWebView: AppleWebKit present, and NOT Chrome/Chromium/Edge/Firefox.
  return /AppleWebKit/.test(ua) && !/(Chrome|Chromium|CriOS|Edg|Android|Firefox|FxiOS)/.test(ua);
}

export async function probeVideoEncoder(opts = {}) {
  const VE = opts.VideoEncoderImpl
    || (typeof VideoEncoder !== 'undefined' ? VideoEncoder : undefined);
  const ua = opts.userAgent
    || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const isAppleWebKit = isAppleWebKitUA(ua);

  if (typeof VE === 'undefined' || !VE || typeof VE.isConfigSupported !== 'function') {
    return {
      supported: false, codec: null, mux: null, h264: false,
      videoToolbox: false, isAppleWebKit, reason: 'no VideoEncoder',
      candidates: [],
    };
  }

  const candidates = [];
  let chosen = null;
  for (const cand of CODEC_CANDIDATES) {
    let ok = false;
    try {
      const r = await VE.isConfigSupported({
        codec: cand.codec, width: LOOP_W, height: LOOP_H,
        bitrate: LOOP_BITRATE, framerate: LOOP_FPS,
      });
      ok = !!(r && r.supported);
    } catch (_) { ok = false; }
    candidates.push({ codec: cand.codec, supported: ok });
    if (ok && !chosen) chosen = cand;    // first supported wins → H.264 preferred
  }

  if (!chosen) {
    return {
      supported: false, codec: null, mux: null, h264: false,
      videoToolbox: false, isAppleWebKit, reason: 'no candidate codec supported',
      candidates,
    };
  }
  return {
    supported: true,
    codec: chosen.codec,
    mux: chosen.mux,
    h264: chosen.h264,
    // VideoToolbox = a hardware-accelerated H.264 encode accepted on Apple WebKit.
    videoToolbox: chosen.h264 && isAppleWebKit,
    isAppleWebKit,
    reason: null,
    candidates,
  };
}

// ---------------------------------------------------------------------------
// PURE SPEC — DOM-free description of the loop to encode. Deterministic.
// Carries the resolved render cfg (resolveSett is pure — it only parses the
// threadcount + weave) plus the watermark/end-card content.
// ---------------------------------------------------------------------------
function genomeFace(ind) {
  return {
    id: ind.id,
    name: ind.name || null,
    threadcount: ind.threadcount,
    weave: ind.weave || 'twill-2-2',
    threadPx: ind.threadPx || 3,
    motion: ind.motion || { type: 'pan', speed: 1, direction: { dx: 1, dy: 1 }, intensity: 0 },
    gen: ind.gen || 0,
  };
}

export function buildLoopSpec({ genome, wordmark = 'Tartanism', link, name = null } = {}) {
  if (!genome || !genome.threadcount) throw new Error('buildLoopSpec: genome with threadcount required');
  const face = genomeFace(genome);
  const cfg = resolveSett({ ...face, name: face.name || face.id, id: face.id });
  return {
    v: LOOP_SPEC_VERSION,
    width: LOOP_W,
    height: LOOP_H,
    totalFrames: cfg.totalFrames || LOOP_TOTAL_FRAMES,
    fps: cfg.fps || LOOP_FPS,
    bitrate: LOOP_BITRATE,
    genome: face,
    cfg,                                   // resolved render config (DOM-free)
    name: name || face.name || null,
    watermark: {
      present: true,                       // ACCEPTANCE #4 — always baked (free-growth end-card)
      wordmark,
      link: link || 'https://tartanism.app',
      tappable: true,
    },
  };
}

// ---------------------------------------------------------------------------
// WATERMARK / END-CARD — baked identically into EVERY frame (seam-safe).
// A persistent lower-third band: wordmark + "tap to breed →" call-to-action.
// Drawn with the same visual language as the still share-frame end-card.
// ---------------------------------------------------------------------------
const WM_INK = '#0a0a0b', WM_PANEL = 'rgba(18,18,20,0.82)', WM_TEXT = '#ededf0';
const WM_DIM = '#8a8a90', WM_ACCENT = '#e8ff59';

export function drawWatermarkBand(ctx, spec) {
  const wm = spec.watermark;
  if (!wm || !wm.present) return;
  const W = spec.width, H = spec.height;
  const bandH = Math.round(H * 0.072);          // ~138px on 1920
  const bandY = H - bandH - Math.round(H * 0.045); // sit above the safe-area gutter
  const pad = Math.round(W * 0.055);
  ctx.save();
  // soft scrim so the band reads over any tartan
  ctx.fillStyle = WM_PANEL;
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(pad, bandY, W - pad * 2, bandH, bandH / 2); ctx.fill(); }
  else ctx.fillRect(pad, bandY, W - pad * 2, bandH);
  // wordmark (left)
  const cy = bandY + bandH / 2;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = WM_TEXT;
  ctx.textAlign = 'left';
  ctx.font = `700 ${Math.round(bandH * 0.42)}px -apple-system, "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText(wm.wordmark, pad + Math.round(bandH * 0.5), cy);
  // accent dot between wordmark and CTA identity
  // CTA (right)
  ctx.fillStyle = WM_DIM;
  ctx.textAlign = 'right';
  ctx.font = `500 ${Math.round(bandH * 0.32)}px -apple-system, "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText('tap to breed →', W - pad - Math.round(bandH * 0.5), cy);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// FRAME COMPOSITOR — one loop frame = tartan (engine) + baked watermark band.
// `supertile` may be pre-rendered once and reused across frames (fast path).
// ---------------------------------------------------------------------------
export function renderLoopFrame(ctx, spec, frame, supertile, mkCanvas) {
  const tile = supertile || renderSupertile(mkCanvas, spec.cfg);
  drawTartanFrame(ctx, spec.cfg, frame, tile);
  drawWatermarkBand(ctx, spec);
  return tile;
}

// ---------------------------------------------------------------------------
// SEAM PROOF (by construction, node-runnable — no pixels needed).
// The tartan region wraps because each axis pan offset at frame N equals frame 0.
// The watermark band is frame-invariant. Together → frame[N] === frame[0].
// Returns { seamless, offset0, offsetN, period }.
// ---------------------------------------------------------------------------
export function seamOffsets(cfg) {
  const o0 = panOffsetForFrame(cfg, 0);
  const oN = panOffsetForFrame(cfg, cfg.totalFrames);
  return {
    period: settPixels(cfg),
    offset0: { x: o0.offsetX, y: o0.offsetY },
    offsetN: { x: oN.offsetX, y: oN.offsetY },
    seamless: o0.offsetX === oN.offsetX && o0.offsetY === oN.offsetY,
  };
}

// ---------------------------------------------------------------------------
// ENCODE — frame-driven WebCodecs H.264 → MP4. DEPENDENCY-INJECTED.
//
// deps = {
//   VideoEncoderImpl, VideoFrameImpl,    // browser globals; injectable for tests
//   muxerFactory({ width, height, mux }) // returns { addVideoChunk(chunk, meta),
//                                         //           finalize() → Uint8Array }
//   probe                                // optional pre-computed probe result
//   getCanvas()                          // returns the source canvas for VideoFrame
//   mkCanvas(w,h)                        // canvas factory (for the supertile)
//   onProgress(i, total)                 // optional
// }
// Returns { ok, codec, mux, videoToolbox, framesEncoded, bytes, buffer } | { ok:false, stage, reason }
// ---------------------------------------------------------------------------
export async function encodeLoopMp4(spec, deps = {}) {
  const VE = deps.VideoEncoderImpl || (typeof VideoEncoder !== 'undefined' ? VideoEncoder : undefined);
  const VF = deps.VideoFrameImpl || (typeof VideoFrame !== 'undefined' ? VideoFrame : undefined);
  if (!VE) return { ok: false, stage: 'probe', reason: 'no VideoEncoder' };
  if (!VF) return { ok: false, stage: 'probe', reason: 'no VideoFrame' };
  if (typeof deps.muxerFactory !== 'function') return { ok: false, stage: 'mux', reason: 'no muxerFactory' };
  if (typeof deps.getCanvas !== 'function') return { ok: false, stage: 'source', reason: 'no getCanvas' };

  const probe = deps.probe || await probeVideoEncoder({ VideoEncoderImpl: VE, userAgent: deps.userAgent });
  if (!probe.supported) return { ok: false, stage: 'probe', reason: probe.reason, probe };

  const { width, height, totalFrames, fps, bitrate } = spec;
  const muxer = deps.muxerFactory({ width, height, mux: probe.mux });

  let firstErr = null;
  const encoder = new VE({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { firstErr = firstErr || e; },
  });
  const encCfg = { codec: probe.codec, width, height, bitrate, framerate: fps };
  if (probe.mux === 'avc') encCfg.avc = { format: 'avc' };   // Annex-B off → mp4-friendly
  encoder.configure(encCfg);

  const canvas = deps.getCanvas();
  const ctx = canvas.getContext('2d');
  const supertile = renderSupertile(deps.mkCanvas || ((w, h) => canvasLike(canvas, w, h)), spec.cfg);
  const usPerFrame = 1_000_000 / fps;

  // Encode frames 0..totalFrames-1 (frame totalFrames == frame 0 → perfect loop).
  let framesEncoded = 0;
  for (let i = 0; i < totalFrames; i++) {
    renderLoopFrame(ctx, spec, i, supertile, deps.mkCanvas);
    const frame = new VF(canvas, {
      timestamp: Math.round(i * usPerFrame),
      duration: Math.round(usPerFrame),
    });
    encoder.encode(frame, { keyFrame: i % fps === 0 });   // keyframe/sec
    if (typeof frame.close === 'function') frame.close();
    framesEncoded++;
    if (deps.onProgress) deps.onProgress(i + 1, totalFrames);
    if (firstErr) return { ok: false, stage: 'encode', reason: String(firstErr), probe };
  }

  await encoder.flush();
  if (typeof encoder.close === 'function') encoder.close();
  if (firstErr) return { ok: false, stage: 'flush', reason: String(firstErr), probe };

  const buffer = muxer.finalize();
  return {
    ok: true,
    codec: probe.codec,
    mux: probe.mux,
    videoToolbox: probe.videoToolbox,
    framesEncoded,
    bytes: buffer ? buffer.byteLength : 0,
    buffer,
  };
}

// fallback canvas factory when the caller didn't supply mkCanvas but we have a
// concrete canvas whose constructor we can mimic (browser only).
function canvasLike(canvas, w, h) {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }
  const c = Object.create(Object.getPrototypeOf(canvas));
  c.width = w; c.height = h; return c;
}

// ---------------------------------------------------------------------------
// EXPORT ORCHESTRATOR — probe → web encode, else native-fallback descriptor.
//
// ACCEPTANCE #3: if VideoEncoder/VideoToolbox is unavailable, we return a
// descriptor naming the native Capacitor AVAssetWriter plugin the app should
// invoke instead (../native/loop-encoder.js). We never silently fail.
// Returns the encode result on success, or:
//   { ok:false, fallback:'native', plugin:'LoopEncoder', method:'AVAssetWriter',
//     reason, spec }
// ---------------------------------------------------------------------------
export async function exportLoop(opts) {
  const spec = opts.spec || buildLoopSpec(opts);
  const deps = opts.deps || {};
  const probe = deps.probe || await probeVideoEncoder({
    VideoEncoderImpl: deps.VideoEncoderImpl, userAgent: deps.userAgent,
  });

  if (!probe.supported) {
    return {
      ok: false,
      fallback: 'native',
      plugin: 'LoopEncoder',
      method: 'AVAssetWriter',
      reason: probe.reason || 'VideoEncoder unavailable in this WebView',
      probe,
      spec,
    };
  }
  const result = await encodeLoopMp4(spec, { ...deps, probe });
  return { ...result, spec };
}

// browser global (parity with tartanism.js) so a plain <script type=module>
// harness / on-device probe page can call these without a bundler.
if (typeof window !== 'undefined') {
  window.TartanismLoopExport = {
    probeVideoEncoder, buildLoopSpec, drawWatermarkBand, renderLoopFrame,
    seamOffsets, encodeLoopMp4, exportLoop, isAppleWebKitUA,
    LOOP_W, LOOP_H, LOOP_TOTAL_FRAMES, LOOP_FPS, CODEC_CANDIDATES,
  };
}
