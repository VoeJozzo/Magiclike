---
type: concept
tags: [magiclike, gamedev, color-pie, doctrine, draft]
created: 2026-07-13
updated: 2026-07-13
sources: ["chat session (Claude Code, magiclike) 2026-07-12/13 — color-pie + tribal design session; full-pool census (297 proto + 33 Godot templates)"]
---

# Mechanical color pie *(living doctrine)*

What each color **does**, mechanically — the game-design layer over the world bible's color philosophies ([[white]] · [[blue]] · [[black]] · [[red]] · [[green]]). Sibling page: [[tribal-identities]]. Like the world bible, claims are status-tagged: *(settled)* agreed in session · *(leaning)* agreed direction · *(proposed)* awaiting verdict · *(parked)* deferred on purpose · *(rejected)* decided against, kept for the record. MTG is a reference point, **not** a constraint — divergences are deliberate and listed under §Planks.

## The five identities

| Color | Hanger | Removal verb |
|---|---|---|
| White | **The Institution** | arrests |
| Blue | **The Salvage** | delays |
| Black | **The Ledger** | executes |
| Red | **The Moment** | sacks |
| Green | **The Reclaim** | eats |

### White — the Institution *(settled)*
Many small people, organized: tokens, anthems, lords; lifegain as triage; **equalization and tax** — symmetric effects white is built to exploit (the Balancer boss is the prototype). Removal: exile, can't-attack binds, counter-unless-pay (theoretical today), and **freeze** ("doesn't untap during its controller's next untap step" — needs a small engine flag; verified absent 2026-07-13). White detains; blue postpones. Blink lives on the WU seam with rescue as white's intent. Card economy: *(pitched, left be for now)* equalization-shaped draw — white never gets ahead on cards, it refuses to be behind ("if an opponent has more cards in hand, draw until even"). Run-layer signature: symmetric/tax modifiers.

### Blue — the Salvage *(settled)*
Card selection and draw as rites that visibly work; sorceries-matter triggers; counter; **copies and clones — blue never takes your things, it makes fraudulent duplicates** (it falsifies the witness, per [[blue]]). Search: **windows only** (scry, dig, top-N) — never precise tutors. Removal: bounce, counter, tap/untap manipulation. Run-layer signature: cloning.

