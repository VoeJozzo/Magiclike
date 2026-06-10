# Chunk 6 — Stickers pipeline (`stickers.js`)

> **DRY RUN** of the `/audit-next-chunk` pipeline (supervised, 2026-06-10).
> Tier 1. Anchor SHA **`86dc5b0`** (workshop tip; `origin/dev` 37c2eb2 already
> an ancestor — claim-time merge was a no-op).
> Canon set: `docs/wiki/sticker-system.md`, `docs/wiki/rules/1300-stickers.md`,
> `docs/PROTOCOL.md`, and the three sticker test files' stated expectations.
> Method: one full-context deep-read finder + one fresh-context adversarial
> refuter per falsifiable finding (S1, S2, S4, S6). S3/S5 are P3 cleanliness
> filed on their reproducing reasoning snippets (plan allows snippet-in-lieu).

## Mutation-map note (governs ship gate this chunk)

The first full mutation run was still in flight at claim time (4080/7592 @
07:09) and `MUTATION-MAP.md` covered **only `types.js`** — `stickers.js` is
absent from the map. Therefore **no behavioral stickers fix can establish
"real coverage" from the map**, and every behavioral finding here demotes to
**stage** by default, per the autonomy ladder. The single ship-class item
below (A6-4) is **docs-only / comment-only with zero behavior change**, so the
mutation map is not an input to its ship decision — its safety is "the full
suite + lint stay green, proving no accidental breakage," which is the correct
gate for a comment-only change.

---

## Findings

### A6-1 — Random-reward eligibility comment understates the kind pool
- **Location:** `reference/html-proto/js/stickers.js:159-169` @ `86dc5b0`
- **Dimension:** 2 (structural footgun / comment hygiene)
- **Severity:** P2 (latent footgun — silent scope drift between comment and filter)
- **Evidence:** `applyRandomStickersToSide`'s filter excludes only
  `scarified`/`subtype`/`empower` and `weight===0`:
  ```js
  const eligibleStickerIds = Object.keys(STICKERS).filter(id => {
    if (id === 'scarified' || id === 'subtype' || id === 'empower') return false;
    const s = STICKERS[id];
    if (!s) return false;
    if (s.weight === 0) return false;
    return true;
  });
  ```
  There is **no kind-level restriction** here or downstream
  (`applyOneStickerToRuntimeCard` applies whatever id is picked). The surviving
  pool therefore also admits **`add_type`** (the five `land_color_*`, weight 10
  each), **`cost_mod`** (`cost_minus_1`, weight 1), and **`remove_keyword`**
  (`lose_defender`, weight 10) — gated only by each sticker's own `appliesTo`,
  which constrains *placement*, not the *kind set*. The inline comment
  (lines 159-162) says the filter "Yields a mix of statBoost and keyword
  stickers from the normal reward pool" — it already anticipates `lose_defender`
  explicitly, but it omits `add_type` and `cost_mod`, so it understates the pool.
- **Fix sketch:** two valid repairs, depending on intent — (a) if the broad pool
  is intended, correct the comment to enumerate the real kinds; (b) if a narrow
  pool was intended, add an allow-list of kinds (`stat_boost`/`keyword`/
  `remove_keyword`) to the filter. **Do not do both.**
- **Effort:** XS (either side).
- **Verification status:** survived adversarial refutation — refuter confirmed
  no later mechanism collapses the pool to statBoost+keyword; corrected the
  finder's paraphrase of the comment (real text mentions `lose_defender`).
- **Remediation class:** **stage** — canon is **silent** on which kinds an
  Archdemon-style random reward should draw from (`1300-stickers.md` §1301-1305
  enumerates sticker *types* but never the reward pool; `sticker-system.md`
  defers pool/weight detail; `test_bargain_chooser_and_empower.js:121-123`
  deliberately asserts a *count*, not which kinds land — so no test pins it).
  "Fix the comment" vs "tighten the filter" is a genuine design fork → Joe.
- **Predicted test impact:** option (a) none; option (b) could change the
  nondeterministic placed-count in `test_bargain_chooser_and_empower.js` but
  that test asserts a tolerant count, so likely still green — flagged so a
  staged patch declares it.

#### Decision packet for A6-1 (stage — plain English)
The "bargain" reward (Archdemon and friends) randomly slaps a sticker on a
permanent — sometimes the opponent's, as an intended downside. **What kinds of
stickers can it pick?** The code currently allows a fairly broad set: the
+1/+1 and keyword stickers (as the comment says), but *also* land-color
stickers, a −1-cost sticker, and the "lose defender" sticker. The code comment
describes a narrower set than the code actually allows. Two ways to reconcile:
- **Option A (recommended, confidence: medium):** keep the broad behavior and
  fix the comment. A "bargain" that can hand out odd off-archetype stickers is
  thematically on-point, and nothing in the rules or tests says otherwise.
