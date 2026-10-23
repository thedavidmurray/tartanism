import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

// Swift tools 5.9 knows platform versions through 18, but supports arbitrary
// deployment targets via the string initializer. Capacitor 8 currently emits
// .iOS(.v26), which SwiftPM cannot parse. Apply after every Capacitor sync.
const cap = spawnSync(process.execPath, ['node_modules/@capacitor/cli/bin/capacitor', 'sync', 'ios'], { stdio: 'inherit' });
if (cap.status !== 0) process.exit(cap.status || 1);
const path = 'ios/App/CapApp-SPM/Package.swift';
const input = readFileSync(path, 'utf8');
const updated = input.replace('platforms: [.iOS(.v26)]', 'platforms: [.iOS("26.0")]');
if (!updated.includes('platforms: [.iOS("26.0")]')) throw Error('Capacitor SwiftPM deployment target changed');
if (updated !== input) writeFileSync(path, updated);
console.log('SwiftPM target: iOS 26.0');
