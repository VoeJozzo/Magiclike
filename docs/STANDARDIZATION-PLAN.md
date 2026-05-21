# Standardization Plan — html-proto ↔ Godot Port

Status: **draft**, May 2026. Living document.

## 1. Goal

Maximize interoperability between the two engines so that:

1. **Card definitions can be authored once and consumed by both.** Today, a new card has to be written twice (JSON in `reference/html-proto/cards/<tplId>/card.json`, then a `.tres` or programmatic `CardResource` in `cards/templates/`). With 258 JS cards vs 23 Godot cards, the prototype is the source of truth — but every Godot port re-translates field names. That's pure friction.
2. **The action, event, and effect protocols line up conceptually.** A reader fluent in one engine should be able to read the other without a glossary. Naming should differ only by language convention.
3. **Going-forward work doesn't drift.** When a new effect kind, event, or predicate is added on one side, the protocol document tells you what to call it and how to add it on the other.

Non-goal: literal source-level identicalness. JS will stay camelCase; GDScript will stay snake_case. We're chasing **structural and conceptual** interop, not syntactic.

## 2. Current state, briefly

Both engines independently arrived at the same conceptual shape:

- A top-level state object with `you`, `opp`, `turn`, phase, stack, attackers, blockers, pending triggers
- An `executeAction({kind, ...}) / execute_action(action)` single-entry mutation surface
- A trigger-drain loop (APNAP) that pushes pending triggers onto a shared stack
- A predicate registry indexed by string ID, called from the trigger drain
- An effect-kind dispatch table called from spell/ability/trigger resolution

That conceptual parallelism is the prize. What diverges is purely vocabulary and granularity. Five axes of drift:

| Axis | html-proto | Godot port |
|---|---|---|
| Case | camelCase (`tplId`, `cardIid`, `lifeLostThisTurn`) | snake_case (`card_id`, `instance_id`, `life_lost_this_turn`) |
| Verbosity | terse (`name`, `text`, `cost`, `sub`) | verbose (`display_name`, `oracle_text`, `mana_cost`, `subtypes`) |
| Grouping | flat `effects` list, `triggers` list, `abilities` list | split `on_cast_effects` / `triggered_abilities` / `activated_abilities` |
| Targets | `"self"`, `"any"`, `"creature"`, `"player"`, `"permanent"` | `"chosen"`, `"controller"`, `"opponent"` + descriptor objects `{kind, iid}` |
| Events | `cardEntersBattlefield`, `cardDies`, `lifeGained`, `attacks` | `card_etb`, `card_dies`, `card_discarded` |

The drift is **mostly mechanical**. There are zero conceptual disagreements about how MTG-like rules should work.

## 3. Strategy: two-tier vocabulary

We don't try to make the two languages look the same. We define a **canonical concept layer** that both languages name in their idiomatic case. The conversion is mechanical:

> `lifeLostThisTurn` (JS) ⇔ `life_lost_this_turn` (Godot)

That rule is unambiguous in both directions when applied to ASCII identifiers, and it lets us treat the two engines as "the same protocol in two dialects." This means:

- **Card JSON written in JS conventions remains the wire format.** It's what 258 cards already speak. The Godot port reads those JSONs and converts keys mechanically on ingest.
- **The Godot side keeps snake_case in its own code, including for any cards it authors itself (which should be rare going forward — see §5).**
- **Wire-level enums (effect kinds, event kinds, predicate IDs, target filters, phase names) are defined ONCE and named in a chosen canonical case** — see §4.

## 4. Canonical vocabulary

Single source of truth is the table below. Names should be **camelCase in JS, snake_case in Godot**, with verbatim conversion. Where a name needs to change on one side, the table flags it. *"Canonical concept"* is the rosetta-stone label — that's what we call the concept in docs, commit messages, and discussion.

### 4.1 Card template fields

