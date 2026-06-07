---
type: rules
tags: [magiclike, rules]
section: "300"
created: 2026-06-04
updated: 2026-06-04
source: docs/RULES.md §300
---

# 300. Card Types

*[[rulebook|Rulebook]] › §300*

## 301. Lands
- **Lands have no mana cost.** They are played, not cast.
- A player may **play one land per turn**, only during their own main phase, only while the stack is empty.
- Playing a land puts it directly onto the battlefield. It does not go on the stack and cannot be responded to.
- Every land has an intrinsic activated ability: `{T}: Add one mana of color C` for each color in its `mana_produced` list. This ability is auto-constructed; do not declare it on the template.
- Lands are not affected by summoning sickness in any way that matters today — they have no power/toughness and cannot attack.

## 302. Creatures
- Creatures are permanents (they stay on the battlefield after resolving).
- Each has a power and toughness.
- A creature can attack and block, subject to combat rules ([[800-combat]]) and its keywords ([[900-keywords]]).
- **Summoning sickness**: a creature cannot attack or use abilities with `{T}` in the cost the turn it enters the battlefield under your control, unless it has [[900-keywords|haste]]. It loses summoning sickness during its controller's next untap step.

## 303. Instants
- Castable at any time the caster has priority, **except** during the active player's untap, draw, combat-damage, and cleanup phases (where priority does not open).
- After resolving, an instant goes to its owner's graveyard.

## 304. Sorceries
- Castable only by the active player, only during their main phase, only while the stack is empty.
- After resolving, a sorcery goes to its owner's graveyard.

## 305. Artifacts and enchantments
- Treated as permanents. Currently unused.

## Implementation status — Card Types
- 305 is reserved; no cards of these types exist.
- 301 mana abilities are auto-constructed from `mana_produced` — do NOT populate `activated_abilities` on a land template.
- **Engine model (how a card's type line is represented and read):** see [[type-identity]] — one `types[]` array behind one accessor layer, the governing-type fork, and the live `typeGrants` modifier layer.
