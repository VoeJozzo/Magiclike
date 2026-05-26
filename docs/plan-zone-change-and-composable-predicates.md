# Refactor Plan: Unified Zone-Change Events + Composable Predicates

**Status:** Plan complete, ready for review. Not yet executed.
**Cross-references:** `docs/DIVERGENCE.md` items E1 (event-vocabulary / zone-change unification) and E2 (composable predicates). `docs/RULES.md` §1000–1002 (Triggered Abilities). Sequenced before Phase 6 card-pool expansion so new cards don't accumulate in the old monolithic style.
**Effort estimate:** **L** (~2.5–3 days end-to-end across both engines, including card migration and tests).

Produced by an Explore/Plan pass against `engine/engine.gd`, `engine/predicates/predicates.gd`, `reference/html-proto/js/engine.js`, `reference/html-proto/js/triggers.js`, and `reference/html-proto/js/trigger-generator.js`. The goal is to land the long-term design (composable atomic predicates over a unified event vocabulary) before the card pool grows past the point where mechanical migration is cheap.

---

## 1. Current event vocabulary (audit)

### Godot — 2 events
| Kind | Emitted at | Payload |
|---|---|---|
| `card_etb` | `_do_play_land` (engine.gd:573), `_resolve_spell_entry` (engine.gd:701) | `{kind, subject_iid, subject_card}` |
| `card_dies` | `_run_sbas` (engine.gd:962) | `{kind, subject_iid, subject_card, from_zone:"battlefield"}` |

A `card_discarded` event is emitted at `engine.gd:1435` but uses a different schema (`name` field, not `kind`) and no card listens. Treat it as a placeholder to be normalized as part of this refactor.

### Proto — 6 distinct event types
| Kind | Emit sites (engine.js) | Payload |
|---|---|---|
| `cardEntersBattlefield` | 1841, 1954, 2117, 3892, 4175, 5337 | `{type, card, controller, sourceIid?}` |
| `cardDies` | 3242, 3280, 3615 | `{type, card, controller}` + `extraSources` |
| `cardLeavesBattlefield` | 3557 (via `emitLeavesBattlefield`) — covers death, bounce, exile, shuffle, EOT-exile return path | `{type, card, controller}` |
| `attacks` | 4330 | `{type, attacker, controller, defender}` |
| `spellCast` | 3858 (via `pushOnStack`) | `{type, card, controller}` |
| `lifeGained` | 1361, 1801, 4037 | `{type, who, amount, sourceIid?}` |

Proto's `cardDies` and `cardLeavesBattlefield` overlap: every death emits both (dies first, then leaves). This is exactly the redundancy E1 calls out.

## 2. Current predicate registry (audit)

### Godot — 1 predicate
- `opp_lost_life_this_turn` (reads `Player.life_lost_this_turn`).

### Proto — 14 predicates, decomposed
For each proto predicate, the atomic checks it bundles (using the human-readable names introduced in §5). Note: redundant constraints have been pruned — e.g., `this_card` already implies the source's template type, so `card_is_creature` is omitted from source-bound triggers where it adds no filtering.

| Predicate | Event | Composed shorthand |
|---|---|---|
| `thisEnters` | card_zone_change | `[this_card, card_moves(anywhere, battlefield)]` |
| `anotherCreatureYouEntersStrict` | card_zone_change | `[another_card, card_is_creature, controlled_by(you), card_moves(anywhere, battlefield)]` |
| `anotherCreatureYouEntersOfSubtype` | card_zone_change | `[another_card, controlled_by(you), card_has_subtype(<sub>), card_moves(anywhere, battlefield)]` |
| `thisAttacks` | attacks | `[this_card]` |
| `thisAttacksAfterOppLifeLoss` | attacks | `[this_card, lost_life_this_turn(opp)]` |
| `creatureYouAttacksOfSubtype` | attacks | `[controlled_by(you), card_has_subtype(<sub>)]` |
| `thisDies` | card_zone_change | `[this_card, card_moves(battlefield, graveyard)]` |
| `thisLeaves` | card_zone_change | `[this_card, card_moves(battlefield, anywhere)]` |
| `anotherCreatureDies` | card_zone_change | `[another_card, card_is_creature, card_moves(battlefield, graveyard)]` |
| `anyCardDies` | card_zone_change | `[card_moves(battlefield, graveyard)]` |
| `thisKillsCreature` | card_zone_change | `[another_card, card_is_creature, card_moves(battlefield, graveyard), card_damaged_by_this]` |
| `youGainLife` | life_changed | `[is_life_gain, affected_player_is(you)]` |
| `youCastSpell` | spell_cast | `[another_card, controlled_by(you)]` |
| `youCastCounterspell` | spell_cast | `[another_card, controlled_by(you), card_has_effect(counter_spell)]` |

