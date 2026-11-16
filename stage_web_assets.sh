#!/bin/bash
# ---------------------------------------------------------------------------
# Stage the web assets that go INSIDE the APK.
#
# app/src/main/assets/www is the source of truth and stays READABLE on purpose:
# it is what the source ZIP ships and what a human edits. The APK only needs the
# small version, so it is produced here into a throwaway directory instead of
# overwriting the source:
#
#   * dead file js/utils/utils.js dropped (defines `Utils`, zero references)
#   * unused @font-face subsets dropped (prune_fonts.py) - the 4 italic + 3
#     non-Latin Playfair faces an English-only UI can never reach
#   * JS comments / console.* debug output / dead code stripped (minify_web.py)
#   * CSS comments + whitespace stripped, inline <style> blocks minified
#   * HTML comments, indentation stripped
#
# No image is touched: assets/*.png are copied byte-for-byte.
#
# If node (or terser/csso) is missing, minification is skipped and the readable
# tree is packed instead: the app still builds and works, it is just a few
# hundred KB larger. That keeps the build usable without npm.
#
# Usage:  stage_web_assets.sh <src-www-dir> <dest-assets-dir>
# ---------------------------------------------------------------------------
set -e

SRC=${1:?usage: stage_web_assets.sh <src-www-dir> <dest-assets-dir>}
DEST=${2:?usage: stage_web_assets.sh <src-www-dir> <dest-assets-dir>}

HERE=$(cd "$(dirname "$0")" && pwd)

rm -rf "$DEST"
mkdir -p "$DEST"
cp -a "$SRC" "$DEST/www"

# the one file verified to be unreachable
rm -f "$DEST/www/js/utils/utils.js"
python3 - "$DEST/www/index.html" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
s2 = re.sub(r'\s*<script src="[^"]*utils\.js"></script>', '', s)
if s2 != s:
    open(p, 'w', encoding='utf-8').write(s2)
    print('   dead <script src=".../utils.js"> tag removed')
PY

if ! command -v node >/dev/null 2>&1; then
    echo "   node not found -> packing readable assets (unminified, larger APK)"
elif ! (cd "$HERE" && node -e "require('terser');require('csso')") >/dev/null 2>&1; then
    echo "   terser/csso not installed -> packing readable assets."
    echo "   run 'npm install' in the project root to get the smaller APK."
else
    WWW_ROOT="$DEST/www" python3 "$HERE/prune_fonts.py"
    WWW_ROOT="$DEST/www" python3 "$HERE/minify_web.py"
fi

echo "   staged www: $(du -sk "$DEST/www" | cut -f1) KB  (source: $(du -sk "$SRC" | cut -f1) KB)"
