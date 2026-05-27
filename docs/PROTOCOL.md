# Magiclike Protocol — Cross-Engine Wire Format

Canonical spec for card data and rules-engine vocabulary shared between the
two implementations: **html-proto** (vanilla JS, `reference/html-proto/`) and
the **Godot 4.6 port** (project root). When in doubt, this file is the
source of truth — neither implementation overrides the spec.

This is a living document. New effect kinds, event kinds, predicates, or
target shapes get added here **in the same PR** as the implementation.
Drift between code and this doc is a bug.

See `docs/STANDARDIZATION-PLAN.md` for the rollout history and the
rationale behind individual decisions.

## 1. Tier model

Three layers, top-down:

1. **Canonical concept layer** — language-neutral. Concept names used in
   docs, commit messages, and discussion. Example: "the predicate
   *opponent lost life this turn*."
2. **Wire layer** — what lives on disk in `card.json` files and the JSON
   the Godot loader will read. **Always snake_case.**
3. **Idiom layer** — what the engine code uses internally. JS keeps
   camelCase (`tplId`, `condId`, `cardsZero`). GDScript uses snake_case
   (`card_id`, `cond_id`). Each loader rebinds wire → idiom at ingest.

Conversion between wire and idiom is mechanical: `card_id` ⇔ `cardId`.
The wire form is authoritative.

## 2. Card JSON schema

One file per card template at:

```
reference/html-proto/cards/<folder_id>/card.json
```

where `<folder_id>` is the same string as the card's `card_id`. (The
folder name is sticky — it's used for art-path resolution and as the
manifest key. The `card_id` field inside is canonical; if they diverge,
the inside wins.)

Cards are discovered via `reference/html-proto/cards/_manifest.json`, an
array of folder ids. Adding a card means dropping a new folder + appending
to the manifest.

### 2.1 Top-level fields

| Field          | Type             | Required | Notes                                                         |
|----------------|------------------|----------|---------------------------------------------------------------|
| `card_id`      | `string`         | yes      | Stable identifier. Matches folder name. Used in saves.        |
| `name`         | `string`         | yes      | Display name (e.g. "Lightning Bolt").                         |
| `type`         | `string`         | yes      | Capitalized: `"Creature"`, `"Instant"`, `"Sorcery"`, `"Land"`, `"Artifact"`, `"Enchantment"`. (One value today; an array form may land later — see §6 open work.) |
| `sub`          | `string`         | opt      | Space-separated subtypes: `"Human Warrior"`. Empty/missing for typeless cards. (Array form may land later — see §6.) |
| `cost`         | `object`         | opt      | `{W:1, U:0, B:0, R:1, G:0, C:2}`. Keys absent or zero are interchangeable. Lands have no cost. |
| `power`        | `int`            | creature | Required for creatures. Omitted for non-creatures.            |
| `toughness`    | `int`            | creature | Required for creatures.                                       |
| `art`          | `string`         | opt      | Emoji (`"⚡"`) or relative PNG path (`"cards/<folder>/art.png"`). |
| `text`         | `string`         | opt      | Oracle text. `~` placeholder substitutes the card's own name. |
| `keywords`     | `string[]`       | opt      | See §3.1 for the keyword vocabulary.                          |
| `effects`      | `object[]` or modal-object | opt | Spell on-cast effects. See §4 for descriptor shape. Modal cards use the modal-object form (§4.6). |
| `triggers`     | `object[]`       | opt      | Triggered abilities. See §5.                                  |
| `abilities`    | `object[]`       | opt      | Activated abilities (e.g. tap-to-mana). Same shape as triggers minus `event`/`cond_id`, plus a `cost` object. |
| `mana`         | `string` (W/U/B/R/G/C) | land  | Land's **primary-color label** (deck-color/draft/pip display only). §3.9: mana **production** lives on the land's tap-ability (`abilities: [{cost:{tap}, effects:[{add_mana, ...}]}]`), exactly like a mana dork — not on `mana`. A multi-color land uses `add_mana: {choose: ...}`. Use `"C"` for an identity-less land (e.g. City of Brass taps for any color but has no color identity — colorless frame, contributes no WUBRG to deck colors/pips). |
| `customText`   | `bool`           | opt      | If true, suppresses the `~` placeholder lint.                 |