| Canonical concept | JS (current) | Godot (current) | Decision |
|---|---|---|---|
| template ID | `tplId` | `card_id` | **Pick one.** Recommend `tplId`/`tpl_id` — shorter, distinguishes from instance ID, already on 258 JSONs. Rename Godot. |
| display name | `name` | `display_name` | **Pick one.** Recommend `name`/`name` — `display_name` adds nothing when there's only one name. Rename Godot. |
| card types | `type: "Creature"` (string, capitalized) | `card_types: ["creature"]` (array, lowercase) | Card types ARE conceptually a multi-set (a single card can be Artifact Creature). Canonicalize on `card_types: ["creature"]` lowercase array. Migrate JS. |
| subtypes | `sub: "Human Warrior"` (space-separated string) | `subtypes: ["human", "warrior"]` (array) | Canonicalize on the array form. Migrate JS. |
| mana cost | `cost: {R: 1, C: 2}` | `mana_cost: {R: 1, C: 2}` | Same shape, different name. Recommend `cost`/`cost`. |
| oracle text | `text` | `oracle_text` | Recommend `text`/`text`. "Oracle" is a hold-over from MTG specifics that has no engineering meaning here. |
| keywords | `keywords: ["deathtouch"]` | `keywords: ["deathtouch"]` (on CreatureResource only) | ✅ aligned. |
| power / toughness | `power`, `toughness` | `power`, `toughness` | ✅ aligned. |
| on-cast effects | `effects: [...]` | `on_cast_effects: [...]` | The JS form conflates spell-resolution effects with creature ETB-via-trigger effects in some cards. Recommend canonicalizing on **`on_cast_effects`** — explicit is good here, and "this list runs when the spell resolves" is what it means. Migrate JS. |
| triggered abilities | `triggers: [...]` | `triggered_abilities: [...]` | Recommend `triggers`/`triggers`. Shorter, matches the JS naming, no overload risk in either codebase. Rename Godot. |
| activated abilities | `abilities: [...]` | `activated_abilities: [...]` | Recommend `abilities`/`abilities`. Same logic. |
| static buffs (lord effects) | `staticBuffs: [...]` | (not yet) | When added, name it `static_buffs`/`staticBuffs`. |
| art | `art` (emoji or PNG path) | `front_image_path` | Recommend `art`/`art`. |
| color identity (computed) | `color`, `colors` | (computed at runtime, not stored) | These are derived from `cost`; consider DROPPING them from JSON to avoid the redundancy. Compute on load both sides. |

### 4.2 Triggered ability fields

| Canonical | JS | Godot | Decision |
|---|---|---|---|
| event kind | `event` | `event` | ✅ aligned. (values harmonized in §4.5) |
| predicate ID | `condId` | `condition_predicate` | Recommend **`condId`/`cond_id`**. Renames Godot. |
| self-restriction | (handled inside predicate) | `self_only: true` | The JS handles this via predicates like `thisEnters` (compares `evt.card.iid === self.iid`). Godot lifts it to a structural flag. Decision: **adopt the Godot form.** It's clearer, and any predicate that conceptually means "this card" should be expressible as `self_only: true` over a generic event. Migrate JS triggers to add `self_only` and simplify the `cond_*` set. |
| effects | `effects: [...]` | `effects: [...]` | ✅ aligned. |
| oracle text override | `text` | (synthesized) | When trigger text needs to override the auto-generator, both sides should use `text`. |

### 4.3 Activated ability fields

| Canonical | JS | Godot | Decision |
|---|---|---|---|
| cost | `cost: {tap: true, mana: {...}, sacrifice: ...}` | `cost: {tap, mana}` | Adopt JS shape (supports sacrifice/discard/etc. as additional keys). Document the full set in protocol doc. |
| effects | `effects` | `effects` | ✅ aligned. |

### 4.4 Effect descriptor fields

Effect descriptors are dicts under `effects` / `on_cast_effects`. Canonical fields:

