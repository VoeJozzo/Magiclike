#!/usr/bin/env python3
# Temporary wrapper to avoid shell-escaping issues with apostrophes in prompts.
# DELETE when done.
import json, subprocess, sys

OUT = "art-eval/runs/skillab-c6-flame_summoner/arm_a"

def gen(spec):
    cmd = ["python3", "art-eval/gen_image.py",
           "--card", "flame_summoner", "--out", OUT,
           "--spec", json.dumps(spec)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    print(r.stdout.strip())
    if r.returncode != 0:
        print("STDERR:", r.stderr.strip(), file=sys.stderr)
        sys.exit(r.returncode)

if __name__ == "__main__":
    spec = json.loads(sys.argv[1])
    gen(spec)
