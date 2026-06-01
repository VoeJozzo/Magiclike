# Unified Type System (`types[]`) — Design Spec (html-proto)

## Context
The engine models a card's type as a single `card.type` string + a separate `card.sub`
subtype string + a `legendary` boolean — effectively **three parallel identity fields**.
This blocks (a) multi-type permanents (artifact creatures "Robots", artifact lands), (b)
type-changing effects ("becomes an artifact", manlands), and (c) a data-driven typeline.

This spec replaces those three fields with **one unified `types[]` identity array + a small
behavior registry**, and lays out a phased, low-risk migration. It is the design-of-record
for that work.

**Sequencing:** deliberate, phased, **pulled by need** — not speculative. Phase 1 is additive
(safe to land anytime); later phases land when the first multi-type card needs them.
**Verified current state:** 258 cards, **zero dual-types today** (Creature 170, Instant 42,
Sorcery 38, Land 7, Artifact 1), so the migration is purely additive — no existing dual-type
data to reconcile.

---

## The model

### 1. Identity — one `types[]` array
- Replace `card.type` (string) + `card.sub` (space-separated string) with **`card.types`**, an
  array of tags: `["Creature","Goblin"]`, `["Artifact","Creature"]`, `["Land","Forest"]`,
  `["Sorcery","Goblin"]`.
- A **type registry** resolves each tag → `{ category, behaviorClass?, traits? }`.
  `category` ∈ `type | subtype` (`supertype` reserved — see Legendary).
- Single accessor **`hasType(card, t)`** (membership over the *effective* set) replaces every
  `card.type === X` and `card.sub` regex read.

### 2. Layering — types are mutable, live-derived
Mirror the existing **keyword-grant** system exactly (it already solved this for keywords):
- `card.types` = base tags (from the card / staple synthesis).
- A modifier layer: `typeGrantedBy` Map (permanent, revoked on source leave-play) + an EOT lane
  (revoked at cleanup) — identical shape to `grantedBy` / `eotGrants`
  (`applyStaticKeywordGrants` ~engine.js:2787, `applyGrant` ~3580,
  `clearRestrictionsFromSource` ~3596, EOT cleanup ~5670).
- **Effective types = base ∪ added − removed, derived live.** BOTH readers (`hasType` and the
  trait registry) query the effective set live; **nothing type-derived is baked onto the
  instance** — so "becomes/loses a type" reverts cleanly with no stale state.

### 3. Governance — two forks, not one hierarchy
1. **Permanent vs Spell** (fundamental fork). Spell tags: `Sorcery` (Instant retired, §7).
   Permanent tags: `Creature`, `Land`, `Artifact`, `Enchantment`. Any permanent tag ⇒ permanent.
   In fusions, **permanent absorbs spell** (spell effect → ETB).
2. **Among permanents, body/entry governance:** `Creature > Land`. `Artifact`/`Enchantment` are
   **co-types** outside this precedence — they ride along as descriptors; when they're the only
   permanent tags, the default is "inert cast permanent" (= a bare artifact today).
- A `governingType(card)` resolver answers the single-answer questions (permanent-or-spell,
  cast-or-play, resolve-zone). `hasType` answers membership (filters/counts/text).

### 4. Behavior registry — bounded, not a god-object
Per tag: optional `behaviorClass` (`spell | permanent | land`, drives `governingType`) +
optional `traits` (small named hooks only: `manaProduction` for Forest→{G}, `resolveZone` for
Sorcery→graveyard, `sba` for Legendary→legend rule).
**Discipline:** cross-cutting behavior (Creature combat/sickness, Land play-rules) stays as named
engine code read via `hasType`/`governingType` — it is NOT a registry hook. The registry holds
the long tail of simple/local traits. Keywords remain a **separate** `keywords[]` (granted
abilities), never folded into types.

### 5. Two operations — opposite behavior (the key distinction)
- **Type-change effect** (manland animate, "becomes an artifact") = one card's identity changes →
  **UNION** (add/remove a tag in the modifier layer). No effect-folding. In-play, types stack
  freely: an animated manland is genuinely `Land + Creature` (taps for mana via its *explicit*
  ability; attacks via Creature; the play-vs-cast conflict only exists at *entry*, already past).
