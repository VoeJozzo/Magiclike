---
type: concept
tags: [magiclike, gamedev, architecture]
created: 2026-06-02
updated: 2026-06-02
sources: ["reference/html-proto/CHANGELOG.md", "reference/html-proto/CLAUDE.md"]
---

# Procedural card-text

A card's oracle text and trigger labels are **generated from its structured data** (effects, triggers, keywords, abilities) — not hand-authored. `describeCardText` / `describeTrigger` in the proto's `card-text.js` render the prose; the stored `text` field was stripped from nearly every card because it was dead weight that could silently drift from the mechanic.

## The anti-drift principle

Hand-authored text **rots**: a label once read "fetch a Forest" for a card that fetches *any* land. Generated text can't lie about the mechanic — change the effect and the text recomputes. Only a few `custom_text` cards keep authored labels, exactly where behavior can't be described structurally (rolled or bespoke abilities). (Evolution: `reference/html-proto/CHANGELOG.md`.)

## The one coupling seam

The proto engine calls the text generator (`triggerLogText`) to write its game log — a deliberate single-call shortcut. The [[godot]] port **does not** replicate it: the engine stays UI-free and emits a structured "trigger fired" signal, and the presentation layer renders the label. The seam is isolated behind that one named call, so the port is a clean "swap the call for a signal emit." (Design discipline: [[magiclike-architecture]]; relationship: [[cross-engine-port]].)

## See also

[[magiclike-architecture]] · [[staple-synthesis]] · [[html-proto]] · [[magiclike]]
