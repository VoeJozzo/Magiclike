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

- v1.0.135 — split `meta.js` (2,412 lines, three IIFEs) into `js/draft.js` (866), `js/run.js` (1,348), `js/picklog.js` (196). Mechanical extraction along IIFE boundaries; no logic changed. Dependency graph (PICKLOG ← DRAFT ← RUN) is preserved by load order: cards → engine → card-text → ai → draft → run → picklog → controller → render → triggers → trigger-generator → main. Plus a `card_text_test.js` (53 assertions) was added in the same window to lock in describe* output post-v1.0.134.
- v1.0.134 — extracted card-text helpers (`describeCardSegments` and friends, ~720 lines / 21 functions) from `engine.js` into new `js/card-text.js`. Engine.js dropped 7,823 → 7,128 lines. Surgical extraction of top-level helpers above the ENGINE IIFE; doesn't touch the IIFE itself, so it's distinct from the broader engine.js decomposition still parked behind the `step()` refactor.
- v1.0.133 — removed stale `/tmp/trigger_vocab_test.js` comment.
- v1.0.132 — Modal helper lifted to module scope (was throwing `ReferenceError` on every render); added 3 test files for PR #5's testable items (modal helper, trigger-generator data shape, AI burn-lethal).
- v1.0.131 — documented the version-bump-on-every-dev-push rule.
- v1.0.130 — `init()` double-invocation guard; `textContent` safety pass for dynamic interpolation.
- v1.0.129 — multi-file refactor (cards/engine/ai/meta/controller/render/triggers/trigger-generator/main); Modal helper added with 12-modal migration; `getDirectBurnSources` helper extracted from `ai.js`; mobile viewport + fullscreen-on-first-tap; Category A test suite ported (134 → 319 assertions).
