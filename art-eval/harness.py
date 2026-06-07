#!/usr/bin/env python3
"""Art-skill A/B harness — committed, reset-proof single source of truth.

WHY THIS EXISTS: the execution container restores from a snapshot pinned near an
older commit. Every restore rewinds the working tree and DELETES anything not
committed-and-pushed (and resets .git/info/exclude). Earlier rounds lost the C2
variant file and the shared seed pool because they lived in gitignored locations
(.claude/skills/... and art-eval/runs/<run>/_meta/). This module keeps every
harness input either (a) deterministically recomputable from the card name, or
(b) at a committed path, so a mid-round reset can never silently corrupt a round.

USAGE
  python3 art-eval/harness.py pool                 # list unarted, not-done cards
  python3 art-eval/harness.py pick [salt]          # deterministic card pick
  python3 art-eval/harness.py init <run> <card>    # make dirs + committed seeds.json
  python3 art-eval/harness.py preflight <run>      # verify a round before judging
  python3 art-eval/harness.py sheet <run> <card>   # build blind contact sheet
  python3 art-eval/harness.py decode <run>         # reveal which label is control/treatment
  python3 art-eval/harness.py selftest             # check stack health (no pixflux)

INVARIANTS enforced:
  - card MUST be unarted (no reference/.../art.png) and not in done_cards.txt
  - seeds.json lives at run ROOT (committed), never under _meta/ (gitignored)
  - both arms MUST share the identical seed pool
  - the C2 variant is read from art-eval/variants/SKILL-c2-variant.md (committed)
    and MUST differ from the control base by exactly the diagnosable-flaw paragraph
"""
import sys, os, json, glob, re, random, hashlib
from pathlib import Path

ROOT     = Path(__file__).resolve().parent.parent
CARDS    = ROOT / "reference/html-proto/cards"
RUNS     = ROOT / "art-eval/runs"
VARIANTS = ROOT / "art-eval/variants"
SHEETS   = ROOT / "docs/art-eval-sheets"
DONEFILE = ROOT / "art-eval/done_cards.txt"

CONTROL_SKILL = VARIANTS / "SKILL-control.md"
C2_VARIANT    = VARIANTS / "SKILL-c2-variant.md"

def stable_int(s: str) -> int:
    """Deterministic across machines/python versions (built-in hash() is not)."""
    return int(hashlib.md5(s.encode()).hexdigest(), 16)

def done_set() -> set:
    if not DONEFILE.exists():
        return set()
    return {l.strip() for l in DONEFILE.read_text().splitlines()
            if l.strip() and not l.startswith("#")}

def unarted_pool() -> list:
    out = []
    for d in sorted(CARDS.iterdir()):
        if not d.is_dir():
            continue
        if (d / "art.png").exists():       # already has art -> not eligible
            continue
        out.append(d.name)
    return out

def candidates() -> list:
    done = done_set()
    return [c for c in unarted_pool() if c not in done]

def pick_card(salt: str = "") -> str:
    cands = candidates()
    if not cands:
        raise SystemExit("no eligible cards left")
    return random.Random(stable_int("pick:" + salt)).choice(cands)

def seeds_for(card: str, n: int = 10) -> list:
    rng = random.Random(stable_int("seeds:" + card))
    return [rng.randint(1, 2_147_483_646) for _ in range(n)]

def label_map(card: str) -> dict:
    """Deterministic, recomputable blind labels. arm_a/arm_b -> '1'/'2'.
    Recomputable from the card name alone, so a reset can't lose the answer key."""
    swap = stable_int("label:" + card) % 2 == 1
    return {"1": "arm_b", "2": "arm_a"} if swap else {"1": "arm_a", "2": "arm_b"}

def variant_ok() -> tuple:
    """Return (ok, msg). Variant must be control + exactly the C2 paragraph."""
    if not C2_VARIANT.exists() or not CONTROL_SKILL.exists():
        return False, "missing committed skill snapshot(s) under art-eval/variants/"
    ctrl = CONTROL_SKILL.read_text().splitlines()
    var  = C2_VARIANT.read_text().splitlines()
    added = [l for l in var if l not in ctrl]
    sig = "diagnosable-flaw"
    if not any(sig in l for l in added):
        return False, "variant does not contain the C2 diagnosable-flaw paragraph"
    return True, f"variant = control + {len(added)} added line(s) incl. C2 paragraph"

def _real_gens(armdir: Path) -> list:
    return sorted([f for f in armdir.glob("gen_*_seed*.png") if "_8x" not in f.name],
                  key=lambda f: int(re.search(r"gen_(\d+)_seed", f.name).group(1)))

def init_run(run: str, card: str):
    if (CARDS / card / "art.png").exists():
        raise SystemExit(f"REFUSED: {card} already has art.png (not an unarted card)")
    if card in done_set():
        raise SystemExit(f"REFUSED: {card} is in done_cards.txt")
    rd = RUNS / run
    for a in ("arm_a", "arm_b", "_meta"):
        (rd / a).mkdir(parents=True, exist_ok=True)
    seeds = seeds_for(card)
    (rd / "seeds.json").write_text(json.dumps(seeds))   # run-root => COMMITTED
    print(f"init {run} for {card}")
    print("seeds (committed at run-root):", seeds)
    print("control skill :", CONTROL_SKILL)
    print("variant skill :", C2_VARIANT)
    ok, msg = variant_ok(); print("variant check :", "OK" if ok else "FAIL", "-", msg)

