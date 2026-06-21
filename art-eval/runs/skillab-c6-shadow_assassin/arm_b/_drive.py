#!/usr/bin/env python3
"""Throwaway wrapper: build the spec JSON with json.dumps to dodge shell escaping."""
import json, subprocess, sys, os

CARD = "shadow_assassin"
OUT = "/home/user/Magiclike/art-eval/runs/skillab-c6-shadow_assassin/arm_b"
HELPER = "/home/user/Magiclike/art-eval/gen_image.py"

def gen(spec: dict):
    cmd = ["python3", HELPER, "--card", CARD, "--out", OUT, "--spec", json.dumps(spec)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    sys.stdout.write(r.stdout)
    sys.stderr.write(r.stderr)
    return r.returncode

if __name__ == "__main__":
    # specs passed as a JSON array on argv[1]
    specs = json.loads(sys.argv[1])
    rc = 0
    for s in specs:
        rc |= gen(s)
    sys.exit(rc)
