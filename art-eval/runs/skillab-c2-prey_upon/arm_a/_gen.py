#!/usr/bin/env python3
import sys, json, base64, urllib.request
from PIL import Image
import io

ARM = "/home/user/Magiclike/art-eval/runs/skillab-c2-prey_upon/arm_a"
TOKEN = open("/home/user/Magiclike/.claude/skills/magiclike-card-art/pixellab-token").read().strip()

PROMPT = ("Two wild beasts locked in a violent fight, a tawny brown wolf and a "
          "tusked grey-green boar, lunging at each other and colliding head-on in "
          "the center, jaws snapping, claws raking, fur flying, both animals fully "
          "visible and the same size, mid-clash and rearing into each other. The "
          "background is a dense deep-green old-growth forest of ferns and "
          "moss-covered trunks.")
TGS = 8

def gen(nn, seed, prompt=PROMPT):
    body = json.dumps({
        "description": prompt,
        "image_size": {"width": 64, "height": 32},
        "no_background": False,
        "seed": seed,
        "text_guidance_scale": TGS,
    }).encode()
    req = urllib.request.Request(
        "https://api.pixellab.ai/v2/create-image-pixflux",
        data=body,
        headers={"Authorization": TOKEN, "Content-Type": "application/json"},
        method="POST")
    with urllib.request.urlopen(req, timeout=60) as r:
        resp = json.load(r)
    b64 = resp["image"]["base64"]
    if "," in b64 and b64.strip().startswith("data:"):
        b64 = b64.split(",", 1)[1]
    raw = base64.b64decode(b64)
    raw_path = f"{ARM}/gen_{nn:02d}_seed{seed}.png"
    with open(raw_path, "wb") as f:
        f.write(raw)
    img = Image.open(io.BytesIO(raw))
    up = img.resize((512, 256), Image.NEAREST)
    up.save(f"{ARM}/gen_{nn:02d}_seed{seed}_8x.png")
    print(f"OK gen_{nn:02d}_seed{seed}  ({img.size})")
    return raw_path

if __name__ == "__main__":
    seeds = json.load(open("/home/user/Magiclike/art-eval/runs/skillab-c2-prey_upon/seeds.json"))
    start = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    end = int(sys.argv[2]) if len(sys.argv) > 2 else len(seeds)
    for i in range(start, end):
        gen(i + 1, seeds[i])
