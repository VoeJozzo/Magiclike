# Standardization Handoff — for the Rules-Standardization Session

**Target reader.** The Claude instance on `claude/documentation-and-mapping-wa8Pd`. You shipped `ARCHITECTURE.md`, `SPEC.md`, `REFACTOR-NOTES.md`, and `RULES.md` — work that intersects with the data/structural standardization I shipped on `claude/standardization-BBD8O`. Joe realized the two threads aren't sibling projects; they're the same project at different layers, and asked me to write you what you'd need to (a) decide if/how to integrate this branch's work, (b) replicate it if needed, (c) keep going with rules work on top of what I built.

**Author.** Claude session on `claude/standardization-BBD8O`, May 21–28, 2026.

**Branch state.** 11 commits ahead of `dev`, parallel to yours (we both forked from `b070f1a`). All commits pushed. Pass 1–4 done; Pass 5 reframed but not started.

---

## 0. The thing you most need to know first

**Your docs have stale field/event/effect names because of my Pass 1 renames.** See §1 below for the exact reconciliation. If you start writing or referencing card data using `SPEC.md` or `RULES.md` as the source of truth today, you'll author code/cards using the old vocabulary. Read §1 before anything else.

The conceptual model in `RULES.md` is still correct — the names are just out of date.

---

## 1. Stale references in your existing docs

These changed on this branch. Your docs reference the *old* names. When you next touch these files, sweep them.

### `docs/SPEC.md`

| Line(s) | Old (what your doc says) | New (after Pass 1) | Pass |
|---|---|---|---|
| §1.3 table line 53 | `oracle_text` | `text` | 1d |
| §1.3 table line 56 | `triggered_abilities` | `triggers` | 1d |
| §1.3 worked example line 94 | `oracle_text = "When Bloodlust..."` | `text = "When Bloodlust..."` | 1d |
| §1.3 worked example line 95 | `triggered_abilities = ...` | `triggers = ...` | 1d |
| §1.3 worked example line 96 | `"condition_predicate": "opp_lost_life_this_turn"` | `"cond_id": "opp_lost_life_this_turn"` | 1a |
| §1.4 `pump` block (line 139–148) | `"amount_power"`, `"amount_toughness"` | `"power"`, `"toughness"` | 1a |
| §1.4 `counter_spell` block (line 156–161) | `"counter_spell"` kind, `engine/effects/counter_spell.gd` file | `"counter"` kind, `engine/effects/counter.gd` | 1b |
| §1.5 schema block (line 171) | `"condition_predicate": String` | `"cond_id": String` | 1a |
| §1.5 observed events (line 178) | `"card_etb"` | `"card_enters_battlefield"` | 1c |
| §1.6 entire section uses `condition_predicate` (line 199, 213, 215) | `condition_predicate` (5+ refs) | `cond_id` | 1a |
| §2.1 base fields table | `tplId` (still correct in JS source; **wire format is now `card_id`**) | Wire: `card_id`; JS rebinds to `tplId` internally | 2 |
| §2.1 base fields table line 308–309 | Lists `color`, `colors` as optional fields | Dropped from card.json; recomputed from `cost` at ingest | 2 |
| §2.1 worked example (`cards/bolt/card.json` block lines 336–348) | Has `"tplId": "bolt"`, `"color": "R"`, `"colors": ["R"]` | After migration: `"card_id": "bolt"`, no color fields | 2 |
| §2.2 triggered ability schema (line 356) | `"condId"` | Wire: `"cond_id"`; JS rebinds to `condId` internally | 2 |

**Also worth knowing:** SPEC.md §1.9 lists `iid` as the `CardInstance` field name. Godot actually uses `instance_id` — has always used that name; you got that one wrong (or you took it from the JS naming and meant it as the concept name). The Pass 1 work did NOT rename `instance_id` to `iid` — it was on the gating list and Joe chose to keep `instance_id` on Godot. That decision is recorded at `docs/STANDARDIZATION-PLAN.md` §10 item 6.

Similarly, SPEC.md §1.10 lists `priority_holder` and `winner_key`. Godot's actual `EngineState` fields are `priority_player_key` and `winner` (just `winner`, not `winner_key`). These weren't part of my renames — they're just SPEC.md misreads of the actual code.

### `docs/RULES.md`

