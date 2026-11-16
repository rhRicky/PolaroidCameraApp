/**
 * Minifier used by the release build.
 *   node minify.js js  <files...>   -> terser (drops console/debugger, mangles, strips comments)
 *   node minify.js mjs <files...>   -> terser in ES-module mode
 *   node minify.js css <files...>   -> csso (strips comments, restructures)
 */
const fs = require('fs');
const terser = require('terser');
const csso = require('csso');

(async () => {
  const [, , mode, ...files] = process.argv;
  let totalIn = 0, totalOut = 0;

  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    let out;

    if (mode === 'css') {
      out = csso.minify(src, { restructure: true }).css;
    } else {
      const r = await terser.minify(src, {
        module: mode === 'mjs',
        compress: {
          drop_console: true,      // remove all console.* debug output
          drop_debugger: true,     // remove debugger statements
          passes: 2
        },
        mangle: { reserved: ["PolaroidCore", "PhotoWall", "UIController", "Utils", "mobileFeatures", "AndroidBridge", "handleNativeResponse", "resizeTimer", "inAppWebview"] },
        format: { comments: false }  // strip every comment
      });
      if (r.error) {
        console.error('MINIFY ERROR', f, r.error);
        process.exit(1);
      }
      out = r.code;
    }

    fs.writeFileSync(f, out);
    totalIn += src.length;
    totalOut += out.length;
    console.log(`  ${f.padEnd(46)} ${String(src.length).padStart(7)} -> ${String(out.length).padStart(7)} B`);
  }
  console.log(`  ${'TOTAL'.padEnd(46)} ${String(totalIn).padStart(7)} -> ${String(totalOut).padStart(7)} B  (-${(100 - totalOut / totalIn * 100).toFixed(1)}%)`);
})();
