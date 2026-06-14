---
type: concept
tags: [magiclike, engine, ai]
created: 2026-06-12
updated: 2026-06-12
---

# AI (engine internals)

*Page anatomy + durability rules: [[README|engine hub]]. The player-lens concept companion (card evaluation, open-vs-forcing, the CABS lens) is **draft-strategy**, which lives vault-side — it is not an in-repo page. This page carries the verified engine-side mechanics of the AI player agent in `ai.js` plus its engine-resident helpers.*

## What it does

The AI is a **player agent, not a rules layer**: `AI.decide(state, playerKey)` proposes one action per call, and the engine judges it like any other player's action. Its decision order is fixed — pending trigger-target pick → block declaration → attack declaration → instant-speed response → main-phase play → pass. The combat brain (`simulateCombat`, `findBestBlocks`) forecasts fights; the valuation layer (`spellValueForEffects`, `abilityValue`, `scoreSpellTargetForMode`, `bestSpellPlay`) prices plays; the respond arm (`decideReaction`, `shouldCounter`) handles the stack. Trigger targets never reach `AI.decide` at all — when the AI controls a trigger, the engine auto-picks via `pickBestTriggerTarget` (engine-side, reached through the trigger push's auto-pick path); humans get a prompt instead.

## The flow

- **The legality contract.** Every candidate the AI considers is drawn from the engine's own legal-action surface (`getLegalActions` / `isLegalAction` and the shared predicates) — and for **attack/block eligibility there is no twin at all**: the AI calls the engine's eligibility logic directly, so there is no duplicated copy to drift. The single-source-of-truth discipline holds. Consequence: AI play is legal by construction *as long as that surface is honest* — a gap in the legal-action enumeration would leak straight into AI behavior, and the selfplay harness's illegal-action classification is what turns a skew into a detectable signal.
- **The drift-twin inventory.** Four duplicated-or-shared logic pairs, the drift mechanism this subsystem must police:
  1. **`simulateCombat` ↔ the engine's two-pass combat damage** (`resolveCombatDamage`, [[combat]]) — the big *deliberate* twin: the sim re-implements combat so the AI can forecast without touching real state. Drift is managed by an explicit **lockstep discipline**: a tracked checklist of divergence axes (first-strike ordering, deathtouch lethality, the mana solver, lord buffs, zone events, batch wraths, lethalNeeded/trample carryover, the sac-for-mana enumeration), with in-code lockstep markers in the sim. Every engine combat change must re-walk this list; all eight axes are verified in sync.
  2. **`spellValueForEffects` ↔ `abilityValue`** — parallel valuation tables (cast-path pricing in ai.js vs trigger/ability pricing engine-side) with no shared code. This pair **can desync silently** — a kind valued by `abilityValue` need not have a matching branch in `spellValueForEffects`, and the boot watchdog (`effectCoverageReport`) does set algebra rather than per-path branch verification, so it does not catch that shape on its own.
  3. **`flashETBWouldFizzle`** — an ai.js re-implementation of an engine-side resolution/fizzle judgment ([[effects-and-targeting]]); a re-implementation twin with no lockstep marker, kept on this inventory so it gets re-walked when the engine's fizzle rules move.
  4. **The mana solver — lockstep by construction.** Post the one-solver consolidation, the sim *shares* `solveManaPayment` / `manaAbilityOf` with the engine rather than twinning them: they cannot disagree. The flip side is shared blindness — any limitation in the shared solver is inherited identically by sim and engine, so the lockstep table can be green while both share the same gap.
- **The valuation partition contract.** Every effect kind is supposed to be either in `VALUED_EFFECT_KINDS` (backed by a real scoring branch in `spellValueForEffects` *or* `abilityValue`) or deliberately unvalued; `effectCoverageReport` (engine-side) is the boot watchdog meant to catch a new kind shipped without a value. **Known verification gap:** the report does membership/staleness set algebra only — it cannot verify that the scorer *for the path that needs it* actually has a branch. Hardening constraint for any fix: at least two shapes price at zero **on purpose** ('sacrifice', whose value rides its chooses-edict component, and one move_card shape) — a naive "every VALUED kind must score non-zero" probe cries wolf; a hardened probe must be per-kind aware with documented exceptions.
- **Sanctioned transient mutations of live `G`.** ai.js performs exactly **two** evaluation-time mutations of the real game state, both restored in `finally`: `scoreFlashAmbush` pushes a temporary clone onto the battlefield to forecast a flash ambush, and `combatBuffSwingValue` temp-writes buffs to measure a swing. Standing caveat (recorded watch item, not a finding): during the `scoreFlashAmbush` window **two objects share an iid** — nothing re-enters the engine inside that window today, but any future code that does would see the alias. Treat restore-in-`finally` + no-engine-reentry as the invariant for any new probe of this style.
- **The respond arm (post-Stackable shape).** `shouldCounter` passes over triggers **and abilities** on the stack — abilities aren't counterable, per [[rulebook|canon]] §1004.6. `decideReaction`'s counter-target match relies on **object identity** (`a.targets[0].stackItem === top`): it holds only because enumeration and decide both read the live `G.stack`. **This is a live-G assumption to respect**: any future snapshot-based decider would silently never counter.
- **Nondeterminism.** Exactly one source in the whole AI: a `Math.random() < 0.5` coin flip in the draw/discard counter decision. Fine for play; the one thing a reproducible harness must seed or stub.

## Design rulings

No mechanics rulings are specific to this subsystem; two postures govern it. **Magiclike's rules are _the_ rules** — the AI is judged against them, never against real-MTG play conventions. And **AI valuation and pick changes are game outcomes**: a behavior change to AI play is treated as a balance/quality decision, not a free bug-fix. Canon governs the AI's legality, not its judgment: a legal-but-value-blind pick is a quality matter, never a rules bug.

## Verified clean

The full **8-axis sim↔engine lockstep table** is in sync; **no twin** exists for attack/block eligibility (the AI uses engine logic directly); `hymnwright`'s activated graveyard-recall routes through `pickBestActivation` and is **fully value-aware** (a dedicated graveyard→hand arm with per-target scoring); pool reachability scans — all 297 card JSONs plus a recursive deep-scan of embedded sticker payloads — found **zero** extra-cost mana producers and zero add_counter cast effects; the production controller reads `executeAction`'s boolean and falls back to pass; `AI.decide` is deterministic except the one coin flip noted above; and the sim's `isDead` indestructible-immunity branch is unreachable in its damage-only context.

## See also

[[README|Engine hub]] · [[combat]] · [[triggers-and-stack]] · [[effects-and-targeting]] · [[mana-model]] · [[rulebook|Comprehensive Rules]] · [[html-proto]] · [[cross-engine-port]]
