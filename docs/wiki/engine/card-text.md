---
type: concept
tags: [magiclike, engine, audit, card-text]
created: 2026-06-13
updated: 2026-06-13
sources: ["docs/audit/chunk-10-card-text.md", "PR #98 verdict rounds (2026-06-10)"]
---

# Card text (engine internals)

*Audit chunk 10. Page anatomy + durability rules: [[README|engine hub]]. The durable concept companion is [[procedural-card-text]] — oracle text is generated from effects, never hand-authored. The effect vocabulary this module renders is [[atomic-effects]] / [[effects-and-targeting]]'s; the type-line phrasing is [[type-identity]]'s; the trigger phrasing is [[triggers-and-stack]]'s. This page carries the verified mechanics of `card-text.js`: the data→English pipeline, the placeholder-substitution seam, the custom_text passthrough, the coverage watchdog, and the idiom registry.*

## What it does

`card-text.js` turns card data into English oracle text — there are no hand-authored rules strings except a small set of `custom_text` exceptions. `describeEffect` renders one effect kind to highlight-aware segments; the higher describers (`describeAbility` / `describeTrigger` / `describeStaticBuff` / `describeModalSegs`) wrap it with cost, preamble, and duration phrasing; `describeCardSegments` assembles a card's sections (the card frame paints these, highlighting empower-bumped values) and `describeCardText` flattens them to a plain string. `triggerLogText` renders a trigger for the game log, `formatTriggerText` substitutes card names into placeholder templates, an idiom layer collapses multi-effect phrases, and `effectCoverageReport` is a boot watchdog asserting every effect kind has a render path. It reads `ENGINE.synthesizeStapledTemplate` for stapled-card baselines.

## The flow

- **Effects → segments → English.** `describeEffect` renders one effect to `{text, highlight}` segments (highlighted = empower-bumped); `describeEffectList` composes the multi-effect idioms; the ability/trigger/static-buff/modal describers add the surrounding phrasing; `describeCardSegments` assembles the card, `describeCardText` flattens it. **Every player-facing label now routes through this one oracle** — including the unified ability picker's button labels, which used to be a hand-rolled kind→label table that lied about kinds, costs, permanence, and subject. `abilityPickerLabel` is now the capped `describeAbility` output, so a picker button can never contradict the card's own rules text.
- **The `~` placeholder seam.** Authored and generated trigger templates use `~` as the card-name placeholder (`MERCURIAL_TRIGGER_POOL`, the generator tables, `custom_text` faces). `formatTriggerText` substitutes `~` → the HTML-escaped card name, and it is now applied at **every** consumer — the custom_text faces, the trigger log lines, the stack pill, and the build-ability log — so `~` never reaches a player raw. The trigger-log sites also dedupe the trailing period (authored/generated text already ends `.`), so log lines no longer end `..`. (`render`'s inline textContent substitution is deliberately left alone — HTML-escaping it would render a literal `&amp;`.)
- **`custom_text` passthrough.** A few cards (Endomorph, Architect's Codex, Elystra, the Mercurial Adept, Archdemon of Bargains) keep hand-authored faces; `describeCardSegments` emits the authored string verbatim (now `~`-substituted). The authored text is the contract — and for cards whose live behavior is data-driven (the Mercurial Adept rolls one ability from its pool each game) the face must be kept in sync with the table **by hand**, because the popup "Repertoire" — the only UI that shows the true live pool — renders only for legacy saves.
- **The coverage watchdog.** `effectCoverageReport` partitions the effect kinds across three consumers — the `EFFECTS` handlers, the AI valuation, and this module's describe arms — and asserts none is silently missing a path. `TEXT_IDIOM_ONLY` exempts the kinds that only ever render inside a multi-effect idiom (`steal`, `annihilate`, the bargain-sticker pair); a member that grows a real standalone describe case must leave the set, or the guard stops guarding it.
- **Type-line phrasing.** `add_type` renders "also becomes …", `set_types` renders "becomes … and loses its other types"; `scope:'self'` uses the subject "this", mirroring the pump arm (so a self-scoped type change reads as a sentence, not an empty subject).

## Design rulings

Chunk 10 produced **no mechanics rulings**. All nine findings are text / display / comment defects — they change what a player *reads*, never what the game *does* — so none needed a PR #98 ballot (the remediation-class rule: text/display fixes ship on green, with Joe seeing the player-facing wording in the PR diff). The campaign terminology ruling governs the *content*: card text states Magiclike's rules as **the** rules — where Magiclike diverges from real MTG, the oracle describes the Magiclike behavior plainly, never as a deviation from an external standard (Joe, 2026-06-10, PR #98).

## Verified clean

From the deep-read's executed sweeps: the **archetype table has zero gaps** — 103 pool + 6 Mercurial + 8 generator triggers all classify non-null; a **297-card dual-mode sweep with 8 artifact detectors** found exactly one malformed face (A10-4) and **no `[kind]` sentinel / `undefined` / `NaN` / dangling-"to" / generic preamble** reaches any pool face; damage scope text is truthful (including the `scope:'self'` "you take N" strip); pump/add_counter permanence, the shared `affect_creature` severity ladder, and the move_card/change_control/steal/grant_keyword durations all match their handlers; §305.6 mana-line suppression holds. `render`'s textContent `~`-substitution was checked and cleared as deliberate, not a defect.

## Open soft spots

Live status: `docs/audit/INDEX.md` (audit ledger). Known-open at distillation: **A10-6** (`coalesceEotBuffs` drops the filter from a merged EOT-buff subject) and **A10-7** (a modal mode whose idiom embeds a period double-punctuates) — both **parked, zero live users**, each carrying an author-time pointer (the pointer is the deliverable). The chunk's seven ship findings plus chunk 11's lone **A11-1** (slot/effect-level target-string boot validation) landed together in the truthfulness batch — see the ledger.

## Coverage reality

As of the chunk-10 distillation (2026-06-13): by test *quality* `card-text.js` is the **best-guarded file in the audit** — `test_no_dead_text` is a real property test, `test_generated_special_text` covers the generator surface, `test_effect_coverage` *executes* the coverage report, and `card_text_test.js`'s exact-string pinning is legitimate because exact strings ARE this module's contract (mutation score 59). The deep-read named two gaps, both now closed: the suite **pinned a bug** (A10-5 certified "you gains" as correct — re-pinned to the right string), and the three behavioral paths were **fully dark** (no picker-label, `~`-substitution, or whole-pool artifact test). `test_a10_text_truthfulness.js` now pins the picker-label-is-oracle property (no raw-kind leak), the `~` substitution including the Mercurial face, and the add_type/set_types self-subject; `test_a11_target_string_validation.js` pins the boot target-string guard.

## See also

[[README|Engine hub]] · [[procedural-card-text]] · [[atomic-effects]] · [[effects-and-targeting]] · [[type-identity]] · [[triggers-and-stack]] · [[composable-predicates]] · [[rulebook|Comprehensive Rules]] · [[html-proto]] · [[cross-engine-port]]
