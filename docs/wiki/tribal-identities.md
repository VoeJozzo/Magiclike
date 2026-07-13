---
type: concept
tags: [magiclike, gamedev, tribal, doctrine, draft]
created: 2026-07-13
updated: 2026-07-13
sources: ["chat session (Claude Code, magiclike) 2026-07-12/13 — color-pie + tribal design session; full-pool census (297 proto + 33 Godot templates)"]
---

# Tribal identities *(living doctrine)*

What each creature type **does**, mechanically. Sibling page: [[mechanical-color-pie]] (status-tag vocabulary defined there). The engine makes this layer cheap: subtypes are a free, open registry ([[type-identity]]), lords and subtype-filtered triggers already exist, and the subtype sticker lets a run *become* tribal mid-flight ([[sticker-system]]).

**The model is race + class** *(settled)*: a class is a job — it carries a verb; races split into **demographic** (who lives here — the canvas, few mechanical demands) and **essence** (what you are — being one is already a mechanical fact). And the governing plank: **types are pulls, not absolutes** *(settled)* — creature types are fundamentally fungible; a red Cleric or a white Demon is legal whenever flavor demands it. The tables record preferences, never bans.

## Races

| Tribe | Colors | Identity | Status |
|---|---|---|---|
| Human | all | Demographic default. Payoffs allowed, handled with care | settled |
| Goblin | R | Demographic *and* payoff tribe: go-wide, haste. Goblins have redness — mono-color keeps them out of pure scenery | settled |
| Elf | G | Demographic — "a dude with pointy ears"; the class does the work | settled |
| Merfolk | U | Demographic | settled |
| Spirit | W/U | Flying, flash, tempo, blink — threads slipping the weave ([[threads]]). **Spirits evade** | settled |
| Angel | W | Flies, AND arrives helpful: ETB, or flash, or generically good. **Angels intervene** ([[the-divine]]) | settled |
| Demon | B | Wants payment or a bargain; flies. **Devil is collapsed into Demon** — no separate type; the MTG distinction never made sense | settled |
| Vampire | B | **Every vampire feeds** — Sengir-growth, lifelink, or something bespoke; the form varies, the feeding doesn't | settled |
| Zombie | B | The night shift: recursion, labor | leaning |
| Dragon | R/U | Firebreathing; flies | settled |
| Beast | G | "They gonna eat ya" — fight, power | settled |
| Treefolk | G | Reach, high toughness. Size-scaled: **big = tree** (keywords live at the top end), **small = folk**. Verified in-pool: all 8 toughness-dominant | settled |
| Elemental | U/R/G | **Spells that lingered** — magic-as-event embodied ([[magic]]): flash, heavy ETBs, sometimes temporary | leaning |
| Shade | B | Flavor tribe for the eclipse register ([[black]]); no forced mechanical signature (see §Rejected) | parked |

## Classes

| Class | Colors | Identity | Status |
|---|---|---|---|
| Cleric | W/B | Lifegain and life drain — both sides of the hung jury ([[the-divine]]) | settled |
| Wizard | U | Sorceries matter; some flash | settled |
| Soldier | W | Tokens, formation, anthem-receivers — the mustered institution | settled |
| Knight | W/R/B | **The charge**: "when this attacks…" + first strike | settled |
| Druid | G | Ramp and mana dorks — attendance, not command ([[green]]) | settled |
| Warrior | R-pulled | The self-enlisted army — red's rank-and-file mirror of the Soldier | settled |
| Shaman | R/B | **The conductor** — instructs other cards: converts the tribe's events (ETBs, deaths, attacks) into effects | settled |
| Rogue | U/B | **Saboteurs** — mildly evasive, painful on connection ("when ~ deals combat damage to a player: they discard / you look / you steal"). Engine note: the combat-damage-to-player trigger exists (`thisDealsCombatDamageToOpp`, live on Ancient Hydra since v2.2.7) — buildable today | settled |

Soldier vs. Warrior is a deliberate mirror: the Soldier was *mustered* (the institution drafts you), the Warrior *enlisted* ("rather the army than an inhabitant" — [[red]]).

## Unwoven — the death-sticker design space *(leaning)*

Run-layer death-memory, templated by Joe in-session: **"When ~ dies, put a +1/+1 sticker on it."** A dies-trigger plus the existing `apply_sticker` pipeline — no new engine systems; the history is *visible* (the card wears its scars); and it generalizes as a pattern, not a keyword: die → keyword sticker; die → sticker *another* slot (green's handoff — Last Druid at run scale, [[green]]). Clones copy the scars — slot-state travels, and the False Witness flavor blesses it. Canon: losing a run is unraveling; Elystra refuses to stay unwoven ([[threads]]).

> "This IS the kind of design that I find fun." — Joe, on run-layer self-modification — the space where this game does what paper MTG can't.

Engineering precedents *(settled 2026-07-13)*: threshold reads of a card's own stickers are **bespoke runtime logic per card** (the Elystra / Endomorph precedent), never a schema field on every card. Build-time checks for any death-sticker design: mid-battle recursion semantics; whether player slots cap sticker count. (Individual card designs live with their cards, not here.)

## Rejected — for the record

- **Closed demographic roster** (no dwarves/orcs/halflings): creature types are free; "X is a foo" keeps tribes naturally on-plan.
- **Shade mana-sink signature** ({B}: +1/+1): shades are scarce in modern MTG for a reason — toughness-pump warps combat oppressively, and implicit open-mana threats are AI-illegible (a CABS violation — [[draft-strategy]]).
- **Codified birdless skies**: stays a de facto taste, not a rule.

## See also

[[mechanical-color-pie]] · [[world-bible|world hub]] · [[type-identity]] · [[sticker-system]] · [[threads]] · [[roguelike-meta]]
