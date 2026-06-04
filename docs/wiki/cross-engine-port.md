---
type: concept
tags: [magiclike, architecture, gamedev, prototype]
created: 2026-06-02
updated: 2026-06-02
sources: ["docs/DIVERGENCE.md", "docs/PROTOCOL.md", "docs/wiki/rules/", "magiclike repo: CLAUDE.md", "reference/html-proto/CLAUDE.md"]
---

# Cross-engine port (Godot ↔ html-proto)

[[magiclike]] exists as two engines: the [[html-proto]] (the original vanilla-JS rules engine) and the [[godot]] port that reimplements it natively. This page is the durable *relationship* between them — the philosophy, not the gap list.

## Structurally parallel, not 1:1

The port mirrors the prototype's **behavior**, not its **implementation shape**. The JS rendering layer doesn't translate, and several JS-specific patterns are deliberately *not* replicated — see [[magiclike-architecture]] (the design discipline) and [[predicate-registry]] (the canonical example: closures-over-globals → explicit state-passing). The shapes are reimagined for Godot — typed `RefCounted` state classes instead of closures, structured signals instead of direct UI calls — while the rules behavior stays faithful.

## The prototype is the source of truth for card definitions

Cards are authored once, in the prototype, as per-card JSON; the Godot side **consumes** those definitions (via its `JsonCardLoader`) rather than re-authoring them. The two engines agree on a single **wire contract** — a `card.json` schema plus shared effect-kind / event-kind / predicate-id / target catalogs — specified canonically in `PROTOCOL.md`. That spec is the home for the catalogs; this page only records *that* the contract exists and why: two independent engines must agree on one vocabulary.

## Divergences are parked with gates

Where the two engines behave differently, the gap is **tracked, not hidden**: each is catalogued in `DIVERGENCE.md` with a severity tag and a to-do, and the [[rulebook]] is the tie-breaker on what *correct* means. Many gaps are deliberately deferred behind a **gate** — "implement on both sides when the first card that needs it lands" — rather than built speculatively. The specific open gaps and their status live in `DIVERGENCE.md`; this page never enumerates them.

## See also

[[html-proto]] · [[magiclike-architecture]] · [[magiclike]] · [[godot]]
