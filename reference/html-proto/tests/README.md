# Magiclike Test Suite

Node.js tests for the engine in `reference/html-proto/js/`. Each test
loads the engine's 9 module files in script-tag order, stubs the DOM
that `controller.js` / `render.js` reach for at load time, then
exercises the public API (ENGINE, AI, RUN, DRAFT) and a handful of
exposed module-private helpers (resolveTarget, makeCard,
rollSubtypeFromDeck, etc.).

## Prerequisites

Node.js. No npm install needed — tests use only built-in modules.

## Quick start

```bash
# Run the core suite (362 assertions, ~1 second).
node tests/run_all.js

# Run an individual test.
node tests/subtype_v2_test.js

# Self-play stability harness — AI vs AI, with invariant checks.
node tests/selfplay_harness.js 500 bughunt    # 500 games, ~20s
```

Run from `reference/html-proto/`. The tests are also runnable from
within `tests/` directly — they reference `js/` via `__dirname`.

## What's here

### Core regression suite (run via `run_all.js`)

362 assertions across 13 files, ~1s total. Guards engine invariants
and structural patterns that protect against silent regressions.

**Ported from the prior-session bundle:**

- `v80_helpers_test.js` — `leavesPlayPreservingBuffs` and
  `appendMergedText` helpers exist; older inlined patterns are gone
- `subtype_v2_test.js` — single `subtype` sticker; deck-weighted
  rolling; legacy `subtype_<tribe>` save migration
- `subtype_rolls_complete_test.js` — `applyStickerToSlot` populates
  `subtypeRolls`; rolled subtype propagates to the card on engine init
- `three_stickers_subtype_test.js` — `pushStickerWithRoll` reachable
  via both the RUN public path and the opp-AI direct-slot path
- `faketargets_refactor_test.js` — `fakeTargetsForLegality` exists at
  module scope; basic shape handling
- `stickersfor_consolidation_test.js` — `stickersForSlot` /
  `deckColorsFromSlots`; type-aware sticker offers (creature vs land);
  stapled-slot handling
- `template_isolation_test.js` — `stickersForSlot` does NOT mutate
  the source template (per-instance independence)
- `extracted_helpers_test.js` — source-level call-site counts for
  `resolveTarget` (19) and `pluckFromBattlefield` (10); fizzle
  message in ≤4 places; smoke-test the game boots cleanly
- `sticker_kinds_dispatch_test.js` — every sticker kind (statBoost,
  keyword, innate, landColor, costReduction, empower, subtype)
  exercised across `applyStickersToCard`, `stickersForSlot`, and
  `stickerBadgesHtml`

**Authored this session to cover PR #5's test-plan items:**

- `modal_helper_test.js` — Modal helper stack/dismissible logic.
  Covers test-plan items "Escape closes dismissible modals" and
  "Escape does NOT close decision modals." Stack push/pop, LIFO
  ordering, idempotency, nested modals, `onClose` userInitiated flag.
