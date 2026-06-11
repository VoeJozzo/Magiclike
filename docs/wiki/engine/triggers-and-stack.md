---
type: concept
tags: [magiclike, engine, audit, triggers]
created: 2026-06-10
updated: 2026-06-10
sources: ["docs/audit/chunk-03-stack-triggers.md", "PR #98 verdict rounds (2026-06-10)"]
---

# Triggers and the stack (engine internals)

*Audit chunk 3. Page anatomy + durability rules: [[README|engine hub]]. Canon: [[1000-triggered-abilities]], [[600-priority-and-the-stack]], [[700-casting-and-activating]]. The durable design rationale is [[trigger-resolution]]; this page is the verified mechanics.*

## What it does

The trigger pipeline turns game events into resolved abilities: `emit()` matches events against the battlefield's triggers, matches queue into `pendingTriggers`, the queue drains onto the real stack in APNAP order when priority next opens, and each entry resolves through `resolveTrigger`/`runTriggerEffects`. The same subsystem owns the loop defenses (the trigger budget cap + `noSelfCascade`), the human/AI target-pick machinery, and the two generated-trigger sources (the Architect's Codex build flow and the Mercurial Adept's boon pool).

## The flow

- **Emit.** `emit()` walks both battlefields (plus `extraSources` — how simultaneous deaths see each other) and matches each trigger's `event` against the event's `type`. The live vocabulary is the **five unified event kinds** (`VALID_TRIGGER_EVENTS` in `triggers.js`) with [[composable-predicates|composable condition arrays]] — the legacy `cond_id` vocabulary is fully retired in the proto. **Conditions evaluate at emit time** and are never rechecked (intervening-if deliberately absent — `docs/DIVERGENCE.md` E5), so "this turn" trackers read the right turn even for triggers that drain later. Targeted triggers also pass an emit-time any-legal-target gate before queueing (redundant with the drain-time check and silent — open soft spot A3-10).
- **Queue → drain.** `pendingTriggers`' only clearing writer is `drainTriggers`, which pushes the active player's triggers first, then the non-active player's — LIFO puts NAP on top, the canonical APNAP outcome ([[1000-triggered-abilities|§1004]]; verified canon-correct). Triggers queued during CLEANUP survive the turn boundary and drain at the next turn's MAIN1, ordered by the **new** active player — canon-correct per [[600-priority-and-the-stack|§605]]. `pushTriggerOnStack` re-checks target legality (logging a fizzle), auto-picks via `pickBestTriggerTarget`, or pauses the drain on `pendingTriggerTarget` for a human pick; the board is frozen while any prompt is open (`isLegalAction` blocks everything but the pick). On a push, priority is handed to the opponent of the trigger's controller — the trigger-side twin of the cast-priority design ruling ([[turn-machine]]); with an AP-only drain batch the post-drain holder lands on the NAP.
- **Resolve.** `resolveTrigger` → `runTriggerEffects` runs the locked effects; since the re-validation fix, a `tsRevalidateTargets` gate runs once at resolution start (shared with the spell resolver — see [[effects-and-targeting]]): every targeted slot re-judged against the same legal sets used at queue time, whole-fizzle when all are illegal, illegal slots nulled when some survive. A mid-prompt fizzle logs (fix shipped 2026-06-10). Optional costs (`doOptionalCost`) gate on affordability and pay via the mana path — inheriting the [[turn-machine]]'s A1-2 payment-mismatch soft spot.
- **Loop defenses, two layers.** (1) The **trigger budget cap**: `triggerChainDepth` counts total trigger resolutions per stack episode (reset only when both players pass on an empty stack), bailing with a log past 100 — a *budget*, not a nesting depth, and deliberately so (design ruling, below). (2) `noSelfCascade`: generated triggers carry a flag suppressing self-triggered firings (reads the event's `source_iid`), stopping token-ETB self-loops; different-card mutual loops are caught by the budget instead.
- **Activated abilities** (non-mana) resolve entirely **off the stack** — `doActivateAbility` pays costs, applies effects inline, then drains any spawned triggers; only those triggers are respondable. Pending the Stackable design (ruling below). Counterspells structurally cannot target triggers (the counter handler refuses trigger entries; the 'spell' target kind excludes them).
- **Generated triggers.** The Codex uses the three-step `generateConditionOptions` → `generateEffectOptions` → `assembleTrigger` flow; the Mercurial Adept seeds from `MERCURIAL_TRIGGER_POOL`. `assembleTrigger` always sets `noSelfCascade`. The unguarded production-dead twin (`generateRandomTrigger`) was removed (2026-06-10). The whole generated vocabulary was verified executable (every event/atom/effect-kind/token registered, all archetypes round-trip) — what's missing is boot validation *keeping* it true (A3-5, GO).
- **Delayed triggers** (`schedule_delayed`, the exile-until-EOT desugar) live in a separate queue drained during CLEANUP — the `fireAt:'endStep'` name is a known trap (it does not fire in the END phase; see [[turn-machine]]).

## Design rulings

- **The trigger cap is a budget, not a depth.** 100 total trigger resolutions per stack episode — kept deliberately: a cumulative budget bounds mutual A→B→A loops that true nesting-depth accounting would never catch (each loop round resolves at depth 1–2). The four descriptions (canon §1008, DIVERGENCE E6, comment, log text) get reworded to match. *(Design ruling, PR #98, 2026-06-10.)*
- **Non-mana activated abilities resolve off the stack — pending the Stackable design.** The lean model stands for now; Joe is exploring a `Stackable` design (whether abilities should gain real stack entries) before ruling finally. The divergence ledger (D8) gets the truthful row either way. *(Direction per PR #98, 2026-06-10 — investigation confirmed, final ruling pending.)*
- **Priority to the opponent after a stack push** (cast or trigger) — ruled on the [[turn-machine]] page; legs 2–3 of that cluster (pass-tracker reset, no synthesized rounds in closed windows) ruled GO as fixes.
- **Targets re-validate at resolution.** Hexproof-in-response and removal-in-response now protect, with whole-fizzle/partial-null semantics. *(GO ruling, PR #98, 2026-06-10; implemented PR #111 — shared with [[effects-and-targeting|spells]].)*

## Verified clean

- **APNAP drain order** is canon-correct (correct but historically unfenced).
- **CLEANUP-queued triggers draining at next turn's MAIN1** with new-AP ordering — canon-correct, closed as a lead by all four lenses; emit-time condition evaluation means no wrong-turn "this turn" reads.
- **Nothing drains between first-strike passes** — and canon prescribes exactly that (queued deaths resolve at MAIN2).
- **emit/drain re-entrancy is safe** (emit snapshots its work; pushing runs no effects; mid-drain prompt pause/resume preserves effective order).
- **Counterspells can't target triggers** — conforms to [[700-casting-and-activating|§706]].
- **checkDeaths' batch `extraSources` design** correctly lets simultaneous deaths see each other.
- **No cross-game leaks** (`init()` rebuilds wholesale; emit/drain no-op on gameOver).
- **The generated-trigger vocabulary is fully executable and describable** today; the gap is the validation mechanism, not the data.

## Open soft spots

Live status: `docs/audit/INDEX.md`. Known-open at distillation time (several already GO and queued): **A3-3** (budget-cap doc rewrites), **A3-4** (canon §1000 rewrite — the page still documents the retired trigger system; authorized), **A3-5** (boot-validate the three generated-trigger tables), **A3-6** (zone-vocabulary over-promise; approved as a build-out: arbitrary zone-movement events), **A3-10** (the silent emit-time gate), **A3-13** (condition-array aliasing into the Mercurial pool — deep-copy fix, GO), **A3-14** (unknown `fireAt` values immortal in the delayed queue), **A3-2** (Stackable ruling pending). Parked: A3-9 (the orchestration/generator test battery + the design riders: dies-trigger source LKI, 'player'-slot auto-fill vs prompt, 'opponent' text vs free player choice).

## Coverage reality

As of the 2026-06-10 morning mutation map (predates that day's test additions): `triggers.js` is the campaign's **best-killed file (76%)** — the atomic predicates, condition walker, and shorthand paths are genuinely fenced; the dark remainder is the silent-fallback class plus the entire `noSelfCascade` guard. `trigger-generator.js` is effectively dark (**13% killed**), with the hard-break-filter test self-referential (green theater). The engine's trigger/stack orchestration region had **240 of 527 mutants survive** — the drain order, post-drain priority holder, budget cap, and `pickBestTriggerTarget` heuristic were all unpinned. **Pinned that day:** resolution-time re-validation incl. fizzle semantics (PR #111, 16 assertions), the `source_iid` payload family + the live combat-lifelink self-cascade it exposed (PR #108), the mid-prompt fizzle log (PR #109), and the generator test re-pointed off the dead twin (PR #110).

## See also

[[README|Engine hub]] · [[trigger-resolution]] · [[composable-predicates]] · [[turn-machine]] · [[effects-and-targeting]] · [[1000-triggered-abilities]] · [[600-priority-and-the-stack]] · [[staple-synthesis]]