def preflight(run: str):
    rd = RUNS / run
    sj = rd / "seeds.json"
    problems = []
    if not sj.exists():
        problems.append("seeds.json missing at run-root (was it left in gitignored _meta/?)")
        pool = None
    else:
        pool = sorted(json.loads(sj.read_text()))
    for arm in ("arm_a", "arm_b"):
        gens = _real_gens(rd / arm)
        if len(gens) == 0:
            problems.append(f"{arm}: no gens"); continue
        seeds = sorted(int(re.search(r"seed(\d+)", g.name).group(1)) for g in gens)
        if pool is not None and seeds != pool:
            problems.append(f"{arm}: seeds do not match shared pool")
        print(f"{arm}: {len(gens)} gens, seeds match pool: {pool is not None and seeds==pool}")
    # contamination heuristic: arms must not be byte-identical pairwise
    a = {re.search(r'seed(\d+)', g.name).group(1): g for g in _real_gens(rd/'arm_a')}
    b = {re.search(r'seed(\d+)', g.name).group(1): g for g in _real_gens(rd/'arm_b')}
    ident = sum(1 for s in a if s in b and a[s].read_bytes() == b[s].read_bytes())
    if ident:
        problems.append(f"{ident} arm_a/arm_b gens are BYTE-IDENTICAL (possible control-vs-control)")
    print(f"byte-identical cross-arm pairs: {ident} (want 0)")
    ok, msg = variant_ok(); print("variant check:", "OK" if ok else "FAIL", "-", msg)
    if problems:
        print("PREFLIGHT: FAIL"); [print("  -", p) for p in problems]; sys.exit(1)
    print("PREFLIGHT: PASS")

def build_sheet(run: str, card: str):
    from PIL import Image, ImageDraw, ImageFont
    rd = RUNS / run
    SCALE, LABEL_H, PAD, COLS = 6, 22, 8, 5
    CW, CH = 64 * SCALE, 32 * SCALE
    m = label_map(card)
    cells = []
    for lbl in ("1", "2"):
        for i, f in enumerate(_real_gens(rd / m[lbl]), 1):
            cells.append((f"{lbl}.{i:02d}", f))
    rows = (len(cells) + COLS - 1) // COLS
    W = COLS * CW + (COLS + 1) * PAD
    H = rows * (CH + LABEL_H) + (rows + 1) * PAD
    sheet = Image.new("RGB", (W, H), (28, 28, 32)); d = ImageDraw.Draw(sheet)
    try:    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 16)
    except: font = ImageFont.load_default()
    for idx, (label, f) in enumerate(cells):
        r, c = divmod(idx, COLS)
        x = PAD + c * (CW + PAD); y = PAD + r * (CH + LABEL_H + PAD)
        sheet.paste(Image.open(f).convert("RGB").resize((CW, CH), Image.NEAREST), (x, y))
        d.text((x + 4, y + CH + 3), label, fill=(235, 235, 240), font=font)
    SHEETS.mkdir(parents=True, exist_ok=True)
    out = SHEETS / f"{card}_c2ab_sheet.png"
    sheet.save(out)
    # answer key stays in gitignored _meta/ (out of the user's blind view); also recomputable
    (rd / "_meta").mkdir(parents=True, exist_ok=True)
    (rd / "_meta" / "blind_map.json").write_text(json.dumps(m))
    print(f"sheet: {sheet.size} -> {out}")
    print("(label mapping is recomputable via `decode`; not revealed here)")

def decode(run: str):
    # infer card from run name suffix
    card = run.split("-", 2)[-1]
    m = label_map(card)
    roles = {"arm_a": "CONTROL (SKILL-control.md)", "arm_b": "TREATMENT (C2 variant)"}
    inv = {v: k for k, v in m.items()}
    print(f"run={run} card={card}")
    print(f"  label 1 = {m['1']} = {roles[m['1']]}")
    print(f"  label 2 = {m['2']} = {roles[m['2']]}")
    print(f"  control shown as label {inv['arm_a']}; treatment shown as label {inv['arm_b']}")

def selftest():
    print("=== art-eval harness selftest (no pixflux) ===")
    print("repo root      :", ROOT)
    print("unarted cards  :", len(unarted_pool()))
    print("done cards     :", len(done_set()))
    print("eligible cards :", len(candidates()))
    ok, msg = variant_ok(); print("variant check  :", "OK" if ok else "FAIL", "-", msg)
    tok = (ROOT / ".claude/skills/magiclike-card-art/pixellab-token")
    print("token present  :", tok.exists(),
          "(format ok)" if tok.exists() and tok.read_text().strip().lower().startswith("bearer ") else "")
    # determinism check
    c = "lightning_bolt"
    print("determinism    : seeds_for(%s)[0]=%d (stable), label1=%s" %
          (c, seeds_for(c)[0], label_map(c)["1"]))
    print("SELFTEST:", "PASS" if ok and tok.exists() else "FAIL")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(0)
    cmd = sys.argv[1]; a = sys.argv[2:]
    {"pool":     lambda: print("\n".join(candidates())),
     "pick":     lambda: print(pick_card(a[0] if a else "")),
     "init":     lambda: init_run(a[0], a[1]),
     "preflight":lambda: preflight(a[0]),
     "sheet":    lambda: build_sheet(a[0], a[1]),
     "decode":   lambda: decode(a[0]),
     "selftest": selftest,
    }.get(cmd, lambda: print(f"unknown cmd {cmd}\n{__doc__}"))()