**Observation.** All 14 collapse to combinations of 12 atomic primitives (see §5).

## 3. Unified event vocabulary (proposed)

Replace the dies/leaves duality with a single `card_zone_change` event plus retained specialized events where shape genuinely differs:

```
card_zone_change   {kind, subject_iid, subject_card, controller, from_zone, to_zone, killed_by_iid?}
spell_cast         {kind, subject_iid, subject_card, controller}
attacks            {kind, subject_iid, subject_card, controller, defender_key}
life_changed       {kind, who, delta, source_iid?}        # gain → delta>0, loss → delta<0
damage_dealt       {kind, source_iid, target_iid_or_who, amount, is_combat}   # reserved; future
```

**Why a single zone-change event:** "dies" = `card_moves(battlefield, graveyard)` plus a creature-type check when needed; "bounced" = `card_moves(battlefield, hand)`; "exiled" = `card_moves(anywhere, exile)`. The trigger writes those constraints as composable predicates — no separate event kinds required.

**Why specialized `attacks`, `spell_cast`, `life_changed` stay:** their payloads don't fit the zone-change schema (no `from_zone`, no `to_zone`, different subject semantics — the "subject" of `attacks` is a creature still on the battlefield, not changing zones).

**Why one `life_changed` (not two):** sign carries the direction. Triggers like `youGainLife` express the constraint with `is_life_gain`. Matches the DIVERGENCE.md D4 redesign already on file.

### 3.1 ETB ergonomics
`card_etb` is so common that listeners benefit from a shorthand. Two viable shapes; recommend (a):

- **(a)** Emit ONLY `card_zone_change` from non-battlefield → battlefield. Predicate registry exposes `card_moves(from, to)` so the common ETB pattern is `[this_card, card_moves(anywhere, battlefield)]`. No alias.
- **(b)** Emit BOTH `card_zone_change` and a legacy alias `card_etb`. Easier migration; permanent debt.

Pick (a). The migration window in §11 keeps the old emission temporarily so both can coexist during cutover — no permanent alias.

### 3.2 Verification by predicate enumeration
See §2 above — full decomposition table for all 14 proto compounds. Every compound maps to a list of atomic primitives drawn from §5.

## 4. Predicate composition format (card data)

Card data accepts FOUR shapes on `triggered_abilities[i].condition`. Each form is a `condition expression` that evaluates to bool:

| Shape | Example | Meaning |
|---|---|---|
| `""` or omitted | `""` | Always true (current behavior preserved) |
| Bare string | `"this_card"` | Look up the named atomic predicate, call with no args |
| Function-call string | `"card_moves(battlefield, graveyard)"` | Look up the named atomic predicate, call with the parsed args |
| Array | `["this_card", "card_moves(battlefield, graveyard)"]` | AND of every term — each term is itself a condition expression |
| Dict (boolean op) | `{"op": "and"\|"or"\|"not", "terms": [...]}` | Boolean tree, where each term is a condition expression |

The function-call shorthand parses to a canonical dict form (`{"name": "card_moves", "args": ["battlefield", "graveyard"]}`) internally, so the evaluator's representation is uniform regardless of which surface syntax the card data uses. Card authors write the function-call form; the evaluator works with the canonical form.

The field is renamed `condition` (was `condition_predicate`). A migration shim accepts both names during the cutover; `condition_predicate` is removed in the final cleanup step.

**`self_only: true` is removed** in favor of explicit `this_card` in the predicate list — the spelling is consistent with every other constraint.

### 4.x Parser design decisions

