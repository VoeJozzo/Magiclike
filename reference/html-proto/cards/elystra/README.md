# Elystra — art notes

Elystra has an **art ladder** — her displayed portrait evolves as
she grows. The renderer picks one of three pieces based on her
current power+toughness (computed by `ENGINE.getStats`, so all
modifiers, sticker pumps, permanent EOT buffs, and lord/static
bumps count):

| Total p+t | Art shown |
|---|---|
| 0–9 (base, mild growth) | `art-1.png` |
| 10–19 (mid-form) | `art-2.png` |
| 20+ (final form) | `art-3.png` |

Configuration lives in `card.json` under the `artLadder` field —
each rung is `{ "minPT": N, "art": "<path>" }`. The renderer walks
the ladder and picks the highest threshold the card currently meets.
The `art` field on the card stays set as the default (used by
template-only views like the draft pick, reward modal, and card
browser, where no live stats are available).

The art-ladder mechanism is generic — any card that wants
state-driven portraits can add an `artLadder` to its `card.json`.
See `effectiveArt()` in `reference/html-proto/js/render.js` for the
selection logic. Currently only Elystra uses it.
