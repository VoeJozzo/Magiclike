# Design handoff — UI control gaps

**Status:** open · needs design-agent input
**Raised by:** the pixel-chrome assetization pilot (2026-07), while wiring baked UI tiles into
the html-proto. **Widened 2026-07** from the original *settings-ui-gap.md*: the reskin sweep
showed the same missing controls appear outside Settings, so this is now the register for all
of them.

This is the **register of controls the reskin needs that the baked kit does not provide**.
Every entry is a real, in-use control found in the live code with its call site — not a
wishlist — so the demand is auditable.

## The shape of the problem

`tools/bake/bake_ui_tiles.py` bakes the chrome the reskin consumes: `pxbtn_*` (buttons),
`woodbar_src` (panels/bars), `node_*`, `gem_*`, and four control tiles — `ctrl_toggle_on/off`,
`ctrl_slider`, `ctrl_segmented`, `ctrl_progress`.

What it does **not** bake is any **form control**. The UI builds three native ones, and a
native `<select>` / `<input>` / `<textarea>` cannot be styled into pixel art with CSS alone —
the browser draws its own widget. Those three are the blocking gap.

## Gap 1 — pixel select / dropdown (primary ask)

**Used by:** `js/settings-panel.js:31` — most Settings knobs are dropdowns.

`ctrl_segmented` handles **2–4** mutually-exclusive options; it does not scale to a font-family
picker with dozens. `ctrl_slider` fits ordered ranges but not named, unordered choices. Needed:
a control that opens on click, shows a scrollable option list, grid-legal (no anti-aliasing,
integer metrics), in the carved-wood language.

Two design calls come with it:

1. **Which knobs stay dropdowns vs. convert.** Several size steps are *ordered ranges* and
   could become `ctrl_slider` instead — a design decision, not a mechanical one.
2. **Simplify or keep.** The original mockup showed ~5 controls; the live panel has ~15.
   Either design for all of them, or intentionally slim Settings down.

### Live Settings inventory (from `settings-panel.js`)

| Control | Current type | Options source |
|---|---|---|
| Card size | dropdown | `CARD_SIZE_OPTIONS` |
| Font preset | dropdown | `FONT_PRESETS` + "Custom" |
| Per-element font (~4 elements) | dropdown ×N | `FONT_OPTIONS` |
| Per-element size (per above) | dropdown ×N | `FONT_SIZE_OPTIONS_BY_ELEMENT` |
| Popup text scale | dropdown | `POPUP_TEXT_SCALE_OPTIONS` |
| Mana pip size (hand/board) | dropdown | `MANA_PIP_SIZE_OPTIONS` |
| Mana pip size (popup) | dropdown | `MANA_PIP_SIZE_OPTIONS` |
| Land symbol size | dropdown | `BIG_MANA_SIZE_OPTIONS` |
| In-text mana symbol size | dropdown | `MANA_TEXT_SIZE_OPTIONS` |
| Keyword icon size | dropdown | `KW_ICON_SIZE_OPTIONS` |
| Show font picker UI | checkbox → `ctrl_toggle` | boolean |
| Reveal AI opponent's hand | checkbox → `ctrl_toggle` | boolean |
| Devtools section | collapsible | — |
| Copy settings as JSON | button → `pxbtn` | — |

## Gap 2 — pixel text input

**Used by:** `js/controller.js:557` (Card Browser search field) · `js/settings-panel.js:71`

A single-line text field. The Card Browser one is prominent — it filters the whole card list
as you type, so it is on screen the entire time the browser is open. Needs a carved-wood inset
well, a caret/focus state, and a placeholder treatment.

## Gap 3 — pixel textarea (multi-line)

**Used by:** `js/settings-panel.js:333` · `js/controller.js:3421` (Stats export — the user
reads and copies JSON out of it)

Lower priority than 1 and 2, but visible. Note `js/controller.js:2841` is a *hidden* textarea
(`position:absolute; opacity:0`) used only as a clipboard staging buffer for the TSV copy — it
is never seen and needs no design.

## Not gaps (recorded so they are not re-raised)

- **Close buttons, panel footers, table toolbars** — built from CSS over the existing palette
  (`.panel-close`, `.panel-footer`, `.tbl-*`). No new tile needed.
- **Checkboxes** — `ctrl_toggle_on/off` covers them.
- **Section frames / headers** — the `woodbar` carved panel and `.picker-header` cover them.
- **`ctrl_progress`** — baked but currently unused. Available if a meter is ever wanted; an
  unspent asset rather than a gap.

## Interim state

Until these ship, the affected surfaces keep native browser controls inside otherwise-reskinned
panels. That is visually inconsistent but functional, and it is a deliberate stopping point
rather than an oversight — see [`pixel-chrome-status.md`](pixel-chrome-status.md) for the
sweep's overall state.
