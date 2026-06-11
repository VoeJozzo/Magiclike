---
type: rules
tags: [magiclike, rules]
section: "1000"
created: 2026-06-04
updated: 2026-06-10
---

# 1000. Triggered Abilities

*[[rulebook|Rulebook]] › §1000*

## 1001. Definition
A triggered ability is an ability declared on a card's template that fires in response to an **event** in the game, optionally gated by a **condition**.

```
"event": "card_enters_battlefield",
"cond_id": "opp_lost_life_this_turn",
"effects": [ ... ],
"self_only": true,           # the trigger only fires from the source card's own events
"target_filter": "creature_or_player"   # if effects use target: "chosen"
```

## 1002. Event vocabulary
The current event vocabulary is:
- `card_enters_battlefield` — a card enters the battlefield.
- `card_dies` — a creature on the battlefield moves to the graveyard.

The engine can emit other event kinds, but no current card listens for them. Planned events for future cards include `card_attacks`, `spell_cast`, `card_drawn`, `damage_dealt`, `life_gained`.

## 1003. Self-only vs. global listeners
- `self_only: true` (the default in practice) — the trigger fires only when the **source card itself** is the event subject. Example: Pyromaniac's ETB trigger fires when Pyromaniac enters, not when any other card enters.
- `self_only: false` — the trigger fires for any matching event. Example: a hypothetical "When another creature enters, draw a card" trigger.

## 1004. Trigger timing — queue and drain
- When an event fires, the engine scans all listeners (every card on the battlefield, plus the event subject if it just left the battlefield). For each listener with a matching event, condition, and self-only check, a **trigger entry** is queued onto `state.pending_triggers`.
- Triggers are queued, **not** placed on the stack immediately.
- The next time priority is about to open, the engine **drains pending triggers**: each trigger is moved from the queue to the stack, in **APNAP order** (Active Player triggers first by queue order, then Non-Active Player triggers; on the stack, NAP triggers end up on top, so they resolve first under LIFO).
- After the drain completes, priority opens with the active player. Players can respond to the stacked triggers normally.

## 1005. Target selection on triggers
- If a trigger's effects use `target: "chosen"`, the trigger pauses at drain time and prompts the **controller of the trigger** to pick a target.
- The engine sets `state.awaiting_target_for_trigger`. Drain does not continue until the controller submits a `pick_trigger_target` action with a target matching `target_filter`.
- After the pick, the trigger continues drain and resolution.

## 1006. Trigger resolution
When a trigger's stack entry reaches the top:
1. Re-validate targets (same fizzle behavior as spells, see [[700-casting-and-activating|§704.1]]).
2. Resolve each effect in order.
3. The trigger leaves the stack. It does NOT go to a graveyard (triggers aren't cards).

## 1007. Intervening "if" re-check
*(MTG rule 603.4: "if" clauses in triggers are re-checked on resolution.)*
Currently, the engine **only checks `cond_id` at queue time**, not at resolution. If a trigger's condition becomes false between queue and resolution, the trigger still resolves. Tracked in `docs/DIVERGENCE.md` E5.

## 1008. Trigger budget (per stack episode)
The html-proto enforces a **trigger budget of 100 resolutions per stack episode** — a *width* count, not nesting depth: every trigger resolution since the stack last emptied counts toward the cap, and the counter resets only when both players pass on an empty stack. Exceeding the budget consumes the trigger with a logged warning ("Trigger budget exhausted"). This is deliberate (design ruling, audit A3-3, PR #98, 2026-06-10: keep the counter): the width count is a *stronger* loop-stopper than true nesting depth — it also bounds mutual A→B→A trigger loops, which resolve at depth 1–2 each round and would never trip a depth counter — and reaching 101 legitimate triggers in one stack episode is practically impossible today. The Godot port does not yet have this cap, but **will mirror proto's budget semantics** — an earlier "no cap needed if drain is correct" stance was reversed after real card design produced accidental infinite-loop combinations. See `docs/DIVERGENCE.md` E6 and the "Patterns to REPLICATE" note in the root `CLAUDE.md`.

## Implementation status — Triggered Abilities
- 1007 intervening-if: not implemented (known deviation).
- 1003 `self_only: false`: code path exists but no current card uses it; not exercised by tests.
- 1002: future events will require new emission sites in the engine and new card templates.
