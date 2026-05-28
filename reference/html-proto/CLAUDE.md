# Magiclike — Rules Engine

Magic: The Gathering-style card game. `magiclike_engine.html` plus a `js/` folder of vanilla-JS modules — no build step, no frameworks, no network calls. Open in any modern browser to play.

## Version

**Current: `v2.0.27`** (source of truth: `js/main.js` `const VERSION` — keep this line in sync on bump). v2.0.0 was the
Slice 3 effects/targeting refactor (atomic-effect collapse, unified `target()`
step with restriction `target_filter`, `move_card`, mana-as-ability, sticker
pipeline, splice harmonization). v2.0.1: post-refactor bug-fix sweep — boss
special-removal + mind-control AI casting, the trigger/cast/highlight
target-prompt regressions, the drain→life-loss migration, and card-text polish.
v2.0.2: consolidated the targeting-shape question into one engine API
(`objectNeedsTarget`/`primaryLegalTargets`/`probeTargetsForObject`) that the cast
flow, castable highlight, and trigger prompt all route through. v2.0.3: decoupled
authored text from the `special` gameplay flag (now keyed on `customText` only),
so 5 cards (vileEdict, symmetricize, endomorph, bleach, embargo) generate
accurate text from their effects instead of hand-written text that can drift.
v2.0.4: completed the card-data-Part-2 dispatch-key snake_case sweep for effect
kinds (card.json + JS `EFFECTS` table). Supersedes STANDARDIZATION-PLAN §4.6's
"JS stays camelCase" for dispatch keys. v2.0.5: finished the sweep — keywords
(`first_strike`, `double_strike`) and target filters (`permanent_or_spell`,
`graveyard_creature`); events + predicate ids were already snake (Slice 2). All
four Godot `JsonCardLoader` remap tables are now dead, slated for deletion.
v2.0.6: split the overloaded `player` target into `opp` (opponent-only — drain/
burn/discard/edict) vs `player` (free choice — heals), so generated text matches
the actual legal targets instead of guessing "opponent" from the effect kind.
v2.0.7: filter parity — the engine now enforces every restriction the card text
renders (`minTough`/`maxPower`/`minPower`/`notKeyword` added to matchFilter) and
the text renders every restriction the engine enforces (`notToken`); fixed
counterSpecialist's preamble ("cast a counterspell", not "counter a spell").
v2.0.8: fixed the UI player-target button for "any target" spells — `getValidTargets`
now accepts the §3.5 taxonomy spelling `creature_or_player` (was legacy `any` only),
and render drives the "→ Target <player>" button off real legality instead of a
hardcoded target list (so `opp` correctly shows only the opponent's face).
v2.0.9: unified the "creature or player" target token on the single canonical
spelling `creature_or_player` (matches Godot's taxonomy + the docs). Migrated the
last per-effect `target:'any'` holdouts (crusadersCharm/stormCharm modal modes +
trigger-generator's damageAny roll) and dropped the v2.0.8 `any` alias — `any` is
no longer a target token anywhere in proto, so the Godot loader's
`_TARGET_FILTER_REMAP["any"]` can finally die. (`choose:'any'` for mana color is a
separate field and stays.)
v2.0.10: City of Brass mana label `W`→`C` — it's an identity-less land (taps for
any color via the §3.9 `add_mana choose:'any'` ability, but has no color identity),
so it now renders a colorless frame and stops counting as a White source in
deck-color/draft-pip display. `C` is the colorless-identity land label; the
land-mana invariant test exempts it (production stays WUBRG).
v2.0.11: post-refactor review cleanup (slice 1/4). Unified mass `grant_keyword` onto
the `scope` field (`all_yours`/`all_creatures`) — retired the parallel `whose`
(`allYours`/`all`) field, which was a half-migrated distributed invariant (every mass
consumer read both) AND the lone camelCase wire-value violation. Deleted two dead
branches (legacy `condition`-as-function + `params.sub` fallback in triggers.js) and
fixed stale comments/docs (zone-change migration-window comment, CLAUDE.md trigger
registry name, PROTOCOL exile_until_eot row).
v2.0.12: review cleanup (slice 2/4) — finished the spec'd `remove_creature`→
`affect_creature` rename (plan §6.7/decision 12) across the EFFECTS dispatch, all
31 cards, and every consumer, AND converted `severity` from integers `1-4` to the
string ladder `tap|bounce|destroy|exile` (plan §5). Centralized the int↔string
mapping in one helper (`sevToNum`/`numToSev`); empower still promotes severity up
the ladder. Resolves the half-wired `affect_creature` phantom the review flagged
(name was referenced in schema/valuation but undispatchable).
v2.0.13: fixed two AI severity-scoring sites the v2.0.12 rename missed — they read
`eff.severity` with numeric comparisons (`sev === 3`), silently mis-scoring string
severities (a `destroy` spell scored as `exile`; a `tap` ignored its already-tapped
guard). No crash, so tests/selfplay stayed green — the textbook §8.1 lockstep trap.
Both now go through `_sevNum`; added a regression (AI won't `tap` an already-tapped
creature).
v2.0.14: review cleanup (slice 3/4) — decomposed Scarification (plan #18): the
`destroy_and_sticker_slot` monolith → `[apply_sticker(scarified), affect_creature(
destroy)]` (sticker-FIRST so the run-slot scar lands before the creature leaves;
matches embargo's pattern). Extended `apply_sticker` to accept a registry
`stickerId` (not just an inline descriptor) for complex registered stickers.
Deleted the `destroy_and_sticker_slot` handler + all its classification/scoring/
text sites. Behavior note: under atomic decomposition an indestructible target now
gets scarred-but-not-destroyed (the monolith fizzled both halves) — an acceptable
edge on a boss-targeted creature.

v2.0.27: inlined the always-true FLASH_AI_ENABLED flag. With the A/B setter gone
(v2.0.26), the flag was a `const true` gating 4 `if (FLASH_AI_ENABLED && …)` sites
— an always-true condition is a dead abstraction, so the flag is removed and the
flash-AI heuristics (end-step tempo, ambush bonus, flash-hold deferral) now run
unconditionally, which is exactly what they always did. Per-site comments already
document the flash-AI intent, so no marker lost. Behavioral no-op; 1096 green,
300-game selfplay clean. (Should've done this in v2.0.26 instead of demoting
let→const — an always-true flag IS the cruft.)

v2.0.26: removed the dead flash-AI A/B setter/getter. `setFlashAIEnabled`/
`isFlashAIEnabled` had zero callers (confirmed across js/ + tests/) — deleted
them + their exports. Kept `FLASH_AI_ENABLED` (it's READ at 4 sites, so live) but
demoted `let`→`const` since nothing reassigns it now; flip the const for tuning
A/B. (Earlier I'd kept the setter/getter as a "deliberate seam" — wrong call; a
comment claiming usefulness isn't a caller. Confirmed-dead → removed.) 1096 green.

v2.0.25 (docs): re-corrected the #7 symmetricize status. v2.0.22 claimed #7 was
"NOT done (still monolithic)" — that was wrong, an over-correction from an audit
agent's surface read. Verified by reading the handler + doSymmetricizeChoice
against §3.8: symmetricize IS decomposed per spec — it stays a named effect with
a player-choice prompt (§3.8 explicitly specifies "the effect computes its value
via its player-choice prompt and calls the shared apply path") and emits
stat_boost + cost_mod snapshot stickers via the shared pipeline (no bespoke slot
field; applyBalancerOverrides/symmetrizedTo gone). No code change — the code was
already correct; only the doc status was wrong. (The "decompose symmetricize"
audit task resolved to: it's already done; nothing to build.)

v2.0.24: dedup (audit finding). Two extractions, both behavior-preserving:
(1) `makeSlotTargetGetter(targets)` replaces FOUR byte-identical lazy per-slot
target-getter closures (spell-resolve, resolveTopOfStack, trigger, ability — the
audit found 3; there were 4). Each was a Map + closure snapshotting the slot
target on first read (§3.6). (2) `validTargetsBySlot(card, targetedEffs, who)`
unifies the slot-grouping + per-slot spec resolution shared by `isLegalAction`
(cast-legality) and `getLegalActions` (AI enumeration) — the same logic whose
`slotSpecs ? : eff` comment had already drifted (fixed in v2.0.22), exactly the
kind of duplication this removes. isLegalAction now checks the given target
against the slot's resolved set; getLegalActions builds its cross-product from
the same Map. Equivalent (per-effect validation == per-slot intersection).
1096 green, 35 multi-target cast regressions pass, 300-game selfplay clean.

v2.0.23: snake_case the dynamic-value DSL (audit #4 — the one Godot-facing miss).
The `{from:"..."}` computed-amount tokens were still camelCase (the #9 sweep did
keys only): `targetPower`→`target_power`, `targetToughness`→`target_toughness`,
`targetController`→`target_controller`, `sourcePower`→`source_power`,
`sourceToughness`→`source_toughness`, `countCreaturesYou`→`count_creatures_you`,
`countCreaturesOpp`→`count_creatures_opp`. Renamed the tokens in `resolveExpr`'s
switch (engine.js), the card-text `describeAmount` dynMap + the `who.from`
comparison (also fixed a pre-existing dynMap key bug: `targetTough` →
`target_toughness`, matching the real token), and the 2 cards that use them
(exorcist, swords). render.js's local `targetController` variable is NOT a token —
left alone. Not an active break (Godot doesn't read computed values yet), but
closes the latent wire-format trap before Godot ports those cards. 1096 green,
200-game selfplay clean.

v2.0.22: post-audit cleanups (4 verification agents). Dead-code prune + doc
corrections. Deleted: dead card-text `case 'embargo'`/`'bleach'` (cards decomposed,
no kind uses them); dead `triggerNeedsPlayerChoice` (superseded by
`triggerPlayerTargetPrompt`); dead export entries `allCardEffects`,
`affectOneCreature` (engine), `spellValue` (AI) — functions stay, only the unused
export tokens removed. KEPT `EFFECTS.steal` — the audit agents flagged it dead
("no card uses kind:steal") but `change_control` delegates to it at engine.js
for the `transfer_ownership` case (Steal card); verified live before NOT deleting.
Corrected the misleading per-effect-fallback comments (it serves MODAL charm
cards — which carry per-effect target in their modes — NOT staple-synthesis, which
the audit proved carries only card-level target). Fixed: stale version header
(was v2.0.2); `cards/cityGuardian` keyword typo `"first strike"`→`"first_strike"`;
ARCHITECTURE.md stale effect-dispatch list (removeCreature→affect_creature etc.).
Corrected a FALSE status claim: #7 symmetricize was marked "already done" but is
still a monolithic effect (decomposition pending — done next). 1096 green.

v2.0.21: review cleanup (#5b phase 3 — COMPLETE) — target_slots is the single
source of truth for the 5 multi-target spells. Dropped inline per-effect
`eff.target` from branchingBolt/twinStrike/drainLife/rootsAndBranches/
swordAndSorcery; each slot-bound effect now carries only `target_slot:N`, and the
filter lives in the card-level `target_slots[N]` spec. Consumers migrated to read
the slot spec: `effectNeedsTarget` now recognizes slot-bound effects
(target_slot != null); getLegalActions + isLegalAction prefer
`card.target_slots[slot]` for per-slot validity/validation; card-text's
describeEffectList resolves the synthetic per-effect target from the slot spec
(extends the existing top-level-step mapping); render's slot machinery
(pendingObjectTargetSlots, slotsNeededForPending, pendingTargetEffect)
recognizes card-level target_slots, not just ability-level. New end-to-end cast
regressions in test_targeting_cast.js (cross-product enumeration; both targets
damaged; drainLife's mixed creature/player slots: creature dmg + opp life-loss +
self life-gain). 1096 green, 500-game selfplay clean. The per-effect-target shape
now survives ONLY as the staple-synthesis runtime fallback (a contained
`slotSpecs ? : eff` branch in the two enumeration sites) — staple-merged spells
are runtime synthesis, not authored wire format, and the canonical API handles
them. Fully migrating synthesizeStapledTemplate to emit target_slots (to delete
that fallback) is deferred: the staple/splice pipeline is complex and the value
(removing a one-line fallback) doesn't justify the regression risk.

v2.0.20: review cleanup (#5b phase 1/2) — canonical target_slots on multi-target
cards + kill the dead multi_target flag. The 5 multi-target spells (branchingBolt,
twinStrike, drainLife, rootsAndBranches, swordAndSorcery) now carry a card-level
`target_slots: [{target:...}, ...]` array (the same shape Stapler's abilities use)
and explicit `target_slot:0` on the first targeted effect. The `multi_target`
boolean was a DEAD WRITE — set in synthesizeStapledTemplate (engine.js:518/526)
and on the 5 cards, but READ nowhere (multi-target is recognized structurally via
per-effect target_slot in slotsNeededForPending + the canonical target API).
Removed all writes + the card-data flag. This phase is purely additive/dead-code:
inline per-effect `eff.target` is still present and still what card-text/AI/the
render slot-pick read; dropping it (so target_slots is the single source) is
phase 3, which must also teach render's slot machinery to read card-level
target_slots (today slotsNeededForPending only recognizes ability-level
target_slots, not card-level). 1083 green, 300-game selfplay clean.

v2.0.19: review cleanup (#5a) — self-direction `target:"self"` → `scope:"self"`.
Per-effect `target: "self"` was the legacy way of saying "this half of the spell
acts on the source/controller, not the picked target" — which conflated two
distinct concerns under the `target` field. Migrated to `scope: "self"` (the §3.5
canonical for self-direction): 44 cards (on-cast + triggers + activated abilities),
all 4 engine dispatch sites (spell resolver + trigger resolver + two more), all
card-text rendering sites (~10), 4 AI sites, trigger-generator's 5 template rolls
+ random-trigger card, the scarified-sticker payload (cards.js) + the 5 sticker
effects defined at the top of engine.js, and the 5 test files that constructed
synthetic effects with `target:"self"` inputs. Selfplay caught a real regression
mid-migration: the engine dispatch was sed-switched ahead of all the producers,
so triggers were briefly running `pump`/`gain_life` with null targets (152
crashes in 500 games). Completing the producer migration (especially the trigger/
ability effects in 44 cards — jq's first pass only walked on-cast effects) cleared
the regression. 1083 green, 500-game selfplay clean. This is **5a** — the
self-direction half of #5. The multi-target canonicalization (multi_target flag →
ability-level target_slots on the 5 multi-target spells) is **5b**, deferred: it
entangles with the staple-merge pipeline (engine.js:518/526 still sets
multi_target=true on staple), and that's not session-tail work.

v2.0.18: review cleanup (#9) — field-name snake_case sweep. Renamed 24 camelCase
JSON keys across the card pool to snake_case to match the rest of the wire
format: `customText`/`multiTarget`/`staticBuffs`/`permanentEot`/`staticCostBump`/
`triggerPoolSeed`/`chargesAtRunStart`/`buildOnDraw`/`artLadder`/`ripOnTarget`/
`targetSlot`/`targetSlots`/`tokenId`/`stickerId`/`grantHaste`/`notToken`/
`modeNames`/`hasKeyword`/`maxTough`/`notColor`/`spliceableBase`/`spliceableStaple`/
`minPT`/`sorcerySpeed` → snake_case equivalents (and the orphan filter-field
reads `notKeyword`/`minTough`/`maxPower`/`minPower` in consumer code, for
vocabulary consistency — no card uses them today). 63 card JSONs + ~12 JS modules
+ tests updated in one coordinated pass. Godot's `JsonCardLoader` doesn't read
these fields (Phase 6 unstarted), so no Godot churn — the renamed JSON arrives
already-snake_case when Godot starts porting these cards. 1083 green, 500-game
selfplay clean. (`targetSlotIdx` is a JS-internal variable name, not a wire-format
field — out of scope.)

v2.0.17: review cleanup (#8) — effect-shorthand parser (§5.1/§5.2). Card effects
may now be authored as function-call strings ("damage(3)", "draw(2)",
"chooses(creature)") that ingestCard() normalizes to canonical dicts at load
(triggers.js: `_parseEffectCall` + `desugarEffectString` + `normalizeCardEffects`,
reusing the predicate lexer). The §5.2 curated movement shorthands (draw/discard/
mill/bounce/search_for/search_land_tapped/shuffle_into_library/
target_player_discards) desugar to canonical move_card — verified executable
against the (already-generalized) move_card handler. `flicker` is intentionally
omitted: its §5.2 desugar needs a `previous_target` move_card selector the engine
doesn't implement. Dict-form effects pass through untouched, so the all-dict pool
is a no-op; no card uses shorthand yet (forward-authoring seam). New
test_effect_shorthand.js (25 checks incl. end-to-end execution). 1083 green.

v2.0.16: review cleanup (#6) — relocated AI spell valuation engine.js → ai.js.
Moved `spellValue` / `spellValueForEffects` + the `VALUED`/`UNVALUED` effect-kind
classification to ai.js module scope (exposed on `AI.*` for tests; the engine
coverage report reads the sets lazily, like the cast-scoring sets). KEPT the
engine-consumed creature-body heuristics (`getCardValue`, `sacValueOnBoard`,
`abilityValue`) in engine.js — `dealCombatDamage`'s blocker damage-assignment
order and the edict `chooses()` auto-pick genuinely depend on them, so a full
relocation would force a combat-behavior change (the engine has its own coarse
`cardValueOrZero` for layering-pure picks, but switching combat onto it is a
behavioral change, out of scope here). No behavioral change; 1058 green, 500-game
selfplay clean. (Engine internals live in the ENGINE IIFE — ai.js reaches the
two shared helpers via `ENGINE.sevToNum` / `ENGINE.getModes`; `TOKENS` is a
top-level global.)

v2.0.15: review cleanup (slice 4a/4) — broadened rip (plan #27/§13). Built the
zone-agnostic `rip` primitive (run-layer slot-strip reading ctx.chosen's
snapshotted slotIdx) and decomposed Vile Edict from the `rip_permanent` monolith →
`target(opp) → chooses(permanent) → annihilate → rip`. Per user call, KEPT the
"rip a permanent" breadth (generalized `chooses()` to honor a `permanent` filter,
not just creatures). Deleted `rip_permanent` + the now-dead `pendingRipSelect`
prompt machinery (engine + render + controller + AI). Note: rip-edict now uses
`annihilate` (no death triggers, matches §13) and auto-picks the victim's permanent
(human rip-pick prompt folds into the tracked GAP-2 human-chooses work, like
Diabolic Edict). Browser-verify the rip UI removal (DOM not covered by Node tests).
(#7 symmetricize: confirmed already in the decided end-state — no change.)

> **MUST UPDATE on every dev-branch push that touches code.** Bump `VERSION` in `js/main.js` AND the line above, in the same commit. GitHub Pages caches aggressively; the version string is the only reliable way to confirm a fresh build is live.

Always work on `dev` for html-proto changes.

Deferred work lives in `BACKLOG.md` (gating rules in `/CLAUDE.md`).

## File structure

The codebase was a single self-contained HTML file until it crossed ~19k lines. It's now split into per-subsystem JS files loaded as plain `<script src>` tags (no ES modules, no build step). The HTML shell holds the body, CSS, and fourteen script tags in dependency order.

Also in the repo: `index.html` at the repo root — a small redirect that points GitHub Pages at the engine file.

## Module layout

| File | Role |
|---|---|
| `cards/<tplId>/card.json` | One file per card template (258 cards). Each folder also holds `art.png` for cards with PNG art. `cards/_manifest.json` lists every folder name. |
| `js/settings.js` | `SETTINGS` IIFE — user-tunable display config (card frame style, per-element font + size multipliers, popup text scale, mana symbol sizes, devtools flag). `localStorage` at `magiclike_settings_v1`. `applyFontsToRoot()` pushes saved values into `:root` CSS vars at boot before the first paint. |
| `js/cards.js` | `CARDS = {}` + `async loadCards()` fetcher (populates CARDS from the per-card JSONs at boot). Also holds `TOKENS`, `KEYWORDS`, `STICKERS`, `EMPOWER_FIELDS`, `KEYWORD_DISPLAY`, `KEYWORD_STICKER_WEIGHTS`, `RUN_MODIFIERS` — the shared registries that don't fit the per-card model. |
| `js/engine.js` | Mercurial trigger pool, splice eligibility helpers (`isSpliceableBase`, `canonicalSplicePair`, `isCompatibleStaplePair`, `remapEmpowerRollForStaple`, etc.), general helpers (`tplForSlot`, `deckColorsFromSlots`, `fakeTargetsForLegality`), `ENGINE` IIFE (state, mana, triggers, phases, combat, synthesis, `EFFECTS` dispatch ~25 kinds). |
| `js/card-text.js` | Card-text description helpers — `describeCardSegments`, `describeCardText`, `describeEffect/Trigger/Ability/StaticBuff/ModalSegs` + internal helpers (targetPhrase, withFilter, bumpedSeg/Derived, capitalizeSegs, triggerPreamble, keywordPreamble, abilityCostPhrase, segsToText). Pure data → English; reads `ENGINE.synthesizeStapledTemplate` for stapled-card baselines. |
| `js/stickers.js` | Sticker pipeline — runtime application (`weightedPick`, `applyStickersToCard`, `applyOneStickerToRuntimeCard`, `applyRandomStickersToSide`, `empowerRollLabel`, `applyEmpowerRoll`) and deck-construction helpers (`rollSubtypeFromDeck`, `pushStickerWithRoll`, `stickersForSlot`). Late-binds to `ENGINE.synthesizeStapledTemplate`, `tplForSlot`, `deckColorsFromSlots`. |
| `js/ai.js` | `AI` IIFE — decision logic, combat sim, lethal detection |
| `js/draft.js` | `DRAFT` IIFE — pack generation, color-aware sampling, 23-pick player draft, opp deck construction (incl. constructed-deck registry: Goblin Aggro, Spirit Tribal, Aristocrats, Archdemon Boss, Balancer Boss) |
| `js/run.js` | `RUN` IIFE — roguelike meta (map generation, rewards, post-draft offers), save/load to `magiclike_run_v1` localStorage key, schema migrations |
| `js/picklog.js` | `PICKLOG` IIFE — draft pick analytics, `magiclike_picklog_v1` storage, exposed on `window.PICKLOG` for console queries |
| `js/controller.js` | `CONTROLLER` IIFE — input handling, modals, AI scheduling, plus the meta-game render helpers it owns (renderMap, renderReward, renderDraft, renderStatsContent, …) |
| `js/render.js` | `render()` main repaint, `renderManaPool`, `renderHand`, `renderBf`, `passLabel`, `makeCardEl`, `cardToViewModel`, etc. — in-game UI only |
| `js/settings-panel.js` | `SETTINGS_PANEL` IIFE — settings modal render + show. Sub-renderers per section (devtools, font preset, per-element rows, popup scale, mana pip sizes, export button). Pulled out of controller.js on v1.0.185. |
| `js/triggers.js` | `ATOMIC_PREDICATES` registry (12 composable atomic predicates) + `evaluateCondition` walker (string / list-AND / `{op,terms}` tree) — the composable trigger-condition vocabulary used at runtime (Slice 2) |
| `js/trigger-generator.js` | `GENERATOR_EFFECTS` / `GENERATOR_CONDITIONS` data plus the rolling functions for Mercurial Adept / Architect's Codex (`generateRandomTrigger`, `generateConditionOptions`, `generateEffectOptions`, `assembleTrigger`) |
| `js/main.js` | `VERSION`, the `opp(who)` helper, and the bootstrap that awaits `loadCards()` then calls `CONTROLLER.init()`. |
| `tests/` | Node-based regression suite (~20 test files + harness). See `tests/README.md`. |

Load order in `magiclike_engine.html` is: settings → cards → engine → card-text → stickers → ai → draft → run → picklog → controller → render → settings-panel → triggers → trigger-generator → main. Each IIFE declares as a top-level `const`, so it's a global accessible from later scripts. Note: DRAFT calls PICKLOG at runtime (not at module-load), so the DRAFT-before-PICKLOG order is fine — identifier resolution inside IIFE function bodies is lazy. Same goes for stickers.js's late-bound references into ENGINE and into engine.js's top-level helpers.

**Card data:** Cards live one-folder-per-template under `cards/`. The tplId is the folder name AND a top-level field in `card.json`. To add a new card, create a folder, write `card.json`, append the folder name to `cards/_manifest.json`. The browser loads everything at boot via the manifest. Tests sync-load via `fs.readFileSync` (see `tests/_setup.js`).

## Persistence

`localStorage` is the only persistence. Keys:
- `magiclike_run_v1` — current roguelike run (deck, stickers, wins/losses)
- `magiclike_picklog_v1` — draft history analytics
- `magiclike_settings_v1` — user display preferences (fonts, sizes, devtools flag)

Schema migrations live in the `RUN` module and run on load.

## Design backlog

The earlier in-code roadmap comment block has been removed as features shipped (tokens, modal spells, etc. are now implemented). Static Lords remain partially implemented: lords grant `staticBuffs` (stat changes) but not keywords — grep `cards/*/card.json` for `staticBuffs` to find them. Ask the user about current priorities before assuming what's next.

## Testing

Node-based regression suite under `tests/`. Run from `reference/html-proto/`:

```
node tests/run_all.js                       # 482 assertions, ~2s
node tests/selfplay_harness.js 500 bughunt  # AI vs AI, ~20s
```

`tests/_setup.js` boots the engine in Node by stubbing the DOM and concatenating the JS modules in script-tag order. Coverage is engine-level (card synthesis, sticker application, target legality, trigger generation, AI burn lethal, modal helper). See `tests/README.md` for the file-by-file breakdown.

DOM/UI behavior isn't covered by the harness — verify those by:
1. Opening `magiclike_engine.html` directly in a browser (or visiting the GitHub Pages URL).
2. Watching the devtools console — uncaught errors are the strongest signal of regression.
3. Playing through at least one combat phase, one stack interaction, and one draft pick if those areas were touched.
4. For AI changes: play a full game and watch the AI log entries (orange `.cb` log lines) for nonsensical decisions.

Console hooks for analytics: `window.PICKLOG.summarize()`, `window.PICKLOG.getCardStats()`, `window.PICKLOG.getPairsMatrix()`.
