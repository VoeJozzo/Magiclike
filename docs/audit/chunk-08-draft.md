# Chunk 8 — Draft (draft.js: pack rolling, pick scoring, land allocation, Desert Cube, opponent deck building + staples/stickers/clones)

> Tier 1. **Deep-read + 3 hostile refuters** (one per behavioral finding A8-3,
> A8-4, A8-5) **over the frozen anchor snapshot.** Anchor SHA **`aca8883`**.
> Chunk claimed 2026-06-12T01:50:36Z. Every refuter ran an **independent
> repro** (own probes, own loader, never the finder's script).
>
> Refutation outcome: **0 refuted / 1 modified / 2 confirmed.** A8-3 and A8-4
> confirmed (each with mechanism/framing corrections, folded below); A8-5
> modified (core distribution claim independently reproduced, but its rider (a)
> was struck as factually wrong and replaced with the real adjacent nit).
> A8-1, A8-2, and A8-6 carried executed evidence from the deep-read and
> skipped refutation per the campaign's repro-or-refute rule.
>
> **Terminology ruling (Joe, 2026-06-10):** Magiclike's rules are THE rules.
> Intentional divergences from real MTG are *design decisions*, recorded as
> such — never framed as deviations from an external standard. MTG is a
> reference point only. Applied throughout this file.
>
> **Class policy (campaign rule, binding):** anything that can alter a game
> outcome **stages** (plain-English decision packet per finding); docs/comment-
> only and test-infrastructure-diagnostic fixes **ship** (gate: suite + lint
> green). So: A8-1 ships (P3 comment), A8-2 ships (P3 canon docs), A8-3 ships
> (P4 comment), A8-4 **parks** (P4 dead-output footgun — nothing to fix until
> a consumer exists; parks with a one-line pointer), A8-5 **stages** (P3 —
> opponent staple weights alter opponent decks, hence game outcomes), A8-6
> ships (P4 trivia bundle).

---

## Findings

### A8-1 — rollPack's policy comment describes a retired "slot 3 bias toward deck colors" mechanism; the code has no slot-index logic at all  ⟶ SHIP (comment-only)
- **Location:** `reference/html-proto/js/draft.js:612–614` (stale block
  comment) vs the actual pack-roll loop below it; the inner block comment at
  `:617–626` describes the real mechanism accurately. @ `aca8883`
- **Dimension:** comment vs code.
- **Severity:** **P3** (a policy-level comment that misdescribes the draft's
  core color-bias mechanism — higher than a routine P4 comment nit because
  it's the first thing a reader consults to understand pack composition).
- **Claim:** the header comment says pack slot 3 is biased toward the
  player's deck colors. rollPack has **no slot-index logic anywhere** — the
  real policy is the **off-deck-colors-drop-after-one-appearance shrinking
  table**: once a color outside the player's deck colors appears once in a
  pack, it's removed from the roll table for the rest of that pack. Canon
  §1402 and `docs/wiki/roguelike-meta.md` both correctly describe the
  shrinking-table policy; only this comment is stale.
- **Evidence (finder-executed):** 3000-pack instrumented run over the real
  draftPool — off-deck colors appeared ≤1×/pack in **100%** of packs; per-slot
  color tallies show **no slot-3 anomaly** (slot index is uncorrelated with
  deck-color membership). Code read confirms zero slot-index references.
- **Fix sketch:** replace the `:612–614` header comment with the real policy
  (the `:617–626` inner comment is already accurate — promote or point to it).
- **Effort:** trivial (one comment edit).
- **Verification status:** finder-executed 3000-pack probe + code read; not
  refuted (comment-only class — the probe is the verification).
- **Remediation class: SHIP** (comment-only; gate suite + lint green).
- **Predicted test impact:** none.
- **Mutation-map judgment (ship gate):** a comment edit cannot flip a mutant;
  no behavioral surface.

---

### A8-2 — Canon §1400 is stale three ways: Desert Cube mode absent, §1404 omits the equatorial artificer boss, §1405's "lands auto-allocated to fill to 40" is violated by design  ⟶ SHIP (canon docs)
- **Location:** `docs/wiki/rules/1400-*.md` (§1400/§1404/§1405) +
  `docs/wiki/roguelike-meta.md` (same Desert Cube gap), vs `draft.js` +
  `run.js` behavior. @ `aca8883`
- **Dimension:** canon vs code (docs drift — the code is the intended
  behavior; the rulebook lags it).
- **Severity:** **P3** (the rulebook is the project's canonical *what*; three
  independent staleness axes in one section).
- **Claim (three legs):**
  - **(a)** **Desert Cube mode** — live on the start screen — is absent from
    canon entirely: 40 picks *including* lands, with basics substituted into
    packs at a 1/3 rate, and **no auto-allocation** step. roguelike-meta.md
    has the same gap.
  - **(b)** §1404's archetype list omits **equatorialArtificerBoss**.
  - **(c)** §1405 states lands are auto-allocated to fill the deck to 40 —
    violated *by design* for the equatorial artificer boss (10 Equatorial
    Engines → a 33-card deck, pinned by `test_equatorial_artificer_boss.js`).
- **Evidence (finder-executed):** all 6 constructed decks validated against
  §1404/§1405; 20 full Desert Cube drafts executed — **always exactly 40
  picks, zero appended lands**; 5 classic full drafts as the control.
- **Fix sketch:** new §140x page for Desert Cube; add the boss to §1404;
  qualify §1405 ("classic mode; constructed bosses may ship fixed decks of
  other sizes"); mirror the Desert Cube paragraph into roguelike-meta.md.
- **Effort:** small (three doc edits + one new rulebook page).
- **Verification status:** finder-executed (6 constructed-deck validation +
  20 Desert Cube drafts); not refuted (docs class — the probes are the
  verification).
- **Remediation class: SHIP** (docs-only; gate suite + lint green).
- **Predicted test impact:** none (the boss behavior is already test-pinned;
  the docs move to match it).
- **Mutation-map judgment (ship gate):** docs edit; no behavioral surface.

---

### A8-3 — countPips comment claims classic ignores lands; five draftable colored artifact lands contribute pips in classic too  ⟶ SHIP (comment-only)
- **Location:** `reference/html-proto/js/draft.js:744–749` (comment: "Classic
  ignores lands (cards have no cost, so they contribute nothing)") vs
  `:757–758` (the land branch `hasType(c,'Land') && c.mana &&
  pips[c.mana] !== undefined` — **not mode-gated**, fires unconditionally).
  @ `aca8883`
- **Dimension:** comment vs code.
- **Severity:** **P4** (comment reword; the underlying behavior is arguably
  sensible — a colored land signaling its color matches the explicitly-
  intended `:650–656` design — and no rulebook page governs draft pip
  counting).
- **Claim:** the classic draft pool contains exactly five non-basic,
  non-special colored-mana artifact lands — bone_reliquary (B), ember_anvil
  (R), gilded_seat (W), tidal_conduit (U), verdant_verge (G) — each of which
  contributes a phantom pip in classic, contrary to the comment.
  (deepseam_quarry / dross_pylon are mana 'C', so `pips['C'] === undefined`
  correctly skips them; phylactery / city_of_brass are `special:true` and
  excluded from the draft pool at `:25–29`.)
- **Refuter corrections (folded — mechanism attribution fixed, claim held):**
  countPips feeds **allocLands** (via getPlayerDeck at `:798`) and the
  **pickFromPack color-commitment scorer** (`:545`) — but rollPack's in-deck
  color signal is a **separate, deliberately land-aware read** (inDeckColors
  at `:650–656`, which adds `c.mana` for Land cards directly, with its own
  comment explicitly intending land picks as color signals). So the
  behavioral claim — classic artifact-land picks color-bias pack rolls —
  **stays true**, just through that second path, not through countPips.
- **Evidence (finder-executed + refuter independent repro):** exhaustive
  card-JSON scan found exactly the five claimed lands; refuter live repro:
  classic draft with youPicks=['bone_reliquary'] → getPlayerDeck colors
  `["B"]` and a 17-swamp manabase allocated entirely from that single land's
  phantom pip; 400 rollPack rolls confirmed all five lands appear in classic
  packs.
- **Fix sketch:** reword the `:744–749` comment (and note that `:545`'s
  scorer also sees land pips in classic).
- **Effort:** trivial (one comment edit).
- **Verification status:** refuter verdict **confirmed** (every load-bearing
  claim re-derived independently; one mechanism-attribution nit folded above).
  Confidence high. Not a duplicate — A4-6 concerns engine.js color
  predicates, not draft pips.
- **Remediation class: SHIP** (comment-only; gate suite + lint green) — or
  fold into the A8-6 trivia batch.
- **Predicted test impact:** none.
- **Mutation-map judgment (ship gate):** comment edit; no behavioral surface.

---

### A8-4 — buildOpponentDeck's oppColors derivation (with deterministic W/U filler) is UI-dead output — a two-shape trap for any future consumer  ⟶ PARK (P4)
- **Location:** `reference/html-proto/js/draft.js:225–239` (derivation:
  heuristic branch pads to 2 colors from WUBRG order; constructed branch
  `:227–228` returns declared colors unpadded), consumed only at
  `run.js:663` (pass-through) → `controller.js:1160–1163` (reads only
  bossName/bossIcon). Test pin: `test_equatorial_artificer_boss.js:62–64`
  (the colorless boss returns `[]`). @ `aca8883`
- **Dimension:** dead output + latent shape footgun.
- **Severity:** **P4** (zero player-visible effect today; pure latent-trap /
  dead-code quality issue).
- **Claim:** no production code reads `opp.colors` — exhaustive grep over
  js/, tests/, *.html finds only the ignored run.js pass-through and the one
  test pin. The heuristic branch pads mono decks deterministically from
  `COLORS = ['W','U','B','R','G']` (a natural mono-R would be labeled
  `['R','W']`); the constructed branch skips padding entirely.
- **Refuter corrections (folded):**
  1. **The filler is itself nearly unreachable in natural builds:** across
     130 executed builds (80 unaffinitized + 50 across all five colorAffinity
     values) the padded-second-color case fired **0 times** — the pick
     heuristic always accumulates pips in ≥2 colors, and every constructed
     deck declares `colors`. The mono-R → `['R','W']` mislabel is therefore
     **hypothetical, not observed** (the finder's "filler fires for mono
     decks" probe was necessarily a synthetic/forced pick set).
  2. **The shape asymmetry is documented as deliberate** — the `:225` comment
     says "Constructed: prefer declared colors (avoid filler-padding noise
     for mono builds)" — an acknowledged design choice, not an oversight. But
     it remains a **two-shape contract** (constructed mono = length 1,
     heuristic = always length 2) that any future consumer inherits unawares.
- **Evidence:** finder grep + probe; refuter re-derived all legs
  independently (grep, 130-build probe, COLORS arithmetic, test-pin read).
- **Park pointer (the one-liner for the future):** *anyone who wires up an
  opp-colors consumer (UI badge, AI read, save field) must first decide the
  shape contract — today it's "constructed = declared as-is (may be length
  0–1), heuristic = always exactly 2 with deterministic WUBRG filler" — and
  should probably just unify it then.*
- **Effort (if ever picked up):** small (unify the shape or delete the dead
  field + one pin test).
- **Verification status:** refuter verdict **confirmed** (dead-output chain,
  filler determinism, branch asymmetry, and probe all re-derived). Confidence
  high. Not a duplicate — A1-22 touches the duplicate COLORS tables (DRY),
  not the oppColors output.
- **Remediation class: PARK** (dead by construction; no consumer to protect
  yet; the pointer above is the deliverable).
- **Predicted test impact:** none.

---

### A8-5 — Opponent staple budget spends ~4 in 10 rolls consuming a land; ~1 in 7 fuses two basics into one slot — design question: difficulty texture or scaling leak?  ⟶ STAGE (P3)
- **Location:** `reference/html-proto/js/draft.js:252–303`
  (applyOpponentStaples — unordered canonicalized pair enumeration; weight 3
  only for Creature+Creature, weight 1 otherwise; ×0.1 castability penalty at
  `:290`; deckColors computed once at `:253–257`). Contributing:
  `engine.js:~65–130` (isSpliceableBase / isCompatibleStaplePair — basics are
  spliceable as base AND staple; `forest/card.json` has no special/stapleable
  flag). Reachability: `run.js:644` — numStaples = floor((gameNum−1)/3), so
  ≥1 from gameNum 4, every run. @ `aca8883`
- **Dimension:** design / difficulty-scaling integrity (the opponent rolls
  blind; the weight table alone decides whether its per-depth "upgrade" is
  real).
- **Severity:** **P3** (live every game from gameNum 4; possibly
  working-as-intended — that hedge was in the original filing and stands).
- **Claim (refuter-reproduced, durable numbers):** with a heuristically
  drafted opp deck (23 spells + 17 basics), the pair space is dominated by
  land-involving pairs. Independent 300-build probe (refuter's own code):
  **C+C 32% / C+L 30% / L+L 14% / C+S 12% / L+S 10.7% / S+S 1.3%** —
  **~4 in 10** staples are land-consuming (the staple half is a Land, 44%
  measured) and **~1 in 7** are land+land fuses (strict Basic+Basic is ~1 in
  8.5 — the L+L category includes drafted nonbasics; option C targets the
  strict case) collapsing two mana sources into one slot (17→16, near-zero
  threat gain). Analytic pair-space check agrees with the
  weight-table math (C+C ≈ 120 pairs / weight 360 ≈ 35% vs C+L ~288 + L+L
  ~153 + L+S ~108 at weight 1 — counts vary with drafted nonbasic lands;
  hedges deliberate). The player-side equivalent is player-*chosen*; the opp
  has no such judgment layer.
- **Canon:** canon does **not** bless this. `docs/wiki/rules/1500-the-run.md`
  and roguelike-meta.md say only that opponents "scale with depth" via
  spliced slots — nothing sanctions land-consuming/basic-fusing opponent
  staples; the scaling *intent*, if anything, supports the finding.
  staple-synthesis.md covers merge mechanics only; no CHANGELOG rationale for
  the 3× creature weight.
- **Rider — STRUCK and replaced (refuter):** the original rider (a) claimed a
  prior-round merged land's second color is invisible to round-2 castability.
  **False and struck:** deckColors is computed once at `:253–257` from the
  full **pre-merge** slot list, and buildOpponentDeck builds slots fresh each
  game — the described state is unreachable. **The real adjacent nit:**
  drafted **nonbasic lands without a `tpl.mana` field are invisible to the
  opp's deckColors from round 1 onward** (the `:253–257` read keys on
  `tpl.mana`) — latent: no such land exists in today's pool (self-QA
  exhaustive scan); code-shape only. Rider (b) stands: for the colorless equatorial boss the
  castability penalty cancels out of relative weights (harmless).
- **Evidence:** finder 300-build tally + eligibility reads; refuter
  independent 300-build probe (own script via tests/_setup loadEngine, <10s)
  matched within n=300 noise; reachability re-verified at run.js:644.
- **Fix sketch (if Joe rules it a leak):** exclude Basic+Basic pairs from the
  opp's pair enumeration; optionally down-weight C+L and/or up-weight
  creature-base pairs mirroring the player-reward tiebreak; pin with a
  distribution-tally test.
- **Effort:** small (weight-table / pair-filter edit + a tally pin test).
- **Verification status:** refuter verdict **modified** (core distribution
  confirmed by independent repro; rider (a) struck as unreachable and
  replaced; "~" hedges kept on all pair counts). Confidence high on the
  numbers; the open question is design intent, not fact. Not a duplicate —
  A5-6/A5-8/A5-12/A5-13/A6-2 are merge/empower/doc mechanics, not the
  opponent pair-weight distribution.
- **Remediation class: STAGE** (changes opponent deck composition — a game
  outcome under the campaign rule).
- **Predicted test impact:** none today; the fix brings a distribution pin.

#### Decision packet for A8-5 (stage — plain English)
From game 4 of a run onward, the opponent's deck gets "upgraded" by fusing
two of its cards into one stronger slot — that's the difficulty scaling. But
the opponent picks *which* two cards blindly, by a weight table, and the
math says roughly **4 in 10** of those upgrades eat one of its own lands,
and about **1 in 7** fuse two basic lands together — shrinking its manabase
for almost no threat gain. The player doing the same thing chooses wisely;
the opponent can't. So at the depths where the game is *supposed* to be
getting harder, a sizable slice of the opponent's scaling budget is spent
making its deck slightly worse or sideways. The rulebook is silent — it
promises depth scaling but doesn't say how staples should be spent. Maybe
that's charming variance (the opponent as a sloppy drafter); maybe it's a
leak in the difficulty curve.
- **Option A — leave as-is:** ruled intended texture; document the intent in
  canon so the next auditor doesn't refile it.
- **Option B — down-weight land+land pairs:** keeps land-eating possible but
  rare.
- **Option C — exclude Basic+Basic pairs:** removes only the strictly-worst
  case (manabase shrink, no threat).
- **Option D — up-weight creature-base pairs:** mirrors the player-side
  reward shape.
- **Recommendation (medium confidence):** **C plus a mild C+L down-weight**
  — preserves the variety and the occasional weird land-fuse, while making
  the per-depth scaling reward real. Whatever is chosen, write the intent
  into canon §1500 (it's silent today).

---

### A8-6 — Comment-hygiene trivia bundle: four items in draft.js  ⟶ SHIP (trivia)
- **Location / items @ `aca8883`:**
  1. `draft.js:707` — find/replace casualty: prose mangled to
     "consume_spirit" where it should read "consume".
  2. `draft.js:827–830` — rollTransformPack's doc says callers pass the deck
     "minus lands", but the only caller (`run.js:839`) passes **all slots**
     (harmless — lands feed inDeckColors correctly; the comment is what's
     wrong).
  3. `draft.js:467` — "trigger kind — architecture only, unused" is stale
     since `scarified` exists (true only for the offer path).
  4. `draft.js:260–261` — dangling comment fragment.
- **Dimension:** comment hygiene. **Severity:** P4.
- **Evidence:** finder code-read + caller trace (item 2 verified against
  run.js:839); no refuter (comment-only class).
- **Fix sketch:** four comment edits, one commit.
- **Effort:** trivial.
- **Verification status:** finder-executed; not refuted (class policy).
- **Remediation class: SHIP** (comment-only batch; gate suite + lint green).
- **Predicted test impact:** none.
- **Mutation-map judgment (ship gate):** comment edits; no behavioral
  surface.

---

## Cited, not refiled (cross-chunk concurrences)

Items the deep-read hit that are owned elsewhere — verified here, filed there:

- **applyOpponentStaples / absorbStapledSlot ordering** — verified clean by
  chunk 5; this chunk **concurs** (independent read, same conclusion).
- **Opp clone permaBuffs gate** — already in **A5-6**'s site list; nothing
  new to add.
- **Opp clone charges omission** — same defect class as **A5-5**, but
  **unreachable opp-side**: the stapler is `special:true` (excluded from
  oppPool) and no constructed deck lists charges cards. Recommendation:
  A5-5's fix should sweep this site too, for symmetry.
- **Player-vs-opp clone heuristic divergence** — that's **A5-11**; note canon
  §1504 describes the *opponent* heuristic, which applyOpponentClones
  implements faithfully.
- **Draft pick scoring** — chunk 7's deep read covered draft.js's AI-facing
  regions (its coverage section); this chunk did not re-audit scoreDraftCard's
  heuristics beyond the negative-space probes recorded below.
- **Duplicate COLORS tables** — **A1-22** (DRY), not refiled here.

---

## Coverage (deep-read)

- `draft.js`: **838/838 lines, end-to-end** — the whole file.
- `run.js` / `controller.js` / `picklog.js` / `stickers.js` / `engine.js`:
  contract slices only (the named consumer/producer functions:
  startNextGame, startNextGameWithBossBanner, PICKLOG hooks, sticker
  application, isSpliceableBase/isCompatibleStaplePair/canonicalSplicePair).
- Canon: §1400 + §1500 pages, `docs/wiki/roguelike-meta.md`.
- Tests: all three draft-touching tests read.
- **Executed probes:** 200 opp-deck invariant builds; 300-build staple tally
  (plus the refuter's independent 300); 3000-pack rollPack run; 20 Desert
  Cube + 5 classic full drafts; colorAffinity A/B; sticker-kind enumeration.

## Test quality

**Thin.** Three narrow touchpoints exist: `draft_pool_lazy` (good,
behavioral), the equatorial-boss pins, and selfplay plumbing. **ZERO tests**
for: allocLands, countPips, scoreDraftCard, the rollPack policy, Desert Cube
end-to-end, pickPlayer, applyOpponentStaples / applyOpponentStickers /
applyOpponentClones, or the buildOpponentDeck heuristic. Consistent with
draft.js's ~10% on the (part-stale) coverage map.
**Recommendation — highest-value single test:** a **buildOpponentDeck
invariant battery** (deck size, land count, color coherence, staple budget
spent exactly, sticker budget exact, no dup-cap violations) — it would pin
five behaviors at once.

## Verified clean (negative space — checked, no finding)

- **No biased shuffles / off-by-one in the three weighted-draw loops** —
  3000-pack + 300-staple runs clean.
- **Off-deck once-per-pack cap:** 0/3000 violations.
- **allocLands sound:** 23+17=40 every build; the wrap branch unreachable;
  zero-pip default explicit.
- **Desert Cube clean:** always 40 picks, 1/3 substitution rate holds, no
  duplicate basics.
- **pickPlayer rejects** out-of-pack and post-complete picks; PICKLOG
  receives the pre-mutation pack.
- **No shared-ref leaks on the player path** (one read-only escape:
  getConstructedDeck returns the live registry object — noted, not filed).
- **No draft-state survival into the run.**
- **Opp clones reachable** — gameNum carries across sectors; the initial
  dead-code suspicion was refuted by the deep-read itself.
- **Sticker budget exact** over 200 builds; the burst loop terminates.
- **Pool cache safe** — loadCards awaited; laziness is test-pinned.
- **Multicolor wart noted-not-filed:** gold cards count as their first-pip
  color (2 cards in pool; countPips compensates).
- **Dup cap is soft but held:** 0/200 violations observed.
- **Player-vs-opp sticker deckColors freshness asymmetry:** trivial, noted
  only.

## Cross-references

- **A5-5 / A5-6 / A5-11 (chunk 5)** — clone/staple ownership; see
  "Cited, not refiled" above (A5-5's fix should sweep the opp-clone charges
  site for symmetry).
- **A1-22 (chunk 1)** — duplicate COLORS tables (DRY); distinct from A8-4's
  dead oppColors output (refuter-diffed).
- **A4-6 (chunk 4)** — engine.js color predicates; distinct from A8-3's
  draft pip counting (refuter-diffed).
- **Chunk 7** — its deep read covered draft.js's AI-facing regions; pick-scoring heuristics not re-audited here.

## Triage table (for INDEX.md)

| ID | Severity | Dimension | Location | Title | Class | Status |
|----|----------|-----------|----------|-------|-------|--------|
| [A8-1](chunk-08-draft.md) | P3 | draft | draft.js | rollPack policy comment describes a retired "slot 3 bias" — code has NO slot-index logic; real policy is the off-deck-colors shrinking table (canon §1402 + roguelike-meta already correct); 3000-pack probe: cap held 100%, no slot-3 anomaly | ship | open |
| [A8-2](chunk-08-draft.md) | P3 | draft | docs/wiki/rules §1400 | Canon §1400 stale three ways: Desert Cube mode absent entirely (40 picks incl. lands, 1/3 substitution, no auto-allocation; roguelike-meta same gap); §1404 omits equatorialArtificerBoss; §1405's "auto-allocate to 40" violated by design for that boss (33-card deck, test-pinned) | ship | open |
| [A8-3](chunk-08-draft.md) | P4 | draft | draft.js | countPips comment says classic ignores lands — five colored artifact lands contribute pips in classic (feeds allocLands + the :545 pick scorer; rollPack's land-color bias is a separate deliberate read at :650-656 — behavioral claim true through that path); comment reword | ship | open |
| [A8-4](chunk-08-draft.md) | P4 | draft | draft.js | buildOpponentDeck's oppColors is UI-dead output with deterministic WUBRG filler (fired 0/130 natural builds — hypothetical) and a documented-deliberate two-shape contract (constructed = declared as-is, heuristic = always 2); parks with a pointer for any future opp-color consumer | park | parked |
| [A8-5](chunk-08-draft.md) | P3 | draft | draft.js | Opponent staple budget: ~4 in 10 rolls land-consuming, ~1 in 7 basic-fusing (refuter-reproduced: C+C 32 / C+L 30 / L+L 14 / C+S 12 / L+S 10.7 / S+S 1.3); canon silent — design ballot: texture or scaling leak? Rec: exclude Basic+Basic + mild C+L down-weight (medium conf). Rider (a) STRUCK (unreachable); real nit: nonbasic lands without tpl.mana invisible to opp deckColors | stage | open |
| [A8-6](chunk-08-draft.md) | P4 | draft | draft.js | Trivia bundle: :707 "consume_spirit" find/replace casualty; :827-830 rollTransformPack doc vs sole caller (run.js:839 passes all slots, harmless); :467 stale "architecture only, unused" (scarified exists); :260-261 dangling fragment | ship | open |
