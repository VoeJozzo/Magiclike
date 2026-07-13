---
type: rules
tags: [magiclike, rules]
section: "900"
created: 2026-06-04
updated: 2026-06-10
---

# 900. Keywords

*[[rulebook|Rulebook]] › §900*

This section defines each keyword's effect. A creature can have multiple keywords; their effects are independent unless noted.

## 901. Static combat keywords

### 901.1 Haste
A creature with haste **ignores summoning sickness**. It can attack and use `{T}` abilities the turn it enters the battlefield under your control.

### 901.2 Vigilance
A creature with vigilance **does not tap when it attacks**. It remains untapped after combat and can be tapped for other purposes.

### 901.3 Unblockable
A creature with unblockable **cannot be blocked**. Block declarations targeting it are illegal.

### 901.4 Flying
A creature with flying **can only be blocked by creatures with flying or reach**. It can block any creature (flying or not).

### 901.5 Reach
A creature with reach **can block creatures with flying**. It is otherwise an ordinary blocker.

### 901.6 Menace
A creature with menace **cannot be blocked except by two or more creatures**. A single-blocker assignment against a menace attacker is **illegal** — the engine rejects it at block confirmation, so a defender cannot finalize a lone block on a menace attacker. (**Godot only:** a damage-time fallback that treats a lone-blocked menace attacker as unblocked is retained as a safety net for imported or otherwise stale states. The html-proto has no such fallback — a stale lone block there resolves as a normal block, matching real MTG. See `docs/DIVERGENCE.md` C3; audit A2-11.)

### 901.7 Defender
A creature with defender **cannot attack**. It can block normally.

## 902. Damage-step keywords

### 902.1 First Strike
A creature with first strike **deals its combat damage in a separate, earlier pass** (pass 1). It does not take damage from non-first-strike attackers or blockers until pass 2. Lethal damage from pass 1 kills creatures before pass 2; first-strike creatures often emerge unscathed if they kill their target in pass 1.

### 902.2 Trample
When a creature with trample attacks and is blocked, damage in excess of the blocker's remaining toughness **spills over to the defending player**. The attacker need only assign enough damage to be lethal to the blocker before assigning the rest.

### 902.3 Deathtouch
Any nonzero amount of damage dealt by a source with deathtouch to a creature is considered **lethal**. The creature is destroyed in the next state-based-action sweep. For combat damage assignment, **1 point of deathtouch damage is a lethal dose against every blocker — indestructible included**: the indestructible creature is lethal-marked but survives ([[#903.1 Indestructible|903.1]]). (Design ruling, PR #98, 2026-06-10 — audit A2-7; the engine previously carved indestructible blockers out and required their full remaining toughness.)

### 902.4 Lifelink
When a source with lifelink deals damage, **its controller gains that much life**. Lifelink fires on combat damage and on damage from spells/abilities equally. In combat, a lifelink creature that deals damage in a strike step **gains its full power, even when part of that damage is overkill** that lands nowhere (all blockers satisfied, no trample). (Design ruling, PR #98, 2026-06-10.)

## 903. Permanent-status keywords

### 903.1 Indestructible
A creature with indestructible **is not destroyed by lethal damage**. The lethal-damage and lethal-marked checks in SBAs ([[1100-state-based-actions]]) ignore it. This includes deathtouch's lethal mark ([[#902.3 Deathtouch|902.3]]): a deathtouched indestructible creature is marked but survives — and if it loses indestructible later that turn, the still-lethal mark kills it at the next SBA sweep (design ruling, PR #98, 2026-06-10). It can still be removed by:
- 0 or less toughness (e.g., if `current_toughness()` drops to 0 from a debuff).
- An effect that explicitly says "destroy" with the rider "regardless of indestructible" *(no such effect exists today)*.
- An effect that exiles the creature *(no such effect exists today)*.
- Sacrifice *(no sacrifice effects today)*.

## 904. Hexproof
A creature with hexproof **cannot be targeted by spells or abilities the opponent controls**. The controller can still target their own hexproof creature.

This is a targeting restriction enforced at cast/activation time. Hexproof does **not** prevent damage from already-resolved effects or combat.

## 905. Granted keywords
Keywords can be **granted at runtime** to a creature that doesn't have them on its template (e.g., a pump spell granting flying until end of turn, or a sticker granting unblockable). Granted keywords behave identically to printed keywords. Granted keywords with an EOT duration clear during cleanup ([[500-turn-structure|§514]]).

## Implementation status — Keywords
- All keywords in 901–904 are implemented in both Godot and html-proto.
- Double strike, banding, regeneration, shroud, ward, protection: not implemented.
- 905 granted keywords: implemented. Stickers (see [[1300-stickers]]) are the primary user.
