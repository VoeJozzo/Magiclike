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
| `mana`         | `string` (W/U/B/R/G) | land  | Single-color mana lands. Implicit tap-for-mana ability is auto-synthesized. |
| `extraManaColors` | `string[]`    | opt      | City of Brass-style "any color" extras layered onto `mana`.   |
| `customText`   | `bool`           | opt      | If true, suppresses the `~` placeholder lint.                 |

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

The full catalog (JS authoritative as of v1.0.189). Each kind dispatches
through `EFFECTS[kind]` in JS and `Effects.HANDLERS[kind]` in Godot.
Effects whose Godot implementation hasn't landed yet are flagged.

| kind                  | params                                          | implemented | description                                                                          |
|-----------------------|-------------------------------------------------|-------------|--------------------------------------------------------------------------------------|
| `damage`              | `amount: int, target`                           | both        | Deal N damage to target (creature/player).                                           |
| `pump`                | `power: int, toughness: int, target, duration?` | both        | +N/+M to target creature. `duration: "eot"` (default) or omitted/"permanent" for +1/+1 counters. |
| `weaken`              | `power, toughness, target`                      | JS only     | Negative pump. (Godot reuses `pump` with negatives today.)                           |
| `add_counter`         | `power, toughness, target`                      | JS only     | Put +1/+1 counters on target (persistent).                                           |
| `add_mana`            | `colors: string[]` (or omitted for land's mana) | both        | Add mana to controller's pool.                                                       |
| `gain_life`           | `amount, target`                                | both        | Controller gains N life (target=`self`) or target player gains.                      |
| `counter`             | `target` (must be a stack spell)                | both        | Counter target spell. Renamed from `counter_spell` on the Godot side in Pass 1b.     |
| `draw`                | `amount`                                        | JS only     | Controller draws N.                                                                  |
| `discard`             | `amount, target`                                | JS only     | Target player discards N.                                                            |
| `remove_creature`     | `severity: 1-4, target`                         | JS only     | 1=tap, 2=bounce, 3=destroy, 4=exile.                                                 |
| `add_counter`         | (see above)                                     | JS only     |                                                                                      |
| `create_tokens`       | `count, tplId`                                  | JS only     | Mint N tokens of the given template.                                                 |
| `flicker`             | `target`                                        | JS only     | Exile, return to battlefield (re-trigger ETB).                                       |
| `steal`               | `target`                                        | JS only     | Take control of target permanent.                                                    |
| `grant_keyword`       | `keyword, duration, target`                     | JS only     | Grant keyword to target (eot / permanent).                                           |
| `fight_target`        | `target`                                        | JS only     | Two creatures deal damage equal to power simultaneously.                             |
| `restrict`            | `target`                                        | JS only     | Variant restrictions (tap-on-attack etc.).                                           |
| `return_from_graveyard` | `target`                                      | JS only     | Reanimate target.                                                                    |
| `shuffle_into_library`| `target`                                        | JS only     | Sweep target into owner's library.                                                   |
| `sacrifice`           | `target`                                        | JS only     | Force sacrifice of controller's own permanent.                                       |
| `untap`               | `target`                                        | JS only     | Untap target.                                                                        |
| `damage_all`          | `amount, filter`                                | JS only     | Sweep damage.                                                                        |
| `remove_all`          | `severity, filter`                              | JS only     | Sweep removal.                                                                       |
| `gain_control`        | `target`                                        | JS only     | Permanent steal.                                                                     |
| `exile_until_eot`     | `target`                                        | JS only     | Exile, return at end of turn.                                                        |
| `pump_all_yours`      | `power, toughness`                              | JS only     | Sweep buff.                                                                          |
| `rip_permanent`       | `target`                                        | JS only     | Card-specific rip mechanic.                                                          |
| `edict`               | (no params)                                     | JS only     | "Target player sacrifices a creature."                                               |
| `search_land_tapped`  | (no params)                                     | JS only     | Tutor.                                                                               |
| `search_creature`     | (no params)                                     | JS only     | Tutor.                                                                               |
| `symmetricize`        | (params per card)                               | JS only     | Card-specific power-symmetry.                                                        |
| `embargo`             | (params per card)                               | JS only     | Card-specific deny-cast.                                                             |
| `bleach`              | (params per card)                               | JS only     | Card-specific remove-color.                                                          |
| `bargain_sticker_self`/`bargain_sticker_other` | (params per card)             | JS only     | Card-specific bargain mechanic.                                                      |
| `destroy_and_sticker_slot` | (params per card)                          | JS only     | Card-specific.                                                                       |
| `endomorph_absorb`    | (params per card)                               | JS only     | Card-specific.                                                                       |
| `apply_in_game_splice`| (params per card)                               | JS only     | Card-specific.                                                                       |
| `noop`                | —                                               | JS only     | Placeholder.                                                                         |

**Naming rule.** Wire is snake_case (`gain_life`, `add_mana`, `remove_creature`).
JS internal idiom is camelCase (`gainLife`, `addMana`, `removeCreature`).
Today JS's `EFFECTS` table uses camelCase keys directly (`EFFECTS.gainLife`);
Pass 2 left these unchanged because card JSONs author the wire form and JS
ingest will rebind to either. When the Godot side adds an effect, it
registers under the snake_case key in `Effects.HANDLERS` directly. JS may
follow with a rebinder in `ingestCard` or rename its internal keys; both
options work, and the catalog above lists wire keys.

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

### 3.5 Target shapes

Today's wire format uses a single `target` string. The plan (Pass 5) is
to split into `target_mode` + `target_filter`. Until that lands:

| `target` value      | meaning                                                       |
|---------------------|---------------------------------------------------------------|
| `"self"`            | The source itself (creature). `gainLife` reads as "controller". |
| `"chosen"`          | Caster picks at cast time (Godot form).                       |
| `"any"`             | Caster picks; legal targets = creatures or players (JS form). |
| `"creature"`        | Caster picks any creature.                                    |
| `"player"`          | Caster picks any player.                                      |
| `"opponent"`        | Implicit — the controller's opponent.                         |
| `"controller"`      | Implicit — the controller themselves.                         |
| `"opp_creature"`    | Caster picks an opponent's creature.                          |
| `"your_creature"`   | Caster picks one of your creatures.                           |
| `"permanent"`       | Caster picks any permanent (JS).                              |
| `"graveyard_creature"` | Caster picks a creature in any graveyard (JS).             |
| `"spell"`           | Caster picks a spell on the stack (counter targets).          |
| `"creature_or_player"`| Caster picks a creature or a player.                        |

**Pass 5 will introduce** `target_mode: "chosen"|"controller"|"opponent"|"self"|"all_matching"|"none"`
plus `target_filter: "<subtype-from-the-above-list>"` when mode is `chosen`
or `all_matching`. Today's string values map cleanly:

- `"chosen"` → `target_mode: "chosen"` (no filter — caller infers from effect)
- `"creature"` → `target_mode: "chosen", target_filter: "creature"`
- `"any"` → `target_mode: "chosen", target_filter: "creature_or_player"`
- `"opponent"` → `target_mode: "opponent"`
- `"controller"` / `"self"` → `target_mode: "controller"` (or `self` for source-itself)
- `"spell"` → `target_mode: "chosen", target_filter: "spell"`

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
  "severity": 2,                    // for remove_creature: 1=tap 2=bounce 3=destroy 4=exile
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
  "event": "<see §3.3>",
  "cond_id": "<see §3.4>",        // optional; empty/missing = always true
  "self_only": true,               // optional; true → source must be event subject
  "text": "When ~ enters, ...",    // optional override of auto-synthesized oracle text
  "effects": [ /* see §4 */ ],
  "target_filter": "creature"      // optional; needed when an effect picks a chosen target
}
```

Both engines drain pending triggers in APNAP order (MTG 603.3b). Targeted
triggers controlled by `you` pause for UI input; opp-controlled triggers
auto-pick (full AI in Phase 5c+).

## 6. Activated ability shape

```jsonc
{
  "cost": { "tap": true, "mana": {"C": 1, "R": 0} },
  "effects": [ /* see §4 */ ]
}
```

Cost components today: `tap` (bool), `mana` (cost dict). Future: `sacrifice`,
`discard`, `pay_life`, custom costs.

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
