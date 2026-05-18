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

### Cinzel (Google Fonts) — display font

- **Location in tree:** `assets/fonts/Cinzel/`
- **Used for:** card name + type + P/T text in the new 80×112 card frame design (`ui` branch)
- **License:** SIL Open Font License v1.1 (`assets/fonts/Cinzel/OFL.txt`)
- **Copyright:** © 2020 The Cinzel Project Authors (https://github.com/NDISCOVER/Cinzel)
- **Source:** Google Fonts
- **Files:** variable font (`Cinzel-VariableFont_wght.ttf`) + 6 static weights (Black, Bold, ExtraBold, Medium, Regular, SemiBold)
- **Note:** placed at repo root rather than in `reference/html-proto/assets/` so the Godot port can also load via `res://assets/fonts/Cinzel/...`.

### Press Start 2P (Google Fonts) — pixel body font

- **Location in tree:** `assets/fonts/Press_Start_2P/`
- **Used for:** card body text + flavour text in the new 80×112 card frame design (`ui` branch)
- **License:** SIL Open Font License v1.1 (`assets/fonts/Press_Start_2P/OFL.txt`)
- **Copyright:** © 2012 The Press Start 2P Project Authors (cody@zone38.net), with Reserved Font Name "Press Start 2P"
- **Source:** Google Fonts
- **Files:** `PressStart2P-Regular.ttf` (bitmap font, single weight)
- **Note:** "Reserved Font Name" clause — if we modify/derive from this font, the derivative must use a different name (we won't be modifying it, just embedding).

---

## AI assistance

### Claude (Anthropic)

- **Used for:** substantial portions of the rules engine, UI work, refactoring passes, test suite authorship, save-data migrations, this very file
- **Sessions:** conversational; not a build-time dependency
- **Note:** marked in commit trailers (`https://claude.ai/code`).

---

## To revisit later

- Exact pixellab terms (download/distribution clauses).
- Any sound effects or music if/when they're added.
- Fonts (none external currently — using system / Georgia / Arial fallbacks).