- **Option B:** restrict the reward to +1/+1 + keyword + lose-defender only,
  matching the comment, if the broad pool feels like an accident.
This is a taste/design call about how chaotic the bargain should feel — your
call, not a clear bug.

---

### A6-2 — Empower fallback roll is non-persistent; re-rolls on the staple path
- **Location:** `reference/html-proto/js/stickers.js:111-122` @ `86dc5b0`
  (supporting: `run.js:1028-1030`, `run.js:1158-1161`)
- **Dimension:** 1 (rules correctness)
- **Severity:** P3 (corner case — narrow trigger)
- **Evidence:** in `applyStickersToCard`, the empower branch reads
  `card.empowerRolls[empowerCursor]`; when falsy it computes a **fresh**
  `rollEmpowerTarget(tpl)` (random — `cards.js:296`), uses it, and **never
  writes it back**; the cursor increments unconditionally:
  ```js
  let roll = (card.empowerRolls || [])[empowerCursor];   // 112
  if (!roll) {                                            // 113  (null/undefined)
    const tpl = card.stapledFrom
      ? ENGINE.synthesizeStapledTemplate(...)             // 116
      : CARDS[card.tplId];                                // 118
    roll = tpl ? rollEmpowerTarget(tpl) : null;           // 119  fresh, not stored
  }
  empowerCursor++;                                        // 121
  if (roll) applyEmpowerRoll(card, roll, s.amount || 1);  // 122
  ```
  `null` is a real stored sentinel (a card with no empowerable field at push
  time — `pushStickerWithRoll` stickers.js:330-332, `run.js:366`). On the
  **bare-base** path the re-roll is inert (the same empty-target template keeps
  returning `null`). But on the **staple** path a `null` recorded against the
  base slot survives the merge verbatim (`run.js:1158-1161` carries
  `baseSlot.empowerRolls` without re-deriving), and the fallback then rolls
  against the *synthesized stapled* template — which **does** have empowerable
  fields → a genuine random target, used and discarded, **re-rolled differently
  on every `makeCard`**. That violates "rolls resolve at application time and
  are stored" (`docs/wiki/sticker-system.md:19`).
- **Bonus (separate latent):** the clone path `run.js:1029`
  `orig.empowerRolls.map(r => ({...r}))` spreads a `null` into `{}` (truthy),
  which *suppresses* the re-roll on that path but feeds a degenerate empty roll
  into `applyEmpowerRoll`. Worth fixing alongside.
- **Fix sketch:** persist the fallback (`card.empowerRolls[empowerCursor] = roll`
  before the increment) and distinguish "no roll recorded yet" from an explicit
  stored `null`; fix the `{...null}` laundering at `run.js:1029`.
- **Effort:** S.
- **Verification status:** survived adversarial refutation (PARTIAL → core
  CONFIRMED; refuter located the true staple trigger the finder under-specified
  and surfaced the `run.js:1029` bonus).
- **Remediation class:** **stage** — whether a stuck-`null` empower should
  "wake up" and bind a target after stapling (and freeze it) is a roguelike-meta
  design question the rulebook does not answer; the fix changes run-reward
  behavior.
- **Predicted test impact:** none currently — no test exercises a stapled empower
  over a null base roll (that absence is itself the A6-4 coverage theme). A staged
  fix should land a red→green repro for the staple path.

---

### A6-3 — Inline `set_color`/`set_types` descriptors accumulate duplicate persisted entries
- **Location:** `reference/html-proto/js/stickers.js:147-149` @ `86dc5b0`
  (mirror: `run.js:1246-1249`)
- **Dimension:** 2 (structural footgun) / comment hygiene
- **Severity:** P3 (cleanliness — unbounded list growth, no game-state effect)
- **Evidence:**
  ```js
  const isInline = typeof sticker === 'object';
  if (!s.stackable && !isInline && card.stickers.includes(sticker)) return;
  card.stickers.push(sticker);
  ```
  Inline descriptors bypass the dedup guard, so repeated application of an
  idempotent set-semantics sticker (`set_color`, `set_types`) appends a fresh
  identical descriptor every time. The *effect* is idempotent (re-bleaching an
  already-0 cost is a no-op), but `card.stickers[]` grows without bound. The
  `run.js:1244` comment "set_color is idempotent" is true of the effect and
  misleading about the persisted storage.
- **Fix sketch:** for inline set-semantics kinds, dedup on `(kind,color)` /
  `(kind,types)` before pushing; or accept growth and amend the comment.
