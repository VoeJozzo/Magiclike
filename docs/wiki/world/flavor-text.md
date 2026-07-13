---
type: opinion
tags: [magiclike, worldbuilding, flavor-text, draft]
created: 2026-06-09
updated: 2026-06-09
---

# Flavor text — testimony, never narration *(the opinion of one instance)*

**Status: nothing renders flavor text anywhere yet.** This page is one instance's design opinion, recorded before any implementation exists, at Joe's invitation — the same register as the letters in `reference/html-proto/cards/heir_to_burnt_house/claude-notes.md` and `…/false_witness/claude-notes.md`. Argue with it; it binds nobody.

## The position

**Every flavor line should be sayable by someone in the world** — spoken, written, carved, sworn, sung, scratched into a cell wall. Never a narrator.

The test is one question: *could a person plausibly say, write, carve, or sing this?*

- "The bell rang twice that night." — passes. Somebody was there.
- "My house is ashes. I see no reason yours should stand." — passes; it's already on a card.
- "Little did they know what stirred beneath the hill…" — fails. That's a narrator, and this world doesn't have one.

## Why I hold it

1. **The world has lost its narrator** ([[the-fall]]). Threads: seen once, believed never. Gods: testimony, no verdict. History: ruins, no agreed account. An omniscient flavor voice would quietly reintroduce, at the bottom of every card, exactly the authority whose absence defines the setting. The frame would contradict the painting.
2. **Small windows, enforced at the sentence level** ([[tone]]). A witness only knows their room. A narrator knows too much — narrators are how "The American Revolution" sneaks back onto a card that should say "throw tea off a boat."
3. **The corpus already complies.** Both existing flavor texts are testimony: a dying declaration (the Heir, black), words addressed to the victim (the False Witness, **blue**). One per color — the register belongs to the world, not to a color, which is itself evidence for reason 1. The style was discovered, not invented — same as [[threads]].
4. **The hung jury needs witnesses** ([[the-divine]]). Per-card certainty is allowed; only the *set* must disagree with itself. Witnesses can be wrong, partial, lying, devout — that's the material. A narrator can't be any of those things, which makes it useless to us.

## The cost, honestly

This rules out MTG's omniscient-aphorism register, which that game sometimes does very well. The accommodation that I think keeps the best of it: **proverbs and epigraphs are still in-world speech.** A proverb is testimony with the witness worn away; an epigraph has an author somewhere in the world ("—carved over the arena gate"; "—from a hymnal recovered at [somewhere]"). So the constraint isn't "attributed dialogue only." It's **no view from nowhere.**

One register I'd especially protect: testimony lets flavor *contradict the art* — a card whose image shows one thing while its witness claims another (Anger of the Gods already does this with its *name*). That gap is the house move; a narrator would have to resolve it.

## Mechanics note (for whoever implements rendering)

Flavor is presentation-layer data — the engine never reads or generates it, per the engine/UI separation in [[magiclike-architecture]]. And note the pleasing inversion: rules text here is *machine-written* ([[procedural-card-text]]) while flavor text would be the one text field on the card that **taste writes by hand**. The card's law is generated; its voice is authored. That feels right for this world.

— **Claude (Fable 5)**, June 2026, at Joe's invitation. If you're a future instance reading this: the position is mine, the taste filter is his, and the two card letters are this page's ancestors.

## See also

[[world-bible|world hub]] · [[the-fall]] · [[the-divine]] · [[tone]]
