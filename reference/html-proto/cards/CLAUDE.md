# Card author's handbook (`cards/`)

How to write a `card.json` that does what its text says. This file is the
required first read for ANY agent (or human) authoring or reviewing cards —
it exists because two design waves measured exactly where MTG intuition and
this engine part ways. Wire-format spec: [`docs/PROTOCOL.md`](../../../docs/PROTOCOL.md).
Engine module map: [`../CLAUDE.md`](../CLAUDE.md).

## Anatomy

One folder per card; folder name = `card_id` = the tplId. Register the folder
name in `cards/_manifest.json` (forgetting this = card silently absent).

```json
{
  "card_id": "example_bear",
  "art": "🐻",
  "cost": { "G": 1, "C": 1 },
  "name": "Example Bear",
  "power": 2,
  "toughness": 2,
  "types": ["Creature", "Bear"]
}
```

- **`cost`**: flat object, keys `W U B R G` + `C` for generic. No brace
  strings, no dual keys. `{G:1, C:1}` renders as `{1}{G}`.
- **`types`**: one array, THE source of type identity (`js/types.js`).
  Governing types (`Creature`, `Sorcery`, `Land`, `Artifact`) + subtypes +
  supertypes (`Basic`, `Legendary`) all live here. Unknown tags are treated
  as subtypes automatically — no registry edit needed for a new tribe.
