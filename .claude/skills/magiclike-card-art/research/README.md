# Card-art skill — the tuning experiment, in brief

A one-time blind A/B program (**C2–C6**) tuned the `magiclike-card-art` skill.
The techniques it validated are baked into [`../SKILL.md`](../SKILL.md); this page
is the short record of *what was tried*.

Kept alongside it: the working toolkit — `gen_image.py` (generation), `harness.py`
(A/B orchestration + contact-sheet builder), `../review-applet/` (blind reviewer),
plus the `variants/` skill snapshots and `verdicts_*.json` the harness/applet read.
Trimmed away (recoverable from git history + the off-repo archive): the verbose
per-round ledgers, working notes, and the raw generated frames.

## Method
For each card: a **control** arm (skill as-is) and a **treatment** arm (skill +
one candidate block) each generated a spread; a human director picked the better
*pool* and the *keeper*, blind to which arm was which. Seeds and blind labels were
derived deterministically from the card name, so a container reset couldn't lose
the answer key.

## Candidates & results
| Cand | Hypothesis | Result |
|---|---|---|
| C2 | "Reach, don't hedge" — prompt the ambitious, diagnosable-flaw version | **Won → adopted** |
| C4 | "Ground the depiction in reality" | Null (7T/10C, p=0.63) |
| C5 | "Diagnose-then-iterate" (agent self-critique + inpaint) | Null |
| C6 | "Explore wide — breadth over depth" | **Won spread-quality (22T/4C, p=0.001) → adopted** |

## Conclusions (now in SKILL.md)
- **Breadth beats depth for the *spread*** (p=0.001, survives Bonferroni across the
  program): a wide set of distinct takes gives the director a better menu. The
  single-best-keeper effect was only a weak, unconfirmed lean (19/30, p=0.20).
- **The lever is the human-in-the-loop, not a solo skill block.** Both agent-solo
  interventions (C4, C5) were null — selection and direction stay the director's.
- **Inpaint needs a human**: fired blind it mostly returns noise, and the solo
  diagnose-then-inpaint posture (C5) didn't beat control.
- A final production run then arted the never-arted card tail with the merged
  breadth skill; keepers are placed under `reference/html-proto/cards/<tplId>/`.

## The model-arms round (2026-08)

A second blind program asked whether the **authoring LLM** matters: four Claude
tiers (fable / haiku / opus / sonnet) each wrote 10-prompt pools for the same
cards under the identical skill; the director judged pools blind to authorship
(deterministic per-card label permutations; seeds derived from card|label|gen so
container resets couldn't lose the key). 4 rounds, 21 cards, ~850 frames.

| Question | Result |
|---|---|
| Does tier affect keeper rate? | **Null** — keepers 5/5/4/4 across tiers, p≈1.0 |
| Does the director prefer any tier's pools? | **Null** — points p=0.51; per-round rankings inverted violently (r1 winner was r2 loser) |
| Any effect at all? | **Opus bench depth** — most high-value flags per pool, p=0.0064, pre-registered between rounds |
| Sighted iteration vs blind batch? | Tie on the one card that resisted both (n=1) — process is a weak lever; the image model's subject prior is the bottleneck |

Conclusion (now in SKILL.md §Model choice): default batch authoring to Opus for
the deeper bench; substitute any tier freely — keeper rate won't move. Never
judge a model on one round. A production run then arted the remaining card tail
(34 cards, ~82% first-pool keeper rate); the last holdouts fell to director-
prescreened fresh-context prompts and one sighted-iteration session. Full
per-round ledger: git history of this branch + the off-repo archive.
