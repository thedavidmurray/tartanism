//
//  LoopEncoderPlugin.swift — T13 native fallback (Capacitor plugin `LoopEncoder`).
//
//  STUB + SPEC. The web WebCodecs path (ui/loop-export.js) is primary; this native
//  encoder is the fallback for WKWebViews without WebCodecs `VideoEncoder`. It wraps
//  AVAssetWriter with an H.264 (VideoToolbox, hardware) settings dict — the same
//  silicon WebCodecs would have used — to produce a seamless looping MP4 in tmp/.
//
//  Lifecycle mirrors the JS bridge (native/loop-encoder.js):
//    begin(width,height,fps,bitrate) -> { sessionId }
//    appendFrame(sessionId,index,pngBase64) -> { accepted }
//    finish(sessionId) -> { path, bytes }
//    abort(sessionId) -> {}
//
//  The JS side renders frames 0..N-1 (frame N == frame 0) so the file loops with
//  no duplicate seam frame. Watermark is baked in JS before append — native only
//  encodes what it's handed.
//
//  STATUS: interface + AVAssetWriter wiring stubbed. Marked TODO(T18) where a
//  physical device is required to (a) confirm WebCodecs is actually absent (so
//  this path is even reached) and (b) validate the AVAssetWriter H.264 profile/
//  level against TikTok/CapCut import. Do NOT ship as "done" until device-verified.
//
import Foundation
import AVFoundation
import Capacitor

