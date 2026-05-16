# Magiclike — Rules Engine

Magic: The Gathering-style card game. `magiclike_engine.html` plus a `js/` folder of vanilla-JS modules — no build step, no frameworks, no network calls. Open in any modern browser to play.

Current version: `v1.0.132` (defined at `js/main.js`, `const VERSION`).
Always update the Current Version whenever you push a change to the Dev branch. This will allow the User to verify that the current version is live on Github Pages.
When working on the html prototype, always work on the Dev branch, in order to enable the User to live-test on Github Pages.

## File structure

The codebase was a single self-contained HTML file until it crossed ~19k lines. It's now split into per-subsystem JS files loaded as plain `<script src>` tags (no ES modules, no build step). The HTML shell holds the body, CSS, and nine script tags in dependency order.

Also in the repo: `index.html` at the repo root — a small redirect that points GitHub Pages at the engine file.

## Module layout

| File | Role |
|---|---|
| `js/cards.js` | `CARDS` (~210 templates), `TOKENS`, `KEYWORDS`, `STICKERS`, `EMPOWER_FIELDS`, `RUN_MODIFIERS` (Neow boons) |
| `js/engine.js` | Mercurial pool, sticker application, card-text description helpers, `ENGINE` IIFE (state, mana, triggers, phases, combat), `EFFECTS` dispatch (~40 effect kinds) |
| `js/ai.js` | `AI` IIFE — decision logic, combat sim, lethal detection |
| `js/meta.js` | `DRAFT` IIFE (pack generation, 23-pick draft, opp deck sim), `RUN` IIFE (roguelike meta, save/load, schema migrations), `PICKLOG` IIFE (analytics, `window.PICKLOG`) |
| `js/controller.js` | `CONTROLLER` IIFE — input handling, modals, AI scheduling, plus the meta-game render helpers it owns (renderMap, renderReward, renderDraft, renderStatsContent, …) |
| `js/render.js` | `render()` main repaint, `renderManaPool`, `renderHand`, `renderBf`, `passLabel`, etc. — in-game UI only |
| `js/triggers.js` | `TRIGGER_CONDITIONS` registry (condId → predicate) and `evalTriggerCondition` resolver — the trigger vocabulary used at runtime |
| `js/trigger-generator.js` | `GENERATOR_EFFECTS` / `GENERATOR_CONDITIONS` data plus the rolling functions for Mercurial Adept / Architect's Codex (`generateRandomTrigger`, `generateConditionOptions`, `generateEffectOptions`, `assembleTrigger`) |
| `js/main.js` | `VERSION`, the `opp(who)` helper, and the two-line bootstrap that wires `window.PICKLOG` and calls `CONTROLLER.init()` |

Load order in `magiclike_engine.html` is: cards → engine → ai → meta → controller → render → triggers → trigger-generator → main. Each IIFE declares as a top-level `const`, so it's a global accessible from later scripts.

## Persistence

`localStorage` is the only persistence. Keys:
- `magiclike_run` — current roguelike run (deck, stickers, wins/losses)
- `magiclike_picklog` — draft history analytics

Schema migrations live in the `RUN` module and run on load.

## Design backlog

The earlier in-code roadmap comment block has been removed as features shipped (tokens, modal spells, etc. are now implemented). Static Lords remain partially implemented: lords grant `staticBuffs` (stat changes) but not keywords — see the `staticBuffs:` entries in `js/cards.js`. Ask the user about current priorities before assuming what's next.

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

No test suite. Verify changes by:
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
