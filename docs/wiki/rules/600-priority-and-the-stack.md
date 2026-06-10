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
- After a player casts a spell (or a trigger goes on the stack), **priority passes to the other player** — the caster does NOT retain priority. This is an intentional simplification of MTG rule 117.1c: holding priority is an edge case that leads to a lot of clicking, so it was deliberately dropped (design ruling, PR #98, 2026-06-10). The opponent gets the first response window; the caster regains priority once the opponent passes, so "I act → opponent declines → I act again" is the normal cycle. (The Godot port currently retains priority per 117.1c — see `docs/DIVERGENCE.md` D0; harmonization is the port's decision.)
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

Sanctioned auto-pass skips (both engines, unless noted):
- A priority holder with no productive action (no castable spell, activatable ability, or playable land) is auto-passed (proto `hasNoAction`; Godot `_has_no_meaningful_action`).
- **The active player's empty-stack END window is skipped outright** (proto `skipApEndStep`; Godot per `plan-priority-window-refactor`). This suppresses the AP's instant-speed options at their own end step, not just sorcery-speed ones — the trade being that anything castable there was equally available in MAIN2, and the AP regains a window on any non-empty stack. The non-active player's END window is preserved. See `docs/DIVERGENCE.md` B6.
- **The whole combat phase is skipped when zero attackers are declared** (proto empty-combat fast path in the step loop): no COMBAT priority window opens for either player on an attacker-less turn. Intentional simplification — there is no known reason to cast an instant between the main phases when no combat occurs (design ruling, PR #98, 2026-06-10; audit A1-7). The very next window (MAIN2) opens immediately with identical state, and triggers queued during the skip drain there. Tripwire: revisit if a "during combat" / beginning-of-combat card ever lands. (The Godot port currently opens a COMBAT_ATTACK priority window — the engines diverge here.)

## Implementation status — Priority
- The "stop on cast / stop on draw / stop on attack" MTGO-style explicit-priority-hold UI is not implemented (see `docs/BACKLOG.md`).
- A "hold priority for follow-up instant" UI is not implemented.
