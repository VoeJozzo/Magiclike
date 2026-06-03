---
type: concept
tags: [magiclike, gamedev, meta]
created: 2026-06-02
updated: 2026-06-02
sources: ["docs/RULES.md", "docs/plans/plan-effects-refactor.md", "docs/PROTOCOL.md"]
---

# Sticker system

Stickers are **persistent per-run-slot modifiers** — the roguelike run's main reward currency (see [[roguelike-meta]]). A sticker attaches to a **deck slot** (a template + position that persists across the run), *not* to an in-play card instance, and re-applies to every instance drawn from that slot in later games. (Canon: `docs/RULES.md` §1300.)

## One pipeline (`apply_sticker`)

All persistent per-slot changes flow through a single overlay mechanism — the `apply_sticker` effect (`docs/PROTOCOL.md` §3.2): stat boosts, cost modifiers, granted keywords, subtype rolls, empower scaling, color overrides, scarring. The effects refactor folded what used to be bespoke one-off effects (embargo, bleach, …) into this one pipeline (`docs/plans/plan-effects-refactor.md` §3.8) — **one modification channel instead of many parallel ones**.

## Rolls and persistence

Empower and subtype **rolls resolve at application time** and are stored in the sticker (then applied additively at effect resolution), so there's no cross-instance leakage from shared mutation. A sticker persists across leave-play and re-ETB within a run — unlike an end-of-turn keyword grant — and clears when the run ends.

This is realized in the [[html-proto]]; the [[godot]] port hasn't built it yet (a reserved seam exists in `CardInstance.effective_keywords()` — see [[cross-engine-port]]). The concrete sticker types, weights, and legality rules live in `docs/RULES.md` §1300–§1305.

## See also

[[roguelike-meta]] · [[staple-synthesis]] · [[html-proto]] · [[magiclike]]
