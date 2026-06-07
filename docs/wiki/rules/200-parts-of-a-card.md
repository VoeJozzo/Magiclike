---
type: rules
tags: [magiclike, rules]
section: "200"
created: 2026-06-04
updated: 2026-06-04
source: docs/RULES.md §200
---

# 200. Parts of a Card

*[[rulebook|Rulebook]] › §200*

## 200.1 Card identity
Every card has a stable **template id** (`card_id` in Godot, `tplId` in html-proto). The id identifies the card definition; multiple instances of the same template can exist in the game and are distinguished by an **instance id**.

## 200.2 Mana cost
The cost paid to cast the card. Composed of:
- **Colored requirements**: any combination of `W` (white), `U` (blue), `B` (black), `R` (red), `G` (green).
- **Generic requirement** (`C`): can be paid with any color.

Lands have no mana cost. Some spells may have no mana cost (free spells).

## 200.2a Total mana cost
A card's **total mana cost** is the total amount of mana in its mana cost — its generic requirement plus all its colored pips, added together. (Example: `{2}{R}{R}` has a total mana cost of 4.) Lands and other costless cards have a total mana cost of 0.

**Terminology (canonical).** "Total mana cost" is Magiclike's name for this quantity. We deliberately do **not** adopt Magic's "mana value" or "converted mana cost / CMC." Card text, docs, and any effect that selects on this quantity (e.g. "the creature card with the greatest total mana cost") all use this exact phrase. The cross-engine vocabulary note is pinned in `PROTOCOL.md` §1. First card to read it: **Deepseam Quarry**.

**Counting `{X}`.** Everywhere **except the stack** — in hand, library, graveyard, battlefield, or exile — a cost's `{X}` counts as **0** for total mana cost (so an `{X}{R}` card sitting in a graveyard has a total mana cost of 1). While a spell is **on the stack**, its `{X}` counts as the value chosen for it when it was cast. This is the standard ruling; it's stated explicitly only because "total mana cost" is our own term. No card in the pool uses `{X}` yet — and Deepseam Quarry reads from graveyards, where X is 0 regardless.

## 200.3 Type line
- **Card types**: `land`, `creature`, `instant`, `sorcery`, `artifact`, `enchantment`.
- **Subtypes**: e.g., `human`, `warrior`, `plains`, `goblin`. Subtypes are flavor + matter-for-tribal; the rules engine does not treat them specially unless an effect references them.

A card may have more than one card type (e.g., artifact creature) but our current pool uses single-type cards.

## 200.4 Power and toughness
Creatures have **power** (damage dealt in combat) and **toughness** (damage they can survive in a turn). Both are non-negative integers in the templates; runtime modifiers can produce any integer.

## 200.5 Oracle text
A human-readable description of the card's effects, abilities, and triggers. The rules engine does not parse oracle text; behavior is driven by structured effect/ability/trigger data.

## 200.6 Keywords
A creature's intrinsic keywords (e.g., `flying`, `trample`). See [[900-keywords]] for the full list.

## 200.7 Effects, abilities, triggers
A card may declare:
- **On-cast effects**: resolve when the spell resolves (spells) or when the permanent enters the battlefield (permanents — currently we don't have permanents with non-trigger ETB effects).
- **Activated abilities**: a cost the controller can pay to produce an effect (e.g., `{T}: Add {R}`).
- **Triggered abilities**: see [[1000-triggered-abilities]].

## Implementation status — Parts of a Card
- Artifacts and enchantments are listed as legal card types but the current pool has none.
- Multi-type cards work mechanically (`has_type` checks each type) but are unused.
