---
type: concept
tags: [magiclike, gamedev, meta]
created: 2026-06-02
updated: 2026-07-23
sources: ["docs/wiki/rules/", "docs/plans/plan-effects-refactor.md", "docs/PROTOCOL.md"]
---

# Sticker system

Stickers are **persistent per-run-slot modifiers** — the roguelike run's main reward currency (see [[roguelike-meta]]). A sticker is recorded on a **deck slot** (a template + position that persists across the run) and re-applied to every live card built from that slot in later games. Stickers are *also* applied directly to **live in-play cards** mid-game (the `apply_sticker` effect; the Archdemon-of-Bargains reward), mirroring back to the owning player's slot when one exists — so the slot is the durable *record* and the live card is where the effect actually *lands*. (The opponent has no persistent slots; its in-game stickers are runtime-only — see [[cross-engine-port]]'s note on transient opp decks.) (Canon: [[1300-stickers]].)

## One pipeline (`apply_sticker`) — the goal, and the current reality

The design *aim* is that every persistent per-slot change flows through a single overlay mechanism — the `apply_sticker` effect (`docs/PROTOCOL.md` §3.2): stat boosts, cost modifiers, granted keywords, subtype rolls, empower scaling, color overrides, scarring. The effects refactor folded what used to be bespoke one-off effects (embargo, bleach, …) into this channel (`docs/plans/plan-effects-refactor.md` §3.8). "One pipeline" is the target to keep pushing toward — but be precise about where the code actually is today:

- **Application *is* single-sourced.** Every sticker's *effect on a card* runs through one switch, `applyStickerKindEffect` (`js/stickers.js`) — the one place that knows what each `kind` does. Both the batch path (`applyStickersToCard`, at card build) and the incremental path (`applyOneStickerToRuntimeCard`, mid-game) funnel through it.
- **Eligibility is *not yet* unified.** *Which* stickers may be offered/applied in a given context still lives in two parallel filters: `stickersForSlot` (deck construction + reward offers; operates on a synthetic slot-view) and `bargainStickerCandidates` (the in-game Archdemon; operates on live battlefield cards). They share the registry's per-sticker `appliesTo` + weight gate but legitimately diverge on data shape (slot-view vs live card). Because they're separate, **cross-cutting rules must be kept in agreement by hand** — e.g. the deck-color gate on land-color stickers: the in-game path silently *skipped* it (live cards carry no `deckColors` field) until **v2.1.51** routed the side's colors through the new `deckColorsForSide` helper. That skip was a **bug, not an intentional exemption** — both paths are meant to enforce the same rules. Player rewards then add one explicit provenance rule: generated `kw_*` trophy stickers carry `claimKeyword`, while Innate does not, so combat claims gate trophy offers without conflating every `kind:'keyword'` application with a trophy. (The natural next step toward "one pipeline" is a shared `isRandomlyOfferable` gate, then a single eligibility entry over a slot-or-card adapter; deferred until a third sticker context appears.)

## Rolls and persistence

Empower and subtype **rolls resolve at application time** and are stored in the sticker (then applied additively at effect resolution), so there's no cross-instance leakage from shared mutation. A sticker persists across leave-play and re-ETB within a run — unlike an end-of-turn keyword grant — and clears when the run ends.

`twoStickers` has an **exact-two** contract, not a best-effort loop. A single sequential planner probes cloned slot state without consuming randomness, removes choices whose concrete roll cannot materialize or would strand the remaining application, and is reused for the atomic pick-time commit. Sticker rarity remains weighted; empower outcomes remain uniform; subtype outcomes remain weighted by deck token frequency. `threeStickersBlind` deliberately remains on its separate best-effort mystery-reward path — exact-three was not part of this ruling.

Two rulings on how stickers interact with the subtype-implied keyword rule (Joe, 2026-07-20), both settled — don't re-open them as bugs:

1. **A rolled subtype carries its implied keywords, downside included.** Rolling Dragon grants flying; rolling Wall grants *defender*, which can brick the creature. Working as designed — a subtype roll is a real identity change, not a menu of upsides.
2. **A `remove_keyword` sticker outranks the subtype rule.** The sticker is the later, more specific statement about the card, so it is subtracted *last* in every keyword derivation — both the build path and the leave-play/EOT re-derive. Otherwise "Loses Defender" on a Wall buys nothing, since the subtype rule hands defender straight back.

This is realized in the [[html-proto]]; the [[godot]] port hasn't built it yet (a reserved seam exists in `CardInstance.effective_keywords()` — see [[cross-engine-port]]). The concrete sticker types, weights, and legality rules live in [[1300-stickers]] (§1301–§1305).

## See also

[[roguelike-meta]] · [[staple-synthesis]] · [[html-proto]] · [[magiclike]]
