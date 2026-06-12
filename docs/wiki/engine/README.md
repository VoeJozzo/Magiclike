---
type: index
tags: [magiclike, wiki, engine, audit]
aliases: ["Engine internals hub"]
created: 2026-06-10
updated: 2026-06-11
sources: ["docs/audit/ chunk findings 01-05", "PR #98 verdict rounds (2026-06-10)"]
---

# Engine internals (audit-distilled)

Per-subsystem knowledge of the [[html-proto]] rules engine, distilled from the 2026-06 proto audit — the adversarially-verified mechanics narratives, Joe's design rulings, the verified-clean negative space, and an honest read of where test coverage actually is. Where the sibling concept pages ([[magiclike-architecture]], [[trigger-resolution]], …) carry the durable *why*, this cluster carries the verified *how it actually works*, one page per engine subsystem (the audit's chunk map).

**Maintenance contract:** the audit campaign maintains this cluster — each completed chunk ends with a distillation step that seeds or updates the matching page. Between chunks, treat these pages like any other wiki page (proactive capture; bump `updated`).

## Page anatomy (the contract every subsystem page follows)

1. **What it does** — one plain-English paragraph.
2. **The flow** — the verified mechanics narrative: how the subsystem actually behaves post-audit, including the fixes that have landed. Function names, never line numbers.
3. **Design rulings** — Joe's intentional divergences from real MTG, one-line rationale each, cited to the verdict source (PR #98 + date). Magiclike's rules are **the** rules — these are design decisions, never "house rules."
4. **Verified clean** — negative space: what the audit checked against canon and explicitly cleared.
5. **Open soft spots** — known-open finding IDs only (details + live status live in the audit ledger, `docs/audit/INDEX.md` on the `audit/findings` branch — never duplicated here).
6. **Coverage reality** — the per-region mutation-map summary and which behaviors gained pinning tests, dated so staleness is self-declaring.

## Durability rules

- **No line numbers.** Function and file names only — line cites rot in days here.
- **No transient status.** A finding ID + a pointer to `docs/audit/INDEX.md` is the whole story; "fixed/open" lives in the ledger, not these pages. (Fixes that *change the mechanics narrative* update **The flow** instead.)
- **Design rulings cite their source** — "design ruling, PR #98, 2026-06-10" (plus the implementing PR where one exists) — so a future reader can find the reasoning thread.
- **Terminology:** never "house rules." Magiclike's rules are THE rules; deliberate differences from real MTG are *design rulings*.

## Pages

- [[turn-machine]] — `step()`, phases, priority rounds, mana emptying, SBAs, win/loss (audit chunk 1).
- [[combat]] — declaration legality, keyword gates, the two-pass damage core, removal-from-combat (chunk 2).
- [[triggers-and-stack]] — emit → queue → drain → resolve, APNAP, the trigger budget cap, generated triggers (chunk 3).
- [[effects-and-targeting]] — the EFFECTS dispatch table, targeting/hexproof layer, resolution-time re-validation, zone routing (chunk 4).
- [[synthesis-staple]] — the splice merge core, the two pathways (reward + Stapler boon), charge economy and the rip lifecycle (chunk 5).
- [[ai]] — the player agent: legality-surface contract, the four drift-twin pairs, sanctioned transient mutations, the valuation partition, the post-Stackable respond arm (chunk 7).
- [[draft]] — the two draft modes, the shrinking-table pack-color policy, the two color-signal reads, opponent construction + scaling (chunk 8).

**Planned** (seeded as their audit chunks complete): stickers-runtime (ch. 6), run-meta (ch. 9), card-text (ch. 10), card-data (ch. 11).

## See also

[[magiclike-architecture]] · [[html-proto]] · [[cross-engine-port]] · [[trigger-resolution]] · [[targeting-and-hexproof]] · [[mana-model]] · [[atomic-effects]] · [[rulebook|Comprehensive Rules]]
