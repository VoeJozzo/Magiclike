---
type: concept
tags: [magiclike, engine, triggers]
created: 2026-06-10
updated: 2026-06-10
---

# Triggers and the stack (engine internals)

*Page anatomy + durability rules: [[README|engine hub]]. Canon: [[1000-triggered-abilities]], [[600-priority-and-the-stack]], [[700-casting-and-activating]]. The durable design rationale is [[trigger-resolution]]; this page is the verified mechanics.*

## What it does

The trigger pipeline turns game events into resolved abilities: `emit()` matches events against the battlefield's triggers, matches queue into `pendingTriggers`, the queue drains onto the real stack in APNAP order when priority next opens, and each entry resolves through `resolveTrigger`/`runTriggerEffects`. The same subsystem owns the loop defenses (the trigger budget cap + `noSelfCascade`), the human/AI target-pick machinery, and the two generated-trigger sources (the Architect's Codex build flow and the Mercurial Adept's boon pool).

## The flow

- **Emit.** `emit()` walks both battlefields (plus `extraSources` — how simultaneous deaths see each other) and matches each trigger's `event` against the event's `type`. The live vocabulary is the **five unified event kinds** (`VALID_TRIGGER_EVENTS` in `triggers.js`) with [[composable-predicates|composable condition arrays]] — the legacy `cond_id` vocabulary is fully retired in the proto. **Conditions evaluate at emit time** and are never rechecked (intervening-if deliberately absent — `docs/DIVERGENCE.md` E5), so "this turn" trackers read the right turn even for triggers that drain later. Targeted triggers also pass an emit-time any-legal-target gate before queueing (redundant with the drain-time check, and silent).
- **Queue → drain.** `pendingTriggers`' only clearing writer is `drainTriggers`, which pushes the active player's triggers first, then the non-active player's — LIFO puts NAP on top, the canonical APNAP outcome ([[1000-triggered-abilities|§1004]]; verified canon-correct). Triggers queued during CLEANUP survive the turn boundary and drain at the next turn's MAIN1, ordered by the **new** active player — canon-correct per [[600-priority-and-the-stack|§605]]. `pushTriggerOnStack` re-checks target legality (logging a fizzle), auto-picks via `pickBestTriggerTarget`, or pauses the drain on `pendingTriggerTarget` for a human pick; the board is frozen while any prompt is open (`isLegalAction` blocks everything but the pick). On a push, priority is handed to the opponent of the trigger's controller — the trigger-side twin of the cast-priority design ruling ([[turn-machine]]); with an AP-only drain batch the post-drain holder lands on the NAP.
- **Resolve.** `resolveTrigger` → `runTriggerEffects` runs the locked effects; since the re-validation fix, a `tsRevalidateTargets` gate runs once at resolution start (shared with the spell resolver — see [[effects-and-targeting]]): every targeted slot re-judged against the same legal sets used at queue time, whole-fizzle when all are illegal, illegal slots nulled when some survive. A mid-prompt fizzle logs. Optional costs (`doOptionalCost`) gate on affordability and pay via the mana path — sharing the [[turn-machine]]'s two-implementations-of-one-fact split between affordability checking and greedy payment.
- **Loop defenses, two layers.** (1) The **trigger budget cap**: `triggerChainDepth` counts total trigger resolutions per stack episode (reset only when both players pass on an empty stack), bailing with a log past 100 — a *budget*, not a nesting depth, and deliberately so (design ruling, below). (2) `noSelfCascade`: generated triggers carry a flag suppressing self-triggered firings (reads the event's `source_iid`), stopping token-ETB self-loops; different-card mutual loops are caught by the budget instead.
- **Activated abilities** (non-mana) resolve entirely **off the stack** — `doActivateAbility` pays costs, applies effects inline, then drains any spawned triggers; only those triggers are respondable (see the Stackable design direction below). Counterspells structurally cannot target triggers (the counter handler refuses trigger entries; the 'spell' target kind excludes them).
- **Generated triggers.** The Codex uses the three-step `generateConditionOptions` → `generateEffectOptions` → `assembleTrigger` flow; the Mercurial Adept seeds from `MERCURIAL_TRIGGER_POOL`. `assembleTrigger` always sets `noSelfCascade`. The unguarded production-dead twin (`generateRandomTrigger`) was removed. The whole generated vocabulary is executable (every event/atom/effect-kind/token registered, all archetypes round-trip), backed by boot validation that keeps it that way.
- **Delayed triggers** (`schedule_delayed`, the exile-until-EOT desugar) live in a separate queue drained during CLEANUP — the `fireAt:'endStep'` name is a known trap (it does not fire in the END phase; see [[turn-machine]]).

## Design rulings

- **The trigger cap is a budget, not a depth.** 100 total trigger resolutions per stack episode — kept deliberately: a cumulative budget bounds mutual A→B→A loops that true nesting-depth accounting would never catch (each loop round resolves at depth 1–2). The four descriptions (canon §1008, DIVERGENCE E6, comment, log text) are worded to match. *(Design ruling.)*
- **Non-mana activated abilities resolve off the stack — pending the Stackable design.** The lean model stands; a `Stackable` design (whether abilities should gain real stack entries) is an open design direction Joe may revisit. The divergence ledger (D8) carries the truthful row either way. *(Design direction.)*
- **Priority to the opponent after a stack push** (cast or trigger) — ruled on the [[turn-machine]] page; the companion behaviors (pass-tracker reset, no synthesized rounds in closed windows) follow from it.
- **Targets re-validate at resolution.** Hexproof-in-response and removal-in-response protect, with whole-fizzle/partial-null semantics. *(Design ruling — shared with [[effects-and-targeting|spells]].)*

## Verified clean

- **APNAP drain order** is canon-correct (correct but historically unfenced).
- **CLEANUP-queued triggers draining at next turn's MAIN1** with new-AP ordering — canon-correct, closed as a lead by all four lenses; emit-time condition evaluation means no wrong-turn "this turn" reads.
- **Nothing drains between first-strike passes** — and canon prescribes exactly that (queued deaths resolve at MAIN2).
- **emit/drain re-entrancy is safe** (emit snapshots its work; pushing runs no effects; mid-drain prompt pause/resume preserves effective order).
- **Counterspells can't target triggers** — conforms to [[700-casting-and-activating|§706]].
- **checkDeaths' batch `extraSources` design** correctly lets simultaneous deaths see each other.
- **No cross-game leaks** (`init()` rebuilds wholesale; emit/drain no-op on gameOver).
- **The generated-trigger vocabulary is fully executable and describable**, with boot validation guarding it.

## See also

[[README|Engine hub]] · [[trigger-resolution]] · [[composable-predicates]] · [[turn-machine]] · [[effects-and-targeting]] · [[1000-triggered-abilities]] · [[600-priority-and-the-stack]] · [[staple-synthesis]]
