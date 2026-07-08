/*
 * T13 — Looping MP4 export via WebCodecs + VideoToolbox probe + native fallback.
 *
 * Acceptance (goal-loop):
 *  1. WebCodecs H.264 loop path integrated (encodes exactly N frames → seamless).
 *  2. VideoEncoder/VideoToolbox availability is probed in-WebView (H.264-first;
 *     VideoToolbox inferred on Apple-WebKit); unavailable → native fallback
 *     descriptor naming the Capacitor AVAssetWriter plugin.
 *  3. Native AVAssetWriter fallback is specced + stubbed (bridge rejects cleanly
 *     off-device so callers fall through).
 *  4. Exported MP4 carries the baked watermark/end-card.
 *  5. Loop plays without a visible seam — proven by construction (per-axis pan
 *     offset at frame 0 === frame N) for every motion type across shipped setts.
 *
 * Pixel-accurate on-device seam + real H.264-via-VideoToolbox confirmation are
 * device-gated (T18, Risk #1) — see docs/NATIVE-LOOP-ENCODER-SPEC.md.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  probeVideoEncoder, isAppleWebKitUA, buildLoopSpec, seamOffsets, encodeLoopMp4,
  exportLoop, drawWatermarkBand, CODEC_CANDIDATES,
  LOOP_W, LOOP_H, LOOP_TOTAL_FRAMES, LOOP_FPS,
} from '../../src/ui/loop-export.js';
import { SETTS, resolveSett } from '../../src/engine/tartanism.js';
import { isNativeLoopEncoderAvailable, LoopEncoder } from '../../src/native/loop-encoder.js';
import { makeFakeCanvasFactory } from './_fake-canvas.mjs';

const mkCanvas = makeFakeCanvasFactory();
const GENOME = SETTS[0]; // graphite (pan)

// ---- fakes for the WebCodecs path ------------------------------------------

// A fake VideoEncoder whose isConfigSupported answers per a codec-allow set,
// records the call order, and drives one output chunk per encode.
function fakeVideoEncoderClass(supportedCodecs, log = {}) {
  log.order = log.order || [];
  return class FakeVideoEncoder {
    static async isConfigSupported(cfg) {
      log.order.push('isConfigSupported:' + cfg.codec);
      return { supported: supportedCodecs.has(cfg.codec), config: cfg };
    }
    constructor({ output, error }) { this.output = output; this.error = error; this._n = 0; }
    configure(cfg) { log.order.push('configure:' + cfg.codec); this.cfg = cfg; log.configured = cfg; }
    encode(frame, opts) {
      this._n++;
      log.encodes = (log.encodes || 0) + 1;
      log.keyframes = (log.keyframes || 0) + (opts && opts.keyFrame ? 1 : 0);
      this.output({ byteLength: 100, type: opts && opts.keyFrame ? 'key' : 'delta' }, { });
    }
    async flush() { log.flushed = true; }
    close() { log.closed = true; }
  };
}

class FakeVideoFrame {
  constructor(source, init) { this.source = source; this.timestamp = init.timestamp; this.closed = false; }
  close() { this.closed = true; }
}

function fakeMuxerFactory(log = {}) {
  return ({ width, height, mux }) => {
    log.mux = { width, height, mux };
    let chunks = 0;
    return {
      addVideoChunk(chunk) { chunks++; },
      finalize() { log.finalized = true; log.chunks = chunks; return new Uint8Array(chunks * 100); },
    };
  };
}

const H264 = 'avc1.42E01F';
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const CHROME_UA = 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';

// ============================================================================
// 1. PROBE — H.264 first, VideoToolbox inference, capability gate
// ============================================================================

test('probe: prefers H.264 and infers VideoToolbox on Apple-WebKit (iOS/WKWebView)', async () => {
  const VE = fakeVideoEncoderClass(new Set([H264, 'vp09.00.10.08']));
  const p = await probeVideoEncoder({ VideoEncoderImpl: VE, userAgent: IOS_UA });
  assert.equal(p.supported, true);
  assert.equal(p.codec, H264, 'H.264 chosen first over VP9');
  assert.equal(p.h264, true);
  assert.equal(p.videoToolbox, true, 'H.264 on Apple-WebKit == VideoToolbox');
  assert.equal(p.isAppleWebKit, true);
});

test('probe: same H.264 support on a Chromium UA is NOT reported as VideoToolbox', async () => {
  const VE = fakeVideoEncoderClass(new Set([H264]));
  const p = await probeVideoEncoder({ VideoEncoderImpl: VE, userAgent: CHROME_UA });
  assert.equal(p.supported, true);
  assert.equal(p.codec, H264);
  assert.equal(p.videoToolbox, false, 'Chromium H.264 is not VideoToolbox');
});

test('probe: desktop with no H.264 encoder falls to VP9 (still a valid encode path)', async () => {
  const VE = fakeVideoEncoderClass(new Set(['vp09.00.10.08'])); // headless Chrome: no proprietary H.264 encoder
  const p = await probeVideoEncoder({ VideoEncoderImpl: VE, userAgent: CHROME_UA });
  assert.equal(p.supported, true);
  assert.equal(p.codec, 'vp09.00.10.08');
  assert.equal(p.h264, false);
  assert.equal(p.videoToolbox, false);
});

test('probe: no VideoEncoder → unsupported with a reason (drives native fallback)', async () => {
  const p = await probeVideoEncoder({ VideoEncoderImpl: undefined, userAgent: IOS_UA });
  assert.equal(p.supported, false);
  assert.match(p.reason, /no VideoEncoder/);
});

test('probe: VideoEncoder present but no candidate supported → unsupported', async () => {
  const VE = fakeVideoEncoderClass(new Set([])); // nothing supported
  const p = await probeVideoEncoder({ VideoEncoderImpl: VE, userAgent: IOS_UA });
  assert.equal(p.supported, false);
  assert.match(p.reason, /no candidate codec/);
  // capability gate: it actually probed every candidate
  assert.equal(p.candidates.length, CODEC_CANDIDATES.length);
});

test('isAppleWebKitUA: iOS Safari yes, Chrome/Android no', () => {
  assert.equal(isAppleWebKitUA(IOS_UA), true);
  assert.equal(isAppleWebKitUA(CHROME_UA), false);
  assert.equal(isAppleWebKitUA('Mozilla/5.0 (Linux; Android) AppleWebKit/537 Chrome/130'), false);
  assert.equal(isAppleWebKitUA(''), false);
});

// ============================================================================
// 2. SPEC — dimensions + baked watermark
// ============================================================================

test('buildLoopSpec: 1080×1920 / 120f / 30fps with the watermark present', () => {
  const spec = buildLoopSpec({ genome: GENOME });
  assert.equal(spec.width, LOOP_W);
  assert.equal(spec.height, LOOP_H);
  assert.equal(spec.totalFrames, LOOP_TOTAL_FRAMES);
  assert.equal(spec.fps, LOOP_FPS);
  assert.equal(spec.watermark.present, true, 'ACCEPTANCE #4 — watermark baked');
  assert.ok(spec.watermark.wordmark, 'wordmark set');
  assert.ok(spec.cfg && spec.cfg.expanded, 'resolved render cfg carried on the spec');
});

test('buildLoopSpec: requires a genome with a threadcount', () => {
  assert.throws(() => buildLoopSpec({ genome: {} }), /threadcount/);
});

test('watermark band: draws (and is frame-invariant → seam-safe)', () => {
  // record every draw op on a spy ctx; must be identical regardless of frame arg.
  function spyCtx() {
    const ops = [];
    const rec = (name) => (...a) => ops.push(name + ':' + a.join(','));
    return new Proxy({ ops, roundRect: rec('roundRect'), fillRect: rec('fillRect'),
      fillText: rec('fillText'), beginPath: rec('beginPath'), fill: rec('fill'),
      save: rec('save'), restore: rec('restore') },
      { get: (t, k) => (k in t ? t[k] : () => {}), set: () => true });
  }
  const spec = buildLoopSpec({ genome: GENOME });
  const a = spyCtx(); drawWatermarkBand(a, spec);
  const b = spyCtx(); drawWatermarkBand(b, spec);
  assert.ok(a.ops.length > 0, 'watermark actually drew something');
  assert.deepEqual(a.ops, b.ops, 'watermark render is deterministic / frame-invariant');
  assert.ok(a.ops.some((o) => o.startsWith('fillText:Tartanism')), 'wordmark text baked in');
});

// ============================================================================
// 3. SEAM — bit-exact by construction, every motion type, every shipped sett
// ============================================================================

test('seam: per-axis pan offset at frame 0 === frame N for every shipped sett', () => {
  const motionTypes = new Set();
  for (const s of SETTS) {
    const cfg = resolveSett(s);
    motionTypes.add(cfg.motion.type);
    const so = seamOffsets(cfg);
    assert.equal(so.seamless, true, `${s.id} (${cfg.motion.type}) must wrap seamlessly`);
    assert.equal(so.offset0.x, so.offsetN.x, `${s.id} x-axis`);
    assert.equal(so.offset0.y, so.offsetN.y, `${s.id} y-axis`);
  }
  // ensure we actually exercised all three motion types the engine supports
  for (const t of ['pan', 'breathe', 'drift']) {
    assert.ok(motionTypes.has(t), `shipped setts include a '${t}' motion (found: ${[...motionTypes]})`);
  }
});

// ============================================================================
// 4. ENCODE — frame-driven, exactly N frames (perfect loop), gate before configure
// ============================================================================

test('encode: encodes exactly totalFrames (0..N-1) — no duplicate seam frame', async () => {
  const log = {};
  const VE = fakeVideoEncoderClass(new Set([H264]), log);
  const spec = buildLoopSpec({ genome: GENOME });
  const source = mkCanvas(spec.width, spec.height);
  const r = await encodeLoopMp4(spec, {
    VideoEncoderImpl: VE, VideoFrameImpl: FakeVideoFrame,
    muxerFactory: fakeMuxerFactory(log),
    getCanvas: () => source, mkCanvas, userAgent: IOS_UA,
  });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.framesEncoded, spec.totalFrames, 'exactly N frames');
  assert.equal(log.encodes, spec.totalFrames, 'frame N (== frame 0) is NOT encoded');
  assert.equal(r.codec, H264);
  assert.equal(r.videoToolbox, true);
  assert.ok(r.bytes > 0, 'produced non-empty MP4 buffer');
});

test('encode: capability gate — isConfigSupported runs before configure', async () => {
  const log = {};
  const VE = fakeVideoEncoderClass(new Set([H264]), log);
  const spec = buildLoopSpec({ genome: GENOME });
  const source = mkCanvas(spec.width, spec.height);
  await encodeLoopMp4(spec, {
    VideoEncoderImpl: VE, VideoFrameImpl: FakeVideoFrame,
    muxerFactory: fakeMuxerFactory(log), getCanvas: () => source, mkCanvas, userAgent: IOS_UA,
  });
  const firstConfigure = log.order.findIndex((o) => o.startsWith('configure:'));
  const firstProbe = log.order.findIndex((o) => o.startsWith('isConfigSupported:'));
  assert.ok(firstProbe >= 0 && firstConfigure >= 0);
  assert.ok(firstProbe < firstConfigure, 'probe precedes configure (capability gate)');
  assert.equal(log.configured.avc.format, 'avc', 'H.264 configured with avc (mp4) format');
  assert.ok(log.flushed && log.closed, 'encoder flushed + closed');
});

test('encode: keyframe cadence ~1/sec', async () => {
  const log = {};
  const VE = fakeVideoEncoderClass(new Set([H264]), log);
  const spec = buildLoopSpec({ genome: GENOME });
  const source = mkCanvas(spec.width, spec.height);
  await encodeLoopMp4(spec, {
    VideoEncoderImpl: VE, VideoFrameImpl: FakeVideoFrame,
    muxerFactory: fakeMuxerFactory(log), getCanvas: () => source, mkCanvas, userAgent: IOS_UA,
  });
  assert.equal(log.keyframes, spec.totalFrames / spec.fps, 'one keyframe per second');
});

// ============================================================================
// 5. FALLBACK — unsupported WebView → native AVAssetWriter descriptor
// ============================================================================

test('exportLoop: no VideoEncoder → native fallback descriptor (not a silent failure)', async () => {
  const r = await exportLoop({ genome: GENOME, deps: { VideoEncoderImpl: undefined, userAgent: IOS_UA } });
  assert.equal(r.ok, false);
  assert.equal(r.fallback, 'native');
  assert.equal(r.plugin, 'LoopEncoder');
  assert.equal(r.method, 'AVAssetWriter');
  assert.ok(r.reason, 'carries a reason');
  assert.ok(r.spec && r.spec.width === LOOP_W, 'still returns the spec for the native path');
});

test('exportLoop: supported WebView → real WebCodecs encode result', async () => {
  const log = {};
  const VE = fakeVideoEncoderClass(new Set([H264]), log);
  const spec = buildLoopSpec({ genome: GENOME });
  const source = mkCanvas(spec.width, spec.height);
  const r = await exportLoop({
    spec,
    deps: {
      VideoEncoderImpl: VE, VideoFrameImpl: FakeVideoFrame,
      muxerFactory: fakeMuxerFactory(log), getCanvas: () => source, mkCanvas, userAgent: IOS_UA,
    },
  });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.videoToolbox, true);
  assert.equal(r.framesEncoded, spec.totalFrames);
});

test('native bridge: off-device it is unavailable and rejects cleanly (callers fall through)', async () => {
  assert.equal(isNativeLoopEncoderAvailable(), false, 'no Capacitor native shell in node');
  await assert.rejects(() => LoopEncoder.begin({ width: 1080, height: 1920, fps: 30, bitrate: 8e6 }),
    (e) => e.code === 'NOT_IMPLEMENTED');
});