| Line(s) | Old | New | Pass |
|---|---|---|---|
| Line 72 (§200.1) | `card_id` in Godot, `tplId` in html-proto | Wire format and Godot internal are both `card_id`; JS-internal stays `tplId`. The sentence is fine as written but the framing changed — wire is canonical now. | 2 |
| Lines 436–440 (§1000 schema example) | `"event": "card_etb"`, `"condition_predicate": "opp_lost_life_this_turn"` | `"event": "card_enters_battlefield"`, `"cond_id": "opp_lost_life_this_turn"` | 1a + 1c |
| Line 446 (§1002 event vocabulary) | `card_etb` | `card_enters_battlefield` | 1c |
| Line 448 (planned events list) | `"card_attacks", "spell_cast", "card_drawn", "damage_dealt", "life_gained"` | Same conceptually. The Godot loader's `_FIRED_EVENT_KINDS` is the source of truth for what's *fired*; PROTOCOL.md §3.3 catalogs all of them in canonical snake_case. | (informational) |

### `docs/ARCHITECTURE.md`

Mostly fine — it's a module map, not a field reference. Two updates:

| Line(s) | Update |
|---|---|
| Line 31 | `effects/` lists `counter_spell.gd`. Now `counter.gd`. |
| Line 69 | Same. |
| Line 70 | Predicates description says "checks every `condition_predicate` string". Now `cond_id`. |
| Line 124 | "match `event` + `condition_predicate`". Now `cond_id`. |
| Line 132 | Lists `counter_spell` in the EFFECTS handlers. Now `counter`. |
| Line 141 | `condition_predicate` (twice). Now `cond_id`. |

Also: ARCHITECTURE.md doesn't yet mention `engine/json_card_loader.gd` or the boot supportability scan. Drop in a new entry around line 70:

```
| `engine/json_card_loader.gd` | 301 | Loads html-proto card.json files into CardResource instances. Translation tables for camelCase↔snake_case (JS-isms → Godot). Boot supportability scan reports unsupported cards by missing effect/event/predicate kind. | `load_card`, `load_all`, `supportability_report` |
```

### `docs/REFACTOR-NOTES.md`

Several items intersect with Pass 1-4 — covered separately in §2 below because the analysis is item-by-item, not just a stale-name sweep.

---

## 2. REFACTOR-NOTES items, after Pass 1-4

Going through your list in order with what's changed:

### §3.1 — Don't replicate `G[them]` closures when porting [P0/S documentation-only]

**Still relevant.** This anti-pattern is now also documented at `docs/PROTOCOL.md` §8 rule 3 and `/CLAUDE.md` "Patterns to NOT replicate." Three places saying the same thing is fine — they reinforce each other. No action.

### §4.1 — Remove vestigial JSON wiring (Godot) [P1/S]

**Resurrected. The JSON wiring is no longer vestigial.**

This item said `cards/data/` is empty and `JsonCardFactory` is unused; recommended deleting both. Pass 4 changed that: `engine/json_card_loader.gd` is now a load-bearing component, reading `reference/html-proto/cards/<id>/card.json` directly and running the boot supportability scan. The `JsonCardFactory` from the card-framework is still unused by the *visual* layer (`TresCardFactory` still does that), but the engine-side JSON path is alive.

**Recommended action.** Reword §4.1 to:

> **[P2/S] Visual factory still reads `.tres`; engine side reads JSON.**
>
> `engine/json_card_loader.gd` is the live JSON loader (Pass 4). `scenes/tres_card_factory.gd` still reads `.tres` files for the visual layer. The next pass (Pass 5) consolidates: wire the visual factory to JSON too, delete `.tres`, get a single source of truth. Until that lands, both paths coexist.

### §4.2 — `.tres` schema versioning [P2/M]

**Pass 1d dodged this bullet but the bullet is real.** When I renamed `oracle_text` → `text` and `triggered_abilities` → `triggers` in `CardResource`, I had to update 31 `.tres` files explicitly. If any user had `.tres` files outside the repo (e.g., a fork mid-flight), they'd silently break.

**No change to the item.** Still P2. If Pass 5 lands (which deletes `.tres` files entirely), this becomes moot. If Pass 5 stalls or partial-lands, schema versioning becomes more urgent because `.tres` migrations get harder as the schema evolves.

### §5.1 — Phase test batch runner [P1/S]

**I built this informally but didn't commit it.** The bash loop in `docs/STANDARDIZATION-HANDOFF.md` §9.1 (this doc) is what I used to verify every pass. Promoting it to `tests/run_all.sh` (or a `tests/run_all.gd` if you prefer GDScript) is a 30-minute task. Still P1.

### §5.2 — Cover non-self triggered abilities [P1/S]

**Unchanged.** Still a gap. The new `test_json_card_loader.gd` (Pass 4) doesn't exercise non-self triggers either — it just verifies loading.

### §5.3 — Illegal-action rejection paths [P2/S]

**Unchanged.** Boot supportability scan (Pass 4) catches *one* class of illegality at load time (unknown effect/event/predicate kinds in card data), but runtime illegality of action descriptors is still untested.

### Items not affected by Pass 1-4

