---
type: rules
tags: [magiclike, rules]
section: appendices
created: 2026-06-04
updated: 2026-06-04
source: docs/RULES.md Appendices (A1–A3)
---

# Appendices

*[[rulebook|Rulebook]] › Appendices*

## A1. Glossary

- **Active player (AP)** — the player whose turn it is.
- **Non-active player (NAP)** — the other player.
- **APNAP order** — Active Player's effects queued/declared first, then Non-Active Player's. On the stack, this means NAP's effects end up on top (resolve first under LIFO).
- **Card** — a template definition. Distinct from an instance.
- **Instance** — a runtime copy of a card with its own state (tapped, damaged, etc.).
- **SBA** — state-based action. See [[1100-state-based-actions]].
- **Stack** — see [[600-priority-and-the-stack|§601]].
- **Permanent** — a card on the battlefield (land, creature, artifact, enchantment).
- **Source** — the card whose ability or effect is causing something to happen.
- **Controller** — the player making decisions for a permanent. Usually the same as the owner; can differ via "steal" effects.
- **Owner** — the player who started with the card in their deck.

## A2. Authoritative behaviors checklist

When you (the user) want to confirm "is the implementation doing what I expect," use this:

- [ ] Combat damage with first-strike attacker vs. non-first-strike blocker: blocker dies in pass 1, attacker survives pass 2. ([[800-combat|§802]], [[900-keywords|§902.1 first strike]])
- [ ] Trample with chump blocker: full power minus blocker's toughness spills to face. ([[900-keywords|§902.2 trample]])
- [ ] Deathtouch hitting a large blocker: blocker dies even with 1 damage. ([[900-keywords|§902.3 deathtouch]])
- [ ] Lifelink in combat: controller gains life equal to damage dealt. ([[900-keywords|§902.4 lifelink]])
- [ ] Hexproof on opp's creature: your spells can't target it. ([[900-keywords|§904 hexproof]])
- [ ] Indestructible creature with 10 marked damage: survives. ([[900-keywords|§903.1 indestructible]])
- [ ] Triggers fire in APNAP order. ([[1000-triggered-abilities|§1004]])
- [ ] Countered spell goes to graveyard, never battlefield. ([[700-casting-and-activating|§706]])
- [ ] Counterspell with no legal target fizzles (does not get countered itself). ([[700-casting-and-activating|§704]])
- [ ] Empty library draw = loss. ([[100-game-concepts|§100.6]], [[500-turn-structure|§512]])
- [ ] Mana pool empties at phase end. ([[600-priority-and-the-stack|§604]])
- [ ] Land per turn limit: 1, active player only, main phase only. ([[700-casting-and-activating|§701]])

## A3. Known deviations from the canonical rules
Rolling list of places where the implementation knowingly diverges from this document. For the full Godot↔proto comparison, see `docs/DIVERGENCE.md`.

- **Godot multi-blocker damage assignment** dumps all damage on the first blocker (proto matches the canonical rule). See `docs/DIVERGENCE.md` C1.
- **No first-player draw-skip in Godot** (proto implements it). See `docs/DIVERGENCE.md` A2.
- [[1000-triggered-abilities|§1007]]: "intervening if" not re-checked on resolution (both implementations).
- [[500-turn-structure|§502]] Upkeep step: phase exists in Godot but no triggers fire there yet; proto does not implement upkeep at all.
- [[500-turn-structure|§509]] End step: phase exists but no triggers fire there yet (both).
- No Beginning-of-Combat step — combat starts directly with declare attackers (both).
- [[1100-state-based-actions|§1102]]: SBA ordering is single-pass collect-and-apply, not the strict per-rule order from MTG 704.5 (both).
- No exile-zone effects today (both).
- No tokens in Godot port (html-proto has tokens).
- No delayed triggers or temporary control revert in Godot port (proto has both).
