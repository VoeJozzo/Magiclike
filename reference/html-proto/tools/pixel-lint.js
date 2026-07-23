/* ============================================================================
   Magiclike — tools/pixel-lint.js
   Pixel-domain verification: the medium checking itself.

   Usage (inside run_script):
     eval(await readFile('tools/pixel-lint.js'));   // registers globalThis.PixelLint
     const id = PixelLint.fromImage(await readImage('assets/frames/frame_r.png'));
     log(PixelLint.audit(id, { palette:[...], scale:1, lines:[{col:40}] }));

   Checks:
   - paletteClosure — every pixel ∈ the declared palette. Catches AA halos,
     gradient contamination, stray colors in flat pixel art. (Main ASSET check.)
   - runDivisibility — every horizontal/vertical run of palette-colored pixels
     has length ≡ 0 (mod scale). At scale 1 (raw assets) it's trivially true;
     its purpose is RENDER audits (scale 2/3/…), where it catches non-integer
     stretches — the pt_box 15×9-drawn-into-16×10 class of bug — mechanically.
     Non-palette colors (creature art, AA text) are ignored so Tier B/C
     exceptions don't false-positive.
   - bandMap — color runs along a row/col: a structure fingerprint to diff
     an asset (or render) against its intended band layout.
   - sliceFit — every CSS `border-image` slice actually FITS the tile it names
     (insets that overflow collapse the middle region and `fill` paints
     nothing). Pure/text-based (no canvas): audits the STYLESHEET, not a render.
   - sliceSpecMatch — every slice also MATCHES the generator's intended insets
     (assets/ui/_slices.json, emitted by tools/bake/bake_ui_tiles.py). Catches
     slices that fit but are structurally wrong. See the notes on each fn.

   Slice audit usage:
     eval(await readFile('tools/pixel-lint.js'));
     const css   = await readFile('magiclike_engine.html');
     const decls = PixelLint.parseBorderImages(css);
     const dims  = {};                       // host resolves the images
     for (const d of decls) {
       const img = await readImage(d.path);   // paths are relative to the CSS
       dims[d.path] = { width: img.width, height: img.height };
     }
     log(PixelLint.sliceFit(decls, dims));    // [] === clean
     const spec = JSON.parse(await readFile('assets/ui/_slices.json'));
     log(PixelLint.sliceSpecMatch(decls, spec, {
       // #mapCanvas deliberately frames the map with a thin uniform woodbar
       // instead of the carved plank the documented slice describes.
       allow: ['woodbar_src@6,6,6,6'],
     }));                                     // [] === clean
   ============================================================================ */