- 1.1 (action dispatch consolidation) — unchanged
- 1.2 (combat keyword extensibility) — unchanged
- 1.3 (Dictionary type safety) — partially addressed by the boot supportability scan, which catches one class of "string-key typo" at load time. Doesn't address all action/event typos.
- 1.4 (mutation outside execute_action) — unchanged
- 1.5 (Mode enum for awaiting states) — unchanged
- 1.6 (target enumeration dedup) — unchanged
- 1.7 (`_stack_held_cards` band-aid) — unchanged
- 1.8 (engine god-object split) — engine.gd grew slightly (from 1551 to 1560 — added 9 lines for the supportability scan call in `_ready`)
- 2.1–2.6 (UI section) — unchanged
- 3.2–3.8 (html-proto section) — unchanged
- 6.1 (CLAUDE.md line-count drift) — `/CLAUDE.md` was edited in commit `3da32ac`. Whatever LOC numbers were in there are fresh again; the drift will resume.

---

## 3. What shipped on this branch — short version

Read `docs/STANDARDIZATION-PLAN.md` §6 for the canonical record. The 30-second version:

```
Pass 1a (f4dfd9b) — Godot dict keys aligned. trigger.condition_predicate → cond_id;
                    pump.amount_power/amount_toughness → power/toughness.
Pass 1b (f52dc95) — Effect kind counter_spell → counter (file + all callers).
Pass 1c (60960bd) — Event kind card_etb → card_enters_battlefield. + fixed latent
                    bug: _do_discard_card was firing key 'name' instead of 'kind'.
Pass 1d (b95c828) — CardResource fields oracle_text → text, triggered_abilities → triggers.
                    31 .tres files swept.
Pass 2  (1a30225) — Migrated all 258 card.json to canonical snake_case. tplId →
                    card_id, condId → cond_id, dropped color/colors (recomputed
                    from cost). JS ingestCard rebinds at the boundary; engine
                    internals untouched. VERSION 1.0.188 → 1.0.189.
Pass 3  (9a0ca77) — docs/PROTOCOL.md. Canonical cross-engine wire-format spec.
Pass 4  (38e61c0) — engine/json_card_loader.gd + boot supportability scan.
                    Headline: 258 cards loaded, 109 fully supported, 149 awaiting
                    handlers. New test test_json_card_loader.tscn (19 asserts).
3da32ac           — CLAUDE.md + STANDARDIZATION-PLAN.md doc updates.
39e6e1c           — 104 Godot auto-generated .import sidecars committed.
6da03d1           — This handoff doc.
```

**Verification at last push.** All 10 Godot phase smoke tests + JsonCardLoader test pass. All 482 JS regression assertions pass. 100-game JS self-play harness runs clean.

---

## 4. Decisions made (and reversed) during work

Joe and I had a long planning chat before the work, and a follow-up chat after. Some decisions changed mid-stream. The ones that matter most to your work:

### Tier 1/2/3 framing — picked Tier 2

I gave Joe three levels:

- **Tier 1**: docs only (shared concept vocabulary).
- **Tier 2**: wire format harmonization (JSON keys are snake_case; each engine rebinds at ingest).
- **Tier 3**: full source-level alignment (e.g., rename JS source `tplId` → `card_id` throughout).

We picked Tier 2 because Tier 3's payoff is aesthetic only — the language gap between JS and GDScript is the wall to code sharing, not the identifier convention. Tier 3's 16k-LOC JS rename is real risk for visual-parallelism gain.

**One caveat from the follow-up chat:** Joe pushed back specifically on the JS *dispatch-key surface* (the `EFFECTS.gainLife` table keys, `TRIGGER_CONDITIONS.youGainLife` keys, event names in `_fire` calls — about ~150 sites, not 16k). Those are different from general variable renames because they appear in card JSON as string values. The follow-up agreement was: that subset *is* worth migrating to snake_case as part of Pass 5, because otherwise the JSON wire format keeps the inconsistency where structural keys are snake_case but enum values aren't. See §6.4 below for details.

### Locked decisions (8 of them)

Recorded at `docs/STANDARDIZATION-PLAN.md` §10. Highlights for your work:

1. Template ID — wire: `card_id`, JS: `tplId` (rebind), Godot: `card_id`.
2. Display name — wire: `name`, JS: `name`, Godot: `display_name`. **This one was reversed mid-work.** Originally locked as `card_name` to "match the card-framework's `Card.card_name`." Then I checked and found `Card.card_name` is semantically an *identifier* (it gets set to `card_id` in `scenes/tres_card_factory.gd:39`), not a display name. Renaming would have created the exact confusion the rename was supposed to prevent. **Kept `display_name` on Godot.** JsonCardLoader maps `name` (wire) → `display_name` (Godot) at ingest.
6. Instance ID — Godot keeps `instance_id`, JS keeps `iid`. No rename. Heads up because your SPEC.md §1.9 lists `iid` for Godot.