- **Staple / splice** (fuse two cards) = governed by the compatibility table: **same-class →
  union tags** (Artifact + Creature = Artifact Creature); **cross-class → collapse** (permanent
  wins; spell's *type* dropped, *effect* → ETB) — exactly today's behavior. Applies at reward-time
  AND in-game (`canonicalSplicePair` ~engine.js:88, `mergeStapleInto` ~422,
  `apply_in_game_splice` ~2246, `mergeSpliceData` ~161).
- New sticker kinds `add_type` / `set_types` persist type-change, following the `set_color`
  template (`applyStickerKindEffect` ~stickers.js:17, `RUN.applyStickerToSlot` ~run.js:990,
  owner==='you' gate at `apply_sticker` ~engine.js:1776).

### 6. Collapse is total + warn-don't-reject
Every tag set resolves to a deterministic governing behavior via the two forks. Authoring a
cross-class base card ("Sorcery Creature") is a **boot-validation warning, not a rejection** — the
engine still handles it (collapses predictably). Extend `validateAllCardEffects` (~engine.js:2696)
with a type-tag coverage + cross-class sanity scan.

### 7. Retire `Instant` → flash `Sorcery`
Delete the `Instant` type; an old Instant = a `Sorcery` with the `flash` keyword. The casting
gate (`isInstantWindow` ~engine.js:4925 / `isSorceryWindow` ~4935; checks ~4998-5004, ~5274-5277)
stops branching on `type === 'Instant'` and gates purely on `hasKeyword('flash')` (flash → instant
window; else sorcery window). 42 cards migrate to `Sorcery + flash`. Reuses the existing
flash-creature timing path.

### 8. Subtypes fold in — no "Tribal" wart
`card.sub` (space-string) → subtype tags in `types[]` (`category: subtype`). Subtypes carry **no
behavior-class**, so any subtype attaches to any type (`Sorcery — Goblin`, `Land — Forest`) with
no permission-granting "Tribal/Kindred" type. Migrate: `card_has_subtype` (~triggers.js:28) →
`hasType`; subtype stickers / `subtypeRolls` (~stickers.js:80, `rollSubtypeFromDeck` ~244) write
subtype tags; `static_buffs` subtype filter (~engine.js:2801) → `hasType`.

### 9. Legendary as a tag
`legendary` boolean → a `Legendary` tag whose registry entry carries an `sba` trait = the legend
rule (currently a cast-time check, ~engine.js:4995). The model case for "a type carries a bounded
behavior" without bloating the registry.

### 10. Typeline parser
Replace the hardcoded `card.type + ' — ' + card.sub` (`render.js:1322`) with a parser rendering the
effective types in canonical order: left-of-dash = (supertypes) + types, right-of-dash = subtypes,
stable within each (driven by registry `category`).

---

## Migration — 4 phases (+ a prereq), each shippable & green

- **Phase 0 (prereq, separable):** Magic-style summoning sickness — track a `controlledSince` turn
  stamp instead of the entry-type `sick` flag (set ~engine.js:1514; clear ~2020/5554/5713; gate
  ~4486/5049). Needed for manlands animated the turn they entered; already on the user's to-do.
  Lands independently of the type work.
- **Phase 1 (additive, ZERO behavior change — safe now):** add `card.types` (derived at load from
  `type`+`sub`), `hasType()`, `governingType()`, the registry skeleton, the typeline parser. Keep
  `card.type`/`card.sub` as **derived accessors** off `types[]`. Suite stays green untouched.
- **Phase 2 (mechanical, incremental):** convert the ~34 descriptive reads → `hasType`, the ~16
  behavioral reads → `governingType`/`hasType` preserving exact gates. Batch by module
  (engine → ai → render → card-text); suite + selfplay green each batch.
- **Phase 3 (data + capabilities, pulled by need):** author `types[]` in card JSON & drop the
  derived accessors; retire Instant (42 → Sorcery+flash); fold subtypes into `types[]`; Legendary →
  tag+sba; add `add_type`/`set_types` stickers + the `typeGrantedBy` modifier layer; teach staple
  synthesis to UNION same-class types.
- **Phase 4 (proof):** first multi-type cards — a Robot (`Creature`+`Artifact`), an artifact land —
  + a data-driven basic-land mana trait, as the end-to-end demonstration.

---

## Files to touch (patterns + representative anchors; reuse existing where noted)
- **New `js/types.js`** (IIFE): the registry, `hasType`, `governingType`, typeline parser,
  type-modifier helpers.
- **`js/engine.js`:** read conversions (cast gates ~4986-5004, zone routing ~4146, sickness gates
  ~4486/5049); staple union (`canonicalSplicePair` ~88 / `mergeStapleInto` ~422 /
  `apply_in_game_splice` ~2246); the type-modifier layer mirroring `grantedBy` (~2787/3580/3596/5670);
  `add_type`/`set_types` in `apply_sticker` (~1776); `validateAllCardEffects` coverage (~2696);
  legendary SBA (~4995). **Reuse:** `grantedBy`/`eotGrants`/`applyGrant`/`clearRestrictionsFromSource`,
  `canonicalSplicePair`/`mergeStapleInto`/`mergeSpliceData`, `validateAllCardEffects`.
- **`js/ai.js`:** ~20 descriptive reads → `hasType` (creature pools ~166/434/478/1269; scoring ~47/974).
- **`js/render.js`:** typeline parser (1322); descriptive reads (frames/labels ~750/1292/1295,
  P/T gate 353); UI gates (~856/870).
- **`js/card-text.js`:** text-gen reads (~766/794/825) → `hasType`.
- **`js/stickers.js`:** subtype sticker/`subtypeRolls` → subtype tags (~80/244); `add_type`/`set_types`
  via `applyStickerKindEffect` (~17). **Reuse:** `apply_sticker`/`applyOneStickerToRuntimeCard`/`RUN.applyStickerToSlot`.
- **`js/triggers.js`:** `card_has_subtype` (~28) → `hasType`.
- **`js/run.js`:** type-sticker slot persistence (`RUN.applyStickerToSlot` ~990) — reuse as-is.
- **`cards/*/card.json`:** Phase 3 data migration (`type`+`sub` → `types[]`; Instant → Sorcery+flash).

---

## Deferred / explicitly out of scope
- **True Land-Creatures** (Dryad-Arbor style, played-AND-creature at *entry*): NOT supported.
  Land+Creature collapses to a cast creature; manlands sidestep this via in-play type-change.
- **Descriptor-only tags** (an artifact-flavored *sorcery*): parked. Would need a "tag present,
  behavior-class not invoked" marker. Niche; revisit only if a card demands it.
- **P/T on noncreatures:** store always (`getStats` stays unopinionated ~922), gate display/use on
  `hasType('Creature')` — already effectively true (only explicit gate is `render.js:353`).

---

## Verification (per phase)
Baseline each phase: `node tests/run_all.js` (currently **1200 green**) + `npm run lint` clean +
`node tests/selfplay_harness.js 300` clean.
- **Phase 1:** `test_types_identity.js` — `hasType`/`governingType` agree with legacy `type`/`sub`
  for all 258 cards (derived-accessor equivalence); typeline parser reproduces today's `type — sub`.
- **Phase 3 per-capability:** staple unions same-class (Artifact+Creature → both tags, behaves as a
  creature) & collapses cross-class (Sorcery+Creature → creature + ETB); type-change effect adds a
  tag then EOT/leave-play reverts it (modifier layer); Instant→flash-Sorcery casts at instant speed;
  Legendary SBA fires; subtype-matters still fires via `hasType`.
- **Phase 4:** Robot end-to-end (cast as creature; dies to creature removal AND "destroy target
  artifact"; counts for artifact-matters); manland animate (taps for mana + attacks, still a land),
  exercising the Phase-0 sickness rule.

(All line anchors are approximate — function names are the stable references.)