| Canonical | JS | Godot | Decision |
|---|---|---|---|
| effect kind | `kind` | `kind` | ✅ aligned. (values in §4.6) |
| target filter | `target: "self"|"creature"|"player"|"any"|...` | `target: "chosen"|"controller"|"opponent"|...` | **Significant drift.** See §4.7. |
| target slot index (multi-target spells) | `targetSlot: N` | (not yet supported) | Adopt JS form as `target_slot` / `targetSlot`. Add to Godot when multi-target spells land. |
| numeric amount | `amount` (damage, draw, gainLife) | `amount` (damage, gain_life) | ✅ aligned. |
| stat delta (pump/weaken) | `power`, `toughness` | `amount_power`, `amount_toughness` | Recommend `power`/`power`, `toughness`/`toughness` — shorter, matches JS, and these never appear next to absolute stats inside an effect dict so collision risk is zero. Rename Godot. |
| duration (eot / permanent) | `duration: "eot"` (or `permanentEot` flag on parent) | `duration: "eot"` | ✅ aligned in intent. |
| severity (remove-creature ladder) | `severity: 1..4` (tap/bounce/destroy/exile) | (not yet) | Adopt JS form. |

### 4.5 Event kinds

The JS uses camelCase full words. Godot uses snake_case abbreviations. Both should converge on **full descriptive names**, snake_case in Godot, camelCase in JS:

| Canonical | JS (current) | Godot (current) | Decision |
|---|---|---|---|
| card enters battlefield | `cardEntersBattlefield` | `card_etb` | Rename Godot to `card_enters_battlefield`. Abbreviation buys nothing and breaks the conversion rule. |
| card dies | `cardDies` | `card_dies` | ✅ aligned in concept. JS slot stays `cardDies`. |
| card leaves battlefield (non-death) | `cardLeavesBattlefield` | (not yet) | Add to Godot as `card_leaves_battlefield`. |
| creature attacks | `attacks` | (not yet) | Add `attacks` / `attacks`. (Single word is fine; both languages accept it identically.) |
| life gained | `lifeGained` | (not yet) | Add `life_gained` / `lifeGained`. |
| spell cast | `spellCast` | (not yet) | Add `spell_cast` / `spellCast`. |
| card discarded | (not yet) | `card_discarded` | Add `cardDiscarded` to JS. |

### 4.6 Effect kinds

The JS catalog (~40 kinds) is the larger one and should remain authoritative. Godot has 5 implemented (`damage`, `add_mana`, `pump`, `gain_life`, `counter_spell`). When porting more, use the JS name **with case-converted spelling**. Concrete reconciliation needed:

| Canonical concept | JS kind | Godot kind | Decision |
|---|---|---|---|
| counter a spell | `counter` | `counter_spell` | Rename Godot to `counter`. JS form is more reusable (could counter abilities in future). |
| add mana | `addMana` | `add_mana` | ✅ aligned by the case rule. |
| add counter | `addCounter` | (not yet) | Add to Godot as `add_counter`. Distinct from `counter`. |
| pump | `pump` | `pump` | ✅ aligned. |
| damage | `damage` | `damage` | ✅ aligned. |
| gain life | `gainLife` | `gain_life` | ✅ aligned by the case rule. |

The other ~35 JS effect kinds (`removeCreature`, `flicker`, `steal`, `destroyAndStickerSlot`, `symmetricize`, `embargo`, `bleach`, `bargainStickerSelf`, …) will land in Godot in phased order. When they do, use the case-converted spelling and **do not rename** unless the new name is clearly better.

There's one JS bug to fix during this pass: `gainControl` is defined twice in `engine.js` (~L2123 and ~L2177); the second overwrites the first. Delete the dead definition before standardizing.

### 4.7 Target filters

This is the biggest semantic drift. The two engines mean overlapping but non-identical things by their target strings.

**Concept categories:**

1. **Selector at cast time** — what kind of object the spell or ability can be aimed at. Examples: any creature, any creature-or-player, only opponent's creatures, only your creatures, a spell on the stack, a permanent in any zone, a card in a graveyard, no target.
2. **Implicit target at resolve time** — the effect doesn't ask the caster to pick; it always hits a specific party (the controller, the opponent, the source itself, all permanents matching a filter).

JS conflates these into one `target` string. Godot's `"chosen"` / `"controller"` / `"opponent"` is closer to the right split but doesn't yet cover all the JS filters.

**Decision:** introduce a two-field shape:

