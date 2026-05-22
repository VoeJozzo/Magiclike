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
For each proto predicate, the atomic checks it bundles (using the human-readable names introduced in §5):

| Predicate | Event | Atomic conditions bundled |
|---|---|---|
| `thisEnters` | ETB | `this_card` |
| `anotherCreatureYouEntersStrict` | ETB | `another_card` + `card_is_creature` + `card_is_yours` |
| `anotherCreatureYouEntersOfSubtype` | ETB | `another_card` + `card_is_yours` + `card_has_subtype(sub)` (currently no `is_creature` — subtype is creature-only de facto) |
| `thisAttacks` | attacks | `this_card` |
| `thisAttacksAfterOppLifeLoss` | attacks | `this_card` + `opp_lost_life_this_turn` |
| `creatureYouAttacksOfSubtype` | attacks | `card_is_yours` + `card_has_subtype(sub)` |
| `thisDies` | dies | `this_card` |
| `thisLeaves` | leaves | `this_card` |
| `anotherCreatureDies` | dies | `another_card` + `card_is_creature` |
| `anyCardDies` | dies | (none — fires always) |
| `thisKillsCreature` | dies | `another_card` + `card_is_creature` + `card_damaged_by_this` |
| `youGainLife` | lifeGained | `is_life_gain` + `affected_player_is_you` |
| `youCastSpell` | spellCast | `another_card` + `card_is_yours` |
| `youCastCounterspell` | spellCast | `another_card` + `card_is_yours` + `card_has_effect("counter_spell")` |

**Observation.** All 14 collapse to combinations of ~12 atomic primitives plus 2 parameterized ones (`card_has_subtype`, `card_has_effect`).

## 3. Unified event vocabulary (proposed)

Replace the dies/leaves duality with a single `card_zone_change` event plus retained specialized events where shape genuinely differs:

```
card_zone_change   {kind, subject_iid, subject_card, controller, from_zone, to_zone, killed_by_iid?}
spell_cast         {kind, subject_iid, subject_card, controller}
attacks            {kind, subject_iid, subject_card, controller, defender_key}
life_changed       {kind, who, delta, source_iid?}        # gain → delta>0, loss → delta<0
damage_dealt       {kind, source_iid, target_iid_or_who, amount, is_combat}   # reserved; future
```

**Why a single zone-change event:** "dies" = `to_zone:"graveyard"` AND `from_zone:"battlefield"` AND `card_is_creature`; "bounced" = `to_zone:"hand"` from `"battlefield"`; "exiled" = `to_zone:"exile"`. The trigger writes those constraints as composable predicates — no separate event kinds required.

**Why specialized `attacks`, `spell_cast`, `life_changed` stay:** their payloads don't fit the zone-change schema (no `from_zone`, no `to_zone`, different subject semantics — the "subject" of `attacks` is a creature still on the battlefield, not changing zones).

**Why one `life_changed` (not two):** sign carries the direction. Triggers like `youGainLife` express the constraint with `is_life_gain`. Matches the DIVERGENCE.md D4 redesign already on file.

### 3.1 ETB ergonomics
`card_etb` is so common that listeners benefit from a shorthand. Two viable shapes; recommend (a):

- **(a)** Emit ONLY `card_zone_change` from non-battlefield → battlefield. Predicate registry exposes `card_moves_to(battlefield)` so the common ETB pattern is `[this_card, card_moves_to("battlefield")]`. No alias.
- **(b)** Emit BOTH `card_zone_change` and a legacy alias `card_etb`. Easier migration; permanent debt.

Pick (a). The migration window in §11 keeps the old emission temporarily so both can coexist during cutover — no permanent alias.

### 3.2 Verification by predicate enumeration
Every one of proto's 14 predicates maps cleanly:

- `thisDies` → `card_zone_change` + `[this_card, card_moves_to("graveyard"), card_is_creature]`
- `thisLeaves` → `card_zone_change` + `[this_card, card_moves_from("battlefield")]`
- `anotherCreatureDies` → `card_zone_change` + `[another_card, card_is_creature, card_moves_to("graveyard"), card_moves_from("battlefield")]`
- `thisKillsCreature` → `card_zone_change` + `[another_card, card_is_creature, card_moves_to("graveyard"), card_damaged_by_this]`
- `youCastCounterspell` → `spell_cast` + `[card_is_yours, another_card, card_has_effect("counter_spell")]`

