---
type: rules
tags: [magiclike, rules]
section: "700"
created: 2026-06-04
updated: 2026-06-11
---

# 700. Casting and Activating

*[[rulebook|Rulebook]] › §700*

## 701. Playing a land
- Active player only, main phase only, stack empty only.
- Maximum **one per turn**.
- Goes directly to the battlefield. Does not use the stack.

## 702. Casting a spell
The caster must have priority. The sequence is:

1. **Announce the spell**: choose the card to cast.
2. **Choose targets**, if the spell requires them. All chosen targets must be **legal** at the time of casting (see §703). If no legal targets exist, the spell cannot be cast.
3. **Pay the cost**: tap lands and use mana abilities to produce the required mana. Mana abilities (lands tapping for mana) do not use the stack — they pay immediately.
4. **Push onto stack**: the spell enters the stack as a stack entry. The card is moved out of the hand into a stack-zone buffer.
5. **Priority passes to the opponent** — the caster does not retain priority (intentional simplification of MTG 117.1c; design ruling, PR #98, 2026-06-10). The opponent gets the first response window; the caster regains priority after the opponent passes. (See [[600-priority-and-the-stack|§603]]; the Godot port currently retains priority — `docs/DIVERGENCE.md` D0.)

## 703. Target legality
- A target is **legal** if it matches the spell's `target_filter`:
  - `any` — any creature or player.
  - `creature` — any creature.
  - `player` — either player.
  - `opp_creature` — only the opponent's creatures.
  - `your_creature` — only your creatures.
  - `spell` — any spell on the stack (used by counterspell).
- **Hexproof** (see [[900-keywords|§904 hexproof]]) blocks targeting by the opponent's spells and abilities. A player with hexproof's creature cannot be the target of opponent spells; the same player CAN target their own hexproof creatures.

## 704. Spell resolution
When a spell's stack entry reaches the top and both players have passed priority:
1. **Re-check legality of targets.** If all targets are illegal (left play, became hexproof, etc.), the spell **fizzles** — it goes to graveyard without effect.
2. Resolve each of the spell's `on_cast_effects` in order. Effects with `target: "chosen"` reference the locked-in target chosen at cast time.
3. Move the card from the stack-zone buffer to its owner's graveyard (instants/sorceries) or battlefield (creatures and other permanents).

## 705. Activated abilities
- An activated ability has a cost and an effect.
- Cost components: `tap` (`{T}`), `mana`, `sacrifice`, and `remove_counters`.
- **Non-mana activated abilities go on the stack** as their own `kind:'ability'` entries (see [[1000-triggered-abilities|§1004.7]]): activation pays costs and locks targets, the opponent of the activator gets the response window ([[600-priority-and-the-stack|§603]]), and resolution re-validates targets with the same fizzle semantics as spells and triggers (§704.1) — costs stay paid on a fizzle.
- **Mana abilities** (abilities whose effect produces mana) never use the stack — they resolve immediately. This fast path is hardcoded; it does not consult the `stackable` field.
- **`stackable`** (optional boolean on every ability and trigger; **absent → `true`**): a `stackable: false` ability resolves inline at activation with no response window. The field is infrastructure only right now — **every shipped ability and trigger is stackable**; the per-ability classification is a pending design pass (`docs/plans/plan-stackable.md`, audit A3-2).
- The owner must have priority to activate, except mana abilities (which can be activated any time mana could be paid, even mid-cost-payment).

## 706. Counterspell
A spell with the `counter` effect targets another spell on the stack. When it resolves:
- If the target spell is still on the stack: remove it, send the card to its owner's graveyard (countered spells **never go to the battlefield**, even creatures).
- If the target is gone: the counterspell fizzles cleanly.

Triggered abilities and activated-ability stack entries cannot be countered by `counter` — they aren't spells (no Stifle equivalent in the pool): the counter handler refuses both entry kinds, and "target spell" targeting never enumerates them ([[1000-triggered-abilities|§1004.6]]).

## Implementation status — Casting and Activating
- 702.2 target choice currently happens at cast time and is locked in. There is no "choose target on resolution" pattern.
- 705 mana ability fast-path: lands' tap-for-mana skips the stack and pays immediately; creature dorks use the same path.
- 705 ability stack entries + `stackable`: html-proto implemented v2.1.42 (audit A3-2). The `stackable: false` arms are built but dormant — no card carries the field; classification is Joe's pending design pass. Godot pending (no non-mana activated abilities yet).
