# Magiclike — Rules Engine

Magic: The Gathering-style card game. Currently a single self-contained HTML file (`magiclike_engine.html`). Vanilla JS, no build step, no frameworks, no network calls. Open in any modern browser to play.

Current version: `v0.99.48` (defined at `magiclike_engine.html:404`).

## File structure

Currently everything lives in `magiclike_engine.html`. This started as a Claude.ai artifact, where single-file is mandatory. Splitting into modules (`cards.js`, `engine.js`, `ai.js`, `ui.js`) is acceptable when navigability clearly outweighs portability — but check with the user first; don't refactor preemptively. ES modules work without a build step, so a multi-file split wouldn't require Webpack/Vite.

Also in the repo: `index.html`, a small redirect that points GitHub Pages at the engine file.

## Module layout (line ranges in the JS section, lines 397-10859)

| Module | Lines | Role |
|---|---|---|
| Card data (`CARDS`) | 444-1743 | ~217 card templates by color |
| Stickers / empowerment | 1859-1926 | Card-modifier system |
| `ENGINE` (IIFE) | 2075-5206 | State, mana, effects, triggers, phases, combat |
| Card valuation | 2505-2882 | Heuristics shared by AI and draft |
| `EFFECTS` dispatch | 2958+ | ~40 effect kinds (damage, draw, pump, etc.) |
| `AI` (IIFE) | 5507-6659 | Decision logic, combat sim, lethal detection |
| `DRAFT` (IIFE) | 6660-7197 | 23-pick draft, opp deck simulation |
| `RUN` (IIFE) | 7198-7808 | Roguelike meta, save/load, schema migrations |
| `PICKLOG` (IIFE) | 7809-8000 | localStorage analytics, exposed on `window.PICKLOG` |
| `CONTROLLER` (IIFE) | 8001-9251 | Input handling, modals, AI scheduling |
| Rendering | 9252-10839 | `render()` is the main repaint, called on state change |
| Entry point | 10848+ | `CONTROLLER.init()` |

## Persistence

`localStorage` is the only persistence. Keys:
- `magiclike_run` — current roguelike run (deck, stickers, wins/losses)
- `magiclike_picklog` — draft history analytics

Schema migrations live in the `RUN` module and run on load.

## Design backlog

The original developer left an explicit roadmap as a comment block at `magiclike_engine.html:2884-2956`. Treat this as a *reference*, not gospel — the user may have changed priorities since it was written. Ask before assuming any item is the next thing to build. Highlights from that comment block:

- Tier 1: Tokens, Sacrifice, Static Lord effects (continuous "+1/+1 to other Goblins")
- Tier 2: AOE damage, Mass bounce, EOT keyword grants, Lifegain trigger event, Flicker
- Tier 3: Modal spells, Cycling, Protection, Reanimate, Storm, Cascade

Static Lords are partially implemented: lords currently grant `staticBuffs` (stat changes) but not keywords. See `magiclike_engine.html:1502-1504`.

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

- Develop on `claude/recover-artifact-work-TyaAQ`.
- Commit changes, but only push when explicitly asked.
- Don't open PRs unless explicitly asked.
