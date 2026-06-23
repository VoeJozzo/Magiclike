#!/usr/bin/env python3
"""Bundle the review applet into ONE self-contained HTML (images inlined).

Reads index.html + manifest.js + the referenced sheet PNGs and writes
review-bundle.html with the manifest inlined and every sheet embedded as a
base64 data: URI (via window.SHEETDATA). No external files, no server, no
relative paths -- openable by tapping it on a phone. Still blind: SHEETDATA is
keyed by sheet filename only; no arm identity anywhere.

Usage:  python3 research/review/bundle.py [cand]
"""
import base64, json, sys
from pathlib import Path

CAND = (sys.argv[1] if len(sys.argv) > 1 else "c4").lower()
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SHEETS = ROOT / "docs" / "art-eval-sheets"

html = (HERE / "index.html").read_text()
manifest = (HERE / "manifest.js").read_text()
man = json.loads(manifest.split("=", 1)[1].rsplit(";", 1)[0])

data = {}
for card in man["cards"]:
    p = SHEETS / card["sheet"]
    b64 = base64.b64encode(p.read_bytes()).decode()
    data[card["sheet"]] = "data:image/png;base64," + b64

inline = (
    "<script>\n" + manifest + "\n"
    "window.SHEETDATA = " + json.dumps(data) + ";\n</script>"
)
# replace the external manifest include with the inlined manifest + sheet data
out_html = html.replace('<script src="manifest.js"></script>', inline)
assert "SHEETDATA" in out_html and 'src="manifest.js"' not in out_html, "inline failed"

out = HERE / "review-bundle.html"
out.write_text(out_html)
print(f"wrote {out}  ({out.stat().st_size/1e6:.2f} MB, {len(data)} sheets inlined)")
