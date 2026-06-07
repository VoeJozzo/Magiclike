---
type: rules
tags: [magiclike, rules]
section: "600"
created: 2026-06-04
updated: 2026-06-04
---

# 600. Priority and the Stack

*[[rulebook|Rulebook]] › §600*

## 601. The stack
A LIFO list of spells and triggered abilities waiting to resolve. Resolves top-down.

## 602. When priority opens
At each phase that opens a priority window (see the [[500-turn-structure]] table), priority opens **with the active player**. After both players pass priority in succession with the stack empty, the phase ends.

## 603. Priority-passing rules
- A player with priority may take a legal action (cast a spell, activate an ability, declare an attacker/blocker if the phase allows) or pass priority.
- After a player takes an action, **that player retains priority** (MTG rule 117.1c). The cycle of "I act → I retain priority → I act again → I pass" is normal.
- After priority is passed, it goes to the other player.
- When **both players pass in succession**:
  - If the stack is non-empty, the **top object of the stack resolves**. Then priority opens again with the active player.
  - If the stack is empty, the phase ends.

## 604. Mana pool emptying
Mana pools empty **at the end of every phase and step**. Players cannot float mana across phase boundaries. (MTG rule 106.4.)

## 605. Priority is closed during
- Untap step (501).
- Draw step (503).
- Combat damage step (507).
- Cleanup step (510).
- The block-declaration turn-based action inside step 506 (until blocks are confirmed).
- The discard turn-based action inside step 510 (until satisfied).

During these windows, **no spells or abilities can be cast or activated**. (Triggered abilities can still trigger and queue, but they don't drain until priority next opens.)

## 606. Implementation: auto-pass
For the AI driver and for unattended priority windows, the engine auto-issues `pass_priority` actions. This is agent UX, not a rules cheat — the priority pass IS happening, the AI is just calling it automatically. The human player passes priority via UI (currently Space/Enter keybind on the Godot side).

## Implementation status — Priority
- The "stop on cast / stop on draw / stop on attack" MTGO-style explicit-priority-hold UI is not implemented (see `docs/BACKLOG.md`).
- A "hold priority for follow-up instant" UI is not implemented.
