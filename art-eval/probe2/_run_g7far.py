#!/usr/bin/env python3
"""Temporary wrapper to drive gen_image.py with long prompts (json-safe).
DELETE after the run."""
import json, subprocess, sys, os

OUT = "art-eval/probe2/deepseam_g7far_g2"
GEN_TOOL = "art-eval/gen_image.py"

# Shared fossil-description + crisp-legibility clauses (PRESERVED across all gens)
FOSSIL = ("the giant coiled dinosaur fossil is a FLAT petrified imprint pressed sideways "
          "into the grey slate face, extreme opisthotonus death pose, a coiled crescent "
          "ring of bone, every bone a dark stone silhouette at the same level as the rock, "
          "NOT three-dimensional, NOT standing, flush with the rock face. "
          "Individual ribs, vertebrae and skull bones are crisp and legible against the slate. "
          "Layered rock strata. A cold blue-white necromantic glow traces a mineral seam across it. "
          "Colorless earthen palette.")

# Per-gen camera/composition clauses (REWORKED toward far-wall wide view)
GENS = {
    1: dict(seed=730551001, mode="explore", parent=None,
        prompt=("WIDE establishing shot looking ACROSS a deep mine quarry pit. On the FAR side, "
                "the opposite rock-strata wall rises tall; embedded high in that distant wall is "
                + FOSSIL + " The skeleton is far away and enormous, dwarfing the pit. In the "
                "foreground, near rock ledges and rubble on the pit floor lead the eye across the "
                "open chasm toward the far wall. Dark mine quarry, deep depth, sense of distance.")),
    2: dict(seed=412889340, mode="explore", parent=None,
        prompt=("Sweeping WIDE shot across a vast quarry chasm. The camera sits on a near ledge of "
                "broken stone; across the empty pit, the towering far cliff of layered strata holds "
                + FOSSIL + " The coiled fossil is set into the distant cliff face, huge but far. "
                "Tiny mine-cart and timber scaffolding at the cliff base for scale, dwarfed by the "
                "skeleton. Rubble pit floor between camera and far wall. Dark, cold, earthen.")),
    3: dict(seed=905412677, mode="explore", parent=None,
        prompt=("Looking ACROSS an enormous open-pit quarry from a high near rim. The far quarry wall "
                "on the opposite side is a tall cliff of layered rock strata, and "
                + FOSSIL + " The flat coiled skeleton spans the upper far wall, gigantic and distant. "
                "Stepped quarry terraces and rubble descend in the foreground. Deep aerial perspective, "
                "colorless earthen palette, cold blue-white seam glow on the far wall.")),
    # Gen 4: seed-locked tweak of gen 3 -- push the flat coil ONTO a VERTICAL far wall,
    # add chasm distance and a tiny scale figure.
    4: dict(seed=905412677, mode="refine", parent=3,
        prompt=("WIDE shot looking straight ACROSS a deep quarry chasm at the sheer VERTICAL far wall "
                "on the far side. Pressed flat against that distant vertical cliff face of layered "
                "strata, like a carving on a wall, is "
                + FOSSIL + " The coiled crescent skeleton is embedded VERTICALLY in the upright far "
                "wall, towering and far away. A tiny lone miner on the near pit floor for scale, "
                "dwarfed by it. Empty rubble-strewn pit chasm between camera and the far wall. "
                "Dark mine quarry, deep distance.")),
    # Gen 5: fresh seed -- gen 1's strong pit-depth amphitheater + EXPLICIT fossil on the far wall.
    5: dict(seed=318774220, mode="explore", parent=None,
        prompt=("WIDE establishing shot of a vast bowl-shaped open quarry pit, looking ACROSS to the "
                "tall layered rock-strata far wall on the opposite side. Embedded in that distant far "
                "wall, huge and far away, is "
                + FOSSIL + " The flat coiled skeleton fills the far cliff face. Foreground near ledges, "
                "scree slopes and a rubble pit floor lead across the open pit to the far wall. Tiny "
                "scaffolding at the wall base for scale. Deep depth, cold earthen palette.")),
}

def run(g):
    spec = dict(gen=g, seed=GENS[g]["seed"], mode=GENS[g]["mode"],
                parent=GENS[g]["parent"], prompt=GENS[g]["prompt"])
    cmd = ["python3", GEN_TOOL, "--card", "deepseam_quarry",
           "--out", OUT, "--spec", json.dumps(spec)]
    print("=== GEN", g, "seed", spec["seed"], "mode", spec["mode"], "parent", spec["parent"])
    r = subprocess.run(cmd)
    return r.returncode

if __name__ == "__main__":
    g = int(sys.argv[1])
    sys.exit(run(g))
