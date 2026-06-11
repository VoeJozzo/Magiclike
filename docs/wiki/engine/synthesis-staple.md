---
type: concept
tags: [magiclike, engine, audit, synthesis, staple]
created: 2026-06-11
updated: 2026-06-11
sources: ["docs/audit/chunk-05-synthesis.md", "PR #98 verdict rounds (2026-06-10)"]
---

# Synthesis / staple (engine internals)

*Audit chunk 5. Page anatomy + durability rules: [[README|engine hub]]. Canon: [[1500-the-run|§1500]]. Concept companion (the design *why*): [[staple-synthesis]] — this page carries the verified engine mechanics, not the design rationale.*

## What it does

Stapling (splicing) merges two run-deck slots into one synthesized card that persists for the rest of the run. The engine reaches it through **two pathways sharing one merge core**: the between-games reward screen (`RUN.applySplice`, the [[1500-the-run|§1500]] "Splice" reward — the candidate pair is pre-rolled at offer time) and the mid-game **Stapler** boon (`apply_in_game_splice`, an activated ability legal at instant speed, human-only — the AI never activates it). The subsystem also owns the Stapler's charge economy: charges live on the boon's run slot, decrement per activation, and at zero the Stapler **rips** itself out of the run deck.

## The flow

- **Canonicalization.** `canonicalSplicePair` orders the pair by type priority: the **higher-priority type becomes the base** (whose identity dominates) and the lower-priority the staple (Creature > Artifact > Land > Spell; ties preserve input order). So a land beats a spell for base — lands are valid, deliberately tiebreak-prioritized bases. Canonicalization is **type-based and zone-blind**: it never asks whether a card is a stack item or a battlefield permanent, which is the hazard behind the mixed-zone mis-filing (A5-2). Double-canonicalization is idempotent (verified).
- **The merge core.** `mergeSpliceData` merges slot-level data (stapledTpls, stickers, empower rolls, …) and `synthesizeStapledTemplate` builds the merged template, dispatching in `mergeStapleInto` by *staple* kind: creature staple → body merge (stats/keywords/abilities, subtype union); land staple → the base gains the land's mana ability, **merging** into an existing mana ability when the base already has one and appending fresh otherwise; spell staple → ETB trigger on a permanent base, effect concatenation on a spell base. Its impossible-pair throws are correct tripwires (verified). Empower-roll relocation (`remapEmpowerRollForStaple`) converts effects-rolls to trigger-rolls — currently gated narrower than `mergeStapleInto`'s own permanent dispatch (A5-8).
- **Two pathways, one core, known field divergences.** `RUN.applySplice` reads everything from the run slots; `apply_in_game_splice` reads some slot-only fields (bonusTrigger, permaBuffs) off the runtime card instances instead, where they are always undefined (A5-7) — and the merge core's permaBuffs handling expects an array shape that no producer creates (the real producer, `flushPermanentEotToPermaBuffs`, writes an object — A5-6). `writeMergedSpliceToSlot` persists the merged data with a conditional write (skips empty merges) — an accident that masks some of the divergence on slot-reuse paths.
- **Charge accounting + the rip lifecycle.** The charge gate is `typeof slot.charges === 'number'` — slots without the field silently skip both the decrement and the rip (the clone-reward hole, A5-5). On the last charge, the handler calls `RUN.removeSlotByIdx` on the Stapler's own slot. `removeSlotByIdx` has an explicit **caller contract: removal must be followed by a slotIdx fixup** — decrement the cached slotIdx of every in-game card whose slot sat above the removed index (the zone-walk that `ripSlotForPhylactery` and two other sites *in this same handler* perform). The rip path skips it (A5-4). The rip also purges zones by tplId on both sides with no leave-play discipline (parked, A5-15).
- **Combat-state transfer.** When the in-game splice absorbs a creature that holds a combat role, `apply_in_game_splice` performs a **bespoke** role transfer onto the base instead of routing through the engine's one leaves-combat concept, the `removeFromCombat` funnel ([[combat]]). The bespoke copy is side-blind (attacker roles inherited without a controller check — A5-1) and deletes blocker entries instead of tombstoning them (A5-3) — the same drift class the change_control fix already closed via the funnel.

## Design rulings

No PR #98 mechanics rulings have landed for this subsystem yet. What is established design (per the concept page and the code's own structure, not a verdict round): **type-priority base selection** and **lands as valid bases** are intentional. Two design questions are open and tracked as findings, not settled here: what the player Clone reward *is* (canon §1504 vs the code's uniform-random pick — A5-11) and whether a cloned Stapler gets remaining or fresh charges (A5-5's design half, which rides A5-11). When ruled, record them here with the verdict citation.

## Verified clean

The audit checked and explicitly cleared: reward-path `applySplice` index-order safety; the four-field reward/in-game parity that *is* tested (stapledTpls/stickers/empowerRolls/…) genuinely holds; double-canonicalization idempotence; stolen stapled-creature persistence; opponent staple-chain propagation; save-migration staple renames; a single `stapleChainOf` definition (no near-twin); pendingOptionalCost modal completeness across all seven checklist sites; the v1.0.64 stapled-mana-ability scan covering both sides; the `midGameSlotsSnapshot` anti-farming revert; charge-display refresh; and `mergeStapleInto`'s impossible-pair throws.

## Open soft spots

Live status: `docs/audit/INDEX.md` (audit ledger). Known-open at distillation time — staged behavioral: **A5-1** (side-blind combat-role inheritance, P1 — live, instant-speed), **A5-2** (stack-spell + battlefield-perm pair mis-filed into the spell+spell branch; deletes an unrelated persisted run slot in the general case), **A5-3** (blocker merge deletes instead of tombstoning), **A5-4** (charge-rip skips the slotIdx fixup contract), **A5-5** (cloned Stapler has no charges field — infinite splicer), **A5-6** (permaBuffs phantom-array shape, five gating sites), **A5-7** (in-game path reads slot-only fields off instances; parity-test blind spot), **A5-8** (empower remap inert on land-base splices). Ruling needed: **A5-11** (Clone-reward identity; canon §1504 vs code). Ship-class doc/text: **A5-9**, **A5-10**, **A5-12** (the concept page's inverted base/staple sentence + stale parked claim), **A5-13** (Stapler oracle text under-promises its permanent_or_spell targeting). Parked latent: **A5-14** (land+land subtype union), **A5-15** (rip's zone purge bypasses leave-play).

## Coverage reality

As of the chunk-5 distillation (2026-06-11): the A4-18 mutation-map decomposition assigned **97 surviving mutants to `apply_in_game_splice` — none tested**. They land exactly on this page's flow: the combat-state transfer (A5-1/A5-3), charge accounting + the rip (A5-4/A5-5/A5-15), the spell+spell branch (A5-2), the cross-owner battlefield moves, and the slotIdx zone-walks. The splice test files have **zero getSource coupling** (clean by the campaign's brittleness criterion), and `test_optional_paid_etb` is the strongest file in the cluster — but `test_splice_core` is worse than dark in two places: its pathway-parity check omits exactly the two fields where the pathways diverge (A5-7), and its permaBuffs unit check pins the phantom array shape (A5-6) — the suite doesn't just miss those bugs, it certifies them. Every staged fix above is required to bring its own regression test; until they land, this region's behavioral fence is effectively nil.

## See also

[[README|Engine hub]] · [[staple-synthesis]] · [[combat]] · [[effects-and-targeting]] · [[sticker-system]] · [[1500-the-run]] · [[roguelike-meta]] · [[html-proto]]
