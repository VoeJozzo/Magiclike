# Tier-3 Reconcile — Review Feedback

**From:** review agent (read-only critical review of the `claude/tier3-reconcile` plan set)
**To:** the planning agent maintaining the refactor docs
**Branch/path:** `claude/tier3-reconcile-review-XoskC` → `/REVIEW-tier3-feedback.md` (scratch; delete before any PR to `dev`)
**Status:** findings only. Nothing in the repo was modified by the review except this file.

---

## How this was reviewed

- Read all five plan docs (`plan-coordinated-refactor`, `plan-priority-window-refactor`, `plan-card-data-unification`, `plan-zone-change-and-composable-predicates`, `plan-effects-refactor`) plus `DIVERGENCE.md`, `SPEC.md`, `PROTOCOL.md`, `README.md`, `BACKLOG.md`.
- Cross-checked load-bearing claims against live code in `reference/html-proto/js/engine.js`, `engine/engine.gd`, `engine/json_card_loader.gd`, `engine/effects/`, `engine/predicates/`.
- Ran the proto suite (`node tests/run_all.js`) and wrote throwaway repros in the Node harness to test the flicker/iid interaction directly.
- **Not covered:** anything requiring Godot. This container has Node but no Godot binary, so the Godot-side slice gates (phase smoke tests, boot supportability scan) could not be exercised. That's an environment limit, not a plan defect — but whoever executes Slices 0–1 (Godot-only) needs a Godot session in the loop; a Node-only CI can never gate them.

## What was verified and found accurate (trust the rest)

- Proto effects audit: 39 `EFFECTS` rows, the silent duplicate `gainControl` (`engine.js:2123` dead / `2177` live, with an in-code comment acknowledging it), and the per-kind disposition table all match the live dispatch table.
- Godot side: 5 effect handlers, 1 predicate, `counter_spell`→`counter` rename already shipped — all as described.
- Priority-window assignment sites exist as enumerated (the *sites* are real; see line-number note below).

The homework is solid. The items below are execution-readiness gaps, not competence problems.

---

## GAP 1 — turn-one break: `JsonCardLoader` loses basic-land mana after §3.9

**Severity: high (every Godot game breaks at turn one if shipped as written).**

- Slice 1 (`plan-card-data-unification` Part 1) repoints Godot's `CardDatabase` at the proto `card.json` pool and *reuses* the 5 basics from it (they "already match verbatim").
- `engine/json_card_loader.gd:209–217` reads land mana from `json["mana"]` + `json["extraManaColors"]` into `l.mana_produced`.
- `plan-effects-refactor` §3.9 rewrites every land's `card.json` to the tap-ability shape (`abilities:[{cost:{tap}, effects:[{add_mana,…}]}]`) and **retires `extraManaColors`**, but explicitly defers Godot's adoption of the ability model.
- Once the shared JSON loses `mana`/`extraManaColors`, `json_card_loader.gd:209–217` finds nothing → basic lands tap for nothing.
- **Ownership void:** card-data-unification **Q3** hands this to §3.9 ("keep `JsonCardLoader`'s current handling for Part 1; let §3.9 change it"); §3.9 defers the Godot consumer. Nobody owns "keep Godot's lands working across the land-shape change."
- **Beyond the bug:** the stated goal is *cleaner engine integration*, but as written the mana model ends the pass **more** divergent (proto = ability model, Godot = still `extraManaColors`), with a live break in the window between.

**Fix options:**
1. Keep §3.9 strictly proto-internal — preserve the old land JSON shape on disk and synthesize the ability form at proto load-time only.
2. Add a land-ability → `mana_produced` translation step to `JsonCardLoader` **in the same slice** as §3.9.
3. Pull Godot's land-as-ability adoption forward into this pass so both engines consume the new shape.

Recommend **(2)** as the smallest safe bridge, or **(3)** if true convergence is the priority.

---

## GAP 2 — `chooses()` (§3.5) has no human-facing UI, and the plan treats it as established

**Severity: medium (under-scoped feature; estimate is light).**

- The current `edict` handler (`engine.js:1959`) contains `// TODO: forced-sac UI for player-side edicts` and **auto-selects the victim even when the human is the sacrificing player** (`if (them === 'you') … auto-selecting (forced-sac UI not implemented)`).
- §3.5 decomposes the edict into `target(player) → chooses(creature) → sacrifice`, where `chooses()` = "the targeted player selects one of their own permanents." For the AI that's fine; for the human it needs a choose-your-creature prompt that exists only for `ripPermanent` (`pendingRipSelect` / `doRipSelect`), not for plain edicts.
- The §11 effort table doesn't include building/wiring this.

