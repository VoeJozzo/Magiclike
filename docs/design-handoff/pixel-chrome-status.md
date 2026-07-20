# Pixel-chrome reskin — status / handoff

**Branch:** `claude/pixel-chrome-tiles`. **HEAD `088591a4`, 40 commits ahead of `dev`, 0 behind**
(dev merged in twice, most recently the PR #148 audit batch). Working tree clean, all pushed.

## What this branch is

A pixel-chrome reskin of the html-proto, plus the refactors it forced. The pipeline is
**bake → lint → consume**: `tools/bake/bake_ui_tiles.py` emits grid-pure tiles *and* their
intended 9-slice insets (`assets/ui/_slices.json`); `tools/pixel-lint.js` checks consumers
against them; the CSS consumes via `border-image`.

## Screens

| Screen | State |
|---|---|
| Map, Draft, Boon, Rewards, Search | ✅ one shared `.picker-*` kit |
| Board | ✅ HUD/felt/buttons/phases/zones/stack/log; horizontal action row; desktop media query |
| Main menu, Game over (win+lose) | ✅ kit chrome + pxbtn tiles |
| Prompt modals (Bargain / Symmetricize / Optional Cost / Choose-a-Mode / Build-an-Ability / Zone) | ✅ composed onto the kit; per-prompt accent via `--picker-accent-text` |
| Mana-colour / Ability / Graveyard pickers | ✅ composed onto the kit |
| Stats, Card Browser | ✅ kit chrome + shared `.tbl-*` / `.panel-*` furniture |
| Settings | 🟡 panel chrome done + `ctrl_toggle` tiles wired; the 24 `<select>`s stay native |
| Card frames | untouched by design — they are content, not chrome |

## Open

1. **Pixel form controls** — `<select>` / `<input>` / `<textarea>` cannot be styled with CSS
   alone. Design-agent work; see [`control-gaps.md`](control-gaps.md). Joe's call: have all
   three designed together rather than shipping one interim control.
2. **Hardcoded styling in JS: 114 → 46.** The remainder is mostly `renderSandboxPanel` (a dev
   tool) and `render.js`'s main render loop. `pixel-lint.jsInlineStyles()` now flags new ones.
3. **Node icons + boss icon** → pixellab.
4. **Aesthetic review** — structure is verified mechanically; whether it *looks* right needs a
   human. Stats tables in particular need real picklog data to judge.
5. Backlog: de-jank Phylactery; optional boss-splice gameplay test.

## Things worth not relearning

- **No CSS `zoom`** on screens with JS-drawn geometry — it desyncs `getBoundingClientRect`
  from SVG space (broke the map edges).
- **Serve from the REPO ROOT** so `../../assets/mana/*.svg` resolves as on Pages; a wrong root
  404s every mana symbol and silently falls back to letters/emoji.
- **`?v=` does not bust `js/*.js`** — use a fresh port to force a clean load.
- **Two slice bugs cost real time**: insets that overflow the tile hollow an element out, and
  insets that *fit but mismatch the tile's build* put labels on the drop shadow. Both are now
  lint-checked; the generator publishes the intended values.
- **Inline styles outrank the stylesheet.** A hardcoded colour in JS silently defeats a reskin
  with no error. Static → CSS; genuinely computed values (positions, per-row accents, bar
  widths) stay inline.
