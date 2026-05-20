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

- **SVG disc for {C}/{T}/{X}/numeric mana pips** — the 5 WUBRG pips are SVG (`assets/mana/{W,U,B,R,G}.svg`); the rest still use CSS letter-on-disc. Design an SVG disc treatment to match the WUBRG family (number content stays — by design).
- **Empty `catch (_) {}` in `renderSettings`** — 8 repeats of `try { render(); } catch (_) {}` at `controller.js` L419/515/533/547/579/592/603/614, all with the same `/* not in-game yet */` rationale. Either replace with a single `safeRender()` helper, or have `render()` itself early-return when there's no active game state so callers don't need the guard. Also: the bare `try { entry.prevFocus.focus(); } catch (_) {}` (L40) and `try { req.call(el).catch(()=>{}); } catch (_) {}` (L279) silently swallow errors that should at minimum `console.warn` — tighten when convenient.
- **`step()` phase-handler refactor** (`engine.js:6322`) — user wants to examine the turn state machine more deeply before approving structural changes.
- **`engine.js` multi-file decomposition** (likely 10+ files) — agreed direction. Blocked behind the `step()` refactor because the IIFE pattern makes the migration non-trivial.
- **`endomorphAbsorb()` modularization** (`engine.js:1925`) — revisit when the absorb logic itself changes; refactor against the new behavior rather than the current 95-line handler.
- **Per-mechanic feature tests** — when touching a mechanic non-trivially (Balancer, Symmetricize, Steal, Splice, Bleach, Embargo, Scarification, Stapler, Spirit Shepherd, etc.), write a fresh test alongside the change. The prior-session test bundle (in the transcript attachment) is a useful **reference** for "what was worth checking for X" but no longer a queue to port — the code has shifted enough that translation cost rivals fresh authoring. Model: `tests/card_text_test.js` (v1.0.136 sticker extraction).

## Not currently testable from Node

These would round out the PR #5 test plan but require a real browser:

- "Every modal opens and closes correctly" — DOM visibility.
- Trigger-generator UI clickthrough (3-condition → 3-effect picker flow) — DOM event handling.
