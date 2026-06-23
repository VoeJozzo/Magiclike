#!/usr/bin/env python3
"""Clean pixflux generation helper for the art-eval A/B harness.

WHY THIS EXISTS: the skill brief's literal `curl -o /tmp/pixflux_resp.json`
writes EVERY call to one shared path. A failed/empty curl, or a race, then
makes the decode step read a PREVIOUS call's leftover bytes -- producing
byte-identical SAVED files from genuinely distinct (billed) API calls. That
is the most likely cause of the byte-identical duplicates the preflight
caught (serra, which used an in-memory helper, had zero dups; the runs that
followed the shared-/tmp pattern had them).

This helper captures the curl response IN MEMORY (no shared temp file),
decodes it, writes a unique per-gen file, and -- as a generation-time safety
net -- refuses to save a frame that is byte-identical to one already in the
same arm's output dir (it retries once with seed+1, then errors). Cross-arm
/ cross-run identity is still caught by `harness.py preflight`.

Usage (one gen per call; keeps the agent's tweak-loop in control):
  python3 art-eval/gen_image.py \
     --card iron_statue --out art-eval/runs/<run>/arm_a \
     --spec '{"gen":1,"seed":2059828219,"mode":"explore","parent":null,
              "prompt":"..."}'

Optional spec fields (REPORT them to the director whenever you use them; they are
auto-logged to manifest.jsonl):
  "guidance":       text_guidance_scale, 1.0-20.0 (default 8) -- how tightly to follow the text.
  "init":           path to an init_image (img2img -- start from an EXISTING frame).
  "init_strength":  init_image_strength, 1-999 (default 300). HIGH = stay close to the
                    init image (light nudge); LOW = let the prompt pull it further.
"""
import sys, json, base64, subprocess, os, hashlib, argparse
from PIL import Image

TOKEN_FILE = os.path.join(os.path.dirname(__file__), "..",
                          ".claude/skills/magiclike-card-art/pixellab-token")


def _call_pixflux(prompt: str, seed: int, guidance=None,
                  init_b64=None, init_strength=None) -> bytes:
    with open(TOKEN_FILE) as f:
        token = f.read().strip()
    body = {
        "description": prompt,
        "image_size": {"width": 64, "height": 32},
        "no_background": False,
        "seed": int(seed),
    }
    if guidance is not None:                 # text_guidance_scale: 1.0-20.0, default 8
        body["text_guidance_scale"] = float(guidance)
    if init_b64 is not None:                 # img2img: start from an existing frame
        body["init_image"] = {"type": "base64", "base64": init_b64, "format": "png"}
        body["init_image_strength"] = int(init_strength if init_strength is not None else 300)
    body_json = json.dumps(body)
    # Pipe the body via stdin (--data-binary @-): a high-res init_image base64 exceeds the
    # OS command-line arg limit (ARG_MAX) if passed as -d <body>.
    resp = subprocess.run(
        ["curl", "-sS", "--max-time", "90", "-X", "POST",
         "https://api.pixellab.ai/v2/create-image-pixflux",
         "-H", "Authorization: " + token,
         "-H", "Content-Type: application/json",
         "--data-binary", "@-"],
        input=body_json, capture_output=True, text=True)
    if not resp.stdout.strip():
        raise RuntimeError(f"empty/timed-out response from pixflux (curl rc={resp.returncode}, "
                           "--max-time 90s). Endpoint returned nothing -- retry / check API health.")
    data = json.loads(resp.stdout)          # raises on a non-JSON body -> caller sees it
    if "image" not in data:
        raise RuntimeError("no image in response: " + json.dumps(data)[:400])
    b64 = data["image"]["base64"]
    if b64.startswith("data:"):
        b64 = b64.split(",", 1)[1]
    return base64.b64decode(b64)


def _existing_hashes(out: str) -> set:
    hs = set()
    for fn in os.listdir(out):
        if fn.endswith(".png") and "_8x" not in fn and "_seed" in fn:
            with open(os.path.join(out, fn), "rb") as f:
                hs.add(hashlib.md5(f.read()).hexdigest())
    return hs


def generate(card: str, out: str, spec: dict) -> str:
    os.makedirs(out, exist_ok=True)
    gen, seed = int(spec["gen"]), int(spec["seed"])
    prompt, mode, parent = spec["prompt"], spec.get("mode", "explore"), spec.get("parent")
    # Optional knobs (must be reported in the manifest whenever used):
    #   guidance      -> text_guidance_scale (1.0-20.0, default 8)
    #   init          -> path to an init_image (img2img: start from this frame)
    #   init_strength -> init_image_strength (1-999, default 300; HIGH = stay close to init)
    guidance = spec.get("guidance")
    init_path = spec.get("init")
    init_strength = spec.get("init_strength")
    init_b64 = None
    if init_path:
        with open(init_path, "rb") as f:
            init_b64 = base64.b64encode(f.read()).decode()
    kw = dict(guidance=guidance, init_b64=init_b64, init_strength=init_strength)

    prior = _existing_hashes(out)
    raw, used_seed = _call_pixflux(prompt, seed, **kw), seed
    if hashlib.md5(raw).hexdigest() in prior:
        # stale/duplicate save defense: one retry with a nudged seed
        used_seed = seed + 1
        print(f"WARN gen {gen}: byte-identical to an existing frame; retrying seed {used_seed}")
        raw = _call_pixflux(prompt, used_seed, **kw)
        if hashlib.md5(raw).hexdigest() in prior:
            raise RuntimeError(f"gen {gen}: still byte-identical after retry -- aborting (investigate API)")
    nn = f"{gen:02d}"
    fn = f"{card}_gen_{nn}_seed{used_seed}.png"
    path = os.path.join(out, fn)
    with open(path, "wb") as f:
        f.write(raw)
    Image.open(path).resize((512, 256), Image.NEAREST).save(
        os.path.join(out, f"{card}_gen_{nn}_seed{used_seed}_8x.png"))
    rec = {"gen": gen, "seed": used_seed, "mode": mode, "parent_gen": parent, "prompt": prompt}
    if guidance is not None: rec["text_guidance_scale"] = float(guidance)
    if init_path is not None:
        rec["init_image"] = os.path.basename(init_path)
        rec["init_image_strength"] = int(init_strength if init_strength is not None else 300)
    with open(os.path.join(out, "manifest.jsonl"), "a") as m:
        m.write(json.dumps(rec) + "\n")
    print(f"OK gen {gen}: {fn}  md5={hashlib.md5(raw).hexdigest()[:10]}"
          + (f"  [guidance={guidance}]" if guidance is not None else "")
          + (f"  [init={os.path.basename(init_path)} str={rec.get('init_image_strength')}]" if init_path else ""))
    return fn


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--card", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--spec", required=True, help="JSON: gen, seed, prompt, mode, parent")
    args = ap.parse_args()
    generate(args.card, args.out, json.loads(args.spec))
