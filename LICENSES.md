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

### ESLint + eslint-plugin-sonarjs (dev tooling)

- **Location in tree:** `reference/html-proto/` (`package.json` devDependencies; `node_modules/` is git-ignored, `package-lock.json` pins versions)
- **License:** ESLint — MIT; eslint-plugin-sonarjs — LGPL-3.0-only
- **Source:** https://eslint.org · https://github.com/SonarSource/SonarJS
- **Used for:** dev-only static analysis of the html-proto JS (`npm run lint`) — high-signal bug smells (`no-identical-expressions`, duplicate conditions, unreachable code, etc.).
- **Note:** NOT part of the runtime — the engine has no build step and Pages serves the raw `.js` files. sonarjs's LGPL copyleft has no reach into the project's own code: it's never linked into or distributed with the shipped engine, only run as a local analyzer.

---

## Visual assets

### pixellab — AI-generated pixel art

- **Used for:** all 64×32 pixel-art card portraits under `reference/html-proto/cards/<tplId>/art.png` (~61 cards as of v1.0.144) and the per-color card frames being integrated on the `ui` branch
- **Source:** pixellab.ai
- **License:** (user-managed account; check pixellab's terms of service for distribution rights — placeholder until exact terms are documented)

### Almendra (Google Fonts) — fantasy serif

- **Location in tree:** `assets/fonts/Almendra/`
- **Used for:** every text element on the v2 card frame (name / type / P/T / damage / oracle text / stickers / mana pip number / cost arrow). Shipped baseline as of v1.0.178.
- **License:** SIL Open Font License v1.1 (`assets/fonts/Almendra/OFL.txt`)
- **Source:** Google Fonts
- **Files:** `Almendra-Regular.ttf` and `Almendra-Bold.ttf` (Bold registered as a separate `'Almendra Bold'` family so the font picker can offer it without a font-weight UI). Italic and BoldItalic cuts shipped alongside but not currently wired into a font-family.

### Mana symbol SVGs (Claude-authored, "manaiconsv13" spec)

- **Location in tree:** `assets/mana/{W,U,B,R,G}.svg`
- **Used for:** the five WUBRG color pips in card text + v2 frame cost pips (v1.0.172)
- **Source:** authored by Claude (in a separate session) per a "manaiconsv13" JSX/React design spec the user provided; converted from JSX components to standalone SVGs for use in the prototype
- **License:** project-owned (commissioned art, no external license)
- **Concepts:** White = tipping scales, Blue = open book, Green = leaf, Red = fissure, Black = eclipse (sun + moon)

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
