# Redaction Preflight

Audits a PDF for content that is **hidden but still recoverable**, before the file
goes out the door.

A black box drawn over a name is a rendering instruction, not a deletion. The
characters stay in the content stream, and any viewer hands them back on a
copy-paste. That is the failure behind the Manafort filing, the DOJ Epstein
release, and — by one 2026 estimate — nine out of ten "redacted" PDFs.

Existing free tools check exactly one vector: text under black boxes. This checks
eleven, including the ones that leak most often and get looked at least
(annotations, and revision history left behind by incremental saves).

Everything runs in the browser. The PDF engine is vendored next to the page, so
auditing a document makes **zero network requests** — asserted by a test, not just
claimed in the footer.

---

## Run it

It is a static page. No build step, no server-side anything.

```
python3 -m http.server 8000     # or any static host
open http://localhost:8000/
```

Deploy by copying the folder to Netlify, Cloudflare Pages, GitHub Pages, or an
internal file share. It also opens straight from disk (`file://`) in Firefox and
Safari; Chrome blocks the same-origin worker over `file://`, so use a local server
there.

## What it checks

| # | Check | Severity | Why it matters |
|---|-------|----------|----------------|
| 1 | Text under an opaque shape or image | critical | The classic un-redaction. Text is intact underneath. |
| 2 | Text in an invisible render mode (Tr 3/7) | critical | OCR layers survive image-based redaction. |
| 3 | Annotations and comment threads | critical | Live outside page content; invisible in print preview. |
| 4 | Earlier revisions from incremental saves | critical | Truncate at a prior `%%EOF` and read the pre-redaction file. |
| 5 | Embedded file attachments | critical | Frequently the unredacted source document. |
| 6 | Document metadata (Author/Title/Subject/Keywords) | warning | Routine accidental attribution. |
| 7 | Embedded local filesystem paths | warning | Leaks usernames, matter names, folder structure. |
| 8 | Form-field values | warning | Stored separately from page content. |
| 9 | Optional-content layers | warning | A hidden layer is not a redaction. |
| 10 | Identifiers in extractable text (SSN, card, email, phone, DOB, IBAN) | warning | Card numbers are Luhn-checked to cut false positives. |
| 11 | Bookmarks, JavaScript, `/OpenAction`, encryption dict | notice | Context and filing-acceptance issues. |

**What it deliberately does not do.** It reads structure, not meaning. It cannot
know whether a name belongs in the document, and it will not recover text from a
page genuinely flattened to an image with no OCR layer — which is also the one
case where nothing is left to recover. A clean result means these checks found
nothing recoverable, not that the document is fit to release.

## Layout

```
index.html    the page: intake, verdict, findings, print view
audit.js      the engine — no DOM, no network; runs in Node and the browser
vendor/       pdf.js 3.11.174 (Apache-2.0), vendored so nothing is fetched
test/         ground-truth fixtures and two suites
```

`audit.js` is deliberately free of DOM and network access so the same engine can
back a CLI or a watched-folder batch runner without being rewritten.

## Tests

Every fixture in `test/fixtures` was generated with one known failure mode and a
unique marker string. A detector passes only when it recovers that exact marker —
"found something" does not count.

```
npm install
node test/audit.test.js    # engine vs. ground truth        -> 37 assertions
node test/e2e.test.js      # the page in headless Chromium  -> 21 assertions
```

Both suites were green at the last commit: **37/37** and **21/21**.

`clean.pdf` is the control and the most important fixture in the set. A tool that
cries wolf on a clean document trains its users to ignore it, so the suite asserts
zero criticals *and* zero warnings on that file.

Two assertions guard promises rather than behaviour:

- `auditing a document made zero off-site requests` — the privacy claim.
- `text is decoded as UTF-8, not mojibake` — the test server sends no charset
  header on purpose, so this proves the page's own `<meta charset>` carries it.

## Notes

- **Fonts.** The page pulls two typefaces from Google Fonts on first load. That
  request happens before any file is chosen and carries no document content.
  Self-host them, or delete the stylesheet link, for an installation that touches
  nothing at all.
- **Big files.** Auditing is synchronous per page. A 500-page scanned exhibit will
  take a few seconds and hold the tab.
- **Encrypted PDFs.** Password-protected files are reported as unreadable rather
  than half-audited.

## Licence

pdf.js is Apache-2.0, © Mozilla Foundation — see `vendor/pdf.js-LICENSE`. The rest
of this folder is unlicensed pending a decision on how it ships.
