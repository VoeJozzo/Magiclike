# Card author's handbook (`cards/`)

How to write a `card.json` that does what its text says — the required
first read for any agent or human authoring or reviewing cards. Wire-format
spec: [`docs/PROTOCOL.md`](../../../docs/PROTOCOL.md). Engine module map:
[`../CLAUDE.md`](../CLAUDE.md).

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
- **`art`**: required; exactly one of two forms — a filename (`"art.png"`,
  resolved inside the card's own folder) or a literal emoji placeholder
  (`"🐻"`). The renderer picks by value; there is no third form.
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
   write a `text` field — the suite rejects dead text fields
   (`test_no_dead_text.js`). If the generated text reads wrong, the card
   DATA is wrong, or the generator needs a case — that's engine work, not
   a text field.
3. **Targeting is a top-level step, not a per-effect field.** Put `target`
   (and optional `target_filter` beside it) on the card / trigger / ability.
   A `target:` key INSIDE an effects-array entry does not resolve at spell
   resolution — the effect silently falls back to its default (e.g. a
   gain_life rider falls back to the controller). Multi-target cards
   use card-level `target_slots: [...]` + per-effect `target_slot: N`
   (+ `distinct_targets: true` for "another target"). Source-exclusion
   ("ANOTHER target creature you control") = `target_filter: {another: true}`.
4. **Trigger conditions are flat AND-arrays of registered predicate strings**
   (`js/triggers.js ATOMIC_PREDICATES` — 12 + any-of args). `{op}` trees
   evaluate at runtime but classify to an archetype ONLY if their exact
   JSON.stringify'd form is a literal key in `_ARCHETYPE_BY_SIG`
   (spellrider's `{op:'not'}` is the shipped precedent) — an unregistered
   tree means generic card text and degraded AI. OR semantics = a
   multi-arg predicate (preferred) or two triggers.
   **Term order is load-bearing**: match the order used in
   `_ARCHETYPE_BY_SIG` (`js/triggers.js`) or your trigger classifies to
   nothing — silently. New condition shape? Add the archetype entry + a
   card-text preamble (`js/card-text.js triggerPreamble`); the migration
   test reads the LIVE table (no duplicate to maintain since v2.2.9), and
   the wave2_cards_test text-golden pattern is the cheap way to lock both.
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
   Wall→defender; a card typed Dragon must NOT also write `flying`.
   (b) Basic-land subtypes (Forest, Island, …) auto-grant the
   tap-for-mana ability at ingest — a land's `mana` field is display-only
   (pips/frame); non-basic mana production needs an explicit
   `{cost:{tap:true}, effects:[{kind:'add_mana', ...}]}` ability.
8. **"Draw" and library→hand are the same zone event.** The engine cannot
   distinguish a draw from a tutor in `card_moves(library, hand)` triggers.
   (House style ruling pending — see BACKLOG.)
9. **All boot validation is warn-only.** Nothing rejects a card — a broken
    card loads and misbehaves. The console warnings (unknown events,
    predicates, effect kinds, filter keys — filter-key checking exists since
    v2.2.x) and the node suite are the only nets. Run both; read the output.

## Vocabulary — where the source of truth lives (don't trust copies)

These lists drift as the engine grows; this doc deliberately does NOT
enumerate them. Read the table you need at its home:

- **Effect kinds** → keys of the `EFFECTS` dispatch table, `js/engine.js`
  (e.g. `damage`, `pump`, `move_card`, `affect_creature`, …).
- **Target strings** → `TARGET_FILTERS`, `js/engine.js`.
- **Filter keys** → `MATCH_FILTER_KEYS`, `js/engine.js` (unknown keys warn
  at boot).
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

## Beyond the format

This doc covers the card FORMAT only. The shipping *process* — tests,
selfplay, versioning, landing — is owned by the **magiclike-card-implementation
skill**; synergy-graph vocabulary discipline lives in
`docs/plans/plan-pool-waves.md`.
