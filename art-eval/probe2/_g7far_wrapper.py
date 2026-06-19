#!/usr/bin/env python3
"""Temporary wrapper to drive gen_image.py with json-safe long prompts.
Deleted when the reframe exploration is done."""
import json, subprocess, sys, os

OUT = "art-eval/probe2/deepseam_g7far_src"
GEN_SCRIPT = "art-eval/gen_image.py"

# Shared fossil-description clauses (PRESERVED across all gens).
FOSSIL = ("a colossal dinosaur fossil pressed FLAT into the rock, extreme "
          "opisthotonus death pose, a coiled crescent of bone, a FLAT "
          "petrified imprint pressed sideways into grey slate, every bone a "
          "dark stone silhouette at the same level as the rock face, NOT "
          "three-dimensional, NOT standing, flush with the cliff. Layered "
          "rock strata. A cold blue-white necromantic glow traces a mineral "
          "seam across the imprint. Colorless earthen palette.")

GENS = {
    1: dict(seed=771203455, mode="explore", parent=None,
            prompt=("Wide shot looking ACROSS a vast open-pit quarry. On the "
                    "FAR rock-strata wall on the opposite side of the pit, "
                    "embedded high in the layered cliff, is " + FOSSIL + " "
                    "Deep quarry foreground: near rock ledges, scattered "
                    "rubble and a debris-strewn pit floor between camera and "
                    "the far wall, giving great depth. The far-wall skeleton "
                    "is enormous and distant. Dark mine quarry.")),
    2: dict(seed=318884921, mode="explore", parent=None,
            prompt=("Extreme wide establishing shot from one quarry ledge "
                    "across a deep mining pit toward the towering far cliff. "
                    "The opposite stratified rock wall holds " + FOSSIL + " "
                    "Stepped quarry terraces and rubble descend into the pit "
                    "floor in the foreground; tiny scale gives the far-wall "
                    "fossil immense size. Cold, dim, dark mine quarry.")),
    3: dict(seed=926551077, mode="explore", parent=None,
            prompt=("Cavernous quarry interior, camera on a near ledge "
                    "looking across the open pit. Far across the chasm, the "
                    "distant layered rock wall is carved by " + FOSSIL + " "
                    "Jagged near boulders and a sloping rubble pit floor fill "
                    "the lower foreground; the far cliff and its giant flat "
                    "fossil loom across the gap. Dark mine quarry, colorless.")),
    4: dict(seed=926551077, mode="refine", parent=3,
            prompt=("Looking ACROSS a dark quarry pit at the FAR cliff wall, "
                    "which is dominated by " + FOSSIL + " The entire far rock "
                    "wall IS the coiled fossil imprint, huge and distant. A "
                    "low near ledge and dark rubble in the foreground for "
                    "depth, with a tiny human silhouette on the pit floor for "
                    "scale so the fossil dwarfs it. Enclosed dark mine, almost "
                    "no sky, colorless earthen palette.")),
    5: dict(seed=771203455, mode="refine", parent=1,
            prompt=("Wide view across a deep enclosed quarry toward the "
                    "towering stratified far wall. Spanning that whole far "
                    "cliff is " + FOSSIL + " The coiled crescent of dark bone "
                    "is unmistakable against the grey strata, the blue-white "
                    "seam glowing along it. Near rock ledges and rubble fill "
                    "the lower frame for depth; tiny scattered boulders give "
                    "scale. Dark dim mine quarry, very little sky, colorless.")),
}

def run(gen):
    spec = dict(gen=gen, **GENS[gen])
    cmd = ["python3", GEN_SCRIPT, "--card", "deepseam_quarry",
           "--out", OUT, "--spec", json.dumps(spec)]
    print("=== GEN", gen, "seed", spec["seed"], spec["mode"], "===")
    r = subprocess.run(cmd, capture_output=True, text=True)
    print(r.stdout)
    if r.returncode != 0:
        print("STDERR:", r.stderr)
    return r.returncode

if __name__ == "__main__":
    g = int(sys.argv[1])
    sys.exit(run(g))