- `target_mode` / `targetMode`: `"chosen"` | `"controller"` | `"opponent"` | `"self"` | `"all_matching"` | `"none"`
- `target_filter` / `targetFilter`: present when `target_mode` is `"chosen"` or `"all_matching"`. Values: `"creature"`, `"player"`, `"creature_or_player"`, `"permanent"`, `"spell"`, `"your_creature"`, `"opp_creature"`, `"graveyard_creature"`, etc. (full enumeration lives in the protocol doc, §6.)

That migration is a real refactor on both sides. It can land incrementally — see §6.

### 4.8 State / runtime fields

| Canonical | JS | Godot | Decision |
|---|---|---|---|
| player side keys | `"you"`, `"opp"` | `"you"`, `"opp"` | ✅ aligned. |
| active player | `activePlayer: "you"|"opp"` | `active_player_key: String` | Rename Godot to `active_player`. Drop the `_key` suffix — `"you"`/`"opp"` are obviously keys; the suffix is noise. |
| priority holder | `priorityHolder` | `priority_player_key` | Same logic — rename Godot to `priority_player`. |
| instance ID (on card) | `iid` (on card object) | `instance_id` (on CardInstance) | Recommend `iid`/`iid`. Two letters, universally understood, already on 258 JSONs' worth of references. Rename Godot. |
| owner | `owner` (on card) | `owner_key` (on CardInstance) | Rename Godot to `owner`. |
| controller | (looked up dynamically in JS) | `controller_key` | Rename Godot to `controller`. |
| land already played this turn | `landPlayedThisTurn` | `land_played_this_turn` | ✅ aligned by case rule. |
| life lost this turn | `lifeLostThisTurn` | `life_lost_this_turn` | ✅ aligned by case rule. |
| stack | `stack` | `stack` | ✅ aligned. |
| pending triggers queue | `pendingTriggers` | `pending_triggers` | ✅ aligned by case rule. |

### 4.9 Phase names

