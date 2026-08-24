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

### Maaack's Menus Template

- **Location in tree:** `addons/maaacks_menus_template/`
- **License:** MIT (`addons/maaacks_menus_template/LICENSE.txt`)
- **Copyright:** © 2022-present Marek Belski
- **Source:** https://github.com/Maaack/Godot-Menus-Template — vendored at v1.5.3
- **Used for:** main menu / options / pause / credits / scene-loader scaffolding for the Godot port's settings layer
- **Note:** vendored but **not yet enabled** in `project.godot` — enabling runs its setup wizard, which happens when the settings layer is built (see `docs/BACKLOG.md`, priority-pass stops item). Vendored as-is; do not modify. Bundles third-party assets (input icons, engine/Git logos) under their own licenses — see `addons/maaacks_menus_template/ATTRIBUTION.md`.

### gdUnit4 (unit testing framework — dev tooling)

- **Location in tree:** `addons/gdUnit4/`
- **License:** MIT (`addons/gdUnit4/LICENSE`)
- **Copyright:** © 2023 Mike Schulze
- **Source:** https://github.com/godot-gdunit-labs/gdUnit4 — vendored at v6.2.1 (supports Godot 4.5–4.7.1 per upstream compatibility table)
- **Used for:** fine-grained engine tests from the effects refactor onward; the phase scenes in `tests/` remain the end-to-end smoke tier (see `docs/BACKLOG.md`)
- **Note:** dev-only tooling, enabled as an editor plugin — not part of the shipped game. Vendored as-is; do not modify.

### Godot AI — editor MCP plugin (dev tooling)

- **Location in tree:** `addons/godot_ai/`
- **License:** MIT (`addons/godot_ai/LICENSE`)
- **Copyright:** © 2025 Godot AI contributors
- **Source:** https://github.com/hi-godot/godot-ai — plugin vendored at v3.1.5 (from the repo's `plugin/addons/godot_ai`)
- **Used for:** letting an MCP client (Claude Code) drive the Godot editor and the running game — error visibility, screenshots, input injection
- **Note:** dev-only editor plugin, never a runtime dependency of the shipped game. Machine-side it needs the `uv` launcher (logged in `CLAUDHAUS.md`); v3.1.5 registers the Claude Code entry at user scope in `~/.claude.json` (a project-scope option exists upstream but not in this release). Vendored as-is; do not modify.

### ESLint + eslint-plugin-sonarjs (dev tooling)

- **Location in tree:** `reference/html-proto/` (`package.json` devDependencies; `node_modules/` is git-ignored, `package-lock.json` pins versions)
- **License:** ESLint — MIT; eslint-plugin-sonarjs — LGPL-3.0-only
- **Source:** https://eslint.org · https://github.com/SonarSource/SonarJS
- **Used for:** dev-only static analysis of the html-proto JS (`npm run lint`) — high-signal bug smells (`no-identical-expressions`, duplicate conditions, unreachable code, etc.).
- **Note:** NOT part of the runtime — the engine has no build step and Pages serves the raw `.js` files. sonarjs's LGPL copyleft has no reach into the project's own code: it's never linked into or distributed with the shipped engine, only run as a local analyzer.

---

## Visual assets

### pixellab — AI-generated pixel art

