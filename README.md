# Polaroid Camera — Android project

Offline Android app that wraps the Polaroid Camera web app. 

<img width="412" height="915" alt="final_phone" src="https://github.com/user-attachments/assets/6902d98d-74c7-409f-a626-354ac779aa0c" />
<img width="1080" height="1296" alt="polaroid_photo_20261116T125926" src="https://github.com/user-attachments/assets/dd2ce803-6711-47d5-acec-d85346950d3b" />



# Details
Framework APIs only (no AndroidX dependency).

---

## Requirements

| Tool | Version |
|---|---|
| JDK | 17 |
| Android SDK Platform | API 34 |
| Android SDK Build-Tools | 34.0.0 |
| Gradle | 8.7 (wrapper included) |
| Android Gradle Plugin | 8.5.2 |
| Node.js | optional - only for the smaller, minified APK (see below) |

## Build

```bash
# 1. point the build at your SDK (one time)
cp local.properties.example local.properties
#    then edit local.properties and set sdk.dir

# 2. build
./gradlew assembleDebug      # -> app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease    # -> app/build/outputs/apk/release/app-release.apk

# 3. install
./gradlew installDebug
# or:
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Both variants are signed with the bundled throwaway `app/debug.keystore`
(alias `androiddebugkey`, password `android`) so the output is installable out
of the box. **Replace it with your own key before publishing.**

`local.properties`, `node_modules/` and the `app/build/` directory are
git-ignored.

## Web assets: readable source, minified buildThe web app lives in `app/src/main/assets/www/` and is kept **readable** -
comments intact, full font set. It is the source of truth and what the source
ZIP ships.

The APK only needs the small version, so the Gradle task `stageWebAssets`
(`stage_web_assets.sh`) copies it into `app/build/stagedAssets` and:

* drops the dead `js/utils/utils.js` file and its `<script>` tag,
* prunes the 7 Playfair `@font-face` subsets an English-only UI can never
  reach (`prune_fonts.py`),
* strips JS/CSS/HTML comments, `console.*` debug output and dead code
  (`minify_web.py`, terser + csso from `package.json`).

The staged tree replaces the readable one as the APK's asset directory
(`srcDirs` is **replaced**, not appended to, so no web file appears twice).

If Node.js or the terser/csso modules are absent, staging degrades
gracefully: the readable tree is packed instead and the APK is a few hundred
KB larger. `npm install` once to get the smallest build.

## Run the checks

```bash
./gradlew lint              # Android lint
./gradlew assembleRelease   # verifies the release variant compiles+signs
```

## Project layout

```
├── settings.gradle, build.gradle, gradlew   project config
├── app/
│   ├── build.gradle                     module config, no dependencies
│   ├── debug.keystore                   throwaway debug key (replace to publish)
│   ├── release.keystore                 release key used by the CLI build
│   ├── proguard-rules.pro               empty; nothing needs keeping
│   └── src/main/
│       ├── AndroidManifest.xml          no package attribute (namespace is here)
│       ├── java/app/polaroidcam/offline/
│       │   ├── MainActivity.java        WebView host, permissions, gallery save
│       │   └── SimpleWebServer.java     read-only loopback HTTP server
│       ├── assets/www/                  the web app (English, READABLE)
│       │   ├── index.html, style.css
│       │   ├── js/                      main, core, ui, utils
│       │   └── assets/                  images, fonts, overlay.js/css
│       └── res/                         icons, strings, theme, xml config
├── stage_web_assets.sh                  shared asset staging (also used by the
│                                        command-line build, see /workspace)
├── minify_web.py, prune_fonts.py        the two staging steps
├── tools/jsmin/                         terser + csso wrapper
└── package.json                         npm manifest for the minifier
```

## Notes

### No dependencies

`app/build.gradle` has an empty `dependencies { }` on purpose. The code uses
only framework classes (`android.webkit.*`, `android.provider.MediaStore`,
`java.net.ServerSocket`, ...). If you add an AndroidX library you must also
set `android.useAndroidX=true` and add the repositories.

### Why a local HTTP server

Android WebView only grants `navigator.mediaDevices.getUserMedia()` on a
**secure origin** - `https://` or `http://127.0.0.1`. A `file://` page cannot
reach the camera, so `SimpleWebServer` exposes `assets/www` on 127.0.0.1 and
the page loads from `http://127.0.0.1:<port>/`.

If the server fails to start, the app falls back to
`file:///android_asset/www/index.html` so the user never sees a blank screen.

### Fixed page

The page must never scroll or zoom. This is enforced by the viewport meta tag,
CSS, WebView settings (`setSupportZoom(false)` etc.), an injected script after
load, and `assets/www/assets/overlay.js`, which proportionally **shrinks**
content taller than the screen (never enlarges it) and re-fits on any DOM
change.

### Saving photos

`overlay.js` overrides `HTMLAnchorElement.prototype.click` and `window.open`
so any `data:image/*` save is handed to the native bridge
(`AndroidBridge.saveImageToGallery`), which writes the exact bytes to
`Pictures/Polaroid` - no re-encoding of the photo.

### Flat storage

The app is built so its data size does not grow with use:

1. **No photo wall.** There was never a reason to keep finished photos in the
   page; the wall only showed above 1000 px wide, held each photo's full base64
   data URL (~1.4 MB) in the DOM, and shipped a 457 KB background image. It is
   gone. After the print animation the photo stays on the camera and a Download
   button appears.
2. **One photo at a time.** Starting a new photo clears the previous one (its
   Download button and its data URL). `onDestroy()` asks the page to release the
   photo *before* the WebView is destroyed, then a one-time sweep removes
   `photowall*` leftovers older builds wrote to the app's private data dir.
   Photos already saved in `Pictures/Polaroid` are never touched.
3. **Fixed port.** `SimpleWebServer` binds to a stable port (47811/47813/47817)
   instead of `new ServerSocket(0)`. Chromium keys its HTTP cache, code cache
   and DOM storage by origin and never evicts an origin it has stopped seeing,
   so a new random port on every launch stranded a fresh ~3 MB cache copy that
   was never reclaimed.
4. **No disk cache, cleaned on start and exit.** `MainActivity` sets
   `LOAD_NO_CACHE` and clears cache / web storage / cookies on startup and in
   `onDestroy()`, where the WebView is also torn down properly.
5. **Byte-exact saving.** The bytes coming from the page are already the
   finished Polaroid, so they are streamed to the gallery instead of being
   decoded into a `Bitmap` and re-encoded - which both rewrote the user's
   photo and allocated a ~5.6 MB bitmap per save. The share path is gone too,
   because `fetch(dataURL).then(r => r.blob())` made Chromium page ~1.2 MB per
   photo into its on-disk `blob_storage`.

## Permissions

| Permission | Purpose |
|---|---|
| `CAMERA` | page capture via getUserMedia |
| `INTERNET` | loopback server only (127.0.0.1) |
| `VIBRATE` | feedback during the print animation |
| `WRITE_EXTERNAL_STORAGE` | gallery save, `maxSdkVersion="28"` only |

Picking a photo uses `ACTION_GET_CONTENT`, which grants one-off access, so no
gallery-read permission is requested. Cleartext traffic is restricted to the
loopback address by `res/xml/network_security_config.xml`.
