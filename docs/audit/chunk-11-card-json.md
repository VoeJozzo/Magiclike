# Chunk 11 — Card-data JSON sweep (all card JSONs) @ `04a925f`

> **Tier 3** · claimed 2026-06-12T03:09:52Z · anchor `04a925f` (workshop tip, post-#131)
> Method: three-phase workflow — a checklist-builder agent extracted the REAL engine
> vocabularies from the snapshot (EFFECTS kinds, VALID_TRIGGER_EVENTS, ATOMIC_PREDICATES,
> MATCH_FILTER_KEYS, MOVE_CARD_SELECTORS, retired-vocabulary blocklist, common-shape field
> census) → 15 Haiku sweep agents read **every** card.json in batches (297/297 cards, 0
> failed batches, no sampling) → judge agents re-verified each flagged anomaly against the
> actual engine code, with node probes where needed.
>
> Terminology: Magiclike's rules are THE rules; MTG appears as a reference point only.

## Headline result: the pool is conformance-clean

**13 anomalies flagged → 13 judged FALSE-POSITIVE.** Every flag was a gap in the *sweep
checklist's* knowledge, not a card defect. The pool's cleanliness is consistent with the
boot-validation hardening the campaign has landed (A3-5 generated-table validation, A3-14
fireAt, A4-8 target_filter combos, A4-11 filter-key whitelist, A4-17 required params,
A4-21 move_card selectors, A3-2 stackable booleans): the engine now *mechanically* rejects
most malformed card data at startup, so a human-error JSON typo has little room to hide.

### The 13 false-positives (recorded as vocabulary documentation, valuable negative space)

| Card(s) | Flag | Truth (judge-verified against the engine) |
|---|---|---|
| artifice_triumphant, bleach | sticker payload kinds `grant_activated_ability` / `set_color` "not valid effect kinds" | Sticker-payload kinds are their own registry (stickers.js applyStickerToCard: cost_mod / set_color / grant_activated_ability / set_types) — distinct from the EFFECTS table |
| embargo | `stackable` inside a sticker payload | A different, real field: sticker-stack permission (stickers.js `!s.stackable` dedup gate) — multiple Embargo cost taxes stack by design; unrelated to the trigger/ability stackable bit |
| great_herder, verdant_outrider | `post: {tap:true}` on move_card "unknown param" | `post` is a documented move_card param (handler signature comment); the fetch arm applies `post.tap` via placeCardOnBattlefield — the dict form of the old searchLandTapped shorthand |
| seal_thief_courier | `spend_as_any_color` "typo of spend_mana_as_any_color" | Intentionally distinct: the permission-level field on grant_cast_permission (stored on the permission object, folded into the cast cost from exile); the top-level field is a different permanent-level mechanic |
| spiteful_imp, wicked_acolyte | negative `gain_life` targeting opp | The engine's designed life-loss idiom: unified signed life-delta (DIVERGENCE D4), explicit `amount<0` branch routing through losePlayerLife with correct events + text; there is deliberately no separate lose_life kind |
| stapler ×2, steal | `permanent_or_spell` "not in the TARGET_FILTERS taxonomy" | Fully supported end-to-end (dedicated targetsForFilter case, resolver, UI routing) — the flag exposed an ENGINE-side residue instead, filed as A11-1 below |
| storm_charm | `mode_names` sibling key "possibly ignored" | Consumed by the cast log and the mode-picker UI, preserved by the deep-copy paths — an established companion key to `modes` |
| wizard_adept | `scope:"self"` on a hand→graveyard move_card "not a valid selector" | `scope` is the orthogonal engine-wide routing field, not a selector; resolves to the controller and behaves identically to selector controller_chosen; selector-less legacy form explicitly supported (A4-21 comment) — at most a stylistic redundancy |

## Findings

### A11-1 — Slot-level and effect-level `target` strings are validated against NOTHING — a typo fails silently as a permanently uncastable card ⟶ SHIP (P4)
*(Rewritten after self-QA falsified the first framing — corrections below.)*
- **Location:** boot validation at `reference/html-proto/js/engine.js:3653` (card-level
  `target` vs TARGET_FILTERS) and `:3624` (target()/chooses() step filters) — **nothing
  checks `target_slots[i].target` or effect-level `e.target`**; runtime split:
  `getValidTargets` (`:4416`, has the dedicated `permanent_or_spell` case at `:4503`,
  serves slot/effect-level targets) vs `targetsForFilter` (`:4536`, serves card-level
  targets, has NO such case — unknown filter → `console.warn` + `return []`). @ `04a925f`
- **Dimension:** structural footgun (a validation gap, plus a two-runtime-paths asymmetry
  the validator only half-mirrors).
- **Claim:** the three live `permanent_or_spell` users (Stapler's two slots, steal's
  effect-level target) boot clean only because slot/effect-level target strings receive
  **no boot validation at all**. A typo'd target string at those levels produces a card
  that boots fine and is silently uncastable forever (`getValidTargets` falls through to
  empty candidates — no warning at boot, none in play beyond a console line). Given the
  campaign's boot-validation lineage (A4-8/A4-11/A4-17/A4-21), this is the one remaining
  unvalidated target surface.
- **Self-QA corrections folded (the first framing was wrong three ways):** the `:4503`
  case lives in `getValidTargets`, NOT `targetsForFilter`; a card-level
  `permanent_or_spell` would be **rightly** boot-rejected (the card-level runtime path
  can't resolve it — the set accurately mirrors `targetsForFilter`); and "add it to the
  set" alone would produce boot-pass/runtime-dead — the set and `targetsForFilter` are in
  sync with *each other*; the asymmetry is between the two runtime paths.
- **Evidence:** judge-verified during the sweep + self-QA re-verification (set/switch/
  boot-validation reads quoted; live users enumerated; the silent-failure path traced to
  `getValidTargets`' default arm).
- **Fix sketch:** extend boot validation to sweep `target_slots[i].target` and effect-level
  `e.target` against the set of names `getValidTargets` actually handles (derive it from
  the switch or maintain a sibling set with its own keep-in-sync comment). Optionally:
  if card-level `permanent_or_spell` should ever be legal, that's a `targetsForFilter`
  case + a TARGET_FILTERS entry + a boots-and-resolves test — a separate, deliberate step.
- **Effort:** small. **Verification status:** judge-verified, then self-QA-corrected and
  re-verified (the QA gate falsified the original framing — recorded as a calibration
  datum: judge passes verify *claims*, the QA pass caught the *synthesis*).
  **Remediation class: ship** (validation/diagnostics, behavior-neutral — standing rule).

## Coverage

297/297 card folders read in full (no sampling; 15 batches, 0 failures). Checklist built
from the snapshot's live registries, not from docs. Judges re-read every flagged card.json
and the relevant engine code per anomaly; two judges ran node probes.

## Test quality

Card-data conformance is now primarily enforced by **boot validation** (the campaign's
accumulated arms) rather than by tests — appropriate for data. The sweep's residual value
is the vocabulary documentation above: the false-positive table is effectively the
"fields that are real but easy to mistake for typos" cheat-sheet for future card authors
and future sweeps.

## Triage table (for INDEX.md)

| ID | Severity | Dimension | Location | Title | Class | Status |
|----|----------|-----------|----------|-------|-------|--------|
| [A11-1](chunk-11-card-json.md) | P4 | structural footgun | engine.js | Slot/effect-level target strings validated against NOTHING — a typo = silently uncastable card (the 3 live permanent_or_spell users boot clean through this gap); self-QA-corrected framing: the asymmetry is getValidTargets vs targetsForFilter, not the set vs the switch | ship | open |