@objc(LoopEncoderPlugin)
public class LoopEncoderPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LoopEncoderPlugin"
    public let jsName = "LoopEncoder"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "begin", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "appendFrame", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "abort", returnType: CAPPluginReturnPromise),
    ]

    // one in-flight encode session; T13 loops are short (4s) and exported one at a time.
    private final class Session {
        let id: String
        let writer: AVAssetWriter
        let input: AVAssetWriterInput
        let adaptor: AVAssetWriterInputPixelBufferAdaptor
        let width: Int
        let height: Int
        let fps: Int
        let url: URL
        var nextPTS: CMTime = .zero
        init(id: String, writer: AVAssetWriter, input: AVAssetWriterInput,
             adaptor: AVAssetWriterInputPixelBufferAdaptor,
             width: Int, height: Int, fps: Int, url: URL) {
            self.id = id; self.writer = writer; self.input = input; self.adaptor = adaptor
            self.width = width; self.height = height; self.fps = fps; self.url = url
        }
    }
    private var sessions: [String: Session] = [:]
    private let q = DispatchQueue(label: "com.tartanism.loopencoder")

    // MARK: begin
    @objc func begin(_ call: CAPPluginCall) {
        let width = call.getInt("width") ?? 1080
        let height = call.getInt("height") ?? 1920
        let fps = call.getInt("fps") ?? 30
        let bitrate = call.getInt("bitrate") ?? 8_000_000
        let sessionId = UUID().uuidString
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("tartanism-loop-\(sessionId).mp4")

        do {
            let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
            // H.264 via VideoToolbox — hardware encoder on-device.
            let settings: [String: Any] = [
                AVVideoCodecKey: AVVideoCodecType.h264,
                AVVideoWidthKey: width,
                AVVideoHeightKey: height,
                AVVideoCompressionPropertiesKey: [
                    AVVideoAverageBitRateKey: bitrate,
                    AVVideoProfileLevelKey: AVVideoProfileLevelH264MainAutoLevel,
                    AVVideoMaxKeyFrameIntervalKey: fps,          // 1 keyframe/sec
                    AVVideoAllowFrameReorderingKey: false,
                ],
            ]
            let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
            input.expectsMediaDataInRealTime = false
            let adaptor = AVAssetWriterInputPixelBufferAdaptor(
                assetWriterInput: input,
                sourcePixelBufferAttributes: [
                    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
                    kCVPixelBufferWidthKey as String: width,
                    kCVPixelBufferHeightKey as String: height,
                ])
            guard writer.canAdd(input) else { call.reject("cannot add writer input"); return }
            writer.add(input)
            guard writer.startWriting() else {
                call.reject("startWriting failed: \(writer.error?.localizedDescription ?? "?")"); return
            }
            writer.startSession(atSourceTime: .zero)
            let s = Session(id: sessionId, writer: writer, input: input, adaptor: adaptor,
                            width: width, height: height, fps: fps, url: url)
            q.sync { sessions[sessionId] = s }
            call.resolve(["sessionId": sessionId])
        } catch {
            call.reject("AVAssetWriter init failed: \(error.localizedDescription)")
        }
    }

    // MARK: appendFrame — decode PNG base64 → CVPixelBuffer → append at index PTS.
    @objc func appendFrame(_ call: CAPPluginCall) {
        guard let sessionId = call.getString("sessionId"),
              let index = call.getInt("index"),
              let pngBase64 = call.getString("pngBase64") else {
            call.reject("sessionId, index, pngBase64 required"); return
        }
        guard let s = q.sync(execute: { sessions[sessionId] }) else {
            call.reject("unknown sessionId"); return
        }
        guard let data = Data(base64Encoded: pngBase64),
              let image = UIImage(data: data)?.cgImage else {
            call.reject("bad PNG payload"); return
        }
        // TODO(T18): back-pressure — spin until input.isReadyForMoreMediaData on-device.
        guard s.input.isReadyForMoreMediaData else {
            call.reject("writer not ready for more data"); return
        }
        guard let pool = s.adaptor.pixelBufferPool,
              let pb = LoopEncoderPlugin.pixelBuffer(from: image, pool: pool,
                                                     width: s.width, height: s.height) else {
            call.reject("pixel buffer alloc failed"); return
        }
        let pts = CMTime(value: CMTimeValue(index), timescale: CMTimeScale(s.fps))
        if s.adaptor.append(pb, withPresentationTime: pts) {
            call.resolve(["accepted": index])
        } else {
            call.reject("append failed: \(s.writer.error?.localizedDescription ?? "?")")
        }
    }

    // MARK: finish
    @objc func finish(_ call: CAPPluginCall) {
        guard let sessionId = call.getString("sessionId"),
              let s = q.sync(execute: { sessions[sessionId] }) else {
            call.reject("unknown sessionId"); return
        }
        s.input.markAsFinished()
        s.writer.finishWriting { [weak self] in
            defer { self?.q.sync { self?.sessions[sessionId] = nil } }
            if s.writer.status == .completed {
                let bytes = (try? FileManager.default
                    .attributesOfItem(atPath: s.url.path)[.size] as? Int) ?? 0
                call.resolve(["path": s.url.absoluteString, "bytes": bytes ?? 0])
            } else {
                call.reject("finishWriting failed: \(s.writer.error?.localizedDescription ?? "?")")
            }
        }
    }

    // MARK: abort
    @objc func abort(_ call: CAPPluginCall) {
        guard let sessionId = call.getString("sessionId") else { call.reject("sessionId required"); return }
        if let s = q.sync(execute: { sessions[sessionId] }) {
            s.writer.cancelWriting()
            try? FileManager.default.removeItem(at: s.url)
            q.sync { sessions[sessionId] = nil }
        }
        call.resolve([:])
    }

    // helper: CGImage → BGRA CVPixelBuffer from the adaptor pool.
    private static func pixelBuffer(from image: CGImage, pool: CVPixelBufferPool,
                                    width: Int, height: Int) -> CVPixelBuffer? {
        var pbOut: CVPixelBuffer?
        guard CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pbOut) == kCVReturnSuccess,
              let pb = pbOut else { return nil }
        CVPixelBufferLockBaseAddress(pb, [])
        defer { CVPixelBufferUnlockBaseAddress(pb, []) }
        guard let ctx = CGContext(
            data: CVPixelBufferGetBaseAddress(pb), width: width, height: height,
            bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(pb),
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue
                | CGBitmapInfo.byteOrder32Little.rawValue) else { return nil }
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        return pb
    }
}
