#!/usr/bin/env python3
"""Temp wrapper to drive gen_image.py with safe JSON spec (avoids shell escaping).
Delete when done."""
import sys, json, subprocess

CARD = "plains"
OUT = "art-eval/runs/skillab-c6-plains/arm_a"

# spec passed as: gen seed mode parent prompt
gen = int(sys.argv[1])
seed = int(sys.argv[2])
mode = sys.argv[3]
parent = None if sys.argv[4] in ("null", "None", "") else int(sys.argv[4])
prompt = sys.argv[5]
spec = {"gen": gen, "seed": seed, "mode": mode, "parent": parent, "prompt": prompt}
if len(sys.argv) > 6 and sys.argv[6]:
    spec["guidance"] = float(sys.argv[6])

subprocess.run(
    [sys.executable, "art-eval/gen_image.py", "--card", CARD, "--out", OUT,
     "--spec", json.dumps(spec)],
    check=True,
)
