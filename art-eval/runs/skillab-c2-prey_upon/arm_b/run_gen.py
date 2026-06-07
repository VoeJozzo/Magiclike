#!/usr/bin/env python3
import json, sys, base64, urllib.request, os, time

ARM = "/home/user/Magiclike/art-eval/runs/skillab-c2-prey_upon/arm_b"
TOKEN_FILE = "/home/user/Magiclike/.claude/skills/magiclike-card-art/pixellab-token"
URL = "https://api.pixellab.ai/v2/create-image-pixflux"

with open(TOKEN_FILE) as f:
    AUTH = f.read().strip()

def gen(prompt, seed, nn, tgs=8):
    body = {
        "description": prompt,
        "image_size": {"width": 64, "height": 32},
        "no_background": False,
        "seed": seed,
        "text_guidance_scale": tgs,
    }
    req = urllib.request.Request(
        URL, data=json.dumps(body).encode(),
        headers={"Authorization": AUTH, "Content-Type": "application/json"},
        method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        resp = json.load(r)
    b64 = resp["image"]["base64"]
    if "," in b64 and b64.strip().startswith("data:"):
        b64 = b64.split(",", 1)[1]
    raw = base64.b64decode(b64)
    fn = os.path.join(ARM, f"gen_{nn:02d}_seed{seed}.png")
    with open(fn, "wb") as f:
        f.write(raw)
    # upscale
    from PIL import Image
    img = Image.open(fn)
    up = img.resize((512, 256), Image.NEAREST)
    up.save(os.path.join(ARM, f"gen_{nn:02d}_seed{seed}_8x.png"))
    print(f"OK gen_{nn:02d}_seed{seed}.png")
    return fn

if __name__ == "__main__":
    # args: nn seed prompt_key tgs
    nn = int(sys.argv[1]); seed = int(sys.argv[2]); pkey = sys.argv[3]
    tgs = int(sys.argv[4]) if len(sys.argv) > 4 else 8
    prompts = json.load(open(os.path.join(ARM, "prompts.json")))
    gen(prompts[pkey], seed, nn, tgs)