(...and the remaining 9 by mechanical decomposition.)

## 4. Predicate composition format (card data)

Accept three shapes on `triggered_abilities[i].condition`:

| Shape | Meaning |
|---|---|
| `""` or omitted | Always true (current behavior preserved) |
| `"name"` (String) | Single atomic; look up by name, call with empty params |
| `["a", "b", {"name":"c","params":{...}}]` (Array) | AND of every term |
| `{"op":"and"\|"or"\|"not", "terms":[...]}` (Dict) | Boolean tree |
| `{"name":"x", "params":{...}}` (Dict) | Single parameterized atomic |

The field is renamed `condition` (was `condition_predicate`). A migration shim accepts both names during the cutover; `condition_predicate` is removed in the final cleanup step.

**`self_only: true` is removed** in favor of explicit `this_card` in the predicate list — the spelling is consistent with every other constraint.

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
        {"name": "card_moves_to", "params": {"zone": "graveyard"}},
        "card_is_creature",
        "opp_lost_life_this_turn",
    ],
    "effects": [{"kind": "damage", "amount": 2, "target": "opponent"}],
}]
```

Reads almost as English: "this card, it moves to the graveyard, it's a creature, and the opponent lost life this turn."

### 4.2 Worked composition: hypothetical "When another creature you control enters and you control a flier"

```
"condition": [
    "another_card",
    "card_is_creature",
    "card_is_yours",
    {"name": "card_moves_to", "params": {"zone": "battlefield"}},
    {"name": "you_control_creature_with_keyword", "params": {"keyword": "flying"}},
]
```

Built from primitives — no new monolithic predicate, no new registry entry.

## 5. Atomic predicate registry (starter set)

All take `(state, source, event, params) -> bool`. Naming convention: read like English. In MTG terminology, "this card" means the trigger source; "another card" means a card that is NOT the trigger source. Tense for action-on-the-card predicates: present (matches MTG card text — "when this creature dies," not "died").

**Card predicates** (event has a subject card — applies to `card_zone_change`, `spell_cast`, `attacks`):

| Name | Params | Purpose |
|---|---|---|
| `this_card` | — | The event's card IS the trigger source. Replaces `self_only:true`. Matches MTG's "this creature / this card" phrasing. |
| `another_card` | — | The event's card is NOT the trigger source. |
| `card_is_creature` | — | The event's card has type "creature". |
| `card_is_yours` | — | The event's card is controlled by the trigger source's controller. (For spell_cast: the spell's caster is you.) |
| `card_is_opps` | — | The event's card is controlled by the opponent of the trigger source's controller. |
| `card_moves_from` | `{zone}` | Zone-change event's `from_zone` matches. |
| `card_moves_to` | `{zone}` | Zone-change event's `to_zone` matches. |
| `card_has_subtype` | `{subtype}` | Event's card template has the named subtype. |
| `card_damaged_by_this` | — | Event's card's `damaged_by_sources` includes the trigger source. Composes with `card_moves_to("graveyard")` to express MTG's "killed credit" semantics. (Requires combat-credit tracking, which Godot doesn't have yet — see DIVERGENCE C5; gated until that lands.) |
| `card_has_effect` | `{kind}` | Event's card template has an `on_cast_effects` entry with matching `kind`. Used for "whenever you cast a [counterspell / damage spell / etc.]" triggers; `kind` matches the effect-kind names from SPEC.md (`damage`, `gain_life`, `counter_spell`, etc.). |

**Life-event predicates** (apply to `life_changed` — events with a player subject but no card subject):

| Name | Params | Purpose |
|---|---|---|
| `is_life_gain` | — | `event.delta > 0`. Filters the `life_changed` event to gain direction. |
| `is_life_loss` | — | `event.delta < 0`. Filters to loss direction. |
| `affected_player_is_you` | — | `event.who == source.controller_key`. The player whose life changed is the trigger's controller. |
| `affected_player_is_opp` | — | `event.who == opponent_of(source.controller_key)`. |

Note: `is_life_gain` / `is_life_loss` are predicates on the `life_changed` event (current event's direction) — DIFFERENT from D4's redesigned `gain_life` effect, which is what PRODUCES the event. The effect's signed amount produces a `life_changed` event with matching delta sign; the predicate filters on that delta. Different layers, complementary.

**Game-state predicates** (historical state of the world; no event reference):

| Name | Params | Purpose |
|---|---|---|
| `you_lost_life_this_turn` | — | `player_by_key(source.controller_key).life_lost_this_turn > 0`. Historical — true at any moment after you've lost life this turn, regardless of which event is currently firing. |
| `opp_lost_life_this_turn` | — | (existing predicate, kept verbatim for parity with Bloodlust Berserker). Same historical semantics. |

Note: distinct from `is_life_loss` + `affected_player_is_you`. That pair is event-instant ("fire when THIS event is your life loss"); `you_lost_life_this_turn` is historical ("fire when X happens IF you lost life earlier this turn"). Bloodlust Berserker uses the historical one — checks at the moment of its death, not at the moment of the life loss.

That's **16 primitives** covering all 14 proto compounds. Each is 1–5 lines. Adding a new card-specific atomic is one new entry plus one registry registration.

Predicates that were considered but dropped:
- `event_controller_is_self` (for `spell_cast`) — redundant with `card_is_yours`, which works for spell_cast too (the spell's controller IS the card's controller).
- `event_kind_is(kind)` — redundant with the trigger's `event` field, which already specifies which event kind to listen for.
- `card_killed_by_self` — decomposed into `card_damaged_by_this` + zone-change conditions. The bundled predicate hid what's really happening: "killed by me" = "I damaged it" + "it died from the battlefield."

When future events introduce multiple cards (e.g., a hypothetical "creature deals damage to creature" event with both `attacker` and `defender` subjects), introduce `attacker_*` and `defender_*` prefixes for that event specifically — same pattern, per-event-type prefixes only when there's genuine ambiguity.

**For discard triggers** ("when you discard a card, do X") — note that discard is a `card_zone_change` event (`from_zone: "hand"`, `to_zone: "graveyard"`), not a player-subject event. Use `[card_is_yours, card_moves_from("hand"), card_moves_to("graveyard")]`. `affected_player_is_you` is for events without a card subject only.

## 6. Evaluator design

```gdscript
# Pseudocode (Godot)
static func evaluate(expr, ctx: Dictionary) -> bool:
    # ctx = {state, source, event}
    if expr == null or expr == "":
        return true
    if expr is String:
        return _call_atomic(expr, ctx, {})
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
            return _call_atomic(expr["name"], ctx, expr.get("params", {}))
    push_warning("evaluate: malformed expression %s — false" % str(expr))
    return false

