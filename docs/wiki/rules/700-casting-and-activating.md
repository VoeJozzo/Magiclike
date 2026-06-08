---
type: rules
tags: [magiclike, rules]
section: "700"
created: 2026-06-04
updated: 2026-06-04
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
5. **Caster retains priority** for any follow-up actions.

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
- The currently-implemented cost components are `tap` (`{T}`) and `mana`.
- Activated abilities go on the stack the same as spells, except: **mana abilities** (abilities that produce mana and have no targets) resolve immediately without using the stack. This is the only fast-path.
- The owner must have priority to activate, except mana abilities (which can be activated any time mana could be paid, even mid-cost-payment).

## 706. Counterspell
A spell with the `counter` effect targets another spell on the stack. When it resolves:
- If the target spell is still on the stack: remove it, send the card to its owner's graveyard (countered spells **never go to the battlefield**, even creatures).
- If the target is gone: the counterspell fizzles cleanly.

Triggered abilities cannot be countered by `counter` (no Stifle equivalent in the pool).

## Implementation status — Casting and Activating
- 702.2 target choice currently happens at cast time and is locked in. There is no "choose target on resolution" pattern.
- 705 mana ability fast-path: lands' tap-for-mana skips the stack and pays immediately. Other mana abilities (e.g., creatures that tap for mana) would use the same path.
