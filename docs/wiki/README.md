---
type: index
tags: [magiclike, wiki]
aliases: [magiclike-wiki, "Concept wiki hub"]
created: 2026-06-02
updated: 2026-06-04
---

# Magiclike — durable concepts wiki

This folder is the **durable conceptual layer** for [[magiclike]] (a [[godot]] *Magic: The Gathering*–style roguelike): the architecture rationale, the engine's design discipline, the game's durable systems (predicates, stickers, draft, the run), and the cross-engine relationship — the *why* that changes only by deliberate redesign. It now also houses the **canonical rulebook** (the *what*), decomposed one-page-per-§ under [[rulebook|`rules/`]].

It is **docs-as-code, in wiki form** — co-located with the code (so it's versioned, reviewed, and backed up alongside it), authored in Obsidian-style `[[wikilinks]]`, and mounted into a personal Obsidian vault via a directory junction. The wiki is portable plaintext; Obsidian is just the renderer.

## What's here

**Engine architecture & design**
- [magiclike-architecture.md](magiclike-architecture.md) — the engine's durable shape + rationale (autoload + `RefCounted` state, real stack/priority, atomic effects, the design discipline).
- [action-descriptor-pattern.md](action-descriptor-pattern.md) — all state mutation through one `execute_action` entry point.
- [predicate-registry.md](predicate-registry.md) — string-keyed conditions + the "no autoload reach" purity rule.
- [composable-predicates.md](composable-predicates.md) — atomic predicates composed into trigger conditions (the proto's richer model).
- [procedural-card-text.md](procedural-card-text.md) — oracle text generated from a card's effects, never hand-authored.

**Engine resolution core**
- [atomic-effects.md](atomic-effects.md) — card behavior as a closed registry of composable primitives.
- [targeting-and-hexproof.md](targeting-and-hexproof.md) — targeting as a layer separate from effects; hexproof enforced structurally.
- [mana-model.md](mana-model.md) — lands-as-abilities, phase-boundary emptying, the mana-ability fast-path.
- [trigger-resolution.md](trigger-resolution.md) — the queue → drain → resolve orchestration (APNAP, settle loop, depth cap).

**Game systems (the meta layer)**
- [sticker-system.md](sticker-system.md) — persistent per-run-slot modifiers via one `apply_sticker` pipeline.
- [staple-synthesis.md](staple-synthesis.md) — merging two deck slots into one synthesized card.
- [roguelike-meta.md](roguelike-meta.md) — the draft + branching-run structure.

**Cross-engine**
- [cross-engine-port.md](cross-engine-port.md) — the durable Godot ↔ html-proto relationship.
- [html-proto.md](html-proto.md) — the reference implementation, in brief.

**Canon (the rulebook)**
- [rules/](rules/README.md) — the **Comprehensive Rules**, decomposed one page per § ([[rulebook|index]]). The canonical *what*; the pages above are the *why*, and the two cross-link.

## What's *not* here (one home per fact)

This layer **complements** the repo docs and never copies them — it links out:

- **Canonical rules** now live *here* too — [[rulebook|`rules/`]] (decomposed from the old `docs/RULES.md` monolith). Kept distinct from the *why* pages by `type: rules` frontmatter.
- **Wire format · engine reference (modules + contracts)** → `docs/PROTOCOL.md` · `docs/ARCHITECTURE.md`.
- **Cross-engine gaps** → `docs/DIVERGENCE.md`.
- **Live status** (current phase, card counts, roadmap) → the repo root `CLAUDE.md` + `docs/plans/`. **Status lives in the repo, never here.**

(Doc map: `docs/README.md`.)

## Conventions

Kebab-case filenames; dense `[[wikilinks]]` between concept pages; **inline-code path refs** out to repo docs *outside* the junction (e.g. `docs/DIVERGENCE.md`, `docs/PROTOCOL.md`) — *not* relative `../` links, which break when clicked in the vault (only `docs/wiki/` is mounted, so `../` escapes it); in-vault targets, including the [[rulebook|rules cluster]], use `[[wikilinks]]`; light dated frontmatter (`type` / `tags` / `created` / `updated` / `sources`); encyclopedic, concise voice; **durable-only** — nothing a commit would falsify. Git history is this folder's changelog.

## Keeping it current (sync from repo activity)

Primary mechanism: **proactive capture** — mirror a durable decision here in the same commit that makes it. This is the **periodic backstop**, run on request ("sync the wiki with recent commits") — the wiki's *ingest + lint*, sourced from git:

1. **Window.** `git log --stat` since the last commit that touched `docs/wiki/` (self-tracking: "what changed since the wiki was last reconciled"), across the branches that matter (`dev` for the html-proto, the active Godot branch). Read the substantive diffs.
2. **Triage — most commits are *not* wiki-worthy.** Keep only **durable** changes: a design/architecture *decision* + its rationale, a new durable *concept*, a shift in the cross-engine *relationship*. Skip bug fixes, card additions, status/version bumps, and refactors that introduce no new durable idea. **Proto-driven concepts count fully** — the html-proto is the primary development surface right now, so a durable design principle realized in proto belongs here even if the Godot port hasn't mirrored it yet.
3. **Reconcile.** Update or create the **one home** for each durable change (one home per fact; dense `[[wikilinks]]`; bump `updated`; inline-code refs per Conventions). Then **lint** the existing pages against current reality — does anything now contradict shipped code (e.g., a landed refactor)? Fix or flag.
4. **Report + curate.** Summarize what changed **and what was considered and skipped**. The git diff is the curation gate — Joe reviews and prunes; nothing is auto-blessed.

The bar is high and the wiki is slow-changing, so a sync often (correctly) yields little. **Empty is a valid result.**
