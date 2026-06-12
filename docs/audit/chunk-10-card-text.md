# Chunk 10 — Card-text generation (card-text.js: describeCardText/describeAbility/describeEffect, triggerLogText, idiom registry, coverage report)

> Tier 1. **Deep-read + 3 hostile refuters** (one per behavioral finding F1,
> F2, F3) **over the frozen anchor snapshot.** Anchor SHA **`04a925f`**.
> Chunk claimed 2026-06-12T03:08:32Z. Every refuter ran an **independent
> repro** (own probes, own loader, never the finder's script).
>
> Refutation outcome: **1 confirmed / 2 modified / 0 refuted** — and the
> modifications cut both ways: **F1's nominated reachability attack
> BACKFIRED into broader reachability** (the refuter proved a cost-lying
> picker label is vanilla-reachable via deepseam_quarry, where the finder
> had honestly hedged "not reachable in a vanilla game"), while F3 lost one
> leg (render.js:264 is deliberate and correct) and had its ~-leak scope
> narrowed (the double period, though, came back **universal** — stronger
> than filed). F4–F9 carried executed or read-verified evidence from the
> deep-read and skipped refutation per the campaign's repro-or-refute rule.
>
> **Terminology ruling (Joe, 2026-06-10):** Magiclike's rules are THE rules.
> Intentional divergences from real MTG are *design decisions*, recorded as
> such — never framed as deviations from an external standard. MTG is a
> reference point only. Applied throughout this file.
>
> **Class policy (campaign rule, binding):** anything that can alter a game
> outcome **stages**; docs/comment-only and text fixes **ship** (gate: suite
> + lint green). **All nine findings here are text/display/comment defects —
> none changes what the game DOES**, so every actionable one ships. Note on
> A10-1/A10-2/A10-3: they alter what players *read* (picker labels, a card
> face, log lines) but not game behavior — ship class per the rule, with the
> explicit note that **Joe sees these player-facing wording changes in the
> PR diff**. So: A10-1 **ships** (P3), A10-2 **ships** (P3 — coordinate with
> A10-3, same JSON field, one PR), A10-3 **ships** (P3 — render.js:264
> explicitly NOT touched), A10-4 **ships** (P3), A10-5 **ships** (P4 — fix +
> test expectation in the same commit, a *declared* test flip, the
> legitimate kind), A10-6 **parks** (P4, zero live users), A10-7 **parks**
> (P4, zero live users), A10-8 **ships** (P4), A10-9 **ships** (P5 trivia
> rider).

---

## Findings

### A10-1 — Ability-picker labels are a hand-rolled lying duplicate of describeAbility: raw internal kinds, inverted permanence, wrong subject, understated costs — and a cost-lying label is vanilla-reachable  ⟶ SHIP (P3)
- **Location:** `controller.js:1968–2003` (the unified ability picker's
  else-branch label table); the comment at `:1969–1971` claims "use the
  engine's describeAbility helper if available" — **never called**.
  Vanilla path named by the controller's own comment at `:1896–1899`
  (deepseam_quarry falls through to the unified picker). @ `04a925f`
- **Dimension:** duplicate text path vs the engine's own oracle output
  (player-facing label lies).
- **Severity:** **P3** (player-facing text lies, rules-inert; calibrated
  against the A5-13 card-wording precedent).
- **Claim:** the picker synthesizes labels from a private 8-kind table that
  contradicts the engine's own `describeCardText` output:
  royal_assassin/mirror_sage → **"{T}: affect_creature"** (raw internal kind
  as a player-facing label); carrion_feeder → **"Sacrifice: +1/+1 EOT"**
  while the JSON effect is `duration:'permanent'` (a counter — permanent,
  not EOT; the engine's oracle says "put a +1/+1 counter on this");
  wicked_acolyte → **"{T}: Gain -1 life"** while the real effect is the
  *opponent* loses 1 ("{T}: target opponent loses 1 life"); the inline cost
  renderer maps multi-pip colored costs `{W:2}` → `'{2}'`; and
  **deepseam_quarry's second label "{T}: Reanimate" understates the real
  cost** ({T}, {2}, sacrifice-self per the engine's own oracle). Bonus
  latent case (refuter-surfaced): artifice_triumphant's granted ability
  (`cost.mana {colors_of_source:true}`) renders **"{true}: add_type"**
  through the same expression.
- **Evidence (executed, finder + refuter independent):** every quoted label
  reproduced verbatim by running the `controller.js:1972–2002` expression
  over the real card JSONs; refuter additionally executed the **real staple
  flow** — `ENGINE.makeCard('royal_assassin', …, stapledTpls:['forest'])`
  yields 2 abilities, BOTH pass `ENGINE.isLegalAction` in a live game state,
  so `options.length===2` and `showAbilityPicker` fires
  (`controller.js:2030–2031`) with "{T}: affect_creature" + "Tap for {G}"
  as the buttons. `describeCardText` output for all four cards verified
  correct, so the fix produces truthful labels.
- **Reachability:** **BROADER than filed** (the refuter's attack backfired):
  the cost-lying deepseam_quarry label is **vanilla-reachable** — 2 native
  abilities, a draftable nonbasic land (draft.js excludes only basics and
  `special:true`). The four kind/permanence/subject lies need a
  staple/sticker-granted second ability — proven live via the staple flow.
- **Fix sketch:** route the label through `segsToText(describeAbility(ab))`
  with a length cap — `render.js:128`'s ability stack pill does exactly this
  (precedent verified at that line). Delete the private table and the inline
  cost renderer.
- **Effort:** small (one expression swap + table deletion; the target helper
  already exists and is proven at render.js:128).
- **Verification status:** refuter verdict **modified — confirmed with
  broader reachability** (all labels independently reproduced; the staple
  flow executed live; the vanilla path found by the refuter). Confidence
  very high. Not a duplicate (no INDEX row covers the picker table).
- **Remediation class: SHIP** (UI label text only; no game-outcome surface;
  Joe sees the new labels in the PR).
- **Predicted test impact:** none existing touches the picker; a label
  assertion through the real describeAbility path is the natural seed.

---

### A10-2 — Mercurial Adept's custom_text advertises a stale pool: 2 of its 6 listed abilities don't exist — and the popup "Repertoire" (the only true-pool display) never renders in current saves  ⟶ SHIP (P3)
- **Location:** `cards/mercurial_adept/card.json:9` (face text) vs
  `engine.js:4–47` (MERCURIAL_TRIGGER_POOL, the live table); aggravation at
  `controller.js:2329` (Repertoire gates on `Array.isArray(slot.triggerPool)`,
  which post-cutover slots never carry — `engine.js:49–50`; `run.js:474–478`
  is legacy-save passthrough only); stale comment `engine.js:3`. @ `04a925f`
- **Dimension:** card face vs live rules (a player-facing rules promise on
  the card; rules-inert).
- **Severity:** **P3** (same class as A5-13, Stapler custom_text — filed P3,
  fixed PR #121; precedent, not overlap).
- **Claim:** the face says "…draw on lifegain; return to hand on death; gain
  1 life when an enemy creature dies." The live pool's last two entries are
  **Reaper** (another creature dies → ~ gets +1/+0 EOT) and **Hexweaver**
  (~ enters → gain 2 life). No return-to-hand-on-death or
  gain-1-on-enemy-death trigger exists anywhere in the pool. 4/6 clauses
  match (Striker/Spellsworn/Standard-bearer/Bloodscholar).
  **Aggravation (refuter-surfaced, folded):** the popup Repertoire — the
  only UI surface that would show the TRUE pool — silently never renders in
  current saves, so the stale face text is the player's **only** description
  of the pool; there is no mitigating correct display. Corollary: the
  `engine.js:3` comment ("label is shown in the card popup repertoire") is
  stale for current saves.
- **Evidence (executed, finder + refuter independent):** describeCardText
  dump + pool contents side-by-side; refuter independently re-derived all of
  it and killed both nominated attack surfaces: the pool IS live (makePlayer
  `engine.js:939–951` seeds from MERCURIAL_TRIGGER_POOL via
  `tpl.trigger_pool_seed==='mercurial'`; boot validation walks this exact
  table at `engine.js:3758`; no legacy duplicate exists), and **no
  load/migration path rewrites the text** (makeCard `:814` regenerates text
  every game but the custom_text branch, `card-text.js:1101–1102`, returns
  the authored string verbatim — probed: runtime `card.text === tpl.text`
  is true; the only makePlayer text rewriter is gated on
  `/^\d+ charges\b/`, which the Adept lacks).
- **Reachability:** every game containing the Adept.
- **Fix sketch:** correct the two stale face clauses, **and** either re-key
  the popup Repertoire off `tpl.trigger_pool_seed` (rendering
  MERCURIAL_TRIGGER_POOL directly) or fix the `engine.js:3` comment.
  **Coordinate with A10-3 in one PR** — the ~-substitution fix touches the
  same `card.text` field. Note: `card-text.js:1058–1061`'s own comment names
  "silently drift" as the exact custom_text failure mode this realizes.
- **Effort:** trivial (two face clauses) to small (if the Repertoire re-key
  rides along).
- **Verification status:** refuter verdict **confirmed P3** (both nominated
  attacks — pool liveness, load-path rewrite — independently executed and
  held; aggravation found and folded). Confidence very high. Not a
  duplicate: chunk-03 A3-9's describe-vs-effects bullet is a parked
  test-coverage wishlist item, a different artifact; A5-13 is precedent.
- **Remediation class: SHIP** (card-face text rewrite; no game-outcome
  surface; Joe sees the new wording in the PR).
- **Predicted test impact:** a face-text-vs-pool assertion would pin the
  fix; none exists today (see Test quality).
- **Out-of-scope probe note (flag for chunks 7/9, not filed here):** a plain
  STRING deck entry bypasses pool seeding entirely (makePlayer
  `engine.js:935` early-return) — only object slot entries roll a trigger.
  Harmless for player runs (slots are objects).

---

### A10-3 — The `~` placeholder leaks to players on two card faces and in ~-templated trigger log lines / stack pills — and EVERY trigger log line ends with a double period  ⟶ SHIP (P3)
- **Location:** `card-text.js:884–891` (triggerLogText — returns `trig.text`
  verbatim, no substitution), `:1101–1102` (custom_text branch renders
  `card.text` raw); consumers `engine.js:4009`, `:4033` (both append `'.'`),
  `:6782` ('Built ability' — ~ leak only, **no** double period),
  `render.js:131` (stack pill). The substitution seam exists and is unused:
  `formatTriggerText`, `card-text.js:23–25`. @ `04a925f`
- **Dimension:** placeholder substitution seam bypassed at every consumer
  (player-facing text artifacts; rules-inert).
- **Severity:** **P3** (player-facing text-quality defects, zero rules
  impact; consistent with INDEX precedent A5-13).
- **Claim (as corrected by refutation):**
  - **Face leak:** custom_text card faces (architects_codex,
    mercurial_adept) show literal `~` — the real render path
    (`render.js:1571` describeCardSegments → segmentsToHtml) does
    escapeHtml + mana pips only, no ~ substitution anywhere.
  - **Log/pill leak (NARROWED):** triggerLogText output carries `~`
    unsubstituted into the engine log lines and the stack pill **for every
    trigger whose template uses ~**: all authored card-JSON triggers that
    use it (both archdemon_of_bargains triggers), **5/6** Mercurial pool
    entries (Bloodscholar "Life gained — draw a card." has no tilde), and
    **this-/self-scoped Codex assemblies only** — ~ enters assembled text
    via the 3/8 this-scoped conditions (thisEnters/thisAttacks/thisDies,
    `trigger-generator.js:99–103`) and 2/9 self-scoped effect describes
    (pumpSelf/addCounterSelf, `:58`/`:66`); 36/60 in a real-flow sample.
  - **Double period (UNIVERSAL — stronger than filed):** `engine.js:4009`
    and `:4033` (the **two** double-period sites — :6782 is not one) both
    append `'.'` to text that already ends `'.'`: 6/6 Mercurial, 101/101
    generated pool-card trigger descriptions, and 60/60 real-flow assembled
    Codex triggers end `'.'` before the call site appends another — **every
    trigger log line in live play ends ".."**, authored and generated alike.
  - **DROPPED (refuter correction):** the originally-filed `render.js:264`
    leg is NOT a defect — its inline no-escape substitution is deliberate
    and correct (textContent sink; the adjacent comment at `:262–263`
    explains why HTML-escaping would render literal `&amp;`). Routing it
    through formatTriggerText would *introduce* a bug. At most it stands as
    a textContent-vs-innerHTML seam-design observation.
- **Evidence (executed, finder + refuter independent):** face segs for both
  cards contain literal `~` (executed on the real render path, not just the
  helper); grep for `replace(/~` finds only `card-text.js:24` and
  `render.js:264`, neither on the face path; all 297 pool cards swept for
  authored ~-carriers; period counts executed as above;
  `controller.js:2350` — which DOES substitute the same authored
  bonusTrigger texts for display — proves the intent is name substitution.
- **Reachability:** face leak every Adept/Codex game; ~ log leak on every
  ~-templated trigger fire; the ".." on **every** trigger log line.
- **Fix sketch:** wrap at the call sites —
  `formatTriggerText(triggerLogText(p.trig), p.sourceName)` (sourceName in
  scope at all four consumers); custom_text branch →
  `formatTriggerText(staticText, card.name)`; dedupe the trailing period at
  the two appending log sites. **`render.js:264` explicitly NOT touched.**
  **One PR with A10-2** (same `card.text` field on the Adept).
- **Effort:** small (four call-site wraps + one period dedupe + the
  custom_text branch).
- **Verification status:** refuter verdict **modified** (core confirmed on
  the real render path; one leg dropped, scope narrowed, double period
  upgraded to universal; all independently executed). Confidence very high.
  Not a duplicate (A3-9 is the trigger-layer coverage cluster; A1-9 was a
  different log lie, fixed PR #107; no INDEX row covers placeholder
  substitution or log cosmetics).
- **Remediation class: SHIP** (log/face text only; no game-outcome surface;
  Joe sees the wording in the PR).
- **Predicted test impact:** nothing today touches triggerLogText
  substitution or the custom_text ~ path (see Test quality — this finding
  would have been caught); the fix PR should add that assertion.

---

### A10-4 — add_type/set_types with scope:'self' renders an empty subject — live on artifice_triumphant's card face  ⟶ SHIP (P3)
- **Location:** `card-text.js` describeEffect — the add_type/set_types arm
  omits the subject when `scope:'self'` (pump's arm handles the same scope
  with subject "this"). @ `04a925f`
- **Dimension:** describe arm vs effect shape (player-facing face-text
  artifact).
- **Severity:** **P3** (a live card face renders a malformed sentence;
  rules-inert).
- **Claim:** the add_type/set_types describe arm drops the subject for
  `scope:'self'`, producing an empty-subject clause on the rendered face.
- **Evidence (executed):** the **297-card dual-mode sweep with 8 artifact
  detectors** (see Coverage) returned exactly one hit: artifice_triumphant.
- **Reachability:** live — artifice_triumphant's face, every game it
  appears.
- **Fix sketch:** emit subject `'this'` for `scope:'self'`, mirroring the
  pump arm.
- **Effort:** trivial (one branch in one arm).
- **Verification status:** finder-executed (sweep hit, face confirmed); not
  refuted per the campaign rule (executed evidence, ship-class text fix).
- **Remediation class: SHIP** (face text only).
- **Predicted test impact:** the recommended whole-pool artifact sweep test
  (Test quality) pins this class permanently.

---

### A10-5 — "you gains life equal to" — a grammar bug LOCKED IN by the test suite pinning the wrong string  ⟶ SHIP (P4)
- **Location:** `card-text.js` gain_life describe arm (subject "you" takes
  the third-person verb form); **pinned wrong** at
  `tests/card_text_test.js:63–66`. @ `04a925f`
- **Dimension:** grammar artifact + a test certifying the bug as correct.
- **Severity:** **P4** (latent: both live users of the construction use
  `target_controller`, which conjugates correctly; the "you gains" path has
  zero current card faces).
- **Claim:** the gain-life-equal-to describe emits "you gains life equal
  to…" for the you-subject path, and `card_text_test.js:63–66` asserts that
  exact wrong string — so fixing the text without touching the test goes
  red.
- **Evidence (executed):** describe output reproduced; test pin read at the
  cited lines; both live users confirmed `target_controller`.
- **Reachability:** latent today (no live card hits the you-subject path).
- **Fix sketch:** conjugate by subject ("you gain" / "<name> gains") and
  **update the test expectation in the same commit** — a *declared* test
  flip, the legitimate kind (the expectation was pinning a bug).
- **Effort:** trivial.
- **Verification status:** finder-executed; not refuted (latent text fix).
- **Remediation class: SHIP** (text + test expectation, one commit).
- **Predicted test impact:** `card_text_test.js:63–66` flips by design —
  that failure is the fix working (cf. A9-1's test re-pin precedent).

---

### A10-6 — coalesceEotBuffs drops the target filter from the coalesced subject  ⟶ PARK (P4)
- **Location:** `card-text.js` coalesceEotBuffs — when two coalescible EOT
  buffs share a filtered target, the merged sentence keeps the buff math but
  drops the filter qualifier from the subject. @ `04a925f`
- **Dimension:** latent describe artifact (coalescing path).
- **Severity:** **P4** (zero live users).
- **Claim & honest reachability:** **unreachable today** — executed
  synthetic repro only; **0 pool cards** combine a target filter with 2+
  coalescible buffs.
- **Evidence (executed):** synthetic effect pair through the real coalesce
  path; pool sweep for the filter+2-buff combination came back empty.
- **Park pointer:** *anyone authoring a card with a filtered target and two
  coalescible EOT buffs must first make coalesceEotBuffs carry the filter
  into the merged subject.*
- **Effort (if ever picked up):** small.
- **Verification status:** finder-executed synthetic; not refuted
  (unreachable class).
- **Remediation class: PARK** (no live card can hit it; the pointer is the
  deliverable).
- **Predicted test impact:** none.

---

### A10-7 — Modal modes whose idiom text embeds a period double-punctuate  ⟶ PARK (P4)
- **Location:** `card-text.js` modal assembly — a mode rendered via an idiom
  whose template already ends/embeds `'.'` gets the modal joiner's
  punctuation appended on top. @ `04a925f`
- **Dimension:** latent describe artifact (modal path).
- **Severity:** **P4** (zero live users).
- **Claim & honest reachability:** **unreachable today** — executed
  synthetic only; **0 pool modals** use an idiom with an embedded period.
- **Evidence (executed):** synthetic modal through the real assembly; pool
  modal sweep clean.
- **Park pointer:** *anyone adding a modal mode whose idiom text carries its
  own period must first teach the modal joiner to dedupe punctuation.*
- **Effort (if ever picked up):** trivial.
- **Verification status:** finder-executed synthetic; not refuted
  (unreachable class).
- **Remediation class: PARK**.
- **Predicted test impact:** none.

---

### A10-8 — TEXT_IDIOM_ONLY has drifted: apply_sticker is in the set but has a full standalone describe case — a future regression would pass boot coverage  ⟶ SHIP (P4)
- **Location:** `card-text.js` TEXT_IDIOM_ONLY set + its header comment vs
  the apply_sticker case in describeEffect. @ `04a925f`
- **Dimension:** coverage-report integrity (the set exempts kinds from the
  "must have a describe arm" check; an exempted kind that HAS an arm means
  the guard no longer guards it).
- **Severity:** **P4** (no current wrong text; the harm is a future
  regression of the apply_sticker arm sailing through
  `effectCoverageReport`/boot coverage green).
- **Claim:** apply_sticker sits in TEXT_IDIOM_ONLY ("these kinds render only
  through idioms") while describeEffect carries a full standalone
  apply_sticker case — the set's membership contradicts its own header.
- **Evidence (executed):** effectCoverageReport executed; set membership and
  the standalone case both read at the anchor.
- **Reachability:** guard-integrity only; no player-visible text is wrong
  today.
- **Fix sketch:** remove apply_sticker from the set + reword the header to
  state the actual invariant.
- **Effort:** trivial.
- **Verification status:** finder-executed; not refuted (guard-hygiene
  class).
- **Remediation class: SHIP** (one-line set edit + comment; behavior-neutral
  for all current text).
- **Predicted test impact:** test_effect_coverage stays green; the set edit
  re-arms it for apply_sticker.

---

### A10-9 — Stale "line 567" citation in the bake-guard comment  ⟶ SHIP (P5, trivia rider)
- **Location:** `card-text.js:1046` (the describeCardText bake-guard header
  comment) — cites "line 567 of engine.js", which no longer points at the
  referenced code. @ `04a925f`
- **Dimension:** comment vs code (stale line-number cite).
- **Severity:** **P5** (trivia).
- **Evidence (read-verified, self-QA re-verified):** the comment cites
  "line 567 of engine.js" for the makeCard text regeneration; `engine.js:567`
  is now staple-trigger targeting code — the actual regeneration site is
  makeCard at `engine.js:814`.
- **Fix sketch:** cite by function name, not line number.
- **Effort:** trivial — ride any A10 PR.
- **Verification status:** read-verified; not refuted (trivia class).
- **Remediation class: SHIP** (comment-only rider).
- **Predicted test impact:** none.

---

## Coverage (deep-read)

- `card-text.js`: **whole file, 1234/1234 lines** read in full.
- **All 28 describeEffect arms cross-checked against the 31 EFFECTS kinds**
  — the idiom-only set accounts for the gap; `effectCoverageReport`
  executed, **all five of its lists empty** at the anchor.
- **Behavior cross-checks by handler reads** (does the text tell the truth
  about what the engine does): damage scopes including the `scope:'self'`
  strip ("you take N damage" is truthful); pump/add_counter permanence;
  the affect_creature severity ladder shared by both sides;
  move_card/change_control/steal/symmetricize/rip/edict/grant_keyword
  durations; §305.6 mana-line suppression.
- **Executed sweeps:** 297 cards rendered dual-mode with **8 artifact
  detectors** (exactly 1 hit = A10-4); 103 pool + 6 Mercurial + 8 generator
  trigger classifications (**0 null archetypes**); generator
  describe-vs-effect parity (the one mismatch class is already filed as
  chunk-03 **A3-9 #10c** — cited, not refiled); sticker text grants clean;
  the stapled-baseline text path read.
- **NOT audited:** renderManaSymbols/keywordIconsHtml internals; XSS beyond
  the escape-order read (verified escape→pips ordering only).

## Test quality

- **Genuinely the best-guarded file in the audit so far — and NOT merely
  display-string-pinning:** `test_no_dead_text` is a real property test;
  `test_generated_special_text` covers the generator surface;
  `test_effect_coverage` *executes* the coverage report; and
  `card_text_test.js`'s exact-string pinning is legitimate here because
  exact strings ARE this module's contract. **83/83 green at the anchor.**
- **Two weaknesses:** (1) it **pins a bug** (A10-5 — the expectation at
  `card_text_test.js:63–66` certifies "you gains" as correct); (2) **no
  whole-pool artifact sweep exists** — the deep-read's 8-detector probe over
  all 297 faces found A10-4 in seconds; turning that probe into a permanent
  test is the cheapest high-value addition this chunk recommends.
- **Fully dark:** nothing touches triggerLogText substitution or the
  custom_text ~ path — **A10-3 would have been caught** by a single
  assertion there.

## Verified clean (negative space — checked, no finding)

- **Archetype table zero gaps:** 103 pool + 6 Mercurial + 8 generator
  triggers all classify non-null.
- **No `[kind]` sentinel / `undefined` / `NaN` / dangling-"to" /
  generic-preamble reaches any pool face** (297-card sweep; 1 hit total =
  A10-4).
- **damage all_yours/all_opps dangling text:** zero users in the pool.
- **trigger target:'player':** zero occurrences in card JSONs (the
  engine-side Striker case is A3-9 #10c — cited, not refiled).
- **colors_of_source cost early-return:** latent-only (no current face
  renders through it except via A10-1's picker table).
- **Sticker-trigger index misalignment:** impossible — stickers.js only
  appends.
- **Mana ordering / optional-cost / §305.6 suppression / modal joiner /
  fight idiom / signed-zero pump:** all pinned by the suite (83/83 at the
  anchor).

## Cross-references

- **A3-9 #10c (chunk 3)** — the generator describe-vs-effect mismatch class
  and the engine-side Striker `target:'player'`; cited here, not refiled.
- **A5-13 (chunk 5)** — Stapler custom_text oracle wrong (fixed PR #121):
  the severity precedent for A10-2 and the class precedent for custom_text
  drift.
- **A1-9 (chunk 1)** — a different log lie (fixed PR #107); diffed from
  A10-3 by the refuter.
- **Chunks 7/9** — the string-deck-entry pool-seeding bypass probe note
  under A10-2 belongs to their ground if anyone wants it.
- **A10-2 + A10-3 share `cards/mercurial_adept/card.json`'s text field —
  one PR.**

## Triage table (for INDEX.md)

| ID | Severity | Dimension | Location | Title | Class | Status |
|----|----------|-----------|----------|-------|-------|--------|
| [A10-1](chunk-10-card-text.md) | P3 | duplicate text path | controller.js:1968 | Ability-picker labels hand-roll a lying duplicate of describeAbility (raw kinds, inverted permanence, wrong subject, {W:2}→{2}); cost-lying "{T}: Reanimate" label vanilla-reachable via deepseam_quarry (refuter attack backfired into broader reachability); fix = segsToText(describeAbility) per render.js:128 | ship | open |
| [A10-2](chunk-10-card-text.md) | P3 | card face vs rules | cards/mercurial_adept/card.json | Mercurial Adept custom_text advertises a stale pool: 2/6 listed abilities don't exist (live entries Reaper/Hexweaver); aggravation: the popup Repertoire never renders in current saves so the stale face is the ONLY pool description; coordinate with A10-3, same field, one PR | ship | open |
| [A10-3](chunk-10-card-text.md) | P3 | placeholder leak | card-text.js:884/:1101 | `~` leaks on two card faces + every ~-templated trigger log/pill (5/6 Mercurial, both Archdemon, this-/self-scoped Codex builds); double period UNIVERSAL on trigger log lines (engine.js:4009/:4033); render.js:264 deliberate+correct, NOT touched; fix = formatTriggerText at call sites + period dedupe | ship | open |
| [A10-4](chunk-10-card-text.md) | P3 | describe arm gap | card-text.js | add_type/set_types scope:'self' renders an empty subject — live on artifice_triumphant (297-card 8-detector sweep, 1 hit); fix = subject 'this' mirroring pump | ship | open |
| [A10-5](chunk-10-card-text.md) | P4 | grammar + test pin | card-text.js / card_text_test.js:63 | "you gains life equal to" — bug LOCKED IN by the test pinning the wrong string; latent (both live users use target_controller); fix + test expectation same commit (declared flip) | ship | open |
| [A10-6](chunk-10-card-text.md) | P4 | latent describe | card-text.js | coalesceEotBuffs drops the target filter from the coalesced subject (executed synthetic; 0 pool cards combine filter + 2 coalescible buffs) | park | parked |
| [A10-7](chunk-10-card-text.md) | P4 | latent describe | card-text.js | Modal modes with idiom-embedded periods double-punctuate (executed synthetic; 0 pool modals hit it) | park | parked |
| [A10-8](chunk-10-card-text.md) | P4 | guard drift | card-text.js | TEXT_IDIOM_ONLY drifted: apply_sticker has a full standalone case contradicting the header — a future arm regression would pass boot coverage; fix = remove from set + reword header | ship | open |
| [A10-9](chunk-10-card-text.md) | P5 | stale comment | card-text.js | Stale "line 567" cite in the bake-guard comment; cite by function | ship | open |
