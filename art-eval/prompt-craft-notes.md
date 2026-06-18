# Card-art prompt-craft notes

A durable, **committed** log of concrete, reusable prompt-craft discoveries surfaced
during art-eval rounds. The production skill (`.claude/skills/magiclike-card-art/SKILL.md`)
is the eventual home; this file is the reset-proof capture so a discovery isn't lost
between sessions. Fold the durable ones into the skill when convenient.

---

## Treefolk / object-creatures — name the creature anatomy or you get a plain object

**Surfaced:** C5 round, `symbiote_tree`, treatment arm (arm_b). The user flagged it:
*"it accidentally stumbled upon how to prompt Treefolk."*

**Problem:** the model's subject-prior collapses `"treefolk"` into an *inanimate tree* and
drops the creature beat entirely — you get a landscape feature, not a character.

**Fix that cracked it (the gen 3 jump):** spell out explicit **creature anatomy** in the
noun phrase — a *face*, *arms/limbs*, *hands*, *posture* — so the model renders an animate
being rather than the object the noun defaults to.

- ❌ weak: *"A towering **treefolk** of gnarled mossy bark and deep emerald leaves…"* → tree.
- ✅ works: *"A towering **treefolk creature with a gnarled bark face and long reaching
  wooden arms**, …, its **branch-arms** wrapped around …, glowing sap flowing from the
  treefolk **hands** into …"* → animate tree-person.

**Generalizable rule:** for any creature whose noun carries a strong *inanimate* prior
(treefolk, living wall, animated statue, ambulatory fungus, a "living land," etc.),
**describe the body in concrete physical parts** — face, limbs, hands, stance. The
anatomical nouns are what flip the model from "object" to "creature." This is the same
family of move as the figure-ground inversions that cracked `petrify` and `living_lands`:
when a prior fights you, lead the prompt with the concrete physical thing you want.

**Reference — the winning prompt (`symbiote_tree` arm_b, gen 5 line):**

> A towering treefolk creature with a gnarled bark face and long reaching wooden arms,
> mossy bark and deep emerald leaves, standing on the left, a thick rope of glowing
> lime-green sap arcing from its branch-hand into a huge muscular gray wolf on the right.
> The wolf is enormous and bulging with muscle, swelling visibly larger as bright green
> energy pumps into it, its hackles raised. The background is a dense old-growth forest
> with crepuscular rays of sunlight filtering through the dark canopy.
