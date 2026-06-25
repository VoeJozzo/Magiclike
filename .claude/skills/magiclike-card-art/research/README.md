# Card-art skill — the tuning experiment, in brief

A one-time blind A/B program (**C2–C6**) tuned the `magiclike-card-art` skill.
The techniques it validated are baked into [`../SKILL.md`](../SKILL.md); this is
the short record of *what was tried*. Full raw detail — per-card verdicts, the
harness, every skill-variant snapshot, all generated frames — is recoverable
from git history and the off-repo archive zip. Only `gen_image.py` (the live
generation helper the skill uses) is kept here alongside this note.

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
