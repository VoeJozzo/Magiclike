# Chunk 7 — AI (ai.js: valuation, combat brain, trigger-target picks, the selfplay harness's view of the AI)

> Tier 1. **Deep-read + 4 hostile refuters** (one per behavioral finding A7-1,
> A7-2, A7-3, A7-5) **over the frozen anchor snapshot.** Anchor SHA
> **`3adb44c`**. Chunk claimed 2026-06-12T00:44:36Z. Every refuter ran an
> **independent repro** (own probes, own loader, never the finder's script).
>
> Refutation outcome: **0 refuted / 2 modified / 2 confirmed.** A7-1 was
> confirmed and *widened* (the hole is bigger than filed); A7-2 and A7-5 were
> modified (claims held, framings corrected). A7-4 (comment-vs-code, honestly
> unreachable, pool-scanned) and A7-6 (structural notes, deliberately
> notes-not-findings) were not assigned refuters per the campaign's class
> policy.
>
> **Process note:** the first deep-read attempt (previous session) stalled on
> an unbounded selfplay sweep. This pass applied bounded-probe discipline —
> every probe <60s, no selfplay run >25 games — and it worked.
>
> **Concurrency note:** the Stackable infrastructure was being built on `dev`
> while this chunk ran. The respond/priority arm of `AI.decide` (see A7-6
> notes) carries a **needs-reverify-post-Stackable** flag — deliberately filed
> as notes, not findings. A7-1's fix also intersects (flagged in its packet).
>
> **Terminology ruling (Joe, 2026-06-10):** Magiclike's rules are THE rules.
> Intentional divergences from real MTG are *design decisions*, recorded as
> such — never framed as deviations from an external standard. MTG is a
> reference point only. Applied throughout this file.
>
> **Class policy (campaign rule, binding):** anything that can alter a game
> outcome **stages** (plain-English decision packet per finding); docs/comment-
> only and test-infrastructure-diagnostic fixes **ship** (gate: suite + lint
> green). So: A7-1 stages (P2), A7-2 and A7-3 stage (P3 — valuation/pick
> changes alter AI play, and AI play is a game outcome); A7-4 ships (P4
> comment fix, or fold into a trivia batch); A7-5 ships (P3 — test-
> infrastructure diagnostics, behavior-neutral for the game itself, per the
> standing rule); A7-6 is a notes entry, not a finding.

---

## Findings

### A7-1 — Extra-cost mana abilities are triple-bypassed: cost-blind tapLandForMana surfacing, cost-skipping execution, and a solver that counts them as free sources — refuter-WIDENED to tapless extra-cost abilities too
- **Location:** `reference/html-proto/js/engine.js:7018–7027` (non-land mana-
  ability enumeration: the findIndex matches only `effects[0].kind ===
  'add_mana'` with **no cost inspection**, push at `:7025`) + `:7071–7072`
  (`if (isMana) continue` skips it from activateAbility enumeration) +
  `:6751–6771` (isLegalAction `tapLandForMana` arm — checks only
  controller/tapped/sick/window, never `ab.cost.mana/sacrifice/
  remove_counters`) + `:6204–6232` (doTapLandForMana pays only the tap) +
  `:1712–1733` and `:237–241` (solveManaPayment's source scan via
  manaAbilityOf, which matches `cost.tap` + `add_mana` and ignores every other
  cost field). Adjacent, same gate needed: `:6838–6842` (isLegalAction's
  **activateAbility** arm also fast-paths mana abilities to legal). @ `3adb44c`
- **Dimension:** rules correctness (latent) + structural footgun.
- **Severity:** **P2** (latent landmine; silent cost-dodging — consistent with
  this audit's latent-P2 calibration: A4-15, A4-8, A2-5).
- **Evidence (finder-executed + refuter re-derived all three legs
  independently):** synthetic altar "{T}, sacrifice a creature: add {B}{B}"
  (synthetic-ability attachment is the snapshot's own established test
  methodology, cf. `tests/test_a4_self_target_ability.js`): (a) enumerated
  exactly once, as `tapLandForMana` abilityIdx:0, zero activateAbility
  entries; (b) isLegalAction true, executeAction true, {B}{B} produced, altar
  tapped, **nothing sacrificed**; (c) fresh-process probe: with the sac-altar
  as the ONLY source, a {B}{B} spell was castSpell-legal and cast — the
  payment solver auto-tapped the altar as a free source, sac creature alive.
  Reachability: refuter independently re-scanned **all 297 card JSONs
  including a recursive deep-scan of embedded sticker payloads**
  (grant_activated_ability shapes) — zero extra-cost mana abilities anywhere
  (the one deep-scan hit, dark_ritual, is the card's own casting cost + spell-
  resolution add_mana, unreachable by manaAbilityOf or battlefield
  enumeration); staple-merge `manaAbilityForColors` builds tap-only; no
  random sticker generator emits add_mana abilities. **Fully latent today;
  the first sac/pay-for-mana card ships broken silently.**
- **Refuter widening (holes BIGGER than filed):** neither the enumeration
  findIndex (`:7023`) nor the abilityIdx execution path (`:6213–6215`)
  requires `cost.tap` at all — a **tapless** "Sacrifice a creature: Add {B}"
  ability would also be surfaced as tapLandForMana, and execution would
  **wrongly TAP its source**. Scope note on leg (c): manaAbilityOf DOES
  require `cost.tap`, so the solver free-source hole covers only extra-cost
  abilities that also include {T}; tapless ones are invisible to the solver
  but still hit holes (a)/(b).
- **Canon:** `docs/wiki/rules/700-casting-and-activating.md` §705 — the
  implemented cost components are tap and mana only; nothing in canon blesses
  *half-accepting* the extra-cost shape (surface + legalize + execute +
  solver-count while never paying). The boot-tripwire fix matches canon's
  posture.
- **Fix sketch:** gate the non-land tapLandForMana surfacing AND the
  isLegalAction tapLandForMana arm AND the activateAbility mana fast-path
  (`:6838–6842`) on absence of extra costs; route extra-cost mana abilities
  through the activateAbility path; exclude extra-cost abilities from
  manaAbilityOf (or teach the solver they're non-free); boot tripwire
  ("mana ability with non-tap cost ⇒ unsupported") until a real card needs it.
- **Effort:** medium (three gates + solver exclusion + boot tripwire + tests;
  the activateAbility routing leg is now trivial post-#128 since cost payment
  is centralized).
- **Stackable intersection (binding for the fix PR):** the activateAbility-
  routing leg of the fix **must be built against the post-Stackable code** —
  the cost-blind tap path and the solver hole are independent of it.
- **Verification status:** refuter verdict **confirmed** (attacked on five
  fronts — code quotes, repro honesty, reachability, canon, severity/duplicate
  — all held). Confidence high. Origin: the PR #118 lead, confirmed and
  extended (the card IS enumerated, executes, and nobody pays).
- **Remediation class: STAGE** (behavioral; can alter game outcomes the day a
  producer ships).
- **Predicted test impact:** none today; fix brings an enumeration + legality
  + solver test triple plus the tripwire.

#### Decision packet for A7-1 (stage — plain English)
The engine has a fast lane for "tap a thing for mana." Any ability that
*produces* mana gets shoved into that fast lane — even if it also has an
extra price tag like "sacrifice a creature." The fast lane never looks at the
price tag: the ability shows up as castable, executes, makes the mana, and
the extra cost is simply never paid. Worse, the automatic mana-payer counts
such an ability as a *free* mana source when deciding what you can afford.
And the check found it's even wider than first filed: an ability with *no*
tap in its cost at all would still get crammed into the tap lane and would
wrongly tap the card. No card in the pool today has a mana ability with an
extra cost — so nothing is broken *yet* — but the first "sacrifice for mana"
card designed will silently cheat its cost in every game.
- **Option (one direction, confidence: high):** teach the fast lane to step
  aside — mana abilities with any cost beyond {T} go through the normal
  ability pipeline (which pays costs properly), the mana-payer stops counting
  them as free, and a boot-time tripwire flags the shape as unsupported until
  that pipeline exists. **Timing:** the pipeline half of this fix must be
  written against the new Stackable code that was being built while this
  audit ran — don't fix it against the snapshot.

---

### A7-2 — effectCoverageReport structurally cannot verify the cast-path scorer: add_counter is VALUED-claimed but the untargeted non-permanent cast path scores it 0 (refuter-narrowed dead zone)
- **Location:** `reference/html-proto/js/ai.js:148–154` (VALUED_EFFECT_KINDS,
  add_counter at `:149`) vs `:52–139` (spellValueForEffects if-chain — a
  branch for every other VALUED kind, none for add_counter);
  `engine.js:1545–1582` (effectCoverageReport does membership/staleness set
  algebra only). Adjacent half-version: 'rip' is in TARGET_SCORED_KINDS
  (`ai.js:16`) but scoreSpellTargetForMode has no standalone rip branch —
  only the `hasRip ? 16 : 10` premium inside the sacrifice/annihilate arm
  (`ai.js:1519,1528`). @ `3adb44c`
- **Dimension:** footgun — a guard built specifically to prevent silent
  0-valuation cannot see this class — plus the 0-valuation itself.
- **Severity:** **P3** (latent; decision-quality, not rules correctness, when
  it lands — but a real defeat of the guard's purpose).
- **Evidence (finder-executed + refuter re-derived with its own loader):**
  `AI.spellValueForEffects([{kind:'add_counter',power:2,toughness:2}])` → 0
  (pump control → 2); `VALUED_EFFECT_KINDS.has('add_counter')` → true;
  `effectCoverageReport()` → **all FIVE lists empty** (unclassifiedValuation,
  staleValuation, missingText, unclassifiedCastScoring, staleCastScoring).
  Never-cast trace holds end to end: bestSpellPlay scores untargeted
  non-permanents via spellValueForEffects + scoreUntargetedSituation (gain_life
  only, `ai.js:1345–1366`); the reject gate at `:1219` is score ≤ 0 → null.
- **Refuter corrections (folded — the precise shape of the defect):**
  1. **The dead zone is exactly: an UNTARGETED add_counter cast effect on a
     NON-PERMANENT spell.** Targeted casts ARE scored — scoreSpellTargetForMode
     has an explicit pump/add_counter arm at `ai.js:1662` (and a same-spell
     fold at `:1304`); non-creature permanents get the score≤0 floor of 5 at
     `:1213`; triggers/abilities are scored by engine-side abilityValue, which
     HAS an add_counter case (`engine.js:1516`).
  2. **Membership is technically contract-consistent:** the set's own contract
     comment (`ai.js:142–143`) promises a "real scoring branch
     (spellValueForEffects / abilityValue)" — a disjunction add_counter
     satisfies via abilityValue. The defect is therefore squarely the
     *report's*: it checks membership only and **cannot verify the scorer for
     the path that needs it has a branch** — which strengthens the
     "structurally cannot catch" half over the "claims valued but scores 0"
     headline.
  3. **The proposed hardening is unsound as written:** a blanket non-zero
     probe of spellValueForEffects would false-positive on 'sacrifice' (its
     branch deliberately adds 0 at `ai.js:71` — the edict value rides the
     `chooses` +6) and on move_card exile→battlefield (+0 by design,
     `ai.js:94`). Any hardened probe must be per-kind aware, or assert
     `max(spellValueForEffects, abilityValue) > 0` with documented exceptions.
- **Reachability:** latent — zero pool cards have add_counter cast effects;
  the only user (hymnwright) carries it in a trigger, valued correctly by
  abilityValue. An untargeted add_counter sorcery would be valued 0 → the AI
  never casts it.
- **Fix sketch:** add the spellValueForEffects branch (mirror abilityValue:
  3 + power + toughness); optionally harden the report per correction (3);
  consider giving 'rip' its standalone target-scoring branch in the same pass.
- **Effort:** small (one valuation branch + optionally a smarter report probe;
  beware the 'sacrifice'-scores-0 false-positive).
- **Verification status:** refuter verdict **modified** (all line cites,
  repro, reachability, and the rip aside verified; headline and list-count
  corrected; hardening caveat added). Confidence high. Not a duplicate —
  A4-18's AI-coverage park is a different (coverage-darkness) finding.
- **Remediation class: STAGE** (valuation change alters AI play — a game
  outcome under the campaign rule).
- **Predicted test impact:** none today; the fix's test pins the new branch
  and, if hardened, the per-kind probe exceptions.

#### Decision packet for A7-2 (stage — plain English)
The AI has a checklist of effect types it knows how to value, plus a watchdog
report meant to yell when a new effect type gets added without a value. The
adversarial check found the precise blind spot: the watchdog only checks the
*checklist*, not whether the valuing code actually has an entry — and
"+1/+1 counters" is on the checklist but the spell-pricing function has no
entry for it. Today this is harmless (counters only appear on a trigger,
which a different, correct valuer handles; and *targeted* counter spells are
priced fine). But design an untargeted "put counters on your creatures"
sorcery and the AI will price it at zero and never cast it — silently, with
the watchdog reporting all-clear.
- **Option (one direction, confidence: high):** add the missing pricing entry
  (mirroring the trigger valuer's formula), and — carefully — teach the
  watchdog to actually probe each claimed type. The probe needs nuance: two
  effect types ('sacrifice', and one move_card shape) price at zero *on
  purpose*, so a naive "must be non-zero" check would cry wolf; the probe
  must allow documented exceptions.

---

### A7-3 — Grave-return trigger targets picked arbitrarily: pickBestTriggerTarget's branch keys on the retired `returnFromGraveyard` kind — live for 3 pool cards
- **Location:** `reference/html-proto/js/engine.js:4180–4191` (branch tests
  `eff.kind === 'returnFromGraveyard' || eff.kind === 'grant_cast_permission'`;
  fallthrough at `:4199` is `return valid[0]`). The retired string survives
  ONLY here — it's gone from EFFECTS (collapsed to move_card graveyard→hand by
  `tools/migrate-effects.js:147`; `effect_migration_test.js` asserts the
  collapse). @ `3adb44c`
- **Dimension:** decision quality + dead branch keyed on retired vocabulary.
- **Severity:** **P3** (live in every AI game with these cards; play stays
  legal, just value-blind — pure decision quality, no rules violation; canon
  doesn't govern AI pick quality).
- **Evidence (finder-executed + refuter re-executed an INDEPENDENT end-to-end
  repro):** refuter booted the real engine via tests/_setup, had the AI
  ('opp') genuinely cast grave_digger through executeAction, seeded the
  graveyard both orders: yard [bear_cub (value 4), ancient_hydra (value 28)]
  → trigger returned **Bear Cub**; reversed order → returned Ancient Hydra.
  Pick = `graveyard[0]` in both orders — order-dependent and value-blind (a
  value-aware pick takes the Hydra both times). Effect-shape trace verified:
  tsSlotValueEff (`:4695`) returns the move_card effect; no earlier branch
  catches it (the `:4117` move_card branch is hand→graveyard only; the
  creature-filtered branches skip kind 'graveyard_card' targets). AI-only:
  triggers route pushTriggerOnStack → tsAutoPick (`:4722`) →
  pickBestTriggerTarget (`:4729`); humans get a prompt.
- **Scope (pool-scanned, refuter-verified):** exactly **grave_digger,
  morticians_assistant, spirit_shepherd** — the three cards with a targeted
  graveyard→hand move_card in a *trigger*.
- **Fix sketch:** extend the branch to
  `(eff.kind === 'move_card' && from_zone === 'graveyard' && to_zone ===
  'hand')`, keep the grant_cast_permission disjunct, delete the retired
  string. **Refuter nuance (binding for the fix):** the branch body
  (`:4181–4186`) currently looks the card up in a single yard derived from
  eff.kind — the move_card disjunct must derive the yard from the effect's
  `filter.graveyards` (default 'self') or, more robustly, from the target's
  own stamped `controller` tag (getValidTargets stamps it at `:4427`), so
  cross-yard/multi-yard filters value correctly.
- **Effort:** small (one branch condition + yard derivation from the target's
  stamped controller + pin test).
- **Adjacent lead — WITHDRAWN (self-QA falsified the refuter's correction):**
  an earlier draft claimed **hymnwright**'s identical activated-ability recall
  routes through ai.js `pickBestActivation` "where move_card has no arm." That
  is **false at the anchor**: pickBestActivation has **five** move_card arms,
  including a dedicated graveyard→hand arm (ai.js `~:1964`) whose comment
  names Hymnwright's verse ability and scores
  `10 + ENGINE.getCardValue(recalled, 'play')` with per-target enumeration.
  The activated path is fully value-aware; no backlog item.
- **Verification status:** refuter verdict **confirmed** (every leg attacked
  and held; not a duplicate — A3-1/A3-10 are trigger-target
  legality/validation, not pick quality). Confidence high.
- **Remediation class: STAGE** (changes which card the AI returns — alters AI
  play, hence game outcomes).
- **Predicted test impact:** none today; the fix is one line + a pin test
  (both-orders → Hydra).

#### Decision packet for A7-3 (stage — plain English)
Three cards (Grave Digger, Mortician's Assistant, Spirit Shepherd) let their
controller return a creature from the graveyard. When the AI controls them,
the code that's supposed to pick the *best* creature is keyed to an old
internal name for the effect that no longer exists — so it falls through to
"just take the first one in the list," i.e. the **oldest** card in the
graveyard, value ignored. Verified live: with a 2-cost bear and a giant hydra
in the yard, the AI takes whichever happens to be listed first. Legal play,
just dumb — in every AI game with these cards.
- **Option (one direction, confidence: high):** point the picker at the
  effect's current name (a one-line condition change) plus a small test.
  Two riders: from the adversarial check, the picker must look in the *right
  graveyard* (the effect can name whose yard it digs in — derive it from the
  effect or the target's own tag, don't assume "mine"). And a correction from
  self-QA: an earlier draft claimed a fourth card, Hymnwright, has the same
  effect as an *activated ability* going through a different, also-unscoring
  code path — that claim is withdrawn as false. The activated-ability picker
  already has a dedicated, value-aware branch for exactly this effect (it even
  names Hymnwright in its comment and weighs each returnable card). Nothing
  there needs your attention — no backlog item.

---

### A7-4 — Comment-vs-code mismatch in ai.js (honestly unreachable, pool-scanned)  ⟶ SHIP (comment-only)
- **Location:** `js/ai.js:1190-1194 @ 3adb44c`
- **Filed (deep-read, abbreviated filing):** P4 comment-vs-code discrepancy in
  ai.js; the described scenario is honestly unreachable with the current pool
  (deep-read pool-scanned it before filing). No refuter assigned
  (comment-only class — the probe is the verification).
- **Content:** bestSpellPlay's non-modal self-damage gate ("self-damage >= our
  life -> don't cast") carries a comment deferring modal cards to a per-option
  check that was never written; a modal card with a self-damage mode could be
  suicide-cast at lethal life. Pool-scanned unreachable: only `char` has
  scope:'self' damage and it is non-modal.
- **Dimension:** comment vs code. **Severity:** P4.
- **Fix sketch:** one comment edit.
- **Effort:** trivial. **Verification status:** finder-executed pool scan;
  not refuted (class policy).
- **Remediation class: SHIP** (comment-only; gate suite + lint green) — or
  fold into a cross-chunk trivia batch with the other P4 comment fixes.
- **Predicted test impact:** none.
- **Mutation-map judgment (ship gate):** a comment edit cannot flip a mutant;
  no behavioral surface.

---

### A7-5 — Selfplay harness ignores executeAction's boolean: an AI illegal action is never *classified* — loud on stderr, but mislabeled "runaway" in the structured results, and it corrupts the action-mix stats  ⟶ SHIP (test-infrastructure)
- **Location:** `reference/html-proto/tests/selfplay_harness.js:359–366`
  (`try { ENGINE.executeAction(actor, action); } catch (e) {...}` — boolean
  never read; actionsTaken++ unconditional at `:370`; runaway classification
  at `:374`, ACTION_CAP=2000; actionTypes tallies at `:368–369`); contract at
  `engine.js:7551–7557` (illegal → `console.warn` + `return false`, **no
  throw** — the catch can never fire for an illegal action). Contrast:
  production `controller.js:1631–1636` reads
  `const ok = ENGINE.executeAction(...)` and falls back to pass — the harness
  has less signal than production. @ `3adb44c`
- **Dimension:** test quality — a free, missing failure class in the suite's
  main AI exerciser.
- **Severity:** **P3** (trivial fix, high diagnostic value).
- **Evidence (finder code-trace + refuter independent end-to-end repro):**
  refuter booted via tests/_setup, ran a real draft + RUN.startNextGame, fed a
  genuinely illegal playLand through a harness-style loop: no throw, return
  false every time, state byte-identical before/after, actionsTaken
  incremented regardless → marches to the cap → `result.runaway = true`.
  AI.decide is deterministic except one Math.random branch (`ai.js:679`), so
  an illegal proposal on unchanged state repeats → the runaway
  misclassification is the steady-state outcome.
- **Refuter corrections (folded — framing fixed, claim held):**
  1. **Not "invisible"/"silent":** tests/_setup installs no console stub, so
     the engine's `console.warn` prints to the node process's real stderr —
     a real occurrence floods the raw output with ~2000 "Illegal action
     rejected:" lines. **The gap is that the harness's structured result
     record and summary classification never capture it**, mislabeling the
     game "runaway."
  2. **Softened framing:** the harness's own header advertises
     crashes/invariant-violations/stuck/runaway — illegal-action detection is
     a *free, missing* failure class, not a broken advertised one. (Which is
     precisely why the gap matters: this is the exact bug class — AI/legality
     skew — the harness exists to be near.)
  3. **Bonus distortion the finder missed:** the actionTypes tallies
     (`:368–369`) count rejected actions as taken, so an illegal-action loop
     also corrupts the action-mix/balance statistics in playtest mode.
- **Fix sketch (stands as filed):** read the boolean; on false, record
  `{illegalAction: {actor, action}}` and end the game as a distinct failure
  class — every selfplay run becomes an illegal-action detector for free.
  (And only tally actionTypes on success.)
- **Effort:** small (read the boolean, record a distinct illegalAction failure
  class).
- **Verification status:** refuter verdict **modified** (every quoted site
  verified at the anchor; "silent" corrected to "unstructured"; purpose
  framing softened; stats distortion added). Confidence high. Not a duplicate
  — A1-5 is the engine-side missing-default-arm issue, a different hole.
- **Remediation class: SHIP** (test-infrastructure diagnostics,
  behavior-neutral for the game itself — the standing campaign rule; gate:
  suite + lint green).
- **Predicted test impact:** the harness gains a failure class; no existing
  expectation changes (no current run trips it).
- **Mutation-map judgment (ship gate):** harness-only change; no engine
  behavioral surface.

---

## A7-6 — Notes on the respond/priority arm (NOT a finding; needs-reverify-post-Stackable)

Structural observations on `AI.decide`'s instant-response/priority arm,
recorded during the deep-read. **No bug filed.** The Stackable infrastructure
was being built concurrently with this chunk and lands directly on this arm —
any conclusions drawn against the `3adb44c` snapshot would be stale on
arrival. Flag: **needs-reverify-post-Stackable** — re-walk the respond arm
(and re-check A7-1's activateAbility-routing fix against it) once Stackable
merges. Deliberately notes-not-findings.

The notes:

1. **decideReaction's counter-target match relies on OBJECT IDENTITY** —
   `a.targets[0].stackItem === top`, strict reference equality. This holds
   only because enumeration and decide both read the live `G.stack`; any
   future snapshot-based decider would silently never counter.
2. **shouldCounter skips `top.kind === 'trigger' || !top.card`** at the
   anchor. **Post-#128 live re-walk (workshop @ `b71c64c`):** the skip is now
   explicitly trigger+ability (`ai.js:663-668`, citing §1004.6), and the
   object-identity coupling from note (1) **survives unchanged** — both notes
   verified accurate post-Stackable.
3. **`Math.random() < 0.5`** for draw/discard counter decisions is the AI's
   only nondeterminism — fine for play, relevant for repro harnesses.

**Verified post-Stackable 2026-06-12; no finding filed.**

---

## Lockstep checklist (sim ↔ engine sync — gold negative space)

The deep-read walked the combat simulator against the engine on the tracked
divergence axes. All 8 items verified **in sync at the anchor**:

| # | Axis | Status |
|---|------|--------|
| #122 | First-strike ordering | In sync. |
| #114 | Deathtouch lethality | In sync. Residual note: the sim's `isDead` grants indestructibles blanket immunity — unreachable inside the sim (damage-only context), recorded, not filed. |
| #120 | One mana solver | In sync **by construction** — the sim shares solveManaPayment/manaAbilityOf, so it inherits A7-1's blindness identically: they cannot disagree. |
| #123 | Lord buffs | Clean — the sim reads live keywords + getStats rather than re-deriving. |
| #126 | Zone events | N/A-clean (the sim doesn't model them; nothing reads them). |
| #127 | Batch wraths | Clean — no per-target sequencing assumptions. |
| A2-2 | lethalNeeded/trample carryover (PR #112) | In sync — explicit `// A2-2 (engine lockstep)` marker at sim ai.js:791. |
| PR #118 | Sac-for-mana enumeration lead | Confirmed → filed as **A7-1**. |

## Drift-twin inventory

Duplicated-logic pairs (the drift mechanism this chunk polices), per the
deep-read:

- **simulateCombat's first-strike pass ↔ engine two-pass combat damage** — in
  sync (#122 above).
- **simulateCombat's `isDead` lethality ↔ engine death SBAs** — in sync
  (#114), with the unreachable indestructible residual noted.
- **The mana solver as used by the sim ↔ engine castability** — a twin that
  *cannot* drift: shared code (#120).
- **Attack/block eligibility — no twin:** the AI calls the engine's own
  eligibility logic directly; there is no duplicated copy to drift.

## State-mutation notes

ai.js performs **two transient mutations of the live `G`** during evaluation,
both restored in `finally`. Recorded caveat: **scoreFlashAmbush** has a
duplicate-iid window — while the temporary card is on the battlefield, two
objects share an iid; anything that re-enters the engine during that window
(none does today) would see the alias. Noted as a watch item, not filed.

## Coverage (deep-read)

- `ai.js`: **2052/2052 lines (wc -l), end-to-end** — the whole file.
- `engine.js`: the AI-adjacent regions (legal-action enumeration, the
  isLegalAction arms, doTapLandForMana, solveManaPayment/manaAbilityOf,
  pickBestTriggerTarget/tsAutoPick, abilityValue, effectCoverageReport).
- `controller.js`: the AI driver / executeAction call sites.
- `draft.js`: the AI-facing regions.
- `run.js`: **grepped only — zero AI call sites** (confirmed; not read).
- `tests/selfplay_harness.js`: read for A7-5.

## Test quality

- **The combat brain has ZERO direct tests**: `simulateCombat`,
  `findBestBlocks`, `decideAttackers`/`decideBlockers`,
  `scoreCombatOutcome` — none exercised by any test file. This is the
  chunk's largest dark mass. **Recommendation:** a sim-vs-engine
  *differential* test — run the same combat through simulateCombat and
  through the real engine and assert the outcomes agree; it fences the whole
  lockstep checklist at once.
- The selfplay harness — the de-facto integration exerciser of the AI —
  cannot classify an AI illegal action (**A7-5**); fixing it makes every
  selfplay run an illegal-action detector for free.

## Verified clean (negative space — checked, no finding)

The deep-read's negative-space pass checked **eight** additional areas clean
(no finding filed), headlined by the 8-row lockstep table above — the sim and
the engine agree on every tracked divergence axis at the anchor, including the
two (#120, PR #118) that route through A7-1's shared blindness.

## Cross-references

- **PR #118** — its sac-for-mana lead is discharged by **A7-1** (confirmed,
  widened).
- **A1-5 (chunk 1)** — engine-side missing-default-arm; distinct from
  **A7-5**'s harness-side hole (refuter-diffed).
- **A3-1 / A3-10 (chunk 3)** — trigger-target legality/validation; distinct
  from **A7-3**'s pick *quality* (refuter-diffed).
- **A4-18 (chunk 4)** — its AI-coverage park is a coverage-darkness item,
  distinct from **A7-2**'s guard blind spot; the combat-brain zero-test note
  above is this chunk's contribution to that same darkness map.
- **Stackable build (concurrent)** — A7-1's activateAbility-routing fix leg
  and the A7-6 respond-arm notes both carry needs-reverify-post-Stackable.

## Triage table (for INDEX.md)

| ID | Severity | Dimension | Location | Title | Class | Status |
|----|----------|-----------|----------|-------|-------|--------|
| [A7-1](chunk-07-ai.md) | P2 | ai | engine.js | Extra-cost mana abilities triple-bypassed: cost-blind tapLandForMana surfacing, cost-skipping execution, solver counts them free — refuter-widened (tapless ones also surfaced AND wrongly tapped; activateAbility fast-path :6838 needs the same gate); latent, zero pool producers; fix leg rides post-Stackable | stage | open |
| [A7-2](chunk-07-ai.md) | P3 | ai | ai.js / engine.js | effectCoverageReport can't verify the cast-path scorer has a branch: add_counter VALUED-claimed but UNTARGETED non-permanent casts score 0 (targeted casts/triggers/permanents are fine — refuter-narrowed); naive non-zero hardening false-positives on 'sacrifice' | stage | open |
| [A7-3](chunk-07-ai.md) | P3 | ai | engine.js | pickBestTriggerTarget grave-return branch keys on retired `returnFromGraveyard` — migrated move_card shape falls to `valid[0]` (oldest card, value-blind); live for grave_digger / morticians_assistant / spirit_shepherd; fix must derive the yard from filter/controller tag; hymnwright pickBestActivation lead WITHDRAWN (path is value-aware, self-QA) | stage | open |
| [A7-4](chunk-07-ai.md) | P4 | ai | ai.js | Comment-vs-code mismatch, honestly unreachable (pool-scanned) — comment fix only, or fold into a trivia batch | ship | open |
| [A7-5](chunk-07-ai.md) | P3 | ai | tests/selfplay_harness.js | Harness never reads executeAction's boolean: AI illegal actions are loud on stderr but never classified — mislabeled "runaway" at the action cap, and rejected actions pollute the action-mix stats; free missing failure class, trivial fix | ship | open |
| [A7-6](chunk-07-ai.md) | — | ai | ai.js | Notes, not a finding: respond/priority-arm structural observations (object-identity counter coupling, kind-skip shape, the one Math.random) | notes | verified post-Stackable 2026-06-12 — no finding filed |
