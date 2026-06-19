#!/usr/bin/env python3
"""Temporary wrapper to drive gen_image.py with long prompts (no shell escaping)."""
import sys, json, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from gen_image import generate

OUT = os.path.dirname(__file__)
CARD = "deepseam_quarry"

BASELINE = ("Wide shot across a vast dark quarry pit. Far across the quarry, set into the "
    "towering layered rock-strata wall, is an enormous flat fossil slab: the colossal skeleton "
    "of a horned beast locked in the classic museum death pose, neck and skull thrown backward "
    "over an arched C-curved spine with the tail curving up to meet the head. It is a FLAT "
    "petrified imprint pressed sideways into the grey slate, a dark stone silhouette at the same "
    "level as the rock, NOT three-dimensional, NOT standing. Stepped quarry ledges and tiny human "
    "figures for scale make the fossil read as ENORMOUS. A cold blue-white necromantic glow traces "
    "a mineral seam across the slab. Deep mine quarry, colorless earthen palette.")

PROMPTS = {"__BASELINE__": BASELINE}

spec = json.loads(sys.argv[1])
p = spec.get("prompt")
if p in PROMPTS:
    spec["prompt"] = PROMPTS[p]
generate(CARD, OUT, spec)
