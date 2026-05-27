# Magiclike — Rules Engine

Magic: The Gathering-style card game. `magiclike_engine.html` plus a `js/` folder of vanilla-JS modules — no build step, no frameworks, no network calls. Open in any modern browser to play.

## Version

**Current: `v2.0.2`** — defined at `js/main.js` (`const VERSION`). v2.0.0 was the
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