**Fix:** add an explicit step — "build human `chooses()` prompt, reusing the `pendingRipSelect` infra" — and fold its cost into the effects-refactor estimate.

---

## CORRECTION 1 — §3.7 iid behavior may be backwards (hypothesis; verify with a test)

**Framed as a belief, not a settled fact.** I *believe* §3.7 may have the iid behavior inverted, but treat this as an unconfirmed hypothesis.

- A repro in the Node harness suggested that **flicker already mints a fresh iid** (`engine.js:2112`), so removal targeting the old iid fizzles correctly — i.e., the case §3.7 calls "currently a bug" appears to already work.
- The same repro suggested **`exileUntilEOT` returns the creature with its *original* iid** (`engine.js:5335`) — i.e., the path that §3.7 treats as fine may be the divergent one.
- If that's right, the design (mint on every `move_card`-to-battlefield) still lands correctly — it fixes the right path — but §12.10.1's regression test points at Bolt + Cloudshift (flicker), which would already pass and therefore wouldn't exercise the fix on the path that needs it.

**Recommended fix (low-cost, settles it either way):** add a regression test aimed at `exileUntilEOT` (Otherworldly Journey) — exile a creature, return it at end of turn, assert whether the returned creature's iid is fresh or reused. If reused, the test guards the fix; if already fresh, the test costs nothing and the hypothesis is simply wrong. Either outcome is acceptable — the point is to verify rather than assume. (Optionally also reword §3.7's prose so no one "fixes" the working flicker path, but that's cosmetic.)

---

## CORRECTION 2 — stale test baseline (362 → 482)

`plan-zone-change-and-composable-predicates` §11 and `plan-effects-refactor` §10 both cite "the existing 362 assertions"; the master doc correctly says 482. The live suite is **482** (verified: `node tests/run_all.js` → "Files: 18, assertions: 482"). The 362 figure is also stale in both `CLAUDE.md` and `reference/html-proto/CLAUDE.md`. Update the baseline so implementers have the correct regression gate. Trivial, but it's the number used to judge "did I break something."

---

## OBSERVATION 1 — `annihilate` may be cheap enough to close in this pass

The rip kludge is in the removal *verb*, not the targeting: rip-edict uses `sacrifice` (fires death/LTB triggers) where it should use `annihilate` (ceases to exist, no triggers). §4.2 lists `annihilate` as "pending — not built." But it looks like `sacrifice` minus the zone-change/trigger emission, and `Phylactery`'s `ripSlotForPhylactery` already plucks a card without emitting LTB. If it's genuinely ~10 lines, consider building it in this pass and actually hitting the clean 38→19 target rather than shipping the kludge. Worth confirming the deferral is a deliberate scope call, not a perceived hard dependency.

---

## OBSERVATION 2 — `exile_until_eot` deferral is parity, not technical necessity (on the proto side)

Its decomposition needs a generic `schedule_delayed` primitive (the "B4" machinery). Godot has nothing and no card that needs it (Phase 7+). But **proto already has the raw mechanism** — `G.delayedTriggers`, used by `exileUntilEOT` itself at `engine.js:2163`; it just isn't generalized into a `schedule_delayed` *effect*. The plan defers on *both* engines to keep them symmetric, which is a defensible choice — but on the proto side it's parity, not a hard block. Decide consciously whether proto decomposes now or waits for Godot parity.

---

## Examined and deliberately NOT flagged

- **Line-number drift.** `engine.gd` has shifted ~9 lines since the docs were written (e.g., priority sites cited at 640/654/929/1503 are actually 649/663/938/1512; `DIVERGENCE.md` B6 repeats the stale set). The *sites* all exist and map cleanly. Cosmetic — implementers grep for functions. No action needed beyond a refresh if convenient.
- **§3.5 targeting integration.** Considered whether the resolution-loop wiring needs a prior sub-plan. Concluded **no** — the behavioral contract (§3.5) and the hexproof verification suite (§12.2, 8 cases incl. the edict case) are both complete and jointly pin the correct outcome; internal wiring is local per-engine implementation against them (proto already has `item.targets[0]` + `snapshotTarget` + `sharedSnap` at `engine.js:3900`). Residual is estimate risk (largest single line item), not a planning gap.
- **Priority / sequencing ordering.** The pass is sequenced ahead of Godot's known 🔴 gaps (multi-blocker damage `engine.gd` dumps on `blockers[0]`; no first-player randomization; no first-turn draw-skip). Consistent with the stated strategy — harmonize existing cross-engine behavior before adding Godot-only features, since proto is the primary dev surface. The new machinery (last-known-info, iid) is added to *both* engines as harmonization, not Godot-only feature work. No action.
