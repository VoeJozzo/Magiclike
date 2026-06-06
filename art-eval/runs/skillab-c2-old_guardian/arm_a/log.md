# Old Guardian — arm_a generation log

Card: GREEN 2/5 Treefolk creature (G + 3 colorless = 4 mana). On death, permanently
gives +2/+2 to another creature you control. Theme: ancient nature, treefolk, growth,
legacy — a weathered guardian whose death passes its strength on.

Anchors studied: forest_titan (moss-on-stone humanoid vs layered green canopy/sky),
wolfbriar_elemental (tangled foliage creature in a dim forest). Register = a textured
nature-creature reading clearly as a CHARACTER against a forest scene.

Mechanic-in-art lens: it's a creature card, so the subject is the old treefolk guardian
itself — a sturdy, weathered, defensive presence. Legacy/death-transfer can be a quiet
beat (a young sapling at its feet) but must not crowd out the readable treefolk.

Budget: 10 calls total. Seeds (reuse allowed):
[1087734270, 900405011, 1386394568, 1999766719, 1059835868, 1128792562, 515064276,
 1165263616, 1833867768, 92501812]

---

## Calls 01-03 (pre-existing in arm_a; no logged prompt — reconstructed by inspection)

- **gen_01_seed1087734270.png** — A knotted wooden treefolk FACE/body emerging from a
  tree trunk, roots as limbs, leafy canopy crown, dim forest behind. READS AS A
  CREATURE. Strongest of the three; the clearest "old treefolk guardian" so far.
- **gen_02_seed900405011.png** — A large ancient tree, no face/creature. Reads as
  scenery, not a character. Weak for a creature card.
- **gen_03_seed1386394568.png** — A column of golden-green energy with a tiny figure;
  reads as a spell effect, not a treefolk. Off-target.

Takeaway: push the gen_01 register — an unambiguous treefolk guardian with a face and
body — and add a subtle legacy beat. Avoid "just a tree" (gen_02) and "energy effect"
(gen_03).

---

## Calls 04-07 (batch, variance sample on the chosen direction)

Prompt (identical across the batch):
"An ancient towering treefolk guardian, its body made of weathered cracked gray-brown
bark and gnarled oak wood, draped in green moss and pale lichen, a craggy face with deep
knothole eyes and a long mossy beard, two thick root-like arms. It stands in a sturdy
defensive stance, hunched and rooted, facing the viewer. A small young sapling sprouts at
its feet, and faint green motes of life drift down from the old guardian toward the
sapling. The background is a deep old-growth forest of tall trunks and layered emerald
canopy."
Settings: image_size 64x32, no_background false, text_guidance_scale 8 (default).

- **gen_04_seed1999766719.png** — Bulky bark humanoid, mossy hair, forest corridor.
  Strong creature read; face slightly generic/ape-like, moss sparse. Good.
- **gen_05_seed1059835868.png** — Centered figure under a vine arch; dim, muddy body,
  soft silhouette. Weakest of the batch.
- **gen_06_seed1128792562.png** — BEST. Clearly weathered treefolk: knothole eyes, mossy
  crown, gnarled bark limbs, planted between two flanking trunks. Solemn, ancient,
  defensive — best silhouette and most on-theme "old guardian." Strong green identity.
- **gen_07_seed515064276.png** — Dynamic mossy wood-giant; vivid but pose reads
  brawler/aggressive, less the defensive ancient sentinel; face less treefolk.

## Call 08 (seed-locked refinement of gen_06)

Held seed 1128792562; swapped the sapling/motes clause for "A small bright green young
sapling sprouts from the ground at its feet, glowing faintly with life."
- **gen_08_seed1128792562.png** — Composition held (seed lock worked) but the face became
  a jolly smile (lost gen_06's solemn gravitas) and the sapling didn't render clearly
  (only a faint yellow glow lower-left). Net regression. Rejected.

## Decision

NOMINATED BEST: gen_06_seed1128792562.png -> copied to BEST.png.
The legacy/death-transfer mechanic is a creature card, so the subject is rightly the
guardian itself; gen_06 nails the "ancient, weathered, defensive treefolk" character with
the cleanest silhouette and color identity. The explicit sapling/motes legacy beat never
rendered cleanly at 64x32 and risked cluttering, so it stays implicit. Stopped with 2
calls unused (8 of 10): further rolls would only risk drifting from a frame that already
lands. Total generation calls this session: 5 (calls 04-08); calls 01-03 pre-existed.
