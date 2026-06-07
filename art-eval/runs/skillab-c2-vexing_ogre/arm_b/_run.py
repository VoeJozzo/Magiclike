import json, base64, urllib.request, os, sys
from PIL import Image

ARM = "/home/user/Magiclike/art-eval/runs/skillab-c2-vexing_ogre/arm_b"
TOKEN = open("/home/user/Magiclike/.claude/skills/magiclike-card-art/pixellab-token").read().strip()
seeds = json.load(open("/home/user/Magiclike/art-eval/runs/skillab-c2-vexing_ogre/seeds.json"))

PROMPT = (
    "A massive, muscular ogre with deep red blistered skin and jutting tusks, "
    "hunched and snarling, mid-swing with a crude spiked club, his huge body wreathed "
    "in glowing orange embers. At his feet a small human handler in leather recoils, "
    "clutching a fresh crimson blood gash on his arm where the ogre's careless swing nicked him. "
    "Both figures fully visible. The background is a cracked volcanic battlefield of black "
    "rock with seams of molten lava glowing red-orange, ash drifting through the air, lit by firelight."
)
TGS = 8

for i, seed in enumerate(seeds, 1):
    body = json.dumps({
        "description": PROMPT,
        "image_size": {"width": 64, "height": 32},
        "no_background": False,
        "seed": seed,
        "text_guidance_scale": TGS,
    }).encode()
    req = urllib.request.Request(
        "https://api.pixellab.ai/v2/create-image-pixflux",
        data=body,
        headers={"Authorization": TOKEN, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        resp = urllib.request.urlopen(req, timeout=120)
        data = json.load(resp)
    except urllib.error.HTTPError as e:
        print(f"seed {seed} HTTP {e.code}: {e.read().decode()[:300]}", flush=True)
        sys.exit(1)
    b64 = data["image"]["base64"]
    if "," in b64[:40] and "base64" in b64[:40]:
        b64 = b64.split(",", 1)[1]
    raw = base64.b64decode(b64)
    nn = f"{i:02d}"
    png = os.path.join(ARM, f"gen_{nn}_seed{seed}.png")
    with open(png, "wb") as f:
        f.write(raw)
    img = Image.open(png)
    up = img.resize((512, 256), Image.NEAREST)
    up.save(os.path.join(ARM, f"gen_{nn}_seed{seed}_8x.png"))
    print(f"gen_{nn}_seed{seed}.png  size={img.size}", flush=True)

print("DONE", flush=True)