**Removed in §3.9 (Slice 3):** `extraManaColors`. Lands now produce mana through
a tap-for-mana ability (the `add_mana` `choose` form covers City-of-Brass "any
color"); the parallel `extraManaColors` field is retired.

**Removed in v1.0.189 / Pass 2**: `color`, `colors`. These are now
**computed from `cost`** at ingest, on both sides. Authors should not
add them back. Cards with no `cost` (lands) compute to `color:null, colors:[]`.

### 2.2 Loader contract

Both engines must implement the same ingest pipeline:

1. Parse the JSON.
2. Rebind wire keys to idiom keys (JS: `card_id`→`tplId`, `cond_id`→`condId`;
   Godot: maps to `CardResource.card_id`/`display_name`/`text`/`triggers`
   per `data/card_resource.gd`).
3. Recompute `color` / `colors` from `cost` (or null/[] if no cost).
4. Validate that every referenced effect kind, event kind, predicate id is
   registered. **Unknown identifiers fail at boot, not at runtime.**

JS implementation: `js/cards.js::ingestCard()`. Godot implementation:
pending — `engine/json_card_loader.gd` (Pass 4).

## 3. Vocabulary catalogs

### 3.1 Keywords

The shared set (both engines must accept):

```
flying, vigilance, trample, haste, first_strike (wire) / firstStrike (JS),
reach, defender, indestructible, lifelink, deathtouch, menace, hexproof,
flash, unblockable
```

Underscored on the wire, camelCased in JS. Godot's `effective_keywords()`
unions template keywords + runtime grants from pump/stickers.

### 3.2 Effect kinds

The full catalog (JS authoritative, post-Slice-3 effects refactor). Each kind
dispatches through `EFFECTS[kind]` in JS and `Effects.HANDLERS[kind]` in Godot.
"implemented: JS" means the proto has it; the Godot mirror is tracked in
`GODOT-QA-TODO.md`.

**Slice 3 collapsed ~38 kinds into ~22 atomic ones.** Targeting moved to a
top-level `target()` step (§3.5); mass variants became a `scope` field; the
card-movement family unified into `move_card`; control effects into
`change_control`; persistent per-slot modifications into `apply_sticker`. The
legacy kinds below were **removed from card data** (a few survive only as
runtime handlers — noted).

| kind                  | params                                          | implemented | description                                                                          |
|-----------------------|-------------------------------------------------|-------------|--------------------------------------------------------------------------------------|
| `damage`              | `amount: int, scope?`                           | JS          | Deal N to the target() (creature/player). `scope: "all_creatures"` = sweep (was `damage_all`). |
| `pump`                | `power: int, toughness: int, duration?, scope?` | JS          | Buff the target() creature. `duration: "permanent"` = +1/+1 counters (was `add_counter`); negative power/toughness = weaken (was `weaken`); `scope: "all_yours"`/`"all_creatures"` = sweep (was `pump_all_yours`). |
| `affect_creature`     | `severity: "tap"\|"bounce"\|"destroy"\|"exile", scope?` | JS | Removal on the target() creature. `scope` = sweep (was `remove_all`). Empower promotes severity up the ladder. (Renamed from `remove_creature`; integer severities `1-4` still accepted defensively by the dispatcher but card data uses the string names.) |
| `move_card`           | `from_zone, to_zone, selector, amount?, filter?, post?` | JS  | Unified card movement. Selector: `controller_top` (draw/mill), `target`, `self`, `library_search` (tutor). Subsumes `draw`, `discard`, `flicker` (bf→exile then exile→bf), `return_from_graveyard`, `shuffle_into_library`, `search_creature`, `search_land_tapped`. `post`: `{tap, shuffle, keep_buffs}`. |
| `change_control`      | `duration?, transfer_ownership?, grant_haste?, untap_on_take?` | JS | Take control of the target() permanent (was `gain_control`/`steal`). `transfer_ownership` = permanent run-slot theft. |
| `apply_sticker`       | `sticker: {kind, ...params}`                    | JS          | Apply a persistent per-slot sticker to the target() (cost_mod / set_color / stat_boost). Replaces `embargo`/`bleach`/`symmetricize`'s bespoke channel. |
| `chooses`             | `filter`                                        | JS          | The target() player chooses a permanent matching `filter` (edict's first step; no hexproof). |
| `sacrifice`           | (operates on the chosen/target creature)        | JS          | The chosen creature's controller sacrifices it (fires death triggers). Edict = `target(player) → chooses(creature) → sacrifice`. |
| `annihilate`          | (operates on the chosen/target creature)        | JS          | No-trigger removal sibling of `sacrifice` (rip's verb — no graveyard, no death/leave triggers). |
| `add_mana`            | `amounts: {W:1,...}` OR `choose: "any"\|[colors]` | JS        | Add mana. `choose` form added in §3.9 so a land/dork taps for a chosen color. Lands ARE a `{cost:{tap}, effects:[{add_mana}]}` ability now (no `mana`/`extraManaColors` production field). |
| `gain_life`           | `amount, who?`                                  | JS          | Controller (or `who`/target) gains N life.                                          |
| `counter`             | (target() must be a stack spell)                | JS          | Counter target spell.                                                                |
| `grant_keyword`       | `keyword, duration?, whose?`                    | JS          | Grant keyword to the target() (eot/permanent); `whose: "allYours"`/"all" = mass.    |
| `create_tokens`       | `count, tokenId`                                | JS          | Mint N tokens.                                                                       |
| `untap`               | (target())                                      | JS          | Untap the target().                                                                  |
| `fight_target`        | (target())                                      | JS          | Your strongest creature fights the target().                                         |
| `exile_until_eot`     | (target())                                      | —           | **Decomposed in proto** to `move_card` (bf→exile) + `schedule_delayed` (end-step exile→bf return), since proto already has a delayed-trigger queue. No longer a distinct handler proto-side. Godot still needs its delayed-trigger queue (B4) before it can do the same. |
| `rip_permanent`       | (params per card)                               | JS          | Card-specific bundled rip (kludge; broad `rip` is the decided target — §13).         |
| `destroy_and_sticker_slot` / `endomorph_absorb` / `apply_in_game_splice` / `symmetricize` / `bargain_sticker_self` / `bargain_sticker_other` | (per card) | JS | Card-specific (Scarification / Endomorph / Stapler / Symmetricize prompt / Archdemon). |
| `draw` / `discard`    | `amount`                                        | JS (runtime only) | **Not used in card data** — kept as handlers because the trigger generator (Mercurial Adept) still emits them. Card data uses `move_card`. |
| `noop`                | —                                               | JS          | Placeholder.                                                                         |

**Naming rule.** Effect-kind dispatch keys are **snake_case on both sides**
(`gain_life`, `add_mana`, `affect_creature`, …) — one canonical wire spelling the
proto JS and Godot both read directly. The Slice 3 / card-data-Part-2 sweep
renamed the JS `EFFECTS` table keys and every card.json kind value to snake_case
(the earlier "JS stays camelCase" rule in `STANDARDIZATION-PLAN.md` §4.6 is
superseded for dispatch keys — it described the Pass 1–4 state). The catalog
above lists the canonical keys. Godot's `Effects.HANDLERS` registers the same
snake_case keys. The same sweep also snake_cased the other dispatch-key
categories: **keywords** (`first_strike`, `double_strike`) and **target filters**
(`permanent_or_spell`, `graveyard_creature`). Event kinds and predicate ids were
already snake_case from Slice 2 (the proto fires the unified `card_zone_change`,
`life_changed`, `spell_cast`, `attacks`; conditions are `card_moves(...)` etc.).
So **all** of `JsonCardLoader`'s remap tables (`_EFFECT_KIND_REMAP`,
`_EVENT_KIND_REMAP`, `_KEYWORD_REMAP`, `_TARGET_FILTER_REMAP`) are now no-ops for
the live vocabulary and slated for deletion (see GODOT-QA-TODO).

### 3.3 Event kinds

Fired by the engine, listened for by triggered abilities. Wire keys are
snake_case; JS internal kinds are camelCase per the conversion rule.

| wire (canonical)         | JS internal        | Godot          | payload                              |
|--------------------------|--------------------|----------------|--------------------------------------|
| `card_enters_battlefield`| `cardEntersBattlefield` | `card_enters_battlefield` (Pass 1c) | `{subject_iid, subject_card}` |
| `card_dies`              | `cardDies`         | `card_dies`    | `{subject_iid, subject_card}`        |
| `card_leaves_battlefield`| `cardLeavesBattlefield` | (pending)  | `{subject_iid, subject_card}` (non-death leaves) |
| `attacks`                | `attacks`          | (pending)      | `{subject_iid}` (this attacks)       |
| `life_gained`            | `lifeGained`       | (pending)      | `{player_key, amount}`               |
| `spell_cast`             | `spellCast`        | (pending)      | `{source_iid, controller_key}`       |
| `card_discarded`         | `cardDiscarded`    | `card_discarded` | `{card, controller_key}`           |

Both engines' trigger dispatch reads the canonical name. Adding a new
event kind requires (a) firing it in both engines from the matching
state-change point and (b) updating this table.

### 3.4 Predicate ids

Trigger conditions referenced by name in `triggers[].cond_id`. Each is a
function `(state, source, event) → bool`. JS-side registry:
`js/triggers.js::TRIGGER_CONDITIONS`. Godot-side registry:
`engine/predicates/predicates.gd::_PRED_NAMES`.

Canonical IDs are camelCase (matches JS source today; Godot reads them
via wire as `cond_id` snake-case strings, but the values themselves are
the camelCase ids). Both engines validate that every ID a card references
is registered at boot.

| id                                   | description                                                              | both? |
|--------------------------------------|--------------------------------------------------------------------------|-------|
| (empty string `""`)                  | Always true. Use for unconditional triggers.                             | both  |
| `thisEnters`                         | Source = event subject (ETB self-only).                                  | JS    |
| `thisDies`                           | Source = event subject (dies self-only).                                 | JS    |
| `thisLeaves`                         | Source = event subject (leaves non-death).                               | JS    |
| `thisAttacks`                        | Source = attacker.                                                       | JS    |
| `thisAttacksAfterOppLifeLoss`        | Source attacks AND opponent's `lifeLostThisTurn > 0`.                    | JS    |
| `thisKillsCreature`                  | Combat-damage trigger when source kills its blocker/attacker.            | JS    |
| `anotherCreatureYouEntersStrict`     | Another creature you control entered (not the source itself).            | JS    |
| `anotherCreatureYouEntersOfSubtype`  | Variant with subtype filter.                                             | JS    |
| `creatureYouAttacksOfSubtype`        | One of your creatures with subtype X attacked.                           | JS    |
| `anotherCreatureDies`                | Any other creature died.                                                 | JS    |
| `anyCardDies`                        | Any card died (creature or otherwise).                                   | JS    |
| `youGainLife`                        | You gained life this turn.                                               | JS    |
| `youCastSpell`                       | You cast any spell.                                                      | JS    |
| `youCastCounterspell`                | You cast a counterspell specifically.                                    | JS    |
| `oppLostLifeThisTurn` (canonical) / `opp_lost_life_this_turn` (Godot today) | Opponent has `lifeLostThisTurn > 0`. | Godot |

**Note on `self_only` (superseded — direction reversed).** Earlier drafts
folded `thisEnters`/`thisDies`/`thisAttacks` into a structural
`self_only: true` flag. The composable-predicate refactor
(`plan-zone-change-and-composable-predicates.md`) **reverses** this: the
canonical form is the explicit atomic predicate **`this_card`** in the
condition list (e.g. ETB = `[this_card, card_moves(anywhere, battlefield)]`),
matching MTG's "this creature" phrasing and reading consistently with every
other constraint. `self_only` is **retired** on both engines once that
refactor lands; do not author new cards against it. The table above is
likewise migrating to the `card_zone_change` + composable-predicate form
(`thisEnters` → `[this_card, card_moves(anywhere, battlefield)]`, etc.).

**Calling convention.** Predicates receive `(state, source, event)` and
return bool. **Never reach into autoload state from inside a predicate
body** — pass everything through the args. (See `/CLAUDE.md` "Patterns
to NOT replicate.")

### 3.5 Target shapes (Slice 3 §3.5 — landed)

Targeting is a **top-level `target` step**, not a per-effect field. A card,
trigger, or activated ability that needs one target carries `"target": "<filter>"`
from the **closed taxonomy** below; its effects are then **bare** and operate on
the established target. Hexproof and target legality are checked **once, at the
`target()` step** (cast time). This replaced the old per-effect `target` string
on single-target cards.

Closed target-filter taxonomy (`ENGINE.TARGET_FILTERS`):

| filter                 | legal targets                                  |
|------------------------|------------------------------------------------|
| `"creature"`           | any creature                                   |
| `"your_creature"`      | a creature you control                         |
| `"opp_creature"`       | a creature an opponent controls                |
| `"creature_or_player"` | any creature or player                         |
| `"player"`             | any player (free choice — heals, "target player gains N") |
| `"opp"`                | the opponent only (harmful effects — drain / burn-to-face / discard / edict). Text reads "target opponent"; only the opponent is a legal target, so card text matches behavior. |
| `"permanent"`          | any permanent                                  |
| `"spell"`              | a spell on the stack (counter targets)         |
| `"graveyard_creature"` | a creature card in a graveyard (reanimation)   |

Optional **`target_filter`** — a restriction the closed taxonomy can't name on
its own (e.g. "non-black creature", "tapped creature", "flying creature you don't
control"). It sits **beside** `target` on the same container (card / trigger /
ability) and carries `matchFilter` keys: `notColor`, `color`, `hasKeyword`,
`notKeyword`, `subtype`, `tapped`, `maxTough`/`minTough`, `maxPower`/`minPower`,
`notToken`. The taxonomy kind covers the type + controller axis; `target_filter`
covers everything else. Enforced at the same cast-time `target()` checkpoint
(and at highlight). Examples: Doom Blade `target: "creature", target_filter: {notColor: "B"}`;
Vine Strangle `target: "opp_creature", target_filter: {hasKeyword: "flying"}`.

Related forms:
- **`target: "self"`** on an *effect* still means the source itself (a creature
  for creature-operating effects; the controller for player-operating ones like
  `gain_life`/`add_mana`). This is per-effect, distinct from the top-level step.
- **`chooses(filter)`** — a separate effect, NOT a `target()` step: the
  *targeted player* selects a permanent of `filter` (no hexproof check). Used by
  edicts: `target("player") → chooses("creature") → sacrifice`.
- **mass `scope`** — effects with `scope` (`"all_creatures"`/`"all_yours"`/
  `"all_opps"`) take no target() and never check hexproof.
- **Multi-target** (not migrated to the top-level step) keeps per-effect
  `target` + `target_slot: N`; the UI collects one pick per slot.

Hexproof model: only the `target()` step checks it; `chooses()` and mass `scope`
bypass it (matching MTG — an edict isn't "targeted").

### 3.6 Phase enum

```
UNTAP, UPKEEP, DRAW, MAIN1, COMBAT_ATTACK, COMBAT_BLOCK, COMBAT_DAMAGE, MAIN2, END, CLEANUP
```

Godot's `engine/phase_machine.gd::PhaseMachine.Phase` already enumerates
all ten. JS today collapses UNTAP+UPKEEP+DRAW into a single UNTAP step;
the plan (Pass 2 follow-up) is to split them when upkeep-triggered
abilities land.

## 4. Effect descriptor shape

```jsonc
{
  "kind": "<see §3.2>",
  "target": "<see §3.5>",          // optional; effect-specific
  "amount": 3,                      // for damage, gain_life, draw, discard
  "power": 1,                       // for pump, add_counter, weaken
  "toughness": 1,
  "duration": "eot",                // for pump (default eot)
  "severity": "bounce",             // for affect_creature: tap / bounce / destroy / exile
  "colors": ["R"],                  // for add_mana
  "targetSlot": 1                   // for multi-target spells (Pass 5+)
}
```

Per-card-specific effects may use additional ad-hoc keys; new card designs
should reuse the catalog above before inventing fields. New parameters
require an entry in §3.2.

## 5. Triggered ability shape

```jsonc
{
  "event": "<see §3.3>",           // e.g. "card_zone_change"
  "condition": ["this_card", "card_moves(anywhere, battlefield)"],  // §3.4 composable predicates (Slice 2)
  "target": "creature",            // optional top-level target() step (§3.5) — bare effects operate on it
  "text": "When ~ enters, ...",    // optional override of auto-synthesized oracle text
  "effects": [ /* see §4 */ ]
}
```

Slice 2 (E1/E2) replaced the old `cond_id` string + `self_only` bool with a
`condition` array of composable predicate terms (§3.4); `this_card` is the
self-subject term. Slice 3 (§3.5) moved targeting to the top-level `target`
step. Both engines drain pending triggers in APNAP order (MTG 603.3b). Targeted
triggers controlled by `you` pause for UI input; opp-controlled triggers
auto-pick.

## 6. Activated ability shape

```jsonc
{
  "cost": { "tap": true, "mana": {"C": 1, "R": 0} },
  "target": "creature",            // optional top-level target() step (§3.5)
  "effects": [ /* see §4 */ ]
}
```

Cost components today: `tap` (bool), `mana` (cost dict), `sacrifice` (Carrion
Feeder). Future: `discard`, `pay_life`, custom costs. A tap-for-mana ability
(`{cost:{tap}, effects:[{add_mana, ...}]}`) is how **lands** produce mana too
(§3.9) — not a `mana` field.

## 7. Open work (referenced from `STANDARDIZATION-PLAN.md`)

- **Type / sub array forms.** `type: "Creature"` (string, capitalized)
  vs `card_types: ["creature"]` (array, lowercase). Godot uses the latter.
  The JS migration is deferred — when it lands, both engines accept both
  shapes during transition, then snake-array becomes canonical.
- **Target mode/filter split** (§3.5).
- **JS `tplId` → `cardId` source rename.** Deferred; not required for
  cross-engine wire harmony.
- **Engine-compatibility tags.** Decided NOT to use per-card `"engines":
  ["html-proto"]` tags; instead, the Godot loader's boot-time supportability
  scan reports unsupported cards by missing effect/event/predicate names.

## 8. Authoring rules

1. **New cards are JSON in the canonical schema.** No exceptions.
2. **New effect / event / predicate kinds get added here in the same PR.**
3. **Predicate calling convention is `(state, source, event)`.** No
   autoload reach, no global state capture.
4. **All mutations through `execute_action`** (Godot) / `executeAction`
   (JS). Both engines hard-require it.
5. **No backwards-compat shims for renamed fields.** The wire format is
   migrated wholesale; cards do not author both old and new keys.
6. **Validators at boot, not at runtime.** Adding a new effect kind without
   registering it must be a load-time `push_error` (Godot) or
   `console.warn` (JS), not a silent runtime fizzle.
