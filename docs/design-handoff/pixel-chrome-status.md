# Pixel-chrome + boon-refactor — status / handoff

**Branch:** `claude/pixel-chrome-tiles`, off `dev` (dev merged in at `17c2f4b5`, current
as of this session). **HEAD `b8a48965`, 18 commits ahead of `dev`** (before this doc-update
commit), working tree clean, all pushed. Resume: `git fetch && git checkout
claude/pixel-chrome-tiles` (or `git pull`).

**Live-verified this session (via the served html-proto):** Growing-Deck boon-pick-#0 flow
(PICK 0/5 boon → PICK 1/5 buckets), Desert-Cube run-open (straight to PICK 1/40, no boon),
and the **Rewards screen end-to-end** (real drafted deck → forced win → real
`generateRewardOffer` → 3 real tiles rendered through the kit). See TODOs 3 & 4.

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
| **Rewards** | ✅ inherits the kit (zero reward-specific chrome written); **live-verified** end-to-end (real win → real reward → tiles); kind-sampling caveat in TODO 3 |
| **Search (in-game tutor)** | ✅ folded into the kit (compact/centered overrides kept) |
| **Settings** | ⛔ BLOCKED — needs a pixel dropdown from the design agent (see `settings-ui-gap.md`) |
| **Board** | 🟡 chrome pass + review round done — full chrome (`b1e5ad9e`), then review fixes: de-striped battlefield (dropped woodbar `fill`), uniform phase chips (dropped misaligned `ctrl_segmented`), unified mana pool onto `renderManaSymbols` (was a divergent `.mp*` letter system), and a **desktop layout media query** (base was mobile-only, no `@media`; desktop now caps battlefields to ~2 rows + centers the board — mobile untouched). All verified live via computed styles/measurements. Still worth a human eyeball on final aesthetics |

All 5 card-picker shells (draft/boon/reward/search) + the map header (via `.lg`) COMPOSE
one `.picker-*` kit — no forks. Change the dossier once, all follow.

## Remaining TODOs

**Reskin**
1. **Board** — 🟡 first chrome pass shipped (`b1e5ad9e`): `.pinfo` HUD → woodbar; `.bf`
   battlefield → felt + woodbar frame; `.acts` buttons → pxbtn tiles (scoped to `.acts`);
   `#mid` → wood bar; `.phases` → `ctrl_segmented`; `.zones` → iron chips; `#stackBanner`
   → wood+gold; `#sidebar`/log → wood panel. Card FRAMES untouched (content). **Open for
   review** — needs a human eyeball (screenshots wedge in-app). Specific things to judge:
   (a) two stacked woodbar-framed battlefields + HUD strips + mid bar may be *too much wood*
   — the `.bf` frame is the first thing to thin/drop if it feels heavy; (b) the `.phases`
   segmented-tile track uses `ctrl_segmented` as a repeating underlay behind variable-width
   cells, so tile cells won't align to phase cells — verify it reads OK; (c) `.mpool` mana
   pips were left as-is (mana symbols = content-ish); could gem-ify if desired.
2. **Settings** — blocked on the design agent's pixel dropdown.
3. **Live-verify Rewards** — ✅ DONE this session. Drove a real Classic run (auto-picked a
   full draft), forced a genuine win (`opp.life=0` + pass → the engine's own SBA
   `checkLifeTotals` → `endGame('you')` → the controller's game-over handler fired
   `RUN.recordResult` + `renderReward` automatically). The real `generateRewardOffer`
   produced a `mixed` reward; 3 tiles rendered through the `.rwd-pair` kit with real
   content (CLONE Island, STICKER Stapler, STICKER Bloodlust Berserker); picking a tile
   resolved + advanced to the "YOU WIN → Choose Path" map step.
   **Caveat:** this run randomly sampled only 2 of the 8 reward kinds (clone, sticker). The
   other 6 (`twoStickers`, `transform`, `ripUp`, `threeStickersBlind`, `splice`, `addBucket`)
   were mock-tested previously but not re-hit live. `addBucket` is Growing-Deck-only. Exhaustive
   live coverage needs many wins (coupon-collector) or a `renderReward` inject path (not
   exposed on the `CONTROLLER` export) — left as optional deeper QA, not a blocker.
   Correction (was a false alarm): I initially suspected a basic-land clone was a slot-count
   no-op. WRONG — that came from a bad cross-call measurement. Verified live with an atomic
   before/after test: `pickRewardCandidate` with a `clone` candidate unconditionally splices
   a new slot (+1) for basics and non-basics alike (`run.js` ~L1189; the only guard is a
   null-slot check). Cloned an Island: deck 43→44, island slots 4→5. `getSlots()` returns
   `runState.slots` raw (L1382) — basics ARE real stored slots, not recomputed by color.
   No bug. Only nuance: a clone of a *basic land* is a low-value reward offer, not a defect.

**Refactor**
4. **Live-test growing + Desert Cube run-opens** — ✅ DONE this session (all three modes now
   confirmed live). **Growing:** PICK 0/5 boon phase offered 3 boon-tagged cards
   (Phylactery / Elystra / City of Brass); picking one advanced to PICK 1/5 bucket draft
   (18 `.rwd-pair` bucket els) — the boon consumed no real pick. **Desert Cube:** straight to
   PICK 1/40, no boon phase, 3 card offers. **Classic:** already tested pre-session.
   (Verification note: the browser's `read_page` a11y tree served STALE cached snapshots all
   session — ground truth came from live `javascript_tool` DOM/state queries; screenshots
   time out on card-heavy screens = the known renderer-wedge, not a fault.)
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
