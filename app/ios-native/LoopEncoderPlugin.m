//
//  LoopEncoderPlugin.m — Capacitor plugin registration for LoopEncoder (T13).
//
//  Bridges the Swift LoopEncoderPlugin to the Capacitor JS runtime so
//  window.Capacitor.Plugins.LoopEncoder resolves on-device. Register these four
//  methods to match native/loop-encoder.js. STUB alongside the Swift half — wire
//  into the Xcode project when T18 provides a device build.
//
#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(LoopEncoderPlugin, "LoopEncoder",
    CAP_PLUGIN_METHOD(begin, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(appendFrame, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(finish, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(abort, CAPPluginReturnPromise);
)
