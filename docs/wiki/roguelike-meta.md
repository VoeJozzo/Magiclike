---
type: concept
tags: [magiclike, gamedev, meta]
created: 2026-06-02
updated: 2026-06-02
sources: ["docs/RULES.md", "reference/html-proto/CLAUDE.md"]
---

# Roguelike meta (draft + run)

The meta-game wraps individual games in a **draft** and a **roguelike run**. (Canon: `docs/RULES.md` §1400 Draft, §1500 The Run.)

## Draft

The player drafts a deck from packs with **color-aware sampling**: in-deck colors are weighted up (rescuing against color screw), an off-color card drops from the pool after it first appears, and colorless cards are eligible in every slot. Opponents are built either by an AI draft over the same system or from hand-curated **archetypes and bosses**. Lands auto-fill after the draft to match the deck's colors. (`docs/RULES.md` §1400.)

## The run

A short **branching map** (Slay-the-Spire-style): per-node battles whose opponents scale with depth (added [[sticker-system|stickers]], spliced or cloned slots) and a boss at the exit. Winning a node offers a **reward** that mutates your deck slots — apply a sticker, transform a slot into a fresh draft pack, clone a slot, **splice** two slots ([[staple-synthesis]]), or remove one. A run-start modifier can append or mutate slots before the draft. Run state persists, with a **mid-game snapshot** that blocks reward-farming by quit-and-reload. (`docs/RULES.md` §1500.)

Realized in the [[html-proto]]; [[godot]]-deferred (see [[cross-engine-port]]). The concrete map size, reward weights, and pick counts are tuning parameters and live in `docs/RULES.md`, not here.

## See also

[[sticker-system]] · [[staple-synthesis]] · [[html-proto]] · [[magiclike]]
