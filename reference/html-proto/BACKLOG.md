# Backlog

This file is a parking lot for deferred work on the html-proto, not a session agenda. Items live here because they came up in past sessions, got considered, and were deferred for a reason — usually "later," "blocked on X," or "needs the user's call."

## How to use this file

- **Claude reads it for reference, not as a directive.** Don't open a session by attacking the backlog. Wait for the user to point at something. If the user hasn't mentioned the backlog, don't proactively start backlog work.
- **The user picks what to work on.** If you finish a task and have idle attention, surface 1-2 relevant backlog items as suggestions — don't just start the next one.
- **Update this file when items change state.** Adding a new deferred item, moving one to "Recently done," or marking one rejected — all part of normal work. Add the version or commit hash to "Recently done" entries so the history reads in order.
- **Prune "Recently done" periodically.** Once an item is a few versions old and visibly shipped, drop it. This isn't a changelog — git log is the changelog.
- **No version bump for editing this file.** It's not browser-served. Same rule as CLAUDE.md.

---

## Open

- **`step()` phase-handler refactor** (`engine.js:7450`) — user wants to examine the turn state machine more deeply before approving structural changes.
- **`engine.js` multi-file decomposition** (likely 10+ files) — agreed direction. Blocked behind the `step()` refactor because the IIFE pattern makes the migration non-trivial.
- **`endomorphAbsorb()` modularization** (`engine.js:3053`) — revisit when the absorb logic itself changes; refactor against the new behavior rather than the current 95-line handler.
- **Category B test port** (~24 feature/E2E tests from the prior-session bundle: Balancer, Symmetricize, Steal, Splice, Bleach, Embargo, Scarification, Stapler, Spirit Shepherd, etc.). Originals live in the transcript attachment. Port incrementally when modifying the corresponding mechanic.

## Considered, rejected

Don't re-propose these without new information:

- **Merging `searchModal` + `zoneModal`** — different architectural layers (engine-paused `pendingSearch` vs. controller-orchestrated `pendingTarget`). True merge would require resolution-loop surgery; visual-only merge isn't worth the audit risk.
- **Merging `rewardModal` + `postDraftOfferModal` (visual)** — reward modal has 7 bespoke kinds; adding an 8th doesn't simplify. The separable architectural piece (`RUN.offerReward(candidates, opts, callback)` so rewards can fire from any trigger) was discussed and not committed to either way — pursue only if a feature actually needs it.
- **Section-banner comments in `engine.js`** — low navigation value, token cost.

## Not currently testable from Node

These would round out the PR #5 test plan but require a real browser:

- "Every modal opens and closes correctly" — DOM visibility.
- Trigger-generator UI clickthrough (3-condition → 3-effect picker flow) — DOM event handling.

## Recently done

