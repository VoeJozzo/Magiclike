---
type: concept
tags: [magiclike, architecture, gamedev]
created: 2026-06-02
updated: 2026-06-02
sources: ["magiclike repo: CLAUDE.md (Architecture decisions)", "docs/ARCHITECTURE.md"]
---

# Action-descriptor pattern

In [[magiclike]], **every state mutation flows through a single entry point**: `RulesEngine.execute_action(action: Dictionary)`, where the action is a plain descriptor —

```
{ kind: "cast_spell" | "play_land" | "pass_priority" | "activate_ability" | ..., source, targets, ... }
```

Factory helpers in `engine/action.gd` build the descriptors (`make_cast_spell`, `make_play_land`, `make_pass_priority`, `make_confirm_blocks`, …). The pattern mirrors the prototype's `executeAction`.

## Why a single descriptor-keyed entry point

- **Testable** — a test drives the engine by constructing a dictionary and calling one function; no UI, no event plumbing.
- **Uniform** — legality (`get_legal_actions`), dispatch, and AI move-enumeration all speak the same vocabulary, so the AI plays exactly the moves a human can.
- **UI-agnostic** — the engine never knows whether a click, a keybind, or the AI driver produced the action; this is what lets the engine stay UI-free (see [[magiclike-architecture]]).

The exact descriptor shapes, the effect-handler `ctx`, and the awaiting-state fields are the engine's runtime contract — see [`ARCHITECTURE.md`](../ARCHITECTURE.md) (which defers to [`PROTOCOL.md`](../PROTOCOL.md) for the cross-engine wire vocabulary).

## See also

[[magiclike-architecture]] · [[predicate-registry]] · [[cross-engine-port]] · [[magiclike]]
