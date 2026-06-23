#!/usr/bin/env python3
"""Build the blind contact-sheet review applet (generalized skill tool).

Emits `manifest.js` (`window.REVIEW = {...}`) consumed by index.html. The manifest
carries ONLY per-frame blind labels + their crop-box within an already-rendered
contact sheet -- never which arm/source a label maps to. So opening the applet (or
reading manifest.js) does not unblind the reviewer or the assistant.

This builder targets the art-eval A/B harness layout:
  art-eval/runs/skillab-<cand>-<card>/{arm_a,arm_b}/<card>_gen_NN_seed*.png
  art-eval/runs/skillab-<cand>-<card>/_meta/blind_map.json   # {"1":arm,"2":arm}
  docs/art-eval-sheets/<card>_<cand>ab_sheet.png             # pre-rendered sheet
Geometry mirrors harness.build_sheet exactly (SCALE 6, COLS 5, CW 384, CH 192,
LABEL_H 22, PAD 8).

REUSING THE APPLET FOR A NON-A/B SPREAD: the index.html UI is fully general -- it
just consumes `window.REVIEW`. If your batch isn't in the A/B harness shape, skip
this builder and emit the same payload yourself. The contract:

  window.REVIEW = {
    "cand":  "<batch-id>",               # label shown in the UI + localStorage key
    "cw": 384, "ch": 192,                 # cell pixel size inside the sheet
    "cards": [{
      "id": "<card_id>", "name": "...", "cost": "...", "typeline": "...",
      "desc": "<one-line mechanic note, no source info>",
      "sheet": "<sheet filename under SHEETDIR>",
      "sw": <sheet width>, "sh": <sheet height>,
      "cells": [{"label":"1.01","pool":"1","x":<px>,"y":<px>}, ...]  # crop boxes
    }, ...]
  }

Then run `bundle.py` to inline everything into one phone-openable HTML.

Usage:  python3 build_review.py [cand]            # cand defaults to c4
        python3 build_review.py [cand] --all       # include all <cand> runs
        python3 build_review.py [cand] --remaining  # only cards not yet judged
"""
import json, re, sys
from pathlib import Path

ARGS = [a for a in sys.argv[1:] if not a.startswith("-")]
ALL = "--all" in sys.argv[1:]
REMAINING = "--remaining" in sys.argv[1:]   # all sheeted cards NOT already judged
CAND = (ARGS[0] if ARGS else "c4").lower()


def repo_root() -> Path:
    """Walk up from this file until the repo root (marked by project.godot)."""
    p = Path(__file__).resolve()
    for parent in p.parents:
        if (parent / "project.godot").exists():
            return parent
    raise SystemExit("could not locate repo root (no project.godot found above this file)")


HERE = Path(__file__).resolve().parent
ROOT = repo_root()
ART = ROOT / "art-eval"
RUNS = ART / "runs"
SHEETS = ROOT / "docs" / "art-eval-sheets"

SCALE, LABEL_H, PAD, COLS = 6, 22, 8, 5
CW, CH = 64 * SCALE, 32 * SCALE        # 384 x 192


def real_gens(armdir):
    return sorted(
        [f for f in armdir.glob("*gen_*_seed*.png") if "_8x" not in f.name],
        key=lambda f: int(re.search(r"gen_(\d+)_seed", f.name).group(1)),
    )


def cost_str(ctx):
    c = ctx.get("cost") or {}
    out = []
    for k in ["W", "U", "B", "R", "G", "C"]:
        if k not in c:
            continue
        out.append(f"{c[k]}" if k == "C" else k * int(c[k]))
    return "".join(out)


def type_line(ctx):
    t = " ".join(ctx.get("types", []))
    pt = ""
    if "power" in ctx or "toughness" in ctx:
        pt = f"  {ctx.get('power', 0)}/{ctx.get('toughness', 0)}"
    kw = ctx.get("keywords") or []
    kws = ("  — " + ", ".join(kw)) if kw else ""
    return (t + pt + kws).strip()


def build():
    cards = []
    have = {p.name.split("skillab-%s-" % CAND, 1)[-1]
            for p in RUNS.glob(f"skillab-{CAND}-*") if (p / "_meta" / "blind_map.json").exists()}
    # --remaining: every sheeted card the user has NOT already judged (resumes a
    # review without re-showing reviewed cards). Reads the committed verdicts file.
    judged = set()
    vpath = ART / f"verdicts_{CAND}.json"
    if vpath.exists():
        judged = set(json.loads(vpath.read_text()).get("verdicts", {}))
    ordered = sorted(have)
    if REMAINING:
        ordered = [c for c in ordered if c not in judged]
        print(f"--remaining: {len(judged)} already judged, {len(ordered)} left to review.")
    for card in ordered:
        rd = RUNS / f"skillab-{CAND}-{card}"
        bm = json.loads((rd / "_meta" / "blind_map.json").read_text())  # {"1":arm,"2":arm}
        ctx_path = rd / "card_context.json"
        ctx = json.loads(ctx_path.read_text()) if ctx_path.exists() else {}
        sheet = f"{card}_{CAND}ab_sheet.png"
        if not (SHEETS / sheet).exists():
            continue
        # cells in the SAME flat order build_sheet uses: label 1 frames, then label 2.
        cells = []
        idx = 0
        for lbl in ("1", "2"):
            n = len(real_gens(rd / bm[lbl]))
            for i in range(1, n + 1):
                r, c = divmod(idx, COLS)
                x = PAD + c * (CW + PAD)
                y = PAD + r * (CH + LABEL_H + PAD)
                cells.append({"label": f"{lbl}.{i:02d}", "pool": lbl, "x": x, "y": y})
                idx += 1
        rows = (len(cells) + COLS - 1) // COLS
        sw = COLS * CW + (COLS + 1) * PAD
        sh = rows * (CH + LABEL_H) + (rows + 1) * PAD
        cards.append({
            "id": card,
            "name": ctx.get("name", card),
            "cost": cost_str(ctx),
            "typeline": type_line(ctx),
            "desc": ctx.get("desc", ""),   # optional one-liner; harness ctx has none by default
            "sheet": sheet,
            "sw": sw, "sh": sh,
            "cells": cells,
        })
    payload = {"cand": CAND, "cw": CW, "ch": CH, "cards": cards}
    out = HERE / "manifest.js"
    out.write_text("window.REVIEW = " + json.dumps(payload, indent=1) + ";\n")
    print(f"wrote {out}  ({len(cards)} cards, {sum(len(c['cells']) for c in cards)} frames)")


if __name__ == "__main__":
    build()