- `trigger_generator_test.js` — procedural trigger generator
  (Mercurial Adept / Architect's Codex). Covers test-plan item
  "Mercurial Adept / Architect's Codex trigger-generator UI works
  end-to-end" at the data-shape layer. Validates every emitted
  trigger has well-formed event/condId/effects/text, the
  needsLiveSource × sourceLive filter holds across 500 rolls, and
  the Adept deck-build integration rolls a bonus from
  MERCURIAL_TRIGGER_POOL.
- `ai_burn_lethal_test.js` — AI burn-lethal recognition. Covers
  test-plan item "AI burn-lethal still fires for both single-spell
  and multi-spell variants." Single-spell (Bolt/Shock to lethal),
  multi-spell sequencing (two Shocks taking opp from 4 to 0),
  ability-based burn (tap-Acolyte for face), and no-lethal smoke
  test. Refactor protection for `getDirectBurnSources`.
- `choice_prompts_test.js` — Symmetricize + numberChoice cast-time
  prompts. Both are normally only reachable mid-game (Symmetricize is
  a card; numberChoice is Archdemon's ETB), making manual testing
  tedious. State-machine coverage: prompt shape after cast,
  submission collapses the target's stats / stashes the number on
  the source, slot persistence for player-side symmetricize,
  boundary validation on numberChoice's min/max.

**Not covered:** test-plan item "every modal opens and closes
correctly" — that's DOM visibility, which can't be observed from
Node with stubbed DOM. UI-side coverage requires manual browser
testing.

### Stability harness

- `selfplay_harness.js` — AI vs AI self-play with per-action
  invariant checks. Catches crashes, invariant violations, stuck
  games, and runaways (>100 turns).
  - Modes: `bughunt` (default, random drafts + every basic gets every
    non-native land-color sticker — eliminates color screw and
    maximizes interaction surface) or `playtest` (heuristic drafter
    both sides, no stickers — for clean balance numbers).
  - Usage: `node selfplay_harness.js [numGames] [bughunt|playtest]`.

## How a test loads the engine

Browser-side, the engine is 13 module files loaded via
`<script src>` tags. Each file is at script (module) scope; later
files reference identifiers declared in earlier files.

For Node tests, `_setup.js` is the shared loader:

1. Stub `document`, `window`, `localStorage`, `ResizeObserver`,
   `MutationObserver`, `requestAnimationFrame`, etc. The engine's
   `init()` and the render loop touch these even though tests don't
   exercise UI.
2. Read the 13 JS module files and concatenate them in the same order
   `magiclike_engine.html` loads them: `cards` → `engine` → `card-text`
   → `stickers` → `ai` → `draft` → `run` → `picklog` → `controller` →
   `render` → `triggers` → `trigger-generator` → `main`.
3. Strip `CONTROLLER.init();` from the bootstrap (it tries to wire up
   real DOM listeners we don't have).
4. Eval the result inside a `new Function(...)`, with a trailing
   `global.X = X` for each name the tests want to reach.

Tests then `require('./_setup')`, call `setup.loadEngine()`, and use
`ENGINE`/`AI`/`RUN`/`CARDS`/etc. at module scope.

## Adding a new test

```js
const setup = require('./_setup');
setup.loadEngine();          // skip if you only need source-level checks

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

// ... your tests using RUN.start(...), ENGINE.state(), etc. ...

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
```

If you need a module-private helper that isn't on the `global` after
`loadEngine()`, add its name to the `EXPOSED` array in `_setup.js`.
Look for `function <name>(...)` declarations at top-level in the JS
modules — those are the candidates.

If you want the test included in `run_all.js`, add its filename to
`CATEGORY_A`.

## Common gotchas

- **Mock cards need `tplId` set explicitly.** Templates don't carry
  `tplId` (it's the key in `CARDS`). Real `makeCard` sets it; mocks
  built via `JSON.parse(JSON.stringify(tpl))` don't. Add
  `inst.tplId = tplId` after cloning.
- **`G.priority = {passes: new Set()}` is required** for instant-window
  legality checks.
- **`G.activePlayer / G.priorityHolder / G.phase`** all need to be set
  for cast legality. Sorcery-speed checks reject if `activePlayer`
  isn't the caster.
- **`RUN.clearSave()` between tests** in the same file — localStorage
  is shared across the file, so a test setting up a new run after
  another can pick up the previous run's state.

## Maintenance notes

Tests were originally built when the engine was a single monolithic
HTML file, and validated against the current 13-module layout.

Major engine changes that may require test updates:
- New `PENDING_DECISIONS` entries — tests poke `G.pending*` directly
- New `makeCard` positional args — tests calling makeCard need updates
- Signature changes to `findCard`, `pluckFromBattlefield`,
  `effectsForMode` — many tests use these directly
- `extracted_helpers_test.js` does structural pattern-match counting;
  refactors that change call site counts will fail it. **Bump the
  expected count, don't delete the assertion** — it's there to catch
  unintentional bypasses (e.g. someone inlining the lookup instead of
  going through the helper).

## Limitations

- **No UI coverage.** DOM-touching code (renderHand, makeCardEl,
  target lines, modal interactions) is uncovered. UI bugs need manual
  testing in the browser.
- **AI is non-deterministic.** Math.random is used directly; two
  500-game self-play runs don't produce identical results, but
  failure rates are stable.
- **Each test loads the engine fresh** (~50-100ms overhead per
  process). Adds up for the full suite.

## Future work

- **Unified test runner.** A runner that loads the engine once and runs every test's assertions cumulatively would dramatically speed up the full suite (~50-100ms × ~20 tests today).
