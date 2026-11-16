package app.polaroidcam.offline;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.DownloadListener;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class MainActivity extends Activity {

    private static final int REQ_PERM = 101;
    private static final int REQ_FILE_CHOOSER = 102;
    private static final int REQ_SAVE_PERM = 103;

    private WebView webView;
    private SimpleWebServer server;
    private ValueCallback<Uri[]> filePathCallback;
    private boolean usedFileFallback;

    /** Called from overlay.js: writes a base64 image into the system gallery */
    public class Bridge {
        @android.webkit.JavascriptInterface
        public void saveImageToGallery(final String dataUrl, final String fileName) {
            runOnUiThread(new Runnable() {
                public void run() { doSave(dataUrl, fileName); }
            });
        }

        @android.webkit.JavascriptInterface
        public void toast(final String msg) {
            runOnUiThread(new Runnable() {
                public void run() { toastMsg(msg); }
            });
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        // Locked viewport, all zooming disabled
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(false);
        s.setLoadWithOverviewMode(false);

        // No disk cache. Every asset is already inside the APK and is served
        // from memory by SimpleWebServer, so a disk cache only duplicates data.
        // Chromium never reclaims per-origin caches on its own, which used to
        // grow app storage without bound. LOAD_NO_CACHE + clearCache() below
        // keep the WebView data directory at a constant size.
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);

        webView.addJavascriptInterface(new Bridge(), "AndroidBridge");
        webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(new Runnable() {
                    public void run() {
                        boolean wantsVideo = false;
                        for (String res : request.getResources()) {
                            if ("android.webkit.resource.VIDEO_CAPTURE".equals(res)) wantsVideo = true;
                        }
                        if (!wantsVideo) {
                            request.deny();
                            return;
                        }
                        ensureCam(new Runnable() {
                            public void run() { request.grant(request.getResources()); }
                        }, new Runnable() {
                            public void run() {
                                toastMsg("Camera permission was not granted, so photos cannot be taken");
                                request.deny();
                            }
                        });
                    }
                });
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb,
                                             FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = cb;
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("image/*");
                try {
                    startActivityForResult(Intent.createChooser(intent, "Choose Photo"), REQ_FILE_CHOOSER);
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage cm) { return true; }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if ("http".equals(u.getScheme()) || "https".equals(u.getScheme())) {
                    if (u.getHost() != null && (u.getHost().equals("127.0.0.1") || u.getHost().equals("localhost"))) {
                        return false;  // Allow local resources
                    }
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, u));
                    } catch (Exception ignored) {}
                    return true;
                }
                return false;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request,
                                        android.webkit.WebResourceError error) {
                // If the local server is unavailable, fall back to file:// so the app never shows a blank screen
                if (request.isForMainFrame() && !usedFileFallback) {
                    usedFileFallback = true;
                    view.loadUrl("file:///android_asset/www/index.html");
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                injectScrollLock(view);
            }
        });

        // Fallback: download requests from <a download> inside the page
        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String ua, String disposition,
                                        String mime, long len) {
                // Same byte-exact path as the bridge: no Bitmap, no re-encode
                if (url != null && url.startsWith("data:")) {
                    saveDataUrl(url, "polaroid_" + stamp() + ".png");
                }
            }
        });

        // Local HTTP server: 127.0.0.1 counts as a secure origin, which getUserMedia (camera) requires
        try {
            server = new SimpleWebServer(this, getAssets(), "www");
            int port = server.start();
            runStorageCleanup();
            webView.loadUrl("http://127.0.0.1:" + port + "/index.html");
        } catch (Exception e) {
            toastMsg("Failed to start the local server:" + e.getMessage());
            webView.loadUrl("file:///android_asset/www/index.html");
        }
    }

    /**
     * Reclaim anything the WebView left behind on previous runs.
     *
     * The page only ever loads local assets and never logs in, so there is no
     * state worth persisting between launches. Dropping cache and website data
     * on startup (and again on exit) keeps the app's storage footprint flat no
     * matter how many photos are taken.
     */
    private void runStorageCleanup() {
        try {
            webView.clearCache(true);
            android.webkit.WebStorage.getInstance().deleteAllData();
            android.webkit.CookieManager cm = android.webkit.CookieManager.getInstance();
            cm.removeAllCookies(null);
            cm.flush();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                android.webkit.CookieManager.getInstance().flush();
            }
        } catch (Exception ignored) {
        }
    }

    private String stamp() {
        return new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
    }

    private void injectScrollLock(WebView view) {
        view.evaluateJavascript(
            "(function(){try{" +
            "var meta=document.querySelector('meta[name=viewport]');" +
            "if(meta)meta.setAttribute('content','width=device-width,initial-scale=1,maximum-scale=1,minimum-scale=1,user-scalable=no,viewport-fit=cover');" +
            "var d=document;d.documentElement.style.overflow='hidden';" +
            "d.addEventListener('touchstart',function(e){if(e.touches.length>1)e.preventDefault();},{passive:false});" +
            "d.addEventListener('touchmove',function(e){if(e.touches.length>1)e.preventDefault();},{passive:false});" +
            "d.addEventListener('gesturestart',function(e){e.preventDefault();});" +
            "d.addEventListener('gesturechange',function(e){e.preventDefault();});" +
            "}catch(err){}})();", null);
    }

    // ------------------------------------------------------------ Permissions

    private boolean has(String p) {
        return checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED;
    }

    private Runnable pendingGrant;
    private Runnable pendingDeny;

    /** Only the camera permission is required at runtime; picking photos uses ACTION_GET_CONTENT, which the system picker grants */
    private void ensureCam(Runnable onGranted, Runnable onDenied) {
        if (has(Manifest.permission.CAMERA)) {
            onGranted.run();
            return;
        }
        pendingGrant = onGranted;
        pendingDeny = onDenied;
        requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_PERM);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        super.onRequestPermissionsResult(code, perms, results);
        if (code == REQ_PERM) {
            boolean ok = results.length > 0;
            for (int r : results) if (r != PackageManager.PERMISSION_GRANTED) ok = false;
            if (ok) {
                if (pendingGrant != null) pendingGrant.run();
            } else {
                if (pendingDeny != null) pendingDeny.run();
            }
            pendingGrant = null;
            pendingDeny = null;
        } else if (code == REQ_SAVE_PERM) {
            boolean ok = results.length > 0;
            for (int r : results) if (r != PackageManager.PERMISSION_GRANTED) ok = false;
            if (ok && pendingSave != null) doSave(pendingSave[0], pendingSave[1]);
            else if (!ok) toastMsg("Storage permission was not granted, so the photo cannot be saved to the gallery");
            pendingSave = null;
        }
    }

    private String[] pendingSave;

    // ------------------------------------------------------------ Save to gallery

    private void doSave(String dataUrl, String fileName) {
        if (fileName == null || fileName.trim().isEmpty()) fileName = "polaroid_" + stamp() + ".png";
        if (Build.VERSION.SDK_INT <= 28 && !has(Manifest.permission.WRITE_EXTERNAL_STORAGE)) {
            pendingSave = new String[]{dataUrl, fileName};
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_SAVE_PERM);
            return;
        }
        saveDataUrl(dataUrl, fileName);
    }

    /**
     * Writes the already-encoded image bytes straight to the gallery.
     *
     * The bytes that arrive from the page ARE the finished Polaroid, so they are
     * copied verbatim. Earlier versions decoded them into a Bitmap and
     * re-encoded with Bitmap.compress(), which (a) rewrote the user's photo
     * instead of keeping it untouched and (b) allocated a full
     * 1080x1296x4 = 5.6 MB ARGB_8888 bitmap in the native heap for EVERY saved
     * photo. Those bitmaps only go away when the GC gets around to them, so
     * repeated saves made the app's memory footprint climb. Streaming the bytes
     * avoids both problems: no re-encode, no bitmap, fixed memory cost.
     */
    private void saveBytes(byte[] bytes, String fileName, String mime) {
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
                cv.put(MediaStore.Images.Media.MIME_TYPE, mime);
                cv.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Polaroid");
                cv.put(MediaStore.Images.Media.IS_PENDING, 1);
                Uri uri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
                if (uri == null) throw new IllegalStateException("Could not create the gallery entry");
                OutputStream os = getContentResolver().openOutputStream(uri);
                if (os == null) throw new IllegalStateException("Could not open the gallery entry");
                os.write(bytes);          // byte-exact copy, no re-encoding
                os.flush();
                os.close();
                cv.clear();
                cv.put(MediaStore.Images.Media.IS_PENDING, 0);
                getContentResolver().update(uri, cv, null, null);
            } else {
                File dir = new File(Environment.getExternalStoragePublicDirectory(
                        Environment.DIRECTORY_PICTURES), "Polaroid");
                if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Could not create the directory");
                File out = new File(dir, fileName);
                FileOutputStream fos = new FileOutputStream(out);
                fos.write(bytes);         // byte-exact copy, no re-encoding
                fos.flush();
                fos.close();
                sendBroadcast(new Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE, Uri.fromFile(out)));
            }
            toastMsg("Saved to gallery: Pictures/Polaroid");
        } catch (Exception e) {
            toastMsg("Save failed:" + e.getMessage());
        }
    }

    /** Reads a "data:image/png;base64,...." URL and stores it without touching the image data */
    private void saveDataUrl(String dataUrl, String fileName) {
        try {
            if (dataUrl == null || !dataUrl.startsWith("data:")) {
                throw new IllegalArgumentException("Unsupported image data");
            }
            int comma = dataUrl.indexOf(',');
            if (comma < 0) throw new IllegalArgumentException("Malformed image data");

            String header = dataUrl.substring(5, comma);          // e.g. image/png;base64
            boolean isBase64 = header.contains("base64");
            String mime = header.split(";")[0];
            if (mime.isEmpty()) mime = "image/png";

            String payload = dataUrl.substring(comma + 1);
            byte[] bytes = isBase64
                    ? Base64.decode(payload, Base64.DEFAULT)
                    : Uri.decode(payload).getBytes("UTF-8");
            if (bytes.length == 0) throw new IllegalArgumentException("Empty image data");

            saveBytes(bytes, ensureExtension(fileName, mime), mime);
        } catch (Exception e) {
            toastMsg("Save failed:" + e.getMessage());
        }
    }

    /** Gives the file the extension that matches its MIME type */
    private String ensureExtension(String fileName, String mime) {
        String ext = "image/jpeg".equals(mime) ? ".jpg"
                : "image/webp".equals(mime) ? ".webp" : ".png";
        if (fileName == null || fileName.trim().isEmpty()) {
            return "polaroid_" + stamp() + ext;
        }
        return fileName.contains(".") ? fileName : fileName + ext;
    }

    private void toastMsg(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE_CHOOSER) {
            if (filePathCallback != null) {
                Uri[] res = null;
                if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                    res = new Uri[]{data.getData()};
                }
                filePathCallback.onReceiveValue(res);
                filePathCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        // Release the page and everything it holds (the current photo's base64
        // data URL, the canvas bitmap, Blobs) so nothing survives into the next
        // launch. The photo wall is gone, so at most one photo exists at a time
        // and this also drops the legacy WebView data written by older versions.
        if (webView != null) {
            try {
                // Ask the page to drop its photo first, while it is still alive:
                // this frees the ~1.4 MB base64 string and clears the canvas
                // immediately instead of waiting for the process to exit.
                webView.evaluateJavascript(RELEASE_PHOTO_JS, null);
                webView.stopLoading();
                webView.loadUrl("about:blank");
                runStorageCleanup();
                webView.removeAllViews();
                webView.destroy();
            } catch (Exception ignored) {
            }
            webView = null;
        }
        if (server != null) server.stop();
        // One-time sweep of anything older builds may have left on disk.
        purgeLegacyFiles();
        super.onDestroy();
    }

    /**
     * Asks the page to release the photo it is currently holding: the Download
     * button, the stored data URL and the canvas pixels. Called when the app is
     * being torn down so the previous photo never carries over.
     */
    private static final String RELEASE_PHOTO_JS =
            "(function(){try{" +
            "var b=document.getElementById('smallScreenDownloadBtn');if(b)b.parentNode.removeChild(b);" +
            "var c=document.getElementById('polaroidCanvas');" +
            "if(c){var g=c.getContext('2d');if(g)g.clearRect(0,0,c.width,c.height);}" +
            "var im=document.querySelectorAll('img');" +
            "for(var i=0;i<im.length;i++){if(im[i].src&&im[i].src.indexOf('data:')===0)im[i].src='';}" +
            "}catch(e){}})();";

    /**
     * Removes files earlier versions of this app wrote into its own data dir.
     *
     * The first builds shipped a photo wall and cached it under the WebView data
     * directory, keyed by the (then random) server port. Those copies are dead
     * weight now, so they are deleted once at shutdown. Only the app's own
     * private directory is touched - the photos saved to
     * Pictures/Polaroid are never removed.
     */
    private void purgeLegacyFiles() {
        try {
            File data = getFilesDir().getParentFile();
            if (data == null) return;
            deleteMatching(new File(data, "app_webview"), "photowall");
            deleteMatching(new File(data, "cache"), "photowall");
            deleteMatching(new File(data, "app_webview"), "photo-wall");
        } catch (Exception ignored) {
        }
    }

    private void deleteMatching(File dir, String needle) {
        File[] kids = dir.listFiles();
        if (kids == null) return;
        for (File f : kids) {
            if (f.isDirectory()) {
                deleteMatching(f, needle);
            } else if (f.getName().toLowerCase(Locale.US).contains(needle)) {
                //noinspection ResultOfMethodCallIgnored
                f.delete();
            }
        }
    }
}
