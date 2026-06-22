#!/usr/bin/env python3
"""Resilient driver for arm_a grizzly_bears explore batch.

Iterates a list of (gen, seed, prompt) specs, calling gen_image.generate for
each. On transient failures (rc=28 timeout, or "maximum number of concurrent
jobs") it backs off and retries the SAME spec -- it never fabricates or
duplicates a frame. Prints one line per outcome so the parent agent can
reconcile API calls vs frames saved.

Run in background; the parent polls the log file.
"""
import sys, time, json, importlib.util, os

REPO = "/home/user/Magiclike"
OUT = "/home/user/Magiclike/art-eval/runs/skillab-prod-grizzly_bears/arm_a"
CARD = "grizzly_bears"

# Load the helper module
spec_path = os.path.join(REPO, "art-eval", "gen_image.py")
spec = importlib.util.spec_from_file_location("gen_image", spec_path)
gen_image = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen_image)

# Remaining specs: gen 1 already saved (seed 459913195). Pool seeds available:
# 459913195(used), 1750057316, 906360648, 1484728453, 2102173465,
# 525908910, 608985410, 1145271703, 1698283273, 998398224
SPECS = [
    (2, 906360648,
     "A large grizzly bear with thick weathered brown-grey fur in a side profile facing south-west, lumbering forward in a low heavy walk, head lowered and shoulders hunched, muscles shifting under the hide. The background is a sunlit forest clearing of tall green ferns and birch trunks, with dappled light across the mossy ground."),
    (3, 1750057316,
     "A grizzly bear with shaggy cinnamon-brown fur standing knee-deep in a rushing mountain river, head plunging down to snatch a silver salmon, water spraying in droplets around its jaws. The background is a green pine gorge with wet grey boulders and white rapids."),
    (4, 1484728453,
     "A huge grizzly bear charging head-on toward the viewer at ground level, coarse dark-brown fur, mouth wide showing teeth, front paws pounding the dirt, motion blur of churned earth behind it. The background is a shadowed green forest of close pine trunks and undergrowth."),
    (5, 2102173465,
     "A grizzly bear with thick honey-brown fur seen from a low worm's-eye angle, looming over the viewer, forepaw and curved black claws swiping downward. The background is dense emerald forest canopy above with shafts of golden light breaking through."),
    (6, 525908910,
     "A grizzly bear with grizzled silver-brown fur standing four-legged on a moss-covered boulder, head turned to face the viewer with small dark eyes, alert and heavy-shouldered. The background is a deep green old-growth forest with fern undergrowth and a misty creek behind."),
    (7, 608985410,
     "Two grizzly bears with coarse brown fur, both fully visible, wrestling and reared against each other in a forest clearing, paws locked, jaws snapping. The background is tall green grass and birch saplings under soft overcast light."),
    (8, 1145271703,
     "A grizzly bear with damp dark-brown fur emerging from behind a thicket of green ferns, only its massive head and shoulders pushing through the foliage toward the viewer, eyes catching the light. The background is a shadowed undergrowth of moss and leaf litter."),
    (9, 1698283273,
     "A grizzly bear with thick brown fur rearing on hind legs to claw a tree trunk, marking its territory, long back muscles stretched, claws raking bark. The background is a sunlit pine forest with golden dust motes in the air and green moss on the ground."),
    (10, 998398224,
     "A grizzly bear with rich umber fur in a three-quarter view, mid-stride and lumbering down a forest trail strewn with fallen autumn leaves, breath misting in cool air. The background is a deep-green forest with amber light and distant ferns."),
]

MAX_ATTEMPTS = 40   # per spec, generous given the contention
saved = 0
failed_final = 0

for gen, seed, prompt in SPECS:
    ok = False
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            fn = gen_image.generate(CARD, OUT, {
                "gen": gen, "seed": seed, "mode": "explore",
                "parent": None, "prompt": prompt})
            print(f"SAVED gen {gen} seed {seed} -> {fn}", flush=True)
            saved += 1
            ok = True
            time.sleep(8)   # small gap so we don't instantly re-saturate
            break
        except Exception as e:
            msg = str(e)
            if "concurrent jobs" in msg:
                print(f"RETRY gen {gen} attempt {attempt}: concurrency cap; backoff", flush=True)
                time.sleep(35)
            elif "timed-out" in msg or "rc=28" in msg or "empty" in msg:
                print(f"RETRY gen {gen} attempt {attempt}: timeout; backoff", flush=True)
                time.sleep(45)
            else:
                print(f"RETRY gen {gen} attempt {attempt}: {msg[:120]}", flush=True)
                time.sleep(30)
    if not ok:
        print(f"FAILED gen {gen} seed {seed}: exhausted {MAX_ATTEMPTS} attempts", flush=True)
        failed_final += 1

print(f"DONE saved={saved} failed={failed_final}", flush=True)
