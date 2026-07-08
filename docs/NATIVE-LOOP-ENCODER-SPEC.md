# Native Loop Encoder — AVAssetWriter fallback spec (T13)

**Status:** specced + stubbed. Primary path is web WebCodecs; this is the fallback
for WKWebViews without `VideoEncoder`. **Device-gated on T18** for final verification.

## Why a fallback exists

T13's primary encoder is browser **WebCodecs `VideoEncoder`** (`app/src/ui/loop-export.js`).
On iOS/WKWebView that is backed by hardware **VideoToolbox** H.264. WebCodecs video
is partial from the Safari 16.4 engine and full from Safari 26. If a target device's
WKWebView lacks a usable `VideoEncoder` (older engine, or it refuses our `avc1.*`
config), `exportLoop()` returns:

```js
{ ok:false, fallback:'native', plugin:'LoopEncoder', method:'AVAssetWriter', reason, spec }
```

The app then drives the native `LoopEncoder` Capacitor plugin, which encodes the
identical frames through `AVAssetWriter` (also VideoToolbox H.264 — same silicon).

## The seam contract (shared by both paths)

A tartan is spatially periodic; the engine pans each axis by an integer number of
full sett-repeats over the loop, so **frame N == frame 0**. Both encoders render
frames `0 .. N-1` (N = 120) and **never encode frame N** → a perfect loop with no
duplicate seam frame. The watermark band is drawn identically on every frame, so it
does not perturb the seam. `loop-export.js#seamOffsets(cfg)` proves this by
construction (offset at frame 0 === offset at frame N, per axis).

## Plugin interface (`LoopEncoder`)

JS bridge: `app/src/native/loop-encoder.js`. Native: `app/ios-native/LoopEncoderPlugin.swift` + `.m`.

| Method | Args | Returns | Notes |
|---|---|---|---|
| `begin` | `{ width, height, fps, bitrate }` | `{ sessionId }` | opens `AVAssetWriter` → `tmp/tartanism-loop-<id>.mp4`, H.264/VideoToolbox settings, `startSession(atSourceTime: .zero)` |
| `appendFrame` | `{ sessionId, index, pngBase64 }` | `{ accepted: index }` | PNG → `CGImage` → BGRA `CVPixelBuffer` (pool) → `adaptor.append(pb, PTS=index/fps)` |
| `finish` | `{ sessionId }` | `{ path, bytes }` | `markAsFinished()` + `finishWriting`; returns `file://` URL for `@capacitor/share` / save-to-Photos (T21) |
| `abort` | `{ sessionId }` | `{}` | `cancelWriting()` + delete temp file |

**H.264 settings:** `AVVideoCodecType.h264`, `AVVideoProfileLevelH264MainAutoLevel`,
`AVVideoAverageBitRateKey: 8_000_000`, `AVVideoMaxKeyFrameIntervalKey: fps` (1 kf/s),
`AVVideoAllowFrameReorderingKey: false`. BGRA pixel-buffer pool from the adaptor.

## Frame transport

Frames cross the JS→native boundary as **base64 PNG** per frame (`encodeLoopNative`
in the JS bridge drives `renderFrame(i)` → `canvasToPngBase64(canvas)` → `appendFrame`).
For 120 short frames this is simple and correct. **TODO(T18) perf:** if base64 PNG
transport is too slow on-device, switch to a shared `WKScriptMessageHandler` raw-RGBA
path or render natively from a genome the plugin receives once at `begin`. Measure
first; base64 is the honest v1.

## Open device-gated items (T18 — Risk #1)

1. **Confirm the fallback is even reachable** — measure whether target-iOS WKWebView
   actually accepts our `avc1.42E01F` config. If WebCodecs works everywhere we ship,
   this native path is belt-and-suspenders, not the hot path.
2. **Validate AVAssetWriter output** imports cleanly into TikTok / CapCut / Reels
   (profile/level, `+faststart`/mp4 moov placement, no B-frames).
3. **Back-pressure**: `appendFrame` currently rejects if `!isReadyForMoreMediaData`.
   On-device, wrap append in a `requestMediaDataWhenReady` pump instead of rejecting.
4. **Save-to-Photos + share sheet** wiring is **T21** (`@capacitor/share` + a Photos
   plugin) — this plugin only produces the `file://` MP4.

## What is proven now (web, node-runnable)

`app/tests/ui/loop-export.test.mjs` (TDD) asserts, with no device:
- capability probe prefers H.264 and infers VideoToolbox on Apple-WebKit UAs;
- probe reports unsupported (→ native fallback descriptor) when `VideoEncoder` absent;
- the encoder encodes exactly `totalFrames` frames (0..N-1) — perfect loop, no dup;
- `isConfigSupported` is called before `configure` (capability gate);
- the loop spec is 1080×1920 / 120f / 30fps with the watermark baked in;
- seam is bit-exact by construction (per-axis offset frame0 === frameN) for every
  motion type (pan/breathe/drift) across the shipped setts.