### Black — the Ledger *(settled)*
Everything priced: pay-life, drain (a rider on removal, not a verb — black's kill spells come with a receipt); dies-triggers as accounting; edicts (black **invoices** rather than aims); discard as repossession; recursion as re-knotting used thread ([[threads]]); **permanent theft as title transfer**; and the game's best tutors, **always costed** — *a black tutor without a real cost (life, sacrifice, discard) is a design error.* Run-layer signature: bargains (the Archdemon's sticker economy).

### Red — the Moment *(settled)*
Haste, damage spells, firebreathing; hasty expendable tokens. Theft has **no middle setting**: borrowed for the afternoon in-game (Threaten), annexed forever at the run layer (`steal`, `rip` — spoils of war; strike the name from the book). Impulse-play ("Seize") is the agreed shape for red card flow, *(parked)* until play data actually shows red needing it.

### Green — the Reclaim *(settled)*
Ramp — but **green accumulates, never bursts** *(settled 2026-07-13)*: dorks, extra lands, landfall payoffs — permanents that stay and keep giving; burst mana stays rejected. (The a-priori experiment flagged the real tension: "ahead of schedule" vs. green's stated patience — accumulation is the reconciliation.) Landfall is green by association *(weak — trigger conditions, like types, are pulls not absolutes)*. Big bodies; trample; fight; **death triggers that build toward something**; creatures that grow over time (moss as progress bar; end-of-turn accrual until an upkeep event exists). Search: domains — creatures and lands. **Regrowth is green's card economy**: black cheats the cost back onto the battlefield (a ledger trick); green returns cards to hand and repays honestly — it's the color with surplus mana and no other card flow. Land animation *(leaning)*. Run-layer signature: slot growth — stickers that accrete.

### Colorless — the Archaeology *(settled)*
Artifacts — knots without a weaver ([[threads]], [[the-fall]] §artifacts-are-archaeology); and the deliberately *weird* build-arounds kept out of any color (Stapler, Codex, Endomorph, Mercurial Adept). Time effects, if they ever exist, are Meridian-coded — the [[meridian|Equatorial Engine]] bottles noon; time is a machine here, not a school of magic *(parked)*.

## Removal doctrine *(settled)*

The severity ladder (tap / bounce / destroy / exile) is one engine mechanism; the pie is which rungs each color gets. **White arrests** (exile, binds, freeze) · **blue delays** (bounce, counter) · **black executes** (destroy, edict) · **red sacks** (damage) · **green eats** (fight, only fight). Promoted from [[white]]'s "binds where black executes" observed pattern (2026-07-13).

## Weakness ledger *(settled 2026-07-13)*

The pie is defined as much by what colors **can't** do; here weaknesses are draft texture and archetype incentive, and they are deliberate:

- **White** — bad card draw (the classic; equalization is its only economy). Premium removal, small threats.
- **Blue** — no killing (the classic): everything it does is delay, duplicate, postpone — nothing is permanent.
- **Black** — **can't bill what has no account**: no interaction with spells on the stack, no answers to artifacts. Against creatures its removal is excellent and cheap.
- **Red** — no easy answer to big toughness (damage is its only verb); can't hold what it takes in-game.
- **Green** — bad removal, full stop: fight needs a body on the board *and* a favorable fight. An empty green board is a spectator.

## Planks — where we are not a clone

- **Flying is tribal, not color-coded** *(settled)*. Tribes fly because of what they are ([[tribal-identities]]); colors get flying via their tribes. Lifelink is drifting the same way *(leaning)*.
- **Taking is split three ways** *(settled)*: blue duplicates, black repossesses, red loots-then-annexes (see identities above).
- **Taxes are shared: white levies, black tolls** *(settled 2026-07-13)*: white's tax is standing and impersonal — a fee schedule (counter-unless-pay, "attacking costs more"); it deters, it doesn't profit. Black's toll is priced to the deed and collected, usually in life — the payment lands in a ledger. A drain stapled to another effect (Toll of Silence) is a *rider*, not a tax. Blue's hard counter stays the objection sustained.
- **Blue's counter is authored, not derived** *(settled)*: the a-priori experiment (2026-07-13) found no permission pillar in the philosophy — "control is not a color-pie pillar, it's just a thing players do" (Joe). Counters stay blue as a game-design choice: blue must answer without killing.
- **Search trichotomy** *(settled)*: blue windows · black whole-library-always-costed · green domains. Rationale: never hand one color both volume and precision — split the consistency pie.
- **Punisher effects are black, not red** *(leaning)*: the toll — both options cost you, and the [[black|Adversaria]] never lied.
- **Opponent-mill is red; self-mill is blue** *(leaning, engine lacks mill)*: milling someone is library-burn — the arsonists of [[blue|the library]]; blue only sifts its own ashes.
- **Ability-blanking is W/B, two registers** *(leaning)*: white blanks as a rider on detention; black blanks standalone — the eclipse ([[black]] §eclipse): reduce something vast to an outline you can measure.
- **Run-layer verbs are pie material** *(leaning)*: rip/steal = red · bargains = black · equalize = white · cloning = blue · accretion = green. The bosses already prove it.
- **Flash is unlegislated** *(settled as a non-rule)*: flash on spells encodes instant-speed, no pie signal; a creature-flash shape may emerge on its own. Watch, don't rule.
- **No auras, no equipment — on purpose** *(proposed)*: permanent modification lives at the run layer; [[sticker-system|stickers]] and [[staple-synthesis|splices]] are our auras.
- **Riders and compositions are free** *(settled 2026-07-13)*: a card gluing two colors' verbs together ("counter a spell and gain 3 life") needs no new pie entry — it composes from what the colors already do. Only new *verbs* need slots.
- **Frames are free; payloads obey the pie** *(settled 2026-07-13)*: trigger conditions, rider hooks, and activation shells are frames any card may use — "anyone can have an ETB trigger" (Joe). The *effect inside* the frame carries the color identity. Landfall-green and the like are associations (pulls), never laws.

## Pair archetypes *(all leaning)*

WU Spirits & flicker · UB contested truth (the [[tribal-identities|Rogue]]'s pair) · BR aristocrats · RG stampede · GW husbandry · WB Clerics (the life-total ledger) · UR spellcraft · BG graves (the two indifferences: recorded vs. digested) · RW rally · GU wildlore (creatures as card advantage).

## Later assignments (2026-07-13 completeness sweep)

- **Artifact removal — red AND green, two registers** *(settled 2026-07-13)*: red smashes now (printed: Scrap); green reclaims slowly (moss on golems — the a-priori sorters' majority read). Both right.
- **Anthem split** *(penciled)*: white anthems *stand* (statics, formation lords); red's are *battle-cries* (until end of turn). The pool doesn't enforce this yet (Vanguard Ensign is a WR static); pencil, not law.
- **Graveyard hate — green** *(leaning)*: the Reclaim finishes digesting — composting completes, and nothing is left to re-knot. (Beats the white "last rites" read: white's saints and martyrs are themselves graveyard-linked. Precedent: Scavenging Ooze.)
- **Burst mana / rituals — rejected as a mechanic** *(settled)*: not sold, not built, not assigned.
- **Hexproof / indestructible — unlegislated** *(settled as a non-rule)*: rare and powerful; ruled per card, no standing color law.
- **First strike outside Knights — W/R** *(proposed)*: the drilled line and the duelist; matches the current pool split.
- **Land interaction — settled** *(settled 2026-07-13)*: available, softened by classic-mode auto-fill. **Red destroys outright** (scorched earth) · **green destroys-but-replaces** ("destroy a land; its controller gets a new one" — succession, the land gone feral) · **white symmetric or equalizing** (everyone's works, or "destroy if they have more") · **black steals lands** — foreclosure. (The lands-as-abilities model makes a stolen land just work: it taps for its new owner.)
- **Coin flips / chaos — rejected** *(settled)*: prefer output randomness elsewhere; not a color identity.
- **Artifact synergies** *(settled 2026-07-13, except as noted)*: **red forges** (artifact-creature aggression — Ironbrand Marshal, Scrap Hound; the Blacksmith class); **green never** (the Reclaim digests — anti-affinity as identity); **blue catalogs** (artifacts as objects of the past: provenance, study); **black covets** *(penciled — greed/appraisal register)*; **white stewards** *(penciled — "monument" cards: static buffs on artifacts, standing benefits while the old thing stands; Meridian maintains what it cannot make)*.
- **Conversion is pan-color** *(penciled)*: "transform without killing" is an effect class, not a slice — each color converts toward its own register (white retires, green animates, blue falsifies, black repossesses).
- **Design-space pencil marks** *(parked until wanted)*: white erosion-costs — strong effects with maintenance bills ("at end of turn, pay {W} or release it"); the testimony mechanic (cards whose behavior varies per run, Mercurial-style — mechanically *lying* text is impossible here by construction: procedural card text is a truth-machine).

## Assignments awaiting verdict *(proposed)*

Loot U / rummage R / draw-for-life B · wrath shapes (W equalize, R mass damage, B mass edict, U mass bounce, G none) · counter dialects (G time, Vampire meals, Hydra X) · deathtouch B-primary G-secondary · menace B/R.

## Open

- **Vigilance's home (Q1).** Mechanically colorless; argued into W/G because those are the two colors whose game plan *is* the board (patches go-wide's crack-back and lets go-tall's body be sword and wall; red keeps its designed vulnerability; blue would turn it into untap-matters). Awaiting verdict.

## See also

[[tribal-identities]] · [[world-bible|world hub]] · [[white]] · [[blue]] · [[black]] · [[red]] · [[green]] · [[roguelike-meta]] · [[sticker-system]]
