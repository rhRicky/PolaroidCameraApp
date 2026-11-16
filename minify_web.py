#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Strip everything a release build does not need from app/src/main/assets/www:
  * dead files (nothing references them)
  * dead inline <script> blocks (third-party watermark config)
  * JS: comments, console.* debug output, debugger, indentation/blank lines, mangled locals
  * CSS (<style> blocks and .css files): comments, redundant whitespace, restructuring
  * HTML: comments, indentation

Safe by design: every cross-file global (PolaroidCore / PhotoWall / UIController /
mobileFeatures / AndroidBridge) is listed in `reserved` so mangling cannot break it.
Only src / href attributes are rewritten, never the element text content.

Run:  python3 minify_web.py
"""
import re, os, sys, subprocess, json, shutil

WWW = os.path.abspath(os.environ.get('WWW_ROOT')
                      or 'app/src/main/assets/www')
# the terser wrapper, resolved relative to this script so it works no matter
# which directory the build is started from
MIN = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                   'tools', 'jsmin', 'minify.js'))
NODE = shutil.which('node')

# globals that are accessed across <script> files -> must survive mangling
RESERVED = ['PolaroidCore', 'PhotoWall', 'UIController', 'Utils', 'mobileFeatures',
            'AndroidBridge', 'handleNativeResponse', 'resizeTimer', 'inAppWebview']

# ----------------------------------------------------------------- helpers
def run(mode, files):
    if not files:
        return
    cmd = [NODE, MIN, mode] + files
    r = subprocess.run(cmd, capture_output=True, text=True)
    print(r.stdout, end='')
    if r.returncode != 0:
        print(r.stderr)
        sys.exit('minify failed')


def patch_terser_reserved():
    """Inject the reserved-name list into the minify helper."""
    p = MIN
    s = open(p, encoding='utf-8').read()
    if 'reserved:' in s:
        return
    s = s.replace(
        "        mangle: true,",
        "        mangle: { reserved: %s }," % json.dumps(RESERVED))
    open(p, 'w', encoding='utf-8').write(s)


# ----------------------------------------------------------------- 0. dead code
def find_dead_files():
    """Return the explicit list of files verified to be unreachable.

    Deliberately NOT heuristic: an earlier attempt guessed the "module global"
    from the first `const X =` in a file, which mis-identified entry points
    (js/main.js -> 'loadMobileFeatures', assets/overlay.js -> 'BRIDGE') and
    deleted them. Dead files are declared explicitly and justified below:

      js/utils/utils.js - defines `Utils`; grep for `Utils` outside the file
                          returns zero hits, and its 9 members
                          (debounce/throttle/deepClone/detectDevice/
                          downloadDataURL/formatDateTime/generateRandomId/
                          playSound/randomNumber) are each referenced nowhere.
    """
    candidates = ['js/utils/utils.js']
    dead = []
    for rel in candidates:
        p = os.path.join(WWW, rel)
        if os.path.exists(p):
            dead.append(p)
    return dead


for p in find_dead_files():
    rel = p.replace(WWW + '/', '')
    print('  dead file removed: %s' % rel)
    os.remove(p)
    # also drop its <script> tag
    idx = os.path.join(WWW, 'index.html')
    s = open(idx, encoding='utf-8').read()
    s2 = re.sub(r'\s*<script src="[^"]*%s"></script>' % re.escape(os.path.basename(p)), '', s)
    if s2 != s:
        open(idx, 'w', encoding='utf-8').write(s2)
        print('    -> <script> tag removed from index.html')

# ----------------------------------------------------------------- 1. JS
patch_terser_reserved()

js_files, mjs_files = [], []
for root, _, fs in os.walk(os.path.join(WWW, 'js')):
    for f in fs:
        if not f.endswith('.js'):
            continue
        p = os.path.join(root, f)
        # ES modules (use import/export) need module mode
        txt = open(p, encoding='utf-8').read()
        if re.search(r'^\s*(export|import)\s', txt, re.M):
            mjs_files.append(p)
        else:
            js_files.append(p)

# overlay.js is a plain script too
ov = os.path.join(WWW, 'assets', 'overlay.js')
if os.path.exists(ov):
    js_files.append(ov)

print('\n  == minifying JS ==')
run('js', js_files)
print('\n  == minifying ES modules ==')
run('mjs', mjs_files)

# ----------------------------------------------------------------- 2. CSS
css_files = []
for root, _, fs in os.walk(WWW):
    for f in fs:
        if f.endswith('.css'):
            css_files.append(os.path.join(root, f))
print('\n  == minifying CSS ==')
run('css', css_files)

# ----------------------------------------------------------------- 3. index.html
idx = os.path.join(WWW, 'index.html')
s = open(idx, encoding='utf-8').read()
before = len(s)

# 3a. drop the third-party watermark config block (dead: the badge was removed)
s = re.sub(r"<script[^>]*>\s*Object\.defineProperty\(window,\s*'__YW_CONFIG__'.*?</script>", '', s, flags=re.S)

# 3b. extract <style> blocks precisely, minify, put back
blocks = []
def pull_style(m):
    blocks.append(m.group(1))
    return '\x00STYLE%d\x00' % (len(blocks) - 1)
s = re.sub(r'<style[^>]*>(.*?)</style>', pull_style, s, flags=re.S)
if blocks:
    tmpdir = '/tmp/styleblocks'
    os.makedirs(tmpdir, exist_ok=True)
    paths = []
    for i, b in enumerate(blocks):
        p = os.path.join(tmpdir, 'b%d.css' % i)
        open(p, 'w', encoding='utf-8').write(b)
        paths.append(p)
    print('\n  == minifying inline <style> blocks ==')
    run('css', paths)
    for i, p in enumerate(paths):
        s = s.replace('\x00STYLE%d\x00' % i,
                      '<style>' + open(p, encoding='utf-8').read() + '</style>')

# 3c. strip HTML comments
s = re.sub(r'<!--(?!\[if).*?-->', '', s, flags=re.S)

# 3d. collapse whitespace between tags and leading indentation
lines = s.split('\n')
out = []
for ln in lines:
    t = ln.strip()
    if not t:
        continue
    # keep <pre>/<textarea> content untouched (verified: none present)
    out.append(t)
s = '\n'.join(out)
s = re.sub(r'>\s+<', '><', s)
s = re.sub(r'\n{2,}', '\n', s)
s = s.strip() + '\n'

open(idx, 'w', encoding='utf-8').write(s)
print('\n  index.html  %d -> %d B  (-%.1f%%)' % (before, len(s), (1 - len(s) / before) * 100))
print('\nminify_web done')