The JS engine collapses UNTAP+UPKEEP+DRAW into a single UNTAP entry. Godot has all three. Decision: **adopt the full set on both sides.** The JS upkeep step matters once we have upkeep-triggered abilities (it's coming with the next card pool expansion). Adding them now costs nothing.

Canonical phase enum:

```
UNTAP, UPKEEP, DRAW, MAIN1, COMBAT_ATTACK, COMBAT_BLOCK, COMBAT_DAMAGE, MAIN2, END, CLEANUP
```

JS migration: add UPKEEP and DRAW as explicit phases that the engine ticks through.

### 4.10 Predicate IDs

JS uses camelCase predicate IDs (`youGainLife`, `thisAttacksAfterOppLifeLoss`, `anotherCreatureYouEntersOfSubtype`). Godot uses snake_case (`opp_lost_life_this_turn`). These should follow the case-conversion rule:

- JS: `oppLostLifeThisTurn`
- Godot: `opp_lost_life_this_turn`

JS currently lacks the exact `oppLostLifeThisTurn` because it expresses the same concept inline via closures on the event object. Adopt the Godot-style named predicate **as the canonical form**, since it's data-addressable and the JS scar from `lifeLostThisTurn` closures (CLAUDE.md, "Patterns to NOT replicate") is exactly the argument for moving away from inline closures.

## 5. Shared / rebuilt code

### 5.1 Card JSON as the lingua franca

The single highest-leverage move in this whole plan.

**Today**: 258 cards live as `reference/html-proto/cards/<tplId>/card.json`. The Godot port has 23 cards re-implemented as `.tres` files.

**Target**: the Godot port reads `reference/html-proto/cards/<tplId>/card.json` directly (or a copy under `cards/data/`). The `.tres` form is retained only for tests that need a specific stub.

**What it requires:**

1. The card JSON schema is canonical (§4.1).
2. The Godot side has a `JsonCardLoader` that converts a JSON dict into a `CardResource` (and subclass). The conversion is purely mechanical key renames + case conversion.
3. Every effect kind referenced by the JSONs has a handler in Godot's `Effects.HANDLERS`. Cards whose effects aren't yet implemented are marked as "unsupported" at load time and excluded from the playable pool (not silently broken).
4. Every predicate ID referenced is registered in Godot's `Predicates`. Same fallback policy.
5. Every event kind referenced is fired by Godot's engine.

The boot-time validator at `engine/predicates/predicates.gd::validate_all_card_predicates()` already does this for predicates. Extend it to cover effect kinds and event kinds. Print a single line summary at boot: "Loaded 258 cards; 87 fully supported, 171 awaiting <list of missing handlers>."

That makes Godot card-pool growth a **prioritization problem** (which JS card to make playable next) rather than a porting problem (translating field names).

### 5.2 Predicate library as shared data

Today: the predicate registry is hand-coded in `triggers.js` (JS) and `predicates.gd` (Godot). They drift independently.

**Idea**: extract the predicate catalog to a shared YAML or JSON file at `shared/predicates.yaml`, listing each predicate by ID plus a short English description plus its event whitelist. The code on each side implements the body, but the catalog is shared. Boot-time validators on both sides confirm every predicate ID in the catalog has an implementation.

This is lower-priority than the card JSON loader; deferred until both sides have ~20+ predicates and drift is observable.

### 5.3 Effect kind catalog as shared documentation

Same idea, lower stakes. A `shared/effects.md` table listing every effect kind, its parameter schema, and which engine implements it. New effects go in the doc first, then in code. Prevents two sides from implementing different shapes for the same kind.

### 5.4 Phase machine

The Godot `PhaseMachine` (`engine/phase_machine.gd`) is small and clean. The JS phase advancement is scattered inside `engine.js`'s `step()`. After canonical phase names (§4.9), consider extracting a JS `PhaseMachine` module that mirrors the Godot one. Not urgent but would tighten the parallel.

### 5.5 Things to NOT share

- **Rendering.** JS DOM rendering and Godot's scene tree have nothing in common. Don't try.
- **Settings persistence.** JS uses `localStorage`; Godot uses `user://` resource files. Different storage, different schemas.
- **AI implementation details.** The AI decision *order* should be the same (trigger target → block → attack → instant → main → pass). The implementation primitives (e.g., `simulate_combat` doing a deep state clone) are language-specific. Don't share code; do share the decision-table structure as a doc.
- **UI input handling.** Click-to-cast vs hover-to-cast vs drag-vs-tap is platform-specific.

## 6. Concrete harmonization actions

Ordered roughly by ROI / risk ratio.

### Pass 1 — naming aligned, no behavior change (Godot side)

Pure renames. Tests should pass before and after. Each is one commit.

**Decided / shipped:**

- `condition_predicate` → `cond_id` inside trigger dicts ✓ (Pass 1a)
- `amount_power` / `amount_toughness` → `power` / `toughness` inside pump effect dicts ✓ (Pass 1a)
- `counter_spell` effect kind → `counter` ✓ (Pass 1b)
- `card_etb` event kind → `card_enters_battlefield` ✓ (Pass 1c)
- `oracle_text` → `text` on `CardResource` ✓ (Pass 1d)
- `triggered_abilities` → `triggers` on `CardResource` ✓ (Pass 1d)

**Decided NOT to do (revised from earlier plan):**

- `display_name` → `card_name` on `CardResource`: **rejected.** The card-framework's
  `Card.card_name` field (addons/card-framework/card.gd:28) is semantically a
  card *identifier* (it's set to `card_id` in tres_card_factory.gd:39 and
  card-framework's json_card_factory uses `card_name` as the JSON filename
  parameter). Aliasing our display-name field to the same identifier would
  create exactly the confusion the rename was supposed to prevent. Keep
  `display_name` on Godot. The cross-engine wire format can use whatever
  the JsonCardLoader (Pass 4) decides — current proposal: `name` on the wire
  (matches JS today, zero JS migration), translated to `display_name` at
  ingest by JsonCardLoader.
- `card_id` → `tpl_id`: deferred (not strictly needed for cross-engine work;
  the locked decision in the gating questions was to keep `card_id` on the
  wire, which means Godot stays as-is).
- `instance_id` → `iid`, `owner_key` → `owner`, `controller_key` → `controller`,
  `active_player_key` → `active_player`, `priority_player_key` → `priority_player`:
  deferred. These are Godot-internal renames that don't affect wire format
  or cross-engine vocabulary. `active_player`/`priority_player` would
  collide with existing methods on `EngineState`. Address as a separate pass
  if/when the user explicitly wants them; they don't unblock anything.
- `mana_cost` → `cost`, `front_image_path` → `art`, `activated_abilities` →
  `abilities`: deferred. Same logic — internal-only aesthetic.
- Add `UPKEEP`/`DRAW` phases: Godot already has them. JS side gets them in Pass 2.

### Pass 2 — naming aligned, no behavior change (JS side)

- `effects` → `on_cast_effects` in card JSONs (258 cards). Mechanical sed-then-test. Same for the engine's spell-resolution reader.
- `type: "Instant"` → `card_types: ["instant"]` in card JSONs. Same.
- `sub: "Human Warrior"` → `subtypes: ["human", "warrior"]`. Same.
- Drop redundant `color`/`colors` fields from JSON, compute on load.
- Add UPKEEP and DRAW phases to `engine.js::step()`.
- Migrate inline closure predicates to named entries in `TRIGGER_CONDITIONS` (e.g., add explicit `oppLostLifeThisTurn` entry instead of closing over `G[them].lifeLostThisTurn`).

The card JSON migration is the riskiest single change in Pass 2 — touches all 258 files and the load path. Worth scripting and running against the regression suite (`node tests/run_all.js`).

### Pass 3 — protocol doc

Write `docs/PROTOCOL.md` that codifies:

- The canonical card JSON schema (§4.1–§4.3) as a referenceable JSONSchema or hand-written spec.
- The full event-kind catalog (§4.5) with required payload fields.
- The full effect-kind catalog (§4.6) with parameter shapes.
- The target filter / target mode taxonomy (§4.7).
- The predicate ID list with English descriptions.
- The phase enum.

Goal: a new dev should be able to add an effect kind by reading this doc + grep'ing both engines for an existing kind to copy from.

### Pass 4 — Godot JSON card loader

- Build `JsonCardLoader` (Godot side): reads `cards/data/<tplId>.json` (or symlinks to `reference/html-proto/cards/<tplId>/card.json`), produces `CardResource`.
- Implement boot-time supportability scan: print which cards are fully playable vs missing handlers/predicates/events.
- Migrate the 23 existing `.tres` cards to JSON form; delete the `.tres` files (or keep one or two as test fixtures only).

### Pass 5 — target-mode split

- Implement the two-field `target_mode` / `target_filter` shape (§4.7) on both sides.
- Migrate existing effect descriptors to the new shape (script the conversion: `"target": "self"` → `"target_mode": "self"`, `"target": "any"` → `"target_mode": "chosen", "target_filter": "creature_or_player"`).
- Update target-pick UI and AI scoring to read the new shape.

### Pass 6 — port the next effect-kind tranche

With JSON loading working, decide which JS effects to implement next in Godot based on card-pool coverage. Likely: `addCounter`, `removeCreature` (with severity ladder), `gainLife` events firing, `draw`, `discard`, `flicker`. Each lands with a passing smoke test.

## 7. Best practices going forward

These are the rules that prevent the drift from coming back.

1. **New cards are authored as JSON in the canonical schema (§4.1).** No exceptions. The schema is `reference/html-proto/cards/<tplId>/card.json` and (after Pass 4) the Godot port reads the same file.
2. **New effect kinds are added to `docs/PROTOCOL.md` BEFORE either implementation.** PR adding an effect kind touches the doc in the same diff.
3. **New events are added to the protocol doc BEFORE either engine fires them.** Document the event kind name + payload shape.
4. **New predicates are named per the case-conversion rule.** `oppLostLifeThisTurn` ⇔ `opp_lost_life_this_turn`. If you find yourself wanting an inline closure, write a named predicate instead.
5. **Variable names follow the canonical table (§4).** Adding a new state field? Look up the convention. PRs that introduce drift get bounced.
6. **Anti-pattern enforcement.** The four rules in `/CLAUDE.md` ("Patterns to NOT replicate") are protocol-level:
   - No autoload reach from predicates/effects.
   - No depth caps on trigger draining.
   - No dynamically-attached dict fields on instances — use typed properties.
   - All state mutation through `execute_action`.
7. **Cards added on the JS side flow into the Godot pool automatically** (Pass 4). The "supportable" boot scan tells the Godot dev which engine surface is missing.
8. **Cards specific to one engine are flagged.** If a card requires an effect kind only one engine implements, mark the JSON with `"engines": ["html-proto"]` so the Godot loader skips it without warning.
9. **Wire-format changes go through this doc.** Adding a top-level field to the card JSON? Update §4.1 in the same PR.

## 8. Phased rollout

The passes above are roughly sequential. A reasonable cadence:

| Pass | Effort | Risk | Notes |
|---|---|---|---|
| 1 (Godot renames) | ~1 day | low | Self-contained; tests must pass before/after |
| 2 (JS renames) | ~1-2 days | medium | 258 card JSONs touched; script + test |
| 3 (Protocol doc) | ~half-day | none | Pure writing; reviews surface gaps |
| 4 (JSON loader) | ~2-3 days | medium | Real new code; high payoff |
| 5 (Target-mode split) | ~1-2 days | medium | Touches AI scoring and target-pick UI |
| 6 (Effect porting) | ongoing | per-card | Open-ended; driven by card pool priorities |

Pass 1 can land independently of all the others. Pass 2 should land before Pass 3 codifies the names. Pass 3 should land before Pass 4 — the loader keys against the protocol doc. Passes 5 and 6 are independent.

## 9. Risks & non-goals

**Risks:**

- **Pass 2 touches 258 JSON files.** If the migration script is wrong, manual repair is painful. Mitigate: do it as one commit per field-rename, run `node tests/run_all.js` after each, and bisect easily if a regression shows up.
- **Renaming `tpl_id` on the Godot side touches every `.tres` file.** Same mitigation: one commit, regenerate, run smoke tests.
- **Some JS predicates close over state in ways that don't map cleanly to a named predicate** (e.g., predicates that need `G` to look at other players' states). For these, the canonical form should pass full state into the predicate function (as the Godot signature already does). JS migration converts the closure to take state explicitly.
- **The JS regression suite (`tests/run_all.js`) doesn't cover all UI paths.** A wire-format change can sneak through. Mitigate: manual play-test after each pass, focused on the affected card types (instants if `target` changed, creatures if `triggers` changed).

