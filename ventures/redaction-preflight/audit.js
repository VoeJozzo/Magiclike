/*!
 * Redaction Preflight — PDF release auditor
 * Pure analysis engine. No DOM, no network. Runs in a browser or in Node.
 *
 * Usage:  const report = await audit(pdfjsLib, arrayBuffer, { fileName });
 *
 * The engine reconstructs each page's drawing operations in order so it can
 * answer the question the black box can't: was this text *covered*, or was it
 * actually *removed*? Covered text is still in the content stream and any
 * viewer will hand it over on a copy-paste.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RedactionAudit = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CRITICAL = 'critical', WARNING = 'warning', NOTICE = 'notice';

  /* ---------------------------------------------------------------- matrices
   * PDF matrices are [a b c d e f]:  (x,y) -> (a*x + c*y + e, b*x + d*y + f)
   */
  function mul(m1, m2) {
    return [
      m1[0] * m2[0] + m1[1] * m2[2],
      m1[0] * m2[1] + m1[1] * m2[3],
      m1[2] * m2[0] + m1[3] * m2[2],
      m1[2] * m2[1] + m1[3] * m2[3],
      m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
      m1[4] * m2[1] + m1[5] * m2[3] + m2[5]
    ];
  }
  function apply(m, x, y) {
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  }
  // Axis-aligned bounds of a rect pushed through a matrix.
  function rectBounds(m, x, y, w, h) {
    var p = [apply(m, x, y), apply(m, x + w, y), apply(m, x, y + h), apply(m, x + w, y + h)];
    var xs = p.map(function (q) { return q[0]; }), ys = p.map(function (q) { return q[1]; });
    return { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs),
             y0: Math.min.apply(null, ys), y1: Math.max.apply(null, ys) };
  }
  function area(b) { return Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0); }
  function intersect(a, b) {
    return { x0: Math.max(a.x0, b.x0), x1: Math.min(a.x1, b.x1),
             y0: Math.max(a.y0, b.y0), y1: Math.min(a.y1, b.y1) };
  }
  function luminance(rgb) { // rgb components 0..1
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  }

  /* --------------------------------------------------------- page walk
   * Replays the page's operator list, tracking the graphics + text state, and
   * returns every text run (with its box, colour and render mode) and every
   * opaque shape painted on the page, each tagged with its position in the
   * drawing order so we can reason about what covers what.
   */
  function walkPage(OPS, opList) {
    var runs = [], shapes = [];
    var ctm = [1, 0, 0, 1, 0, 0];
    var stack = [];
    var fill = [0, 0, 0], alpha = 1;
    var pendingRects = [];

    // text state
    var tm = null, tlm = null, fontSize = 0, charSpacing = 0, wordSpacing = 0,
        hScale = 1, leading = 0, rise = 0, renderMode = 0;

    function pushShape(bounds, kind) {
      shapes.push({ i: shapes.length + runs.length, order: order, bounds: bounds,
                    fill: fill.slice(), alpha: alpha, kind: kind });
    }

    var order = 0;
    var fns = opList.fnArray, args = opList.argsArray;

    for (var i = 0; i < fns.length; i++) {
      var fn = fns[i], a = args[i];
      order = i;

      switch (fn) {
        case OPS.save:
          stack.push({ ctm: ctm.slice(), fill: fill.slice(), alpha: alpha });
          break;
        case OPS.restore: {
          var s = stack.pop();
          if (s) { ctm = s.ctm; fill = s.fill; alpha = s.alpha; }
          break;
        }
        case OPS.transform:
          ctm = mul([a[0], a[1], a[2], a[3], a[4], a[5]], ctm);
          break;

        /* ---- colour -------------------------------------------------- */
        case OPS.setFillRGBColor:
          fill = [a[0] / 255, a[1] / 255, a[2] / 255];
          break;
        case OPS.setFillGray:
          fill = [a[0], a[0], a[0]];
          break;
        case OPS.setFillCMYKColor: {
          var c = a[0], m2 = a[1], y2 = a[2], k = a[3];
          fill = [(1 - c) * (1 - k), (1 - m2) * (1 - k), (1 - y2) * (1 - k)];
          break;
        }
        case OPS.setFillColorN:
          if (a && typeof a[0] === 'number' && a.length >= 3) {
            fill = [a[0], a[1], a[2]];
          }
          break;
        case OPS.setGState:
          if (Array.isArray(a[0])) {
            a[0].forEach(function (pair) {
              if (pair && pair[0] === 'ca' && typeof pair[1] === 'number') alpha = pair[1];
            });
          }
          break;

        /* ---- paths --------------------------------------------------- */
        case OPS.constructPath: {
          // args: [ subOps, coords ]  — we only care about whole rectangles,
          // which is what every "black box" redaction actually is.
          var subOps = a[0] || [], coords = a[1] || [], ci = 0;
          pendingRects = [];
          for (var k2 = 0; k2 < subOps.length; k2++) {
            var op = subOps[k2];
            if (op === OPS.rectangle) {
              pendingRects.push(coords.slice(ci, ci + 4));
              ci += 4;
            } else if (op === OPS.moveTo || op === OPS.lineTo) { ci += 2; }
            else if (op === OPS.curveTo) { ci += 6; }
            else if (op === OPS.curveTo2 || op === OPS.curveTo3) { ci += 4; }
            // closePath consumes nothing
          }
          break;
        }
        case OPS.fill:
        case OPS.eoFill:
        case OPS.fillStroke:
        case OPS.eoFillStroke:
        case OPS.closeFillStroke:
        case OPS.closeEOFillStroke:
          pendingRects.forEach(function (r) {
            pushShape(rectBounds(ctm, r[0], r[1], r[2], r[3]), 'rect');
          });
          pendingRects = [];
          break;

        /* ---- images: a picture pasted over text hides it just as well --- */
        case OPS.paintImageXObject:
        case OPS.paintInlineImageXObject:
        case OPS.paintImageMaskXObject:
        case OPS.paintJpegXObject:
          pushShape(rectBounds(ctm, 0, 0, 1, 1), 'image');
          break;

        /* ---- text state ---------------------------------------------- */
        case OPS.beginText:
          tm = [1, 0, 0, 1, 0, 0]; tlm = tm.slice();
          break;
        case OPS.endText:
          tm = tlm = null;
          break;
        case OPS.setFont:
          fontSize = a[1];
          break;
        case OPS.setTextMatrix:
          tm = [a[0], a[1], a[2], a[3], a[4], a[5]];
          tlm = tm.slice();
          break;
        case OPS.setCharSpacing: charSpacing = a[0]; break;
        case OPS.setWordSpacing: wordSpacing = a[0]; break;
        case OPS.setHScale: hScale = a[0] / 100; break;
        case OPS.setLeading: leading = a[0]; break;
        case OPS.setTextRise: rise = a[0]; break;
        case OPS.setTextRenderingMode: renderMode = a[0]; break;
        case OPS.moveText:
          if (tlm) { tlm = mul([1, 0, 0, 1, a[0], a[1]], tlm); tm = tlm.slice(); }
          break;
        case OPS.setLeadingMoveText:
          leading = -a[1];
          if (tlm) { tlm = mul([1, 0, 0, 1, a[0], a[1]], tlm); tm = tlm.slice(); }
          break;
        case OPS.nextLine:
          if (tlm) { tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm.slice(); }
          break;

        /* ---- text showing -------------------------------------------- */
        case OPS.nextLineShowText:
        case OPS.nextLineSetSpacingShowText:
        case OPS.showText: {
          var glyphs;
          if (fn === OPS.showText) glyphs = a[0];
          else if (fn === OPS.nextLineShowText) glyphs = a[0];
          else { wordSpacing = a[0]; charSpacing = a[1]; glyphs = a[2]; }

          if (fn !== OPS.showText && tlm) {
            tlm = mul([1, 0, 0, 1, 0, -leading], tlm);
            tm = tlm.slice();
          }
          if (!tm || !glyphs) break;

          var text = '', advance = 0;
          for (var g = 0; g < glyphs.length; g++) {
            var gl = glyphs[g];
            if (typeof gl === 'number') {           // kerning adjustment
              advance -= (gl / 1000) * fontSize * hScale;
              continue;
            }
            if (gl === null || gl === undefined) continue;
            var ch = (typeof gl === 'string') ? gl
                   : (gl.unicode !== undefined ? gl.unicode : '');
            text += ch;
            var w = (typeof gl.width === 'number') ? gl.width / 1000 : 0.5;
            advance += (w * fontSize + charSpacing +
                        (ch === ' ' ? wordSpacing : 0)) * hScale;
          }

          if (text.trim().length) {
            var trm = mul([fontSize * hScale, 0, 0, fontSize, 0, rise], mul(tm, ctm));
            var origin = apply(mul(tm, ctm), 0, rise);
            var end = apply(mul(tm, ctm), advance, rise);
            var scaleY = Math.hypot(trm[2], trm[3]) || Math.abs(fontSize);
            var x0 = Math.min(origin[0], end[0]), x1 = Math.max(origin[0], end[0]);
            var y0 = Math.min(origin[1], end[1]);
            runs.push({
              order: i,
              text: text,
              renderMode: renderMode,
              fill: fill.slice(),
              alpha: alpha,
              bounds: { x0: x0, x1: Math.max(x1, x0 + 1),
                        y0: y0 - scaleY * 0.22, y1: y0 + scaleY * 0.82 }
            });
          }
          // advance the text matrix for the next run on this line
          tm = mul([1, 0, 0, 1, advance, 0], tm);
          break;
        }
      }
    }
    return { runs: runs, shapes: shapes };
  }

  /* ------------------------------------------------------- PII patterns
   * Deliberately conservative. A false "you are leaking an SSN" costs the user
   * more trust than a missed match costs them here, because every match is
   * shown with its surrounding text for a human to confirm.
   */
  var PII = [
    { id: 'ssn',   label: 'US Social Security number',
      re: /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g },
    { id: 'card',  label: 'Payment card number', luhn: true,
      re: /\b(?:\d[ -]*?){13,19}\b/g },
    { id: 'email', label: 'Email address',
      re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
    { id: 'phone', label: 'Phone number',
      re: /\(\d{3}\)\s*\d{3}-\d{4}|\b\d{3}-\d{3}-\d{4}\b/g },
    { id: 'dob',   label: 'Date of birth',
      re: /\b(?:DOB|D\.O\.B\.|date of birth)\W{0,12}(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/gi },
    { id: 'iban',  label: 'IBAN',
      re: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g }
  ];
  var LOCAL_PATH = /(?:[A-Za-z]:\\[^\s"')<>]{2,}|\/(?:Users|home)\/[^\s"')<>]{2,})/g;

  function luhnOk(s) {
    var d = s.replace(/\D/g, '');
    if (d.length < 13 || d.length > 19) return false;
    var sum = 0, alt = false;
    for (var i = d.length - 1; i >= 0; i--) {
      var n = +d[i];
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      sum += n; alt = !alt;
    }
    return sum % 10 === 0;
  }

  function scanPII(text) {
    var hits = [];
    PII.forEach(function (p) {
      var m; p.re.lastIndex = 0;
      while ((m = p.re.exec(text)) !== null) {
        var val = m[0];
        if (p.luhn && !luhnOk(val)) continue;
        hits.push({ kind: p.id, label: p.label, value: val.trim() });
        if (hits.length > 400) break;
      }
    });
    return hits;
  }

  /* ------------------------------------------------------------ raw bytes
   * Some of the worst leaks never reach a page object at all. They live in the
   * file's revision history, its attachments, or its XMP packet.
   */
  function scanRaw(bytes) {
    var chunk = 1 << 16, s = '';
    for (var i = 0; i < bytes.length; i += chunk) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.length)));
    }
    var eofs = (s.match(/%%EOF/g) || []).length;
    var prevs = (s.match(/\/Prev\s+\d+/g) || []).length;
    return {
      text: s,
      eofMarkers: eofs,
      prevChains: prevs,
      embeddedFiles: /\/EmbeddedFile/.test(s),
      javascript: /\/JavaScript|\/JS\s*[(<]/.test(s),
      openAction: /\/OpenAction|\/AA\b/.test(s),
      optionalContent: /\/OCProperties/.test(s),
      encrypted: /\/Encrypt\s/.test(s),
      localPaths: Array.from(new Set(s.match(LOCAL_PATH) || [])).slice(0, 20)
    };
  }

  /* ================================================================ audit */
  async function audit(pdfjsLib, data, opts) {
    opts = opts || {};
    var bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    var raw = scanRaw(bytes);
    var findings = [];
    var OPS = pdfjsLib.OPS;

    function add(f) { findings.push(f); }

    var doc = await pdfjsLib.getDocument({
      data: bytes.slice(),          // pdf.js transfers/detaches the buffer
      isEvalSupported: false,
      useSystemFonts: false,
      stopAtErrors: false
    }).promise;

    /* -- 1. metadata ---------------------------------------------------- */
    var meta = null;
    try { meta = await doc.getMetadata(); } catch (e) { /* ignore */ }
    var info = (meta && meta.info) || {};
    // Author/Title/Subject/Keywords name people and matters. Creator/Producer
    // name software — a real fingerprint, but a different order of harm, and
    // folding the two together is how a tool teaches its users to ignore it.
    var identifying = [
      ['Author', info.Author], ['Title', info.Title], ['Subject', info.Subject],
      ['Keywords', info.Keywords]
    ].filter(function (p) { return p[1] && String(p[1]).trim(); });

    var toolPrints = [
      ['Creator', info.Creator], ['Producer', info.Producer]
    ].filter(function (p) { return p[1] && String(p[1]).trim(); });
    if (toolPrints.length) {
      add({
        id: 'toolprint', severity: NOTICE,
        title: 'The file names the software that produced it',
        detail: 'A workflow fingerprint rather than a disclosure. It can still be telling — ' +
                'it reveals which tool performed the redaction, and therefore which known ' +
                'weaknesses to try.',
        items: toolPrints.map(function (p) {
          return { label: p[0], value: String(p[1]).trim() };
        })
      });
    }

    if (identifying.length) {
      add({
        id: 'metadata', severity: WARNING,
        title: 'Document metadata identifies its author or origin',
        detail: 'These fields travel with the file and are visible in any viewer’s ' +
                'document-properties panel. They survive printing to PDF and are a routine ' +
                'source of accidental attribution.',
        items: identifying.map(function (p) {
          return { label: p[0], value: String(p[1]).trim() };
        })
      });
    }
    var xmpPaths = [];
    if (meta && meta.metadata && typeof meta.metadata.getRaw === 'function') {
      var xmp = meta.metadata.getRaw() || '';
      xmpPaths = Array.from(new Set(xmp.match(LOCAL_PATH) || []));
    }
    var allPaths = Array.from(new Set(raw.localPaths.concat(xmpPaths)));
    if (allPaths.length) {
      add({
        id: 'localpath', severity: WARNING,
        title: 'Local filesystem paths are embedded in the file',
        detail: 'Paths commonly expose a username, a matter or client name, and internal ' +
                'folder structure.',
        items: allPaths.map(function (p) { return { label: 'Path', value: p }; })
      });
    }

    /* -- 2. revision history -------------------------------------------- */
    if (raw.eofMarkers > 1 || raw.prevChains > 0) {
      add({
        id: 'revisions', severity: CRITICAL,
        title: 'The file retains ' + Math.max(raw.eofMarkers - 1, raw.prevChains) +
               ' earlier revision' + (Math.max(raw.eofMarkers - 1, raw.prevChains) === 1 ? '' : 's'),
        detail: 'This PDF was saved incrementally, so previous versions of its objects are ' +
                'still present in the bytes. Anyone can truncate the file at an earlier ' +
                '%%EOF and open the document as it was before your edits — including ' +
                'before the redactions. Re-save as a new, linearised file to discard history.',
        items: [
          { label: '%%EOF markers', value: String(raw.eofMarkers) },
          { label: '/Prev xref chains', value: String(raw.prevChains) }
        ]
      });
    }

    /* -- 3. attachments, scripts, layers -------------------------------- */
    var attachments = null;
    try { attachments = await doc.getAttachments(); } catch (e) { /* ignore */ }
    if (attachments && Object.keys(attachments).length) {
      add({
        id: 'attachments', severity: CRITICAL,
        title: 'The file carries embedded attachments',
        detail: 'Attached files are shipped whole inside the PDF and are frequently the ' +
                'unredacted source document.',
        items: Object.keys(attachments).map(function (k) {
          return { label: 'Attachment', value: k };
        })
      });
    } else if (raw.embeddedFiles) {
      add({
        id: 'attachments', severity: WARNING,
        title: 'An embedded-file object is present',
        detail: 'The file contains an /EmbeddedFile object. Confirm what it holds before release.',
        items: []
      });
    }
    if (raw.javascript || raw.openAction) {
      add({
        id: 'script', severity: NOTICE,
        title: 'Embedded JavaScript or an automatic action is present',
        detail: 'Not a disclosure risk by itself, but many courts and counterparties reject ' +
                'filings containing active content.',
        items: [
          { label: 'JavaScript', value: raw.javascript ? 'present' : 'none' },
          { label: 'OpenAction / additional actions', value: raw.openAction ? 'present' : 'none' }
        ]
      });
    }
    if (raw.optionalContent) {
      add({
        id: 'layers', severity: WARNING,
        title: 'The document uses optional-content layers',
        detail: 'Layers can be switched off for display while their content remains in the ' +
                'file. A hidden layer is not a redaction.',
        items: []
      });
    }

    /* -- 4. outline ----------------------------------------------------- */
    var outline = null;
    try { outline = await doc.getOutline(); } catch (e) { /* ignore */ }
    if (outline && outline.length) {
      var titles = [];
      (function walk(nodes) {
        nodes.forEach(function (n) {
          if (n.title && n.title.trim()) titles.push(n.title.trim());
          if (n.items && n.items.length) walk(n.items);
        });
      })(outline);
      if (titles.length) {
        add({
          id: 'outline', severity: NOTICE,
          title: 'Bookmarks name ' + titles.length + ' section' + (titles.length === 1 ? '' : 's'),
          detail: 'Bookmark labels persist even when the sections they point at have been ' +
                  'removed, and can describe withheld material.',
          items: titles.slice(0, 25).map(function (t) { return { label: 'Bookmark', value: t }; })
        });
      }
    }

    /* -- 5. form fields ------------------------------------------------- */
    try {
      var fields = await doc.getFieldObjects();
      if (fields) {
        var filled = [];
        Object.keys(fields).forEach(function (name) {
          (fields[name] || []).forEach(function (f) {
            var v = f && f.value;
            if (v !== undefined && v !== null && String(v).trim() !== '' && v !== false) {
              filled.push({ label: name, value: String(v).trim() });
            }
          });
        });
        if (filled.length) {
          add({
            id: 'formfields', severity: WARNING,
            title: filled.length + ' form field' + (filled.length === 1 ? '' : 's') + ' still hold data',
            detail: 'Field values are stored separately from the page content. Flattening the ' +
                    'form before release is the usual fix.',
            items: filled.slice(0, 40)
          });
        }
      }
    } catch (e) { /* not a form */ }

    /* -- 6. per-page content -------------------------------------------- */
    var covered = [], invisible = [], annots = [], allText = '';
    var pageCount = doc.numPages;

    for (var p = 1; p <= pageCount; p++) {
      var page = await doc.getPage(p);

      // annotations and their comment threads
      try {
        var list = await page.getAnnotations({ intent: 'display' });
        list.forEach(function (an) {
          // pdf.js moved annotation text to contentsObj.str in v3; keep both paths
          // so the engine survives a library bump in either direction.
          var body = String(
            (an.contentsObj && an.contentsObj.str) || an.contents || ''
          ).trim();
          var who = (an.titleObj && an.titleObj.str) || an.title || '';
          if (body) {
            annots.push({ page: p, subtype: an.subtype || 'Annotation',
                          author: String(who || '').trim(), text: body });
          }
          if (an.url) {
            annots.push({ page: p, subtype: 'Link', author: '', text: an.url, isUrl: true });
          }
        });
      } catch (e) { /* ignore */ }

      // drawing-order replay
      var walked;
      try {
        var opList = await page.getOperatorList();
        walked = walkPage(OPS, opList);
      } catch (e) {
        walked = { runs: [], shapes: [] };
      }

      walked.runs.forEach(function (run) {
        allText += run.text + '\n';

        // (a) text painted in an invisible render mode
        if (run.renderMode === 3 || run.renderMode === 7 || run.alpha === 0) {
          invisible.push({ page: p, text: run.text,
                           reason: run.alpha === 0 ? 'zero fill opacity'
                                                   : 'text render mode ' + run.renderMode });
          return;
        }

        // (b) text sitting underneath something opaque drawn after it
        var tb = run.bounds, tArea = area(tb);
        if (tArea <= 0) return;
        for (var s = 0; s < walked.shapes.length; s++) {
          var sh = walked.shapes[s];
          if (sh.order <= run.order) continue;      // drawn first => behind the text
          if (sh.alpha < 0.85) continue;            // see-through => not a redaction
          var ov = area(intersect(tb, sh.bounds)) / tArea;
          if (ov < 0.6) continue;
          covered.push({
            page: p, text: run.text,
            shape: sh.kind,
            fillLum: luminance(sh.fill),
            colour: sh.kind === 'image' ? 'image'
                  : 'rgb(' + sh.fill.map(function (v) { return Math.round(v * 255); }).join(',') + ')'
          });
          return;
        }
      });

      page.cleanup();
    }

    if (covered.length) {
      add({
        id: 'covered', severity: CRITICAL,
        title: covered.length + ' text run' + (covered.length === 1 ? ' is' : 's are') +
               ' hidden behind an opaque shape but still readable',
        detail: 'This is the failure behind every famous un-redaction. The shape is only a ' +
                'drawing instruction — the characters underneath are untouched in the ' +
                'content stream, and a copy-paste or any text extractor returns them in full.',
        exposures: covered.map(function (c) {
          return { page: c.page, text: c.text,
                   note: c.shape === 'image' ? 'covered by an image' : 'covered by a ' + c.colour + ' shape' };
        })
      });
    }
    if (invisible.length) {
      add({
        id: 'invisible', severity: CRITICAL,
        title: invisible.length + ' invisible text run' + (invisible.length === 1 ? '' : 's') +
               ' can be extracted',
        detail: 'Text drawn in an invisible render mode does not appear on screen or in print, ' +
                'but every extractor reads it. This is how an OCR layer survives an image-based ' +
                'redaction.',
        exposures: invisible.map(function (c) {
          return { page: c.page, text: c.text, note: c.reason };
        })
      });
    }
    if (annots.length) {
      var comments = annots.filter(function (a) { return !a.isUrl; });
      var links = annots.filter(function (a) { return a.isUrl; });
      if (comments.length) {
        add({
          id: 'annotations', severity: CRITICAL,
          title: comments.length + ' annotation' + (comments.length === 1 ? '' : 's') +
                 ' carry reviewer text',
          detail: 'Comments, sticky notes and markup live outside the page content. They are ' +
                  'invisible in a flattened-looking print preview and are routinely forgotten.',
          exposures: comments.map(function (a) {
            return { page: a.page, text: a.text,
                     note: a.subtype + (a.author ? ' by ' + a.author : '') };
          })
        });
      }
      if (links.length) {
        add({
          id: 'links', severity: NOTICE,
          title: links.length + ' link target' + (links.length === 1 ? '' : 's') + ' embedded',
          detail: 'Link URLs can expose internal hostnames, document-management IDs or ' +
                  'share tokens.',
          items: links.map(function (a) { return { label: 'Page ' + a.page, value: a.text }; })
        });
      }
    }

    /* -- 7. PII in whatever text remains extractable --------------------- */
    var pii = scanPII(allText);
    if (pii.length) {
      var byKind = {};
      pii.forEach(function (h) { (byKind[h.label] = byKind[h.label] || []).push(h.value); });
      add({
        id: 'pii', severity: WARNING,
        title: 'Extractable text contains ' + pii.length + ' possible identifier' +
               (pii.length === 1 ? '' : 's'),
        detail: 'These strings are readable by any text extractor. That is expected if the ' +
                'document is meant to carry them — confirm each one is intended for this ' +
                'audience.',
        items: Object.keys(byKind).map(function (k) {
          return { label: k, value: Array.from(new Set(byKind[k])).slice(0, 12).join('   ') };
        })
      });
    }

    if (raw.encrypted) {
      add({
        id: 'encrypt', severity: NOTICE,
        title: 'The document declares an encryption dictionary',
        detail: 'Permission flags (no-print, no-copy) are advisory. They do not remove content ' +
                'and are ignored by most extraction tools.',
        items: []
      });
    }

    /* -- verdict --------------------------------------------------------- */
    var counts = { critical: 0, warning: 0, notice: 0 };
    findings.forEach(function (f) { counts[f.severity]++; });
    var verdict = counts.critical ? 'fail' : (counts.warning ? 'review' : 'pass');

    var order = { critical: 0, warning: 1, notice: 2 };
    findings.sort(function (a, b) { return order[a.severity] - order[b.severity]; });

    return {
      fileName: opts.fileName || 'document.pdf',
      byteLength: bytes.length,
      pageCount: pageCount,
      producer: info.Producer || '',
      pdfVersion: info.PDFFormatVersion || '',
      verdict: verdict,
      counts: counts,
      findings: findings,
      checkedAt: new Date().toISOString()
    };
  }

  return { audit: audit, CRITICAL: CRITICAL, WARNING: WARNING, NOTICE: NOTICE,
           _walkPage: walkPage, _scanPII: scanPII, _luhnOk: luhnOk };
}));
