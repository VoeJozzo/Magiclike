#!/usr/bin/env python3
"""Inpaint helper for the 'iterate on already-good art' probe.

Mirrors gen_image.py's clean in-memory pattern, but for PixelLab's /v2/inpaint
(masked region edit of an EXISTING image). This is the tool for diagnose-then-
iterate pointed at a finished frame: name the worst remaining flaw -> mask that
region (white = regenerate, black = preserve) -> repaint just it with a LOCAL
prompt (name what belongs in the patch, not the whole scene) -> repeat.

The response stays in memory (no shared /tmp file -> no stale-bytes footgun).
Output PNG is written at the working size plus an 8x upscale for reading; a
manifest.jsonl line is appended per call.

Usage (one edit per call; keeps the agent's loop in control):
  python3 art-eval/inpaint_image.py \
     --image art-eval/probe/<run>/step_02.png \
     --mask  art-eval/probe/<run>/mask_03.png \
     --out   art-eval/probe/<run> --name step --step 3 \
     --prompt "stone wall" [--negative "..."] [--guidance 4.0]

Mask must be the SAME width/height as --image. The result is saved as
<out>/<name>_<NN>.png (+ _<NN>_8x.png). Pass the new file back as --image on the
next call to chain edits.
"""
import sys, os, json, base64, subprocess, hashlib, argparse
from PIL import Image

TOKEN_FILE = os.path.join(os.path.dirname(__file__), "..",
                          ".claude/skills/magiclike-card-art/pixellab-token")
ENDPOINT = "https://api.pixellab.ai/v2/inpaint"


def _b64_raw(path: str) -> str:
    return base64.b64encode(open(path, "rb").read()).decode()


def _call_inpaint(desc, w, h, img_b64, mask_b64, negative) -> bytes:
    # NB: /v2/inpaint rejects guidance_scale (extra_forbidden) — do not send it.
    token = open(TOKEN_FILE).read().strip()
    body = {
        "description": desc,
        "image_size": {"width": w, "height": h},
        "inpainting_image": {"type": "base64", "base64": img_b64},
        "mask_image": {"type": "base64", "base64": mask_b64},
    }
    if negative:
        body["negative_description"] = negative
    # body via stdin (--data-binary @-): image base64 can exceed the OS arg limit.
    resp = subprocess.run(
        ["curl", "-sS", "--max-time", "90", "-X", "POST", ENDPOINT,
         "-H", "Authorization: " + token,
         "-H", "Content-Type: application/json",
         "--data-binary", "@-"],
        input=json.dumps(body), capture_output=True, text=True)
    if not resp.stdout.strip():
        raise RuntimeError(f"empty/timed-out response (curl rc={resp.returncode})")
    data = json.loads(resp.stdout)
    if "image" not in data:
        raise RuntimeError("no image in response: " + json.dumps(data)[:400])
    b64 = data["image"]["base64"]
    if b64.startswith("data:"):
        b64 = b64.split(",", 1)[1]
    return base64.b64decode(b64)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", required=True, help="source image to edit")
    ap.add_argument("--mask", required=True, help="mask (white=regen, black=preserve), same size as --image")
    ap.add_argument("--out", required=True)
    ap.add_argument("--name", default="step")
    ap.add_argument("--step", required=True, type=int)
    ap.add_argument("--prompt", required=True, help="LOCAL prompt: what belongs in the masked patch")
    ap.add_argument("--negative", default="")
    a = ap.parse_args()

    src = Image.open(a.image).convert("RGB")
    msk = Image.open(a.mask).convert("RGB")
    if src.size != msk.size:
        raise SystemExit(f"mask size {msk.size} != image size {src.size}")
    w, h = src.size
    raw = _call_inpaint(a.prompt, w, h, _b64_raw(a.image), _b64_raw(a.mask),
                        a.negative)
    os.makedirs(a.out, exist_ok=True)
    nn = f"{a.step:02d}"
    path = os.path.join(a.out, f"{a.name}_{nn}.png")
    with open(path, "wb") as f:
        f.write(raw)
    Image.open(path).resize((w * 8, h * 8), Image.NEAREST).save(
        os.path.join(a.out, f"{a.name}_{nn}_8x.png"))
    with open(os.path.join(a.out, "manifest.jsonl"), "a") as m:
        m.write(json.dumps({"step": a.step, "image": os.path.basename(a.image),
                            "mask": os.path.basename(a.mask), "prompt": a.prompt,
                            "negative": a.negative, "guidance": a.guidance}) + "\n")
    print(f"OK step {a.step}: {os.path.basename(path)}  md5={hashlib.md5(raw).hexdigest()[:10]}")


if __name__ == "__main__":
    main()
