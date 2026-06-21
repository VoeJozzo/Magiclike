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
REMAINING = "--remaining" in sys.argv[1:]   # all sheeted cards NOT already judged
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
    # --- C5 round (diagnose-then-iterate variant) ---
    "curse_shade": "B Specter 2/2; when it dies, exile target creature (death-trigger removal).",
    "bleach": "W flash sorcery: set target creature's color to colorless, then exile it.",
    "sentinel_colossus": "Artifact Creature Construct 6/6 trample (colorless; cost 6).",
    "petrify": "W flash sorcery: target creature becomes an Artifact until end of turn (turn to stone).",
    "flame_summoner": "R Human Shaman 2/2; ETB deal 2 damage to any target.",
    "deepseam_quarry": "Artifact Land (enters tapped); taps for C, or tap+CC+sacrifice → put the greatest-cost creature from any graveyard onto the battlefield under your control.",
    "freeze_moment": "U flash sorcery: tap target creature.",
    "sky_champion": "W Spirit Warrior 2/2 flying; ETB grant flying to another creature you control.",
    "elder_of_the_grove": "G Elf Druid 1/3; taps for GG; gives your other Druids +1/+1.",
    "wildfire_devil": "R Demon 3/3; when it dies, deal 3 damage to any target.",
    "bone_reliquary": "Artifact Land Swamp; taps for B.",
    "verdant_verge": "Artifact Land Forest; taps for G.",
    "symbiote_tree": "G Treefolk 2/4; ETB give a creature you control +1/+1 and reach.",
    "archdemon_of_bargains": "B Demon 5/5 flying, trample; ETB choose 1-5, put that many boons on your permanents; when it leaves, that many burdens on the opponent's.",
    "vile_edict": "B sorcery: target opponent sacrifices a creature (edict).",
    "twin_strike": "W flash sorcery: two +1/+1 pumps, each to one creature you control.",
    "hill_giant": "R Giant 3/3 (vanilla beater).",
    "spectral_procession": "W sorcery: create three 1/1 white Spirit tokens.",
    "giant_growth": "G flash sorcery: target creature you control gets +3/+3.",
    # --- batch 2 (rounds 1-36, added for the --remaining review) ---
    "serra_angel": "W Angel 4/4 vigilance (angelic beater).",
    "awaken_the_vault": "G sorcery: target land you control becomes a 3/3 Creature until end of turn (temporary man-land).",
    "brand_of_iron": "R sorcery: target permanent permanently gains the Artifact type (metal-branding).",
    "counter_specialist": "U Human Wizard 1/4; whenever you cast a spell that counters, this gets +1/+1 permanently.",
    "crusaders_charm": "W flash modal sorcery — choose one: deal 2 to any target / +2/+2 EOT to your creature / gain 3 & draw 1.",
    "drain_life": "B sorcery: deal 2 damage to each of two targets; you gain 4 life (life-siphon).",
    "embargo": "W sorcery: return target permanent to hand and stick a +1 cost-increase sticker on it (taxing bounce).",
    "ember_anvil": "Artifact Land Mountain; taps for R.",
    "ember_herald": "R Human Shaman 1/2; ETB deal 1 damage to any target.",
    "faithless_looting": "R sorcery: draw 2, then discard 2 (rummaging).",
    "flame_lash": "R sorcery: deal 4 damage to target (burn).",
    "illusion_drake": "U Illusion Dragon 3/2 (conjured/illusory dragon; vanilla).",
    "inferno_caller": "R Human Shaman 2/3; whenever it attacks, deal 2 damage to any target.",
    "iron_statue": "W Construct Wall 0/5 indestructible (immovable defensive statue).",
    "island": "Basic Land Island; taps for U.",
    "living_lands": "G sorcery: target land you control permanently becomes a 2/2 Creature (man-land).",
    "llanowar_elves": "G Elf Druid 1/1 (classic mana-elf).",
    "martyr_saint": "W Human Cleric 1/2; when it dies, you gain 3 life.",
    "mercurial_adept": "Human Wizard 2/2 (vanilla; cost 3 generic).",
    "might_of_faith": "W flash sorcery: target creature gets +2/+2 (combat trick).",
    "mind_control": "U sorcery: gain control of target creature (permanent steal).",
    "mountain": "Basic Land Mountain; taps for R.",
    "oxen_herd": "G Beast 4/4 trample, lifelink (big green lifegain trampler).",
    "predate": "G sorcery: put +1/+1 on your creature, then it fights a target creature (bite).",
    "primal_roar": "G sorcery: your creatures all get +2/+2 (team pump).",
    "righteous_cavalry": "W Human Knight 4/3 (vanilla beater).",
    "sengir_vampire": "B Vampire 4/4 flying, lifelink; when a creature it damaged dies, it gets +1/+1 permanently.",
    "sicken": "B flash sorcery: target creature gets -2/-2 (shrink/kill).",
    "soulblade_captain": "W Human Knight 2/2; whenever you cast a spell, your creatures get +1/+0.",
    "squire_of_oaths": "W Human Soldier 2/3 (vanilla).",
    "storm_sage": "U Human Wizard 2/3; whenever another creature you control enters, draw a card.",
    "tide_charm": "U flash modal sorcery — choose one: counter target spell / bounce target creature / draw 2.",
    "vengeful_spirit": "W Spirit 2/2 flying; when it dies, destroy target creature.",
    "vine_twister": "G Treefolk 2/2; ETB give a target creature you control trample.",
    "wind_dancer": "U Faerie 1/1 flying (vanilla evasive).",
    "worldly_tutor": "G sorcery: search your library for a creature card and put it into your hand (tutor).",
    # --- C6 round (explore-wide / breadth-over-depth variant) ---
    "arcane_denial": "U flash sorcery: counter target spell; that spell's controller draws a card.",
    "blood_priest": "B Human Cleric 1/2 (vanilla; cost BC).",
    "city_guardian": "W Legendary Human Soldier 2/1 first strike.",
    "copper_golem": "Artifact Creature Construct 3/3 (colorless; cost 3).",
    "counterspell": "U flash sorcery: counter target spell (cost UU).",
    "day_of_reckoning": "W sorcery: destroy all creatures (board wipe; cost WW + 3 generic).",
    "frostbite_mage": "U Human Wizard 1/2 (vanilla; cost UC).",
    "gray_ogre": "R Ogre 2/2 (vanilla beater; cost RC).",
    "healing_light": "W flash sorcery: gain 5 life.",
    "patient_saint": "W Spirit Cleric 0/4 defender (defensive wall).",
    "phantom_warrior": "U Spirit 2/2 unblockable.",
    "plains": "Basic Land Plains; taps for W.",
    "prey_upon": "G sorcery: a creature you control fights a target creature (bite).",
    "razor_beacon": "Artifact Creature Construct 2/2 flying (colorless; cost 3).",
    "shadow_assassin": "B Human Assassin 2/2 deathtouch, menace.",
    "steel_initiate": "W Human Soldier 2/2; whenever it attacks, you gain 1 life.",
    "war_horde": "R Goblin Warrior 4/3 (vanilla beater; cost RR + 2 generic).",
    "wash_away": "U sorcery: return ALL creatures to their owners' hands (board-wide bounce).",
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
    # --remaining: every sheeted card the user has NOT already judged (resumes the
    # experiment without re-showing reviewed cards). Reads the committed verdicts file.
    judged = set()
    vpath = ART / f"verdicts_{CAND}.json"
    if vpath.exists():
        judged = set(json.loads(vpath.read_text()).get("verdicts", {}))
    batch = [c for c in ORDER if c in have]
    extra = sorted(have - set(ORDER))
    if REMAINING:
        ordered = [c for c in (batch + extra) if c not in judged]
        print(f"--remaining: {len(judged)} already judged, {len(ordered)} left to review.")
    else:
        ordered = (batch + extra) if ALL else (batch or extra)
        if not ALL and extra:
            print(f"note: scoped to the {len(batch)}-card batch; {len(extra)} other "
                  f"{CAND} runs exist (re-run with --all to include them, "
                  f"or --remaining for only the unjudged ones).")
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
