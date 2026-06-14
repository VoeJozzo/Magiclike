---
type: index
tags: [magiclike, wiki, engine]
aliases: ["Engine internals hub"]
created: 2026-06-10
updated: 2026-06-14
---

# Engine internals

Per-subsystem knowledge of the [[html-proto]] rules engine — the verified mechanics narratives, Joe's design rulings, and the negative space (what's been checked against canon and cleared). Where the sibling concept pages ([[magiclike-architecture]], [[trigger-resolution]], …) carry the durable *why*, this cluster carries the verified *how it actually works*, one page per engine subsystem.

**Maintenance:** treat these like any other wiki page — capture proactively when a subsystem's behavior changes, and bump `updated`. A fix that changes the mechanics narrative updates **The flow** of the relevant page.

## Page anatomy (the shape each subsystem page follows)

1. **What it does** — one plain-English paragraph.
2. **The flow** — the verified mechanics narrative: how the subsystem actually behaves. Function names, never line numbers.
3. **Design rulings** — Joe's intentional divergences from real MTG, one-line rationale each. Magiclike's rules are **the** rules — these are design decisions, never "house rules."
4. **Verified clean** — negative space: what's been checked against canon and explicitly cleared.

## Durability rules

- **No line numbers.** Function and file names only — line cites rot in days here.
- **No transient status.** Describe how the engine works now; a fix that changes behavior updates **The flow**, rather than leaving a status note behind.
- **Terminology:** never "house rules." Magiclike's rules are THE rules; deliberate differences from real MTG are *design rulings*.

## Pages

- [[turn-machine]] — `step()`, phases, priority rounds, mana emptying, SBAs, win/loss.
- [[combat]] — declaration legality, keyword gates, the two-pass damage core, removal-from-combat.
- [[triggers-and-stack]] — emit → queue → drain → resolve, APNAP, the trigger budget cap, generated triggers.
- [[effects-and-targeting]] — the EFFECTS dispatch table, the targeting/hexproof layer, resolution-time re-validation, zone routing.
- [[synthesis-staple]] — the splice merge core, the two pathways (reward + Stapler boon), charge economy and the rip lifecycle.
- [[ai]] — the player agent: legality-surface contract, the four drift-twin pairs, sanctioned transient mutations, the valuation partition, the respond arm.
- [[draft]] — the two draft modes, the shrinking-table pack-color policy, the two color-signal reads, opponent construction + scaling.
- [[run-meta]] — the slot model + slotIdx caller contract, the save/migration lifecycle, the anti-farming snapshot, pre-rolled rewards, endless sectors, the boon contract, picklog.
- [[card-text]] — the data→English oracle pipeline, the `~`-placeholder substitution seam, custom_text passthrough, the coverage watchdog, the idiom registry.

## See also

[[magiclike-architecture]] · [[html-proto]] · [[cross-engine-port]] · [[trigger-resolution]] · [[targeting-and-hexproof]] · [[mana-model]] · [[atomic-effects]] · [[rulebook|Comprehensive Rules]]
