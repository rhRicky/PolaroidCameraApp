package app.polaroidcam.offline;

import android.content.Context;
import android.content.res.AssetManager;
import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Minimal read-only HTTP server that exposes the assets directory over 127.0.0.1.
 *
 * Why it is needed: Android WebView only allows navigator.mediaDevices.getUserMedia()
 * on a secure origin (https:// or http://127.0.0.1); file:// pages cannot access the camera.
 */
public class SimpleWebServer {

    private static final String TAG = "SimpleWebServer";
    private static final Map<String, String> MIME = new HashMap<>();

    static {
        MIME.put("html", "text/html; charset=utf-8");
        MIME.put("htm", "text/html; charset=utf-8");
        MIME.put("js", "application/javascript; charset=utf-8");
        MIME.put("mjs", "application/javascript; charset=utf-8");
        MIME.put("css", "text/css; charset=utf-8");
        MIME.put("json", "application/json; charset=utf-8");
        MIME.put("png", "image/png");
        MIME.put("jpg", "image/jpeg");
        MIME.put("jpeg", "image/jpeg");
        MIME.put("webp", "image/webp");
        MIME.put("gif", "image/gif");
        MIME.put("svg", "image/svg+xml");
        MIME.put("ico", "image/x-icon");
        MIME.put("woff", "font/woff");
        MIME.put("woff2", "font/woff2");
        MIME.put("ttf", "font/ttf");
        MIME.put("mp4", "video/mp4");
        MIME.put("webm", "video/webm");
        MIME.put("wasm", "application/wasm");
        MIME.put("txt", "text/plain; charset=utf-8");
    }

    /**
     * Preferred listening ports, tried in order before falling back to an
     * ephemeral one.
     *
     * A STABLE port matters for storage: Chromium keys its HTTP cache, code
     * cache and DOM storage by origin and never evicts unused origins. An
     * ephemeral port (new ServerSocket(0)) produces a different origin on every
     * launch, so each launch strands a fresh cache copy of the whole app (~3 MB)
     * that is never reclaimed. Reusing one port keeps a single origin, which the
     * cache can reuse and which MainActivity clears on startup.
     */
    private static final int[] PREFERRED_PORTS = {47811, 47813, 47817};

    private final AssetManager assets;
    private final String root;          // Subdirectory inside assets, e.g. "www"
    private ServerSocket socket;
    private Thread acceptThread;
    private volatile boolean running;
    private final ExecutorService pool = Executors.newFixedThreadPool(4);

    public SimpleWebServer(Context ctx, AssetManager assets, String root) {
        this.assets = assets;
        this.root = (root == null || root.isEmpty()) ? "" : root;
    }

    /** Start the server and return the port it is actually listening on */
    public int start() throws IOException {
        InetAddress loopback = InetAddress.getByName("127.0.0.1");

        for (int port : PREFERRED_PORTS) {
            try {
                socket = new ServerSocket(port, 8, loopback);
                Log.i(TAG, "listening on preferred port " + port);
                break;
            } catch (IOException busy) {
                Log.w(TAG, "port " + port + " unavailable, trying next");
            }
        }
        if (socket == null) {
            // Rare fallback. Harmless because the WebView disk cache is disabled
            // in MainActivity, so no per-origin cache is left behind.
            socket = new ServerSocket(0, 8, loopback);
            Log.w(TAG, "falling back to ephemeral port " + socket.getLocalPort());
        }

        running = true;
        acceptThread = new Thread(new Runnable() {
            public void run() { loop(); }
        }, "web-server");
        acceptThread.setDaemon(true);
        acceptThread.start();
        return socket.getLocalPort();
    }

    public void stop() {
        running = false;
        try { if (socket != null) socket.close(); } catch (IOException ignored) {}
        pool.shutdownNow();
    }

    private void loop() {
        while (running) {
            try {
                final Socket client = socket.accept();
                pool.execute(new Runnable() {
                    public void run() {
                        try { handle(client); }
                        catch (Exception e) { Log.w(TAG, "handle: " + e); }
                        finally { try { client.close(); } catch (IOException ignored) {} }
                    }
                });
            } catch (IOException e) {
                if (running) Log.w(TAG, "accept: " + e);
            }
        }
    }

    private void handle(Socket client) throws IOException {
        client.setSoTimeout(8000);
        java.io.BufferedInputStream in = new java.io.BufferedInputStream(client.getInputStream());

        // Read byte by byte until \r\n\r\n to get the full request header
        java.io.ByteArrayOutputStream head = new java.io.ByteArrayOutputStream();
        int state = 0;           // State machine matching \r\n\r\n
        int b;
        while ((b = in.read()) != -1) {
            head.write(b);
            if (b == '\r' && (state == 0 || state == 2)) state++;
            else if (b == '\n' && (state == 1 || state == 3)) state++;
            else state = 0;
            if (state == 4) break;
            if (head.size() > 65536) break;   // Guard against oversized headers
        }

        String raw = head.toString("UTF-8");
        String first = raw.isEmpty() ? "" : raw.split("\r\n")[0].trim();
        String[] parts = first.split(" ");
        if (parts.length < 2) { respondError(client, 400); return; }

        String method = parts[0];
        String target = parts[1];
        if (!"GET".equals(method) && !"HEAD".equals(method)) { respondError(client, 405); return; }
        if (!target.startsWith("/")) { respondError(client, 400); return; }

        String path = URLDecoder.decode(target, "UTF-8");
        int q = path.indexOf('?');
        if (q >= 0) path = path.substring(0, q);
        if (path.isEmpty() || path.endsWith("/")) path = path + "index.html";
        while (path.startsWith("/")) path = path.substring(1);

        // Prevent directory traversal
        if (path.contains("..") || path.contains("\\")) { respondError(client, 403); return; }

        String full = root.isEmpty() ? path : root + "/" + path;

        byte[] data;
        try {
            InputStream is = assets.open(full);
            java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = is.read(buf)) != -1) bos.write(buf, 0, n);
            is.close();
            data = bos.toByteArray();
        } catch (IOException e) {
            respondError(client, 404);
            return;
        }

        String mime = guessMime(full);
        OutputStream out = client.getOutputStream();
        StringBuilder sb = new StringBuilder();
        sb.append("HTTP/1.1 200 OK\r\n");
        sb.append("Content-Type: ").append(mime).append("\r\n");
        sb.append("Content-Length: ").append(data.length).append("\r\n");
        sb.append("Cache-Control: no-store\r\n");
        sb.append("Access-Control-Allow-Origin: *\r\n");
        sb.append("Connection: close\r\n\r\n");
        out.write(sb.toString().getBytes("UTF-8"));
        if ("GET".equals(method)) out.write(data);
        out.flush();
    }

    private String guessMime(String path) {
        int dot = path.lastIndexOf('.');
        if (dot >= 0) {
            String ext = path.substring(dot + 1).toLowerCase();
            String m = MIME.get(ext);
            if (m != null) return m;
        }
        return "application/octet-stream";
    }

    private void respondError(Socket client, int code) throws IOException {
        String msg = code == 404 ? "Not Found" : code == 403 ? "Forbidden"
                : code == 405 ? "Method Not Allowed" : "Bad Request";
        byte[] body = msg.getBytes("UTF-8");
        OutputStream out = client.getOutputStream();
        out.write(("HTTP/1.1 " + code + " " + msg + "\r\n"
                + "Content-Type: text/plain; charset=utf-8\r\n"
                + "Content-Length: " + body.length + "\r\n"
                + "Connection: close\r\n\r\n").getBytes("UTF-8"));
        out.write(body);
        out.flush();
    }
}
