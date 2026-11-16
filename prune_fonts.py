#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Prune unused @font-face subsets.

The app is English-only. The only characters rendered are UI labels
("Use Photo", "Use Camera", "Download", "Delete", "Back", ...) and the date
stamp ("Nov.15.2026") - all Latin-1. The bundled Google-Fonts CSS carries 7
extra subsets that can never be reached:

  * 4 italic subsets of Playfair Display - nothing uses an italic Playfair face.
    The only italic rules in the stylesheets are `.no-photos` / `.no-image-text`,
    and neither sets a font-family, so they inherit Arial from the `*` rule.
  * 3 non-Latin subsets (cyrillic / vietnamese / latin-ext) of Playfair Display.

Only "normal, latin" faces are kept; fonts.css is rewritten to match so no
request can 404. Photos are not touched.

Run:  python3 prune_fonts.py
"""
import os, re, sys

WWW = os.path.abspath(os.environ.get('WWW_ROOT')
                      or 'app/src/main/assets/www')
FDIR = os.path.join(WWW, 'assets', 'fonts')
CSS = os.path.join(FDIR, 'fonts.css')

LATIN = 'U+0000-00FF'   # marker of the latin subset


def main():
    css = open(CSS, encoding='utf-8').read()
    blocks = list(re.finditer(r'@font-face\s*\{(.*?)\}', css, re.S))
    if not blocks:
        sys.exit('no @font-face blocks found')

    keep_blocks, drop_files, keep_files = [], [], []

    for m in blocks:
        body = m.group(1)
        st = re.search(r'font-style\s*:\s*([^;]+)', body)
        st = st.group(1).strip() if st else 'normal'
        ur = re.search(r'unicode-range\s*:\s*([^;]+)', body)
        ur = ur.group(1).strip() if ur else ''
        url = re.search(r'url\(\s*([^)]+?)\s*\)', body)
        fname = url.group(1) if url else ''

        needed = (st == 'normal') and ur.startswith(LATIN)

        if needed:
            keep_blocks.append('@font-face{' + body.strip() + '}')
            if fname:
                keep_files.append(fname)
        elif fname:
            drop_files.append(fname)

    open(CSS, 'w', encoding='utf-8').write('\n'.join(keep_blocks) + '\n')

    freed = 0
    for f in drop_files:
        p = os.path.join(FDIR, f)
        if os.path.exists(p):
            sz = os.path.getsize(p)
            os.remove(p)
            freed += sz
            print('  dropped subset: %-20s %6.1f KB' % (f, sz / 1024))

    print('\n  kept %d face(s): %s' % (len(keep_blocks), ', '.join(keep_files)))
    print('  freed %.1f KB' % (freed / 1024))

    for f in keep_files:
        if not os.path.exists(os.path.join(FDIR, f)):
            sys.exit('MISSING kept font: ' + f)


if __name__ == '__main__':
    main()
