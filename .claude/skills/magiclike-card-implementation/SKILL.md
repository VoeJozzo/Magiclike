---
name: magiclike-card-implementation
description: >-
  Use when turning a *designed* Magiclike card into working, tested, merged engine
  code — the engineering phase after a card's concept already exists. Triggers on
  "let's make a card that does X", "implement/wire up <card>", "add <card> to the
  engine", "build the <mechanic> mechanic", or any request to make a specific card
  playable. NOT for brainstorming ideas (card-pitch-generator) or art (magiclike-card-art).
---

# Magiclike — card implementation

Taking a card whose *design* exists (name, type, cost, rules text) and making it a
real, playable, tested, merged card in the engine — usually the html-proto
(`reference/html-proto/`), sometimes the Godot side. Design and art are other
phases with their own skills: **card-pitch-generator** (what should exist) and
**magiclike-card-art** (its portrait). This is the "make it run, correctly" phase.

The recurring *lessons* this work tends to teach — re-anchoring against code that
moved, dodging version collisions, confirming green before claiming it — live in the
wiki's mistakes log; this skill doesn't re-carry them. What follows is the *procedure*
plus the magiclike-specific gotchas.

## The core move: build from existing primitives

**Construct the card out of shapes and primitives that already ship**, as much as you
can. Before writing anything, find the closest existing card(s) and read their
`card.json` *and* the engine code that resolves them — the trigger archetype, the
effect kind, the ability/targeting shape. (Example: a verse-counter cleric = Soul
Reaper's death-trigger + Grave Digger's `move_card` graveyard→hand recall on a Royal
Assassin-style targeted activated ability.) Naming the analogs first turns "a scary
new mechanic" into "X's trigger + Y's effect + assembly."

**If a primitive you need doesn't exist yet, build it** — that's normal work, never a
blocker. A card may need zero new primitives (pure assembly), one, or several; a
missing primitive is something you *add*, not a reason to drop the card. Prefer
general, reusable primitives over bespoke one-card handlers (it's how the engine is
built), but "we don't have a primitive for this" is a to-do, not a stop sign. Build
the one edge the card needs, not the whole matrix on spec — a handler for zone pairs
or events no card uses is the speculative over-engineering the engine's style notes
warn against.

## Engine gotchas

*(General implementation lessons — code that moved under you, version collisions,
confirming green — live in the wiki's mistakes log. These are the magiclike-specific
ones the lessons don't cover.)*

- **Parallel validation paths.** This engine enforces some rules in more than one place —
  e.g. a cost is checked in both `isLegalAction` and `getLegalActions` (the AI's
  enumerator); gate a new rule in **all** of them. **And flag the duplication to the
  user** — parallel rule-logic is usually a refactor candidate (often there shouldn't
  *be* two paths); surface it rather than silently entrench it.
- **Retired effect kinds.** The v2.0 migration retired *a handful* of legacy kinds from
  card data (e.g. +1/+1 `add_counter` → permanent `pump`; `edict`/`draw`/`discard`
  collapsed into primitives) — the engine still has plenty of kinds, just not those.
  `effect_migration_test` enforces their absence; check before reusing one. If you're
  repurposing a retired kind legitimately, narrow the guard to its true intent + say why.
- **card.json conventions.** Fields roughly alphabetical after `card_id`; `art` is a
  bare filename (`art.png`), resolved against the card's own folder; append the folder
  name to `cards/_manifest.json`; put a `target` at the trigger/ability *top level*,
  not inside the effect.
- **Generated card text is a surface, not an afterthought.** Oracle text is *generated*
  from effects/triggers (`card-text.js`), so a new target family, effect kind, or
  trigger preamble that skips it renders dead or wrong text — the card resolves
  correctly and still isn't done. Unlike the browser-only pieces below, this one *is*
  node-tested (`card_text_test.js`) — add coverage there.
- **Browser-only pieces.** Anything in `render.js` / the HTML / CSS (a badge, an
  overlay) is NOT covered by the node suite — verify it in-page.
- **AI usage.** A *player-usable* mechanic needs AI valuation (e.g. a `pickBestActivation`
  branch) or selfplay won't exercise it — and the AI may just never play it. No-crash
  is not the same as the AI actually using the card.

## Verify & land (the bar — non-negotiable)

In order:
1. **Closest single test first** for fast feedback, then the **full node suite** — read
   the real `TOTAL`/summary line, never a truncated tail; cite a number you saw this session.
2. **Boot validation** clean (predicate/effect/manifest scans run within the suite).
3. **Selfplay** — several hundred AI-vs-AI games, **0 crashes / violations / stuck /
   runaway**, with the new card in the pool (the integration gate).
4. **Lint** clean (`npm run lint` from `reference/html-proto/`; `npm ci` first if a fresh
   worktree lacks `node_modules`).
5. **Version sync + expect a collision.** Bump `VERSION` (main.js) + the `CHANGELOG.md`
   entry + the `CLAUDE.md` "Current" line, all to the same number. **Check `dev`'s
   *current* VERSION right before bumping** (`git show origin/dev:.../main.js`) —
   parallel branches collide here constantly; renumber to the next free one.
6. **Branch & PR.** Branch from the requested base — default `dev` when none is given;
   fetch first. Commit and open the PR **as your own bot identity** (never the repo
   owner's account) — see `docs/IDENTITIES.md` for the PR-as-bot mechanics; the
   authoring bot auto-subscribes. Use `git commit -F <file>` / `--body-file` for
   multi-line messages on Windows — here-strings mangle into pathspecs.

## See also

- **card-pitch-generator** — upstream: what card should exist.
- **magiclike-card-art** — its portrait (a finished art ≠ a playable card; that's this skill).
- `reference/html-proto/CLAUDE.md` (module map) · `docs/README.md` (doc router) · `docs/wiki/` (the engine's "why").
