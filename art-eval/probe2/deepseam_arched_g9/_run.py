#!/usr/bin/env python3
"""Temporary wrapper to drive gen_image.py without shell-quoting the long prompt."""
import sys, json, subprocess, os

CARD = "deepseam_quarry"
OUT = "art-eval/probe2/deepseam_arched_g9"
GEN_IMAGE = "art-eval/gen_image.py"

def run(spec):
    cmd = [sys.executable, GEN_IMAGE, "--card", CARD, "--out", OUT,
           "--spec", json.dumps(spec)]
    subprocess.run(cmd, check=True, cwd="/home/user/Magiclike")

if __name__ == "__main__":
    spec = json.loads(sys.argv[1])
    run(spec)
