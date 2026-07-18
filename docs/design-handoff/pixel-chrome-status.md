# Pixel-chrome + boon-refactor — status / handoff

**Branch:** `claude/pixel-chrome-tiles`, off `dev` (dev merged in at `17c2f4b5`, current
as of this session). **HEAD `ce156375`, 17 commits ahead of `dev`**, working tree clean,
all pushed. Resume: `git fetch && git checkout claude/pixel-chrome-tiles` (or `git pull`).

Two intertwined threads this session:
- **(A) the pixel-chrome UI reskin** — the original goal.
- **(B) a modal-consolidation + boon/`special` refactor** — grew out of noticing the
  draft / boon / reward modals were duplicated forks.

## Commits (grouped)

**A — UI reskin**
- `2f227b79` baked tile kit + generator + linter (18 tiles)
- `c2a3c45b` Settings control-gap doc (design-agent handoff)
- `5374bf1e` map reskin · `a3049170` map polish (2×)
- `4cb53d1e` draft reskin · `9656c1d4` (old) status doc
- `f8ab3458` boon/land modal reskin · `acab5022` consolidate 3 shells → 1 kit · `712b5381` map header → `.picker-header.lg`
- `96ce8b8a` searchModal → kit (5th fork removed)

**B — boon/special refactor**
- `43cbc3aa` cut boon fossils (dead synthetic branch + wrong footer name)
- `b3d40ae8` innate intrinsic on boon lands · `7b0f693e` killCdf counts specials
- `a5e82749` backlog: de-jank Phylactery
- `46eaa752` split `special` → `boon`/`boss` tags + decouple splice onto `stapleable`
- `ce156375` boon = draft pick #0; delete `RUN_MODIFIERS`

## The pipeline (proven)
bake (`reference/html-proto/tools/bake/bake_ui_tiles.py`, grid-pure) → lint
(`tools/pixel-lint.js`) → consume (browser `border-image`/`background-image`; Godot will
use `StyleBoxTexture`). 18 tiles in `reference/html-proto/assets/ui/`.

## UI reskin — per screen
| Screen | State |
|---|---|
| **Map** | ✅ reskinned + polished (2× integer sizing), verified in-engine |
| **Draft** | ✅ reskinned + verified; growing-deck bucket tiles fixed via shared `.rwd-pair` |
| **Boon / land modal** | ✅ reskinned — now the SAME `.picker-*` kit as draft |
| **Rewards** | ✅ inherits the kit (zero reward-specific chrome written); render verified via mock |
| **Search (in-game tutor)** | ✅ folded into the kit (compact/centered overrides kept) |
| **Settings** | ⛔ BLOCKED — needs a pixel dropdown from the design agent (see `settings-ui-gap.md`) |
| **Board** | ⬜ NOT started — the in-game play screen; the last major reskin |

All 5 card-picker shells (draft/boon/reward/search) + the map header (via `.lg`) COMPOSE
one `.picker-*` kit — no forks. Change the dossier once, all follow.

## Remaining TODOs

**Reskin**
1. **Board** — in-game play screen (dossiers, battlefield, front line, hand). Biggest
   remaining surface. Card FRAMES stay as-is (content, not chrome).
2. **Settings** — blocked on the design agent's pixel dropdown.
3. **Live-verify Rewards** — I forced it visible with mock rows; drive a real reward
   screen (finish a game) to confirm the 7 reward kinds render.

**Refactor**
4. **Live-test growing + Desert Cube run-opens** — only CLASSIC was click-tested
   end-to-end for boon-pick-#0. Growing (boon phase → buckets) and Desert Cube (no boon)
   are correct by construction but not live-tested.
5. **De-jank Phylactery** (`reference/html-proto/BACKLOG.md`) — its protection is
   `slot.tplId === 'phylactery'`, so a spliced-in Phylactery isn't detected;
   `stapleable:false` is the stopgap. Real fix: stapled-aware slot membership.
6. **Boss splice gameplay-test (optional)** — bosses are now spliceable (they reach your
   deck via Steal). I audited them (0 tplId-keyed refs) + merge-tested the boons, but did
   NOT full-gameplay-test spliced bosses. Any that misbehaves → one-line `stapleable:false`.
7. **Box factory — DECIDED AGAINST (for now).** The chrome kit already kills drift; a
   `showPicker()` factory is risky churn on working flows for elegance-only gain (a neutral
   Haiku review agreed). Revisit only if a modal #6/#7 makes it pay. If pain arises, the
   middle path is extracting shared LOGIC helpers (event-binding/focus/cleanup), not a factory.

## Handoffs to OTHER workflows (not this one)
- **Settings pixel dropdown** → design agent (`settings-ui-gap.md`).
- **Node icons + boss node icon** → pixellab art pipeline. The design's SVG node icons were
  REJECTED; node icons are placeholder text; the boss node is still an emoji.

## Key decisions / gotchas (don't relearn)
1. **No CSS `zoom` on screens with JS-drawn geometry** — it desyncs `getBoundingClientRect`
   from the SVG coordinate space (broke the map edges). Upscale via explicit integer sizes.
2. **Card frames are content, not chrome** — never restyle `makeCardEl`.
3. **Layer model:** chrome = baked tiles; text = fonts (Pixelify still pending); state-glows
   = runtime CSS light. Only chrome is baked.
4. **`special` is retired** — replaced by `boon`/`boss` tags. Draftability derives via
   `isUndraftable(tpl) = boon||boss` (`types.js`). Splice is a SEPARATE axis via `stapleable`
   + the type rules. All 17 special cards are now tagged `boon` (7) or `boss` (10).
5. **Boon = draft pick #0** — no separate modal, no `RUN_MODIFIERS`. A boon is a plain card
   tagged `boon`, offered as the draft's pick #0, stored on `DRAFT.state.boon`, prepended to
   the deck as an EXTRA (deck stays 41 = 23 spells + 17 lands + boon).

## Verify locally
Serve from the **REPO ROOT** (so `../../assets/mana` symbol paths resolve like Pages):
```
cd <worktree> && python -m http.server 8878 --bind 127.0.0.1
# open http://127.0.0.1:8878/reference/html-proto/magiclike_engine.html
```
- **Cache gotcha:** the HTML `?v=` param does NOT bust linked `js/*.js` or `card.json`. For a
  truly fresh load (after editing JS/JSON), serve on a **NEW PORT** — a new origin = no cache.
- **Mobile preview gotcha:** the mobile Claude client collapses attachment cards + inline
  widgets to chips and chokes on multi-image CSS; **single-image Artifact pages** render reliably.
- **Renderer wedge:** `makeCardEl` × many cards can freeze the in-app renderer mid-test; it's a
  perf hiccup, not a code fault — re-navigate or verify programmatically.
