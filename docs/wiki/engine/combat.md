---
type: concept
tags: [magiclike, engine, audit, combat]
created: 2026-06-10
updated: 2026-06-10
sources: ["docs/audit/chunk-02-combat.md", "PR #98 verdict rounds (2026-06-10)"]
---

# Combat (engine internals)

*Audit chunk 2. Page anatomy + durability rules: [[README|engine hub]]. Canon: [[800-combat]], [[900-keywords]].*

## What it does

Combat is the declare-attackers → declare-blockers → two-pass damage pipeline inside the [[turn-machine]]'s three combat phases. It owns declaration legality (who may attack/block whom), the combat keyword layer (flying, first strike, deathtouch, trample, lifelink, vigilance, menace…), the damage-assignment algorithm, and the bookkeeping that keeps `G.attackers`/`G.blockers` honest as creatures die or leave mid-combat. `docs/DIVERGENCE.md` C1/C2 designates this code as the spec the [[cross-engine-port|Godot port]] harmonizes to.

## The flow

- **Declaration.** `declareAttackers` legality checks each iid via `canCreatureAttack` (defenders can't attack; summoning-sick without haste can't attack — [[900-keywords|§901]]) and rejects duplicate iids (a seen-set mirroring the blockers side; fix shipped 2026-06-10). `doDeclareAttackers` taps each attacker unless it has vigilance and emits one `attacks` event per attacker. `declareBlockers` enforces tapped-blocker ban, one-attacker-per-blocker (`usedBlockers` set), the flying/reach/unblockable gates (`canCreatureBlock`), and menace's 2+-blocker requirement (whose check site carries a comment documenting a prior silent-failure bug of exactly this shape — recurrence-fence accordingly).
- **Two-pass damage.** `resolveCombatDamage` runs a first-strike pass, then an SBA sweep + game-over check, then the normal pass (`dealCombatDamage` twice). Nothing drains *triggers* between passes — deaths queue and resolve at MAIN2's priority round, which is exactly what canon prescribes ([[800-combat|§803]], [[600-priority-and-the-stack|§605]]). Pass membership is currently read from **live** keywords at each pass — so a lord dying in pass 1 changes who strikes in pass 2 (see open soft spots; Joe is leaning intentional).
- **Damage assignment.** Against multiple blockers, `dealCombatDamage` orders living blockers by the kill-value heuristic (`getCardValue`) with indestructibles last — deliberately *not* declaration order, and deliberately not real-MTG attacker-chosen ordering. Note the coupling: retuning the AI's kill-value heuristic silently changes *rules* behavior (which blocker dies first).
- **Deathtouch** makes 1 damage a lethal dose when splitting damage — against every blocker, indestructible included (design ruling, below). The victim gets the `dealtDeathtouch` mark (a victim-side flag despite the name; the Godot port calls it `lethal_marked`), which `checkDeaths` reads.
- **Trample** carries the remainder to the defending player once every blocker has been assigned its remaining toughness — including the boundary where a blocker already needs **zero** more (a fully-marked indestructible counts as satisfied; fix shipped 2026-06-10).
- **Lifelink** pays on every combat-damage arm — blocked, unblocked, trample spill, and overkill onto satisfied blockers — always for the attacker's **full power** (design ruling, below). The gain emits `life_changed` with `source_iid` attached (payload fix shipped 2026-06-10).
- **Removal from combat.** A creature that dies, bounces, or changes controller mid-combat is pruned from `G.attackers`/`G.blockers` through the shared `removeFromCombat` funnel (with tombstoned-blocker semantics), closing the ghost-attacker class (a bounced-and-recast flash creature used to re-match its stale entry — cast arrivals do *not* re-mint iids; only the move_card/flicker path does). An attacker dying mid-round after declaration still sends combat to the block step — canon-correct per [[800-combat|§801]].
- **Cleanup.** Damage, `dealtDeathtouch`, EOT grants, and the attacker/blocker maps are all cleared at end of combat / end of turn.

## Design rulings

- **Deathtouch dose = 1 against everyone, indestructible included.** One deathtouch damage is a lethal-equivalent assignment for trample/ordering purposes against every blocker — the old indestructible carve-out was removed, engine and AI in lockstep. *(Design ruling, PR #98, 2026-06-10; implemented PR #114.)*
- **Lifelink always gains full power.** Overkill damage still pays full lifelink — the audit of this ruling found and fixed an arm (satisfied blockers, no trample) that paid zero. *(Design ruling, PR #98, 2026-06-10; implemented PR #114.)*
- **Blocker damage order is the kill-value heuristic, not declaration order.** Comment-documented deliberate design in the proto (the Godot side currently uses declaration order — a tracked divergence, `docs/DIVERGENCE.md` C1).
- **Empty combat skips the priority window** — ruled on the [[turn-machine]] page (the skip lives in `step()`).
- **Indestructible survives lethal damage but dies at toughness ≤ 0** — ruled on the [[turn-machine]] page (the check lives in `checkDeaths`); the marked-damage retention on indestructibles is the test-pinned F2 behavior.

## Verified clean

The rules lens read the damage core line-by-line against canon and cleared: vigilance no-tap; the defender-ban and sick/haste attack gates; flying/reach/unblockable block gates; the menace 2+ check (code right, coverage thin); tapped-blocker ban and one-attacker-per-blocker; the two-pass structure with its between-pass SBA sweep; blocked-attacker-with-all-dead-blockers deals nothing without trample; trample leftover math in the normal cases; deathtouch threshold vs killable blockers; lifelink presence on all damage sites; indestructible damage retention (DIVERGENCE F2); end-of-combat/turn state clearing; and static lord grants reaching combat in practice.

## Open soft spots

Live status: `docs/audit/INDEX.md`. Known-open at distillation time: **A2-1** (first-strike pass membership read live — a lord dying in pass 1 lets its squad strike twice; Joe leaning intentional, awaiting the implications reply), **A2-9** (lord-buff predicate duplicated with divergent gates — adjudicated into A4-2's fix direction, see [[effects-and-targeting]]). Parked test work: A2-6 (the combat battery), A2-13 (summoning sickness fenced by one accidental assertion), A2-14 (source-regex test brittleness), A2-15 (menace recurrence fence).

## Coverage reality

As of the 2026-06-10 morning mutation map (predates that day's test additions): **200 of 303 regional mutants survived (66%)**, and unlike the turn machine this is not noise-padded — nine of ten simultaneous behavior-deleting combat mutants left the suite green; the suite's entire behavioral combat coverage was one unblocked 2-power attack (an incidental life check in a trigger test). **Pinned that day:** the trample/lethalNeeded boundary (PR #112), duplicate-attacker rejection (PR #113), the deathtouch ruling + lifelink-overkill arms (PR #114), ghost-attacker pruning (PR #104), change_control combat removal (PR #105). The remainder of the A2-6 battery (blocked multi-block ordering, FS two-pass, menace, vigilance, sick-attacker rejection) is the parked consumption — and a prerequisite for any C1/C2 port harmonization that reads this code as spec.

## See also

[[README|Engine hub]] · [[turn-machine]] · [[effects-and-targeting]] · [[triggers-and-stack]] · [[800-combat]] · [[900-keywords]] · [[cross-engine-port]]