globalThis.PixelLint = (() => {
  function key(d, i) { return d[i] + ',' + d[i+1] + ',' + d[i+2] + ',' + d[i+3]; }

  function fromImage(img) {
    const c = createCanvas(img.width, img.height);
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    return x.getImageData(0, 0, img.width, img.height);
  }

  function census(id) {
    const m = new Map();
    for (let i = 0; i < id.data.length; i += 4) {
      const k = key(id.data, i);
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }

  function paletteClosure(id, palette) {
    const allowed = new Set(palette);
    const bad = new Map();
    for (const [k, n] of census(id)) if (!allowed.has(k)) bad.set(k, n);
    return bad;
  }

  function runDivisibility(id, scale, palette) {
    const allowed = palette ? new Set(palette) : null;
    const bad = [];
    const W = id.width, H = id.height, d = id.data;
    function checkLine(len, get, label, idx) {
      let prev = null, start = 0;
      for (let j = 0; j <= len; j++) {
        const k = j < len ? get(j) : null;
        if (k !== prev) {
          if (prev !== null && (!allowed || allowed.has(prev)) && (j - start) % scale !== 0)
            bad.push(label + idx + ' ' + prev + ' at ' + start + ' len ' + (j - start));
          prev = k; start = j;
        }
      }
    }
    for (let y = 0; y < H; y++) checkLine(W, x => key(d, (y * W + x) * 4), 'row ', y);
    for (let x = 0; x < W; x++) checkLine(H, y => key(d, (y * W + x) * 4), 'col ', x);
    return bad;
  }

  function bandMap(id, { row, col }) {
    const d = id.data, W = id.width, H = id.height;
    const runs = []; let prev = null, start = 0;
    const len = row !== undefined ? W : H;
    const get = row !== undefined ? (i => key(d, (row * W + i) * 4)) : (i => key(d, (i * W + col) * 4));
    for (let i = 0; i <= len; i++) {
      const k = i < len ? get(i) : null;
      if (k !== prev) { if (prev !== null) runs.push(prev + ' [' + start + '-' + (i - 1) + ']'); prev = k; start = i; }
    }
    return runs;
  }

  // A 9-slice whose insets exceed the source tile's own dimensions fails
  // SILENTLY: if left+right >= width the middle column collapses to zero, so
  // `fill` has nothing to paint and the element renders as bare edge slices
  // over transparency (a hollow "black bar"). Same story for top+bottom.
  // This is what hollowed out the player info bar — an invented L8/R8 on a
  // woodbar tile only 15px wide. Nothing throws, so check declared insets
  // against real dimensions instead of trusting them.
  //
  // SCOPE — this is a DIMENSIONAL check only. It does not catch a slice that
  // fits but is still wrong for the tile's structure: the pxbtn labels-on-the-
  // shadow bug used a uniform 2 on a 72x27 tile (2+2=4 fits both axes, so it
  // passes here) when the bottom inset should have been 2 + black_off. Catching
  // that needs the consumer's slice compared against the generator's intended
  // values — sliceSpecMatch below does that, reading the bake-emitted manifest
  // (assets/ui/_slices.json, from BTN_SLICE / WOODBAR_SLICE in bake_ui_tiles.py).
  function parseBorderImages(cssText) {
    // BLIND SPOT: only matches declarations that END in a repeat keyword
    // (round/stretch/repeat/space) with plain-integer slice values. A valid
    // `border-image` that omits the keyword (defaults to stretch) or uses
    // percentages silently escapes BOTH slice checks. House style always
    // writes the keyword; keep doing that or widen this regex.
    const re = /border-image:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)\s*([\d\s]+?)(\s+fill)?\s+(?:round|stretch|repeat|space)/g;
    const out = [];
    let m;
    while ((m = re.exec(cssText)) !== null) {
      const n = m[2].trim().split(/\s+/).map(Number);
      // CSS shorthand: 1 value = all sides; 2 = T/B + R/L; 3 = T + R/L + B; 4 = T R B L.
      let T, R, B, L;
      if (n.length === 1) { T = R = B = L = n[0]; }
      else if (n.length === 2) { T = B = n[0]; R = L = n[1]; }
      else if (n.length === 3) { T = n[0]; R = L = n[1]; B = n[2]; }
      else { [T, R, B, L] = n; }
      out.push({ path: m[1], slice: { T, R, B, L }, fill: !!m[3] });
    }
    return out;
  }

  // dims: { '<path as written in the CSS>': {width, height} } — host-resolved.
  function sliceFit(decls, dims) {
    const bad = [];
    for (const d of decls) {
      const dim = dims[d.path];
      if (!dim) { bad.push({ path: d.path, why: 'no dimensions supplied' }); continue; }
      const { T, R, B, L } = d.slice;
      if (L + R >= dim.width) bad.push({ path: d.path, slice: d.slice,
        why: `L${L}+R${R}=${L + R} >= width ${dim.width} — middle column collapses, fill paints nothing` });
      if (T + B >= dim.height) bad.push({ path: d.path, slice: d.slice,
        why: `T${T}+B${B}=${T + B} >= height ${dim.height} — middle row collapses, fill paints nothing` });
    }
    return bad;
  }

  // spec: the contents of assets/ui/_slices.json, which the bake emits from its
  // own BTN_SLICE / WOODBAR_SLICE constants. This catches the class sliceFit
  // cannot: a slice that FITS the tile but doesn't match how the tile was built
  // — the pxbtn labels-on-the-shadow bug (uniform 2 on 72x27: dimensionally
  // legal, structurally wrong).
  //
  // A mismatch is not automatically a bug: a tile can be legitimately reused a
  // different way (#mapCanvas frames the map with a thin uniform woodbar rather
  // than the carved plank the slice describes). Sanctioned variants go in
  // `allow` as '<tile>@T,R,B,L' signatures, so an exception stays explicit and
  // reviewable instead of being silently tolerated by a looser rule.
  function sliceSpecMatch(decls, spec, { allow = [] } = {}) {
    const ok = new Set(allow);
    const seen = new Set(), out = [];
    for (const d of decls) {
      const tile = d.path.split('/').pop().replace(/\.png$/, '');
      const want = spec[tile];
      if (!want) continue;                       // not a 9-sliced tile
      const g = d.slice;
      const sig = tile + '@' + [g.T, g.R, g.B, g.L].join(',');
      if (ok.has(sig) || seen.has(sig)) continue;
      seen.add(sig);
      if (g.T !== want.T || g.R !== want.R || g.B !== want.B || g.L !== want.L)
        out.push({ tile, sig, got: g, want,
          why: `slice ${g.T} ${g.R} ${g.B} ${g.L} != generator's ${want.T} ${want.R} ${want.B} ${want.L}` });
    }
    return out;
  }

  // Hardcoded presentation in JS. Inline styles sit near the top of CSS's
  // specificity order, so a fixed colour/border written onto an element as it is
  // built SILENTLY beats any stylesheet rule — every reskin attempt looks valid
  // and renders unchanged. This is the trap that blocked the menu buttons
  // (START_BTN_STYLE), the prompt buttons (makeChoiceButton) and the mana pips.
  //
  // The line drawn is static vs DYNAMIC, not "inline styles are bad": a value the
  // stylesheet cannot know — a tooltip position, a per-table accent passed as
  // data, a bar width being visualised — legitimately belongs inline. So this
  // flags only literal colours and fixed border/padding/radius, which are almost
  // never computed. Returns findings; the caller decides what is a violation.
  function jsInlineStyles(source, { file = '' } = {}) {
    const STYLE = /\.style\.cssText\s*=|\.style\.[a-zA-Z]+\s*=|style=["'`]/;
    const STATIC = /#[0-9a-fA-F]{3,6}|border:\s*\d|padding:\s*\d|border-radius:\s*\d/;
    const out = [];
    source.split(/\r?\n/).forEach((line, i) => {
      if (!STYLE.test(line)) return;
      if (!STATIC.test(line)) return;          // computed value — allowed
      out.push({ file, line: i + 1, text: line.trim().slice(0, 120) });
    });
    return out;
  }

  function audit(id, { palette, scale = 1, lines = [] } = {}) {
    const cen = census(id);
    const closure = palette ? paletteClosure(id, palette) : null;
    const runs = runDivisibility(id, scale, palette);
    return {
      size: id.width + 'x' + id.height,
      colors: cen.size,
      census: [...cen.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => k + ' ×' + n),
      paletteViolations: closure ? [...closure.entries()].map(([k, n]) => k + ' ×' + n) : '(no palette declared)',
      badRuns: runs.length,
      badRunSamples: runs.slice(0, 8),
      bands: lines.map(L => ({ line: JSON.stringify(L), runs: bandMap(id, L) })),
    };
  }

  return { fromImage, census, paletteClosure, runDivisibility, bandMap, audit,
           parseBorderImages, sliceFit, sliceSpecMatch, jsInlineStyles };
})();
