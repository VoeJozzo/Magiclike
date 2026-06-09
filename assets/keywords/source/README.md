# Keyword symbol design source

`keywordiconsship.jsx` — the React preview component the keyword-ability
symbols were derived from. Reference only; not loaded at runtime (no React
runtime). Each symbol is drawn as static literal geometry and wrapped by
`KeywordIcon` into a 40×40 coin (clip circle r=16.5, radial shine, double
rim) — the same coin shell as the mana symbols (`../../mana/source/`).

The compiled outputs ship at `assets/keywords/<key>.svg`, baked in the
shipping palette (lake-gray disc `#8899AA`, rim `#6677AA`, near-black glyph
`#0A0A0A`). The `.jsx` notes the palette is meant to be recolored per
keyword in-game by swapping `fg`/`bg`.

## File naming vs the engine keyword list

The `.svg` file names match the engine keyword keys
(`reference/html-proto/js/cards.js` `KEYWORDS`), so the source `firststrike`
ships as `first_strike.svg`. Coverage notes:

- **All 14 combat keywords** have an icon. `unblockable` was the late
  addition — its source is the separate `keywordiconunblockable.jsx`;
  `keywordiconsship.jsx` covers the other 13.
- **`innate` and `tap`** ship as icons too but are not combat keywords in
  `KEYWORDS` (`innate` tags innate abilities; `tap` already has a text pip).

Authored by Claude in a separate session; see top-level `LICENSES.md`.