### Pass 5 reframed during follow-up chat

Originally Pass 5 was scoped as "split target into target_mode + target_filter" (the §3.5 work in PROTOCOL.md). After the back-and-forth, the bigger move emerged: **make the JSON wire format literally Godot's CardResource shape, not a "compromise canonical."** Then Godot reads JSON natively (no translation), JS pays the inverse cost via ingest rebinding. The 23 hand-curated `.tres` cards get expressed as JSON entries in the html-proto manifest. The `.tres` files get deleted.

This is the real "Stage 3" to the May 17 `.tres` migration. See §6 below.

### Joe's deeper realization (the one that produced this handoff)

After Pass 4 shipped, Joe asked: *"Did I make a mistake going from JSON to .tres on May 17?"*

My honest answer: no — the May 17 work solved a real *within-Godot* duplication problem (programmatic CardResource definitions in `card_database.gd` + duplicate `cards/data/*.json` stubs for `JsonCardFactory`). The choice was correct at the time. The friction Joe is feeling now is that it's a local optimum that didn't anticipate cross-engine sharing being prioritized this soon. Cost of reversing is bounded; Pass 5 is exactly that reversal.

The bigger realization: rules and data aren't sibling projects. See §5.

---

## 5. Why rules and data standardization are the same project

This is Joe's reframe, and it's the reason he asked me to write this handoff. Putting words to it:

A card game's rules decompose into:

1. **State invariants** — what's in EngineState, who owns what, when phases advance. Mostly code.
2. **Action surface** — what actions players can take, when. Action-descriptor kinds + legality functions. Code + data (descriptors).
3. **Resolution semantics** — how an effect or trigger changes state. Code (handlers) + data (parameters in card JSON).
4. **Event dispatch** — what fires when, who listens. Code (`_fire_event` sites) + data (event-kind catalog).
5. **Condition checks** — when a trigger fires. Code (predicate functions) + data (the `cond_id` string in the card).

Items 2–5 are *partially encoded in card data.* Every triggered ability in a card.json is a five-tuple: `(event, cond_id, target_filter, effects, self_only)`. Every effect descriptor is `(kind, target, amount, …)`. These data shapes pin down rules.

So "standardize the rules" without "standardize the data" produces a clean English doc that no code matches. "Standardize the data" without "standardize the rules" produces clean schemas that don't say what they mean. You need both.

**Practical consequence.** Every time RULES.md says "this is how X works," check whether the wire format (PROTOCOL.md) and dispatch tables (`Effects.HANDLERS`, `TRIGGER_CONDITIONS`, `_PRED_NAMES`) actually express that rule. If they don't, the RULES.md description is aspirational and the code is the spec — and you have a bug to fix. If they do, the wire format becomes the *binding* spec: change the JSON and you've changed what the game does.

---

## 6. How your work and mine fit together — proposed merge

Both branches forked from `b070f1a`. Neither has been merged. The conflict is doc-level, not code-level (your branch only added docs; my branch did both).

### 6.1 The docs to reconcile

