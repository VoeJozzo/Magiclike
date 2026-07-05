---
type: concept
tags: [magiclike, engine, synthesis, staple]
created: 2026-06-11
updated: 2026-06-11
---

# Synthesis / staple (engine internals)

*Page anatomy + durability rules: [[README|engine hub]]. Canon: [[1500-the-run|§1500]]. Concept companion (the design *why*): [[staple-synthesis]] — this page carries the verified engine mechanics, not the design rationale.*

## What it does

Stapling (splicing) merges two run-deck slots into one synthesized card that persists for the rest of the run. The engine reaches it through **two pathways sharing one merge core**: the between-games reward screen (`RUN.applySplice`, the [[1500-the-run|§1500]] "Splice" reward — the candidate pair is pre-rolled at offer time) and the mid-game **Stapler** boon (`apply_in_game_splice`, an activated ability legal at instant speed, human-only — the AI never activates it). The subsystem also owns the Stapler's charge economy: charges live on the boon's run slot, decrement per activation, and at zero the Stapler **rips** itself out of the run deck.

## The flow

- **Canonicalization.** `canonicalSplicePair` orders the pair by type priority: the **higher-priority type becomes the base** (whose identity dominates) and the lower-priority the staple (Creature > Artifact > Land > Spell; ties preserve input order). So a land beats a spell for base — lands are valid, deliberately tiebreak-prioritized bases. Canonicalization is **type-based and zone-blind**: it never asks whether a card is a stack item or a battlefield permanent, ordering purely by type. Double-canonicalization is idempotent (verified).
- **The merge core.** `mergeSpliceData` merges slot-level data (stapledTpls, stickers, empower rolls, …) and `synthesizeStapledTemplate` builds the merged template, dispatching in `mergeStapleInto` by *staple* kind: creature staple → body merge (stats/keywords/abilities, subtype union); land staple → the base gains the land's mana ability, **merging** into an existing mana ability when the base already has one and appending fresh otherwise; spell staple → ETB trigger on a permanent base, effect concatenation on a spell base. Its impossible-pair throws are correct tripwires (verified). Empower-roll relocation (`remapEmpowerRollForStaple`) converts effects-rolls to trigger-rolls, gated to match `mergeStapleInto`'s own permanent dispatch so the roll survives land-base splices.
- **Two pathways, one core.** Both `RUN.applySplice` and `apply_in_game_splice` read their slot-level fields from the run slots, feeding the shared merge core a consistent shape. (Per-permanent end-of-turn buffs are carried as stickers rather than a separate permaBuffs structure, so there is no second producer/consumer to keep in sync.) `writeMergedSpliceToSlot` persists the merged data with a conditional write that skips empty merges.
- **Charge accounting + the rip lifecycle.** The charge gate is `typeof slot.charges === 'number'`; a cloned Stapler copies the charges field so it participates in the same decrement-and-rip economy. On the last charge, the handler calls `RUN.removeSlotByIdx` on the Stapler's own slot. `removeSlotByIdx` has an explicit **caller contract: removal must be followed by a slotIdx fixup** — decrement the cached slotIdx of every in-game card whose slot sat above the removed index (the zone-walk that `ripSlotForPhylactery` and two other sites *in this same handler* perform); the rip path runs this fixup too. The rip purges zones by tplId on both sides.
- **Combat-state transfer.** When the in-game splice absorbs a creature that holds a combat role, `apply_in_game_splice` transfers that role onto the base through the engine's one leaves-combat concept, the `removeFromCombat` funnel ([[combat]]) — the same funnel the change_control path uses. Routing through it keeps the transfer side-aware (attacker roles respect the controller check) and tombstones blocker entries rather than deleting them.

## Design rulings

Established design (per the concept page and the code's own structure): **type-priority base selection** and **lands as valid bases** are intentional. A cloned Stapler carries its charges field so it participates in the same charge economy as the original.

## Verified clean

The audit checked and explicitly cleared: reward-path `applySplice` index-order safety; the four-field reward/in-game parity that *is* tested (stapledTpls/stickers/empowerRolls/…) genuinely holds; double-canonicalization idempotence; stolen stapled-creature persistence; opponent staple-chain propagation; save-migration staple renames; a single `stapleChainOf` definition (no near-twin); pendingOptionalCost modal completeness across all seven checklist sites; the v1.0.64 stapled-mana-ability scan covering both sides; the `midGameSlotsSnapshot` anti-farming revert; charge-display refresh; and `mergeStapleInto`'s impossible-pair throws.

## See also

[[README|Engine hub]] · [[staple-synthesis]] · [[combat]] · [[effects-and-targeting]] · [[sticker-system]] · [[1500-the-run]] · [[roguelike-meta]] · [[html-proto]]