1. **Single-arg predicates only by convention** — except `card_moves(from, to)` which takes two args because zone change is one semantic event with two endpoints. Future predicates should default to single-arg; multi-arg requires an explicit design call. AND-composition via the outer list handles the common case where multiple constraints apply.
2. **AND is implicit from the list; OR/NOT is explicit via `{op, terms}`.** Card authors don't write AND anywhere — every entry in the condition list is AND'd. OR is rare enough to deserve an explicit construct.
3. **Bare identifiers don't need quotes; quote args containing spaces, commas, or parens.** `card_moves(battlefield, graveyard)` is bare. `card_subtype("Beast Folk")` quotes because of the space.
4. **Arg type auto-detection.** Bare arg matching an integer regex → int. Matching a float regex → float. Equal to `true`/`false` → bool. Otherwise → string. Forced string via quotes: `card_subtype("3")` is the string `"3"`, not the int 3.
5. **Whitespace tolerant.** `card_moves(battlefield, graveyard)`, `card_moves( battlefield , graveyard )`, and `card_moves(battlefield,graveyard)` all parse identically.
6. **`anywhere` is a reserved keyword** for the `card_moves` predicate's wildcard. Parser treats it as a string sentinel; the predicate body checks `if zone_arg == "anywhere": return true_for_this_axis`. Other predicates can ignore it.

### 4.1 Worked migration: Bloodlust Berserker

```gdscript
# Before
triggered_abilities = [{
    "event": "card_dies",
    "self_only": true,
    "condition_predicate": "opp_lost_life_this_turn",
    "effects": [{"kind": "damage", "amount": 2, "target": "opponent"}],
}]

# After
triggered_abilities = [{
    "event": "card_zone_change",
    "condition": [
        "this_card",
        "card_moves(battlefield, graveyard)",
        "lost_life_this_turn(opp)",
    ],
    "effects": [{"kind": "damage", "amount": 2, "target": "opponent"}],
}]
```

Reads as English: "this card, moving from battlefield to graveyard, with opp having lost life this turn." `card_is_creature` is OMITTED — `this_card` already constrains the subject to be Bloodlust Berserker, which is creature-typed by its template; the creature check would be dead weight.

### 4.2 Worked composition: hypothetical "When another creature you control enters and you control a flier"

```
"condition": [
    "another_card",
    "card_is_creature",
    "controlled_by(you)",
    "card_moves(anywhere, battlefield)",
    "you_control_creature_with_keyword(flying)",
]
```

Built from primitives — no new monolithic predicate, no new registry entry. Last predicate would need to be added when first card needs it.

### 4.3 Worked composition with OR: "When you cast a counterspell OR a damage spell"

```
"condition": [
    "another_card",
    "controlled_by(you)",
    {"op": "or", "terms": [
        "card_has_effect(counter_spell)",
        "card_has_effect(damage)",
    ]},
]
```

Outer list is AND. Inner `{op: or, terms}` is the disjunction. Note that the terms inside the OR are themselves condition expressions — the recursion is uniform.

## 5. Atomic predicate registry (starter set)

All take `(state, source, event, params) -> bool`. Naming convention: read like English. In MTG terminology, "this card" means the trigger source; "another card" means a card that is NOT the trigger source. Tense for action-on-the-card predicates: present (matches MTG card text — "when this creature dies," not "died").

**Card predicates** (event has a subject card — applies to `card_zone_change`, `spell_cast`, `attacks`):

All predicates take `(state, source, event, args) -> bool`. Naming convention: read like English. In MTG terminology, "this card" means the trigger source; "another card" means a card that is NOT the trigger source. Tense for action-on-the-card predicates: present (matches MTG card text — "when this creature dies," not "died"). Player values are `you` / `opp` (pronoun-form, not possessive — reads as "controlled by you" / "controlled by opp," matching MTG card-text phrasing).

Grouped by what kind of predicate it is, NOT by which event it's typically used with — the same predicate can apply across multiple event types.

### Card predicates (8) — for events with a card subject (`card_zone_change`, `spell_cast`, `attacks`)

| Shorthand | Purpose |
|---|---|
| `this_card` | Event's card IS the trigger source. Replaces `self_only:true`. Matches MTG's "this creature / this card" phrasing. |
| `another_card` | Event's card is NOT the trigger source. |
| `card_is_creature` | Event's card has creature type. Note: redundant when paired with `this_card` if the source's template is already creature-typed — omit in that case. |
| `controlled_by(player)` | Event's card is controlled by `player` (`you` or `opp`, resolved relative to the trigger source's controller). For `spell_cast`: the spell's caster is `player`. |
| `card_moves(from, to)` | Zone-change event from `from` to `to`. Either arg can be `anywhere` to mean "don't care about this endpoint." Examples: `card_moves(anywhere, battlefield)` for ETB, `card_moves(battlefield, graveyard)` for dies. |
| `card_has_subtype(subtype)` | Event's card template has the named subtype. Subtype name is a bare identifier (or quoted if it contains spaces). |
| `card_damaged_by_this` | Event's card has the trigger source in its `damaged_by_sources` set. Composes with `card_moves(battlefield, graveyard)` to express MTG's "killed credit" semantics — "this card killed it." (Requires combat-credit tracking; gated on DIVERGENCE C5 implementation.) |
| `card_has_effect(kind)` | Event's card template has an `on_cast_effects` entry with matching `kind`. `kind` is one of the effect-kind names from SPEC.md (`damage`, `gain_life`, `counter_spell`, `pump`, `add_mana`). Used for "whenever you cast a counterspell / damage spell / etc." triggers. |

