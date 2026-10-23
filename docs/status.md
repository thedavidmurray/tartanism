# Tartanism v1 release status

- App Store Connect: [Tartanism 6826004437](https://appstoreconnect.apple.com/apps/6826004437), `com.edgeless.tartanism`, iOS 1.0 **PREPARE_FOR_SUBMISSION**; version has build **7** attached. Final review submission has **not** been pressed.
- TestFlight: build **7** VALID and in a private internal group with **zero invited testers**; build **6** also VALID but `INTERNAL_ONLY` and cannot attach to an App Store version. No public beta link or external tester action.
- V1 free, no in-app purchase, no account. App's collection is local; no app analytics/network calls found in app source. The App Store privacy questionnaire still needs David's confirmation and the general https://edgelesslab.com/privacy/ does not yet explicitly describe Tartanism.
- 6.9-inch (1320×2868) simulator screenshot is uploaded and in `fastlane/screenshots/en-US/`; copy, subtitle, keywords, support/privacy URLs and icon are staged in ASC. Marketing URL was corrected from a 404 to the live https://edgelesslab.com homepage. The release preview is `Deliverables/tartanism-submission-preview.png`.
- Verification on build-7 source: `npm test --prefix app` 144/144; `node app/seam_check.mjs` pass; `npm run ios:sync` pass; signed `xcodebuild archive` pass; `ffprobe export-probe.mp4` H.264 320×568 / 2 s. Source/asset checks are not a physical-device acceptance test.
- **David's 2-minute device test:** install internal build 7 in TestFlight, breed a set, open live preview, export an MP4, save it to Photos and share it; report smoothness/FPS or lag. This is the one remaining runtime risk.
- Release approval: do not submit until David explicitly replies **“submit”**, the device test passes, and the App Store privacy details/agreement are resolved.

## Inflections

1. Profile-scoped HOME hid the login keychain and broke ASC credential path expansion. With explicit real HOME and the worker keychain search list corrected by Hive, local manual signing and API calls succeeded without rotating the shared certificate.
2. Capacitor CLI requires Node 22; using `/opt/homebrew/opt/node@22/bin` fixed sync. Package's regenerated Swift manifest needed Swift tools 6.2 to build under Xcode 26.6; minimum native target is iOS 26, not the obsolete default.
3. An `INTERNAL_ONLY` export can pass VALID TestFlight and private-group checks yet ASC rejects it as an App Store version build (`409 ENTITY_ERROR.RELATIONSHIP.INVALID`). Built/uploaded build 7 with unrestricted audience, still in the *private internal* group, and verified the version→build relationship by API readback.
4. Fastlane `deliver` wrote description/keywords/subtitle/privacy before crashing on a missing review-detail response (`No data`). A narrowly scoped ASC API staging script finished the one real simulator screenshot and build attachment; screenshot state `UPLOAD_COMPLETE` verified.
5. WKWebView `capacitor://localhost` is not a shareable deep link. Share now exports the real PNG instead of copying a dead link; card/loop QR links lead to the live support site. Rich shareable-genome deep links require a later hosted web route/AASA, not a fabricated domain.