- **Used for:** all 64×32 pixel-art card portraits under `reference/html-proto/cards/<tplId>/art.png` (~285 cards as of 2026-06-23, grown via the C2–C6 art-skill batches + a final breadth-posture production run; **except** frostbite_mage + trained_armodon, whose active portraits are OpenAI-generated — see the next entry, with the pixellab versions stashed under those cards' `alts/`) and the per-color card frames being integrated on the `ui` branch
- **Source:** pixellab.ai
- **License:** (user-managed account; check pixellab's terms of service for distribution rights — placeholder until exact terms are documented)

### OpenAI integrated image generation — card art

- **Locations in tree:** `reference/html-proto/cards/frostbite_mage/art.png`, `reference/html-proto/cards/trained_armodon/art.png`
- **Used for:** 64×32 pixel-art portraits generated for individual cards (adopted from PR #124 per Joe's side-by-side pick, 2026-07-02)
- **Source:** OpenAI's integrated image generation system available through ChatGPT (Thaumaturge-ChatGPT pipeline)
- **License:** project-owned generated output supplied by the project owner
- **Prompt record:** `.claude/skills/magiclike-card-art/references/claude-prompts.txt` (the "ChatGPT (GPT-5.5) pipeline records" section)
- **Frostbite Mage production note:** Prompt iteration and analysis were performed with ChatGPT (GPT-5.5). Images were generated using OpenAI's integrated image generation system available through ChatGPT. Generated images were then downscaled to 64×32 using K-Means Clustering and Lanczos/Bilinear Resampling.

### Almendra (Google Fonts) — fantasy serif

- **Location in tree:** `assets/fonts/Almendra/`
- **Used for:** every text element on the v2 card frame (name / type / P/T / damage / oracle text / stickers / mana pip number / cost arrow). Shipped baseline as of v1.0.178.
- **License:** SIL Open Font License v1.1 (`assets/fonts/Almendra/OFL.txt`)
- **Source:** Google Fonts
- **Files:** `Almendra-Regular.ttf` and `Almendra-Bold.ttf` (Bold registered as a separate `'Almendra Bold'` family so the font picker can offer it without a font-weight UI). Italic and BoldItalic cuts shipped alongside but not currently wired into a font-family.

### Mana symbol SVGs (Claude-authored, "manaiconsv13" spec)

- **Location in tree:** `assets/mana/{W,U,B,R,G,C}.svg`
- **Used for:** the five WUBRG color pips in card text + v2 frame cost pips (v1.0.172), plus `C` (generic) — a blank coin shell the engine draws the numeral onto
- **Source:** authored by Claude (in a separate session) per a "manaiconsv13" JSX/React design spec the user provided; converted from JSX components to standalone SVGs for use in the prototype
- **License:** project-owned (commissioned art, no external license)
- **Concepts:** White = tipping scales, Blue = open book, Green = leaf, Red = fissure, Black = eclipse (sun + moon), Generic = blank coin (numeral overlaid by engine)

### Keyword ability symbol SVGs (Claude-authored, "keywordiconsship" spec)

- **Location in tree:** `assets/keywords/<key>.svg` (16 symbols) + design sources at `assets/keywords/source/keywordiconsship.jsx` (the original 15) and `assets/keywords/source/keywordiconunblockable.jsx` (the unblockable key, added later)
- **Used for:** keyword-ability icons (flying, reach, lifelink, menace, vigilance, haste, trample, deathtouch, defender, indestructible, hexproof, first_strike, flash, unblockable, plus innate/tap extras) — same 40×40 coin shell as the mana symbols. Rendered on the in-play card frame in place of the keyword text line, recolored by grant source (native = card color, sticker = gold, granted = teal); embedded inline-recolorable at `reference/html-proto/js/keyword-icons.js`.
- **Source:** authored by Claude (in separate sessions) per "keywordiconsship" / "keywordiconunblockable" JSX/React design specs the user provided; converted from JSX components to standalone SVGs in the shipping lake-gray palette
- **License:** project-owned (commissioned art, no external license)
- **Coverage note:** all 14 combat keywords have art (`unblockable` included); `innate` and `tap` also ship icons (extras, not combat keywords). File names match the engine `KEYWORDS` keys.

### Pixel-chrome UI tile kit (Claude-authored)

- **Location in tree:** `reference/html-proto/assets/ui/` — 9-slice button tiles (`pxbtn_*`), toggle/slider/segmented/progress controls (`ctrl_*`), mana gems (`gem_*`), map nodes (`node_*`), `woodbar_src.png`, plus the `_slices.json` slice manifest
- **Used for:** the html-proto pixel-chrome reskin (PR #150) — buttons, bars, map nodes, and mana-pool gems
- **Source:** authored by Claude in the PR #150 design session; sheets baked from the Claude-authored source art by `tools/bake/bake_ui_tiles.py`
- **License:** project-owned (commissioned art, no external license)

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
