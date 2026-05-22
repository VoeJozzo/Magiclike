# Standardization Handoff — for the Rules-Standardization Session

**Target audience.** A second Claude instance picking up rules-standardization work that turned out to overlap with the data/structural standardization I did on `claude/standardization-BBD8O`.

**Author.** Claude session running on `claude/standardization-BBD8O`, May 21–28, 2026.

**Purpose.** Give you enough context to (a) decide if/how to integrate this branch's work with yours, (b) replicate any of it cleanly, and (c) make informed calls about how your rules work hooks into the data layer this branch already touched. Joe (the user) realized late that "rules" and "data" aren't sibling projects — they're the same project at different layers.

---

## Table of contents

1. [The branch, in 30 seconds](#1-the-branch-in-30-seconds)
2. [Where to read first](#2-where-to-read-first)
3. [What shipped — pass by pass](#3-what-shipped--pass-by-pass)
4. [Decisions we made (and reversed) during work](#4-decisions-we-made-and-reversed-during-work)
5. [Outstanding work: Pass 5 reframe](#5-outstanding-work-pass-5-reframe)
6. [Where your branch and mine overlap](#6-where-your-branch-and-mine-overlap)
7. [Why rules and data are the same project](#7-why-rules-and-data-are-the-same-project)
8. [Patterns, gotchas, and anti-patterns](#8-patterns-gotchas-and-anti-patterns)
9. [Test infrastructure](#9-test-infrastructure)
10. [Open questions you may run into](#10-open-questions-you-may-run-into)
11. [How to pick up Pass 5 cleanly](#11-how-to-pick-up-pass-5-cleanly)

---

## 1. The branch, in 30 seconds

`claude/standardization-BBD8O` is 10 commits ahead of `dev`. It does **cross-engine vocabulary alignment** between the JS html-proto and the Godot port. The thesis is in `docs/STANDARDIZATION-PLAN.md` (committed) and the canonical wire-format spec is in `docs/PROTOCOL.md` (also committed).

```
39e6e1c  Commit Godot-generated .import metadata for assets and reference cards
3da32ac  Docs: update CLAUDE.md and STANDARDIZATION-PLAN.md for Pass 1-4 shipping
38e61c0  Pass 4: add JsonCardLoader + boot supportability scan
9a0ca77  Pass 3: add docs/PROTOCOL.md — canonical cross-engine spec
1a30225  Pass 2: migrate 258 card.json files to canonical snake_case wire format
b95c828  Pass 1d: rename oracle_text→text, triggered_abilities→triggers
60960bd  Pass 1c: rename card_etb event kind to card_enters_battlefield
f52dc95  Pass 1b: rename counter_spell effect kind to counter
f4dfd9b  Pass 1a: rename trigger and pump dict keys for cross-engine vocab alignment
e07e492  Add cross-engine standardization plan (docs/STANDARDIZATION-PLAN.md, 360 lines)
```

**Headline result.** The Godot autoload boot now prints:

```
[JsonCardLoader] Loaded 258 cards; 109 fully supported, 149 awaiting handlers
[JsonCardLoader] Missing effect kinds (count): remove_creature=24, draw=17, discard=11, grant_keyword=10, pump_all_yours=7, add_counter=7, ...
[JsonCardLoader] Missing event kinds (count): attacks=20, spell_cast=7, life_gained=1, ...
[JsonCardLoader] Missing predicate ids (count): thisEnters=42, thisDies=16, thisAttacks=16, ...
```

This converts "which JS card should I port next?" from open-ended research into a sorted prioritization list.

**Verification at last push.** All 10 Godot phase smoke tests pass + new `test_json_card_loader.tscn` (19 assertions) + all 482 JS regression assertions pass + 100-game JS self-play harness runs clean.

---

## 2. Where to read first

If you want to understand this branch deeply, read in this order:

| File | Purpose | Length |
|---|---|---|
| **`docs/STANDARDIZATION-PLAN.md`** | Top-level thesis. §6 lists what shipped + what was deferred for each pass. §10 records the eight gating decisions and their resolutions. | 397 lines |
| **`docs/PROTOCOL.md`** | Canonical wire-format spec. Card JSON shape, effect-kind catalog (§3.2), event-kind catalog (§3.3), predicate ID list (§3.4), target taxonomy (§3.5), phase enum (§3.6), authoring rules (§8). | 339 lines |
| **`engine/json_card_loader.gd`** | The reference implementation of the ingest boundary. Translation tables (`_EFFECT_KIND_REMAP`, `_EVENT_KIND_REMAP`, `_KEYWORD_REMAP`, `_TARGET_FILTER_REMAP`) document the camelCase↔snake_case mapping concretely. Boot supportability scan is here too. | 301 lines |
| **`reference/html-proto/js/cards.js`** | The JS-side counterpart — `ingestCard()` does the inverse rebinding for the JS engine. | function ~70 lines |
| **`/CLAUDE.md`** | Project-level context. Includes the "Patterns to NOT replicate" section that this branch enforces. | 124 lines |

If you want to look at the other branch's docs (the one this handoff is for), they live on `origin/claude/documentation-and-mapping-wa8Pd`:

| File | What it covers |
|---|---|
| `docs/ARCHITECTURE.md` | Module map across both engines. |
| `docs/SPEC.md` | Data contracts (actions, target descriptors, CardResource schema). **Overlaps with `docs/PROTOCOL.md` from this branch** — see §6 below. |
| `docs/REFACTOR-NOTES.md` | Prioritized structural debt. Some items intersect with Pass 5 work. |
| `docs/RULES.md` | Canonical game spec in plain English. The rules-standardization work proper. |

---

## 3. What shipped — pass by pass

### Pass 1: Godot-side renames (4 commits)

**Pass 1a (`f4dfd9b`).** Trigger and pump dict keys.

- Trigger dict key `condition_predicate` → `cond_id`. Touched `engine/predicates/predicates.gd` (header + reader + error message), `engine/engine.gd:1334`, and 2 `.tres` files (`bloodlust_berserker`, `pyromaniac`).
- Pump effect dict keys `amount_power` / `amount_toughness` → `power` / `toughness`. Touched `engine/effects/pump.gd` (header + readers), `engine/ai/scoring.gd:53`, and `giant_growth.tres`.

Naming alignment with `js/triggers.js`'s `condId` and `js/engine.js`'s `pump` effect's `power`/`toughness` params.

**Pass 1b (`f52dc95`).** Effect kind `counter_spell` → `counter`.

- Renamed `engine/effects/counter_spell.gd` → `engine/effects/counter.gd` (also the `.uid` sidecar via `git mv`).
- Updated all callers: `engine/effects/effects.gd` HANDLERS dict, `engine/ai/scoring.gd:48` match, `engine/engine.gd:1261` comment, `counterspell.tres` kind value, `tests/test_phase4_5c.gd:7` comment.

Adopted the shorter JS form (`EFFECTS.counter` in `js/engine.js`).

**Pass 1c (`60960bd`).** Event kind `card_etb` → `card_enters_battlefield`.

- `engine/engine.gd:573, 701` (the two fire sites).
- `pyromaniac.tres` (the only card listening for this event).
- `tests/test_phase4_5b.gd:110` (test fixture).

The abbreviation buys nothing and breaks the JS↔Godot camelCase↔snake_case conversion rule.

**Pass 1d (`b95c828`).** CardResource fields `oracle_text` → `text`, `triggered_abilities` → `triggers`.

- Renamed both `@export` fields in `data/card_resource.gd`.
- Updated readers: `engine/engine.gd` (3 sites + 1 comment), `engine/predicates/predicates.gd:50`, `engine/ai/scoring.gd:54`, `scenes/card.gd:193`, `scenes/game/game_board.gd:477, 492, 493`.
- Bulk-renamed `oracle_text =` → `text =` and `triggered_abilities =` → `triggers =` in all 31 `.tres` files via sed.

**Method names left alone.** `_trigger_oracle_text` and `_spell_oracle_text` in `game_board.gd` describe a UI concept ("oracle text" = card descriptive text in MTG parlance), not a field reference. Method renames are aesthetic.

### Pass 2: JS card.json migration (`1a30225`)

Migrated all 258 card JSONs to canonical snake_case structural keys via `/tmp/migrate_card_json.js` (one-shot script, not committed):

- `tplId` → `card_id`
- `condId` → `cond_id` (recursively inside `triggers[]`)
- Dropped `color` / `colors` — they're cost-derived. Pre-migration audit verified all 258 cards had cost-derived stored colors (zero mismatches), so the recompute is lossless.

The script also reordered keys alphabetically (with `card_id` first) to keep diffs readable.

**JS-side plumbing:**

- `js/cards.js` gained `ingestCard()` — the ingest boundary. Rebinds `card_id` → `tplId`, walks `triggers[]` rebinding `cond_id` → `condId`, recomputes `color` / `colors` from cost. `loadCards()` (the browser path) calls it. ~70 lines.
- `tests/_setup.js` `loadCardsFromDisk()` pipes each JSON through `global.ingestCard` so test code sees the same shape as the browser. Added `ingestCard` to the `EXPOSED` list.

**JS engine internals unchanged.** Engine still uses `tplId`, `condId`, `card.color`, `card.colors`. No 350-call-site source refactor — that was explicitly de-scoped (see §4 reversal of Tier 3).

VERSION v1.0.188 → v1.0.189 per `reference/html-proto/CLAUDE.md`'s push contract.

### Pass 3: Protocol doc (`9a0ca77`)

`docs/PROTOCOL.md` is the canonical cross-engine wire-format spec. Key sections:

- **§1 Tier model** — concept layer / wire layer / idiom layer. Wire is canonical, idiom is per-engine, both translate at the ingest boundary.
- **§2 Card JSON schema** — every top-level field with type, requiredness, semantics. Includes the loader contract that says both engines must validate effect/event/predicate references at boot.
- **§3.1 Keywords** — the shared keyword set, with underscored ⇔ camelCased forms.
- **§3.2 Effect kinds** — full catalog (~40 from the JS side), each with params and "implemented in" status. JS has all of them; Godot has 5 today (`damage`, `pump`, `gain_life`, `add_mana`, `counter`).
- **§3.3 Event kinds** — wire form, JS internal, Godot internal, payload shape.
- **§3.4 Predicate ids** — currently camelCase ids registered in `js/triggers.js::TRIGGER_CONDITIONS` and snake_case ids in `engine/predicates/predicates.gd::_PRED_NAMES`. Notes the `self_only: true` flag pattern that Godot adopted to obsolete the JS `this*` predicates.
- **§3.5 Target shapes** — today's single `target` string and the planned Pass 5 split into `target_mode` + `target_filter`. Migration table included.
- **§3.6 Phase enum** — Godot has all 10, JS collapses UNTAP+UPKEEP+DRAW into UNTAP.
- **§8 Authoring rules** — six binding rules. New cards as JSON, new effect/event/predicate kinds get added to PROTOCOL.md in the same PR, predicate calling convention is `(state, source, event)`, all mutations through `execute_action`, no compat shims, boot-time validators.

### Pass 4: Godot JsonCardLoader + supportability scan (`38e61c0`)

**`engine/json_card_loader.gd`** (301 lines): reads `res://reference/html-proto/cards/<folder>/card.json` and materializes them as CardResource subclass instances.

- Resource subclass selection by JSON `type` field: `Creature`→`CreatureResource`, `Land`→`LandResource`, `Instant`/`Sorcery`→`SpellResource`, anything else (`Artifact`, `Enchantment`)→base `CardResource`.
- Translation tables at top of file: `_EFFECT_KIND_REMAP`, `_EVENT_KIND_REMAP`, `_KEYWORD_REMAP`, `_TARGET_FILTER_REMAP`. These are the **single point of camelCase↔snake_case translation** for the Godot ingest path. **If you need to look up what JS calls something or what Godot calls something, these tables are the rosetta stone.**
- `_USER_PICKED_TARGETS` — the list of target strings that mean "caster picks at cast time" (used to set `SpellResource.requires_target`).
- `_FIRED_EVENT_KINDS` — events the Godot engine actually fires today. Note this is shorter than the registered-event set; a card listening for `attacks` won't fire because Godot doesn't yet emit that event from combat. Grow this list as the engine learns to fire new events.

**Supportability scan.** `engine/engine.gd._ready()` calls `JsonCardLoader.load_all()` then `JsonCardLoader.supportability_report(cards, true)`. The report prints one summary line plus per-category breakdowns sorted by frequency. Env var `MAGICLIKE_SKIP_SUPPORTABILITY_SCAN=1` disables it for tight test loops.

**Bug fix in same commit.** `engine.gd._do_discard_card` was firing the discard event with key `name` instead of `kind`, meaning no trigger ever matched. Fixed to `kind: "card_discarded"`. This was latent — no current card listens for discarded events, but the bug would have bitten the next person to write one.

**New test.** `tests/test_json_card_loader.tscn` — 19 assertions covering single-card load (bolt, salve, whiteKnight, holyZealot, forest, cityOfBrass), the full 258-card `load_all`, and supportability sanity (>0 supported, >100 unsupported, `remove_creature` present in missing list).

### Pass 5: doc updates + import file hygiene (`3da32ac`, `39e6e1c`)

- `/CLAUDE.md` file-tree adds `engine/json_card_loader.gd`; "Patterns to NOT replicate" notes still hold; the boot-validator note mentions the new supportability scan.
- `docs/STANDARDIZATION-PLAN.md` header marks Pass 1–4 as shipped; §6 details what each pass delivered vs deliberately deferred; §10 reframes the eight gating questions as resolved decisions.
- Committed 104 Godot-auto-generated `.import` files (sidecars for `assets/fonts/`, `assets/mana/`, `reference/html-proto/cards/*/art.png`) that had been missed from previous commits — these are needed for asset reproducibility, not noise.

---

## 4. Decisions we made (and reversed) during work

Joe and I had a long planning chat before the work and a follow-up chat after the work. Several decisions evolved. Read these before you make calls about what to keep / change:

### Tier 1 / 2 / 3 distinction (early in the planning chat)

I framed three possible levels of harmonization:

- **Tier 1** — Just the concept layer (docs only). Shared vocabulary in human discussion.
- **Tier 2** — Wire-format harmonization. Card JSON keys are snake_case on disk; each engine rebinds at ingest. Internal idioms stay per-engine.
- **Tier 3** — Full source-level alignment. JS source uses snake_case throughout (~16k LOC of variable renames).

We picked **Tier 2.** Tier 3 was rejected because Godot's stdlib is rigidly snake_case (every `get_node`, every signal connect) — GDScript can't reasonably move. The only Tier 3 option was renaming JS, which delivers visual parallelism for side-by-side reading but **does NOT unlock any code sharing** because the language gap (duck-typed JS with IIFEs/closures/DOM vs gradually-typed GDScript with RefCounted/signals/scene tree) is the wall, not the identifier convention.

### Eight gating decisions (resolved before Pass 1)

Recorded in `docs/STANDARDIZATION-PLAN.md` §10:

1. **Template-ID** → wire `card_id`, JS-internal `tplId` (no rename, ingest rebind), Godot `card_id`.
2. **Display-name** → wire `name`, JS-internal `name`, Godot `display_name`. **ORIGINALLY** we locked `card_name` to match `Card.card_name` from the card-framework. **REVERSED MID-WORK** when I checked and found the framework's field is semantically an *identifier* (it gets set to `card_id` in `scenes/tres_card_factory.gd:39`), not a display name. Aliasing would create exactly the confusion the rename was supposed to prevent. **Kept `display_name` on Godot. JsonCardLoader maps `name` → `display_name` at ingest.**
3. **Oracle-text** → `text` (both engines).
4. **Trigger collection** → `triggers` (both engines).
5. **Target shape** → two-field `target_mode` + `target_filter`. **Deferred to Pass 5.** Today's single `target` string keeps working.
6. **Instance ID** → Godot `instance_id`, JS `iid`. Runtime-only field, no wire impact.
7. **`color` / `colors`** → DROP from JSON; recomputed at ingest by both engines.
8. **Engine-compatibility tags** → REJECTED. The Godot boot scan reports unsupported cards by missing-kind enumeration; no per-card opt-out tags needed.

### Reversal: dispatch-key surface IS worth aligning (late in follow-up chat)

In the original plan I lumped "rename JS effect-kind dispatch keys to snake_case" into Tier 3 and rejected it. Joe pushed back during the follow-up chat. I revised:

- **General JS variable rename (e.g., `tplId` → `card_id` everywhere)** — still rejected. Aesthetic-only, unlocks nothing.
- **JS dispatch-key surface (`EFFECTS.gainLife` → `EFFECTS.gain_life`, `TRIGGER_CONDITIONS.youGainLife` → `TRIGGER_CONDITIONS.you_gain_life`)** — **worth doing** as part of Pass 5. ~150 call sites, mechanical, delivers a uniformly snake_case wire format where both engines dispatch on the same strings without any `_EFFECT_KIND_REMAP` table.

The argument was: if the JSON is supposed to be the single source of truth, then `"kind": "gainLife"` in the JSON is a wart. Either JS dispatches natively on the snake_case form, or we keep a translation table forever. Joe sees the wart and wants it gone.

### Reversal: ".tres → JSON" is the headline next move (also follow-up chat)

The deepest realization from the follow-up chat: Joe priced the `.tres` → JSON storage migration as "nice to have eventually" when I deferred it. After we walked through what it actually delivers, his framing was: **"editing `bolt/card.json` once should update Lightning Bolt in both engines."** That's the user-visible payoff of single-source-of-truth — and the JsonCardLoader I built in Pass 4 is the *mechanism*, not the *delivery*.

Joe asked the sharpest question of the chat: **"Did I make a mistake going from JSON to `.tres`?"** My honest answer: no, the May 17 migration solved a real within-Godot duplication problem (programmatic CardResource + duplicate `cards/data/*.json` for the card-framework's JsonCardFactory). It was a local optimum that didn't anticipate cross-engine sharing being prioritized this soon. The cost of *reversing* it now is bounded — see Pass 5 below.

### Reframe: JSON shape = Godot's CardResource shape, not a "compromise canonical"

Last point from the follow-up chat. Originally Pass 5 was scoped as "split target into target_mode + target_filter." After the back-and-forth, the bigger move emerged: **make the JSON wire format literally Godot's CardResource shape.** Not a compromise canonical, just Godot-native. Then:

- Godot reads JSON natively — `JsonCardLoader` becomes trivial (no remap tables).
- JS pays the inverse cost via `ingestCard` rebinder (Option A) — about 100 lines mirroring what Godot currently does.
- The 23 hand-curated `.tres` cards get expressed as JSON entries in the html-proto manifest.
- The `.tres` files get deleted (or kept as test fixtures).
- This is the real "Stage 3" to the May 17 work: Stage 1 was programmatic → `.tres`; Stage 2 was killing duplicate `cards/data/json`; Stage 3 is `.tres` → canonical JSON.

This is **what Pass 5 actually is**. See §5.

---

## 5. Outstanding work: Pass 5 reframe

### Scope

**Make the JSON wire format literally Godot's CardResource shape, then wire Godot's playable pool to JSON.**

Five concrete sub-tasks:

#### 5.1 Migrate 258 card JSONs to Godot-native field/value shapes

| JSON today (JS-shape) | JSON after (Godot-shape) |
|---|---|
| `"name": "Lightning Bolt"` | `"display_name": "Lightning Bolt"` |
| `"type": "Instant"` | `"card_types": ["instant"]` |
| `"sub": "Human Warrior"` | `"subtypes": ["human", "warrior"]` |
| `"cost": {"R": 1}` | `"mana_cost": {"R": 1}` |
| `"art": "cards/bolt/art.png"` | `"front_image_path": "cards/bolt/art.png"` |
| `"effects": [...]` | `"on_cast_effects": [...]` |
| `"abilities": [...]` | `"activated_abilities": [...]` |
| `"mana": "G"` (land) | `"mana_produced": ["G"]` |
| `"keywords": ["firstStrike"]` | `"keywords": ["first_strike"]` |
| `"kind": "gainLife"` | `"kind": "gain_life"` |
| `"event": "cardEntersBattlefield"` | `"event": "card_enters_battlefield"` |
| `"cond_id": "thisAttacks"` | `"cond_id": "this_attacks"` |

Script-driven migration (one commit, run `node tests/run_all.js` after each field-rename batch if you want bisect-friendly history; one big commit is fine if all tests stay green).

#### 5.2 JS `ingestCard` rebinder (Option A from the chat)

JS's `ingestCard()` in `reference/html-proto/js/cards.js` grows to do the inverse translation:

```js
function ingestCard(card) {
  card.tplId = card.card_id;
  card.name = card.display_name;
  card.cost = card.mana_cost;
  card.type = capitalize(card.card_types[0] || "");
  card.sub = (card.subtypes || []).map(capitalize).join(" ");
  card.effects = card.on_cast_effects;
  card.abilities = card.activated_abilities;
  // Plus: rebind effect.kind values gain_life → gainLife etc. inside effects + triggers,
  //       rebind event names, rebind keyword values, rebind cond_id values.
}
```

Roughly 100 lines. JS engine internals untouched.

**Option B (rejected for now)** was renaming JS source to use the snake_case forms throughout (~350 call sites). Aesthetic-only gain, real risk. Joe wants this deferred.

#### 5.3 JsonCardLoader simplifies dramatically

- Delete `_EFFECT_KIND_REMAP`, `_EVENT_KIND_REMAP`, `_KEYWORD_REMAP`, `_TARGET_FILTER_REMAP`.
- `_build_resource()` becomes direct field assignment: `card.display_name = json.display_name`, etc.
- The whole file goes from ~300 lines to maybe ~120.

**Important:** the supportability scan stays. It's still useful for telling you which effect/event/predicate kinds are unimplemented in Godot.

#### 5.4 Wire the Godot playable pool to JSON

This is the headline change.

- `cards/templates/card_database.gd::get_card(id)` currently does `load("res://cards/templates/<id>.tres")`. Change it to look up `id` in the JsonCardLoader map.
- Decide on caching: load all 258 cards once at autoload `_ready` (already happens for supportability scan; just retain the map) and serve `get_card` from memory.
- The 23 hand-curated cards (Lightning Bolt, Giant Growth, Mountain, etc.) need JSON representations. Two paths:
  - **Path A**: Find the closest html-proto equivalents and use their `card_id`s. `bolt` (html-proto) replaces `lightning_bolt` (Godot). Touches every reference: `engine/engine.gd::init_phase1`, `init_phase4`, `_PHASE5_SHOWCASE_DECK`, all test files. Risky.
  - **Path B**: Add new entries to `reference/html-proto/cards/_manifest.json` and create folders for `lightning_bolt`, `giant_growth`, etc., with their canonical JSON. The 23 hand-curated cards become part of the shared pool. Touches no Godot test code.
  - **Recommended: Path B.** It expands the shared pool symmetrically. Path A creates ID conflicts (`bolt` vs `lightning_bolt` mean the same thing).
- Delete the 31 `.tres` files (or keep one or two as test fixtures for the resource-format itself — but the boot validator + JsonCardLoader test cover that).
- `scenes/tres_card_factory.gd` becomes vestigial; replace with a JSON-driven factory (extends the card-framework's `JsonCardFactory`).

#### 5.5 Visual layer rebuild

This was already on `docs/BACKLOG.md` for unrelated reasons (the four already-ported PNGs in `cards/images/` need it):

> Card art for the 23 existing cards. Placeholders today. Four PNGs (blood_knight, cloud_pegasus, ember_drake, goblin_duelist) are already ported to `cards/images/` but unwired — they're art *inserts*, not full card faces, and our `scenes/card.tscn` treats `front_image` as the entire face. Wiring needs a frame+slot rebuild of card.tscn (Frame TextureRect + Art TextureRect children), then TresCardFactory sets both.

In the Pass 5 context: the same rebuild also unblocks loading html-proto card art PNGs (which exist at `reference/html-proto/cards/<id>/art.png`). Same change, two payoffs.

### Effort

~1.5 days of focused, well-tested work. **Bounded.** All the mechanism is built; Pass 5 is wiring + JSON shape migration + a card.tscn rebuild.

### What Pass 5 explicitly does NOT do

- **Pass 6 (port more JS effect kinds to Godot)** — still separate ongoing work. The supportability scan tells you which to port first.
- **Full JS source rename** — still rejected.
- **Target_mode/target_filter split** — could be folded into Pass 5 (since the JSON migration is touching every effect dict anyway) OR done as a separate Pass 5b. PROTOCOL.md §3.5 has the migration table ready either way.

---

## 6. Where your branch and mine overlap

The other instance (the branch this handoff is for) shipped four docs on `origin/claude/documentation-and-mapping-wa8Pd`. Here's how they intersect with the documents I shipped:

### `docs/SPEC.md` ↔ `docs/PROTOCOL.md`

**Significant overlap.** Both document the data contracts on the Godot side. Concrete examples:

| Topic | `docs/SPEC.md` (rules branch) | `docs/PROTOCOL.md` (this branch) |
|---|---|---|
| Action descriptors | §1.1 — the 11 action kinds, constructors, fields | Mentions in passing; PROTOCOL.md focuses on card JSON wire format, not the runtime action surface |
| Target descriptors | §1.2 — `{kind, who, iid}` shapes | §3.5 covers target *filter* taxonomy; descriptor shape mentioned but not catalogued the same way |
| CardResource schema | §1.3 — fields, types, defaults | §2.1 — same fields documented from the *wire-format* angle (what's in card.json) |
| Effect kinds | Mentioned (§1.4-ish?) | §3.2 — full catalog with implementation status per engine |
| Event kinds | Probably | §3.3 — full catalog |

**Recommendation for the rules-standardization session:** SPEC.md and PROTOCOL.md should converge. One option:

- **PROTOCOL.md** stays focused on the *wire format* (what's in the JSON, what string values are accepted in the dispatch keys). It's the contract between engines.
- **SPEC.md** stays focused on the *runtime data structures* (action descriptors, target descriptors, the EngineState dict, signals). It's the contract within an engine.

The two docs reference each other where they touch. The card JSON shape is in PROTOCOL.md but `CardResource.<field>` reads go to SPEC.md. Effect parameter shapes live in PROTOCOL.md (since they're authored in JSON); the dispatch contract `Effects.HANDLERS["kind"].execute(effect, ctx)` lives in SPEC.md.

**Or**: merge them. They could be one doc with §A for wire-format and §B for runtime. Joe should decide.

### `docs/ARCHITECTURE.md` ↔ `/CLAUDE.md`

The Godot-side module map in ARCHITECTURE.md overlaps with the file-tree + module-layout tables in `/CLAUDE.md`. Same content, different framing. ARCHITECTURE.md is more comprehensive; CLAUDE.md is the per-session quickref. They should stay distinct and reference each other.

### `docs/REFACTOR-NOTES.md` ↔ Pass 5 work

Several items in REFACTOR-NOTES.md intersect with what Pass 5 would touch:

- **REFACTOR-NOTES §1.1 [P0/M] Consolidate action dispatch.** Not directly related to Pass 5, but if Pass 5 adds a JSON-loaded card with a previously-unseen action shape, the dispatch consolidation becomes more urgent. Keep this on the radar.
- **REFACTOR-NOTES §1.2 [P1/M] Combat-keyword extensibility hook.** Tangential — Pass 5 doesn't touch combat, but does make it easier to add cards that *test* new keywords.
- **REFACTOR-NOTES §1.3 [P1/S–M] Action and event Dictionary type safety.** Closely related. The boot supportability scan in Pass 4 is in the same spirit — catching identifier typos at load time, not runtime. Pass 5 could extend it.
- **REFACTOR-NOTES §1.4 [P1/M] State mutation outside `execute_action`.** Unrelated to Pass 5 directly, but the PROTOCOL.md §8 authoring rules codify "all state mutation through execute_action" as a protocol-level invariant. Worth cross-referencing.

### `docs/RULES.md` ↔ `docs/PROTOCOL.md`

This is the interesting one. The rules-standardization work is at a higher abstraction level than the data-standardization work — RULES.md describes the game in plain English ("priority follows MTG rules where it matters"), while PROTOCOL.md describes the wire format that encodes that behavior ("trigger dict has `cond_id` field that's a string registered in either engine's predicate registry").

**Joe's reframe:** these turn out to be the same project because rule mechanics are partially encoded in the data. Examples:

- A new effect kind (rules) requires a new entry in the wire-format catalog (data) AND a new handler in both engines (code).
- A new event kind (rules — "when X happens") requires the engine to fire it (code), a wire-format entry (data), and a registry of `event` strings cards can listen for (data + code).
- The predicate `oppLostLifeThisTurn` is a *rule* (defines when a trigger fires) and a *data identifier* (what cards say in their `cond_id` field) and a *code function* (in `triggers.js` / `predicates.gd`).

So whenever your RULES.md work catalogues a new rule, three things need to stay consistent:

1. **RULES.md** (your branch) — the English description.
2. **PROTOCOL.md** (this branch) — the wire-format entry.
3. **Code in both engines** — registered handlers/predicates/event firings.

Pass 5's effect of "edit `card.json` once → both engines update" is the *delivery* of that consistency at the data layer. Your rules work is the *spec* that the data layer encodes.

---

## 7. Why rules and data are the same project

Joe said: "they're ultimately the same." I want to put words to why.

A card game's "rules" decompose into:

1. **State invariants** — what's in the EngineState, who owns what, when phases advance. Mostly code.
2. **Action surface** — what actions players can take, when. Encoded as action-descriptor kinds + legality functions. Code + data (the descriptors).
3. **Resolution semantics** — how an effect or trigger actually changes state. Code (the handlers) + data (the parameters in the card JSON).
4. **Event dispatch** — what fires when, who listens. Code (the `_fire_event` sites) + data (the event-kind catalog).
5. **Condition checks** — when a triggered ability fires. Code (the predicate functions) + data (the `cond_id` string in the card).

Items 2–5 are *partially encoded in card data.* Every triggered ability in a card JSON is a five-tuple: `(event, cond_id, target_filter, effects, self_only)`. Every effect descriptor is `(kind, target, amount, ...)`. These data shapes pin down rules.

So "standardize the rules" without "standardize the data" produces a clean English doc that no code matches. "Standardize the data" without "standardize the rules" produces clean schemas that don't say what they mean. You need both.

**Practical consequence for your branch:** every time RULES.md says "this is how X works," check whether the wire format (PROTOCOL.md) and dispatch tables (effects.gd, triggers.js, predicates.gd) actually express that rule. If they don't, the RULES.md description is aspirational, and the code is the spec. If they do, the wire format becomes the *binding* spec — change the JSON and you've changed what the game does.

---

## 8. Patterns, gotchas, and anti-patterns

### Anti-patterns the protocol enforces

From `/CLAUDE.md` "Patterns to NOT replicate from the prototype":

1. **No autoload reach from predicates or effect handlers.** Predicates take `(state, source, event)` and return bool. Effects take `(effect, ctx)` and resolve. **No reading `RulesEngine.state()` from inside these.** The JS prototype's worst pattern (`G[them].lifeLostThisTurn` closures) is the cautionary tale. The Godot side passes `state` explicitly through the args.
2. **No depth caps on trigger draining.** The JS prototype has them as a safety net for past infinite-loop bugs. If the drain code is correct, it doesn't need a safety net.
3. **No dynamically-attached dictionary fields on instances.** Use typed properties on `CardInstance` / `Player`. City of Brass's `extraManaColors` lost on instantiation (see JS comment) is the cautionary tale; Godot's `duplicate_deep()` overrides prevent that class of bug.
4. **All state mutation through `execute_action`.** Auto-passes are agent UX, not rules. The `_settle_state` loop auto-passes for the AI driver and unattended priority windows — but the priority pass IS happening, just automatically.

These are protocol-level invariants. PROTOCOL.md §8 calls them out. If your work touches state mutation, predicate semantics, or trigger drain, re-read these.

### Gotchas I hit

- **Class resolution requires `--import` first.** When I downloaded a Linux Godot binary fresh, my first test run failed with "Identifier `Player` not declared." Solution: run `godot --headless --path . --import` once to build the script class index, then tests work. The `.godot/` cache directory is what's being populated.
- **`.import` files for non-Godot-loaded assets.** The repo had `cards/images/*.png.import` committed but not `assets/mana/*.svg.import` or `reference/html-proto/cards/*/art.png.import`. My `--import` pass generated them; I committed them in `39e6e1c`. **If your work adds new assets, expect new `.import` sidecars and commit them alongside the source asset.** Godot convention is "commit .import sidecars, gitignore .godot/ cache directory" — and the repo's `.gitignore` is already set up for this.
- **`.tres` file format is order-sensitive in subtle ways.** When I edited `bloodlust_berserker.tres` to rename `condition_predicate` → `cond_id`, the editor would have reordered keys alphabetically on re-save. My sed-based edit preserved file order, which worked because the script doesn't depend on key order. If you write tooling that re-saves `.tres` files, expect Godot to canonicalize key order.
- **`reference/html-proto/` is *inside* the Godot project directory tree.** This means Godot's scanner sees html-proto assets and generates `.import` files for them. Joe asked whether `.gdignore` would solve this; my answer was "it would, but it'd also block any future Godot integration with html-proto art." Don't add `.gdignore` to `reference/html-proto/` without explicit decision.
- **Boot supportability scan adds time to test runs.** ~1-2 seconds per Godot invocation because it loads 258 JSONs. `MAGICLIKE_SKIP_SUPPORTABILITY_SCAN=1` disables it. Use this for tight test loops.
- **The Godot autoload runs `_ready` even when running a test scene.** The autoload is `RulesEngine = engine/engine.gd`, declared in `project.godot`. Every test scene gets the autoload booted before the test's own `_ready` runs. This is why the supportability scan ran during my test runs — and why I added the env-var skip.

### Patterns to lean on

- **Translation tables at the ingest boundary** — `JsonCardLoader._EFFECT_KIND_REMAP` and `ingestCard()` in cards.js are the patterns. **All wire-format ↔ idiom translation happens in these two places.** Nowhere else. If you need to add a new wire-format value, add it to one of these tables (and to PROTOCOL.md).
- **Boot validators over runtime guards.** `validate_all_card_predicates` walks every card at startup and `push_error`s typos. `supportability_report` extends the pattern to effect/event kinds. **Catch identifier mismatches at boot, not at runtime.** Pass 5 should preserve this principle.
- **Effect handler shape.** Each handler is a `.gd` file with `static func execute(effect: Dictionary, ctx: Dictionary)`. Registered in `Effects.HANDLERS`. The `ctx` is `{controller, source, source_name, source_iid, state, targets, log}`. **Effects do not reach into the autoload.** (Exception: `counter.gd` calls `RulesEngine.counter_stack_entry` because countering touches `_stack_held_cards` which is autoload-internal. Documented as an exception.)
- **Action descriptor factories.** All action creation goes through `Action.make_<kind>(...)` factories in `engine/action.gd`. Don't hand-construct action dicts. SPEC.md §1.1 (your branch) catalogues these.
- **`.gd.uid` sidecars stay with their script.** When I renamed `counter_spell.gd` → `counter.gd`, I also did `git mv counter_spell.gd.uid counter.gd.uid`. Godot uses the UID for scene references; losing it breaks references.

---

## 9. Test infrastructure

### Godot tests

10 phase smoke tests + 1 JsonCardLoader smoke test. All headless-runnable:

```bash
# One test:
godot --headless --path . res://tests/test_phase4_5b.tscn

# All tests:
for t in test_phase1 test_phase2 test_phase3 test_phase4 test_phase4_5a test_phase4_5b test_phase4_5c test_phase5a test_phase5b test_phase5c test_json_card_loader; do
  out=$(MAGICLIKE_SKIP_SUPPORTABILITY_SCAN=1 godot --headless --path . "res://tests/${t}.tscn" 2>&1)
  if echo "$out" | grep -q "ALL ASSERTIONS PASSED\|ALL PASS"; then
    echo "PASS: $t"
  else
    echo "FAIL: $t"
    echo "$out" | tail -25
  fi
done
```

Each test exits with code 0 (pass) / 1 (fail). The harness above shows pass/fail per test.

**On Linux without a system Godot:** download from https://github.com/godotengine/godot/releases/download/4.6-stable/Godot_v4.6-stable_linux.x86_64.zip — that's what I used. Unzip and the binary is ready to run. Run `--import` once before the first test.

### JS tests

```bash
cd reference/html-proto

# Regression suite — ~2s, 482 assertions:
node tests/run_all.js

# Self-play harness — ~20s for 500 games, useful for shaking out engine bugs:
node tests/selfplay_harness.js 500 bughunt

# Smaller self-play for fast iteration:
node tests/selfplay_harness.js 100 bughunt
```

The `_setup.js` setup file pipes cards through `ingestCard` so test code sees the same shape as the browser. **If you add new wire-format translations to `ingestCard`, the tests pick them up automatically** — no test-harness changes needed.

### Cross-engine verification pattern

When Pass 5 lands, the headline cross-engine test is:

1. Edit `reference/html-proto/cards/bolt/card.json` — change `amount: 3` → `amount: 4`.
2. Run `node tests/run_all.js` — JS sees the change.
3. Run Godot — boot supportability scan still shows bolt as supported. A phase test that casts bolt deals 4 damage instead of 3.

That single edit affecting both engines is the proof point for the whole standardization project.

---

## 10. Open questions you may run into

### Q1: Should the JSON migration use folder-rename for the 23 hand-curated cards?

The 23 Godot-hand-curated cards have folder names like `lightning_bolt`, `giant_growth`, `mountain`. The html-proto's equivalent cards have folder names like `bolt`, `growth`, `forest`. Some are duplicates (Godot has `mountain` and `forest`, html-proto has `mountain` and `forest` too — but `forest` might exist on both with different art). Some are alternates (Godot's `lightning_bolt` = html-proto's `bolt`).

**Three options when adding the 23 to the html-proto manifest:**

- **A: Keep both.** `bolt/card.json` and `lightning_bolt/card.json` coexist. The Godot side uses `lightning_bolt`, the JS deck pool uses whichever it wants. Adds complexity.
- **B: Pick one.** Rename Godot references to the html-proto folder names (touches `engine/engine.gd`, every test, the showcase deck). Renaming + careful regression testing.
- **C: Picky.** Keep Godot's names, delete the html-proto equivalents. Touches html-proto less but means JS-side reference cards (cards used in tests like `bolt`) need their references updated.

**My recommendation:** Option B. Touch Godot once, end up with one folder per concept across the whole project. Pass 5 is the natural moment for this because every Godot test is already getting touched.

### Q2: How to handle modal cards in the JSON shape

`tideCharm`, `verdantCharm`, `oblation` and a few others have modal effects:

```json
{
  "effects": {
    "modeNames": ["Counter target spell", "Bounce target creature", "Draw 2"],
    "modes": [[...effect_list_1...], [...effect_list_2...], [...effect_list_3...]]
  }
}
```

When the JSON shape becomes Godot-native, this needs an answer. Options:

- A new `on_cast_modes: Array[Dictionary]` field on `SpellResource`.
- Reuse `on_cast_effects` but allow either an Array or a single modal Dict.
- A dedicated `ModalSpellResource` subclass.

JsonCardLoader currently produces empty `on_cast_effects` for modal cards (TODO comment in the code). They show as unsupported. **Joe will probably want them supported in Pass 5 since modal spells are an existing JS feature.**

### Q3: How to handle `extraManaColors` (City of Brass)

The JSON has `mana: "W", extraManaColors: ["U", "B", "R", "G"]` for City of Brass. JsonCardLoader unions these into `LandResource.mana_produced`. Godot-native shape might prefer:

```json
"mana_produced": ["W", "U", "B", "R", "G"]
```

Cleaner but loses the "primary color" distinction. JS uses `mana` separately from `extraManaColors` for some logic. Decide whether to preserve the distinction or flatten.

### Q4: How does the rules-standardization work define "canonical" for ambiguous rules?

RULES.md is plain English. PROTOCOL.md is wire format. Where they disagree (and they will, because English is imprecise), which one wins?

**My take:** RULES.md is the spec for what *should* happen; PROTOCOL.md is the spec for what *the engine* does. If RULES.md and PROTOCOL.md disagree, that's a bug — either the rule is wrong or the data encoding doesn't express the rule. PROTOCOL.md §8 should probably be updated to say "RULES.md is the higher-authority document for behavior; PROTOCOL.md encodes how that behavior is expressed in data."

---

## 11. How to pick up Pass 5 cleanly

If Joe asks you to ship Pass 5, here's the order I'd take:

### Step 1: Reconcile SPEC.md and PROTOCOL.md (half day)

Don't start writing code until the rules / data docs are consistent. Read both, identify overlap, decide on a partition:

- PROTOCOL.md = wire format (what's in `card.json`, dispatch-key catalogs).
- SPEC.md = runtime data structures (action descriptors, engine state shape, signals).
- RULES.md = behavioral spec (the highest-authority document; cited from both PROTOCOL.md and SPEC.md).

Update headers in each doc to reference the others. Add a "Doc map" section to one of them (probably ARCHITECTURE.md) that explains the partition.

### Step 2: Lock the Godot-native JSON shape (half day)

Write a new `docs/CARD-JSON.md` (or extend PROTOCOL.md §2) that nails down the post-migration JSON shape. Every field, every required/optional flag, every value enum. **This is the contract you're migrating to.** Get Joe to approve it before touching JSON files.

### Step 3: Write the migration script (half day)

`tools/migrate_card_json_to_godot_shape.js`. Idempotent (running twice is a no-op). Walks the manifest, applies all field/value renames, writes back. Print a summary.

Don't run it on the canonical files yet — run it on a scratch copy, diff a few cards, and have Joe spot-check. Then run for real and commit.

### Step 4: Update JS `ingestCard` (1-2 hours)

Add the inverse rebinding. Run `node tests/run_all.js` — all 482 assertions must pass. Run self-play harness — must run clean.

### Step 5: Simplify JsonCardLoader (1-2 hours)

Delete the remap tables. Replace `_build_resource` with direct field assignment. Run Godot tests + the JsonCardLoader smoke test — all must pass.

### Step 6: Wire Godot's playable pool to JSON (half day)

Add JSON entries for the 23 hand-curated cards (Path B from §10 Q1). Modify `CardDatabase.get_card(id)` to read from the JsonCardLoader map instead of `.tres`. Update all references if you used Path B (renaming Godot's identifiers to match html-proto names).

Run all Godot tests — must pass.

### Step 7: Delete `.tres` files + `TresCardFactory` (half day)

Replace `TresCardFactory` with a JSON-backed factory. Delete the 31 `.tres` files. Run `tools/smoke_tres_factory.gd` to verify the visual factory still works.

### Step 8: Visual card.tscn rebuild (half day)

The Frame + Art TextureRect rebuild from BACKLOG. Wire it to load html-proto art PNGs (or Godot-local PNGs) per the JSON's `front_image_path`.

### Step 9: Test + commit + push

```bash
# Final verification:
MAGICLIKE_SKIP_SUPPORTABILITY_SCAN=1 godot --headless --path . res://tests/test_phaseX.tscn  # all 10 phase tests + json loader
node reference/html-proto/tests/run_all.js
node reference/html-proto/tests/selfplay_harness.js 100 bughunt
```

Commit per Joe's preference (the Pass 1/2/3/4 commits are good models — descriptive, scope-bounded, list of touched files in body). Push to `claude/standardization-BBD8O` (or your own branch, then merge).

### Estimated total

5–8 working hours of focused engineering, depending on how many surprises the modal-card / City-of-Brass / 23-card-naming questions throw. The mechanism is built; this is the wiring.

---

## Closing note

The standardization project is meaningful but not load-bearing for shipping the game itself. Joe can keep playing the JS prototype and the Godot Phase 5c+ work without Pass 5 ever landing. The value of Pass 5 is **eliminating a recurring "edit two places" tax** on every card change going forward. That tax compounds with every new card Joe authors; Pass 5 pays it off.

If you find yourself making a decision that I didn't anticipate here, **err toward making the wire format simpler** (fewer remap tables, fewer "special case" fields) and **err toward boot-time validation over runtime checks**. Those two principles do most of the work in keeping the standardization actually standardized.

Good hunting.
