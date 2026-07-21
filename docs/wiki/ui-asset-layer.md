---
type: concept
tags: [magiclike, architecture, gamedev, ui, assets, tooling]
created: 2026-07-20
updated: 2026-07-20
sources: ["reference/html-proto/tools/bake/bake_ui_tiles.py", "reference/html-proto/tools/pixel-lint.js", "reference/html-proto/assets/ui/_slices.json", "docs/design-handoff/control-gaps.md", "PR #150"]
---

# The UI asset layer

How [[magiclike]] gets pixel-art chrome onto the screen, and the two rules that make it hold
still. This is the durable *why*; the current state of any given screen is a handoff concern,
not a doctrine one.

The layer model is three-part, and the split matters: **chrome is baked art**, **text is
fonts**, **state-glows are runtime light**. Only chrome goes through the pipeline below. Card
frames are deliberately outside it — a card frame is *content*, not chrome, and restyling it
is a different decision entirely.

## bake → lint → consume

One generator owns the art. `tools/bake/bake_ui_tiles.py` computes every tile pixel-exact (no
browser anti-aliasing, no fractional scaling) and writes them to `assets/ui/`. **The PNGs are
outputs.** The workflow is to edit the spec and re-run, never to hand-edit an image — a
hand-edited tile is a value the generator will silently overwrite.

`tools/pixel-lint.js` is the medium checking itself: palette closure and run-divisibility for
the art, plus the slice checks below for its consumers. The browser then consumes via
`border-image`; the [[godot]] port will consume the same tiles via `StyleBoxTexture`. That
shared consumption is why this is a [[cross-engine-port]] concern and not just an
[[html-proto]] one — both engines need the *same* numbers, so the numbers must live somewhere
neither engine owns.

## Rule 1 — a generated asset must publish its consumption contract

A 9-slice tile is not just an image; it carries a contract about **where its edges are**. Get
those insets wrong and nothing throws — you get a wrong-looking element and no error.

Two bugs, both silent, both from the same cause: the generator *knew* the right insets and
never told anyone, so consumers guessed.

- **Insets that overflow the tile.** The woodbar source is 15px wide; a consumer invented
  `left 8 + right 8 = 16`. When left+right exceed the width the middle region collapses to
  zero, so `fill` has nothing to paint — the element renders as its two edge slices with
  transparency between them. It read on screen as an unexplained "black bar."
- **Insets that fit but mismatch the tile's build.** The button tiles are 22px of *body* plus
  `black_off` rows of drop shadow that belong *below* the button. A uniform slice of `2` is
  dimensionally legal on a 72×27 tile, so it passes any size check — but it drags the shadow
  up into the middle fill, and the label ends up sitting on the shadow.

The fix is structural, not vigilance: the bake emits `assets/ui/_slices.json` from the same
constants it draws with, and the linter diffs consumers against it. `sliceFit` catches the
first class (dimensional), `sliceSpecMatch` the second (structural). Neither could have been
caught by looking at the CSS alone, because the CSS was *valid* in both cases.

The general form is worth stating plainly: **if a generator knows a number its consumers need,
it must publish that number.** A constant that lives only inside the generator will be
re-derived by hand, and hand-derivation drifts.

A mismatch is not automatically a bug — a tile can be legitimately reused a different way — so
sanctioned variants are declared explicitly rather than tolerated by loosening the rule. A rule
loose enough to ignore a deliberate variant is also loose enough to ignore real drift.

## Rule 2 — presentation belongs in the stylesheet, not in the code that builds the DOM

Inline styles sit near the top of CSS's specificity order. A fixed colour or border written
onto an element as it is constructed **silently defeats any stylesheet rule** — the CSS is
valid, the selector matches, and the render is unchanged. There is no error to chase; the
symptom is "why didn't my change apply."

This bit three separate times during the pixel-chrome work (menu buttons, prompt buttons, mana
pips), and it was never carelessness. The proto builds DOM in JS, so styling a widget where you
construct it is genuinely more readable *locally*. Colocation is a real benefit; the cost only
lands later, when the look has to change globally. That asymmetry — local benefit, deferred and
diffuse cost — is why it recurs.

The line to hold is **static vs. dynamic**, not "inline styles are bad":

- **Static** — a literal colour, a fixed border/padding/radius. Belongs in CSS. Nothing about
  it needs to be computed.
- **Dynamic** — a value no stylesheet could know: a tooltip position from
  `getBoundingClientRect`, a per-row accent passed in as data, a bar width that *is* the datum
  being drawn. Legitimately inline, and must not be "fixed."

`pixel-lint.jsInlineStyles()` enforces exactly that boundary, flagging literal colours and
fixed metrics while passing computed ones.

The [[godot]] equivalent is the same shape with different nouns: setting `StyleBox` properties
directly on a node in GDScript is the inline style, and a `Theme` resource is the stylesheet.
The rule ports; only the vocabulary changes.

## Why this is a concept page and not a comment

Both rules were learned by shipping the bug, and both are invisible at the point of use — a
wrong slice and a hardcoded colour each produce a *plausible-looking* result with no error.
Knowledge like that decays fastest, because nothing in the normal edit-and-check loop
re-teaches it. The guards in `pixel-lint.js` are the mechanism; this page is the reason, so
that a future change to the mechanism knows what it is protecting.

Related: [[magiclike-architecture]] (design discipline), [[cross-engine-port]] (why both
engines need the same slice numbers), [[html-proto]], [[comment-doctrine]].
