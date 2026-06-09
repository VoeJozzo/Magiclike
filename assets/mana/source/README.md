# Mana symbol design source

`manaiconsv13.jsx` — original React preview component the mana symbols were
derived from. Reference only; not loaded by the prototype (no React runtime).
The compiled outputs ship at `assets/mana/{W,U,B,R,G,C}.svg` — the five WUBRG
colors plus `C` (generic), which is a **blank coin shell**: the source renders
generic with no inner glyph, the numeral being drawn by the engine on top.
File names match the engine mana keys (`mana_pool.gd` `COLORS`, where `C` is
generic).

Authored by Claude in a separate session; see top-level `LICENSES.md`.
