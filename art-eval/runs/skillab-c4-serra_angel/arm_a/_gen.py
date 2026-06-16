#!/usr/bin/env python3
import sys, json, base64, subprocess, os
from PIL import Image

OUT = "/home/user/Magiclike/art-eval/runs/skillab-c4-serra_angel/arm_a"
TOKEN = open("/home/user/Magiclike/.claude/skills/magiclike-card-art/pixellab-token").read().strip()

def gen(gennum, seed, prompt, mode, parent):
    body = {
        "description": prompt,
        "image_size": {"width": 64, "height": 32},
        "no_background": False,
        "seed": int(seed),
    }
    resp = subprocess.run([
        "curl", "-sS", "-X", "POST",
        "https://api.pixellab.ai/v2/create-image-pixflux",
        "-H", "Authorization: " + TOKEN,
        "-H", "Content-Type: application/json",
        "-d", json.dumps(body),
    ], capture_output=True, text=True)
    try:
        data = json.loads(resp.stdout)
    except Exception:
        print("PARSE FAIL gen", gennum, resp.stdout[:400]); return None
    if "image" not in data:
        print("NO IMAGE gen", gennum, json.dumps(data)[:400]); return None
    b64 = data["image"]["base64"]
    if b64.startswith("data:"):
        b64 = b64.split(",", 1)[1]
    raw = base64.b64decode(b64)
    nn = f"{gennum:02d}"
    fn = f"serra_angel_gen_{nn}_seed{seed}.png"
    path = os.path.join(OUT, fn)
    with open(path, "wb") as f:
        f.write(raw)
    img = Image.open(path)
    up = img.resize((512, 256), Image.NEAREST)
    up.save(os.path.join(OUT, f"serra_angel_gen_{nn}_seed{seed}_8x.png"))
    with open(os.path.join(OUT, "manifest.jsonl"), "a") as m:
        m.write(json.dumps({"gen": gennum, "seed": int(seed), "mode": mode,
                            "parent_gen": parent, "prompt": prompt}) + "\n")
    print("OK gen", gennum, fn)
    return fn

if __name__ == "__main__":
    spec = json.loads(sys.argv[1])
    gen(spec["gen"], spec["seed"], spec["prompt"], spec["mode"], spec.get("parent"))