### Event-meta predicates (1) — for events with a player subject (no card subject)

| Shorthand | Purpose |
|---|---|
| `affected_player_is(player)` | Event's player field (e.g., `life_changed.who`) matches `player` (`you` or `opp`). Currently only `life_changed` events have a player subject; reserved for future player-subject events like scry, untap, mill, draw. |

### Life predicates (3) — specifically about life

| Shorthand | Purpose |
|---|---|
| `is_life_gain` | `event.delta > 0`. Filters `life_changed` to gain direction. |
| `is_life_loss` | `event.delta < 0`. Filters `life_changed` to loss direction. |
| `lost_life_this_turn(player)` | Historical state: `player_by_key(player).life_lost_this_turn > 0`. Fires when X happens IF the named player has lost life at some point earlier this turn. Distinct from `is_life_loss + affected_player_is(player)`, which is event-instant (fires AT the moment of the life loss). |

That's **12 primitives** covering all 14 proto compounds. Each is 1–5 lines of implementation. Adding a new card-specific atomic is one new entry in the registry plus one entry in the boot-validation table.

### Notes on naming conventions

- **`is_life_gain` / `is_life_loss` vs. the D4 `gain_life` effect:** different layers. The D4 `gain_life` effect (handler) is what PRODUCES the `life_changed` event with a signed delta. The `is_life_gain` predicate is what FILTERS the event by direction at trigger evaluation time. Effect → emits event → predicate filters event → trigger fires.
- **`controlled_by(player)` covers two former predicates:** what was `card_is_yours` and `card_is_opps` collapses into `controlled_by(you)` and `controlled_by(opp)`. The function-call shorthand makes this both readable AND consistent with the other parameterized predicates.
- **Player values are always `you` or `opp`,** not `yours`/`opps`. Pronoun-form reads naturally in every predicate name (`controlled_by(you)`, `affected_player_is(you)`, `lost_life_this_turn(you)`).
- **Redundancy discipline:** drop constraints that are implied by other constraints in the same list. `this_card` + creature-typed source implies `card_is_creature` — don't write the latter. The migration script for proto cards should apply this discipline mechanically.

### Predicates considered but dropped

