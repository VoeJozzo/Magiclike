---
type: concept
tags: [magiclike, prototype, gamedev]
created: 2026-06-02
updated: 2026-06-02
sources: ["reference/html-proto/CLAUDE.md"]
---

# html-proto

The **html-proto** is [[magiclike]]'s original implementation: a vanilla-JavaScript rules engine — no build step, no frameworks, no network calls — that runs by opening an HTML file in a browser. It is a multi-module `js/` codebase implementing the full game: priority and the stack, triggered abilities, combat, a *procedural* card-text generator, stickers, draft, and the roguelike meta.

It remains the **reference implementation and the source of truth for card definitions** (see [[cross-engine-port]] for its relationship to the [[godot]] port). It is served live via GitHub Pages for play-testing.

Its own onboarding doc — the current version, the module-by-module map, and the changelog — lives in the repo at [`reference/html-proto/CLAUDE.md`](../../reference/html-proto/CLAUDE.md), the authoritative living reference. This node intentionally stays thin and status-free.

## See also

[[cross-engine-port]] · [[magiclike-architecture]] · [[magiclike]]
