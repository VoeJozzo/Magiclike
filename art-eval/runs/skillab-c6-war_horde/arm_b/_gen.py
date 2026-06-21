#!/usr/bin/env python3
# Tiny wrapper: builds the --spec JSON safely and invokes the shared helper.
# DELETE when the run is done.
import json, subprocess, sys, os

OUT = "art-eval/runs/skillab-c6-war_horde/arm_b"
CARD = "war_horde"
HELPER = "art-eval/gen_image.py"

# Each entry: gen, seed, mode, parent, prompt  (optionally guidance)
def run(spec):
    cmd = ["python3", HELPER, "--card", CARD, "--out", OUT, "--spec", json.dumps(spec)]
    r = subprocess.run(cmd, cwd="/home/user/Magiclike", capture_output=True, text=True)
    print("STDOUT:", r.stdout.strip())
    if r.stderr.strip():
        print("STDERR:", r.stderr.strip())
    print("RC:", r.returncode)
    return r.returncode

if __name__ == "__main__":
    spec = json.loads(sys.argv[1])
    sys.exit(run(spec))