- `event_controller_is_self` (for `spell_cast`) — redundant with `controlled_by(player)`, which works for spell_cast too (the spell's controller IS the card's controller from the event's perspective).
- `event_kind_is(kind)` — redundant with the trigger's `event` field, which already specifies which event kind to listen for.
- `card_killed_by_self` — decomposed into `card_damaged_by_this` + zone-change conditions. Bundled predicate hid what's really happening.
- `you_lost_life_this_turn` / `opp_lost_life_this_turn` — collapsed into parameterized `lost_life_this_turn(player)`.
- `affected_player_is_you` / `affected_player_is_opp` — collapsed into parameterized `affected_player_is(player)`.
- `card_is_yours` / `card_is_opps` — renamed to parameterized `controlled_by(player)`.
- `card_moves_from(zone)` / `card_moves_to(zone)` — unified into `card_moves(from, to)` with `anywhere` wildcard.

### Future extensions

When future events introduce multiple cards (e.g., a hypothetical "creature deals damage to creature" event with both `attacker` and `defender` subjects), introduce `attacker_*` and `defender_*` prefixes for that event specifically — same pattern, per-event-type prefixes only when there's genuine ambiguity.

**For discard triggers** ("when you discard a card, do X") — note that discard is a `card_zone_change` event (`card_moves(hand, graveyard)`), not a player-subject event. The trigger composes as `[controlled_by(you), card_moves(hand, graveyard)]`. `affected_player_is` is reserved for events without a card subject only.

## 6. Evaluator design

```gdscript
# Pseudocode (Godot)
static func evaluate(expr, ctx: Dictionary) -> bool:
    # ctx = {state, source, event}
    if expr == null or expr == "":
        return true
    if expr is String:
        # Bare string OR function-call string
        if "(" in expr:
            var parsed: Dictionary = _parse_call(expr)
            return _call_atomic(parsed.name, ctx, parsed.args)
        return _call_atomic(expr, ctx, [])
    if expr is Array:
        for term in expr:
            if not evaluate(term, ctx):
                return false
        return true
    if expr is Dictionary:
        if expr.has("op"):
            var op: String = expr["op"]
            var terms: Array = expr.get("terms", [])
            match op:
                "and":
                    for t in terms:
                        if not evaluate(t, ctx): return false
                    return true
                "or":
                    for t in terms:
                        if evaluate(t, ctx): return true
                    return false
                "not":
                    return not evaluate(terms[0], ctx)
        if expr.has("name"):
            # Canonical dict form: {"name": ..., "args": [...]}
            return _call_atomic(expr["name"], ctx, expr.get("args", []))
    push_warning("evaluate: malformed expression %s — false" % str(expr))
    return false

static func _call_atomic(name: String, ctx: Dictionary, args: Array) -> bool:
    var fn = _ATOMICS.get(name)
    if fn == null:
        push_warning("Unknown atomic predicate '%s'" % name)
        return false
    return fn.call(ctx.state, ctx.source, ctx.event, args)

# Parses "card_moves(battlefield, graveyard)" into {name: "card_moves", args: ["battlefield", "graveyard"]}.
# Handles: whitespace tolerance, quoted-string args (for args with commas/spaces/parens),
# numeric/bool/string auto-detection on bare args.
static func _parse_call(s: String) -> Dictionary:
    var open_paren := s.find("(")
    var close_paren := s.rfind(")")
    if open_paren == -1 or close_paren == -1 or close_paren < open_paren:
        push_warning("Malformed predicate string '%s'" % s)
        return {"name": s, "args": []}
    var name := s.substr(0, open_paren).strip_edges()
    var args_str := s.substr(open_paren + 1, close_paren - open_paren - 1).strip_edges()
    if args_str == "":
        return {"name": name, "args": []}
    var args: Array = []
    for raw_arg in _split_args(args_str):
        args.append(_coerce_arg(raw_arg.strip_edges()))
    return {"name": name, "args": args}

# Splits "battlefield, graveyard" → ["battlefield", "graveyard"].
# Respects quoted strings: split on commas OUTSIDE of quotes only.
static func _split_args(s: String) -> Array:
    var out: Array = []
    var current := ""
    var in_quotes := false
    for ch in s:
        if ch == '"':
            in_quotes = not in_quotes
            current += ch
        elif ch == "," and not in_quotes:
            out.append(current)
            current = ""
        else:
            current += ch
    if current != "":
        out.append(current)
    return out

# Coerces a string arg into its typed value:
# - "true" / "false" → bool
# - integer regex → int
# - float regex → float
# - "quoted string" → unquoted string
# - anything else → string as-is
static func _coerce_arg(s: String):
    if s.begins_with('"') and s.ends_with('"'):
        return s.substr(1, s.length() - 2)
    if s == "true": return true
    if s == "false": return false
    if s.is_valid_int(): return int(s)
    if s.is_valid_float(): return float(s)
    return s
```

`_ATOMICS` is a `Dictionary[String, Callable]` populated at boot from a static table. Each predicate is called with `(state, source, event, args)` where `args` is an `Array` (positional, possibly empty). Predicates pull args by index: `var zone: String = args[0]`. Proto's JS version is structurally identical, swapping `Callable` for arrow functions and `match` for `switch`.

## 7. Card data migration

**Godot (2 cards):**
- `cards/templates/pyromaniac.tres` — `card_etb` + `self_only:true` → `card_zone_change` with `[this_card, card_moves(anywhere, battlefield)]`.
- `cards/templates/bloodlust_berserker.tres` — see §4.1 worked example.

Hand-translate. Two `.tres` files; mechanical script not worth writing.

**Proto (audit ~80–120 cards with triggers; ~258 total):**
Mechanical migration with a small Node script (`reference/html-proto/tools/migrate-triggers.js`) that:
1. Walks `cards/*/card.json`.
2. For each `triggers[]` entry, looks up its `condId` in a translation table mapping the 14 monolithic IDs to the decomposed shorthand expressions (see §2's decomposition table for the mappings).
3. Rewrites `event` per the unified vocabulary (`cardDies`/`cardLeavesBattlefield`/`cardEntersBattlefield` → `card_zone_change`; `spellCast`/`attacks`/`lifeGained` → underscore-cased equivalents `spell_cast`/`attacks`/`life_changed`).
4. Writes `condition` (the new compose-shape, using the function-call shorthand) and removes `condId` and `params`.
5. **Applies the redundancy-cleanup pass:** drops any `card_is_creature` that's preceded by `this_card` when the card's template type is creature (almost always true for source-bound triggers). The decomposition table in §2 already reflects this discipline; the script just enforces it consistently.

Add a test (`tests/test_trigger_migration.js`) that asserts every migrated card's trigger fires under the same conditions as before, using a golden-event harness — feed in a synthetic event, check pass/fail symmetry for each (card, scenario) pair.

`generateRandomTrigger` / `generateConditionOptions` in `trigger-generator.js` need an analogous rewrite: the `GENERATOR_CONDITIONS` table emits the new composed shorthand directly. `noSelfCascade` becomes an `another_card` term in the generated expression — no special-case field on the trigger.

## 8. Boot validation

Replace the single-name lookup in `Predicates.validate_all_card_predicates` with a recursive walk:

```gdscript
static func validate_all_card_predicates(card_resources: Array) -> void:
    var unknown: Array[String] = []
    for card in card_resources:
        for trig in card.triggered_abilities:
            var expr = trig.get("condition", trig.get("condition_predicate", ""))
            _collect_unknown_atomics(expr, unknown, card.card_id)
    if not unknown.is_empty():
        push_error("Unknown atomic predicate(s): %s" % ", ".join(unknown))

static func _collect_unknown_atomics(expr, out: Array, card_id: String) -> void:
    if expr is String:
        if expr == "":
            return
        # Function-call form: extract name before "("; bare string: use as-is.
        var name := expr
        if "(" in expr:
            name = expr.substr(0, expr.find("(")).strip_edges()
        if not _ATOMICS.has(name):
            out.append("%s.%s" % [card_id, name])
    elif expr is Array:
        for t in expr:
            _collect_unknown_atomics(t, out, card_id)
    elif expr is Dictionary:
        if expr.has("op"):
            for t in expr.get("terms", []):
                _collect_unknown_atomics(t, out, card_id)
        elif expr.has("name") and not _ATOMICS.has(expr["name"]):
            out.append("%s.%s" % [card_id, expr["name"]])
```

Also validate event kinds: walk every trigger, assert `trig.event` ∈ {`card_zone_change`, `spell_cast`, `attacks`, `life_changed`} (and during transition, the old kinds too).

Proto's equivalent goes in `js/triggers.js` next to `evalTriggerCondition`; the test harness calls it after `loadCards()`.

## 9. Coordination with the priority-window refactor (B6/B7)

**Independent.** B6/B7 touches `priority_player_key` assignment sites and `_settle_state`'s AI driver; this refactor touches `_fire_event`, `_drain_pending_triggers`, the predicate module, and card templates. No shared files in the hot path of either.

Recommended order: **land B6/B7 first** because (a) it's smaller (M, ~8h), (b) its plan is already at a finer level of detail, and (c) it doesn't touch card data — so the migration step here can proceed without rebasing card .tres files over priority-window churn. But the two can also proceed in parallel on separate branches; the only merge point is the trigger-drain call from `_drain_continue` (engine.gd:1503), which B6/B7's plan rewrites trivially and this refactor doesn't touch.

## 10. Effort breakdown

| Work | Engine | Effort |
|---|---|---|
| New `Predicates` registry + atomic table (12 primitives) | Godot | M (~4h) |
| New JS `ATOMIC_PREDICATES` table + evaluator | Proto | M (~4h) |
| `evaluate()` walker + function-call shorthand parser + tests | both | S (~4h) — includes `_parse_call`, `_split_args`, `_coerce_arg` with whitespace/quoting/type-coercion |
| Add `card_zone_change` emission alongside legacy events | Godot | S (~2h) |
| Add `card_zone_change` emission alongside legacy events | Proto | M (~4h) — more emit sites |
| Boot-validation rewrite (handle bare + function-call + dict forms) | both | S (~3h) |
| Card data migration — 2 .tres files | Godot | S (~30 min) |
| Card data migration — proto script + manual verification | Proto | M (~5h) including golden-event tests + the redundancy-cleanup pass |
| Migrate `trigger-generator.js` to emit composed shorthand | Proto | S (~2h) |
| Remove legacy emissions + legacy `condition_predicate` field + `self_only` flag | both | S (~2h) |
| New unit tests for evaluator + parser + each atomic + zone-change emission | both | M (~5h) |

**Total: ~35–37 hours = L** (multi-day, but cleanly sliceable).

## 11. Sequenced migration plan

Each step leaves both engines in a runnable, test-passing state.

1. **Add atomic predicate primitives alongside the existing monolith.** Both engines: introduce `_ATOMICS` table with the 12 primitives. Existing `opp_lost_life_this_turn` (Godot) and the 14 proto compounds keep working unchanged. Run all tests; semantic no-op.
2. **Add `evaluate()` accepting String OR Array OR Dict.** Single-name lookup routes through the existing path; new shapes route through the new walker. Wire `engine.gd:1335` (`Predicates.evaluate`) and `triggers.js:121` (`evalTriggerCondition`) to call the new entry point. Tests: 6–8 evaluator unit tests covering each shape + malformed input.
3. **Emit unified `card_zone_change` alongside legacy events.** Godot: add a `_fire_zone_change(card, from, to, controller)` helper; call it from `_run_sbas` (alongside `card_dies`) and from `_do_play_land`/`_resolve_spell_entry` (alongside `card_etb`). Proto: same pattern at the 6 existing `cardEntersBattlefield` sites, 3 `cardDies` sites, and inside `emitLeavesBattlefield`. Listeners that subscribe to the new event start receiving notifications; nobody subscribes yet. No behavior change.
4. **Boot validator rewrite.** New recursive walker. Continues to accept the legacy `condition_predicate` field. New `condition` field is also validated. Add event-kind validation. Tests: malformed expression detected at boot.
5. **Migrate Godot cards (2 files).** Pyromaniac and Bloodlust Berserker switch to `event: "card_zone_change"` and composed `condition`. Run `tests/test_phase4*.gd` — both cards' integration tests must pass with the new shape. Legacy emissions still firing means a card could double-trigger if migrated incompletely; an integration test enforces single-trigger semantics.
6. **Migrate proto cards via script.** Run `tools/migrate-triggers.js` against `cards/*/card.json`. Run `node tests/run_all.js` (the existing 482 assertions). Add golden-event tests for the 14 trigger archetypes. Hand-verify ~10 cards across archetypes (`bloodthirstyStalker`, `goblinChieftain`, `morticianAssistant`, `wizardAdept`, etc.).
7. **Migrate `trigger-generator.js`.** Rewrite `GENERATOR_CONDITIONS` entries to produce the composed shape. `noSelfCascade` becomes an `another_card` term. Mercurial Adept + Architect's Codex runtime composition exercise this path naturally; selfplay harness (`tests/selfplay_harness.js 500 bughunt`) is the regression check.
8. **Remove legacy emissions and legacy fields.** Delete `card_etb`/`card_dies`/`cardEntersBattlefield`/`cardDies`/`cardLeavesBattlefield` emit sites. Delete `self_only` and `condition_predicate` handling in both engines. Delete the 14 proto monolithic predicates from `triggers.js`. Boot validator stops accepting the legacy field name.
9. **Update `docs/DIVERGENCE.md`** rows E1 and E2 to mark implemented (or move to a "Recently aligned" section). Update `docs/RULES.md` §1002 to describe the unified event vocabulary as canonical.

**Which engine first?** Run steps 1–4 in **both engines in parallel** (they don't touch each other). Run step 5 (Godot card migration) before step 6 (proto card migration) — Godot's 2-card pool is the lower-stakes proving ground for the evaluator. If issues surface in step 5, fix the evaluator before unleashing the script on 258 proto cards.

## Critical files for implementation

- `engine/predicates/predicates.gd`
- `engine/engine.gd`
- `reference/html-proto/js/triggers.js`
- `reference/html-proto/js/engine.js`
- `reference/html-proto/js/trigger-generator.js`
- `data/card_resource.gd`
- `cards/templates/*.tres` (Godot card data migration)
- `reference/html-proto/cards/*/card.json` (proto card data migration)
- `reference/html-proto/tools/migrate-triggers.js` (new — proto migration script)