**Non-goals:**

- We are NOT trying to make the two codebases share a runtime, or use a transpiler, or generate one from the other. The languages and runtimes stay distinct.
- We are NOT trying to make the two AIs behave identically. Both should make MTG-sensible decisions; tactical micro-differences are fine.
- We are NOT trying to share UI/rendering code. The card art pipeline is shared (assets at `/assets/`), but display layers are independent.
- We are NOT trying to enforce conventions through codegen or schema validation in the runtime. Boot-time validators (already present on Godot for predicates) are enough.

## 10. Open questions for the user

These need decisions before the protocol doc (Pass 3) freezes:

1. **`tpl_id` vs `card_id` as the canonical name** — `tpl_id` recommended (shorter, distinct from `iid`, already on 258 cards). Confirm?
2. **`name` vs `display_name`** — `name` recommended. Confirm?
3. **`text` vs `oracle_text`** — `text` recommended. Confirm?
4. **`triggers` vs `triggered_abilities`** — `triggers` recommended. Confirm?
5. **Effect target shape** — do we like the two-field `target_mode` + `target_filter` split (§4.7), or push for a richer descriptor object like `{mode: "chosen", filter: "creature"}`?
6. **`iid` vs `instance_id`** — `iid` recommended (universally short, already on JS). Confirm?
7. **`color` / `colors` as redundant fields** — drop from JSON and compute? Or keep for fast filtering during draft pack generation?
8. **Should we maintain "engine compatibility" tags on cards** (e.g., `"engines": ["html-proto"]`) once the Godot loader exists? Or just let the boot scan report unsupported cards by missing-kind enumeration?

A discussion pass on these eight questions is the gate to starting Pass 2.
