//
//  SaveToPhotosPlugin.swift — T21 Save exported PNG/MP4 to Photos library.
//
//  Native Capacitor plugin wrapping PHPhotoLibrary. Exposes:
//    - saveImageToPhotos(options)  → save base64-encoded PNG to Photos
//    - saveVideoToPhotos(options)  → save base64-encoded MP4 to Photos
//    - writeTempFile(options)      → write base64 data to a temp file, return URL
//
//  The web side calls these after rendering the canvas to a data URL.
//  Web build no-ops gracefully — the caller checks isNative() first.
//
import Foundation
import Photos
import Capacitor

@objc(SaveToPhotosPlugin)
public class SaveToPhotosPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SaveToPhotosPlugin"
    public let jsName = "SaveToPhotos"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "saveImageToPhotos", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveVideoToPhotos", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveVideoFileToPhotos", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeTempFile", returnType: CAPPluginReturnPromise),
    ]

    // MARK: - Save Image to Photos

    /// Save a base64-encoded PNG image to the Photos library.
    /// Options: { base64: string (data URI or raw base64) }
    @objc func saveImageToPhotos(_ call: CAPPluginCall) {
        guard let base64 = call.getString("base64"), !base64.isEmpty else {
            call.reject("Missing required parameter: base64")
            return
        }

        // Strip data URI prefix if present
        let cleanBase64 = stripDataURIPrefix(base64)

        guard let imageData = Data(base64Encoded: cleanBase64) else {
            call.reject("Invalid base64 image data")
            return
        }

        guard let image = UIImage(data: imageData) else {
            call.reject("Could not decode image from data")
            return
        }

        // Request Photos authorization if needed
        let authStatus = PHPhotoLibrary.authorizationStatus(for: .addOnly)
        switch authStatus {
        case .notDetermined:
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
                if status == .authorized || status == .limited {
                    self.performSaveImage(image, call: call)
                } else {
                    call.reject("Photos access denied")
                }
            }
        case .authorized, .limited:
            performSaveImage(image, call: call)
        case .denied, .restricted:
            call.reject("Photos access denied")
        @unknown default:
            call.reject("Photos access denied (unknown status)")
        }
    }

    // MARK: - Save Video to Photos

    /// Save a base64-encoded MP4 video to the Photos library.
    /// Options: { base64: string (data URI or raw base64) }
    @objc func saveVideoToPhotos(_ call: CAPPluginCall) {
        guard let base64 = call.getString("base64"), !base64.isEmpty else {
            call.reject("Missing required parameter: base64")
            return
        }

        let cleanBase64 = stripDataURIPrefix(base64)

        guard let videoData = Data(base64Encoded: cleanBase64) else {
            call.reject("Invalid base64 video data")
            return
        }

        // Write to temp file first, then save to Photos
        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("mp4")

        do {
            try videoData.write(to: tempURL)
        } catch {
            call.reject("Failed to write video temp file: \(error.localizedDescription)")
            return
        }

        let authStatus = PHPhotoLibrary.authorizationStatus(for: .addOnly)
        switch authStatus {
        case .notDetermined:
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
                if status == .authorized || status == .limited {
                    self.performSaveVideo(tempURL, call: call)
                } else {
                    call.reject("Photos access denied")
                }
            }
        case .authorized, .limited:
            performSaveVideo(tempURL, call: call)
        case .denied, .restricted:
            call.reject("Photos access denied")
        @unknown default:
            call.reject("Photos access denied (unknown status)")
        }
    }

    // Native encoder returns a local file: avoid a 4 MB+ base64 round trip through WKWebView.
    @objc func saveVideoFileToPhotos(_ call: CAPPluginCall) {
        guard let path = call.getString("path"),
              let url = URL(string: path), url.isFileURL,
              FileManager.default.fileExists(atPath: url.path) else {
            call.reject("A local exported video file is required")
            return
        }
        let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
        if status == .notDetermined {
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { permission in
                if permission == .authorized || permission == .limited {
                    self.performSaveVideo(url, call: call, removeAfterSave: false)
                } else { call.reject("Photos access denied") }
            }
        } else if status == .authorized || status == .limited {
            performSaveVideo(url, call: call, removeAfterSave: false)
        } else { call.reject("Photos access denied") }
    }

    // MARK: - Write Temp File (for share sheet)

    /// Write base64 data to a temp file and return its file:// URL.
    /// Options: { base64: string, fileName: string }
    /// fileName should include extension (e.g., "tartan-export.png")
    @objc func writeTempFile(_ call: CAPPluginCall) {
        guard let base64 = call.getString("base64"), !base64.isEmpty else {
            call.reject("Missing required parameter: base64")
            return
        }
        let fileName = call.getString("fileName") ?? "tartan-export.png"

        let cleanBase64 = stripDataURIPrefix(base64)
        guard let data = Data(base64Encoded: cleanBase64) else {
            call.reject("Invalid base64 data")
            return
        }

        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(fileName)
            .appendingPathExtension("") // fileName already has extension

        // Remove existing file at same path if any
        if FileManager.default.fileExists(atPath: tempURL.path) {
            try? FileManager.default.removeItem(at: tempURL)
        }

        do {
            try data.write(to: tempURL)
            call.resolve(["fileUrl": tempURL.absoluteString, "filePath": tempURL.path])
        } catch {
            call.reject("Failed to write temp file: \(error.localizedDescription)")
        }
    }

    // MARK: - Helpers

    private func stripDataURIPrefix(_ base64: String) -> String {
        if let commaIndex = base64.firstIndex(of: ",") {
            return String(base64[base64.index(after: commaIndex)...])
        }
        return base64
    }

    private func performSaveImage(_ image: UIImage, call: CAPPluginCall) {
        PHPhotoLibrary.shared().performChanges {
            PHAssetChangeRequest.creationRequestForAsset(from: image)
        } completionHandler: { success, error in
            if success {
                call.resolve(["saved": true])
            } else {
                call.reject("Failed to save to Photos: \(error?.localizedDescription ?? "unknown error")")
            }
        }
    }

    private func performSaveVideo(_ fileURL: URL, call: CAPPluginCall, removeAfterSave: Bool = true) {
        PHPhotoLibrary.shared().performChanges {
            PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: fileURL)
        } completionHandler: { success, error in
            // Clean up temp file
            if removeAfterSave { try? FileManager.default.removeItem(at: fileURL) }
            if success {
                call.resolve(["saved": true])
            } else {
                call.reject("Failed to save video to Photos: \(error?.localizedDescription ?? "unknown error")")
            }
        }
    }
}
