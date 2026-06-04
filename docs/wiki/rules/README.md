---
type: index
tags: [magiclike, rules]
aliases: [rulebook, "Rules index"]
created: 2026-06-04
updated: 2026-06-04
---

# Magiclike — Comprehensive Rules

The **canon**: how the game works, in plain English, independent of any implementation. When the doc and the code disagree, **the doc wins** — the code is the patient.

This is the rulebook as an interlinked cluster — one page per top-level `§`, co-located with the code in `docs/wiki/rules/` and mounted into the Obsidian vault. It is the **what**; the durable design *why* lives one level up in the concept wiki ([[magiclike-wiki|hub]]). Rules are numbered hierarchically (`100.1`, `100.1a`), borrowing MTG's Comprehensive Rules scheme with our own ranges, so other docs and code comments can cite stable `§` handles.

## Core rules
- [[100-game-concepts]] — players, life, deck, opening hand, win/loss, information.
- [[200-parts-of-a-card]] — identity, mana cost, type line, P/T, oracle text, abilities.
- [[300-card-types]] — lands, creatures, instants, sorceries, artifacts/enchantments.
- [[400-zones]] — library, hand, battlefield, graveyard, stack, exile, zone changes.
- [[500-turn-structure]] — the ten phases, turn-based actions, untap/draw/cleanup.
- [[600-priority-and-the-stack]] — the stack, priority windows, mana-pool emptying.
- [[700-casting-and-activating]] — playing lands, casting, targeting, resolution, abilities, counterspell.
- [[800-combat]] — combat flow, blocking legality, two-pass damage resolution.
- [[900-keywords]] — every evergreen keyword + granted keywords.
- [[1000-triggered-abilities]] — events, conditions, queue-and-drain, APNAP, depth cap.
- [[1100-state-based-actions]] — SBA contents, the sweep, when they run.
- [[1200-ending-the-game]] — loss detection, post-game, restart.

## Meta-game rules
*Systems that operate **between** games, persisting across a run (proto-realized; Godot Phases 7–9).*
- [[1300-stickers]] — per-slot persistent modifiers (the reward currency).
- [[1400-draft]] — pack structure, rolling, picks, opponent decks, lands.
- [[1500-the-run]] — the roguelike meta: map, scaling, rewards, persistence.

## Appendices
- [[appendices]] — glossary, the authoritative-behaviors checklist, and known deviations.

---
*Each section ends with an **Implementation status** note flagging where the Godot port and html-proto currently deviate. Canon is engine-independent; status is not — the live cross-engine tracker is `docs/DIVERGENCE.md`.*