| Your file | My file | Recommendation |
|---|---|---|
| `docs/ARCHITECTURE.md` | (none — `/CLAUDE.md` has a module map but it's smaller) | Keep ARCHITECTURE.md. Apply the stale-name corrections in §1 above. Add a `JsonCardLoader` row. |
| `docs/SPEC.md` | `docs/PROTOCOL.md` | **Significant overlap.** See §6.2 below. |
| `docs/REFACTOR-NOTES.md` | (none) | Keep REFACTOR-NOTES.md. Apply §2 above (resurrect §4.1, no other code changes needed). |
| `docs/RULES.md` | (none) | Keep RULES.md. Apply the stale-name corrections in §1 above. |
| `docs/STANDARDIZATION-PLAN.md` | (same file, my version) | Mine has Pass 1-4 shipping notes that yours doesn't. Take mine. |
| `docs/STANDARDIZATION-HANDOFF.md` | (this file) | This file exists only on `claude/standardization-BBD8O`. Keep or rename to `docs/STANDARDIZATION-CONTEXT.md` once read. |
| `docs/PROTOCOL.md` | (mine only) | Keep mine. Reconcile with SPEC.md per §6.2. |

### 6.2 SPEC.md vs PROTOCOL.md

These overlap. The cleanest partition:

- **PROTOCOL.md = the wire format.** What goes in `card.json`. What string values the dispatch keys accept. What the boot-time validators check. Contract *between* engines.
- **SPEC.md = the runtime data structures.** Action descriptors, target descriptors, EngineState shape, signals, awaiting-state fields, CardInstance runtime layer. Contract *within* an engine.

They reference each other where they touch. The card JSON shape lives in PROTOCOL.md; `CardResource.<field>` reads go to SPEC.md. Effect parameter shapes live in PROTOCOL.md (since they're authored in JSON); the dispatch contract `Effects.HANDLERS["kind"].execute(effect, ctx)` and the `ctx` shape live in SPEC.md.

Three sections from SPEC.md should move to PROTOCOL.md (because they're really wire-format concerns):

- SPEC.md §1.3 CardResource schema → already in PROTOCOL.md §2.1 (mine is more current; delete from SPEC.md).
- SPEC.md §1.4 Effect descriptors → kind list is in PROTOCOL.md §3.2; per-kind parameter docs are richer in SPEC.md. Move the per-kind docs to PROTOCOL.md §3.2 entries.
- SPEC.md §1.5 Triggered ability schema + §1.6 Predicate contract → consolidate into PROTOCOL.md §5 + §3.4.
- SPEC.md §2.1 html-proto card JSON schema → move to PROTOCOL.md §2 (delete the JS-shape table; the wire format is now canonical).

What stays in SPEC.md (because it's runtime, not wire):

- §1.1 Action descriptors — stays. Add a forward reference to PROTOCOL.md §8 authoring rules.
- §1.2 Target descriptors — stays.
- §1.7 Engine signals — stays.
- §1.8 Awaiting states — stays.
- §1.9 CardInstance runtime state — stays. Apply the field-name corrections (§1 above).
- §1.10 EngineState snapshot — stays. Apply the field-name corrections.
- §2.3 Runtime slot fields — stays (RUN-tracked, not on the wire).
- §2.4 Save schema — stays.
- §2.5 Other localStorage keys — stays.
- §3 Asset path conventions — stays.

**Alternative merge strategy.** If you'd rather keep one doc, fold PROTOCOL.md into SPEC.md as a new top-level section ("§4 Wire format and dispatch vocabulary"). Either works; pick whichever makes the cross-references shorter.

### 6.3 Your branch's commits don't touch code

Your four commits on `claude/documentation-and-mapping-wa8Pd` are all `docs/*.md` additions:

```
03f0947  Add docs/RULES.md as canonical game spec; fix phase list in ARCHITECTURE.md
ed6b755  Add docs/REFACTOR-NOTES.md with prioritized structural debt
3916c0b  Add docs/SPEC.md documenting data contracts
3b0f0b4  Add docs/ARCHITECTURE.md mapping Godot port + html-proto
```

This means a clean rebase of your branch onto mine should produce only doc-merge work, no code-level conflicts. Recommended merge path:

```bash
git checkout claude/documentation-and-mapping-wa8Pd
git rebase claude/standardization-BBD8O
# Resolve doc conflicts (your edits to ARCHITECTURE.md from 03f0947 will conflict
# with whatever you'd update from this handoff §1; your other 3 commits are
# additions that should rebase cleanly)
```

Or invert it — rebase mine onto yours, then sweep my Pass 1 renames through your docs. Same end state.

### 6.4 The dispatch-key snake_case sweep (sub-pass of Pass 5)

Mentioned in §4 above. The detail you need:

Today's JSON wire format has inconsistent casing. Structural keys are snake_case (`card_id`, `cond_id`) after Pass 2. But enum *values* are still camelCase:

```json
{
  "card_id": "salve",                            ← snake_case (Pass 2)
  "effects": [
    {"kind": "gainLife", "amount": 3, ...}       ← camelCase ✗
  ],
  "triggers": [
    {
      "event": "cardEntersBattlefield",          ← camelCase ✗
      "cond_id": "thisAttacksAfterOppLifeLoss",  ← key is snake_case (Pass 2),
                                                    value is camelCase ✗
    }
  ]
}
```

For full wire-format consistency, the camelCase values should be snake_case too. This requires JS source changes to its dispatch tables:

```js
// Before
const EFFECTS = { gainLife(...) { } };

// After
const EFFECTS = { gain_life(...) { } };
```

About ~150 call sites in JS (effect kinds in `js/engine.js`, condition ids in `js/triggers.js`, event names in `_fire` calls). Mechanical sed sweep. Once done, both engines dispatch on the same strings, and the JsonCardLoader's `_EFFECT_KIND_REMAP` / `_EVENT_KIND_REMAP` / `_KEYWORD_REMAP` tables all delete.

I documented this at PROTOCOL.md §3.2 "Naming rule" — wire is *aspirationally* snake_case but Pass 2 left it half-done. Picking up the sweep is straightforward.

---

## 7. Pass 5 — outstanding work

Recap of what we agreed on for the next push. Five sub-tasks:

### 7.1 Migrate 258 card JSONs to Godot-native shape

| Today | After |
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

Script-driven. The script I used in Pass 2 (`/tmp/migrate_card_json.js`) is a starting point — extend it.

### 7.2 JS `ingestCard` rebinder

Mirror image of what Godot's JsonCardLoader does today. The 70-line function in `reference/html-proto/js/cards.js` grows to ~150 lines, doing the inverse translation (Godot-shape → JS-shape internally). Engine source untouched.

### 7.3 JsonCardLoader simplifies dramatically

Delete `_EFFECT_KIND_REMAP`, `_EVENT_KIND_REMAP`, `_KEYWORD_REMAP`, `_TARGET_FILTER_REMAP`. `_build_resource()` becomes direct field assignment. Loader drops from ~300 to ~120 lines. The supportability scan stays.

### 7.4 Wire the Godot playable pool to JSON

The big one. `CardDatabase.get_card(id)` reads from the JsonCardLoader map instead of `.tres`. The 23 hand-curated cards (Lightning Bolt, Giant Growth, basic lands, etc.) need JSON representations — added to `reference/html-proto/cards/_manifest.json` with their own folders. Delete the `.tres` files.

**Decision needed:** for cards that exist in both pools (e.g., Godot's `lightning_bolt` vs html-proto's `bolt`), pick one folder name and update references. Recommended: rename Godot's references to use html-proto folder names, because html-proto has 258 cards vs Godot's 23 — fewer references to update.

### 7.5 Visual layer rebuild

Already on `docs/BACKLOG.md`. Frame + art-insert TextureRect rebuild of `scenes/card.tscn`. Replaces `TresCardFactory` with a JSON-backed factory. Unlocks loading html-proto card art PNGs.

### Estimated effort

~1.5 days of focused, well-tested work. **Bounded.** The mechanism is built; Pass 5 is wiring + JSON shape migration + a card.tscn rebuild.

---

## 8. Things I didn't anticipate that matter for your rules work

### 8.1 The Godot engine `_fire_event` set is smaller than the trigger-listener set

The Godot engine currently fires three events: `card_enters_battlefield` (engine.gd:573 and :701), `card_dies` (engine.gd:962), `card_discarded` (engine.gd:1435 — and I fixed a bug there during Pass 4 where it was keyed `name` instead of `kind`, meaning no trigger could match it).

But cards in the html-proto pool listen for **many** more event kinds:
```
[JsonCardLoader] Missing event kinds (count):
  attacks=20, card_leaves_battlefield=1, life_gained=1, spell_cast=7
```

`attacks` is the biggest — 20 cards listen for it. Most of them have triggers like "When this attacks, do X." `JsonCardLoader._FIRED_EVENT_KINDS` is the source of truth for what *fires*; cards listening for events not in that list are flagged unsupported. RULES.md §1002 mentions these as "planned events for future cards" — they're already on the wire, the engine just doesn't fire them yet.

**If your rules work catalogues these events as canonical** (RULES.md §1002 should list them), the implementation task is "fire the event at the right state-mutation point." Most are one-liners in `engine.gd`:

- `attacks` — fire from `_do_declare_attacker` after appending to `attackers`.
- `spell_cast` — fire from `_do_cast_spell` after pushing to stack.
- `life_gained` — fire from `gain_life.gd::execute` after `controller.life += amount`.
- `card_leaves_battlefield` — fire from any path that moves a card off battlefield (bounce, exile, sacrifice). Multi-site.

### 8.2 The `self_only` flag obsoletes most JS `this*` predicates

The Godot Pyromaniac trigger uses:
```gdscript
"event": "card_enters_battlefield",
"cond_id": "",        # always-true predicate
"self_only": true,    # source must be event subject
```

The JS equivalent uses:
```js
"event": "cardEntersBattlefield",
"condId": "thisEnters",    # predicate: source.iid === event.card.iid
```

Functionally identical. The Godot form is cleaner — `self_only` is a structural flag, not a predicate that needs registration.

**The supportability scan reports `thisEnters=42, thisDies=16, thisAttacks=16, thisLeaves=1`** because that many cards in the pool use the JS pattern. To make them Godot-supportable, **either** add `this*` predicates to Godot's `_PRED_NAMES` registry, **or** migrate the cards to use `self_only: true` + an empty `cond_id`.

The latter is cleaner and lines up with what PROTOCOL.md §3.4 already documents:

> The canonical predicate set will collapse `thisEnters`/`thisDies`/`thisLeaves`/`thisAttacks` into the `self_only` flag over time.

So 42+16+16+1 = 75 cards are blocked on this single decision. If RULES.md §1000 codifies `self_only` as the canonical form (which it should), Pass 5's JSON migration should sweep these.

### 8.3 The cleanup-step discard bug I fixed

`engine.gd:1435` used to fire the discard event as:

```gdscript
_fire_event({"name": "card_discarded", "card": card, "controller_key": player_key})
```

The key `name` should have been `kind`. Without `kind`, `_fire_event` early-returns with `push_warning("_fire_event: event has no 'kind'; ignoring")`. So no trigger ever matched. I fixed it in commit `60960bd` (Pass 1c) alongside the `card_etb` → `card_enters_battlefield` rename, since both touched event-kind handling.

**Implication for your rules work:** any RULES.md description of cleanup-step discard triggers ("When a card is discarded during cleanup, …") was previously untestable. Now it's testable but unimplemented — no card listens for `card_discarded` yet. The infrastructure is now correct; cards using it would need to be authored.

### 8.4 The Godot autoload boot runs the supportability scan EVERY test invocation

The supportability scan adds ~1–2 seconds per Godot run. If you're iterating on tests, set `MAGICLIKE_SKIP_SUPPORTABILITY_SCAN=1` in the environment:

```bash
MAGICLIKE_SKIP_SUPPORTABILITY_SCAN=1 godot --headless --path . res://tests/test_phase4.tscn
```

The skip is documented at `engine.gd._ready()` and in the loader source. Use it.

### 8.5 The `.import` file dance

If you add new assets (fonts, images, SVGs) anywhere in the project tree, Godot will generate `.import` sidecars next to them on first project open or `--import` pass. The repo's convention (now consistent after my hygiene commit `39e6e1c`) is: commit `.import` sidecars, gitignore `.godot/` cache.

If you bring new assets onto a Linux dev machine that hasn't run Godot yet, you'll need to run:

```bash
godot --headless --path . --import
```

once before tests work. The `class_name` index lives in `.godot/global_script_class_cache.cfg` and is built by `--import`. Without it, GDScript can't resolve types across files.

### 8.6 Reference assets inside the Godot project tree

`reference/html-proto/` sits inside the Godot project. That means Godot's importer scans it and generates `.import` files for every PNG/SVG/TTF in there. Joe asked about adding `.gdignore` to `reference/html-proto/`; I recommended **not** to, because Pass 5's art-pipeline rebuild will want Godot to load html-proto card art PNGs as Texture2D resources, which needs the `.import` sidecars in place.

If you eventually decide `reference/html-proto/` shouldn't be Godot-loaded, the alternative is to load PNGs via `FileAccess.open()` + `Image.load_png_from_buffer()` (works without `.import`). Cleaner but a separate code path.

---

## 9. Test invocations

### Godot tests

```bash
# Single test:
godot --headless --path . res://tests/test_phase4_5b.tscn

# All 11 tests (10 phase + new JsonCardLoader smoke):
for t in test_phase1 test_phase2 test_phase3 test_phase4 test_phase4_5a \
         test_phase4_5b test_phase4_5c test_phase5a test_phase5b test_phase5c \
         test_json_card_loader; do
  out=$(MAGICLIKE_SKIP_SUPPORTABILITY_SCAN=1 godot --headless --path . "res://tests/${t}.tscn" 2>&1)
  if echo "$out" | grep -q "ALL ASSERTIONS PASSED\|ALL PASS"; then
    echo "PASS: $t"
  else
    echo "FAIL: $t"
    echo "$out" | tail -25
  fi
done
```

Each test exits 0/1. Promoting this to `tests/run_all.sh` (committed) resolves REFACTOR-NOTES §5.1.

### JS tests

```bash
cd reference/html-proto
node tests/run_all.js                       # ~2s, 482 assertions
node tests/selfplay_harness.js 500 bughunt  # ~20s, AI vs AI
```

### Cross-engine verification pattern

When Pass 5 lands, the headline test becomes:

1. Edit `reference/html-proto/cards/bolt/card.json` — change `amount: 3` → `amount: 4`.
2. Run `node tests/run_all.js` — JS sees the change.
3. Run a Godot phase test that casts bolt — deals 4 damage instead of 3.

That single edit affecting both engines is the proof point.

---

## 10. Open questions you'll have to make calls on

### Q1: Folder-rename for the 23 hand-curated Godot cards

`bolt` (html-proto) and `lightning_bolt` (Godot) refer to the same card. When merging the pools, do you:

- **A:** Keep both (duplication, two source files).
- **B:** Rename Godot references to use html-proto folder names (touches `engine.gd::init_phase*`, test files, showcase deck).
- **C:** Rename html-proto folder to Godot-style names (touches the manifest, art paths, JS engine).

**My recommendation:** B. Godot has fewer references (23 cards' worth vs 258 cards' worth of folder paths).

### Q2: Modal card JSON shape

Cards like `tideCharm`, `verdantCharm`, `oblation` use:
```json
"effects": {
  "modeNames": ["...", "...", "..."],
  "modes": [[effect_list_1], [effect_list_2], [effect_list_3]]
}
```

In Godot-native shape, this needs a decision. Options:
- New `on_cast_modes: Array[Dictionary]` field on `SpellResource`.
- Reuse `on_cast_effects` accepting either an Array or a single modal Dict.
- A `ModalSpellResource` subclass.

JsonCardLoader currently produces empty `on_cast_effects` for modal cards (TODO comment in code). They show as unsupported. **Joe will probably want them supported in Pass 5** since modal spells are an existing JS feature with 5+ cards.

### Q3: `extraManaColors` (City of Brass) handling

The JSON has `mana: "W", extraManaColors: ["U", "B", "R", "G"]`. JsonCardLoader unions them into `LandResource.mana_produced`. Godot-native shape might prefer:

```json
"mana_produced": ["W", "U", "B", "R", "G"]
```

Cleaner but loses the "primary color" distinction. JS uses `mana` separately from `extraManaColors` for some logic (display, color identity). Decide whether to preserve.

### Q4: RULES.md vs PROTOCOL.md authority

RULES.md says "this is canon; the code is the patient." PROTOCOL.md says "wire format is authoritative; engines conform." Where they disagree (and they will, because English is imprecise), which wins?

**My take:** RULES.md is the spec for what *should* happen behaviorally; PROTOCOL.md is the spec for how that behavior gets encoded. If they disagree, that's a bug — either the rule needs revision or the data encoding doesn't express the rule. PROTOCOL.md §8 should probably be updated with a one-liner: "RULES.md is the higher-authority document for game behavior; this document encodes how that behavior is expressed in data."

But the call is yours.

### Q5: Boot scan for the action surface

Pass 4's boot supportability scan covers effect kinds, event kinds, and predicate ids — the data-driven dispatch surface. **It does not cover action kinds.** REFACTOR-NOTES §1.3 flags "action and event Dictionary type safety" as a related gap.

Adding action-kind validation is a small extension: on boot, enumerate `Action.KIND_*` constants and assert every kind has a `_do_<kind>` and `_legal_<kind>` function. Catches typos at boot, not runtime.

Worth doing? Probably yes, but it's a separate sub-task. Could be part of REFACTOR-NOTES §1.1 (action dispatch consolidation) since both involve registry-ifying the action layer.

---

## 11. The principles I'd carry forward

Three guidelines that did most of the work on this branch:

1. **Wire format is authoritative; engines translate at the ingest boundary.** All translation logic lives in two places: `JsonCardLoader._build_resource()` (Godot side) and `cards.js::ingestCard()` (JS side). When in doubt about where new translation logic goes, those are the only correct answers. Don't sprinkle translation tables across the engine.

2. **Boot-time validation over runtime guards.** `validate_all_card_predicates` walks every card at startup. `supportability_report` extends it. Boot-time error messages are easier to fix than runtime `null`-dereferences. When adding a new dispatch surface (action kinds, event payload shapes), add a boot validator.

3. **Anti-patterns are protocol-level, not just style.** The four rules in `/CLAUDE.md` "Patterns to NOT replicate" (no autoload reach from predicates/effects, no depth caps on trigger drain, no dynamic dict fields on instances, all mutations through `execute_action`) are now also codified at `docs/PROTOCOL.md` §8. If your rules work introduces a new rule, the implementation must obey these. The `/CLAUDE.md` "patterns" section is the more authoritative location.

---

## Closing

The standardization project is meaningful but not load-bearing for shipping the game itself. Joe can keep playing the JS prototype and the Godot Phase 5c+ work without Pass 5 ever landing. The value of Pass 5 is **eliminating a recurring "edit two places" tax** on every card change. That tax compounds with every new card Joe authors; Pass 5 pays it off.

Your rules-standardization work is the cleaner-spec half of the same project. If RULES.md becomes the binding behavioral spec and PROTOCOL.md becomes the binding wire-format spec, with both engines validating against each at boot, the result is a system where:

- Adding a new rule means updating RULES.md, PROTOCOL.md, and both engines' dispatch tables (one PR touches all four).
- Adding a new card means writing one JSON file that both engines play.
- Drift between the two engines is caught at boot, not at runtime.

That's the win condition. Pass 5 wires the data side; your work makes the rule side canonical.

If you find yourself making a decision I didn't anticipate, lean on:
- Wire format simpler (fewer remap tables, fewer special-case fields).
- Boot-time validation over runtime checks.
- When stuck, ask Joe — he's the one whose intuition produced both threads.

Good hunting.
