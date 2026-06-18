#!/usr/bin/env python3
"""Build the blind art-eval review applet.

Emits `manifest.js` (window.REVIEW = {...}) consumed by index.html. The manifest
carries ONLY per-frame blind labels + their crop-box within the already-rendered
contact sheet -- never which arm a label maps to. Arm identity lives in
_meta/blind_map.json and is read here purely to count/order frames per label; it
is NOT written into the manifest, so opening the applet (or reading manifest.js)
does not unblind the reviewer or the assistant. Decode happens only via
`harness.py decode` after verdicts are in.

Usage:  python3 art-eval/review/build_review.py [cand]   # cand defaults to c4
Geometry mirrors harness.build_sheet exactly (SCALE 6, COLS 5, CW 384, CH 192,
LABEL_H 22, PAD 8).
"""
import json, re, sys
from pathlib import Path

ARGS = [a for a in sys.argv[1:] if not a.startswith("-")]
ALL = "--all" in sys.argv[1:]
CAND = (ARGS[0] if ARGS else "c4").lower()
HERE = Path(__file__).resolve().parent
ART = HERE.parent                      # art-eval/
ROOT = ART.parent                      # repo root
RUNS = ART / "runs"
SHEETS = ROOT / "docs" / "art-eval-sheets"

SCALE, LABEL_H, PAD, COLS = 6, 22, 8, 5
CW, CH = 64 * SCALE, 32 * SCALE        # 384 x 192

# Short mechanic one-liners (context for the reviewer; no arm info).
DESC = {
    "wind_drake": "U Dragon 2/2 (vanilla flier-type beater).",
    "golem_forge": "C sorcery: target land you control permanently becomes a 4/4 Artifact Creature golem.",
    "forest_forager": "G Elf Druid 2/2; ETB put a land from your library onto the battlefield tapped (ramp).",
    "symmetricize": "W flash sorcery (special): force a target creature's power/toughness into symmetry.",
    "pyromaniac": "R Human Shaman 1/1; ETB deal 1 damage to any creature or player (pinger).",
    "threaten": "R sorcery: gain control of a target opponent's creature until EOT, untap it + give haste.",
    "alloy_construct": "C Artifact Creature Construct 2/2 (vanilla; fused-metals automaton).",
    "echo_spirit": "U Spirit 1/2 flying; when it dies, bounce a target creature to hand.",
    "strength_of_the_pack": "G flash sorcery: target creature you control gets +2/+2 and trample EOT.",
    "archmage_patriarch": "U Human Wizard 2/3; anthem +1/+1 to your other Wizards; loots on each spell you cast.",
    "dross_pylon": "Artifact Land; taps for 1 colorless mana.",
    "dread_knight": "B Human Knight 4/3 menace; ETB you lose 2 life (blood-price beater).",
    "sudden_vines": "G flash sorcery: target land permanently becomes a 1/1 Creature.",
    "bear_cub": "G Bear 1/1 (vanilla; small, harmless cub).",
    "wizard_adept": "U Human Wizard 1/3; loots (draw 1, discard 1) on each spell you cast.",
    "roots_and_branches": "G flash sorcery, two targets: tap an opponent's creature + pump your creature +1/+1.",
    "gizzard_beast": "G Beast 6/4 trample (big green trampler).",
    "spitfire_bastion": "R Wall 1/3; tap to deal 1 damage to any creature or player.",
    "wall_of_omens": "W Wall 0/4; ETB draw a card (defensive cantrip).",
    "exorcist": "W Human Cleric 2/3; ETB exile a creature, its controller gains life equal to its power.",
}

# Batch draw order (rounds 37-56). Falls back to alphabetical if any are missing.
ORDER = [
    "wind_drake", "golem_forge", "forest_forager", "symmetricize", "pyromaniac",
    "threaten", "alloy_construct", "echo_spirit", "strength_of_the_pack",
    "archmage_patriarch", "dross_pylon", "dread_knight", "sudden_vines", "bear_cub",
    "wizard_adept", "roots_and_branches", "gizzard_beast", "spitfire_bastion",
    "wall_of_omens", "exorcist",
]


def real_gens(armdir):
    return sorted(
        [f for f in armdir.glob("*gen_*_seed*.png") if "_8x" not in f.name],
        key=lambda f: int(re.search(r"gen_(\d+)_seed", f.name).group(1)),
    )


def cost_str(ctx):
    c = ctx.get("cost") or {}
    if not c and ctx.get("mana"):
        return ""
    order = ["W", "U", "B", "R", "G", "C"]
    parts = []
    for k in order:
        if k in c:
            parts.append((str(c[k]) if k == "C" else "") + k if k != "C" else f"{c[k]}◇")
    # simpler: render generic (C) as a number-in-diamond, colors as letters repeated
    out = []
    for k in order:
        if k not in c:
            continue
        if k == "C":
            out.append(f"{c[k]}")
        else:
            out.append(k * int(c[k]))
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
    batch = [c for c in ORDER if c in have]
    extra = sorted(have - set(ORDER))
    ordered = (batch + extra) if ALL else (batch or extra)
    if not ALL and extra:
        print(f"note: scoped to the {len(batch)}-card batch; {len(extra)} other "
              f"{CAND} runs exist (re-run with --all to include them).")
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
            "desc": DESC.get(card, ""),
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
