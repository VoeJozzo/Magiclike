#!/usr/bin/env python3
"""Tiny wrapper: builds the spec dict and calls gen_image.generate directly,
sidestepping shell-escaping of the prompt JSON. DELETE when done."""
import sys, os
sys.path.insert(0, "/home/user/Magiclike/art-eval")
from gen_image import generate

OUT = "/home/user/Magiclike/art-eval/runs/skillab-c6-frostbite_mage/arm_a"
CARD = "frostbite_mage"

# spec passed as: gen seed mode parent  (prompt read from a sibling .txt by gen number)
gen = int(sys.argv[1]); seed = int(sys.argv[2])
mode = sys.argv[3] if len(sys.argv) > 3 else "explore"
parent = None if (len(sys.argv) <= 4 or sys.argv[4] == "none") else int(sys.argv[4])
guidance = float(sys.argv[5]) if len(sys.argv) > 5 else None

PROMPTS = {
 1: ("A slight blue-robed frost wizard with pale cerulean skin stands in the left "
     "foreground, one hand thrust forward casting a spell. To his right, an enemy "
     "warrior in dented steel armor recoils, his sword-arm encased in cracking blue "
     "ice, frost crusting his shoulder, the heavy sword drooping uselessly toward the "
     "ground from the frozen limb. Both figures fully visible head to knee, the same "
     "size. The background is a frozen battlefield at dusk, cracked ice underfoot, a "
     "cold sapphire sky."),
 2: ("A frost mage in sapphire-blue robes, frost rimed on his sleeves, side profile "
     "facing east, exhaling a plume of glittering ice-blue frost from his outstretched "
     "palm. The frost engulfs an enemy soldier's raised weapon arm, sheathing the arm "
     "and axe in thick rippled blue ice so the axe sags and drops. The soldier grimaces, "
     "staggering back. Two figures, both fully visible head to knee, the same size. "
     "The background is a snow-dusted ruined courtyard under a pale grey winter sky."),
 # gen 3: seed-lock tweak of gen 2 -> make the dropped weapon explicit (limp arm)
 3: ("A frost mage in sapphire-blue robes, frost rimed on his sleeves, side profile "
     "facing east, exhaling a plume of glittering ice-blue frost from his outstretched "
     "palm. The frost sheathes an enemy soldier's weapon arm in thick rippled blue ice, "
     "the frozen arm hanging limp and dead at his side, his axe slipping from numb "
     "fingers and falling point-down into the snow. The soldier grimaces, recoiling. "
     "Two figures, both fully visible head to knee, the same size. The background is a "
     "snow-dusted ruined courtyard under a pale grey winter sky."),
 # gen 4: explore -- camera on the victim, frostbite reading as the hero element
 4: ("An enemy warrior in dented steel armor staggers, his entire sword-arm encased in "
     "cracking pale-blue frostbite ice, the arm hanging useless and the longsword "
     "fallen from his grip into the snow at his feet. He clutches the frozen arm with "
     "his other hand, mouth agape. Behind him to the left, a slight frost mage in "
     "cerulean robes lowers his casting hand, faint icy mist trailing from his fingers. "
     "Both figures fully visible, the same size. The background is a frozen courtyard "
     "under a cold grey sky, snow drifting."),
}

import json
spec = {"gen": gen, "seed": seed, "mode": mode, "parent": parent, "prompt": PROMPTS[gen]}
if guidance is not None:
    spec["guidance"] = guidance
generate(CARD, OUT, spec)
