# Magiclike — Rules Engine

Magic: The Gathering-style card game. `magiclike_engine.html` plus a `js/` folder of vanilla-JS modules — no build step, no frameworks, no network calls. Open in any modern browser to play.

Current version: `v1.0.142` (defined at `js/main.js`, `const VERSION`).
Always update the Current Version whenever you push a change to the Dev branch. This will allow the User to verify that the current version is live on Github Pages.
When working on the html prototype, always work on the Dev branch, in order to enable the User to live-test on Github Pages.

Deferred work and rejected proposals live in `BACKLOG.md`. Read it for context when relevant, but don't open a session by attacking it — the user picks what to work on.

## File structure

The codebase was a single self-contained HTML file until it crossed ~19k lines. It's now split into per-subsystem JS files loaded as plain `<script src>` tags (no ES modules, no build step). The HTML shell holds the body, CSS, and nine script tags in dependency order.

Also in the repo: `index.html` at the repo root — a small redirect that points GitHub Pages at the engine file.

## Module layout

| File | Role |
|---|---|
| `cards/<tplId>/card.json` | One file per card template (258 cards). Each folder also holds `art.png` for cards with PNG art. `cards/_manifest.json` lists every folder name. |
| `js/cards.js` | `CARDS = {}` + `async loadCards()` fetcher (populates CARDS from the per-card JSONs at boot). Also holds `TOKENS`, `KEYWORDS`, `STICKERS`, `EMPOWER_FIELDS`, `KEYWORD_DISPLAY`, `KEYWORD_STICKER_WEIGHTS`, `RUN_MODIFIERS` — the shared registries that don't fit the per-card model. |
| `js/engine.js` | Mercurial trigger pool, splice eligibility helpers (`isSpliceableBase`, `canonicalSplicePair`, `isCompatibleStaplePair`, `remapEmpowerRollForStaple`, etc.), general helpers (`tplForSlot`, `deckColorsFromSlots`, `fakeTargetsForLegality`), `ENGINE` IIFE (state, mana, triggers, phases, combat, synthesis, `EFFECTS` dispatch ~40 kinds). |
| `js/card-text.js` | Card-text description helpers — `describeCardSegments`, `describeCardText`, `describeEffect/Trigger/Ability/StaticBuff/ModalSegs` + internal helpers (targetPhrase, withFilter, bumpedSeg/Derived, capitalizeSegs, triggerPreamble, keywordPreamble, abilityCostPhrase, segsToText). Pure data → English; reads `ENGINE.synthesizeStapledTemplate` for stapled-card baselines. |
| `js/stickers.js` | Sticker pipeline — runtime application (`weightedPick`, `applyStickersToCard`, `applyOneStickerToRuntimeCard`, `applyRandomStickersToSide`, `empowerRollLabel`, `applyEmpowerRoll`) and deck-construction helpers (`rollSubtypeFromDeck`, `pushStickerWithRoll`, `stickersForSlot`). Late-binds to `ENGINE.synthesizeStapledTemplate`, `tplForSlot`, `deckColorsFromSlots`. |
| `js/ai.js` | `AI` IIFE — decision logic, combat sim, lethal detection |
| `js/draft.js` | `DRAFT` IIFE — pack generation, color-aware sampling, 23-pick player draft, opp deck construction (incl. constructed-deck registry: Goblin Aggro, Spirit Tribal, Aristocrats, Archdemon Boss, Balancer Boss) |
| `js/run.js` | `RUN` IIFE — roguelike meta (map generation, rewards, post-draft offers), save/load to `magiclike_run` localStorage key, schema migrations |
| `js/picklog.js` | `PICKLOG` IIFE — draft pick analytics, `magiclike_picklog_v1` storage, exposed on `window.PICKLOG` for console queries |
| `js/controller.js` | `CONTROLLER` IIFE — input handling, modals, AI scheduling, plus the meta-game render helpers it owns (renderMap, renderReward, renderDraft, renderStatsContent, …) |
| `js/render.js` | `render()` main repaint, `renderManaPool`, `renderHand`, `renderBf`, `passLabel`, etc. — in-game UI only |
| `js/triggers.js` | `TRIGGER_CONDITIONS` registry (condId → predicate) and `evalTriggerCondition` resolver — the trigger vocabulary used at runtime |
| `js/trigger-generator.js` | `GENERATOR_EFFECTS` / `GENERATOR_CONDITIONS` data plus the rolling functions for Mercurial Adept / Architect's Codex (`generateRandomTrigger`, `generateConditionOptions`, `generateEffectOptions`, `assembleTrigger`) |
| `js/main.js` | `VERSION`, the `opp(who)` helper, and the bootstrap that awaits `loadCards()` then calls `CONTROLLER.init()`. |

