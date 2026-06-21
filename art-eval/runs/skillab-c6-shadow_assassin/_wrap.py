#!/usr/bin/env python3
"""Throwaway wrapper to drive gen_image.py without shell-quote pain. Delete when done."""
import sys, json, subprocess, os

CARD = "shadow_assassin"
OUT = "art-eval/runs/skillab-c6-shadow_assassin/arm_a"

def gen(spec):
    subprocess.run(
        [sys.executable, "art-eval/gen_image.py",
         "--card", CARD, "--out", OUT, "--spec", json.dumps(spec)],
        check=True)

if __name__ == "__main__":
    # spec passed as a JSON file path argument
    specs = json.load(open(sys.argv[1]))
    for s in specs:
        gen(s)
