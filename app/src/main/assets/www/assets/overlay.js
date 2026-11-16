/* ---------------------------------------------------------------
   offline-app overlay.js
   1) Locked page: no vertical scrolling, no pinch or double-tap zoom
   2) Scale the page proportionally to fit the screen (recomputed when content grows, never clipped)
   3) Saving: hand the page's download action to the native Android bridge and store it in the system gallery
   --------------------------------------------------------------- */
(function () {
    'use strict';

    var BRIDGE = window.AndroidBridge;

    /* ============ 1. Locked viewport / proportional fit ============ */

    function viewport() {
        return {
            w: document.documentElement.clientWidth || window.innerWidth,
            h: window.innerHeight
        };
    }

    var lastScale = -1;
    var lastNatural = -1;

    function fit() {
        var dim = viewport();
        var de = document.documentElement;
        var b = document.body;
        if (!de || !b || !dim.h) return;

        // Turn scrolling off completely
        de.style.setProperty('overflow', 'hidden', 'important');
        de.style.height = '100%';
        b.style.setProperty('overflow', 'hidden', 'important');
        b.style.setProperty('position', 'fixed', 'important');
        b.style.setProperty('top', '0', 'important');
        b.style.setProperty('left', '0', 'important');
        b.style.setProperty('right', '0', 'important');
        b.style.setProperty('bottom', '0', 'important');
        b.style.height = dim.h + 'px';
        b.style.margin = '0';

        var c = document.querySelector('.container');
        if (!c) return;

        c.style.transformOrigin = 'center center';
        // Reset before measuring so the previous scale does not skew the result
        c.style.transform = 'translate(-50%, -50%)';
        c.style.position = 'absolute';
        c.style.top = '50%';
        c.style.left = '50%';
        c.style.width = dim.w + 'px';
        c.style.margin = '0';

        var natural = Math.max(c.scrollHeight, c.offsetHeight);
        if (!natural || !isFinite(natural)) return;

        // Only shrink when the content is too tall; never enlarge (enlarging can overflow horizontally)
        var s = Math.min(1, dim.h / natural);
        if (!isFinite(s) || s <= 0.05) s = 0.05;

        c.style.transform = 'translate(-50%, -50%) scale(' + s.toFixed(4) + ')';

        lastScale = s;
        lastNatural = natural;
    }

    window.__applyFixedViewport = fit;

    // Coalesce high-frequency calls with rAF
    var pending = false;
    function schedule() {
        if (pending) return;
        pending = true;
        requestAnimationFrame(function () {
            pending = false;
            try { fit(); } catch (e) { /* ignore */ }
        });
    }
    window.__scheduleFit = schedule;

    /* ============ 2. Gesture interception (fallback) ============ */

    function twoFinger(e) {
        if (e.touches && e.touches.length > 1) e.preventDefault();
    }
    document.addEventListener('touchstart', twoFinger, { passive: false });
    document.addEventListener('touchmove', twoFinger, { passive: false });
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (n) {
        document.addEventListener(n, function (e) { e.preventDefault(); }, { passive: false });
    });

    // Double-tap zoom
    var lastEnd = 0;
    document.addEventListener('touchend', function (e) {
        var now = Date.now();
        if (now - lastEnd <= 300) e.preventDefault();
        lastEnd = now;
    }, { passive: false });

    // Desktop debugging: Ctrl + wheel
    document.addEventListener('wheel', function (e) {
        if (e.ctrlKey) e.preventDefault();
    }, { passive: false });

    /* ============ 3. Save image -> system gallery ============ */

    function isImageDataUrl(u) {
        return typeof u === 'string' && u.indexOf('data:image/') === 0;
    }

    function pickName(existing) {
        if (existing && existing.indexOf('.') > 0) return existing;
        var d = new Date();
        function p(n) { return (n < 10 ? '0' : '') + n; }
        return 'polaroid_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
            + '_' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '.png';
    }

    // The page always saves through <a download href="data:image/png;base64,...">
    var nativeClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
        try {
            var href = this.getAttribute('href') || this.href;
            if (isImageDataUrl(href) && BRIDGE && BRIDGE.saveImageToGallery) {
                BRIDGE.saveImageToGallery(href, pickName(this.getAttribute('download')));
                return;   // Skip the default download
            }
        } catch (err) { /* Fall back to the default behavior */ }
        return nativeClick.apply(this, arguments);
    };

    var nativeOpen = window.open;
    window.open = function (url) {
        if (isImageDataUrl(url) && BRIDGE && BRIDGE.saveImageToGallery) {
            BRIDGE.saveImageToGallery(url, pickName(null));
            return null;
        }
        return nativeOpen.apply(window, arguments);
    };

    /* ============ 4. Startup & auto re-fit ============ */

    function boot() {
        schedule();
        [60, 200, 500, 1000, 2000, 3500, 6000].forEach(function (t) { setTimeout(schedule, t); });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
    window.addEventListener('load', boot);
    window.addEventListener('resize', function () { setTimeout(schedule, 40); });
    window.addEventListener('orientationchange', function () { setTimeout(schedule, 250); });

    // Content changes (e.g. the Download button appearing after the animation) -> re-fit
    try {
        var mo = new MutationObserver(function () { setTimeout(schedule, 60); });
        mo.observe(document.documentElement, {
            childList: true, subtree: true,
            attributes: true, attributeFilter: ['class', 'style']
        });
    } catch (e) { /* ignore */ }

    // Container size change -> re-fit
    try {
        if (window.ResizeObserver) {
            var ro = new ResizeObserver(function () { setTimeout(schedule, 60); });
            var c = document.querySelector('.container');
            if (c) ro.observe(c);
            else document.addEventListener('DOMContentLoaded', function () {
                var c2 = document.querySelector('.container');
                if (c2) ro.observe(c2);
            });
        }
    } catch (e) { /* ignore */ }

    // Fallback polling: keep re-fitting for the first 20 seconds so any async layout change is covered
    var t0 = Date.now();
    (function poll() {
        if (Date.now() - t0 < 20000) {
            schedule();
            setTimeout(poll, 500);
        }
    })();
})();
