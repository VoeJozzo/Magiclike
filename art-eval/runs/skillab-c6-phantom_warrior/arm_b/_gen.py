#!/usr/bin/env python3
"""Tiny wrapper to avoid shell-escaping the prompt JSON. DELETE when done."""
import json, subprocess, sys, os

OUT = "art-eval/runs/skillab-c6-phantom_warrior/arm_b"
CARD = "phantom_warrior"

def run(gen, seed, prompt, mode="explore", parent=None, guidance=None):
    spec = {"gen": gen, "seed": seed, "mode": mode, "parent": parent, "prompt": prompt}
    if guidance is not None:
        spec["guidance"] = guidance
    cmd = ["python3", "art-eval/gen_image.py", "--card", CARD, "--out", OUT,
           "--spec", json.dumps(spec)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    print("STDOUT:", r.stdout.strip())
    if r.stderr.strip():
        print("STDERR:", r.stderr.strip())
    return r.returncode

if __name__ == "__main__":
    idx = int(sys.argv[1])
    PROMPTS[idx]()