- v1.0.134.16 — **tplId renames + save migration.** Four cards had legacy tplIds that didn't match their display names (`archmage`→`archmageOfVeils`, `fireImp`→`cinderSprite`, `zealot`→`holyZealot`, `merfolk`→`merfolkLooter`). Renamed folders, updated tplId/art fields, re-sorted manifest. SAVE_VERSION bumped 1→2 with `MIGRATIONS[1]` covering every persisted tplId field (`slots[].tplId`, `slots[].stapledTpls[]`, `pendingNeowModifier`, `currentPack[]`, `youPicks[]`, `oppDecks[][]`). PICKLOG translates inline on load (no schema bump, preserves history). New `tplid_renames_test.js` (39 assertions) covers the map, CARDS lookup, manifest contents, the migration, and PICKLOG translation. Save-persistence helpers (`SAVE_VERSION`, `TPLID_RENAMES`, `renameTplId`, `MIGRATIONS`) hoisted out of the RUN IIFE to module scope so tests can exercise them.
- v1.0.134.13–.15 — **Boon-art deduplication + architecture cleanup.** `RUN_MODIFIERS[*].art` was duplicating each granted card's art string; the picker now derives via `m.art || CARDS[m.id]?.art || '✦'` and the explicit field is dropped from all 7 boons. v1.0.134.13 did the dedup but missed `architectsCodex` (defined in `engine.js`, not `cards.js`). v1.0.134.14 caught + closed the gap and added `boon_art_derives_from_card_test.js` (7 assertions) as a guardrail. v1.0.134.15 moved the codex boon into `cards.js` with the other 6 so all boon definitions live in one place.
- v1.0.134.3, .4, .9, .11, .12 — **Mana-symbol pip pathway.** New `renderManaSymbols(text)` + `formatCostBraced(cost)` in `render.js`. Recognized tokens: `{W}/{U}/{B}/{R}/{G}/{C}/{T}/{X}/{N}`. Default fallback for color pips uses the Unicode circle emoji (⚪🔵⚫🔴🟢); colorless/tap/X/numeric stay as letter-on-disc. PNG drop-in pathway documented in `assets/mana/README.md` with a commented-out CSS block ready to uncomment. Routed through every visible render site: cost displays (hand `.ccost`, draft pick, popup, reward modal, zone-modal browser), card body text (via `segmentsToHtml`), sticker effect text + "Goes on:" eligibility (card browser, reward modal), landColor sticker badges (the `+{R}` problem), ability picker buttons (`{T}: Draw 1`), boon picker text, draft color counters.
- v1.0.134.1, .2, .5, .10, .14 — **Pixel art rollout.** 17 cards now ship real 64×32 pixel-art PNGs: `architectsCodex`, `archmageOfVeils`, `cinderSprite`, `cityOfBrass`, `dragon`, `elystra` (3 art-ladder variants), `endomorph`, `fieldMarshal`, `goblinChieftain`, `holyZealot`, `merfolkLooter`, `oblation`, `overrun`, `phylactery`, `stapler`, `verdantOutrider`, `wickedAcolyte`. `artHtml()` now detects file-path art (extends `data:`/`http` URL recognition with `.png/.jpg/.gif/.webp/.svg`) and the per-context CSS sizes images at integer scales for crisp pixelation (popup 4×, draft/reward/pair 2×, hand fills width). Inline-art sites (stack pill, library/search, zone modal) substitute the `🎴` glyph instead of trying to stretch an image into a narrow text strip. Dragon's old inline base64 data URI replaced with the file-path reference; no other cards ever had base64. Remaining cards still on emoji: ~241.
- v1.0.134.6 — **State-driven art ladder for Elystra.** Generic mechanism: any `card.json` can declare an `artLadder` array of `{minPT, art}` rungs and `effectiveArt(card)` will pick the highest rung the card's current `getStats()` p+t meets. Elystra has three rungs at 0/10/20. Used at the live-state render sites (board/hand, popup); template-only views (draft, reward, browser) keep showing the base `art` (no live stats available). New `art_ladder_test.js` (13 assertions).
- v1.0.134.7 — **GitHub Pages fix (Jekyll).** `cards/_manifest.json` was being filtered out by Jekyll's underscore-prefix convention. Added `.nojekyll` at repo root to disable Jekyll entirely. Pages now serves the repo as plain static files.
- v1.0.134.8 — **Regression fix: empty draft packs.** v1.0.134's empty-CARDS-at-module-load surfaced a bug in `meta.js`: `DRAFT_POOL`/`OPP_POOL` were `const`s computed at script-load time, freezing as `[]` because `CARDS` hadn't been populated yet. Converted to lazy-cached `draftPool()`/`oppPool()` functions; all 5 call sites updated. New `draft_pool_lazy_test.js` (7 assertions) — pulls 200 packs and verifies non-empty + valid coverage.
- v1.0.134 — Card data decomposition. `cards.js` shrunk from 1768 to 418 lines; 258 card templates moved out to `cards/<tplId>/card.json` (one folder per card, ready for per-card PNG art). `cards.js` now holds an empty `CARDS = {}` + `async loadCards()` fetcher and keeps the supporting registries (TOKENS, KEYWORDS, STICKERS, EMPOWER_FIELDS, KEYWORD_DISPLAY, KEYWORD_STICKER_WEIGHTS, RUN_MODIFIERS). `main.js` awaits the fetch before init; tests sync-load via `fs.readFileSync` in `tests/_setup.js`. Verified bit-identical to the pre-refactor CARDS object; 362/362 assertions pass; 100/100 self-play games clean.
- v1.0.133 — removed stale `/tmp/trigger_vocab_test.js` comment.
- v1.0.132 — Modal helper lifted to module scope (was throwing `ReferenceError` on every render); added 3 test files for PR #5's testable items (modal helper, trigger-generator data shape, AI burn-lethal).
- v1.0.131 — documented the version-bump-on-every-dev-push rule.
- v1.0.130 — `init()` double-invocation guard; `textContent` safety pass for dynamic interpolation.
- v1.0.129 — multi-file refactor (cards/engine/ai/meta/controller/render/triggers/trigger-generator/main); Modal helper added with 12-modal migration; `getDirectBurnSources` helper extracted from `ai.js`; mobile viewport + fullscreen-on-first-tap; Category A test suite ported (134 → 319 assertions).
