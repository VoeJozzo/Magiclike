#!/usr/bin/env python3
"""Thin wrapper around gen_image.py to avoid shell single-quote escaping of long prompts.
Usage: python3 run_gen.py <gen> <seed> <mode> <parent_or_none> <<<PROMPT_ON_STDIN
"""
import sys, json, subprocess, os

gen = int(sys.argv[1])
seed = int(sys.argv[2])
mode = sys.argv[3]
parent = sys.argv[4]
parent_val = None if parent == "none" else int(parent)
prompt = sys.stdin.read().strip()

spec = {"gen": gen, "seed": seed, "mode": mode, "parent": parent_val, "prompt": prompt}
here = os.path.dirname(os.path.abspath(__file__))
gen_image = os.path.join(here, "..", "gen_image.py")
out = os.path.join(here, "deepseam_fossilized")

r = subprocess.run(
    [sys.executable, gen_image, "--card", "deepseam_quarry", "--out", out,
     "--spec", json.dumps(spec)],
    capture_output=True, text=True)
print(r.stdout)
print(r.stderr, file=sys.stderr)
sys.exit(r.returncode)