static func _call_atomic(name, ctx, params) -> bool:
    var fn = _ATOMICS.get(name)
    if fn == null:
        push_warning("Unknown atomic predicate '%s'" % name)
        return false
    return fn.call(ctx.state, ctx.source, ctx.event, params)
```

`_ATOMICS` is a `Dictionary[String, Callable]` populated at boot from a static table. Proto's JS version is identical in structure, swapping `Callable` for arrow functions and `match` for `switch`.

## 7. Card data migration

**Godot (2 cards):**
- `cards/templates/pyromaniac.tres` — `card_etb` + `self_only:true` → `card_zone_change` with `[this_card, card_moves_to("battlefield")]`.
- `cards/templates/bloodlust_berserker.tres` — see §4.1 worked example.

Hand-translate. Two `.tres` files; mechanical script not worth writing.

**Proto (audit ~80–120 cards with triggers; ~258 total):**
Mechanical migration with a small Node script (`reference/html-proto/tools/migrate-triggers.js`) that:
1. Walks `cards/*/card.json`.
2. For each `triggers[]` entry, looks up its `condId` in a translation table mapping the 14 monolithic IDs to the decomposed expressions.
3. Rewrites `event` per the unified vocabulary (`cardDies`/`cardLeavesBattlefield` → `card_zone_change`; `cardEntersBattlefield` → `card_zone_change`; `spellCast`/`attacks`/`lifeGained` → underscore-cased equivalents).
4. Writes `condition` (the new compose-shape) and removes `condId` and `params`.

Add a test (`tests/test_trigger_migration.js`) that asserts every migrated card's trigger fires under the same conditions as before, using a golden-event harness — feed in a synthetic event, check pass/fail symmetry for each (card, scenario) pair.

`generateRandomTrigger` / `generateConditionOptions` in `trigger-generator.js` need an analogous rewrite: the `GENERATOR_CONDITIONS` table emits the new composed shape directly. `noSelfCascade` becomes an `another_card` term in the generated expression — no special-case field on the trigger.

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
        if expr != "" and not _ATOMICS.has(expr):
            out.append("%s.%s" % [card_id, expr])
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
| New `Predicates` registry + atomic table (16 primitives) | Godot | M (~4h) |
| New JS `ATOMIC_PREDICATES` table + evaluator | Proto | M (~4h) |
| `evaluate()` recursive walker + tests | both | S (~3h) |
| Add `card_zone_change` emission alongside legacy events | Godot | S (~2h) |
| Add `card_zone_change` emission alongside legacy events | Proto | M (~4h) — more emit sites |
| Boot-validation rewrite + event-kind validation | both | S (~3h) |
| Card data migration — 2 .tres files | Godot | S (~30 min) |
| Card data migration — proto script + manual verification | Proto | M (~5h) including golden-event tests |
| Migrate `trigger-generator.js` to emit composed shape | Proto | S (~2h) |
| Remove legacy emissions + legacy `condition_predicate` field + `self_only` flag | both | S (~2h) |
| New unit tests for evaluator + each atomic + zone-change emission | both | M (~5h) |

**Total: ~34–36 hours = L** (multi-day, but cleanly sliceable).

## 11. Sequenced migration plan

Each step leaves both engines in a runnable, test-passing state.

1. **Add atomic predicate primitives alongside the existing monolith.** Both engines: introduce `_ATOMICS` table with the 16 primitives. Existing `opp_lost_life_this_turn` (Godot) and the 14 proto compounds keep working unchanged. Run all tests; semantic no-op.
2. **Add `evaluate()` accepting String OR Array OR Dict.** Single-name lookup routes through the existing path; new shapes route through the new walker. Wire `engine.gd:1335` (`Predicates.evaluate`) and `triggers.js:121` (`evalTriggerCondition`) to call the new entry point. Tests: 6–8 evaluator unit tests covering each shape + malformed input.
3. **Emit unified `card_zone_change` alongside legacy events.** Godot: add a `_fire_zone_change(card, from, to, controller)` helper; call it from `_run_sbas` (alongside `card_dies`) and from `_do_play_land`/`_resolve_spell_entry` (alongside `card_etb`). Proto: same pattern at the 6 existing `cardEntersBattlefield` sites, 3 `cardDies` sites, and inside `emitLeavesBattlefield`. Listeners that subscribe to the new event start receiving notifications; nobody subscribes yet. No behavior change.
4. **Boot validator rewrite.** New recursive walker. Continues to accept the legacy `condition_predicate` field. New `condition` field is also validated. Add event-kind validation. Tests: malformed expression detected at boot.
5. **Migrate Godot cards (2 files).** Pyromaniac and Bloodlust Berserker switch to `event: "card_zone_change"` and composed `condition`. Run `tests/test_phase4*.gd` — both cards' integration tests must pass with the new shape. Legacy emissions still firing means a card could double-trigger if migrated incompletely; an integration test enforces single-trigger semantics.
6. **Migrate proto cards via script.** Run `tools/migrate-triggers.js` against `cards/*/card.json`. Run `node tests/run_all.js` (the existing 362 assertions). Add golden-event tests for the 14 trigger archetypes. Hand-verify ~10 cards across archetypes (`bloodthirstyStalker`, `goblinChieftain`, `morticianAssistant`, `wizardAdept`, etc.).
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
