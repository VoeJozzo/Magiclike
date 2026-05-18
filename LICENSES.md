# Licenses & Attributions

This file tracks every outside resource used in Magiclike. **Any time we
add a new external dependency, library, asset, tool, or content source,
log it here.** Working format for now; the user will tidy up the exact
schema later.

---

## Code dependencies

### chun92's Godot Card Framework

- **Location in tree:** `addons/card-framework/`
- **License:** MIT (`addons/card-framework/LICENSE`)
- **Copyright:** © 2025 Hyunjoon Park
- **Source:** GitHub user `chun92`
- **Used for:** drag/drop card mechanics, card containers, card factory pattern in the Godot port
- **Note:** vendored as-is — do not modify (per CLAUDE.md). Updates pulled by replacing the folder.

### Godot Engine (4.6)

- **Used for:** the in-progress Godot port at repo root
- **License:** MIT (the engine itself)
- **Source:** https://godotengine.org
- **Note:** runtime dependency only — the engine binary isn't checked in, but `.tres` / `.tscn` / `.gd` files are Godot-format.

---

## Visual assets

### pixellab — AI-generated pixel art

- **Used for:** all 64×32 pixel-art card portraits under `reference/html-proto/cards/<tplId>/art.png` (~61 cards as of v1.0.144) and the per-color card frames being integrated on the `ui` branch
- **Source:** pixellab.ai
- **License:** (user-managed account; check pixellab's terms of service for distribution rights — placeholder until exact terms are documented)

---

## AI assistance

### Claude (Anthropic)

- **Used for:** substantial portions of the rules engine, UI work, refactoring passes, test suite authorship, save-data migrations, this very file
- **Sessions:** conversational; not a build-time dependency
- **Note:** marked in commit trailers (`https://claude.ai/code`).

---

## Inspiration / influence (not direct usage)

These aren't licensed resources — they're cultural debt. Listed for honesty.

### Magic: The Gathering (Wizards of the Coast)

- **Card-name reuse:** several card templates use names directly lifted from MTG — `bolt` (Lightning Bolt), `wrathOfGod` (Wrath of God), `doomBlade` (Doom Blade), `shivanDragon` (Shivan Dragon — via tplId `dragon`), `savannahLions` (Savannah Lions), and others.
- **Mechanical inspiration:** mana costs (WUBRG + C), the stack, priority model, instants/sorceries, triggered abilities, the WUBRG color pie — all lifted from MTG's design.
- **Status:** game mechanics aren't copyrightable, but specific card names and any reused flavor text are protected by Wizards of the Coast. **If this project ever becomes commercial or publicly distributed beyond playtesting, those card names need to be renamed or replaced with originals.** Pure-playtest / educational fair use covers the current state.

---

## To revisit later

- Exact pixellab terms (download/distribution clauses).
- Any sound effects or music if/when they're added.
- Fonts (none external currently — using system / Georgia / Arial fallbacks).
- The MTG card-name reuse list grows whenever new cards are added — periodically reconcile against this list.