- **Effort:** XS.
- **Verification status:** reproduced by reasoning snippet (P3 cleanliness;
  not independently refuted — filed on snippet per plan).
- **Remediation class:** **park** — refactor-flavored, no behavioral payoff.
- **Predicted test impact:** none.

---

### A6-4 — Dispatch-test header over-claims kind coverage  ⟶ **SHIPPED (docs-only)**
- **Location:** `reference/html-proto/tests/sticker_kinds_dispatch_test.js:1-3`
  @ `86dc5b0`
- **Dimension:** 2 (comment hygiene)
- **Severity:** P3 (cleanliness — inaccurate header misleads future readers and
  the ship gate's intent reads)
- **Evidence:** header claims **"each STICKERS kind"** then enumerates only
  `statBoost, keyword, innate, landColor, costReduction, empower, subtype`.
  This is a falsifiable completeness claim and it is inaccurate in **both**
  directions: (1) the test body *also* exercises `remove_keyword` (lose_defender)
  and inline `cost_mod`/`set_color`, which the enumeration omits; (2) "each
  STICKERS kind" over-claims. Ground truth = the test's own contents.
- **Fix sketch:** correct the header to an accurate enumeration (comment-only).
- **Effort:** XS.
- **Verification status:** survived adversarial refutation — refuter quoted the
  verbatim header, confirmed the inaccuracy, and verified the body's true
  coverage; confirmed a comment-only correction is behavior-preserving with the
  test's contents as ground truth.
- **Remediation class:** **ship** (docs-only / comment-only). **Shipped this
  session — PR #97 into `audit/integration`, robot-merged by Thaumaturge-Claude
  (merge commit `ed3ee53`).**
- **Mutation-map judgment (written, per ship gate):** the map does not cover
  this test file (or `stickers.js`) yet, but **this fix changes no behavior** —
  it edits a comment only. There is no execution path to mutate or to leave
  uncovered, so "real coverage of the touched region" is **not applicable**; the
  applicable safety gate is "full suite + lint remain green," which was verified
  (see PR). Shipping is safe because a comment edit cannot alter any test
  assertion or engine behavior.
- **Predicted test impact:** **none** — comment-only; full suite expected to stay
  green with zero flips. (A surprise red here would be inexplicable and would
  trigger the judge path; none occurred.)

#### A6-4 sub-note (NOT filed as a finding — refuted)
The finder's companion claim that `set_types` / `grant_activated_ability` /
`grant_mana_ability` are "untested kinds" was **refuted**: all three are
exercised elsewhere — `grant_mana_ability` in `test_mana.js:138-146`, and both
`set_types` and `grant_activated_ability` in
`test_equatorial_artificer_boss.js:90-98`, the latter two routing through
`applyStickerKindEffect` itself. They are correctly absent from the three
sticker-specific files (they are inline/effect-only, not STICKERS-registry
kinds). No coverage-gap finding warranted there.

---

### A6-5 — `grant_activated_ability` dedup branch (absent `ability_id`) is untested
- **Location:** `reference/html-proto/js/stickers.js:75-80` @ `86dc5b0`
- **Dimension:** 5 (test-coverage gap)
- **Severity:** P3
- **Evidence:** the re-push guard is `if (s.ability_id && card.abilities.some(ab
  => ab && ab._sticker_ability_id === s.ability_id)) return;` When `ability_id`
  is absent, `_sticker_ability_id` is set to `null` and the guard can never
  match, so a recast re-pushes the ability. The only `grant_activated_ability`
  test (`test_equatorial_artificer_boss.js`) always sets `ability_id` and asserts
  existence via `.some()`, never ability **count** after a double-apply — so the
  duplicate-on-recast branch has no coverage.
- **Fix sketch:** add a dispatch test that double-applies an inline
  `grant_activated_ability` with no `ability_id` and asserts the resulting
  `abilities` count (expected behavior TBD — see class).
- **Effort:** XS (test only).
- **Verification status:** survived adversarial refutation (refuter confirmed no
  count assertion exists anywhere).
- **Remediation class:** **park** — adding a test is always allowed, but the
  *expected* count (should an `ability_id`-less grant dedup or stack?) is itself
  undecided by canon; pair it with a decision when A6-6 is addressed.
- **Predicted test impact:** none (new test only).

---

### A6-6 — `applyStickerKindEffect` violates the file's own deep-copy discipline (latent)
- **Location:** `reference/html-proto/js/stickers.js:76-81` vs `:347-362` @ `86dc5b0`
- **Dimension:** 2 (structural footgun)
- **Severity:** P3 (purely latent today)
- **Evidence:** `resolveSticker` (lines 20-24) returns the **shared registry
  singleton** `STICKERS[id]` for string ids. The `grant_activated_ability` push
  copies effects only one level (`effects.map(e => ({...e}))`, line 79), so a
  nested array/object inside an effect (e.g. `types: ["Creature"]`, or a nested
  `cost.mana`) would be shared by reference across every card built from a shared
  sticker. This contradicts the file's own stated discipline at line 347
  ("Effects/triggers/abilities deep-copied — shared refs have bitten before"),
  which copies modal `modes` two levels deep. **Latent only:** confirmed there is
  **no registry `grant_activated_ability` sticker** today (the sole one is the
  inline descriptor on Artifice Triumphant, a fresh per-call object), so `s` is
  never the shared singleton and the alias cannot occur yet.
- **Fix sketch:** deep-copy the granted ability (`structuredClone(s.ability)` or
  mirror the line-347 depth) when pushing.
- **Effort:** XS.
- **Verification status:** survived adversarial refutation — refuter confirmed
  the 1-level copy, the contrasting discipline, and the inline-only concession.
- **Remediation class:** **park** — a defensive consistency fix with no
  observable defect until someone adds a registry `grant_activated_ability`
  sticker; cheap to do then.
- **Predicted test impact:** none.

---

### A6-7 — Multi-sticker cost resolution is apply-order dependent
- **Location:** `reference/html-proto/js/stickers.js:45-63` (applied in
  `card.stickers` iteration order, 105-137) @ `86dc5b0`
- **Dimension:** 1 (rules correctness)
- **Severity:** P3 (rare — needs both a `cost_mod` and a bleach on one slot)
- **Evidence:** `cost_mod` floors generic at 0 (`Math.max(0, (card.cost.C||0)+
  amount)`, line 48) *before* a later `set_color` can fold colored pips into
  generic (lines 59-62). Since both mutate `cost.C` in list order, the final
  castable cost depends on which sticker was applied first (e.g. `cost_minus_1`
  then bleach vs bleach then `cost_minus_1` differ by 1 generic).
- **Fix sketch:** resolve color-fold before the cost_mod floor in a fixed pass,
  if order-independence is wanted; else document apply = acquisition order.
- **Effort:** S.
- **Verification status:** reproduced by reasoning snippet (P3, low confidence;
  filed on snippet per plan — canon silent on multi-sticker cost order).
- **Remediation class:** **park** (likely WONTFIX given rarity).
- **Predicted test impact:** none.

---

## Coverage

- **`stickers.js`:** lines **1-425 (full file)** read by the finder; lines
  20-24, 45-63, 76-81, 105-137, 142-151, 157-198, 326-362 independently
  re-read by refuters.
- **Other files read:** `tests/sticker_kinds_dispatch_test.js`,
  `tests/stickersfor_consolidation_test.js`, `tests/three_stickers_subtype_test.js`
  (all full); `tests/test_mana.js` (138-146), `tests/test_equatorial_artificer_boss.js`
  (90-98), `tests/test_bargain_chooser_and_empower.js` (121-123);
  `js/cards.js` STICKERS registry + EMPOWER targets (153-451, 255-297);
  `js/run.js` (340-371, 808-812, 976-978, 1028-1030, 1158-1161, 1240-1269);
  `js/engine.js` (makeCard→applyStickersToCard wiring, ~778-789, apply_sticker
  call sites ~2130-2210); `docs/wiki/sticker-system.md` (full),
  `docs/wiki/rules/1300-stickers.md` (§1301-1305); plus greps of all `js/`
  callers of the stickers exports.
- **NOT read / not covered:** the full `engine.js makeCard` body (only the
  `applyStickersToCard` wiring confirmed); the full `PROTOCOL.md` §3.2/§3.8 prose
  (consulted via grep, not read whole); `card-text.js`/`render.js` badge-render
  internals (kept/dropped kinds confirmed via the dispatch test, not deep-read).
  Confidence on A6-7's exact cost ordering is reduced by not tracing the
  reward-apply order end-to-end.
- **Overall confidence:** med-high. The file is self-contained; the three sticker
  tests + registry pin most behavior. A6-1 and A6-4 are high-confidence;
  A6-2/A6-6 are real but latent/corner; A6-3/A6-5/A6-7 are P3.
- **Dedupe:** no overlap with `reference/html-proto/BACKLOG.md` (only a general
  Scarification-tests note, ~L29) or `docs/DIVERGENCE.md` (mentions
  `apply_sticker` only in passing, ~L85). No prior chunk findings exist.
</content>
</invoke>
