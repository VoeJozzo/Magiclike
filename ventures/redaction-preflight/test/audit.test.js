/*
 * Ground-truth tests for the Redaction Preflight audit engine.
 *
 * Every fixture in test/fixtures was generated with one known, deliberate
 * failure mode and a unique marker string. A detector only counts as working if
 * it recovers that exact marker — "found something" is not a pass.
 *
 *   node test/audit.test.js
 *
 * Exits 0 when every assertion holds, 1 otherwise.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const { audit } = require('../audit.js');

const FIX = path.join(__dirname, 'fixtures');

let passed = 0, failed = 0;
const failures = [];

function check(name, cond, extra) {
  if (cond) { passed++; console.log(`  ok    ${name}`); }
  else {
    failed++; failures.push(name);
    console.log(`  FAIL  ${name}${extra ? '\n          ' + extra : ''}`);
  }
}

function finding(report, id) {
  return report.findings.find(f => f.id === id);
}
function exposedText(report, id) {
  const f = finding(report, id);
  if (!f) return '';
  return [
    ...(f.exposures || []).map(e => e.text),
    ...(f.items || []).map(i => `${i.label} ${i.value}`)
  ].join(' \u2022 ');
}

async function run(file) {
  const data = new Uint8Array(fs.readFileSync(path.join(FIX, file)));
  return audit(pdfjsLib, data, { fileName: file });
}

(async () => {
  console.log('\nRedaction Preflight — audit engine\n');

  /* ---- 1. text hidden under an opaque black box ---------------------- */
  console.log('fail_blackbox.pdf — text under an opaque shape');
  {
    const r = await run('fail_blackbox.pdf');
    check('verdict is fail', r.verdict === 'fail', `got "${r.verdict}"`);
    check('raises the covered-text finding', !!finding(r, 'covered'));
    check('recovers the hidden marker SECRETNAME',
      exposedText(r, 'covered').includes('SECRETNAME'),
      `exposed: ${exposedText(r, 'covered').slice(0, 160)}`);
    check('recovers the full hidden name',
      exposedText(r, 'covered').includes('Halvorsen'));
    const cov = finding(r, 'covered');
    check('does not flag the visible surrounding text',
      cov && !exposedText(r, 'covered').includes('corroborated by two witnesses'),
      `exposed: ${exposedText(r, 'covered').slice(0, 200)}`);
  }

  /* ---- 2. metadata --------------------------------------------------- */
  console.log('\nfail_metadata.pdf — identifying metadata');
  {
    const r = await run('fail_metadata.pdf');
    check('raises the metadata finding', !!finding(r, 'metadata'));
    check('reports the author address',
      exposedText(r, 'metadata').includes('m.delacroix@harlow-finch.com'));
    check('reports the draft filename in Title',
      exposedText(r, 'metadata').includes('Halvorsen-settlement-DRAFT-v7'));
    check('raises the local-path finding', !!finding(r, 'localpath'),
      'expected the C:\\Users\\... path to be detected');
    check('reports the Windows user path',
      exposedText(r, 'localpath').includes('mdelacroix'));
  }

  /* ---- 3. annotations ------------------------------------------------ */
  console.log('\nfail_annotations.pdf — reviewer comment');
  {
    const r = await run('fail_annotations.pdf');
    check('verdict is fail', r.verdict === 'fail', `got "${r.verdict}"`);
    check('raises the annotations finding', !!finding(r, 'annotations'));
    check('recovers the comment marker ANNOTSECRET',
      exposedText(r, 'annotations').includes('ANNOTSECRET'),
      `exposed: ${exposedText(r, 'annotations').slice(0, 160)}`);
    check('recovers the damaging comment body',
      exposedText(r, 'annotations').includes('client admitted fault'));
  }

  /* ---- 4. invisible text --------------------------------------------- */
  console.log('\nfail_invisible.pdf — invisible render mode');
  {
    const r = await run('fail_invisible.pdf');
    check('verdict is fail', r.verdict === 'fail', `got "${r.verdict}"`);
    check('raises the invisible-text finding', !!finding(r, 'invisible'));
    check('recovers the marker INVISIBLESECRET',
      exposedText(r, 'invisible').includes('INVISIBLESECRET'),
      `exposed: ${exposedText(r, 'invisible').slice(0, 160)}`);
    check('recovers the account number',
      exposedText(r, 'invisible').includes('4417-9920'));
    check('names render mode 3 as the reason',
      (finding(r, 'invisible')?.exposures || []).some(e => /render mode 3/.test(e.note)));
  }

  /* ---- 5. incremental revision history -------------------------------- */
  console.log('\nfail_incremental.pdf — recoverable prior revision');
  {
    const r = await run('fail_incremental.pdf');
    check('verdict is fail', r.verdict === 'fail', `got "${r.verdict}"`);
    check('raises the revisions finding', !!finding(r, 'revisions'));
    check('counts the extra %%EOF marker',
      exposedText(r, 'revisions').includes('2'),
      `items: ${exposedText(r, 'revisions')}`);
    check('detects the /Prev xref chain',
      (finding(r, 'revisions')?.items || [])
        .some(i => /Prev/.test(i.label) && Number(i.value) >= 1));
  }

  /* ---- 6. PII in extractable text ------------------------------------- */
  console.log('\nfail_pii.pdf — identifiers in live text');
  {
    const r = await run('fail_pii.pdf');
    const t = exposedText(r, 'pii');
    check('raises the PII finding', !!finding(r, 'pii'));
    check('finds the SSN', t.includes('482-19-7734'), t.slice(0, 200));
    check('finds the payment card (Luhn-valid)', t.includes('4111 1111 1111 1111'), t.slice(0, 200));
    check('finds the email', t.includes('r.halvorsen@example.com'));
    check('finds the phone number', t.includes('(415) 555-0142'));
  }

  /* ---- 7. the control: a clean file must come back clean --------------- */
  console.log('\nclean.pdf — control (false-positive check)');
  {
    const r = await run('clean.pdf');
    check('no critical findings', r.counts.critical === 0,
      `criticals: ${r.findings.filter(f => f.severity === 'critical').map(f => f.id).join(', ')}`);
    check('no warning findings', r.counts.warning === 0,
      `warnings: ${r.findings.filter(f => f.severity === 'warning').map(f => f.id).join(', ')}`);
    check('verdict is pass', r.verdict === 'pass', `got "${r.verdict}"`);
    check('does not invent covered text', !finding(r, 'covered'));
    check('does not invent invisible text', !finding(r, 'invisible'));
    check('still reports the page count', r.pageCount === 1, `got ${r.pageCount}`);
  }

  /* ---- 8. Luhn unit checks -------------------------------------------- */
  console.log('\nunit — Luhn filter');
  {
    const { _luhnOk } = require('../audit.js');
    check('accepts a valid test card', _luhnOk('4111111111111111'));
    check('rejects a near-miss', !_luhnOk('4111111111111112'));
    check('rejects a plain 16-digit sequence', !_luhnOk('1234567890123456'));
  }

  console.log(`\n${'='.repeat(52)}`);
  console.log(`TOTAL: ${passed + failed}   PASSED: ${passed}   FAILED: ${failed}`);
  if (failed) console.log(`Failing: ${failures.join(' | ')}`);
  console.log(`${'='.repeat(52)}\n`);
  process.exit(failed ? 1 : 0);
})().catch(e => {
  console.error('\nHARNESS ERROR:', e && e.stack || e);
  process.exit(1);
});
