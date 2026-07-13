---
type: concept
tags: [magiclike, engine, turn-structure]
created: 2026-06-10
updated: 2026-06-10
---

# Turn machine (engine internals)

*Page anatomy + durability rules: [[README|engine hub]]. Canon: [[500-turn-structure]], [[600-priority-and-the-stack]], [[1100-state-based-actions]], [[1200-ending-the-game]].*

## What it does

The turn machine is the html-proto's heartbeat: a single `step()` loop in `engine.js` that walks the phase sequence, opens and closes priority rounds, empties mana pools at phase boundaries, runs state-based actions (deaths, life-total losses), handles the cleanup discard and end-of-turn reverts, and rolls the turn to the other player. Everything else — [[combat]], [[triggers-and-stack|triggers]], [[effects-and-targeting|effects]] — runs *inside* windows this loop opens.

## The flow

- **Phases.** `step()` drives UNTAP → DRAW → MAIN1 → COMBAT_ATTACK → COMBAT_BLOCK → COMBAT_DAMAGE → MAIN2 → END → CLEANUP. UNTAP and DRAW are real, distinct, auto-advancing phases (each a behaviorally observable boundary — pools empty at every `setPhase`). There is **no UPKEEP phase** — intentional (`docs/DIVERGENCE.md` B1).
- **UNTAP** untaps only the new active player's permanents (an opponent's land tapped on your turn stays tapped through your whole turn) and resets the `lifeLostThisTurn` accumulators.
- **DRAW** auto-draws via `drawCard`, which returns null on the two empty-library paths: deck-out (loss per [[1200-ending-the-game|§1201]]) or a Phylactery slot-rip instead. The DRAW log line is gated on an actual draw.
- **Priority.** `openPriorityRound` opens a round with the active player holding; `passPriority` tracks passes in `G.priority.passes`; when both players have passed, the top stack entry resolves (or `advancePhaseAfterPriority` moves the phase on an empty stack). After a cast, `pushOnStack` clears the pass set and **hands priority to the opponent** — a design ruling, see below. The active player auto-passes its own END step when the stack is empty (`skipApEndStep` — intentional, test-pinned; the non-active player's end-of-turn instant window is preserved and load-bearing for flash AI).
- **Mana.** Pools empty at every phase boundary via whole-object replacement in `setPhase` ([[mana-model]], DIVERGENCE B2). Affordability is judged by the backtracking `canPayPotential`; actual payment by the greedy `payMana` — two implementations of one fact (affordability via the backtracking `canPayPotential`; payment via the greedy `payMana`).
- **End Turn fast-forward.** `doEndTurn` arms `endTurnPending`; the controller auto-passes until the next turn. Any non-pass action by the active player — including answering a *forced* modal — disarms it (design ruling, below).
- **CLEANUP** runs the discard-to-7 (a turn-based-action window, deliberately not a `PENDING_DECISIONS` modal), drains the delayed-trigger queue (`fireAt:'endStep'` entries actually fire here in CLEANUP, not in the END phase — a known naming trap, comment-documented), unwinds end-of-turn effects (temp control, EOT keyword grants — all five temp systems have symmetric cleanup sites), clears combat state, and rolls the turn counter on the non-active player's cleanup.
- **State-based actions.** `checkDeaths` is an uncapped `while(true)` with a *provable* termination argument: dies-triggers queue into `pendingTriggers` rather than resolving inline, so the battlefield strictly shrinks each iteration. (The Godot engine instead uses a 20-iteration safety cap — an engine-local mechanism, not canon; the [[cross-engine-port|engines differ]] here deliberately.) Post-fix, indestructible creatures are exempt from the *damage-based* death causes only — toughness ≤ 0 still kills (see ruling below). `checkLifeTotals` handles loss at life ≤ 0, deferring to the Phylactery rip where a slot remains.
- **Action dispatch.** All mutations flow through `executeAction` → `isLegalAction` gate → the `do*` handlers, which assume pre-validated input ([[action-descriptor-pattern]]). The action vocabulary lives in four hand-synced switches with no default arms.

## Design rulings

- **Priority passes to the opponent after a cast.** `pushOnStack` deliberately gives the non-caster the first response window (the caster regains priority once the opponent passes, so follow-up stacking is delayed, not denied). Response-first by design; the rulebook documents it as the intended priority model. *(Design ruling.)*
- **Empty combat skips the priority window.** Zero declared attackers jump straight to MAIN2 with no COMBAT_ATTACK round for either player — the very next window is state-identical today, and the lean turn loop is preferred. *(Design ruling.)*
- **Forced modals disarm End Turn fast-forward.** Answering any prompt mid-fast-forward — compelled or voluntary — counts as re-engaging and cancels the End Turn. *(Design ruling.)*
- **Indestructible survives lethal damage but dies at toughness ≤ 0.** Indestructibility exempts the damage/deathtouch death causes only; a creature shrunk to no body dies regardless ([[1100-state-based-actions|§1101]]). *(Design ruling.)*

## Verified clean

- `checkDeaths`' uncapped sweep **provably terminates** (the queue-don't-resolve design bounds it at O(creatures)).
- The `tapLandForMana` priority gating is canon-correct — the mid-cost prong of [[700-casting-and-activating|§705]] is implemented *inside* `payMana`'s auto-tap, where no decision window exists.
- The `isLegalAction`/`getLegalActions` dual encoding is a test-pinned design, not drift — `executeAction` gates all mutations either way.
- `init()` rebuilds `G` wholesale; no cross-game state leaks via timers or stale iids were reachable.
- Stale dead attackers proceeding to the block step (rather than skipping combat) is canon-correct per [[800-combat|§801]].

## See also

[[README|Engine hub]] · [[combat]] · [[triggers-and-stack]] · [[effects-and-targeting]] · [[magiclike-architecture]] · [[mana-model]] · [[action-descriptor-pattern]] · [[500-turn-structure]] · [[600-priority-and-the-stack]]
