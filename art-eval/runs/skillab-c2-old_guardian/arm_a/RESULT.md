# Old Guardian — arm_a RESULT

**Card:** Old Guardian — GREEN 2/5 Treefolk creature (G + 3 colorless = 4 mana).
On death, permanently gives +2/+2 to another creature you control. Theme: ancient
nature, treefolk, growth, legacy.

**Nominated best:** `gen_06_seed1128792562.png` (copied to `BEST.png`).

**Final prompt:**
> An ancient towering treefolk guardian, its body made of weathered cracked gray-brown
> bark and gnarled oak wood, draped in green moss and pale lichen, a craggy face with
> deep knothole eyes and a long mossy beard, two thick root-like arms. It stands in a
> sturdy defensive stance, hunched and rooted, facing the viewer. A small young sapling
> sprouts at its feet, and faint green motes of life drift down from the old guardian
> toward the sapling. The background is a deep old-growth forest of tall trunks and
> layered emerald canopy.

**Settings:** seed 1128792562, text_guidance_scale 8 (default), no_background false,
image_size 64x32.

**Generation calls this session:** 5 (gens 04-08). Gens 01-03 pre-existed in the folder
with no log; reconstructed by inspection. 2 of the 10-call budget left unused.

**Rationale:** Old Guardian is a creature card, so per the skill's mechanic-in-art lens
the subject is the guardian itself rather than the death-transfer effect; the legacy beat
is best left implicit since it never rendered cleanly at 64x32 and risked cluttering the
frame. Of the pre-existing gens, gen_01 already proved a treefolk-with-a-face read better
than "just a tree" (gen_02) or an energy effect (gen_03), so I pushed that register with a
4-roll variance batch on a bark-humanoid-guardian prompt. gen_06 is the clear winner: a
weathered bark treefolk with knothole eyes, a mossy crown, and gnarled limbs, planted
defensively between two flanking trunks against a layered emerald forest — solemn,
ancient, and unmistakably a creature, with the strongest silhouette and color identity of
the set. It harmonizes with the forest_titan anchor (humanoid against canopy) while
reading more clearly arboreal. A seed-locked refinement (gen_08) to add an explicit
sapling regressed the face into a jolly smile and dropped the sapling, confirming gen_06
as the keeper.
