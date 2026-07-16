# Design handoff — Settings screen control gap

**Status:** open · needs design-agent input before the Settings screen can be reskinned
**Raised by:** the pixel-chrome assetization pilot (2026-07), while wiring baked UI tiles into the html-proto.
**Not blocking:** the Map / Board / Draft / Rewards reskins can proceed without this; only Settings waits.

## The finding

The design bundle's **Settings mockup is a simplification** of the real panel. The live
`reference/html-proto/js/settings-panel.js` exposes ~15 controls, and **most of them are
`<select>` dropdowns with many options** (font families, size steps). The design kit only
provides:

- `.seg` — a segmented control (good for **2–4** mutually-exclusive options)
- `.pxtog` — a boolean toggle
- `.pxsli` — a slider (continuous / ordered range)

There is **no pixel equivalent for a dropdown / long option list**. Segmented doesn't scale
to a font-family picker (dozens of options); a slider doesn't fit named, unordered choices.
So the single biggest unmet need is a **pixel "select" control**.

## What the design agent needs to provide

1. **A pixel dropdown / select control** — the primary ask. Opens on click, shows a scrollable
   list of options, grid-legal (no AA, integer metrics), in the carved-wood language. Used
   for font-family and size-step pickers.
2. **A ruling on which knobs stay dropdowns vs. convert** — some size steps (text size, pip
   size) are *ordered ranges* and could become `.pxsli` sliders instead; that's a design call.
3. **A simplify-or-keep decision** — the mockup showed ~5 controls; the real panel has ~15.
   Either design controls for all of them, or intentionally slim the Settings screen down.

## Actual control inventory (from settings-panel.js)

| Control | Current type | Options source |
|---|---|---|
| Card size | dropdown | `CARD_SIZE_OPTIONS` |
| Font preset | dropdown | `FONT_PRESETS` + "Custom" |
| Per-element font (title/body/pip, ~4 elements) | dropdown ×N | `FONT_OPTIONS` |
| Per-element size (per above element) | dropdown ×N | `FONT_SIZE_OPTIONS_BY_ELEMENT` |
| Popup text scale | dropdown | `POPUP_TEXT_SCALE_OPTIONS` |
| Mana pip size (hand/board) | dropdown | `MANA_PIP_SIZE_OPTIONS` |
| Mana pip size (popup) | dropdown | `MANA_PIP_SIZE_OPTIONS` |
| Land symbol size | dropdown | `BIG_MANA_SIZE_OPTIONS` |
| In-text mana symbol size | dropdown | `MANA_TEXT_SIZE_OPTIONS` |
| Keyword icon size | dropdown | `KW_ICON_SIZE_OPTIONS` |
| Show font picker UI | checkbox → `.pxtog` | boolean |
| Reveal AI opponent's hand | checkbox → `.pxtog` | boolean |
| Devtools section | collapsible | — |
| Copy settings as JSON | button → `.pxbtn` | — |

## Already covered (baked, no design needed)

The checkboxes map to `.pxtog`, the export/done buttons to `.pxbtn`, section frames to the
`woodbar` carved panel, and the mockup's Text-Size slider to `.pxsli` — all baked in
`reference/html-proto/assets/ui/`. The **dropdown is the one true blocker.**