- **`art`**: `"art.png"` (file in the card's folder) or a single emoji
  placeholder. Every card has one.
- **`keywords`**: array; the registry is `KEYWORDS` in `js/cards.js`.

Ingestion (`js/cards.js ingestCard`) applies exactly four transforms:
`card_id`→`tplId`; derive `color`/`colors` from cost (kept if you author
them — so don't); desugar string-effect shorthand (`"draw(2)"` → the
`move_card` dict); auto-grant tap-for-mana abilities to basic-land subtypes.

## The traps — where MTG intuition is wrong here

1. **There is no Instant type.** Instant-speed = `"types": ["Sorcery"]` +
   `"keywords": ["flash"]`. The engine keys castability off the keyword only.
   Writing `"Instant"` produces a card that can never be cast reactively.
2. **Card text is GENERATED from your effects** (`js/card-text.js`). Never
   write a `text` field — it's dead weight unless `custom_text: true`
   (special cards only), and `test_no_dead_text.js` fails the suite on dead
   text fields. If the generated text reads wrong, the card DATA is wrong
   (or the generator needs a case — that's engine work, not a text field).
3. **Targeting is a top-level step, not a per-effect field.** Put `target`
   (and optional `target_filter` beside it) on the card / trigger / ability.
   A `target:` key INSIDE an effects-array entry does not resolve at spell
   resolution — the effect silently falls back to its default (measured:
   Wave 1's counterspell rider drained its own caster). Multi-target cards
   use card-level `target_slots: [...]` + per-effect `target_slot: N`
   (+ `distinct_targets: true` for "another target"). Source-exclusion
   ("ANOTHER target creature you control") = `target_filter: {another: true}`.
4. **Trigger conditions are flat AND-arrays of registered predicate strings**
   (`js/triggers.js ATOMIC_PREDICATES` — 12 + any-of args). `{op:'or'}` trees
   evaluate at runtime BUT break archetype classification (generic card text,
   degraded AI). OR semantics = two triggers, or a multi-arg predicate.
   **Term order is load-bearing**: match the order used in
   `_ARCHETYPE_BY_SIG` (`js/triggers.js`) or your trigger classifies to
   nothing — silently. New condition shape? Add the archetype entry + a
   card-text preamble (`js/card-text.js triggerPreamble`) + keep the
   duplicate table in `tests/trigger_migration_test.js` in lockstep.
5. **Spell-cast triggers resolve ABOVE the spell that caused them** (MTG
   rule, deliberately). A "when you cast a pump spell, ping" design pings
   BEFORE the pump lands. If the effect must see the spell's result, it
   wants the static spell-modifier shape, not a trigger.
6. **`another_card` on spell_cast triggers is wire convention, not function.**
   A card being cast is on the stack and can never hear its own cast (only
   battlefield permanents listen). Keep the term in the wire (it's part of
   the classification signature); generated text correctly says "a spell."
7. **Some types confer abilities automatically — write the type, not the
   ability.** Two layers: (a) `SUBTYPE_KEYWORDS` (`js/engine.js`) implies
   keywords from creature subtypes — Angel/Dragon→flying, Treefolk→reach,
   Wall→defender; a card typed Dragon must NOT also write `flying` (the
   suite pins this, and Wave 1.5 killed three patches for proposing implied
   keywords). (b) Basic-land subtypes (Forest, Island, …) auto-grant the
   tap-for-mana ability at ingest — a land's `mana` field is display-only
   (pips/frame); non-basic mana production needs an explicit
   `{cost:{tap:true}, effects:[{kind:'add_mana', ...}]}` ability.
8. **"Draw" and library→hand are the same zone event.** The engine cannot
   distinguish a draw from a tutor in `card_moves(library, hand)` triggers.
   (House style ruling pending — see BACKLOG.)
9. **Retired effect kinds** must not appear in card templates: `draw`,
   `discard`, `flicker`, `edict`, `steal`, `gainControl`, `damageAll`,
   `weaken`, bare `add_counter` for +1/+1 (use `pump` with
   `duration:"permanent"`), and friends — `tests/effect_migration_test.js`
   is the enforcing list. The string SHORTHAND `"draw(2)"` is fine (it
   desugars to `move_card` at ingest); the dict `{kind:"draw"}` is not.
10. **All boot validation is warn-only.** Nothing rejects a card — a broken
    card loads and misbehaves. The console warnings (unknown events,
    predicates, effect kinds, filter keys — filter-key checking exists since
    v2.2.x) and the node suite are the only nets. Run both; read the output.

## Vocabulary — where the source of truth lives (don't trust copies)

These lists drift as the engine grows; this doc deliberately does NOT
enumerate them. Read the table you need at its home:

- **Effect kinds** → keys of the `EFFECTS` dispatch table, `js/engine.js`
  (e.g. `damage`, `pump`, `move_card`, `affect_creature`, …).
- **Target strings** → `TARGET_FILTERS`, `js/engine.js`.
- **Filter keys** → `MATCH_FILTER_KEYS`, `js/engine.js`. Unknown keys WARN
  at boot; before v2.2.x a typo silently disabled the restriction.
- **Condition predicates** → `ATOMIC_PREDICATES`, `js/triggers.js`.
- **Trigger events** → `VALID_TRIGGER_EVENTS`, `js/triggers.js` (the five
  the engine actually emits).
- **Keywords** → `KEYWORDS`, `js/cards.js`. Implied ones: `SUBTYPE_KEYWORDS`,
  `js/engine.js`.
- **Trigger archetypes** (classification + text preambles) →
  `_ARCHETYPE_BY_SIG`, `js/triggers.js`.

One behavioral note worth keeping here: **trigger-level `target: "opp"`**
(and other implicit types) auto-resolves with zero UI prompts — the
blood_artist / toll_of_secrets drain shape.

## Shipping checklist

1. Folder + `card.json` + manifest entry + art (emoji placeholder is fine).
2. Boot clean: run the suite; read the summary line AND the warnings.
3. New trigger shape? Archetype entry + preamble + migration-test table.
4. New mechanic? ~2-line extraction rule in `js/buckets.js` (provides/wants)
   so the Growing Deck's synergy graph can see the card — see
   `docs/plans/plan-pool-waves.md` for the vocabulary discipline.
5. Behavior test (see `tests/wave1_cards_test.js` for the harness idiom —
   and its hard-won fixture rules: clear BOTH dealt hands, no lethal damage
   on your own fixtures, fresh game per sub-test).
6. AI usage: a player-facing activated ability needs `pickBestActivation`
   coverage or the AI never uses it; selfplay 500 clean is the gate.
7. Version bump (`js/main.js` + CHANGELOG + proto CLAUDE.md, same number;
   check `origin/dev` for collisions first).

## Observed agent failure modes (measured, waves 1–2)

Invented selectors (`target_player_chosen`); `types: ["Instant"]`; per-effect
`target:` keys on single-target spells; `{op:'or'}` condition trees;
pitch-cost vs JSON-cost mismatches; hand-authored `text` fields; assuming
`card_has_effect` scans triggers (it scans spell-level effects only);
proposing keywords the subtype already implies. Check your output against
this list before returning it.