Load order in `magiclike_engine.html` is: cards → engine → card-text → stickers → ai → draft → run → picklog → controller → render → triggers → trigger-generator → main. Each IIFE declares as a top-level `const`, so it's a global accessible from later scripts. Note: DRAFT calls PICKLOG at runtime (not at module-load), so the DRAFT-before-PICKLOG order is fine — identifier resolution inside IIFE function bodies is lazy. Same goes for stickers.js's late-bound references into ENGINE and into engine.js's top-level helpers.

**Card data:** Cards live one-folder-per-template under `cards/`. The tplId is the folder name AND a top-level field in `card.json`. To add a new card, create a folder, write `card.json`, append the folder name to `cards/_manifest.json`. The browser loads everything at boot via the manifest. Tests sync-load via `fs.readFileSync` (see `tests/_setup.js`).

## Persistence

`localStorage` is the only persistence. Keys:
- `magiclike_run` — current roguelike run (deck, stickers, wins/losses)
- `magiclike_picklog` — draft history analytics

Schema migrations live in the `RUN` module and run on load.

## Design backlog

The earlier in-code roadmap comment block has been removed as features shipped (tokens, modal spells, etc. are now implemented). Static Lords remain partially implemented: lords grant `staticBuffs` (stat changes) but not keywords — grep `cards/*/card.json` for `staticBuffs` to find them. Ask the user about current priorities before assuming what's next.

## Existing code style (descriptive, not prescriptive)

- IIFE modules — each subsystem (`ENGINE`, `AI`, `DRAFT`, etc.) is a function that returns its public surface.
- Comments are used liberally as documentation, including multi-line block comments explaining design decisions and roadmaps. Match this style; don't strip explanatory comments without asking.
- Some defensive coding is present in the engine (depth caps on triggers, null guards in renderers). Match the surrounding style of the area being edited.
- Vanilla JS, no transpilation, no TypeScript.

## Claude's general defaults — ask before applying to this codebase

I (Claude) carry general defaults that may not match this project. Before applying any of these to existing code, surface the change and ask:

- **"Don't add comments unless the WHY is non-obvious."** Will conflict with the existing comments-as-docs style.
- **"Don't add error handling for unreachable cases."** May conflict with intentional defensive guards in the engine.
- **"Three similar lines is better than a premature abstraction."** Fine for new code, but don't refactor existing duplication without checking.

For *new* code I write, I'll lean toward these defaults unless told otherwise. For *existing* code I'm editing, I'll match the surrounding style.

## Testing

Node-based regression suite under `tests/`. Run from `reference/html-proto/`:

```
node tests/run_all.js                       # 362 assertions, ~2s
node tests/selfplay_harness.js 500 bughunt  # AI vs AI, ~20s
```

`tests/_setup.js` boots the engine in Node by stubbing the DOM and concatenating the JS modules in script-tag order. Coverage is engine-level (card synthesis, sticker application, target legality, trigger generation, AI burn lethal, modal helper). See `tests/README.md` for the file-by-file breakdown.

DOM/UI behavior isn't covered by the harness — verify those by:
1. Opening `magiclike_engine.html` directly in a browser (or visiting the GitHub Pages URL).
2. Watching the devtools console — uncaught errors are the strongest signal of regression.
3. Playing through at least one combat phase, one stack interaction, and one draft pick if those areas were touched.
4. For AI changes: play a full game and watch the AI log entries (orange `.cb` log lines) for nonsensical decisions.

Console hooks for analytics: `window.PICKLOG.summarize()`, `window.PICKLOG.getCardStats()`, `window.PICKLOG.getPairsMatrix()`.

## Git workflow

- `dev` is the primary working branch.
- Commit changes, but only push when explicitly asked.
- Don't open PRs unless explicitly asked.
- **Bump `VERSION` (in `js/main.js`) and the version line at the top of this file on every push that updates `dev`.** This is the player-visible cache-buster — GitHub Pages caches aggressively, and the only reliable way to confirm a fresh build is loaded is to read the version string off the running page. One push to `dev` = one version bump, in the same commit as the substantive change (or a follow-up commit if you forgot).
