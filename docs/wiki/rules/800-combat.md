---
type: rules
tags: [magiclike, rules]
section: "800"
created: 2026-06-04
updated: 2026-06-04
source: docs/RULES.md §800
---

# 800. Combat

*[[rulebook|Rulebook]] › §800*

## 801. Combat flow
The combat phase consists of three steps in order: Declare Attackers (505), Declare Blockers (506), Combat Damage (507).

1. **Step 505 — Declare Attackers** opens with the active player having priority. The active player declares which of their creatures are attacking by tapping each (unless [[900-keywords|vigilance]]). Declared attackers are added to `state.attackers`. The active player can undo declarations before passing priority. When the active player passes, priority goes to the defender for instant-speed response. When both players pass with the stack empty, the step ends.
2. **Step 506 — Declare Blockers** is entered with **block declaration as a turn-based action** that happens **before priority opens** (MTG 509.1a). The defending player assigns each of their untapped creatures to block exactly one of the attackers (subject to legality — see §802). After the defending player confirms blocks (`confirm_blocks` action), priority opens with the active player.
3. **Step 507 — Combat Damage** is a turn-based action with no priority window. See §803.

## 802. Blocking legality
A blocker assignment is legal if:
- The blocker is untapped.
- The blocker has not been declared as another block.
- The attacker does **not** have [[900-keywords|unblockable]].
- The attacker does not have [[900-keywords|flying]] (or, if it does, the blocker also has flying or [[900-keywords|reach]]).
- If the attacker has [[900-keywords|menace]], the defending player must assign **at least 2 blockers** to it (or it remains unblocked). A single blocker assigned to a menace creature is collapsed back to unblocked at the start of combat damage resolution.

## 803. Combat damage resolution
Combat damage is resolved in **up to two passes**:

1. **Pass 1 — First-Strike pass**: skipped entirely if no attacker or blocker in this combat has [[900-keywords|first strike]]. Otherwise, every attacker and blocker that has first strike assigns and deals damage. State-based actions sweep (creatures die). Death triggers drain. Win conditions checked.
2. **Pass 2 — Normal pass**: every attacker and blocker that did NOT have first strike (and any first-strike creatures that survived pass 1, which contribute no further damage in our current implementation — see Implementation status) assigns and deals damage. State-based actions sweep again. Death triggers drain.

Within each pass, each attacker assigns damage as follows:

- **Unblocked attacker**: assigns its full power as damage to the defending player.
- **Blocked attacker**: assigns its damage across all assigned blockers in order, applying enough damage to be lethal to each blocker before moving on to the next.
- **Trample**: if the attacker has [[900-keywords|trample]], excess damage beyond what was assigned to blockers spills to the defending player. With trample, the attacker need only assign each blocker's *remaining toughness* worth of damage (not more) before considering the blocker satisfied; if deathtouch is also present, "enough to be lethal" drops to 1 damage per blocker.

Each blocker assigns its full power to the attacker it is blocking.

When a creature is dealt damage by a source with [[900-keywords|deathtouch]], that creature is **marked as lethal** for the next state-based-action sweep regardless of damage amount. With deathtouch, the "lethal damage" threshold for damage-assignment purposes drops to 1.

When a creature deals damage and its source has [[900-keywords|lifelink]], the source's controller gains life equal to the damage dealt.

[[900-keywords|Indestructible]] creatures do not die from damage (lethal-marked or otherwise). They die only when their toughness becomes 0 or less.

## Implementation status — Combat
- **Multi-blocker damage assignment** is currently split between the two implementations and the divergence is gameplay-affecting. See `docs/DIVERGENCE.md` items C1, C2, C3 for details. Briefly: html-proto matches the canonical rule above (smart distribution, deathtouch reduces threshold to 1). Godot **dumps all attacker damage on the first assigned blocker** — three 1/1 chumps blocking a 5/5 result in 1 death (Godot) vs. 3 deaths (proto). Harmonization to Godot is on the to-do list.
- **First-strike interaction with double-strike**: double-strike is not implemented in either. A first-strike creature surviving pass 1 contributes no damage in pass 2.
- **Damage assignment by attacker**: in MTG the attacker chooses the blocker order at declare-blockers step (508.6). Currently the order is fixed at block declaration time (the order the defender declared them in) in both implementations.
