---
type: index
tags: [magiclike, wiki]
created: 2026-06-02
updated: 2026-06-02
---

# Magiclike — durable concepts wiki

This folder is the **durable conceptual layer** for [[magiclike]] (a [[godot]] *Magic: The Gathering*–style roguelike): the architecture rationale, the engine's design discipline, and the cross-engine relationship — the *why* that changes only by deliberate redesign.

It is **docs-as-code, in wiki form** — co-located with the code (so it's versioned, reviewed, and backed up alongside it), authored in Obsidian-style `[[wikilinks]]`, and mounted into a personal Obsidian vault via a directory junction. The wiki is portable plaintext; Obsidian is just the renderer.

## What's here

- [magiclike-architecture.md](magiclike-architecture.md) — the engine's durable shape + rationale (autoload + `RefCounted` state, real stack/priority, the design discipline).
- [action-descriptor-pattern.md](action-descriptor-pattern.md) — all state mutation through one `execute_action` entry point.
- [predicate-registry.md](predicate-registry.md) — string-keyed conditions + the "no autoload reach" purity rule.
- [cross-engine-port.md](cross-engine-port.md) — the durable Godot ↔ html-proto relationship.
- [html-proto.md](html-proto.md) — the reference implementation, in brief.

## What's *not* here (one home per fact)

This layer **complements** the repo docs and never copies them — it links out:

- **Canonical rules** (how the game works) → [`docs/RULES.md`](../RULES.md).
- **Wire format · engine reference (modules + contracts)** → [`docs/PROTOCOL.md`](../PROTOCOL.md) · [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md).
- **Cross-engine gaps** → [`docs/DIVERGENCE.md`](../DIVERGENCE.md).
- **Live status** (current phase, card counts, roadmap) → the repo root `CLAUDE.md` + [`docs/plans/`](../plans/). **Status lives in the repo, never here.**

(Doc map: [`docs/README.md`](../README.md).)

## Conventions

Kebab-case filenames; dense `[[wikilinks]]` between concept pages; relative markdown links out to the specs (`../RULES.md`); light dated frontmatter (`type` / `tags` / `created` / `updated` / `sources`); encyclopedic, concise voice; **durable-only** — nothing a commit would falsify. Git history is this folder's changelog.
