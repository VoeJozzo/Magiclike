# Old Guardian — arm_b log

Card: GREEN 2/5 Treefolk creature (cost G + 3 colorless = 4 mana).
Trigger: when it DIES (battlefield -> graveyard), permanently gives +2/+2 to another creature you control.
Reading: an ancient guardian whose death passes its strength to a successor. Green theme: ancient nature, treefolk, growth, legacy, sturdy/defensive.

## Mechanic-in-art lens
The card's hero beat is DEATH-AS-LEGACY: the dying elder's strength flows into another (younger) creature.
Strongest enactment = a weathered, ancient treefolk guardian with a glowing-green sapling/successor at its
roots, life-force visibly transferring as green light from the old body into the new growth. Secondary read
(pure character note): a sturdy, mossy, defensive treefolk standing sentinel.

## Anchors (set calibration)
- treefolk_guard: humanoid treefolk in profile, brown-bark body + green leaf accents, bark-column bg. Closest analog.
- ancient_treant: dense mossy mass, dappled-light forest bg.
- forest_titan: hulking moss/stone giant on a ridge, layered-green forest bg.
Set vocab: brown-bark / moss-green bodies, leaf accents, forest backdrop with dappled light, subject fills frame.

## Constraints (this run)
image_size 64x32, no_background:false, batches <=5. Seeds from fixed array. Save arm_b only.

---

## Calls

### Pre-existing generations (no prior log; seeds inferred from filenames)
- gen_01 seed 1087734270 — treefolk FACE emerging from a seated bark body, forest bg. Reads as a treefolk
  creature; clear face, good color identity. A bit static/sleepy. Mechanic: absent (no transfer/successor).
- gen_02 seed 900405011 — a big tree, no creature face. Reads as scenery, not a guardian. Mechanic absent. WEAK.
- gen_03 seed 1386394568 — grey stony face + glowing green sapling at its base. Reaches for the legacy mechanic
  (old guardian + young sprout). Face reads stony/grey rather than treefolk-bark. PROMISING concept.
- gen_04 seed 1999766719 — tree trunk + faint green sprout at base; no clear creature face. WEAK.

Takeaway: gen_03's "elder + glowing sapling" is the most mechanic-true. Next calls push that legacy/transfer
read while keeping a CLEAR weathered treefolk face/body (per treefolk_guard anchor), not bare scenery.

### Batch (new direction: legacy/transfer — weathered treefolk + glowing successor sapling)
Prompt: "An ancient treefolk guardian with a gnarled brown-bark body, deep moss-green leaves and lichen-covered
shoulders, standing in a weary side profile, its cracked old trunk-body splitting open as glowing emerald
life-force streams out and pours into a small bright-green sapling sprouting at its roots. The old guardian's
eyes dim while the young sapling glows brighter. The background is a dense old-growth forest with bark columns
and dappled green light."

- gen_05 seed 1059835868 — big tree + small green sapling lower-left. Sapling present but guardian is just a
  tree (no face/figure). Scenery+successor; character missing. PARTIAL.
- gen_06 seed 1128792562 — big tree + green wisp at base. Scenery, no figure. WEAK.
- gen_07 seed 515064276 — WINNER of this batch. Clear weathered treefolk guardian (leafy crown, bark body),
  kneeling low/weary, reaching toward a bright emerald life-force glow on the forest floor. Strong figure +
  mechanic (life-force flowing out) + forest scene + green identity. Successor reads as an abstract glow.

### Seed-locked refinement + alt-seed (budget permitting)
- gen_08 seed 515064276 (seed-lock on gen_07; one change: glow -> explicit "small bright-green sapling creature
  sprouting from the forest floor beside it") — BEST OF RUN. Same strong crouching treefolk-guardian
  composition, now with a crisp distinct glowing sapling-successor. Mechanic (dying elder bequeaths strength to
  a young creature) reads unambiguously: old guardian + glowing young sapling + visible transfer. Excellent
  old-growth forest scene, dappled light, strong green identity, sturdy/defensive body fitting a 2/5. NOMINATED.
- gen_09 seed 1165263616 (original prompt, fresh seed) — scenery-only failure (tree + sapling, no guardian
  figure). Confirms the figure must be explicitly foregrounded. WEAK.

## DECISION
BEST = gen_08 (seed 515064276). The seed-locked sapling tweak improved mechanic legibility over gen_07 without
drifting the composition. Total generation calls this run: 5 (batch of 3 + refinement pair). 4 pre-existing
generations were carried in and evaluated but not regenerated.
