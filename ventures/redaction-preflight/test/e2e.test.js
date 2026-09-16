/*
 * End-to-end check: does the page actually surface what the engine finds?
 *
 * Drives index.html in headless Chromium against the same ground-truth
 * fixtures. The CDN requests are fulfilled from node_modules so the test is
 * deterministic and needs no network.
 *
 *   node test/e2e.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.pdf': 'application/pdf' };

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { passed++; console.log(`  ok    ${name}`); }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${extra ? '\n          ' + extra : ''}`); }
}

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end('no');
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  console.log('\nRedaction Preflight — page end-to-end\n');

  // Use the browser already present in this environment rather than downloading
  // one that matches the installed Playwright build.
  const PREINSTALLED = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await chromium.launch(
    fs.existsSync(PREINSTALLED) ? { executablePath: PREINSTALLED } : {}
  );
  const page = await browser.newPage();

  // pdf.js is vendored alongside the page, so nothing needs intercepting for it.
  // Fonts are cosmetic; block them so the run stays fully offline. A glob is
  // unreliable against the host here, so match on the parsed hostname.
  await page.route(
    url => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com',
    route => route.abort()
  );

  // Real JS exceptions are fatal. A failed load for the webfont this test
  // deliberately blocks is not, so it is filtered rather than tolerated
  // wholesale — an unexpected failed resource still fails the run.
  const errors = [];
  const FONT_HOSTS = /fonts\.(googleapis|gstatic)\.com/;
  page.on('pageerror', e => errors.push('pageerror: ' + String(e)));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const from = (m.location() && m.location().url) || '';
    if (FONT_HOSTS.test(from) || FONT_HOSTS.test(m.text())) return;
    errors.push(m.text() + (from ? '  <- ' + from : ''));
  });
  page.on('requestfailed', r => {
    if (FONT_HOSTS.test(r.url())) return;
    errors.push('requestfailed: ' + r.url());
  });

  await page.goto(`${base}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  /* ---- opens in a working state ------------------------------------- */
  console.log('first paint — sample report');
  check('sample report is rendered at rest', await page.locator('.verdict').count() > 0);
  check('sample is flagged as a sample',
    (await page.locator('.sample-flag').first().textContent() || '').toLowerCase().includes('sample'));
  check('recovered text is masked by default',
    await page.locator('.bar.revealed').count() === 0);
  check('no JS errors on load', errors.length === 0, errors.join(' | '));
  {
    // The test server sends no charset header on purpose, so this proves the
    // page's own <meta charset> is carrying the encoding.
    const t = await page.locator('.wrap').innerText();
    check('text is decoded as UTF-8, not mojibake',
      !/Â|â€/.test(t),
      (t.match(/.{0,18}(Â|â€).{0,18}/) || [''])[0]);
    check('em dash renders correctly', t.includes('—'));
  }

  /* ---- the reveal interaction --------------------------------------- */
  console.log('\ninteraction — redaction bar');
  await page.locator('.bar').first().click();
  check('clicking a bar reveals it', await page.locator('.bar.revealed').count() === 1);
  {
    // If the revealed background ever fails to resolve, the bar stays black
    // while the text turns dark and the recovered text becomes unreadable —
    // the one thing this product exists to show. Wait out the 120ms fade
    // first, or this measures a colour part-way through the transition.
    await page.waitForTimeout(300);
    const c = await page.locator('.bar.revealed').first().evaluate(el => {
      const s = getComputedStyle(el);
      const lum = v => { const [r, g, b] = v.match(/\d+/g).map(Number);
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
      return { bg: lum(s.backgroundColor), fg: lum(s.color) };
    });
    check('revealed text contrasts with its background',
      Math.abs(c.bg - c.fg) > 0.4, `bg lum ${c.bg.toFixed(2)} vs text lum ${c.fg.toFixed(2)}`);
  }
  await page.locator('#revealall').click();
  const total = await page.locator('.bar').count();
  check('reveal-all reveals every bar', await page.locator('.bar.revealed').count() === total,
    `${await page.locator('.bar.revealed').count()} of ${total}`);
  await page.locator('#revealall').click();
  check('reveal-all toggles back to hidden', await page.locator('.bar.revealed').count() === 0);

  /* ---- a real file, end to end --------------------------------------- */
  console.log('\nupload — fail_blackbox.pdf');
  // From here on, every outbound request is recorded. The product's central
  // promise is that choosing a document causes no third-party traffic at all,
  // so that promise is asserted rather than merely written in the footer.
  const offsite = [];
  page.on('request', r => {
    const h = new URL(r.url()).hostname;
    if (h !== '127.0.0.1' && h !== 'localhost') offsite.push(r.url());
  });
  await page.locator('#picker').setInputFiles(path.join(__dirname, 'fixtures', 'fail_blackbox.pdf'));
  await page.waitForFunction(() => !document.querySelector('.sample-flag'), null, { timeout: 20000 });
  await page.waitForTimeout(200);

  const body = await page.locator('#results').innerText();
  check('verdict is "Do not release"', body.includes('Do not release'), body.slice(0, 120));
  check('filename is shown', body.includes('fail_blackbox.pdf'));
  check('the hidden marker reaches the page', body.includes('SECRETNAME'),
    'SECRETNAME not found in rendered output');
  check('the covered-text finding is rendered',
    body.toLowerCase().includes('hidden behind an opaque shape'));
  check('sample report was replaced', await page.locator('.sample-flag').count() === 0);
  check('still no JS errors', errors.length === 0, errors.join(' | '));
  check('auditing a document made zero off-site requests', offsite.length === 0,
    offsite.join(' | '));

  /* ---- clean control through the UI ---------------------------------- */
  console.log('\nupload — clean.pdf (control)');
  await page.locator('#picker').setInputFiles(path.join(__dirname, 'fixtures', 'clean.pdf'));
  await page.waitForFunction(
    () => /No recoverable content found/.test(document.getElementById('results').innerText),
    null, { timeout: 20000 });
  const clean = await page.locator('#results').innerText();
  check('clean file reports no recoverable content', clean.includes('No recoverable content found'));
  check('clean file shows zero criticals',
    (await page.locator('.tally.c b').first().textContent()) === '0');
  check('clean file exposes no redaction bars', await page.locator('.bar').count() === 0);

  /* ---- responsive ----------------------------------------------------- */
  console.log('\nlayout — phone width');
  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForTimeout(150);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('no horizontal page scroll at 390px', overflow <= 0, `overflow ${overflow}px`);

  await page.screenshot({ path: path.join(__dirname, 'screenshot-mobile.png'), fullPage: false });
  await page.setViewportSize({ width: 1180, height: 1000 });
  await page.locator('#picker').setInputFiles(path.join(__dirname, 'fixtures', 'fail_blackbox.pdf'));
  await page.waitForTimeout(1200);
  await page.locator('.bar').first().click();
  await page.screenshot({ path: path.join(__dirname, 'screenshot.png'), fullPage: true });

  await browser.close();
  server.close();

  console.log(`\n${'='.repeat(52)}`);
  console.log(`TOTAL: ${passed + failed}   PASSED: ${passed}   FAILED: ${failed}`);
  if (failed) console.log(`Failing: ${failures.join(' | ')}`);
  console.log(`${'='.repeat(52)}\n`);
  process.exit(failed ? 1 : 0);
})().catch(e => {
  console.error('\nHARNESS ERROR:', (e && e.stack) || e);
  server.close();
  process.exit(1);
});
